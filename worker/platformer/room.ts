import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import { CosmeticsCache } from '../shared/cosmetics';
import { checkLevelGrants } from '../shared/levelRewards';
import { xpToLevel } from '../../src/lib/xp';
import {
  defaultMap, stepPlayer, resolveAttack, applyKnockback, isOutOfBounds,
  newPlayer, emptyInput, respawnPosition,
  RESPAWN_MS, MAX_JUMPS,
} from './physics';
import type {
  PlatformerInput, PlatformerPlayer, PlatformerSnapshot, PlatformerPhase, MapDef,
} from './types';

const MAX_MESSAGE_SIZE = 2048;
const MAX_NAME_LENGTH = 20;
const MAX_PLAYERS = 4;
const ROUNDS_TO_WIN = 2;
const STARTING_LIVES = 3;
const ROOM_EXPIRY_MS = 30 * 60 * 1000;
const RECONNECT_TIMEOUT_MS = 45 * 1000;
const RATE_WINDOW_MS = 1000;
const RATE_MAX_MESSAGES = 80;
const SIM_ALARM_MS = 66;

interface PersistedRoom {
  code: string;
  phase: PlatformerPhase;
  hostId: string;
  players: [string, PlatformerPlayer][];
  scores: [string, number][];
  inputs: [string, PlatformerInput][];
  prevInputs: [string, PlatformerInput][];
  tick: number;
  roundEndsAt: number;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  lastActivity: number;
}

type ServerMessage =
  | { type: 'joined'; playerId: string; snapshot: PlatformerSnapshot; isSpectator?: boolean }
  | { type: 'snapshot'; snapshot: PlatformerSnapshot }
  | { type: 'round_over'; winnerId: string | null; scores: Record<string, number> }
  | { type: 'match_over'; winnerId: string | null }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'level_up'; newLevel: number; rewards: { name: string; type: string; tier: 'hero' | 'minor' }[] }
  | { type: 'xp_gained'; amount: number; newXp: number };

interface ClientMessage {
  type: string;
  [key: string]: unknown;
}

function sanitizeText(text: string, maxLength: number): string {
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}

export class PlatformerRoom extends DurableObject<Env> {
  private initialized = false;
  private code = '';
  private phase: PlatformerPhase = 'lobby';
  private hostId = '';
  private players = new Map<string, PlatformerPlayer>();
  private scores = new Map<string, number>();
  private inputs = new Map<string, PlatformerInput>();
  private prevInputs = new Map<string, PlatformerInput>();
  private tick = 0;
  private lastTickAt = 0;
  private roundEndsAt = 0;
  private roundWinnerId: string | null = null;
  private matchWinnerId: string | null = null;
  private lastActivity = Date.now();
  private rateLimits = new Map<string, number[]>();
  private disconnectTimestamps = new Map<string, number>();
  private cosmeticsCache = new CosmeticsCache();
  private map: MapDef = defaultMap();

  private async loadState(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const stored = await this.ctx.storage.get<PersistedRoom>('room');
    if (stored) {
      this.code = stored.code;
      this.phase = stored.phase;
      this.hostId = stored.hostId;
      this.players = new Map(stored.players);
      this.scores = new Map(stored.scores);
      this.inputs = new Map(stored.inputs);
      this.prevInputs = new Map(stored.prevInputs);
      this.tick = stored.tick;
      this.roundEndsAt = stored.roundEndsAt;
      this.roundWinnerId = stored.roundWinnerId;
      this.matchWinnerId = stored.matchWinnerId;
      this.lastActivity = stored.lastActivity;

      const live = new Set<string>();
      for (const ws of this.ctx.getWebSockets()) {
        const tags = this.ctx.getTags(ws);
        if (tags[0]) live.add(tags[0]);
      }
      for (const [id, p] of this.players) {
        p.connected = live.has(id);
      }
    }
  }

  private async saveState(): Promise<void> {
    const data: PersistedRoom = {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: Array.from(this.players.entries()),
      scores: Array.from(this.scores.entries()),
      inputs: Array.from(this.inputs.entries()),
      prevInputs: Array.from(this.prevInputs.entries()),
      tick: this.tick,
      roundEndsAt: this.roundEndsAt,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      lastActivity: this.lastActivity,
    };
    try {
      await this.ctx.storage.put('room', data);
    } catch {}
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }

  async fetch(request: Request): Promise<Response> {
    await this.loadState();
    const url = new URL(request.url);
    const roomCode = url.searchParams.get('room')?.toUpperCase() || '';
    if (!this.code) this.code = roomCode;

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json({
        code: this.code,
        phase: this.phase,
        playerCount: this.players.size,
      });
    }

    const userId = request.headers.get('X-User-Id');
    const displayName = request.headers.get('X-Display-Name');
    const isGuest = request.headers.get('X-Is-Guest') === 'true';
    if (!userId || !displayName) {
      return new Response('Missing user info', { status: 400 });
    }

    try {
      await this.ctx.storage.put(`name:${userId}`, displayName);
      await this.ctx.storage.put(`guest:${userId}`, isGuest);
    } catch {}

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server, [userId]);
    this.touch();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.loadState();
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const tags = this.ctx.getTags(ws);
    const playerId = tags[0];
    if (!playerId) return;

    if (this.isRateLimited(playerId)) return;
    if (raw.length > MAX_MESSAGE_SIZE) {
      this.sendToWs(ws, { type: 'error', message: 'Message too large' });
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
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
    await this.handleGameMessage(playerId, msg);
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

    if (this.disconnectTimestamps.size > 0) {
      let changed = false;
      for (const [pid, t] of this.disconnectTimestamps) {
        if (now - t >= RECONNECT_TIMEOUT_MS) {
          this.disconnectTimestamps.delete(pid);
          const p = this.players.get(pid);
          if (p && !p.connected) {
            if (this.phase === 'lobby') {
              this.players.delete(pid);
              this.scores.delete(pid);
              this.inputs.delete(pid);
              this.prevInputs.delete(pid);
            }
            if (pid === this.hostId) this.promoteNewHost(pid);
            changed = true;
          }
        }
      }
      if (changed) {
        if (this.players.size === 0) {
          await this.ctx.storage.deleteAll();
          this.initialized = false;
          return;
        }
        this.broadcastSnapshot();
      }
    }

    if (this.phase === 'playing') {
      const last = this.lastTickAt || now - SIM_ALARM_MS;
      const dt = Math.min(150, now - last);
      this.lastTickAt = now;
      this.simulateStep(dt);
      this.broadcastSnapshot();
      this.checkRoundOver();
    }

    if (now - this.lastActivity > ROOM_EXPIRY_MS) {
      for (const ws of this.ctx.getWebSockets()) {
        try {
          this.sendToWs(ws, { type: 'error', message: 'Room expired due to inactivity' });
          ws.close(1000, 'Room expired');
        } catch {}
      }
      await this.ctx.storage.deleteAll();
      this.initialized = false;
      return;
    }

    if (this.phase === 'playing' || this.disconnectTimestamps.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + SIM_ALARM_MS);
    } else {
      await this.scheduleExpireAlarm();
    }

    await this.saveState();
  }

  private async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const existing = this.players.get(playerId);
    if (existing) {
      this.cosmeticsCache.invalidate(playerId);
      existing.connected = true;
      this.disconnectTimestamps.delete(playerId);
      await this.resolveCosmeticsForPlayer(playerId);
      this.sendToWs(ws, { type: 'joined', playerId, snapshot: this.snapshot() });
      this.broadcastSnapshot();
      await this.saveState();
      return;
    }

    if (this.phase !== 'lobby') {
      this.sendToWs(ws, { type: 'error', message: 'Game in progress' });
      return;
    }
    if (this.players.size >= MAX_PLAYERS) {
      this.sendToWs(ws, { type: 'error', message: `Room is full (max ${MAX_PLAYERS})` });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const storedGuest = await this.ctx.storage.get<boolean>(`guest:${playerId}`);
    const name = sanitizeText(storedName || 'Player', MAX_NAME_LENGTH);

    const idx = this.players.size;
    const spawn = respawnPosition(this.map, idx);
    const player = newPlayer(playerId, name, spawn, storedGuest ?? false);
    player.invulnMs = 0;

    this.players.set(playerId, player);
    this.scores.set(playerId, 0);
    this.inputs.set(playerId, emptyInput(0));
    this.prevInputs.set(playerId, emptyInput(0));

    if (this.players.size === 1) this.hostId = playerId;
    await this.resolveCosmeticsForPlayer(playerId);

    this.sendToWs(ws, { type: 'joined', playerId, snapshot: this.snapshot() });
    this.broadcastSnapshot();
    await this.saveState();
  }

  private async resolveCosmeticsForPlayer(playerId: string): Promise<void> {
    const p = this.players.get(playerId);
    if (!p) return;
    try {
      const c = await this.cosmeticsCache.get(playerId, this.env.DB);
      const cur = this.players.get(playerId);
      if (!cur) return;
      cur.frameSvg = c.frameSvg;
      cur.emblemSvg = c.emblemSvg;
      cur.nameColour = c.nameColour;
      cur.titleBadgeId = c.titleBadgeId;
    } catch {}
  }

  private handleDisconnect(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.cosmeticsCache.invalidate(playerId);
    if (this.phase === 'lobby') {
      this.players.delete(playerId);
      this.scores.delete(playerId);
      this.inputs.delete(playerId);
      this.prevInputs.delete(playerId);
      if (playerId === this.hostId && this.players.size > 0) {
        this.promoteNewHost(playerId);
      }
    } else {
      p.connected = false;
      this.disconnectTimestamps.set(playerId, Date.now());
      this.scheduleAlarm();
    }
    if (this.players.size === 0) return;
    this.broadcastSnapshot();
  }

  private promoteNewHost(oldHostId: string): void {
    for (const [id, p] of this.players) {
      if (id !== oldHostId && p.connected) {
        this.hostId = id;
        return;
      }
    }
    const first = this.players.keys().next();
    if (!first.done) this.hostId = first.value;
  }

  private async handleGameMessage(playerId: string, msg: ClientMessage): Promise<void> {
    switch (msg.type) {
      case 'input': {
        const cur = this.inputs.get(playerId);
        const seq = typeof msg.seq === 'number' ? msg.seq : 0;
        if (cur && seq < cur.seq) break;
        const next: PlatformerInput = {
          left: !!msg.left,
          right: !!msg.right,
          jump: !!msg.jump,
          attack: !!msg.attack,
          seq,
        };
        this.inputs.set(playerId, next);
        break;
      }
      case 'start_game': {
        if (playerId !== this.hostId) {
          this.sendTo(playerId, { type: 'error', message: 'Only the host can start the game' });
          break;
        }
        if (this.players.size < 2) {
          this.sendTo(playerId, { type: 'error', message: 'Need at least 2 players' });
          break;
        }
        this.startMatch();
        await this.scheduleAlarm();
        this.broadcastSnapshot();
        break;
      }
      case 'play_again': {
        if (playerId !== this.hostId) break;
        if (this.phase !== 'round_over' && this.phase !== 'game_over') break;
        if (this.phase === 'game_over') {
          this.resetMatch();
        } else {
          this.startRound();
          await this.scheduleAlarm();
        }
        this.broadcastSnapshot();
        break;
      }
      case 'leave': {
        this.handleDisconnect(playerId);
        break;
      }
    }
    await this.saveState();
  }

  private startMatch(): void {
    for (const id of this.players.keys()) this.scores.set(id, 0);
    this.matchWinnerId = null;
    this.startRound();
  }

  private resetMatch(): void {
    this.phase = 'lobby';
    for (const id of this.players.keys()) this.scores.set(id, 0);
    this.roundWinnerId = null;
    this.matchWinnerId = null;
    this.tick = 0;
  }

  private startRound(): void {
    this.phase = 'playing';
    this.roundWinnerId = null;
    this.tick = 0;
    this.lastTickAt = Date.now();
    this.roundEndsAt = Date.now() + 90_000;
    let i = 0;
    for (const [id, p] of this.players) {
      const spawn = respawnPosition(this.map, i++);
      const fresh = newPlayer(id, p.name, spawn, p.isGuest);
      fresh.connected = p.connected;
      fresh.frameSvg = p.frameSvg;
      fresh.emblemSvg = p.emblemSvg;
      fresh.nameColour = p.nameColour;
      fresh.titleBadgeId = p.titleBadgeId;
      fresh.lives = STARTING_LIVES;
      this.players.set(id, fresh);
      this.inputs.set(id, emptyInput(0));
      this.prevInputs.set(id, emptyInput(0));
    }
  }

  private simulateStep(dtMs: number): void {
    this.tick += 1;
    const stepDt = Math.min(dtMs, 100);

    for (const [id, p] of this.players) {
      if (!p.connected || p.lives <= 0) continue;
      const input = this.inputs.get(id) ?? emptyInput(0);
      const prev = this.prevInputs.get(id) ?? emptyInput(0);
      const next = stepPlayer(p, input, prev, stepDt, this.map);
      this.players.set(id, next);
      this.prevInputs.set(id, input);
    }

    const attackers: PlatformerPlayer[] = [];
    for (const p of this.players.values()) {
      if (p.attackActiveMs > 0 && p.lives > 0) attackers.push(p);
    }
    if (attackers.length > 0) {
      const defenders = Array.from(this.players.values());
      for (const attacker of attackers) {
        const result = resolveAttack(attacker, defenders);
        for (const hit of result.hits) {
          const def = this.players.get(hit.id);
          if (!def) continue;
          this.players.set(hit.id, applyKnockback(def, hit.knockbackX, hit.knockbackY));
        }
      }
    }

    for (const [id, p] of this.players) {
      if (p.lives <= 0) continue;
      if (p.respawnMs > 0) continue;
      if (isOutOfBounds(p, this.map)) {
        const newLives = p.lives - 1;
        if (newLives <= 0) {
          this.players.set(id, { ...p, lives: 0, vx: 0, vy: 0, x: -9999, y: -9999, respawnMs: 0 });
        } else {
          const spawn = respawnPosition(this.map, Array.from(this.players.keys()).indexOf(id));
          this.players.set(id, {
            ...p,
            lives: newLives,
            x: spawn.x, y: spawn.y, vx: 0, vy: 0,
            attackActiveMs: 0, attackCooldownMs: 0,
            respawnMs: RESPAWN_MS,
            invulnMs: RESPAWN_MS + 800,
            onGround: false,
            jumpsRemaining: MAX_JUMPS,
          });
        }
      }
    }
  }

  private checkRoundOver(): void {
    if (this.phase !== 'playing') return;
    const alive = Array.from(this.players.values()).filter(p => p.lives > 0);
    const timeUp = Date.now() >= this.roundEndsAt;

    if (alive.length <= 1 || timeUp) {
      let winner: PlatformerPlayer | null = null;
      if (alive.length === 1) {
        winner = alive[0];
      } else if (alive.length > 1 && timeUp) {
        winner = alive.reduce((best, p) => p.lives > best.lives ? p : best, alive[0]);
      }
      const winnerId = winner?.id ?? null;
      this.roundWinnerId = winnerId;
      this.phase = 'round_over';
      if (winnerId) {
        this.scores.set(winnerId, (this.scores.get(winnerId) ?? 0) + 1);
      }
      const scores: Record<string, number> = {};
      for (const [id, s] of this.scores) scores[id] = s;
      this.broadcast({ type: 'round_over', winnerId, scores });
      this.broadcastSnapshot();

      const matchWinnerId = this.findMatchWinner();
      if (matchWinnerId) {
        this.matchWinnerId = matchWinnerId;
        this.phase = 'game_over';
        this.broadcast({ type: 'match_over', winnerId: matchWinnerId });
        this.broadcastSnapshot();
        this.recordMatchEnd(matchWinnerId).catch(() => {});
      }
    }
  }

  private findMatchWinner(): string | null {
    for (const [id, s] of this.scores) {
      if (s >= ROUNDS_TO_WIN) return id;
    }
    return null;
  }

  private async recordMatchEnd(winnerId: string): Promise<void> {
    try {
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];
      const xpGainedMap = new Map<string, { xpGain: number; newXp: number }>();
      const levelUpMap = new Map<string, { grants: Awaited<ReturnType<typeof checkLevelGrants>>['grants']; newXp: number; xpGain: number }>();
      const now = Math.floor(Date.now() / 1000);

      for (const [id, p] of this.players) {
        if (p.isGuest || id.startsWith('guest_')) continue;
        const xpGain = id === winnerId ? 100 : 50;
        const { grants, stmts: gstmts, newXp } = await checkLevelGrants(db, id, xpGain);
        xpGainedMap.set(id, { xpGain, newXp });
        if (grants.length > 0) levelUpMap.set(id, { grants, newXp, xpGain });
        stmts.push(...gstmts);
        stmts.push(
          db.prepare('UPDATE player_profiles SET xp = xp + ?, games_played = games_played + 1, updated_at = ? WHERE id = ?')
            .bind(xpGain, now, id),
        );
        if (id === winnerId) {
          stmts.push(
            db.prepare('UPDATE player_profiles SET games_won = games_won + 1, updated_at = ? WHERE id = ?')
              .bind(now, id),
          );
        }
      }

      if (stmts.length > 0) await db.batch(stmts);

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
    } catch {}
  }

  private snapshot(): PlatformerSnapshot {
    const scoresObj: Record<string, number> = {};
    for (const [id, s] of this.scores) scoresObj[id] = s;
    return {
      tick: this.tick,
      phase: this.phase,
      players: Array.from(this.players.values()).map(p => ({ ...p })),
      roundEndsAt: this.roundEndsAt,
      roundWinnerId: this.roundWinnerId,
      matchWinnerId: this.matchWinnerId,
      hostId: this.hostId,
      code: this.code,
      scores: scoresObj,
    };
  }

  private broadcastSnapshot(): void {
    const snap = this.snapshot();
    for (const ws of this.ctx.getWebSockets()) {
      this.sendToWs(ws, { type: 'snapshot', snapshot: snap });
    }
  }

  private sendToWs(ws: WebSocket, msg: ServerMessage): void {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    } catch {}
  }

  private sendTo(playerId: string, msg: ServerMessage): void {
    const sockets = this.ctx.getWebSockets(playerId);
    for (const ws of sockets) this.sendToWs(ws, msg);
  }

  private broadcast(msg: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets()) this.sendToWs(ws, msg);
  }

  private isRateLimited(playerId: string): boolean {
    const now = Date.now();
    let stamps = this.rateLimits.get(playerId);
    if (!stamps) {
      stamps = [];
      this.rateLimits.set(playerId, stamps);
    }
    while (stamps.length > 0 && stamps[0] < now - RATE_WINDOW_MS) stamps.shift();
    if (stamps.length >= RATE_MAX_MESSAGES) return true;
    stamps.push(now);
    return false;
  }

  private async scheduleAlarm(): Promise<void> {
    const next = Date.now() + SIM_ALARM_MS;
    const existing = await this.ctx.storage.getAlarm();
    if (!existing || next < existing) {
      await this.ctx.storage.setAlarm(next);
    }
  }

  private async scheduleExpireAlarm(): Promise<void> {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_EXPIRY_MS);
    }
  }
}
