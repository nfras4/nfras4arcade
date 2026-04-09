import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { Card, CardPlayer, CardGamePhase, CardGameState, CardAction, CardRoomStoredState } from './types';
import type { BotPlayer } from '../bots/botPlayer';
import { generateBotId, generateBotName, botThinkDelay } from '../bots/botPlayer';

const MAX_MESSAGE_SIZE = 2048;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;

/**
 * Base class for card-game Durable Objects.
 * Provides shared WebSocket handling, player management, turn order,
 * reconnect support, and state persistence. Each game subclass implements
 * the abstract methods to define its own rules.
 */
export abstract class CardRoom extends DurableObject<Env> {
  protected code: string = '';
  protected phase: CardGamePhase = 'lobby';
  protected players: Map<string, CardPlayer> = new Map();
  protected hostId: string = '';
  protected turnOrder: string[] = [];
  protected currentTurn: string | null = null;
  protected roundNumber: number = 0;
  protected scores: Map<string, number> = new Map();
  protected tableState: unknown = null;
  protected lastActivity: number = Date.now();
  protected gameSessionId: string | null = null;

  /** Bot players in this room. */
  protected bots: Map<string, BotPlayer> = new Map();
  /** Whether a bot turn alarm is pending. */
  protected botTurnPending: boolean = false;
  /** Timestamp when bot turn was scheduled (for watchdog). */
  private botTurnScheduledAt: number = 0;

  private initialized = false;
  private rateLimits: Map<string, number[]> = new Map();

  // --- Abstract methods each game must implement ---

  /** Process a game-specific player action. */
  protected abstract handleAction(playerId: string, action: CardAction): Promise<void> | void;

  /** Return the state visible to a specific player (hide other hands, etc). */
  protected abstract getGameStateForPlayer(playerId: string): CardGameState;

  /** Check if the current round has ended. Return winner ID or null. */
  protected abstract checkRoundEnd(): string | null;

  /** Set up tableState and deal cards for a new round. */
  protected abstract initRound(): void;

  /** Minimum players required to start. */
  protected abstract get minPlayers(): number;

  /** Maximum players allowed. */
  protected abstract get maxPlayers(): number;

  /** Game type identifier for D1 records. */
  protected abstract get gameType(): string;

  // --- State persistence ---

  protected async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<CardRoomStoredState>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.players = new Map(stored.players);
      this.hostId = stored.hostId;
      this.turnOrder = stored.turnOrder;
      this.currentTurn = stored.currentTurn;
      this.roundNumber = stored.roundNumber;
      this.scores = new Map(stored.scores);
      this.tableState = stored.tableState;
      this.lastActivity = stored.lastActivity;

      // Restore bot map from players
      this.bots = new Map();
      for (const [id, p] of this.players) {
        if (p.isBot) {
          this.bots.set(id, { id, name: p.name, isBot: true, difficulty: 'easy' });
        }
      }

      // Restore bot turn pending flag
      this.botTurnPending = (stored as any).botTurnPending ?? false;

      // Mark all non-bot players disconnected on wake; bots stay connected
      for (const p of this.players.values()) {
        if (!p.isBot) {
          p.connected = false;
        }
      }
    }
  }

  protected async saveState(): Promise<void> {
    const state: CardRoomStoredState & { botTurnPending: boolean } = {
      code: this.code,
      phase: this.phase,
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      turnOrder: this.turnOrder,
      currentTurn: this.currentTurn,
      roundNumber: this.roundNumber,
      scores: Array.from(this.scores.entries()),
      tableState: this.tableState,
      lastActivity: this.lastActivity,
      botTurnPending: this.botTurnPending,
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

    if (!this.code) {
      this.code = roomCode;
    }

    // Non-WebSocket: handle commands or return room info
    if (request.headers.get('Upgrade') !== 'websocket') {
      const action = url.searchParams.get('action');

      if (action === 'add-bot' && request.method === 'POST') {
        return await this.handleAddBotRequest();
      }

      if (action === 'remove-bots' && request.method === 'POST') {
        return await this.handleRemoveBotsRequest();
      }

      return Response.json({
        code: this.code,
        playerCount: this.players.size,
        phase: this.phase,
      });
    }

    const userId = request.headers.get('X-User-Id');
    const displayName = request.headers.get('X-Display-Name');
    if (!userId || !displayName) {
      return new Response('Missing user info', { status: 400 });
    }

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

    // Mark player as connected — receiving a WS message proves they are.
    // This fixes stale connected=false after DO hibernation wake.
    const sender = this.players.get(playerId);
    if (sender && !sender.isBot) {
      sender.connected = true;
    }

    if (this.isRateLimited(playerId)) {
      this.sendToWs(ws, { type: 'error', message: 'Too many messages, slow down' });
      return;
    }

    if (raw.length > MAX_MESSAGE_SIZE) {
      this.sendToWs(ws, { type: 'error', message: 'Message too large' });
      return;
    }

    let msg: any;
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
      this.sendToWs(ws, { type: 'error', message: 'Not in a room' });
      return;
    }

    this.touch();

    // Handle common messages
    if (msg.type === 'start_game' && playerId === this.hostId) {
      await this.handleStartGame(playerId);
    } else if (msg.type === 'play_again' && playerId === this.hostId) {
      this.phase = 'lobby';
      this.roundNumber = 0;
      this.tableState = null;
      this.currentTurn = null;
      this.turnOrder = [];
      this.gameSessionId = null;
      this.scores = new Map();
      for (const p of this.players.values()) {
        p.hand = [];
      }
      this.broadcastState();
    } else if (msg.type === 'end_game' && playerId === this.hostId) {
      this.phase = 'game_over';
      this.broadcastState();
    } else {
      // Delegate to game-specific handler
      await this.handleAction(playerId, msg as CardAction);
    }

    // After any action, if it's now a bot's turn, schedule it
    if (this.isBotTurn() && this.phase === 'playing') {
      await this.scheduleBotTurn();
    }

    await this.saveState();
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

    // Bot turn alarm
    if (this.botTurnPending && this.phase === 'playing') {
      this.botTurnPending = false;
      try {
        await this.processBotTurn();
      } catch (err) {
        // Bot turn failed — force a pass to prevent game freeze
        console.error(`Bot turn error for ${this.currentTurn}:`, err);
        if (this.currentTurn && this.bots.has(this.currentTurn)) {
          this.advanceTurn();
          this.broadcastState();
          // If next turn is also a bot, schedule it
          if (this.isBotTurn() && this.phase === 'playing') {
            await this.scheduleBotTurn();
          }
        }
      }
      await this.saveState();
      return;
    }

    // Watchdog: if it's a bot's turn but no alarm is pending, force-advance
    if (this.phase === 'playing' && this.isBotTurn() && !this.botTurnPending) {
      console.error(`Bot watchdog: force-advancing stuck bot ${this.currentTurn}`);
      this.advanceTurn();
      this.broadcastState();
      if (this.isBotTurn()) {
        await this.scheduleBotTurn();
      }
      await this.saveState();
      return;
    }

    // Room expiry
    if (Date.now() - this.lastActivity > ROOM_EXPIRY_MS) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          this.sendToWs(ws, { type: 'error', message: 'Room expired due to inactivity' });
          ws.close(1000, 'Room expired');
        } catch {}
      }
      await this.ctx.storage.deleteAll();
      this.initialized = false;
    }
  }

  // --- Join / Disconnect ---

  private async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const existing = this.players.get(playerId);

    if (existing) {
      // Reconnection
      existing.connected = true;
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getGameStateForPlayer(playerId),
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    if (this.phase !== 'lobby') {
      this.sendToWs(ws, { type: 'error', message: 'Game already in progress' });
      return;
    }
    if (this.players.size >= this.maxPlayers) {
      this.sendToWs(ws, { type: 'error', message: `Room is full (max ${this.maxPlayers} players)` });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const name = storedName || 'Player';
    // First human player becomes host (even if bots were added first via create-solo)
    const noHumanHost = !this.hostId || this.bots.has(this.hostId);
    const isHost = this.players.size === 0 || noHumanHost;

    const player: CardPlayer = { id: playerId, name, hand: [], connected: true, isHost };
    this.players.set(playerId, player);

    if (isHost) {
      // Remove host from any bot that had it
      if (this.hostId && this.players.has(this.hostId)) {
        this.players.get(this.hostId)!.isHost = false;
      }
      this.hostId = playerId;
    }

    this.sendToWs(ws, {
      type: 'joined',
      playerId,
      state: this.getGameStateForPlayer(playerId),
    });
    this.broadcastState();
    await this.saveState();
  }

  private handleDisconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player || player.isBot) return; // Bots never disconnect

    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      if (playerId === this.hostId && this.players.size > 0) {
        // Find next non-bot player to be host
        const newHost = Array.from(this.players.values()).find(p => !p.isBot)
          || this.players.values().next().value!;
        newHost.isHost = true;
        this.hostId = newHost.id;
      }
    } else {
      player.connected = false;
    }

    if (this.players.size > 0) {
      this.broadcastState();
    }
  }

  // --- Start game ---

  private async handleStartGame(playerId: string): Promise<void> {
    if (this.players.size < this.minPlayers) {
      this.sendTo(playerId, { type: 'error', message: `Need at least ${this.minPlayers} players` });
      return;
    }

    this.roundNumber = 1;
    // Include ALL players in the game — everyone in the lobby plays
    this.turnOrder = Array.from(this.players.keys());
    // Shuffle turn order
    const bytes = crypto.getRandomValues(new Uint32Array(this.turnOrder.length));
    for (let i = this.turnOrder.length - 1; i > 0; i--) {
      const j = bytes[i] % (i + 1);
      [this.turnOrder[i], this.turnOrder[j]] = [this.turnOrder[j], this.turnOrder[i]];
    }
    this.currentTurn = this.turnOrder[0];
    this.phase = 'playing';

    this.initRound();

    // Record game session in D1
    try {
      this.gameSessionId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        'INSERT INTO game_sessions (id, game_type, room_code, player_count, started_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(this.gameSessionId, this.gameType, this.code, this.players.size, now).run();
    } catch {}

    this.broadcastState();

    // If first turn is a bot, schedule it
    if (this.isBotTurn()) {
      await this.scheduleBotTurn();
    }
  }

  // --- Bot management ---

  /** Add a bot player to the room. Returns the bot or null if room is full / not in lobby. */
  protected addBot(customName?: string): BotPlayer | null {
    if (this.phase !== 'lobby') return null;
    if (this.players.size >= this.maxPlayers) return null;

    const usedNames = new Set(Array.from(this.players.values()).map(p => p.name));
    const name = customName || generateBotName(usedNames);
    const id = generateBotId();

    const bot: BotPlayer = { id, name, isBot: true, difficulty: 'easy' };
    this.bots.set(id, bot);

    const player: CardPlayer = {
      id,
      name,
      hand: [],
      connected: true,
      isHost: false,
      isBot: true,
    };
    this.players.set(id, player);

    return bot;
  }

  /** Remove all bots from the room. Only works in lobby. */
  protected removeAllBots(): void {
    if (this.phase !== 'lobby') return;
    for (const [id] of this.bots) {
      this.players.delete(id);
    }
    this.bots.clear();
  }

  /** Returns true if the current turn belongs to a bot. */
  protected isBotTurn(): boolean {
    if (!this.currentTurn) return false;
    return this.bots.has(this.currentTurn);
  }

  /** Schedule a bot turn via the alarm API. */
  protected async scheduleBotTurn(): Promise<void> {
    if (!this.isBotTurn() || this.phase !== 'playing') return;
    this.botTurnPending = true;
    this.botTurnScheduledAt = Date.now();
    const delay = botThinkDelay();
    await this.ctx.storage.setAlarm(Date.now() + delay);
  }

  /**
   * Process the current bot's turn. Subclasses override this
   * to call game-specific bot decision logic and then handleAction.
   */
  protected async processBotTurn(): Promise<void> {
    // Default no-op — subclasses must implement
  }

  /** Handle the add-bot HTTP request from SvelteKit API route. */
  private async handleAddBotRequest(): Promise<Response> {
    if (this.phase !== 'lobby') {
      return Response.json({ error: 'Game already in progress' }, { status: 400 });
    }
    if (this.players.size >= this.maxPlayers) {
      return Response.json({ error: 'Room is full' }, { status: 400 });
    }
    const bot = this.addBot();
    if (!bot) {
      return Response.json({ error: 'Could not add bot' }, { status: 400 });
    }
    this.broadcastState();
    await this.saveState();
    return Response.json({ name: bot.name, id: bot.id });
  }

  /** Handle the remove-bots HTTP request. */
  private async handleRemoveBotsRequest(): Promise<Response> {
    this.removeAllBots();
    this.broadcastState();
    await this.saveState();
    return Response.json({ ok: true });
  }

  // --- Helpers ---

  protected getConnectedPlayerIds(): string[] {
    return Array.from(this.players.entries())
      .filter(([, p]) => p.connected)
      .map(([id]) => id);
  }

  protected advanceTurn(): void {
    if (this.turnOrder.length === 0) return;
    const idx = this.turnOrder.indexOf(this.currentTurn || '');
    this.currentTurn = this.turnOrder[(idx + 1) % this.turnOrder.length];
  }

  /** Record game end in D1: update session, increment stats, award badges. */
  protected async recordGameEnd(winnerId: string | null): Promise<void> {
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

      for (const [id] of this.players) {
        // Skip D1 updates for bots — they have no profile
        if (this.bots.has(id)) continue;

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
        // First Game badge
        stmts.push(
          db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
            .bind(id, 'b_first_game', now)
        );
        // Champion badge on win
        if (id === winnerId) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_champion', now)
          );
        }
      }

      // Lone Monkey badge: winner is human and all other players are bots
      if (winnerId && !this.bots.has(winnerId)) {
        const otherPlayers = Array.from(this.players.keys()).filter(id => id !== winnerId);
        const allOthersBots = otherPlayers.length > 0 && otherPlayers.every(id => this.bots.has(id));
        if (allOthersBots) {
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(winnerId, 'b_lone_monkey', now)
          );
        }
      }

      if (stmts.length > 0) await db.batch(stmts);
    } catch {}
  }

  // --- Messaging ---

  protected sendToWs(ws: WebSocket, msg: object): void {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  protected sendTo(playerId: string, msg: object): void {
    for (const ws of this.ctx.getWebSockets(playerId)) {
      this.sendToWs(ws, msg);
    }
  }

  protected broadcast(msg: object, excludeId?: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      if (excludeId && tags.includes(excludeId)) continue;
      this.sendToWs(ws, msg);
    }
  }

  protected broadcastState(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (!pid) continue;
      this.sendToWs(ws, {
        type: 'state_update',
        state: this.getGameStateForPlayer(pid),
      });
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

  private async setExpireAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EXPIRY_MS);
    }
  }
}
