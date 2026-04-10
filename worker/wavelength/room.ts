import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { BotPlayer } from '../bots/botPlayer';
import { generateBotId, generateBotName, botThinkDelay } from '../bots/botPlayer';
import { shuffleDeck, type SpectrumCard } from '../../src/lib/wavelength/cards';

// --- Constants ---

const MAX_MESSAGE_SIZE = 2048;
const MAX_TEXT_LENGTH = 200;
const MAX_NAME_LENGTH = 20;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;
const RECONNECT_TIMEOUT_MS = 45 * 1000;

// --- Types ---

type WavelengthPhase = 'lobby' | 'clue_giving' | 'guessing' | 'reveal' | 'game_over';

interface WavelengthPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

interface RoundResultEntry {
  psychicId: string;
  avgScore: number;
  spread: number;
  roundNumber: number;
}

interface WavelengthRoomState {
  code: string;
  phase: WavelengthPhase;
  players: [string, WavelengthPlayer][];
  hostId: string;
  scores: [string, number][];
  bots: [string, BotPlayer][];
  roundNumber: number;
  totalRounds: number;
  psychicId: string;
  psychicOrder: string[];
  targetAngle: number;
  currentCard: { left: string; right: string } | null;
  clues: string[];
  guesses: [string, number][];
  lockedIn: string[];
  customCards: Array<{ left: string; right: string }>;
  deck: Array<{ left: string; right: string }>;
  allowCustomCards: boolean;
  clueTimerSeconds: number;
  guessTimerSeconds: number;
  roundResults: RoundResultEntry[];
  lastActivity: number;
  botTurnPending: boolean;
}

// Server -> Client message types
type ServerMessage =
  | { type: 'joined'; playerId: string; state: Record<string, unknown> }
  | { type: 'state_update'; state: Record<string, unknown> }
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

function shuffleArray<T>(array: T[]): T[] {
  const bytes = crypto.getRandomValues(new Uint32Array(array.length));
  for (let i = array.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function calculateScore(guessAngle: number, targetAngle: number): number {
  const diff = Math.abs(guessAngle - targetAngle);
  if (diff <= 5) return 4;   // bullseye
  if (diff <= 15) return 3;  // close
  if (diff <= 25) return 2;  // edge
  return 0;                   // miss
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// --- Bot clue templates ---

const BOT_CLUE_TEMPLATES = {
  left: [
    'Definitely leaning this way',
    'Pretty far on the left side',
    'Think about the extreme left end',
    'Way over on the first side',
  ],
  center: [
    'Right in the middle',
    'Pretty balanced between both',
    'Not too far either way',
    'Somewhere around the center',
  ],
  right: [
    'Leaning heavily to the right',
    'Pretty far on the right side',
    'Think about the extreme right end',
    'Way over on the second side',
  ],
};

// --- Durable Object ---

export class WavelengthRoom extends DurableObject<Env> {
  // State
  private initialized = false;
  private code = '';
  private phase: WavelengthPhase = 'lobby';
  private players = new Map<string, WavelengthPlayer>();
  private hostId = '';
  private scores = new Map<string, number>();
  private bots = new Map<string, BotPlayer>();

  // Round state
  private roundNumber = 0;
  private totalRounds = 0;
  private psychicId = '';
  private psychicOrder: string[] = [];
  private targetAngle = 0; // 0-180
  private currentCard: { left: string; right: string } | null = null;
  private clues: string[] = [];
  private guesses = new Map<string, number>();
  private lockedIn = new Set<string>();
  private customCards: Array<{ left: string; right: string }> = [];
  private deck: Array<{ left: string; right: string }> = [];

  // Config
  private allowCustomCards = true;
  private clueTimerSeconds = 60;
  private guessTimerSeconds = 45;

  // Awards tracking
  private roundResults: RoundResultEntry[] = [];
  private roundScores = new Map<string, number>(); // per-round scores for reveal display

  // Bot state
  private botTurnPending = false;
  private lastActivity = 0;

  // Rate limiting (in-memory only, resets on hibernation)
  private rateLimits = new Map<string, number[]>();

  // Disconnect tracking
  private disconnectTimestamps = new Map<string, number>();

  // --- State persistence ---

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<WavelengthRoomState>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.players = new Map(stored.players);
      this.hostId = stored.hostId;
      this.scores = new Map(stored.scores);
      this.bots = new Map(stored.bots);
      this.roundNumber = stored.roundNumber;
      this.totalRounds = stored.totalRounds;
      this.psychicId = stored.psychicId;
      this.psychicOrder = stored.psychicOrder;
      this.targetAngle = stored.targetAngle;
      this.currentCard = stored.currentCard;
      this.clues = stored.clues;
      this.guesses = new Map(stored.guesses);
      this.lockedIn = new Set(stored.lockedIn);
      this.customCards = stored.customCards;
      this.deck = stored.deck;
      this.allowCustomCards = stored.allowCustomCards;
      this.clueTimerSeconds = stored.clueTimerSeconds;
      this.guessTimerSeconds = stored.guessTimerSeconds;
      this.roundResults = stored.roundResults;
      this.lastActivity = stored.lastActivity;
      this.botTurnPending = stored.botTurnPending;

      // Reconcile connected status with actual live WebSocket connections
      const livePlayerIds = new Set<string>();
      for (const ws of this.ctx.getWebSockets()) {
        const tags = this.ctx.getTags(ws);
        if (tags[0]) livePlayerIds.add(tags[0]);
      }
      for (const [id, player] of this.players) {
        player.connected = livePlayerIds.has(id) || player.isBot;
      }
    }
  }

  private async saveState(): Promise<void> {
    const state: WavelengthRoomState = {
      code: this.code,
      phase: this.phase,
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      scores: Array.from(this.scores.entries()),
      bots: Array.from(this.bots.entries()),
      roundNumber: this.roundNumber,
      totalRounds: this.totalRounds,
      psychicId: this.psychicId,
      psychicOrder: this.psychicOrder,
      targetAngle: this.targetAngle,
      currentCard: this.currentCard,
      clues: this.clues,
      guesses: Array.from(this.guesses.entries()),
      lockedIn: Array.from(this.lockedIn),
      customCards: this.customCards,
      deck: this.deck,
      allowCustomCards: this.allowCustomCards,
      clueTimerSeconds: this.clueTimerSeconds,
      guessTimerSeconds: this.guessTimerSeconds,
      roundResults: this.roundResults,
      lastActivity: this.lastActivity,
      botTurnPending: this.botTurnPending,
    };
    await this.ctx.storage.put('room', state);
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

    // Non-WebSocket: handle commands or return room info
    if (request.headers.get('Upgrade') !== 'websocket') {
      const action = url.searchParams.get('action');

      if (action === 'add-bot' && request.method === 'POST') {
        return this.handleAddBotHttp(request);
      }
      if (action === 'remove-bots' && request.method === 'POST') {
        return this.handleRemoveBotsHttp();
      }

      return Response.json({
        code: this.code,
        phase: this.phase,
        playerCount: this.players.size,
      });
    }

    // WebSocket upgrade
    const userId = request.headers.get('X-User-Id');
    const displayName = request.headers.get('X-Display-Name');

    if (!userId || !displayName) {
      return new Response('Missing user info', { status: 400 });
    }

    // Store display name for use during join
    await this.ctx.storage.put(`name:${userId}`, displayName);

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
      await this.handleJoin(ws, playerId);
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

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    this.handleDisconnect(playerId);
    await this.saveState();
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
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

    // Handle bot turns
    if (this.botTurnPending) {
      this.botTurnPending = false;
      await this.processBotTurn();
      this.broadcastState();
      await this.saveState();
      return;
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

  private async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const existingPlayer = this.players.get(playerId);

    if (existingPlayer) {
      // Reconnection
      existingPlayer.connected = true;
      this.disconnectTimestamps.delete(playerId);
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getStateForPlayer(playerId),
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    // New player join
    if (this.phase !== 'lobby') {
      this.sendToWs(ws, { type: 'error', message: 'Game already in progress' });
      return;
    }
    if (this.players.size >= 16) {
      this.sendToWs(ws, { type: 'error', message: 'Room is full (max 16 players)' });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const name = sanitizeText(storedName || 'Player', MAX_NAME_LENGTH);

    const isHost = this.players.size === 0;
    const player: WavelengthPlayer = {
      id: playerId,
      name,
      connected: true,
      isHost,
      isBot: false,
    };
    this.players.set(playerId, player);

    if (isHost) {
      this.hostId = playerId;
    }

    this.scores.set(playerId, 0);

    this.sendToWs(ws, {
      type: 'joined',
      playerId,
      state: this.getStateForPlayer(playerId),
    });
    this.broadcastState();
    await this.saveState();
  }

  private handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    if (this.phase === 'lobby') {
      // In lobby, remove immediately
      this.players.delete(playerId);
      this.scores.delete(playerId);
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

  // --- HTTP bot endpoints ---

  private async handleAddBotHttp(request: Request): Promise<Response> {
    if (this.phase !== 'lobby') {
      return Response.json({ error: 'Can only add bots in lobby' }, { status: 400 });
    }
    this.addBot();
    this.broadcastState();
    await this.saveState();
    return Response.json({ ok: true });
  }

  private async handleRemoveBotsHttp(): Promise<Response> {
    if (this.phase !== 'lobby') {
      return Response.json({ error: 'Can only remove bots in lobby' }, { status: 400 });
    }
    this.removeAllBots();
    this.broadcastState();
    await this.saveState();
    return Response.json({ ok: true });
  }

  // --- Game message router ---

  private async handleGameMessage(playerId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'start_game': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can start the game' });
          break;
        }
        const rounds = typeof msg.rounds === 'number' ? Math.max(1, Math.min(10, Math.floor(msg.rounds))) : undefined;
        const result = this.startGame(rounds);
        if (!result.success) {
          this.sendTo(playerId, { type: 'error', message: result.error! });
          break;
        }
        this.broadcastState();
        await this.scheduleBotTurnIfNeeded();
        break;
      }

      case 'send_clue': {
        if (playerId !== this.psychicId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the psychic can send clues' });
          break;
        }
        if (this.phase !== 'clue_giving') {
          this.sendTo(playerId, { type: 'error', message: 'Not in clue giving phase' });
          break;
        }
        const text = sanitizeText(String(msg.text ?? ''), MAX_TEXT_LENGTH);
        if (!text) {
          this.sendTo(playerId, { type: 'error', message: 'Clue cannot be empty' });
          break;
        }
        this.clues.push(text);
        this.broadcastState();
        break;
      }

      case 'done_cluing': {
        if (playerId !== this.psychicId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the psychic can finish cluing' });
          break;
        }
        if (this.phase !== 'clue_giving') break;
        this.phase = 'guessing';
        this.broadcastState();
        await this.scheduleBotTurnIfNeeded();
        break;
      }

      case 'submit_guess': {
        if (playerId === this.psychicId) {
          this.sendTo(playerId, { type: 'error', message: 'Psychic cannot guess' });
          break;
        }
        if (this.phase !== 'guessing') {
          this.sendTo(playerId, { type: 'error', message: 'Not in guessing phase' });
          break;
        }
        const angle = clamp(Number(msg.angle ?? 90), 0, 180);
        this.guesses.set(playerId, angle);
        this.broadcastState();
        break;
      }

      case 'lock_guess': {
        if (playerId === this.psychicId) break;
        if (this.phase !== 'guessing') break;
        if (!this.guesses.has(playerId)) {
          this.sendTo(playerId, { type: 'error', message: 'Submit a guess first' });
          break;
        }
        this.lockedIn.add(playerId);
        // Check if all non-psychic connected players are locked in
        if (this.allGuessersLocked()) {
          this.resolveRound();
        }
        this.broadcastState();
        break;
      }

      case 'next_round': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can advance rounds' });
          break;
        }
        if (this.phase !== 'reveal') break;
        this.advanceRound();
        this.broadcastState();
        await this.scheduleBotTurnIfNeeded();
        break;
      }

      case 'add_custom_card': {
        if (!this.allowCustomCards) {
          this.sendTo(playerId, { type: 'error', message: 'Custom cards are disabled' });
          break;
        }
        const left = sanitizeText(String(msg.left ?? ''), MAX_TEXT_LENGTH);
        const right = sanitizeText(String(msg.right ?? ''), MAX_TEXT_LENGTH);
        if (!left || !right) {
          this.sendTo(playerId, { type: 'error', message: 'Both sides of the card are required' });
          break;
        }
        const card = { left, right };
        this.customCards.push(card);
        this.deck.push(card);
        this.broadcastState();
        break;
      }

      case 'add_bot': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can add bots' });
          break;
        }
        if (this.phase !== 'lobby') {
          this.sendTo(playerId, { type: 'error', message: 'Can only add bots in lobby' });
          break;
        }
        this.addBot();
        this.broadcastState();
        break;
      }

      case 'remove_bots': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can remove bots' });
          break;
        }
        if (this.phase !== 'lobby') {
          this.sendTo(playerId, { type: 'error', message: 'Can only remove bots in lobby' });
          break;
        }
        this.removeAllBots();
        this.broadcastState();
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
        this.calculateAwards();
        this.broadcastState();
        break;
      }
    }

    await this.saveState();
  }

  // --- Game logic ---

  private startGame(requestedRounds?: number): { success: boolean; error?: string } {
    const playerCount = this.players.size;
    if (playerCount < 2) {
      return { success: false, error: 'Need at least 2 players to start' };
    }

    // Shuffle and build deck
    const shuffled = shuffleDeck();
    this.deck = [
      ...shuffled.map((c: SpectrumCard) => ({ left: c.left, right: c.right })),
      ...this.customCards,
    ];
    shuffleArray(this.deck);

    // Set up rounds: default is one rotation (everyone psychic once), host can override
    this.totalRounds = requestedRounds ?? playerCount;
    this.roundNumber = 1;

    // Build psychic order
    const playerIds = Array.from(this.players.keys());
    this.psychicOrder = shuffleArray([...playerIds]);

    // Reset scores
    for (const id of this.players.keys()) {
      this.scores.set(id, 0);
    }

    this.roundResults = [];
    this.startRound();

    return { success: true };
  }

  private startRound(): void {
    // Pick psychic from order
    this.psychicId = this.psychicOrder[(this.roundNumber - 1) % this.psychicOrder.length];

    // Draw a card from the deck
    if (this.deck.length === 0) {
      // Reshuffle if deck is exhausted
      const reshuffled = shuffleDeck();
      this.deck = reshuffled.map((c: SpectrumCard) => ({ left: c.left, right: c.right }));
      shuffleArray(this.deck);
    }
    this.currentCard = this.deck.pop() ?? null;

    // Generate random target angle 0-180
    const rng = crypto.getRandomValues(new Uint32Array(1));
    this.targetAngle = rng[0] % 181;

    // Reset round state
    this.clues = [];
    this.guesses = new Map();
    this.lockedIn = new Set();
    this.phase = 'clue_giving';
  }

  private allGuessersLocked(): boolean {
    for (const [id, player] of this.players) {
      if (id === this.psychicId) continue;
      if (!player.connected) continue;
      if (!this.lockedIn.has(id)) return false;
    }
    return true;
  }

  private resolveRound(): void {
    this.phase = 'reveal';

    // Reset per-round scores
    this.roundScores = new Map();

    // Score each guesser
    const guesserScores: number[] = [];
    const guesserAngles: number[] = [];

    for (const [id, angle] of this.guesses) {
      if (id === this.psychicId) continue;
      const score = calculateScore(angle, this.targetAngle);
      guesserScores.push(score);
      guesserAngles.push(angle);
      this.roundScores.set(id, score);

      const current = this.scores.get(id) ?? 0;
      this.scores.set(id, current + score);
    }

    // Psychic score = average of guesser scores
    const avgScore = guesserScores.length > 0
      ? guesserScores.reduce((a, b) => a + b, 0) / guesserScores.length
      : 0;
    const psychicScore = Math.round(avgScore);
    this.roundScores.set(this.psychicId, psychicScore);
    const currentPsychicScore = this.scores.get(this.psychicId) ?? 0;
    this.scores.set(this.psychicId, currentPsychicScore + psychicScore);

    // Track spread for awards
    const spread = guesserAngles.length > 0
      ? Math.max(...guesserAngles) - Math.min(...guesserAngles)
      : 0;

    this.roundResults.push({
      psychicId: this.psychicId,
      avgScore,
      spread,
      roundNumber: this.roundNumber,
    });
  }

  private advanceRound(): void {
    this.roundNumber++;
    if (this.roundNumber > this.totalRounds) {
      this.phase = 'game_over';
      this.calculateAwards();
      return;
    }
    this.startRound();
  }

  private calculateAwards(): Record<string, unknown> {
    const awards: Record<string, unknown> = {};

    if (this.roundResults.length > 0) {
      // bestClue: round with highest average guesser score
      let bestClueRound = this.roundResults[0];
      for (const rr of this.roundResults) {
        if (rr.avgScore > bestClueRound.avgScore) {
          bestClueRound = rr;
        }
      }
      awards.bestClue = {
        psychicId: bestClueRound.psychicId,
        psychicName: this.players.get(bestClueRound.psychicId)?.name ?? 'Unknown',
        avgScore: bestClueRound.avgScore,
      };

      // mindMeld: round with smallest guesser spread
      let mindMeldRound = this.roundResults[0];
      for (const rr of this.roundResults) {
        if (rr.spread < mindMeldRound.spread) {
          mindMeldRound = rr;
        }
      }
      awards.mindMeld = {
        psychicId: mindMeldRound.psychicId,
        psychicName: this.players.get(mindMeldRound.psychicId)?.name ?? 'Unknown',
        spread: mindMeldRound.spread,
        roundNumber: mindMeldRound.roundNumber,
      };
    }

    return awards;
  }

  private resetToLobby(): void {
    this.phase = 'lobby';
    this.roundNumber = 0;
    this.totalRounds = 0;
    this.psychicId = '';
    this.psychicOrder = [];
    this.targetAngle = 0;
    this.currentCard = null;
    this.clues = [];
    this.guesses = new Map();
    this.lockedIn = new Set();
    this.roundResults = [];
    this.deck = [];

    for (const id of this.players.keys()) {
      this.scores.set(id, 0);
    }
  }

  // --- Bot management ---

  private addBot(): void {
    if (this.players.size >= 16) return;

    const usedNames = new Set<string>();
    for (const bot of this.bots.values()) {
      usedNames.add(bot.name);
    }

    const botId = generateBotId();
    const botName = generateBotName(usedNames);

    const bot: BotPlayer = {
      id: botId,
      name: botName,
      isBot: true,
      difficulty: 'easy',
    };
    this.bots.set(botId, bot);

    const player: WavelengthPlayer = {
      id: botId,
      name: botName,
      connected: true,
      isHost: false,
      isBot: true,
    };
    this.players.set(botId, player);
    this.scores.set(botId, 0);
  }

  private removeAllBots(): void {
    for (const botId of this.bots.keys()) {
      this.players.delete(botId);
      this.scores.delete(botId);
    }
    this.bots.clear();
  }

  private async scheduleBotTurnIfNeeded(): Promise<void> {
    // Check if the current phase needs a bot action
    if (this.phase === 'clue_giving' && this.bots.has(this.psychicId)) {
      this.botTurnPending = true;
      const delay = botThinkDelay();
      await this.ctx.storage.setAlarm(Date.now() + delay);
    } else if (this.phase === 'guessing') {
      // Check if any bots need to guess
      for (const botId of this.bots.keys()) {
        if (botId === this.psychicId) continue;
        if (!this.lockedIn.has(botId)) {
          this.botTurnPending = true;
          const delay = botThinkDelay();
          await this.ctx.storage.setAlarm(Date.now() + delay);
          return;
        }
      }
    }
  }

  private async processBotTurn(): Promise<void> {
    if (this.phase === 'clue_giving' && this.bots.has(this.psychicId)) {
      // Bot psychic: give a clue based on target position
      const clue = this.generateBotClue();
      this.clues.push(clue);
      // Bot immediately finishes cluing
      this.phase = 'guessing';
      // Schedule bot guessers
      await this.scheduleBotTurnIfNeeded();
      return;
    }

    if (this.phase === 'guessing') {
      // Process one bot guesser at a time
      for (const botId of this.bots.keys()) {
        if (botId === this.psychicId) continue;
        if (this.lockedIn.has(botId)) continue;

        // Bot guess: target + noise
        const rng = crypto.getRandomValues(new Uint32Array(1));
        const noise = (rng[0] % 61) - 30; // -30 to +30
        const guess = clamp(this.targetAngle + noise, 0, 180);
        this.guesses.set(botId, guess);
        this.lockedIn.add(botId);

        // Check if all guessers locked
        if (this.allGuessersLocked()) {
          this.resolveRound();
          return;
        }

        // Schedule next bot if needed
        await this.scheduleBotTurnIfNeeded();
        return;
      }
    }
  }

  private generateBotClue(): string {
    let templates: string[];
    if (this.targetAngle < 60) {
      templates = BOT_CLUE_TEMPLATES.left;
    } else if (this.targetAngle <= 120) {
      templates = BOT_CLUE_TEMPLATES.center;
    } else {
      templates = BOT_CLUE_TEMPLATES.right;
    }
    const rng = crypto.getRandomValues(new Uint32Array(1));
    return templates[rng[0] % templates.length];
  }

  // --- State for players ---

  private getStateForPlayer(playerId: string): Record<string, unknown> {
    const isPsychic = playerId === this.psychicId;
    const isRevealOrGameOver = this.phase === 'reveal' || this.phase === 'game_over';

    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.isHost,
      isBot: p.isBot,
      score: this.scores.get(p.id) ?? 0,
    }));

    return {
      code: this.code,
      phase: this.phase,
      players,
      hostId: this.hostId,
      scores: Object.fromEntries(this.scores),
      roundNumber: this.roundNumber,
      totalRounds: this.totalRounds,
      psychicId: this.psychicId,
      currentCard: this.currentCard,
      clues: this.clues,
      // Only the psychic sees targetAngle during clue_giving/guessing; everyone sees it during reveal/game_over
      targetAngle: (isPsychic || isRevealOrGameOver) ? this.targetAngle : null,
      guesses: Object.fromEntries(this.guesses),
      lockedIn: Array.from(this.lockedIn),
      customCards: this.customCards,
      customCardCount: this.customCards.length,
      allowCustomCards: this.allowCustomCards,
      roundScores: Object.fromEntries(this.roundScores),
      clueTimerSeconds: this.clueTimerSeconds,
      guessTimerSeconds: this.guessTimerSeconds,
      roundResults: isRevealOrGameOver ? this.roundResults : [],
      awards: this.phase === 'game_over' ? this.calculateAwards() : null,
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
