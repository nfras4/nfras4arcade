import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import { validateBid, countBidFace, nextInTurnOrder } from './logic';
import { decideLiarsDiceAction } from '../bots/liarsDiceBot';
import { generateBotId, generateBotName, botThinkDelay } from '../bots/botPlayer';
import { CosmeticsCache, DEFAULT_COSMETICS } from '../shared/cosmetics';
import { checkLevelGrants } from '../shared/levelRewards';
import { xpToLevel } from '../../src/lib/xp';

// --- Constants ---

const MAX_MESSAGE_SIZE = 2048;
const MAX_NAME_LENGTH = 20;
const ROOM_EXPIRY_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;
const RECONNECT_TIMEOUT_MS = 45 * 1000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const DICE_PER_PLAYER = 5;
const VALID_ANTES = [25, 50, 100, 250];
const DEFAULT_ANTE = 50;
const DEFAULT_BUY_IN = 1000;
const DEFAULT_REBUY = 100;
const BOT_CHIP_FLOOR = 1000;

// --- Types ---

type Phase = 'lobby' | 'playing' | 'round_over' | 'game_over';

interface Player {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isGuest: boolean;
  isBot: boolean;
  dice: number[];
  eliminated: boolean;
  frameSvg?: string | null;
  emblemSvg?: string | null;
  nameColour?: string | null;
  titleBadgeId?: string | null;
}

interface Bid {
  count: number;
  face: number;
  bidderId: string;
}

interface RoundResult {
  bid: Bid;
  actualCount: number;
  callerId: string;
  loserId: string;
  revealedDice: Record<string, number[]>;
}

interface StoredState {
  code: string;
  phase: Phase;
  players: [string, Player][];
  hostId: string;
  turnOrder: string[];
  currentTurnId: string | null;
  currentBid: Bid | null;
  pot: number;
  gameMode: 'casual' | 'competitive';
  ante: number;
  onesWild: boolean;
  playerChips: Record<string, number>;
  lastRoundResult: RoundResult | null;
  winnerId: string | null;
  gameSessionId: string | null;
  lastActivity: number;
  spectators: [string, string][];
  disconnectTimestamps: [string, number][];
  botTurnPending: boolean;
}

type ServerMessage =
  | { type: 'joined'; playerId: string; state: ClientState; isSpectator?: boolean }
  | { type: 'state_update'; state: ClientState; isSpectator?: boolean }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'level_up'; newLevel: number; rewards: { name: string; type: string; tier: 'hero' | 'minor' }[] };

interface ClientState {
  code: string;
  phase: Phase;
  players: {
    id: string;
    name: string;
    connected: boolean;
    isHost: boolean;
    isGuest: boolean;
    isBot: boolean;
    diceCount: number;
    eliminated: boolean;
    chips: number;
    frameSvg?: string | null;
    emblemSvg?: string | null;
    nameColour?: string | null;
    titleBadgeId?: string | null;
  }[];
  hostId: string;
  turnOrder: string[];
  currentTurnId: string | null;
  currentBid: Bid | null;
  pot: number;
  gameMode: 'casual' | 'competitive';
  ante: number;
  onesWild: boolean;
  myDice: number[];
  lastRoundResult: RoundResult | null;
  winnerId: string | null;
  spectators?: { id: string; name: string }[];
}

interface ClientMessage {
  type: string;
  [key: string]: unknown;
}

// --- Helpers ---

function sanitizeText(text: string, maxLength: number): string {
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function rollDice(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rollDie());
  return out;
}

// --- Durable Object ---

export class LiarsDiceRoom extends DurableObject<Env> {
  private initialized = false;
  private code = '';
  private phase: Phase = 'lobby';
  private players = new Map<string, Player>();
  private hostId = '';
  private turnOrder: string[] = [];
  private currentTurnId: string | null = null;
  private currentBid: Bid | null = null;
  private pot = 0;
  private gameMode: 'casual' | 'competitive' = 'casual';
  private ante = DEFAULT_ANTE;
  private onesWild = false;
  private botTurnPending = false;
  private playerChips: Record<string, number> = {};
  private lastRoundResult: RoundResult | null = null;
  private winnerId: string | null = null;
  private gameSessionId: string | null = null;
  private lastActivity = Date.now();
  private spectators = new Map<string, string>();
  private disconnectTimestamps = new Map<string, number>();
  private rateLimits = new Map<string, number[]>();
  private cosmeticsCache = new CosmeticsCache();

  // --- Persistence ---

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<StoredState>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.players = new Map(stored.players);
      this.hostId = stored.hostId;
      this.turnOrder = stored.turnOrder;
      this.currentTurnId = stored.currentTurnId;
      this.currentBid = stored.currentBid;
      this.pot = stored.pot;
      this.gameMode = stored.gameMode;
      this.ante = stored.ante;
      this.onesWild = stored.onesWild ?? false;
      this.botTurnPending = stored.botTurnPending ?? false;
      this.playerChips = stored.playerChips;
      this.lastRoundResult = stored.lastRoundResult;
      this.winnerId = stored.winnerId;
      this.gameSessionId = stored.gameSessionId;
      this.lastActivity = stored.lastActivity;
      this.spectators = new Map(stored.spectators ?? []);
      this.disconnectTimestamps = new Map(stored.disconnectTimestamps ?? []);

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
    const state: StoredState = {
      code: this.code,
      phase: this.phase,
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      turnOrder: this.turnOrder,
      currentTurnId: this.currentTurnId,
      currentBid: this.currentBid,
      pot: this.pot,
      gameMode: this.gameMode,
      ante: this.ante,
      onesWild: this.onesWild,
      botTurnPending: this.botTurnPending,
      playerChips: this.playerChips,
      lastRoundResult: this.lastRoundResult,
      winnerId: this.winnerId,
      gameSessionId: this.gameSessionId,
      lastActivity: this.lastActivity,
      spectators: Array.from(this.spectators.entries()),
      disconnectTimestamps: Array.from(this.disconnectTimestamps.entries()),
    };
    try {
      await this.ctx.storage.put('room', state);
    } catch {
      // Don't block on storage failure
    }
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }

  // --- fetch / WS upgrade ---

  async fetch(request: Request): Promise<Response> {
    await this.loadState();

    const url = new URL(request.url);
    const roomCode = url.searchParams.get('room')?.toUpperCase() || '';
    if (!this.code) this.code = roomCode;

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({ code: this.code, phase: this.phase, playerCount: this.players.size });
    }

    const userId = request.headers.get('X-User-Id');
    const displayName = request.headers.get('X-Display-Name');
    const isGuest = request.headers.get('X-Is-Guest') === 'true';
    const chipsHeader = request.headers.get('X-Player-Chips');

    if (!userId || !displayName) {
      return new Response('Missing user info', { status: 400 });
    }

    // Seed chip balance for logged-in users on first connect
    if (!isGuest && chipsHeader !== null && this.playerChips[userId] === undefined) {
      const chips = parseInt(chipsHeader, 10);
      if (!isNaN(chips) && chips >= 0) {
        this.playerChips[userId] = chips;
      } else {
        this.playerChips[userId] = this.gameMode === 'competitive' ? 0 : DEFAULT_REBUY;
      }
    } else if (this.playerChips[userId] === undefined) {
      this.playerChips[userId] = DEFAULT_BUY_IN;
    }

    try {
      await this.ctx.storage.put(`name:${userId}`, displayName);
      await this.ctx.storage.put(`guest:${userId}`, isGuest);
    } catch {
      // Don't block
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);

    this.touch();
    await this.setExpireAlarm();
    await this.saveState();

    return new Response(null, { status: 101, webSocket: client });
  }

  // --- Hibernation API ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.loadState();

    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    if (this.isRateLimited(playerId)) {
      this.sendToWs(ws, { type: 'error', message: 'Too many messages, slow down' });
      return;
    }

    if (raw.length > MAX_MESSAGE_SIZE) {
      this.sendToWs(ws, { type: 'error', message: 'Message too large' });
      ws.close(1009, 'Message too large');
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
      await this.handleJoin(ws, playerId);
      return;
    }

    if (!this.players.has(playerId)) {
      if (this.spectators.has(playerId)) return;
      this.sendToWs(ws, { type: 'error', message: 'Not in a room' });
      return;
    }

    this.touch();
    await this.handleGameMessage(playerId, msg);
    await this.saveState();
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;
    this.handleDisconnect(playerId);
    await this.saveState();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
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

    // Bot turn
    if (this.botTurnPending && this.phase === 'playing') {
      this.botTurnPending = false;
      await this.processBotTurn();
      await this.saveState();
    }

    // Reconnect timeouts
    if (this.disconnectTimestamps.size > 0) {
      const timedOut: string[] = [];
      for (const [pid, timestamp] of this.disconnectTimestamps) {
        if (now - timestamp >= RECONNECT_TIMEOUT_MS) {
          timedOut.push(pid);
        }
      }
      for (const pid of timedOut) {
        this.disconnectTimestamps.delete(pid);
        const p = this.players.get(pid);
        if (!p) continue;
        if (this.phase === 'lobby') {
          this.players.delete(pid);
          if (pid === this.hostId) this.promoteNewHost(pid);
        } else {
          // Mid-game: treat as eliminated
          p.eliminated = true;
          p.dice = [];
          this.turnOrder = this.turnOrder.filter((id) => id !== pid);
          if (this.currentTurnId === pid) this.advanceTurn();
          if (pid === this.hostId) this.promoteNewHost(pid);
          this.checkGameEnd();
        }
      }
      if (timedOut.length > 0) {
        this.broadcastState();
        await this.saveState();
      }
    }

    // Room expiry
    if (now - this.lastActivity >= ROOM_EXPIRY_MS && this.players.size === 0) {
      await this.ctx.storage.deleteAll();
      this.initialized = false;
    } else {
      await this.setExpireAlarm();
    }
  }

  // --- Join / Disconnect ---

  private async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const existing = this.players.get(playerId);
    if (existing) {
      this.cosmeticsCache.invalidate(playerId);
      existing.connected = true;
      this.disconnectTimestamps.delete(playerId);
      this.resolveCosmeticsForPlayer(playerId);
      this.sendToWs(ws, { type: 'joined', playerId, state: this.getClientState(playerId) });
      this.broadcastState();
      await this.saveState();
      return;
    }

    if (this.phase !== 'lobby') {
      const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
      this.spectators.set(playerId, storedName || 'Spectator');
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getClientState(playerId),
        isSpectator: true,
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    if (this.players.size >= MAX_PLAYERS) {
      this.sendToWs(ws, { type: 'error', message: `Room is full (max ${MAX_PLAYERS} players)` });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const storedGuest = await this.ctx.storage.get<boolean>(`guest:${playerId}`);
    const name = sanitizeText(storedName || 'Player', MAX_NAME_LENGTH);
    const isHost = this.players.size === 0;

    this.players.set(playerId, {
      id: playerId,
      name,
      connected: true,
      isHost,
      isGuest: storedGuest ?? false,
      isBot: false,
      dice: [],
      eliminated: false,
    });
    if (isHost) this.hostId = playerId;
    if (this.playerChips[playerId] === undefined) {
      this.playerChips[playerId] = DEFAULT_BUY_IN;
    }

    this.resolveCosmeticsForPlayer(playerId);

    this.sendToWs(ws, { type: 'joined', playerId, state: this.getClientState(playerId) });
    this.broadcastState();
    await this.saveState();
  }

  private resolveCosmeticsForPlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (player.isBot) {
      player.frameSvg = DEFAULT_COSMETICS.frameSvg;
      player.emblemSvg = DEFAULT_COSMETICS.emblemSvg;
      player.nameColour = DEFAULT_COSMETICS.nameColour;
      player.titleBadgeId = DEFAULT_COSMETICS.titleBadgeId;
      return;
    }
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
    if (this.spectators.has(playerId)) {
      this.spectators.delete(playerId);
      this.broadcastState();
      return;
    }
    const player = this.players.get(playerId);
    if (!player) return;

    this.cosmeticsCache.invalidate(playerId);

    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      delete this.playerChips[playerId];
      if (playerId === this.hostId && this.players.size > 0) {
        this.promoteNewHost(playerId);
      }
    } else {
      player.connected = false;
      this.disconnectTimestamps.set(playerId, Date.now());
      this.scheduleReconnectCheck();
    }

    // If no humans remain, drop bots so the room can expire cleanly
    this.dropBotsIfNoHumansLeft();

    this.broadcastState();
  }

  private dropBotsIfNoHumansLeft(): void {
    let humanCount = 0;
    for (const p of this.players.values()) {
      if (!p.isBot && p.connected) humanCount++;
    }
    if (humanCount === 0) {
      for (const [id, p] of [...this.players]) {
        if (p.isBot) {
          this.players.delete(id);
          delete this.playerChips[id];
        }
      }
    }
  }

  private promoteNewHost(oldHostId: string): void {
    const old = this.players.get(oldHostId);
    for (const [id, p] of this.players) {
      if (id !== oldHostId && p.connected && !p.eliminated && !p.isBot) {
        p.isHost = true;
        this.hostId = id;
        if (old) old.isHost = false;
        return;
      }
    }
    // Fallback: any remaining non-bot player, even if disconnected
    for (const [id, p] of this.players) {
      if (id !== oldHostId && !p.isBot) {
        p.isHost = true;
        this.hostId = id;
        if (old) old.isHost = false;
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
      case 'set_mode': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'lobby') break;
        const mode = msg.gameMode === 'competitive' ? 'competitive' : 'casual';
        this.gameMode = mode;
        this.broadcastState();
        break;
      }
      case 'set_ante': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'lobby') break;
        const ante = typeof msg.ante === 'number' && VALID_ANTES.includes(msg.ante) ? msg.ante : DEFAULT_ANTE;
        this.ante = ante;
        this.broadcastState();
        break;
      }
      case 'set_ones_wild': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'lobby') break;
        this.onesWild = msg.onesWild === true;
        this.broadcastState();
        break;
      }
      case 'add_bot': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'lobby') break;
        if (this.players.size >= MAX_PLAYERS) {
          this.sendTo(playerId, { type: 'error', message: 'Room is full' });
          break;
        }
        const usedNames = new Set<string>();
        for (const p of this.players.values()) usedNames.add(p.name);
        const botId = generateBotId();
        const botName = generateBotName(usedNames);
        this.players.set(botId, {
          id: botId,
          name: botName,
          connected: true,
          isHost: false,
          isGuest: false,
          isBot: true,
          dice: [],
          eliminated: false,
        });
        this.playerChips[botId] = BOT_CHIP_FLOOR;
        this.broadcastState();
        break;
      }
      case 'remove_bots': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'lobby') break;
        for (const [id, p] of [...this.players]) {
          if (p.isBot) {
            this.players.delete(id);
            delete this.playerChips[id];
          }
        }
        this.broadcastState();
        break;
      }
      case 'rename': {
        const newName = typeof msg.name === 'string' ? sanitizeText(msg.name, MAX_NAME_LENGTH) : '';
        if (!newName) break;
        const p = this.players.get(playerId);
        if (!p) break;
        p.name = newName;
        this.broadcastState();
        break;
      }
      case 'kick': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'lobby') break;
        const targetId = typeof msg.playerId === 'string' ? msg.playerId : '';
        if (!targetId || targetId === this.hostId) break;
        const target = this.players.get(targetId);
        if (!target) break;
        this.players.delete(targetId);
        delete this.playerChips[targetId];
        // Close their sockets
        for (const ws of this.ctx.getWebSockets(targetId)) {
          this.sendToWs(ws, { type: 'error', message: 'You were kicked from the room' });
          ws.close(1000, 'Kicked');
        }
        this.broadcastState();
        break;
      }
      case 'start_game': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can start the game' });
          break;
        }
        const result = this.startGame();
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        await this.maybeScheduleBotTurn();
        break;
      }
      case 'place_bid': {
        if (this.phase !== 'playing') break;
        if (this.currentTurnId !== playerId) {
          this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
          break;
        }
        const count = typeof msg.count === 'number' ? Math.floor(msg.count) : 0;
        const face = typeof msg.face === 'number' ? Math.floor(msg.face) : 0;
        const err = validateBid(count, face, this.totalDiceOnTable(), this.currentBid);
        if (err) {
          this.sendTo(playerId, { type: 'error', message: err });
          break;
        }
        this.currentBid = { count, face, bidderId: playerId };
        this.advanceTurn();
        this.broadcastState();
        await this.maybeScheduleBotTurn();
        break;
      }
      case 'call_liar': {
        if (this.phase !== 'playing') break;
        if (this.currentTurnId !== playerId) {
          this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
          break;
        }
        if (!this.currentBid) {
          this.sendTo(playerId, { type: 'error', message: 'No bid to call' });
          break;
        }
        this.resolveCall(playerId);
        this.broadcastState();
        break;
      }
      case 'next_round': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'round_over') break;
        this.startRound();
        this.broadcastState();
        await this.maybeScheduleBotTurn();
        break;
      }
      case 'new_game': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'game_over') break;
        this.resetToLobby();
        this.broadcastState();
        break;
      }
      default:
        break;
    }
  }

  // --- Game logic ---

  private startGame(): { success: boolean; error?: string } {
    if (this.phase !== 'lobby') return { success: false, error: 'Game already in progress' };
    if (this.players.size < MIN_PLAYERS) return { success: false, error: `Need at least ${MIN_PLAYERS} players` };

    // Competitive mode: every non-guest player must have at least the ante
    if (this.gameMode === 'competitive') {
      for (const [id, p] of this.players) {
        if (p.isGuest || id.startsWith('guest_')) continue;
        if ((this.playerChips[id] ?? 0) < this.ante) {
          return { success: false, error: `${p.name} doesn't have enough chips for the ante` };
        }
      }
    }

    // Collect antes into the pot
    this.pot = 0;
    for (const [id, p] of this.players) {
      const isGuest = p.isGuest || id.startsWith('guest_');
      if (this.gameMode === 'competitive' && !isGuest) {
        this.playerChips[id] = (this.playerChips[id] ?? 0) - this.ante;
      } else {
        // Casual or guest: use casual chips (not persisted)
        this.playerChips[id] = (this.playerChips[id] ?? DEFAULT_BUY_IN) - this.ante;
      }
      this.pot += this.ante;
    }

    // Create game session (for D1 tracking) in competitive mode only
    this.gameSessionId = this.gameMode === 'competitive' ? crypto.randomUUID() : null;

    this.startRound();
    return { success: true };
  }

  private startRound(): void {
    // Capture prior round result before nulling, so we can use it to pick the starter
    const previousResult = this.lastRoundResult;
    this.phase = 'playing';
    this.currentBid = null;
    this.lastRoundResult = null;
    // Build turn order from non-eliminated players, preserving insertion order
    this.turnOrder = [];
    for (const [id, p] of this.players) {
      if (!p.eliminated) this.turnOrder.push(id);
    }

    // First round (everyone at 0 dice): deal DICE_PER_PLAYER. Subsequent rounds: re-roll
    // each surviving player's dice count (resolveCall already popped the loser's die).
    const isFirstRound = this.turnOrder.every((id) => (this.players.get(id)?.dice.length ?? 0) === 0);
    for (const id of this.turnOrder) {
      const p = this.players.get(id);
      if (!p) continue;
      const count = isFirstRound ? DICE_PER_PLAYER : p.dice.length;
      p.dice = rollDice(count);
    }

    // First turn: last round's loser starts, or first in turn order if first round
    if (previousResult && this.turnOrder.includes(previousResult.loserId)) {
      this.currentTurnId = previousResult.loserId;
    } else {
      this.currentTurnId = this.turnOrder[0] ?? null;
    }
  }

  private totalDiceOnTable(): number {
    let total = 0;
    for (const p of this.players.values()) total += p.dice.length;
    return total;
  }

  private advanceTurn(): void {
    this.currentTurnId = nextInTurnOrder(this.turnOrder, this.currentTurnId);
  }

  // --- Bot turn scheduling ---

  private isBotTurn(): boolean {
    if (!this.currentTurnId) return false;
    const p = this.players.get(this.currentTurnId);
    return !!p && p.isBot && !p.eliminated;
  }

  private async maybeScheduleBotTurn(): Promise<void> {
    if (this.phase !== 'playing') return;
    if (!this.isBotTurn()) return;
    if (this.botTurnPending) return;
    this.botTurnPending = true;
    const wakeAt = Date.now() + botThinkDelay();
    const existing = await this.ctx.storage.getAlarm();
    if (!existing || wakeAt < existing) {
      await this.ctx.storage.setAlarm(wakeAt);
    }
    await this.saveState();
  }

  private async processBotTurn(): Promise<void> {
    if (this.phase !== 'playing') return;
    const botId = this.currentTurnId;
    if (!botId) return;
    const bot = this.players.get(botId);
    if (!bot || !bot.isBot || bot.eliminated) return;

    const decision = decideLiarsDiceAction({
      ownDice: bot.dice,
      totalDice: this.totalDiceOnTable(),
      currentBid: this.currentBid ? { count: this.currentBid.count, face: this.currentBid.face } : null,
      onesWild: this.onesWild,
    });

    if (decision.action === 'call_liar' && this.currentBid) {
      this.resolveCall(botId);
    } else if (decision.action === 'bid') {
      const err = validateBid(decision.count, decision.face, this.totalDiceOnTable(), this.currentBid);
      if (err) {
        // Fallback: call liar if bid invalid (shouldn't happen but defensive)
        if (this.currentBid) this.resolveCall(botId);
      } else {
        this.currentBid = { count: decision.count, face: decision.face, bidderId: botId };
        this.advanceTurn();
      }
    }

    this.broadcastState();
    // Chain: if next turn is also a bot, schedule another bot turn
    await this.maybeScheduleBotTurn();
  }

  private resolveCall(callerId: string): void {
    const bid = this.currentBid;
    if (!bid) return;

    // Count actual dice matching the bid face (ones-wild aware)
    let actualCount = 0;
    const revealed: Record<string, number[]> = {};
    for (const [id, p] of this.players) {
      if (p.eliminated) continue;
      revealed[id] = [...p.dice];
      actualCount += countBidFace(p.dice, bid.face, this.onesWild);
    }

    // If actual >= bid count, caller loses; else bidder loses
    const loserId = actualCount >= bid.count ? callerId : bid.bidderId;
    const loser = this.players.get(loserId);
    if (loser && loser.dice.length > 0) {
      // Drop one die
      loser.dice.pop();
      if (loser.dice.length === 0) {
        loser.eliminated = true;
      }
    }

    this.lastRoundResult = {
      bid,
      actualCount,
      callerId,
      loserId,
      revealedDice: revealed,
    };
    this.currentBid = null;
    this.phase = 'round_over';

    this.checkGameEnd();
  }

  private checkGameEnd(): void {
    const alive = Array.from(this.players.values()).filter((p) => !p.eliminated);
    if (alive.length <= 1) {
      const winner = alive[0];
      this.winnerId = winner ? winner.id : null;
      // Award pot to winner
      if (winner) {
        this.playerChips[winner.id] = (this.playerChips[winner.id] ?? 0) + this.pot;
      }
      this.phase = 'game_over';
      if (this.gameMode === 'competitive') {
        void this.recordGameEnd();
      }
    }
  }

  private resetToLobby(): void {
    this.phase = 'lobby';
    this.currentBid = null;
    this.currentTurnId = null;
    this.turnOrder = [];
    this.lastRoundResult = null;
    this.winnerId = null;
    this.pot = 0;
    this.gameSessionId = null;
    for (const p of this.players.values()) {
      p.dice = [];
      p.eliminated = false;
    }
  }

  private async recordGameEnd(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];
      const levelUpMap = new Map<string, { grants: Awaited<ReturnType<typeof checkLevelGrants>>['grants']; newXp: number; xpGain: number }>();
      for (const [id, p] of this.players) {
        if (p.isGuest || p.isBot || id.startsWith('guest_') || id.startsWith('bot_')) continue;
        stmts.push(
          db.prepare('UPDATE player_profiles SET games_played = games_played + 1, updated_at = ? WHERE id = ?').bind(now, id),
        );
        if (id === this.winnerId) {
          stmts.push(
            db.prepare('UPDATE player_profiles SET games_won = games_won + 1, updated_at = ? WHERE id = ?').bind(now, id),
          );
          stmts.push(
            db.prepare('UPDATE player_profiles SET liars_dice_wins = liars_dice_wins + 1, updated_at = ? WHERE id = ?').bind(now, id),
          );
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)').bind(id, 'b_liars_dice_win', now),
          );
        }
        const xpGain = id === this.winnerId ? 100 : 50;
        const { grants: liarsDiceGrants, stmts: grantStmts, newXp: liarsDiceNewXp } = await checkLevelGrants(db, id, xpGain);
        if (liarsDiceGrants.length > 0) levelUpMap.set(id, { grants: liarsDiceGrants, newXp: liarsDiceNewXp, xpGain });
        stmts.push(...grantStmts);
        stmts.push(
          db.prepare('UPDATE player_profiles SET xp = xp + ?, updated_at = ? WHERE id = ?').bind(xpGain, now, id),
        );
        const chips = Math.max(0, this.playerChips[id] ?? 0);
        stmts.push(
          db.prepare('UPDATE player_profiles SET chips = ?, updated_at = ? WHERE id = ?').bind(chips, now, id),
        );
        if (id === this.winnerId) {
          const winAmount = this.pot - this.ante;
          stmts.push(
            db.prepare('UPDATE player_profiles SET biggest_win = ?, biggest_win_game = ? WHERE id = ? AND biggest_win < ?')
              .bind(winAmount, 'liars-dice', id, winAmount),
          );
        }
      }
      if (stmts.length > 0) await db.batch(stmts);

      // Send level-up notifications to players who leveled up
      for (const [id, { grants, newXp, xpGain }] of levelUpMap) {
        const oldLevel = xpToLevel(newXp - xpGain);
        const newLevel = xpToLevel(newXp);
        if (newLevel > oldLevel) {
          this.sendTo(id, {
            type: 'level_up',
            newLevel,
            rewards: grants.map(g => ({ name: g.name, type: g.type, tier: g.tier })),
          });
        }
      }
    } catch {
      // Don't block on D1 failure
    }
  }

  // --- Client state ---

  private getClientState(viewerId: string): ClientState {
    const isSpectator = this.spectators.has(viewerId);
    const spectatorList = this.spectators.size > 0
      ? Array.from(this.spectators.entries()).map(([id, name]) => ({ id, name }))
      : undefined;

    return {
      code: this.code,
      phase: this.phase,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        isHost: p.isHost,
        isGuest: p.isGuest,
        isBot: p.isBot,
        diceCount: p.dice.length,
        eliminated: p.eliminated,
        chips: this.playerChips[p.id] ?? 0,
        frameSvg: p.frameSvg ?? null,
        emblemSvg: p.emblemSvg ?? null,
        nameColour: p.nameColour ?? null,
        titleBadgeId: p.titleBadgeId ?? null,
      })),
      hostId: this.hostId,
      turnOrder: [...this.turnOrder],
      currentTurnId: this.currentTurnId,
      currentBid: this.currentBid,
      pot: this.pot,
      gameMode: this.gameMode,
      ante: this.ante,
      onesWild: this.onesWild,
      myDice: isSpectator ? [] : (this.players.get(viewerId)?.dice ?? []),
      lastRoundResult: this.lastRoundResult,
      winnerId: this.winnerId,
      spectators: spectatorList,
    };
  }

  private broadcastState(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (!pid) continue;
      this.sendToWs(ws, {
        type: 'state_update',
        state: this.getClientState(pid),
        isSpectator: this.spectators.has(pid),
      });
    }
  }

  private sendTo(playerId: string, msg: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets(playerId)) {
      this.sendToWs(ws, msg);
    }
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket closed
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

  // --- Alarms ---

  private async setExpireAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EXPIRY_MS);
    }
  }
}
