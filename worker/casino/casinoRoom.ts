import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { CasinoPlayer, CasinoPhase, CasinoGameState, CasinoAction, CasinoStoredState } from './types';

const MAX_MESSAGE_SIZE = 2048;
const ROOM_EXPIRY_MS = 30 * 60 * 1000;
const DISCONNECT_TIMEOUT_MS = 30 * 1000;
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;
const DEFAULT_BUY_IN = 1000;

/**
 * Base class for casino (player-vs-house) Durable Objects.
 * Provides shared WebSocket handling, player management, chip wagering,
 * reconnect support, and state persistence. Unlike CardRoom, this models
 * simultaneous player actions against a shared dealer with no PvP turn order.
 */
export abstract class CasinoRoom extends DurableObject<Env> {
  protected code: string = '';
  protected phase: CasinoPhase = 'lobby';
  protected players: Map<string, CasinoPlayer> = new Map();
  protected hostId: string = '';
  protected roundNumber: number = 0;
  protected lastActivity: number = Date.now();
  protected gameSessionId: string | null = null;
  protected minBet: number = 10;
  protected maxBet: number = 10000;

  protected disconnectTimestamps: Map<string, number> = new Map();
  protected spectators: Map<string, string> = new Map();

  private initialized = false;
  private rateLimits: Map<string, number[]> = new Map();

  // --- Abstract methods ---

  protected abstract handlePlayerAction(playerId: string, action: CasinoAction): Promise<void> | void;
  protected abstract getGameStateForPlayer(playerId: string): CasinoGameState;
  protected abstract resolveRound(): Promise<void>;
  protected abstract initRound(): void;
  protected abstract get gameType(): string;
  protected abstract get maxSeats(): number;

  // --- State persistence ---

  protected async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<CasinoStoredState>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.players = new Map(stored.players);
      this.hostId = stored.hostId;
      this.roundNumber = stored.roundNumber;
      this.tableState = stored.tableState;
      this.lastActivity = stored.lastActivity;
      this.minBet = stored.minBet ?? 10;
      this.maxBet = stored.maxBet ?? 10000;
      this.disconnectTimestamps = new Map(stored.disconnectTimestamps ?? []);
      this.spectators = new Map(stored.spectators ?? []);
      this.gameSessionId = stored.gameSessionId ?? null;

      for (const p of this.players.values()) {
        p.connected = false;
      }
    }
  }

  protected tableState: unknown = null;

  protected async saveState(): Promise<void> {
    const state: CasinoStoredState = {
      code: this.code,
      phase: this.phase,
      players: Array.from(this.players.entries()),
      hostId: this.hostId,
      roundNumber: this.roundNumber,
      tableState: this.tableState,
      lastActivity: this.lastActivity,
      minBet: this.minBet,
      maxBet: this.maxBet,
      disconnectTimestamps: Array.from(this.disconnectTimestamps.entries()),
      spectators: Array.from(this.spectators.entries()),
      gameSessionId: this.gameSessionId,
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

    if (request.headers.get('Upgrade') !== 'websocket') {
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

    // Load chip balance from header
    const isGuest = request.headers.get('X-Is-Guest') === 'true';
    const chipsHeader = request.headers.get('X-Player-Chips');
    let existingPlayer = this.players.get(userId);
    if (!existingPlayer) {
      // Will be created in handleJoin; store chips for later
      let chips = DEFAULT_BUY_IN;
      if (!isGuest && chipsHeader !== null) {
        const parsed = parseInt(chipsHeader, 10);
        if (!isNaN(parsed) && parsed > 0) chips = parsed;
      }
      await this.ctx.storage.put(`chips:${userId}`, chips);
      await this.ctx.storage.put(`guest:${userId}`, isGuest);
    } else if (!isGuest && chipsHeader !== null) {
      // Reconnecting registered player: update chip balance from D1
      const parsed = parseInt(chipsHeader, 10);
      if (!isNaN(parsed) && parsed > 0 && this.phase === 'lobby') {
        existingPlayer.chips = parsed;
      }
    }

    await this.ctx.storage.put(`name:${userId}`, displayName);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);

    this.touch();
    await this.setExpireAlarm();
    await this.saveState();

    return new Response(null, { status: 101, webSocket: client });
  }

  // --- Hibernation API handlers ---

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.loadState();

    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    const sender = this.players.get(playerId);
    if (sender) sender.connected = true;

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
      if (this.spectators.has(playerId)) return;
      this.sendToWs(ws, { type: 'error', message: 'Not in a room' });
      return;
    }

    this.touch();

    if (msg.type === 'start_game' && playerId === this.hostId) {
      await this.handleStartGame(msg);
    } else if (msg.type === 'play_again' && playerId === this.hostId) {
      this.phase = 'lobby';
      this.roundNumber = 0;
      this.tableState = null;
      this.gameSessionId = null;
      for (const [specId, specName] of this.spectators) {
        if (this.players.size < this.maxSeats) {
          const chips = await this.ctx.storage.get<number>(`chips:${specId}`) ?? DEFAULT_BUY_IN;
          const isGuest = await this.ctx.storage.get<boolean>(`guest:${specId}`) ?? true;
          const p: CasinoPlayer = { id: specId, name: specName, connected: true, isHost: false, chips, isGuest };
          this.players.set(specId, p);
        }
      }
      this.spectators.clear();
      this.broadcastState();
    } else if (msg.type === 'next_round' && playerId === this.hostId) {
      if (this.phase === 'round_over') {
        await this.startNewRound();
      }
    } else {
      await this.handlePlayerAction(playerId, msg as CasinoAction);
    }

    await this.saveState();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;
    await this.handleDisconnect(playerId);
    await this.saveState();
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;
    await this.handleDisconnect(playerId);
    await this.saveState();
  }

  async alarm(): Promise<void> {
    await this.loadState();

    // Disconnect timeout
    if (this.disconnectTimestamps.size > 0) {
      const now = Date.now();
      for (const [pid, ts] of this.disconnectTimestamps) {
        if (now - ts >= DISCONNECT_TIMEOUT_MS) {
          this.disconnectTimestamps.delete(pid);
        }
      }
      if (this.disconnectTimestamps.size > 0) {
        await this.scheduleDisconnectCheck();
      }
      await this.saveState();
    }

    // Room expiry
    if (Date.now() - this.lastActivity > ROOM_EXPIRY_MS) {
      // Clean up casino_tables registry
      try {
        await this.env.DB.prepare('DELETE FROM casino_tables WHERE code = ?').bind(this.code).run();
      } catch {}

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
      existing.connected = true;
      this.disconnectTimestamps.delete(playerId);
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
      const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
      this.spectators.set(playerId, storedName || 'Spectator');
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        isSpectator: true,
        state: this.getGameStateForPlayer(playerId),
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    if (this.players.size >= this.maxSeats) {
      this.sendToWs(ws, { type: 'error', message: `Table is full (max ${this.maxSeats} seats)` });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const name = storedName || 'Player';
    const chips = await this.ctx.storage.get<number>(`chips:${playerId}`) ?? DEFAULT_BUY_IN;
    const isGuest = await this.ctx.storage.get<boolean>(`guest:${playerId}`) ?? playerId.startsWith('guest_');
    const isHost = this.players.size === 0 || !this.hostId;

    const player: CasinoPlayer = { id: playerId, name, connected: true, isHost, chips, isGuest };
    this.players.set(playerId, player);

    if (isHost) this.hostId = playerId;

    // Update casino_tables registry
    await this.updateTableRegistry();

    this.sendToWs(ws, {
      type: 'joined',
      playerId,
      state: this.getGameStateForPlayer(playerId),
    });
    this.broadcastState();
    await this.saveState();
  }

  private async handleDisconnect(playerId: string): Promise<void> {
    if (this.spectators.has(playerId)) {
      this.spectators.delete(playerId);
      this.broadcastState();
      return;
    }

    const player = this.players.get(playerId);
    if (!player) return;

    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      if (playerId === this.hostId && this.players.size > 0) {
        const newHost = this.players.values().next().value!;
        newHost.isHost = true;
        this.hostId = newHost.id;
      }
      await this.updateTableRegistry();
    } else {
      player.connected = false;
      this.disconnectTimestamps.set(playerId, Date.now());
      await this.scheduleDisconnectCheck();
    }

    if (this.players.size > 0) {
      this.broadcastState();
    }
  }

  // --- Start game ---

  private async handleStartGame(msg?: any): Promise<void> {
    if (this.players.size < 1) {
      this.sendTo(this.hostId, { type: 'error', message: 'Need at least 1 player' });
      return;
    }

    // Allow subclass to process start options (e.g., min bet)
    if (msg) this.onStartGameOptions(msg);

    this.roundNumber = 0;
    this.phase = 'betting';

    try {
      this.gameSessionId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        'INSERT INTO game_sessions (id, game_type, room_code, player_count, started_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(this.gameSessionId, this.gameType, this.code, this.players.size, now).run();
    } catch {}

    await this.startNewRound();
  }

  protected onStartGameOptions(msg: any): void {
    if (typeof msg.minBet === 'number' && msg.minBet >= 1 && msg.minBet <= 1000) {
      this.minBet = msg.minBet;
    }
  }

  protected async startNewRound(): Promise<void> {
    this.roundNumber++;
    this.phase = 'betting';
    this.initRound();
    this.broadcastState();
  }

  // --- Chip management ---

  protected placeBet(playerId: string, amount: number): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (amount < this.minBet || amount > this.maxBet) return false;
    if (amount > player.chips) return false;

    player.chips -= amount;
    return true;
  }

  protected awardChips(playerId: string, amount: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.chips += amount;
  }

  protected async persistChips(): Promise<void> {
    try {
      const stmts: D1PreparedStatement[] = [];
      const now = Math.floor(Date.now() / 1000);
      for (const [id, player] of this.players) {
        if (!player.isGuest && !id.startsWith('guest_')) {
          stmts.push(
            this.env.DB.prepare('UPDATE player_profiles SET chips = ?, updated_at = ? WHERE id = ?')
              .bind(player.chips, now, id)
          );
        }
      }
      if (stmts.length > 0) await this.env.DB.batch(stmts);
    } catch {}
  }

  protected async recordCasinoRound(profitedPlayerIds: string[]): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];

      for (const [id, player] of this.players) {
        if (player.isGuest || id.startsWith('guest_')) continue;

        stmts.push(
          db.prepare('UPDATE player_profiles SET games_played = games_played + 1, updated_at = ? WHERE id = ?')
            .bind(now, id)
        );

        const won = profitedPlayerIds.includes(id);
        if (won) {
          stmts.push(
            db.prepare('UPDATE player_profiles SET games_won = games_won + 1, updated_at = ? WHERE id = ?')
              .bind(now, id)
          );
        }

        const xpGain = won ? 100 : 50;
        stmts.push(
          db.prepare('UPDATE player_profiles SET xp = xp + ?, updated_at = ? WHERE id = ?')
            .bind(xpGain, now, id)
        );

        stmts.push(
          db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
            .bind(id, 'b_first_game', now)
        );
      }

      if (stmts.length > 0) await db.batch(stmts);
    } catch {}
  }

  // --- Table registry ---

  protected async updateTableRegistry(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        `INSERT OR REPLACE INTO casino_tables (code, game_type, player_count, max_seats, min_bet, created_at, last_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(this.code, this.gameType, this.players.size, this.maxSeats, this.minBet, now, now).run();
    } catch {}
  }

  protected async removeTableRegistry(): Promise<void> {
    try {
      await this.env.DB.prepare('DELETE FROM casino_tables WHERE code = ?').bind(this.code).run();
    } catch {}
  }

  // --- Disconnect timeout ---

  private async scheduleDisconnectCheck(): Promise<void> {
    let soonest = Infinity;
    for (const ts of this.disconnectTimestamps.values()) {
      const expiresAt = ts + DISCONNECT_TIMEOUT_MS;
      if (expiresAt < soonest) soonest = expiresAt;
    }
    if (soonest === Infinity) return;
    const existing = await this.ctx.storage.getAlarm();
    if (!existing || soonest < existing) {
      await this.ctx.storage.setAlarm(soonest);
    }
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
    const spectatorList = this.spectators.size > 0
      ? Array.from(this.spectators.entries()).map(([id, name]) => ({ id, name }))
      : undefined;
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (!pid) continue;
      const state = this.getGameStateForPlayer(pid);
      if (spectatorList) state.spectators = spectatorList;
      this.sendToWs(ws, {
        type: 'state_update',
        state,
        isSpectator: this.spectators.has(pid),
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
