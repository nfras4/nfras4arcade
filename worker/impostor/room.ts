import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { ConnectedPlayerData, RoomState } from './types';
import type {
  GamePhase, GameMode, Player, HintEntry, VoteResult,
  RoundResult, GameState, ClientMessage, ServerMessage,
} from '../../src/lib/types';
import { getRandomWord, getRandomCategory, getCategories } from './words';

const MAX_MESSAGE_SIZE = 2048;
const MAX_TEXT_LENGTH = 200;
const MAX_NAME_LENGTH = 20;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const RECONNECT_TIMEOUT_MS = 45 * 1000; // 45 seconds to reconnect
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;

function sanitizeText(text: string, maxLength: number): string {
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}

function shuffleArray<T>(array: T[]): T[] {
  const bytes = crypto.getRandomValues(new Uint32Array(array.length));
  for (let i = array.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export class ImpostorRoom extends DurableObject<Env> {
  // Game state
  private code: string = '';
  private phase: GamePhase = 'lobby';
  private mode: GameMode = 'text';
  private players: Map<string, ConnectedPlayerData> = new Map();
  private hostId: string = '';
  private hintRound: number = 0;
  private totalHintRounds: number = 2;
  private category: string | null = null;
  private currentWord: string | null = null;
  private impostorId: string | null = null;
  private turnOrder: string[] = [];
  private currentTurnIndex: number = 0;
  private hints: HintEntry[] = [];
  private allHintsHistory: HintEntry[][] = [];
  private roundResult: RoundResult | null = null;
  private lastActivity: number = Date.now();
  private gameSessionId: string | null = null;

  // Rate limiting (in-memory only, resets on hibernation -- acceptable)
  private rateLimits: Map<string, number[]> = new Map();

  // Track disconnect timestamps for reconnection timeouts
  private disconnectTimestamps: Map<string, number> = new Map();

  // Track if state has been loaded from storage
  private initialized = false;

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<RoomState>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.mode = stored.mode;
      this.players = new Map(stored.players);
      this.hostId = stored.hostId;
      this.hintRound = stored.hintRound;
      this.totalHintRounds = stored.totalHintRounds;
      this.category = stored.category;
      this.currentWord = stored.currentWord;
      this.impostorId = stored.impostorId;
      this.turnOrder = stored.turnOrder;
      this.currentTurnIndex = stored.currentTurnIndex;
      this.hints = stored.hints;
      this.allHintsHistory = stored.allHintsHistory;
      this.roundResult = stored.roundResult;
      this.lastActivity = stored.lastActivity;
      this.gameSessionId = stored.gameSessionId ?? null;
      if (stored.disconnectTimestamps) {
        this.disconnectTimestamps = new Map(stored.disconnectTimestamps);
      }

      // Reconcile connected status with actual live WebSocket connections.
      // The Hibernation API keeps WebSockets alive across hibernation, so
      // check which players still have an open socket rather than marking
      // everyone disconnected.
      const livePlayerIds = new Set<string>();
      for (const ws of this.ctx.getWebSockets()) {
        const tags = this.ctx.getTags(ws);
        if (tags[0]) livePlayerIds.add(tags[0]);
      }
      for (const [id, cp] of this.players) {
        if (livePlayerIds.has(id)) {
          cp.player.connected = true;
          cp.player.connectionStatus = 'connected';
        } else {
          cp.player.connected = false;
          cp.player.connectionStatus = 'reconnecting';
        }
      }
    }
  }

  private async saveState(): Promise<void> {
    const state: RoomState = {
      code: this.code,
      phase: this.phase,
      mode: this.mode,
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      hintRound: this.hintRound,
      totalHintRounds: this.totalHintRounds,
      category: this.category,
      currentWord: this.currentWord,
      impostorId: this.impostorId,
      turnOrder: this.turnOrder,
      currentTurnIndex: this.currentTurnIndex,
      hints: this.hints,
      allHintsHistory: this.allHintsHistory,
      roundResult: this.roundResult,
      lastActivity: this.lastActivity,
      gameSessionId: this.gameSessionId,
      disconnectTimestamps: Array.from(this.disconnectTimestamps.entries()),
    };
    await this.ctx.storage.put('room', state);
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }

  // --- WebSocket upgrade ---

  async fetch(request: Request): Promise<Response> {
    await this.loadState();

    const url = new URL(request.url);
    const roomCode = url.searchParams.get('room')?.toUpperCase() || '';

    // Initialize code if this is a new room
    if (!this.code) {
      this.code = roomCode;
    }

    // GET room info (non-WebSocket)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({
        code: this.code,
        playerCount: this.players.size,
        phase: this.phase,
      });
    }

    // WebSocket upgrade
    const userId = request.headers.get('X-User-Id');
    const displayName = request.headers.get('X-Display-Name');
    const isGuest = request.headers.get('X-Is-Guest') === 'true';

    if (!userId || !displayName) {
      return new Response('Missing user info', { status: 400 });
    }

    // Store display name and guest status for use during join
    await this.ctx.storage.put(`name:${userId}`, displayName);
    if (isGuest) {
      await this.ctx.storage.put(`guest:${userId}`, true);
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Tag the WebSocket with the userId for later lookup
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
      await this.handleJoin(ws, playerId, msg);
      return;
    }

    // All other messages require being in the room
    if (!this.players.has(playerId)) {
      this.sendToWs(ws, { type: 'error', message: 'Not in a room' });
      return;
    }

    this.touch();
    await this.handleGameMessage(playerId, msg);
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    this.handleDisconnect(playerId);
    await this.saveState();
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    this.handleDisconnect(playerId);
    await this.saveState();
  }

  async alarm(): Promise<void> {
    await this.loadState();
    const now = Date.now();

    // Check reconnect timeouts first
    if (this.disconnectTimestamps.size > 0) {
      const changed = this.handleReconnectTimeouts();
      if (changed) {
        this.broadcastState();
        await this.saveState();
      }
      // Re-schedule if there are still pending disconnects
      if (this.disconnectTimestamps.size > 0) {
        await this.scheduleReconnectCheck();
        return;
      }
    }

    if (now - this.lastActivity > ROOM_EXPIRY_MS) {
      // Expire the room
      for (const ws of this.ctx.getWebSockets()) {
        try {
          this.sendToWs(ws, { type: 'error', message: 'Room expired due to inactivity' });
          ws.close(1000, 'Room expired');
        } catch {}
      }
      await this.ctx.storage.deleteAll();
      this.initialized = false;
    } else {
      // Re-set expiry alarm
      await this.setExpireAlarm();
    }
  }

  // --- Join / Disconnect ---

  private async handleJoin(ws: WebSocket, playerId: string, msg: ClientMessage): Promise<void> {
    // Get display name from the WebSocket upgrade headers (stored via tag)
    // The display name was passed as X-Display-Name during upgrade
    // For reconnection, use the existing player name
    const existingPlayer = this.players.get(playerId);

    if (existingPlayer) {
      // Reconnection — restore player and clear timeout
      existingPlayer.player.connected = true;
      existingPlayer.player.connectionStatus = 'connected';
      this.disconnectTimestamps.delete(playerId);
      const joinMsg: ServerMessage = {
        type: 'joined',
        playerId,
        state: this.getStateForPlayer(playerId),
      };
      this.sendToWs(ws, joinMsg);
      this.broadcastState();
      await this.saveState();
      return;
    }

    // New player join
    if (this.phase !== 'lobby') {
      this.sendToWs(ws, { type: 'error', message: 'Game already in progress' });
      return;
    }
    if (this.players.size >= 8) {
      this.sendToWs(ws, { type: 'error', message: 'Room is full (max 8 players)' });
      return;
    }

    // Get display name: from message (legacy) or from upgrade headers
    // The name comes from the join message for backwards compat,
    // but in the authenticated flow it comes from X-Display-Name header
    let name = '';
    if ('name' in msg && typeof (msg as any).name === 'string') {
      name = sanitizeText((msg as any).name, MAX_NAME_LENGTH);
    }
    if (!name) {
      // Try to get from the WS attachment - we stored it during upgrade
      const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
      name = storedName || 'Player';
    }

    const isHost = this.players.size === 0;
    const player: Player = { id: playerId, name, isHost, connected: true, connectionStatus: 'connected' };
    this.players.set(playerId, { player });

    if (isHost) {
      this.hostId = playerId;
    }

    const joinMsg: ServerMessage = {
      type: 'joined',
      playerId,
      state: this.getStateForPlayer(playerId),
    };
    this.sendToWs(ws, joinMsg);
    this.broadcastState();
    await this.saveState();
  }

  private handleDisconnect(playerId: string): void {
    const cp = this.players.get(playerId);
    if (!cp) return;

    if (this.phase === 'lobby') {
      // In lobby, remove immediately
      this.players.delete(playerId);
      if (playerId === this.hostId && this.players.size > 0) {
        const newHost = this.players.values().next().value!;
        newHost.player.isHost = true;
        this.hostId = newHost.player.id;
      }
    } else {
      // Mid-game: mark as reconnecting with timeout
      cp.player.connected = false;
      cp.player.connectionStatus = 'reconnecting';
      this.disconnectTimestamps.set(playerId, Date.now());

      // Schedule alarm to check reconnect timeout
      this.scheduleReconnectCheck();

      // If it's this player's turn in hints, skip after timeout handled by alarm
    }

    if (this.players.size === 0) {
      return;
    }

    this.broadcastState();
  }

  private async scheduleReconnectCheck(): Promise<void> {
    // Set an alarm to check for reconnection timeouts
    const existing = await this.ctx.storage.getAlarm();
    const nextCheck = Date.now() + RECONNECT_TIMEOUT_MS;
    // Only set if no alarm or this one is sooner
    if (!existing || nextCheck < existing) {
      await this.ctx.storage.setAlarm(nextCheck);
    }
  }

  private handleReconnectTimeouts(): boolean {
    const now = Date.now();
    let changed = false;

    for (const [pid, timestamp] of this.disconnectTimestamps) {
      if (now - timestamp >= RECONNECT_TIMEOUT_MS) {
        const cp = this.players.get(pid);
        if (cp && !cp.player.connected) {
          cp.player.connectionStatus = 'disconnected';
          this.disconnectTimestamps.delete(pid);
          changed = true;

          // Skip this player's turn if they're current
          if (this.phase === 'hints') {
            const currentPlayerId = this.turnOrder[this.currentTurnIndex];
            if (currentPlayerId === pid) {
              this.skipDisconnectedTurn(pid);
            }
          }

          // Host promotion if host disconnected
          if (pid === this.hostId) {
            this.promoteNewHost(pid);
          }
        }
      }
    }

    return changed;
  }

  private skipDisconnectedTurn(playerId: string): void {
    // Skip this player's turn by advancing the index
    this.currentTurnIndex++;
    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.phase = 'discussion';
    }
  }

  private promoteNewHost(oldHostId: string): void {
    // Find a connected player to be the new host
    for (const [id, cp] of this.players) {
      if (id !== oldHostId && cp.player.connected) {
        cp.player.isHost = true;
        this.hostId = id;
        // Remove host from old player
        const oldCp = this.players.get(oldHostId);
        if (oldCp) oldCp.player.isHost = false;
        return;
      }
    }
  }

  // --- Game logic (ported from server/game.ts) ---

  private async handleGameMessage(playerId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'select_category': {
        if (playerId !== this.hostId) break;
        this.category = msg.category;
        this.broadcastState();
        break;
      }

      case 'select_mode': {
        if (playerId !== this.hostId) break;
        this.mode = msg.mode;
        this.broadcastState();
        break;
      }

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

      case 'give_hint': {
        const text = sanitizeText(msg.text, MAX_TEXT_LENGTH);
        if (!text) {
          this.sendTo(playerId, { type: 'error', message: 'Hint cannot be empty' });
          break;
        }
        const result = this.giveHint(playerId, text);
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        break;
      }

      case 'mark_done': {
        const result = this.markDone(playerId);
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        break;
      }

      case 'chat': {
        const cp = this.players.get(playerId);
        if (!cp) break;
        this.broadcast({
          type: 'chat_message',
          playerId,
          name: cp.player.name,
          text: sanitizeText(msg.text, MAX_TEXT_LENGTH),
          timestamp: Date.now(),
        });
        break;
      }

      case 'start_voting': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can start voting' });
          break;
        }
        const result = this.startVoting();
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        break;
      }

      case 'vote': {
        const result = this.vote(playerId, msg.targetId);
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcast({ type: 'vote_cast', voterId: playerId });
        if (result.allVoted) {
          const roundResult = await this.resolveVotes();
          this.broadcast({ type: 'round_result', result: roundResult });
          this.broadcastState();
        }
        break;
      }

      case 'next_hint_round': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can advance rounds' });
          break;
        }
        const result = this.nextHintRound();
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        break;
      }

      case 'play_again': {
        if (playerId !== this.hostId) break;
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

      case 'leave_game': {
        await this.handlePlayerLeave(playerId);
        break;
      }
    }

    await this.saveState();
  }

  private async handlePlayerLeave(playerId: string): Promise<void> {
    const wasHost = playerId === this.hostId;
    this.players.delete(playerId);
    this.disconnectTimestamps.delete(playerId);

    // Close the leaving player's websocket
    const sockets = this.ctx.getWebSockets(playerId);
    for (const ws of sockets) {
      try { ws.close(1000, 'Left game'); } catch {}
    }

    if (this.players.size === 0) {
      return;
    }

    if (wasHost) {
      // Try to promote a new host
      let promoted = false;
      for (const [id, cp] of this.players) {
        if (cp.player.connected) {
          cp.player.isHost = true;
          this.hostId = id;
          promoted = true;
          break;
        }
      }

      if (!promoted) {
        // No connected players to promote — dissolve the lobby
        this.broadcast({ type: 'lobby_dissolved', message: 'The host left and no players are available to take over.' });
        for (const ws of this.ctx.getWebSockets()) {
          try { ws.close(1000, 'Lobby dissolved'); } catch {}
        }
        return;
      }
    }

    // --- Mid-game departure handling ---
    const inGame = this.phase === 'hints' || this.phase === 'discussion' || this.phase === 'voting';

    if (inGame) {
      // If the impostor left, end the game immediately
      if (playerId === this.impostorId) {
        const impostorCp = { name: 'The Impostor' }; // player already deleted
        this.roundResult = {
          impostorId: playerId,
          impostorName: impostorCp.name,
          word: this.currentWord!,
          category: this.category!,
          impostorHint: '',
          votes: [],
          impostorCaught: false,
        };
        this.phase = 'reveal';
        this.broadcast({ type: 'round_result', result: this.roundResult });
        this.broadcastState();
        return;
      }

      // If fewer than 3 players remain, return to lobby
      if (this.players.size < 3) {
        this.resetToLobby();
        this.broadcastState();
        return;
      }

      // Phase-specific cleanup
      if (this.phase === 'hints') {
        const departedIndex = this.turnOrder.indexOf(playerId);
        if (departedIndex !== -1) {
          this.turnOrder.splice(departedIndex, 1);
          // Adjust currentTurnIndex based on where the departed player was
          if (departedIndex < this.currentTurnIndex) {
            // Departed player was before current turn — shift index back
            this.currentTurnIndex--;
          }
          // If departedIndex === currentTurnIndex, keep index (it now points to next player)
          // Wrap if past end
          if (this.turnOrder.length > 0 && this.currentTurnIndex >= this.turnOrder.length) {
            // All turns done — advance to discussion
            this.phase = 'discussion';
          }
        }
      } else if (this.phase === 'voting') {
        // Remove the departing player's vote data
        // Also remove any votes cast FOR the departing player
        for (const [, cp] of this.players) {
          if (cp.votedFor === playerId) {
            cp.hasVoted = false;
            cp.votedFor = undefined;
          }
        }
        // Check if all remaining connected players have voted
        const allVoted = Array.from(this.players.values())
          .filter((cp) => cp.player.connected)
          .every((cp) => cp.hasVoted);
        if (allVoted) {
          const roundResult = await this.resolveVotes();
          this.broadcast({ type: 'round_result', result: roundResult });
        }
      }
      // During 'discussion' phase — no special handling needed
    }

    this.broadcastState();
  }

  // --- Game methods (faithfully ported from GameRoom) ---

  private async startGame(): Promise<{ success: boolean; error?: string }> {
    if (this.players.size < 3) {
      return { success: false, error: 'Need at least 3 players to start' };
    }

    if (!this.category) {
      this.category = getRandomCategory();
    }

    const wordData = getRandomWord(this.category!);
    if (!wordData) {
      return { success: false, error: 'No words available for this category' };
    }

    this.currentWord = wordData.word;

    const playerIds = Array.from(this.players.keys()).filter(
      (id) => this.players.get(id)!.player.connected
    );
    const rng = crypto.getRandomValues(new Uint32Array(1));
    this.impostorId = playerIds[rng[0] % playerIds.length];

    for (const [id, cp] of this.players) {
      if (id === this.impostorId) {
        cp.role = 'impostor';
        cp.word = undefined;
        cp.impostorHint = wordData.hint;
      } else {
        cp.role = 'player';
        cp.word = wordData.word;
        cp.impostorHint = undefined;
      }
      cp.hasVoted = false;
      cp.votedFor = undefined;
      cp.hintGiven = false;
    }

    this.hintRound = 1;
    this.allHintsHistory = [];
    this.hints = [];
    this.roundResult = null;
    this.turnOrder = shuffleArray([...playerIds]);
    this.currentTurnIndex = 0;
    this.phase = 'hints';

    // Record game session in D1
    try {
      this.gameSessionId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        'INSERT INTO game_sessions (id, game_type, room_code, player_count, started_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(this.gameSessionId, 'impostor', this.code, this.players.size, now).run();
    } catch {
      // D1 write failure should not block gameplay
    }

    return { success: true };
  }

  private giveHint(playerId: string, text: string): { success: boolean; error?: string } {
    if (this.phase !== 'hints') {
      return { success: false, error: 'Not in hints phase' };
    }
    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (playerId !== currentPlayerId) {
      return { success: false, error: 'Not your turn' };
    }
    const cp = this.players.get(playerId);
    if (!cp) return { success: false, error: 'Player not found' };

    this.hints.push({
      playerId,
      playerName: cp.player.name,
      text: text.trim(),
      hintRound: this.hintRound,
    });
    cp.hintGiven = true;
    this.currentTurnIndex++;

    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.phase = 'discussion';
    }

    return { success: true };
  }

  private markDone(playerId: string): { success: boolean; error?: string } {
    if (this.phase !== 'hints' || this.mode !== 'voice') {
      return { success: false, error: 'Cannot mark done' };
    }
    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (playerId !== currentPlayerId) {
      return { success: false, error: 'Not your turn' };
    }
    const cp = this.players.get(playerId);
    if (!cp) return { success: false, error: 'Player not found' };

    cp.hintGiven = true;
    this.hints.push({
      playerId,
      playerName: cp.player.name,
      text: '(spoke in voice chat)',
      hintRound: this.hintRound,
    });
    this.currentTurnIndex++;

    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.phase = 'discussion';
    }

    return { success: true };
  }

  private nextHintRound(): { success: boolean; error?: string } {
    if (this.phase !== 'discussion') {
      return { success: false, error: 'Not in discussion phase' };
    }
    if (this.hintRound >= 3) {
      return { success: false, error: 'Maximum 3 hint rounds reached' };
    }

    this.allHintsHistory.push([...this.hints]);
    this.hintRound++;
    this.hints = [];
    this.currentTurnIndex = 0;

    const playerIds = Array.from(this.players.keys()).filter(
      (id) => this.players.get(id)!.player.connected
    );
    this.turnOrder = shuffleArray([...playerIds]);

    for (const cp of this.players.values()) {
      cp.hintGiven = false;
    }

    this.phase = 'hints';
    return { success: true };
  }

  private startVoting(): { success: boolean; error?: string } {
    if (this.phase !== 'discussion') {
      return { success: false, error: 'Not in discussion phase' };
    }

    this.allHintsHistory.push([...this.hints]);
    this.phase = 'voting';
    for (const cp of this.players.values()) {
      cp.hasVoted = false;
      cp.votedFor = undefined;
    }
    return { success: true };
  }

  private vote(voterId: string, targetId: string): { success: boolean; allVoted?: boolean; error?: string } {
    if (this.phase !== 'voting') {
      return { success: false, error: 'Not in voting phase' };
    }
    const voter = this.players.get(voterId);
    if (!voter) return { success: false, error: 'Voter not found' };
    if (voter.hasVoted) return { success: false, error: 'Already voted' };
    if (voterId === targetId) return { success: false, error: 'Cannot vote for yourself' };
    if (!this.players.has(targetId)) return { success: false, error: 'Invalid target' };

    voter.hasVoted = true;
    voter.votedFor = targetId;

    const allVoted = Array.from(this.players.values())
      .filter((cp) => cp.player.connected)
      .every((cp) => cp.hasVoted);

    return { success: true, allVoted };
  }

  private async resolveVotes(): Promise<RoundResult> {
    const votes: VoteResult[] = [];
    const voteCounts = new Map<string, number>();

    for (const [id, cp] of this.players) {
      if (cp.votedFor) {
        votes.push({
          voterId: id,
          voterName: cp.player.name,
          targetId: cp.votedFor,
          targetName: this.players.get(cp.votedFor)?.player.name || 'Unknown',
        });
        voteCounts.set(cp.votedFor, (voteCounts.get(cp.votedFor) || 0) + 1);
      }
    }

    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) maxVotes = count;
    }
    const tied = [...voteCounts.entries()].filter(([, c]) => c === maxVotes).map(([id]) => id);
    const accusedId = tied[Math.floor(Math.random() * tied.length)];

    const impostorCp = this.players.get(this.impostorId!);

    // If the impostor left mid-vote, they escaped (players lose)
    if (!impostorCp) {
      const result: RoundResult = {
        impostorId: this.impostorId!,
        impostorName: 'Unknown',
        word: this.currentWord!,
        category: this.category!,
        impostorHint: '',
        votes,
        impostorCaught: false,
      };
      this.roundResult = result;
      this.phase = 'reveal';
      return result;
    }

    const impostorCaught = accusedId === this.impostorId;

    const result: RoundResult = {
      impostorId: this.impostorId!,
      impostorName: impostorCp.player.name,
      word: this.currentWord!,
      category: this.category!,
      impostorHint: impostorCp.impostorHint!,
      votes,
      impostorCaught,
    };

    this.roundResult = result;
    this.phase = 'reveal';

    // Update D1: game session, player stats, badges
    try {
      const now = Math.floor(Date.now() / 1000);
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];

      // End the game session
      if (this.gameSessionId) {
        const winnerId = impostorCaught ? null : this.impostorId;
        stmts.push(
          db.prepare('UPDATE game_sessions SET ended_at = ?, winner_id = ? WHERE id = ?')
            .bind(now, winnerId, this.gameSessionId)
        );
      }

      // Increment games_played for all players, games_won for winners
      // Skip D1 stats for guest players (ids starting with "guest_")
      for (const [id, cp] of this.players) {
        if (id.startsWith('guest_')) continue;

        stmts.push(
          db.prepare('UPDATE player_profiles SET games_played = games_played + 1, updated_at = ? WHERE id = ?')
            .bind(now, id)
        );

        // Winners: if impostor was caught, all non-impostors win; if not caught, impostor wins
        const isWinner = impostorCaught ? id !== this.impostorId : id === this.impostorId;
        if (isWinner) {
          stmts.push(
            db.prepare('UPDATE player_profiles SET games_won = games_won + 1, updated_at = ? WHERE id = ?')
              .bind(now, id)
          );
        }

        // XP: +50 for participating, +50 bonus for winning
        const xpGain = isWinner ? 100 : 50;
        stmts.push(
          db.prepare('UPDATE player_profiles SET xp = xp + ?, updated_at = ? WHERE id = ?')
            .bind(xpGain, now, id)
        );

        // Award "First Game" badge (ignore if already awarded)
        stmts.push(
          db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
            .bind(id, 'b_first_game', now)
        );

        // Award "Champion" badge on first win
        if (isWinner) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_champion', now)
          );
        }

        // Award "Impostor Win" badge if impostor escaped
        if (id === this.impostorId && !impostorCaught) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_impostor_win', now)
          );
        }
      }

      // Award "Perfect Detective" if everyone voted for the impostor
      if (impostorCaught) {
        const allCorrect = votes.every(v => v.targetId === this.impostorId);
        if (allCorrect) {
          for (const [id] of this.players) {
            if (id.startsWith('guest_') || id === this.impostorId) continue;
            stmts.push(
              db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
                .bind(id, 'b_perfect_detective', now)
            );
          }
        }
      }

      // Check veteran badge (10 games) for registered players
      for (const [id] of this.players) {
        if (id.startsWith('guest_')) continue;
        const profile = await db.prepare('SELECT games_played FROM player_profiles WHERE id = ?').bind(id).first<{ games_played: number }>();
        if (profile && profile.games_played >= 10) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_veteran', now)
          );
        }
      }

      if (stmts.length > 0) {
        await db.batch(stmts);
      }
    } catch {
      // D1 write failure should not block gameplay
    }

    return result;
  }

  private resetToLobby(): void {
    this.phase = 'lobby';
    this.hintRound = 0;
    this.currentWord = null;
    this.impostorId = null;
    this.gameSessionId = null;
    this.turnOrder = [];
    this.currentTurnIndex = 0;
    this.hints = [];
    this.allHintsHistory = [];
    this.roundResult = null;
    this.disconnectTimestamps.clear();

    // Prune disconnected players before returning to lobby
    for (const [id, cp] of this.players) {
      if (!cp.player.connected) {
        this.players.delete(id);
      }
    }

    for (const cp of this.players.values()) {
      cp.role = undefined;
      cp.word = undefined;
      cp.impostorHint = undefined;
      cp.hasVoted = false;
      cp.votedFor = undefined;
      cp.hintGiven = false;
    }
  }

  private getStateForPlayer(playerId: string): GameState {
    const cp = this.players.get(playerId);
    const players: Player[] = Array.from(this.players.values()).map((p) => p.player);

    return {
      code: this.code,
      phase: this.phase,
      mode: this.mode,
      players,
      hostId: this.hostId,
      hintRound: this.hintRound,
      totalHintRounds: this.totalHintRounds,
      canExtraRound: this.hintRound >= this.totalHintRounds && this.hintRound < 3,
      category: this.category,
      role: cp?.role,
      word: cp?.role === 'player' ? cp.word : undefined,
      impostorHint: cp?.role === 'impostor' ? cp.impostorHint : undefined,
      turnOrder: this.turnOrder,
      currentTurnIndex: this.currentTurnIndex,
      hints: this.hints,
      allHints: this.allHintsHistory,
      hasVoted: cp?.hasVoted ?? false,
      roundResult:
        this.phase === 'reveal' || this.phase === 'game_over'
          ? this.roundResult ?? undefined
          : undefined,
    };
  }

  // --- Messaging via Hibernation API ---

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
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
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const playerId = tags[0];
      if (!playerId) continue;
      this.sendToWs(ws, {
        type: 'state_update',
        state: this.getStateForPlayer(playerId),
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
}
