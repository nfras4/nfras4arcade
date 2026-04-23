import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { Card } from '../cards/types';
import { createDeck, shuffle } from '../cards/deck';
import { CosmeticsCache } from '../shared/cosmetics';

// --- Constants ---

const MAX_MESSAGE_SIZE = 2048;
const MAX_NAME_LENGTH = 20;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;
const RECONNECT_TIMEOUT_MS = 45 * 1000;
const SNAP_COOLDOWN_MS = 1000;
const FALSE_SNAP_PENALTY = 3;

// --- Types ---

type SnapPhase = 'lobby' | 'playing' | 'game_over';
type DeviceRole = 'center' | 'player';

interface SnapPlayerData {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isGuest: boolean;
  deck: Card[];
  wonCards: number;
  frameSvg?: string | null;
  emblemSvg?: string | null;
  nameColour?: string | null;
  titleBadgeId?: string | null;
}

interface SnapRoomState {
  code: string;
  phase: SnapPhase;
  players: [string, SnapPlayerData][];
  hostId: string;
  centerPadSocketId: string | null;
  pile: Card[];
  snapActive: boolean;
  lastPlayedBy: string | null;
  turnOrder: string[];
  currentDrawIndex: number;
  gameSessionId: string | null;
  lastActivity: number;
  snapCooldown: boolean;
  consecutiveSnaps: [string, number][];
  spectators?: [string, string][];
}

// Server -> Client message types
type ServerMessage =
  | { type: 'joined'; playerId: string; state: Record<string, unknown>; isSpectator?: boolean }
  | { type: 'state_update'; state: Record<string, unknown>; isSpectator?: boolean }
  | { type: 'card_played'; playerId: string; card: Card; pileSize: number }
  | { type: 'snap_result'; winnerId: string; winnerName: string; pileSize: number; wasValid: boolean }
  | { type: 'player_eliminated'; playerId: string; playerName: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

// Client -> Server message types
interface ClientMessage {
  type: string;
  [key: string]: unknown;
}

// --- Helpers ---

function sanitizeText(text: string, maxLength: number): string {
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}

// --- Durable Object ---

export class SnapRoom extends DurableObject<Env> {
  // State
  private initialized = false;
  private code = '';
  private phase: SnapPhase = 'lobby';
  private players = new Map<string, SnapPlayerData>();
  private hostId = '';

  // Center pad
  private centerPadSocketId: string | null = null;

  // Game state
  private pile: Card[] = [];
  private snapActive = false;
  private lastPlayedBy: string | null = null;
  private turnOrder: string[] = [];
  private currentDrawIndex = 0;
  private gameSessionId: string | null = null;
  private lastActivity = Date.now();
  private snapCooldown = false;
  private consecutiveSnaps = new Map<string, number>();

  // Rate limiting (in-memory only, resets on hibernation)
  private rateLimits = new Map<string, number[]>();

  // Spectators (joined mid-game)
  private spectators = new Map<string, string>();

  // Disconnect tracking
  private disconnectTimestamps = new Map<string, number>();

  // Per-DO cosmetics cache
  private cosmeticsCache = new CosmeticsCache();

  // --- State persistence ---

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<SnapRoomState>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.players = new Map(stored.players);
      this.hostId = stored.hostId;
      this.centerPadSocketId = stored.centerPadSocketId;
      this.pile = stored.pile;
      this.snapActive = stored.snapActive;
      this.lastPlayedBy = stored.lastPlayedBy;
      this.turnOrder = stored.turnOrder;
      this.currentDrawIndex = stored.currentDrawIndex;
      this.gameSessionId = stored.gameSessionId;
      this.lastActivity = stored.lastActivity;
      this.snapCooldown = stored.snapCooldown;
      this.consecutiveSnaps = new Map(stored.consecutiveSnaps);
      this.spectators = new Map(stored.spectators ?? []);

      // Reconcile connected status with actual live WebSocket connections
      const livePlayerIds = new Set<string>();
      for (const ws of this.ctx.getWebSockets()) {
        const tags = this.ctx.getTags(ws);
        if (tags[0]) livePlayerIds.add(tags[0]);
      }
      for (const [id, player] of this.players) {
        player.connected = livePlayerIds.has(id);
      }
    }
  }

  private async saveState(): Promise<void> {
    const state: SnapRoomState = {
      code: this.code,
      phase: this.phase,
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      centerPadSocketId: this.centerPadSocketId,
      pile: this.pile,
      snapActive: this.snapActive,
      lastPlayedBy: this.lastPlayedBy,
      turnOrder: this.turnOrder,
      currentDrawIndex: this.currentDrawIndex,
      gameSessionId: this.gameSessionId,
      lastActivity: this.lastActivity,
      snapCooldown: this.snapCooldown,
      consecutiveSnaps: Array.from(this.consecutiveSnaps.entries()),
      spectators: Array.from(this.spectators.entries()),
    };
    try {
      await this.ctx.storage.put('room', state);
    } catch {
      // Don't block game on storage failure
    }
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }

  // --- WebSocket upgrade / HTTP ---

  async fetch(request: Request): Promise<Response> {
    await this.loadState();

    const url = new URL(request.url);
    const roomCode = url.searchParams.get('room')?.toUpperCase() || '';

    // Initialize code if this is a new room
    if (!this.code) {
      this.code = roomCode;
    }

    // Non-WebSocket: return room info
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({
        code: this.code,
        phase: this.phase,
        playerCount: this.players.size,
      });
    }

    // WebSocket upgrade
    const userId = request.headers.get('X-User-Id');
    const displayName = request.headers.get('X-Display-Name');
    const isGuest = request.headers.get('X-Is-Guest') === 'true';
    const role = url.searchParams.get('role') as DeviceRole | null;

    if (!userId || !displayName) {
      return new Response('Missing user info', { status: 400 });
    }

    // Store display name and guest status for use during join
    try {
      await this.ctx.storage.put(`name:${userId}`, displayName);
      await this.ctx.storage.put(`guest:${userId}`, isGuest);

      // Store requested role for use during join
      if (role === 'center') {
        await this.ctx.storage.put(`role:${userId}`, 'center');
      } else {
        await this.ctx.storage.put(`role:${userId}`, 'player');
      }
    } catch {
      // Don't block WebSocket upgrade on storage failure
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.ctx.acceptWebSocket(server, [userId]);

    this.touch();
    await this.setExpireAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  // --- Hibernation API handlers ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.loadState();

    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    // Rate limiting
    if (this.isRateLimited(playerId)) {
      this.sendToWs(ws, { type: 'error', message: 'Too many messages, slow down' });
      return;
    }

    // Message size cap
    if (raw.length > MAX_MESSAGE_SIZE) {
      this.sendToWs(ws, { type: 'error', message: 'Message too large' });
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.sendToWs(ws, { type: 'error', message: 'Invalid message' });
      return;
    }

    if (msg.type === 'ping') {
      this.sendToWs(ws, { type: 'pong' });
      return;
    }

    if (msg.type === 'join') {
      await this.handleJoin(ws, playerId, msg.role as DeviceRole | undefined);
      return;
    }

    // Snap can come from center pad (not a player) or a player
    if (msg.type === 'snap') {
      // Center pad snap: find who tapped (center pad acts on behalf of... itself, but we need a player)
      // Center pad snaps are attributed to the center pad socket, which is not a player.
      // Per design: center pad is a tap target, so we need to know who's closest.
      // Simplification: center pad snap is invalid unless there's a snapActive - if valid, first tap wins.
      // The center pad snap needs a playerId associated. Since center has no player,
      // we'll require the snap message from center to include a playerId claim.
      // Actually per spec: "players race to tap SNAP on either the center pad or their own phone"
      // The center pad doesn't know which player tapped it. So center pad snap = generic first-claimer.
      // We'll let anyone (including center pad connections) send snap, and if they're a player, process it.
      if (this.players.has(playerId)) {
        this.touch();
        await this.handleSnap(playerId);
        await this.saveState();
      }
      return;
    }

    // All other messages require being a player in the room
    if (!this.players.has(playerId)) {
      if (this.spectators.has(playerId)) {
        // Spectators can only ping, not take actions
        return;
      }
      this.sendToWs(ws, { type: 'error', message: 'Not in a room' });
      return;
    }

    this.touch();
    await this.handleGameMessage(playerId, msg);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    // Check if this was the center pad
    if (playerId === this.centerPadSocketId) {
      this.centerPadSocketId = null;
    }

    this.handleDisconnect(playerId);
    await this.saveState();
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    if (playerId === this.centerPadSocketId) {
      this.centerPadSocketId = null;
    }

    this.handleDisconnect(playerId);
    await this.saveState();
  }

  async alarm(): Promise<void> {
    await this.loadState();
    const now = Date.now();

    // Handle snap cooldown clear
    if (this.snapCooldown) {
      this.snapCooldown = false;
      await this.saveState();
      // Don't return - also check other alarm conditions
    }

    // Check reconnect timeouts
    if (this.disconnectTimestamps.size > 0) {
      let changed = false;
      for (const [pid, timestamp] of this.disconnectTimestamps) {
        if (now - timestamp >= RECONNECT_TIMEOUT_MS) {
          const player = this.players.get(pid);
          if (player && !player.connected) {
            this.disconnectTimestamps.delete(pid);
            changed = true;
            // Host promotion if host disconnected
            if (pid === this.hostId) {
              this.promoteNewHost(pid);
            }
          }
        }
      }
      if (changed) {
        if (this.phase === 'playing') {
          // Remove timed-out disconnected players from turn order
          for (const [pid] of [...this.players]) {
            const p = this.players.get(pid);
            if (p && !p.connected && !this.disconnectTimestamps.has(pid)) {
              // Player timed out (was removed from disconnectTimestamps above)
              if (this.turnOrder.includes(pid)) {
                this.removeFromTurnOrder(pid);
                this.broadcast({
                  type: 'player_eliminated',
                  playerId: pid,
                  playerName: p.name,
                } as ServerMessage);
              }
            }
          }
          // If the current turn player is disconnected, advance past them
          if (this.turnOrder.length > 0) {
            const currentId = this.turnOrder[this.currentDrawIndex];
            const currentPlayer = currentId ? this.players.get(currentId) : null;
            if (currentPlayer && !currentPlayer.connected) {
              this.advanceDrawIndex();
            }
          }
          this.checkWinCondition();
        }
        this.broadcastState();
        await this.saveState();
      }
      if (this.disconnectTimestamps.size > 0) {
        await this.scheduleReconnectCheck();
        return;
      }
    }

    // Room expiry
    if (now - this.lastActivity > ROOM_EXPIRY_MS) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          this.sendToWs(ws, { type: 'error', message: 'Room expired due to inactivity' });
          ws.close(1000, 'Room expired');
        } catch {}
      }
      await this.ctx.storage.deleteAll();
      this.initialized = false;
    } else {
      await this.setExpireAlarm();
    }
  }

  // --- Join / Disconnect ---

  private async handleJoin(ws: WebSocket, playerId: string, messageRole?: DeviceRole): Promise<void> {
    // Prefer role from the join message payload (client sends role: deviceRole),
    // fall back to storage (set during WebSocket upgrade from URL param)
    const storedRole = await this.ctx.storage.get<DeviceRole>(`role:${playerId}`);
    const role = messageRole || storedRole || 'player';

    // Handle center pad connection
    if (role === 'center') {
      if (this.centerPadSocketId && this.centerPadSocketId !== playerId) {
        // Replace existing center pad
        const oldSockets = this.ctx.getWebSockets(this.centerPadSocketId);
        for (const oldWs of oldSockets) {
          this.sendToWs(oldWs, { type: 'error', message: 'Another device took over as center pad' });
        }
      }
      this.centerPadSocketId = playerId;
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getClientState(),
      });
      await this.saveState();
      return;
    }

    // Player connection
    const existingPlayer = this.players.get(playerId);

    if (existingPlayer) {
      // Reconnection — re-resolve cosmetics in case loadout changed
      this.cosmeticsCache.invalidate(playerId);
      existingPlayer.connected = true;
      this.disconnectTimestamps.delete(playerId);
      this.resolveCosmeticsForPlayer(playerId);
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getClientState(),
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    // New player join
    if (this.phase !== 'lobby') {
      // Allow joining mid-game as spectator
      const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
      this.spectators.set(playerId, storedName || 'Spectator');
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getClientState(),
        isSpectator: true,
      });
      this.broadcastState();
      await this.saveState();
      return;
    }
    if (this.players.size >= 8) {
      this.sendToWs(ws, { type: 'error', message: 'Room is full (max 8 players)' });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const storedGuest = await this.ctx.storage.get<boolean>(`guest:${playerId}`);
    const name = sanitizeText(storedName || 'Player', MAX_NAME_LENGTH);

    const isHost = this.players.size === 0;
    const player: SnapPlayerData = {
      id: playerId,
      name,
      connected: true,
      isHost,
      isGuest: storedGuest ?? false,
      deck: [],
      wonCards: 0,
    };
    this.players.set(playerId, player);

    if (isHost) {
      this.hostId = playerId;
    }

    this.resolveCosmeticsForPlayer(playerId);

    this.sendToWs(ws, {
      type: 'joined',
      playerId,
      state: this.getClientState(),
    });
    this.broadcastState();
    await this.saveState();
  }

  private resolveCosmeticsForPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.cosmeticsCache.get(playerId, this.env.DB).then((cosmetics) => {
      const p = this.players.get(playerId);
      if (!p) return;
      p.frameSvg = cosmetics.frameSvg;
      p.emblemSvg = cosmetics.emblemSvg;
      p.nameColour = cosmetics.nameColour;
      p.titleBadgeId = cosmetics.titleBadgeId;
      this.broadcastState();
    }).catch(() => {});
  }

  private handleDisconnect(playerId: string): void {
    // Handle spectator disconnect
    if (this.spectators.has(playerId)) {
      this.spectators.delete(playerId);
      this.broadcastState();
      return;
    }

    // Center pad disconnects are handled in webSocketClose/Error
    const player = this.players.get(playerId);
    if (!player) return;

    this.cosmeticsCache.invalidate(playerId);

    if (this.phase === 'lobby') {
      // In lobby, remove immediately
      this.players.delete(playerId);
      if (playerId === this.hostId && this.players.size > 0) {
        this.promoteNewHost(playerId);
      }
    } else {
      // Mid-game: mark as disconnected with timeout
      player.connected = false;
      this.disconnectTimestamps.set(playerId, Date.now());
      this.scheduleReconnectCheck();
    }

    if (this.players.size === 0) return;
    this.broadcastState();
  }

  private promoteNewHost(oldHostId: string): void {
    for (const [id, player] of this.players) {
      if (id !== oldHostId && player.connected) {
        player.isHost = true;
        this.hostId = id;
        const oldPlayer = this.players.get(oldHostId);
        if (oldPlayer) oldPlayer.isHost = false;
        return;
      }
    }
  }

  private async scheduleReconnectCheck(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    const nextCheck = Date.now() + RECONNECT_TIMEOUT_MS;
    if (!existing || nextCheck < existing) {
      await this.ctx.storage.setAlarm(nextCheck);
    }
  }

  // --- Game message router ---

  private async handleGameMessage(playerId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'start_game': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can start the game' });
          break;
        }
        const result = await this.startGame();
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        break;
      }

      case 'draw': {
        await this.handleDraw(playerId);
        break;
      }

      case 'play_again': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'game_over') break;
        this.resetToLobby();
        this.broadcastState();
        break;
      }

      case 'end_game': {
        if (playerId !== this.hostId) break;
        this.phase = 'game_over';
        this.broadcastState();
        break;
      }

      default:
        break;
    }

    await this.saveState();
  }

  // --- Game logic ---

  private async startGame(): Promise<{ success: boolean; error?: string }> {
    const playerCount = this.players.size;
    if (playerCount < 2) {
      return { success: false, error: 'Need at least 2 players to start' };
    }

    // Shuffle a standard 52-card deck
    const deck = shuffle(createDeck());

    // Deal cards evenly to all players, remainder goes to pile
    const playerIds = Array.from(this.players.keys());
    const cardsEach = Math.floor(deck.length / playerCount);
    const remainder = deck.length % playerCount;

    for (let i = 0; i < playerIds.length; i++) {
      const player = this.players.get(playerIds[i])!;
      player.deck = deck.slice(i * cardsEach, (i + 1) * cardsEach);
      player.wonCards = 0;
    }

    // Remainder cards go to the pile
    this.pile = deck.slice(playerCount * cardsEach);

    // Set turn order to join order
    this.turnOrder = [...playerIds];
    this.currentDrawIndex = 0;

    // Reset game state
    this.snapActive = false;
    this.lastPlayedBy = null;
    this.snapCooldown = false;
    this.consecutiveSnaps = new Map();

    this.phase = 'playing';

    // Record game session in D1
    try {
      this.gameSessionId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        'INSERT INTO game_sessions (id, game_type, room_code, player_count, started_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(this.gameSessionId, 'snap', this.code, playerCount, now).run();
    } catch {
      // Don't block game on D1 failure
    }

    return { success: true };
  }

  private async handleDraw(playerId: string): Promise<void> {
    if (this.phase !== 'playing') {
      this.sendTo(playerId, { type: 'error', message: 'Game is not in progress' });
      return;
    }

    // Validate it's this player's turn
    const currentPlayerId = this.turnOrder[this.currentDrawIndex];
    if (playerId !== currentPlayerId) {
      this.sendTo(playerId, { type: 'error', message: 'Not your turn to draw' });
      return;
    }

    const player = this.players.get(playerId)!;
    if (player.deck.length === 0) {
      this.sendTo(playerId, { type: 'error', message: 'No cards left in your deck' });
      return;
    }

    // Pop top card from player's deck, push to pile
    const card = player.deck.pop()!;
    this.pile.push(card);
    this.lastPlayedBy = playerId;

    // Check if top 2 pile cards match rank
    if (this.pile.length >= 2) {
      const top = this.pile[this.pile.length - 1];
      const second = this.pile[this.pile.length - 2];
      this.snapActive = top.rank === second.rank;
    } else {
      this.snapActive = false;
    }

    // Broadcast card_played immediately for low latency
    this.broadcast({
      type: 'card_played',
      playerId,
      card,
      pileSize: this.pile.length,
    });

    // Check win condition before advancing (drawing may have emptied player's deck)
    this.checkWinCondition();

    // Advance to next non-eliminated player (only if game is still playing)
    if (this.phase === 'playing') {
      this.advanceDrawIndex();
    }

    this.broadcastState();
    await this.saveState();
  }

  private async handleSnap(playerId: string): Promise<void> {
    if (this.phase !== 'playing') return;

    // Prevent double-processing during cooldown
    if (this.snapCooldown) return;

    const player = this.players.get(playerId);
    if (!player) return;

    if (this.snapActive) {
      // VALID snap - winner gets the entire pile
      const pileSize = this.pile.length;
      player.deck = [...this.pile, ...player.deck];
      player.wonCards += pileSize;
      this.pile = [];
      this.snapActive = false;

      // Track consecutive snaps for streak badge
      const streak = (this.consecutiveSnaps.get(playerId) ?? 0) + 1;
      this.consecutiveSnaps.set(playerId, streak);
      // Reset streaks for all other players
      for (const otherId of this.players.keys()) {
        if (otherId !== playerId) {
          this.consecutiveSnaps.set(otherId, 0);
        }
      }

      // Set cooldown
      this.snapCooldown = true;
      await this.scheduleSnapCooldown();

      this.broadcast({
        type: 'snap_result',
        winnerId: playerId,
        winnerName: player.name,
        pileSize,
        wasValid: true,
      });
    } else {
      // FALSE snap - penalty: lose cards from top of deck to bottom of pile
      const penaltyCount = Math.min(FALSE_SNAP_PENALTY, player.deck.length);
      const penaltyCards = player.deck.splice(player.deck.length - penaltyCount, penaltyCount);
      this.pile = [...penaltyCards, ...this.pile];

      // Reset streak
      this.consecutiveSnaps.set(playerId, 0);

      // Set cooldown
      this.snapCooldown = true;
      await this.scheduleSnapCooldown();

      this.broadcast({
        type: 'snap_result',
        winnerId: playerId,
        winnerName: player.name,
        pileSize: penaltyCount,
        wasValid: false,
      });

      // Check if this player is now eliminated
      if (player.deck.length === 0) {
        // If eliminated player is the current turn holder, advance first
        const isCurrentTurn = this.turnOrder.length > 0 &&
          this.turnOrder[this.currentDrawIndex] === playerId;
        if (isCurrentTurn) {
          this.advanceDrawIndex();
        }
        this.broadcast({
          type: 'player_eliminated',
          playerId,
          playerName: player.name,
        });
        this.removeFromTurnOrder(playerId);
      }
    }

    this.checkWinCondition();
    this.broadcastState();
  }

  private advanceDrawIndex(): void {
    if (this.turnOrder.length === 0) return;

    // Move to next player, skipping eliminated and disconnected-timed-out players
    let attempts = 0;
    do {
      this.currentDrawIndex = (this.currentDrawIndex + 1) % this.turnOrder.length;
      attempts++;
      const nextPlayer = this.players.get(this.turnOrder[this.currentDrawIndex]);
      if (nextPlayer && nextPlayer.deck.length > 0 && nextPlayer.connected) break;
    } while (attempts < this.turnOrder.length);
  }

  private removeFromTurnOrder(playerId: string): void {
    const idx = this.turnOrder.indexOf(playerId);
    if (idx === -1) return;

    // Adjust currentDrawIndex if needed
    if (idx < this.currentDrawIndex) {
      this.currentDrawIndex--;
    } else if (idx === this.currentDrawIndex) {
      // Current player eliminated - don't advance, just remove (index now points to next)
      // But if we're at the end, wrap around
      if (this.currentDrawIndex >= this.turnOrder.length - 1) {
        this.currentDrawIndex = 0;
      }
    }

    this.turnOrder.splice(idx, 1);

    // Ensure index is valid
    if (this.turnOrder.length > 0) {
      this.currentDrawIndex = this.currentDrawIndex % this.turnOrder.length;
    }
  }

  private checkWinCondition(): void {
    if (this.phase !== 'playing') return;

    // Find players who still have cards AND are connected (or still within reconnect window)
    const activePlayers = this.turnOrder.filter(id => {
      const p = this.players.get(id);
      if (!p || p.deck.length === 0) return false;
      // Connected players are active
      if (p.connected) return true;
      // Disconnected but still within reconnect timeout window are active
      if (this.disconnectTimestamps.has(id)) return true;
      // Disconnected and timed out = not active
      return false;
    });

    if (activePlayers.length <= 1) {
      // Game over - determine winner
      const winnerId = activePlayers[0] || null;
      this.phase = 'game_over';

      // Record game end in D1
      this.recordGameEnd(winnerId);
    }
  }

  private async recordGameEnd(winnerId: string | null): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];

      if (this.gameSessionId) {
        stmts.push(
          db.prepare('UPDATE game_sessions SET ended_at = ?, winner_id = ? WHERE id = ?')
            .bind(now, winnerId, this.gameSessionId)
        );
      }

      for (const [id, player] of this.players) {
        // Skip D1 updates for guests - they have no profile
        if (player.isGuest || id.startsWith('guest_')) continue;

        stmts.push(
          db.prepare('UPDATE player_profiles SET games_played = games_played + 1, updated_at = ? WHERE id = ?')
            .bind(now, id)
        );
        if (id === winnerId) {
          stmts.push(
            db.prepare('UPDATE player_profiles SET games_won = games_won + 1, updated_at = ? WHERE id = ?')
              .bind(now, id)
          );
        }

        // XP: +50 for participating, +50 bonus for winning
        const xpGain = id === winnerId ? 100 : 50;
        stmts.push(
          db.prepare('UPDATE player_profiles SET xp = xp + ?, updated_at = ? WHERE id = ?')
            .bind(xpGain, now, id)
        );

        // Chip reward: +10 for playing, +25 bonus for winning
        const chipReward = id === winnerId ? 35 : 10;
        stmts.push(
          db.prepare('UPDATE player_profiles SET chips = chips + ?, updated_at = ? WHERE id = ?')
            .bind(chipReward, now, id)
        );
        stmts.push(
          db.prepare('UPDATE player_profiles SET biggest_win = ?, biggest_win_game = ? WHERE id = ? AND biggest_win < ?')
            .bind(chipReward, 'snap', id, chipReward)
        );

        // b_first_game badge
        stmts.push(
          db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
            .bind(id, 'b_first_game', now)
        );

        // b_champion badge on win
        if (id === winnerId) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_champion', now)
          );
        }

        // b_snap_win badge for winner
        if (id === winnerId) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_snap_win', now)
          );
        }

        // b_snap_streak badge: 3+ consecutive snaps during the game
        const streak = this.consecutiveSnaps.get(id) ?? 0;
        if (streak >= 3) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_snap_streak', now)
          );
        }
      }

      if (stmts.length > 0) {
        await db.batch(stmts);
      }

      // Night Owl badge: playing between midnight and 5am AEST (UTC+10)
      const hour = new Date(now * 1000).getUTCHours();
      const aestHour = (hour + 10) % 24;
      if (aestHour >= 0 && aestHour < 5) {
        const nightOwlStmts: D1PreparedStatement[] = [];
        for (const [id, player] of this.players) {
          if (player.isGuest || id.startsWith('guest_')) continue;
          nightOwlStmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_night_owl', now)
          );
        }
        if (nightOwlStmts.length > 0) await db.batch(nightOwlStmts);
      }
    } catch {
      // Don't block game state on D1 failure
    }
  }

  private resetToLobby(): void {
    this.phase = 'lobby';
    this.pile = [];
    this.snapActive = false;
    this.lastPlayedBy = null;
    this.turnOrder = [];
    this.currentDrawIndex = 0;
    this.gameSessionId = null;
    this.snapCooldown = false;
    this.consecutiveSnaps = new Map();

    for (const [, player] of this.players) {
      player.deck = [];
      player.wonCards = 0;
    }

    // Promote spectators to players
    for (const [specId, specName] of this.spectators) {
      if (this.players.size < 8) {
        const p: SnapPlayerData = { id: specId, name: specName, connected: true, isHost: false, isGuest: specId.startsWith('guest_'), deck: [], wonCards: 0 };
        this.players.set(specId, p);
      }
    }
    this.spectators.clear();
  }

  // --- State for clients ---

  private getClientState(): Record<string, unknown> {
    const winnerId = this.phase === 'game_over' ? this.getWinnerId() : null;
    const winnerPlayer = winnerId ? this.players.get(winnerId) : null;

    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.isHost,
      deckSize: p.deck.length,
      frameSvg: p.frameSvg ?? null,
      emblemSvg: p.emblemSvg ?? null,
      nameColour: p.nameColour ?? null,
      titleBadgeId: p.titleBadgeId ?? null,
    }));

    const topCard = this.pile.length > 0 ? this.pile[this.pile.length - 1] : null;
    const secondCard = this.pile.length > 1 ? this.pile[this.pile.length - 2] : null;
    const currentDrawPlayerId = this.turnOrder.length > 0
      ? this.turnOrder[this.currentDrawIndex] ?? null
      : null;

    return {
      code: this.code,
      phase: this.phase,
      players,
      pileSize: this.pile.length,
      topCard,
      secondCard,
      snapActive: this.snapActive,
      lastPlayedBy: this.lastPlayedBy,
      currentDrawPlayerId,
      hasCenterPad: this.centerPadSocketId !== null,
      winnerId,
      winnerName: winnerPlayer?.name ?? null,
    };
  }

  private getWinnerId(): string | null {
    // Winner is the player with cards remaining, or the one with most wonCards
    let bestId: string | null = null;
    let bestCards = -1;
    for (const [id, player] of this.players) {
      const total = player.deck.length + player.wonCards;
      if (total > bestCards) {
        bestCards = total;
        bestId = id;
      }
    }
    // If game ended naturally, the last player standing wins
    const standing = this.turnOrder.filter(id => {
      const p = this.players.get(id);
      return p && p.deck.length > 0;
    });
    if (standing.length === 1) return standing[0];
    return bestId;
  }

  // --- Messaging via Hibernation API ---

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    } catch {}
  }

  private sendTo(playerId: string, msg: ServerMessage): void {
    const sockets = this.ctx.getWebSockets(playerId);
    for (const ws of sockets) {
      this.sendToWs(ws, msg);
    }
  }

  private broadcast(msg: ServerMessage, excludeId?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      if (excludeId && tags.includes(excludeId)) continue;
      this.sendToWs(ws, msg);
    }
  }

  private broadcastState(): void {
    const spectatorList = this.spectators.size > 0
      ? Array.from(this.spectators.entries()).map(([id, name]) => ({ id, name }))
      : undefined;
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (!pid) continue;
      const state = this.getClientState();
      if (spectatorList) state.spectators = spectatorList;
      this.sendToWs(ws, {
        type: 'state_update',
        state,
        isSpectator: this.spectators.has(pid),
      } as ServerMessage);
    }
  }

  // --- Rate limiting ---

  private isRateLimited(playerId: string): boolean {
    const now = Date.now();
    let timestamps = this.rateLimits.get(playerId);
    if (!timestamps) {
      timestamps = [];
      this.rateLimits.set(playerId, timestamps);
    }
    while (timestamps.length > 0 && timestamps[0] < now - RATE_WINDOW_MS) {
      timestamps.shift();
    }
    if (timestamps.length >= RATE_MAX_MESSAGES) return true;
    timestamps.push(now);
    return false;
  }

  // --- Alarm management ---

  private async setExpireAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EXPIRY_MS);
    }
  }

  private async scheduleSnapCooldown(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    const cooldownTime = Date.now() + SNAP_COOLDOWN_MS;
    if (!existing || cooldownTime < existing) {
      await this.ctx.storage.setAlarm(cooldownTime);
    }
  }
}
