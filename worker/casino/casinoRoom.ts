import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import type { CasinoPlayer, CasinoPhase, CasinoGameState, CasinoAction, CasinoStoredState } from './types';
import type { Device, DeviceRole } from '../cards/types';
import { CosmeticsCache } from '../shared/cosmetics';
import { removeDevice as removeDeviceShared, hasRemainingDevices as hasRemainingDevicesShared, pushDevice, synthesiseLegacyDevice, makeDevice } from '../shared/deviceManager';
import { checkLevelGrants } from '../shared/levelRewards';
import { xpToLevel } from '../../src/lib/xp';

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

  /** Per-DO cosmetics cache (resolved player cosmetic payloads). */
  protected cosmeticsCache = new CosmeticsCache();

  // --- Abstract methods ---

  protected abstract handlePlayerAction(playerId: string, action: CasinoAction): Promise<void> | void;
  /**
   * Return the state visible to a specific player from a specific device role.
   * Subclasses override this to redact private state (own bets, hole cards).
   * Table surface gets zero personal-bet info because the controller is the
   * source of truth for private state.
   */
  protected abstract getStateFor(playerId: string, deviceRole: DeviceRole): CasinoGameState;
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

      // Hydrate devices: legacy state files have no devices field, so
      // synthesise a 'both' placeholder per player to keep the device-set
      // invariant. The legacy:* placeholders are filtered out by
      // hasRemainingDevices so they cannot keep ghost players alive.
      const storedDevices = new Map<string, Device[]>(stored.devices ?? []);
      const now = Date.now();
      for (const [id, p] of this.players) {
        const existing = storedDevices.get(id);
        if (existing && existing.length > 0) {
          p.devices = existing;
        } else {
          p.devices = [synthesiseLegacyDevice(id, now)];
        }
        // Backfill the delta baseline for state files that predate this field.
        // Treating the stored mirror as the baseline means the next persist
        // writes zero delta until actual play moves chips off this value.
        if (p.chipsAtLoad === undefined) p.chipsAtLoad = p.chips;
      }

      // Reconcile connected status against live WebSockets. Hibernation
      // keeps sockets alive, so blanket-disconnecting everyone on wake makes
      // other players appear offline until they themselves send a message.
      const livePlayerIds = new Set<string>();
      for (const ws of this.ctx.getWebSockets()) {
        const tags = this.ctx.getTags(ws);
        if (tags[0]) livePlayerIds.add(tags[0]);
      }
      for (const p of this.players.values()) {
        p.connected = livePlayerIds.has(p.id);
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
      devices: Array.from(this.players.entries()).map(([id, p]) => [id, p.devices ?? []]),
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
      // Reconnecting registered player: refresh chip balance from D1 (in lobby only,
      // never mid-hand). Resetting chipsAtLoad together with chips keeps the delta
      // at zero so the next persist writes nothing until the player actually plays.
      const parsed = parseInt(chipsHeader, 10);
      if (!isNaN(parsed) && parsed > 0 && this.phase === 'lobby') {
        existingPlayer.chips = parsed;
        existingPlayer.chipsAtLoad = parsed;
      }
    }

    await this.ctx.storage.put(`name:${userId}`, displayName);

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const roleParam = url.searchParams.get('role');
    const role: DeviceRole =
      roleParam === 'controller' || roleParam === 'table' || roleParam === 'both'
        ? roleParam
        : 'both';
    const isSpectateIntent = url.searchParams.get('spectate') === '1';
    const socketId = crypto.randomUUID();

    const acceptTags = isSpectateIntent
      ? [userId, role, socketId, 'spectate']
      : [userId, role, socketId];
    this.ctx.acceptWebSocket(server, acceptTags);

    const playerForDevice = this.players.get(userId);
    if (playerForDevice && !isSpectateIntent) {
      pushDevice(playerForDevice, makeDevice(socketId, role, Date.now()));
    }

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
      // Prune disconnected players before promoting spectators so ghosts
      // don't occupy seats.
      for (const [id, p] of this.players) {
        if (!p.connected) {
          this.players.delete(id);
        }
      }
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
    } else if (msg.type === 'leave') {
      await this.handleLeave(playerId);
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
    const socketId = tags[2];
    if (!playerId) return;
    removeDeviceShared(this.players.get(playerId), socketId);
    if (this.players.has(playerId) && hasRemainingDevicesShared(this.players.get(playerId))) {
      await this.saveState();
      return;
    }
    await this.handleDisconnect(playerId);
    await this.saveState();
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await this.loadState();
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    const socketId = tags[2];
    if (!playerId) return;
    removeDeviceShared(this.players.get(playerId), socketId);
    if (this.players.has(playerId) && hasRemainingDevicesShared(this.players.get(playerId))) {
      await this.saveState();
      return;
    }
    await this.handleDisconnect(playerId);
    await this.saveState();
  }

  async alarm(): Promise<void> {
    await this.loadState();

    // Disconnect timeout - remove timed-out players and persist their chips
    if (this.disconnectTimestamps.size > 0) {
      const now = Date.now();

      for (const [pid, ts] of this.disconnectTimestamps) {
        if (now - ts >= DISCONNECT_TIMEOUT_MS) {
          this.disconnectTimestamps.delete(pid);
          const player = this.players.get(pid);
          if (player) {
            // Persist chips atomically before removing. If the conditional
            // UPDATE fails we still drop the seat — the player has already
            // walked; the in-memory refund is moot because there's no client
            // left to notify, and the at-load baseline is the authoritative
            // value we'd have kept anyway.
            await this.persistChipDelta(pid);
            this.players.delete(pid);

            // Host promotion
            if (pid === this.hostId && this.players.size > 0) {
              const newHost = this.players.values().next().value!;
              newHost.isHost = true;
              this.hostId = newHost.id;
            }
          }
        }
      }

      if (this.players.size === 0) {
        this.phase = 'lobby';
        this.tableState = null;
        await this.removeTableRegistry();
      } else {
        await this.updateTableRegistry();
        this.broadcastState();
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

  protected async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const tags = this.ctx.getTags(ws);
    const role = (tags[1] as DeviceRole) || 'both';
    const isSpectateIntent = tags[3] === 'spectate';
    const existing = this.players.get(playerId);

    if (existing) {
      // Reconnection — re-resolve cosmetics in case loadout changed.
      // A returning player ignores spectate intent (prevents accidental self-demotion).
      this.cosmeticsCache.invalidate(playerId);
      existing.connected = true;
      this.disconnectTimestamps.delete(playerId);
      await this.resolveCosmeticsForPlayer(playerId);
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getStateFor(playerId, role),
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    if (isSpectateIntent) {
      const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
      this.spectators.set(playerId, storedName || 'Spectator');
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        isSpectator: true,
        state: this.getStateFor(playerId, role),
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

    // chipsAtLoad mirrors `chips` at the moment of seat creation so a player
    // who joins and immediately leaves persists no delta (the baseline matches).
    const player: CasinoPlayer = { id: playerId, name, connected: true, isHost, chips, chipsAtLoad: chips, isGuest };
    this.players.set(playerId, player);

    if (isHost) this.hostId = playerId;

    await this.resolveCosmeticsForPlayer(playerId);

    // Update casino_tables registry
    await this.updateTableRegistry();

    this.sendToWs(ws, {
      type: 'joined',
      playerId,
      state: this.getStateFor(playerId, role),
    });
    this.broadcastState();
    await this.saveState();
  }

  /**
   * Resolve cosmetics for a player and stash on the player record before the
   * caller broadcasts state. Guests short-circuit inside the cache/resolver
   * without a D1 hit.
   */
  protected async resolveCosmeticsForPlayer(playerId: string): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;
    try {
      const cosmetics = await this.cosmeticsCache.get(playerId, this.env.DB);
      const p = this.players.get(playerId);
      if (!p) return;
      p.frameSvg = cosmetics.frameSvg;
      p.emblemSvg = cosmetics.emblemSvg;
      p.nameColour = cosmetics.nameColour;
      p.titleBadgeId = cosmetics.titleBadgeId;
      p.titleText = cosmetics.titleText;
    } catch (err) {
      console.error('resolveCosmeticsForPlayer failed', { playerId, err });
    }
  }

  private async handleDisconnect(playerId: string): Promise<void> {
    if (this.spectators.has(playerId)) {
      // Multi-socket guard: only delete the spectator entry when no remaining
      // sockets exist for this user.
      if (this.ctx.getWebSockets(playerId).length === 0) {
        this.spectators.delete(playerId);
        this.broadcastState();
      }
      return;
    }

    const player = this.players.get(playerId);
    if (!player) return;

    this.cosmeticsCache.invalidate(playerId);

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

  private async handleLeave(playerId: string): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    // Persist chips atomically before removing. Same rationale as the alarm
    // path: if the conditional UPDATE fails we drop the seat anyway; the
    // player chose to leave.
    await this.persistChipDelta(playerId);

    this.players.delete(playerId);
    this.disconnectTimestamps.delete(playerId);

    // Host promotion
    if (playerId === this.hostId && this.players.size > 0) {
      const newHost = this.players.values().next().value!;
      newHost.isHost = true;
      this.hostId = newHost.id;
    }

    // If no players left, reset to lobby
    if (this.players.size === 0) {
      this.phase = 'lobby';
      this.tableState = null;
      await this.removeTableRegistry();
    } else {
      await this.updateTableRegistry();
    }

    this.broadcastState();
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
    // Reject NaN / Infinity / non-integer / non-positive bets BEFORE any
    // numeric comparison — NaN comparisons all return false so an unguarded
    // amount silently passes every gate and poisons player_profiles.chips
    // (NaN/Infinity propagated through `player.chips -= amount`).
    if (!Number.isInteger(amount) || amount <= 0) return false;
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

  /**
   * Persist a single player's chip delta atomically. Returns true on success
   * (or no-op when delta === 0), false when the conditional UPDATE matched zero
   * rows (the player's true balance went below what the delta would consume —
   * race with another DO, typically). On false the caller MUST refund in-memory
   * and notify the player; this helper does NOT touch player.chips on failure.
   *
   * No-op for guests; their chips are session-only.
   */
  protected async persistChipDelta(playerId: string): Promise<boolean> {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (player.isGuest || playerId.startsWith('guest_')) return true;
    const baseline = player.chipsAtLoad ?? player.chips;
    const delta = player.chips - baseline;
    if (delta === 0) return true;
    const now = Math.floor(Date.now() / 1000);
    try {
      const result = await this.env.DB.prepare(
        'UPDATE player_profiles SET chips = chips + ?, updated_at = ? WHERE id = ? AND chips + ? >= 0'
      ).bind(delta, now, playerId, delta).run();
      const meta = (result as { meta?: { changes?: number; rows_written?: number } })?.meta;
      const changes = meta?.changes ?? meta?.rows_written ?? 0;
      if (changes > 0) {
        player.chipsAtLoad = player.chips;
        return true;
      }
      return false;
    } catch (err) {
      console.error('persistChipDelta failed', { playerId, delta, err });
      return false;
    }
  }

  /**
   * Persist all seated players' chip deltas. Iterates per-player rather than
   * batching because each row's success/failure is independent and a bust on
   * one player must not roll back another's settlement.
   */
  protected async persistChips(): Promise<void> {
    for (const [id, player] of this.players) {
      if (player.isGuest || id.startsWith('guest_')) continue;
      const ok = await this.persistChipDelta(id);
      if (!ok) {
        // Refund in memory + notify the player. The next round seeds from the
        // restored baseline so play continues correctly at the true balance.
        player.chips = player.chipsAtLoad ?? player.chips;
        this.sendTo(id, { type: 'error', message: 'Chip persistence failed — settled at previous balance' });
      }
    }
  }

  protected async recordCasinoRound(profitedPlayerIds: string[]): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];
      const levelUpMap = new Map<string, { grants: Awaited<ReturnType<typeof checkLevelGrants>>['grants']; newXp: number; xpGain: number }>();
      const xpGainedMap = new Map<string, { xpGain: number; newXp: number }>();

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
        const { grants: casinoGrants, stmts: grantStmts, newXp: casinoNewXp } = await checkLevelGrants(db, id, xpGain);
        xpGainedMap.set(id, { xpGain, newXp: casinoNewXp });
        if (casinoGrants.length > 0) levelUpMap.set(id, { grants: casinoGrants, newXp: casinoNewXp, xpGain });
        stmts.push(...grantStmts);
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

      // Send xp_gained to every player, then level_up if applicable
      for (const [id, { xpGain, newXp }] of xpGainedMap) {
        this.sendTo(id, { type: 'xp_gained', amount: xpGain, newXp });
      }
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

      // Degenerate Gambler badge: 100+ casino games
      for (const [id, player] of this.players) {
        if (player.isGuest || id.startsWith('guest_')) continue;
        try {
          const profile = await db.prepare('SELECT games_played FROM player_profiles WHERE id = ?').bind(id).first<{ games_played: number }>();
          if (profile && profile.games_played >= 100) {
            await db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)').bind(id, 'b_degen_gambler', now).run();
          }
        } catch {}
      }
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
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    } catch {}
  }

  protected sendTo(playerId: string, msg: object, role?: DeviceRole): void {
    for (const ws of this.ctx.getWebSockets(playerId)) {
      if (role) {
        const tags = this.ctx.getTags(ws);
        if (tags[1] !== role) continue;
      }
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
    // Cache payloads per (playerId, role) so paired devices on the same user
    // don't recompute the same redacted state twice.
    const cache = new Map<string, CasinoGameState>();
    for (const ws of this.ctx.getWebSockets()) {
      const tags = this.ctx.getTags(ws);
      const pid = tags[0];
      if (!pid) continue;
      const role = (tags[1] as DeviceRole) || 'both';
      const key = `${pid}:${role}`;
      let state = cache.get(key);
      if (!state) {
        state = this.getStateFor(pid, role);
        if (spectatorList) state.spectators = spectatorList;
        cache.set(key, state);
      }
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
