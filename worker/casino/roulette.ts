import { CasinoRoom } from './casinoRoom';
import type { CasinoAction, CasinoGameState } from './types';

type BetType = 'red' | 'black' | 'green';

interface RouletteBet {
  type: BetType;
  amount: number;
}

interface RouletteTableState {
  playerBets: Record<string, RouletteBet[]>;
  result: string | null;
  resultSlotIndex: number | null;
  history: string[];
  payouts: Record<string, number> | null;
  betTotals: Record<string, number>;
  bettingEndsAt: number;
  displayEndsAt: number;
}

const PAYOUT_MULTIPLIERS: Record<BetType, number> = {
  red: 1,
  black: 1,
  green: 13,
};

// 15-slot weighted array matching frontend strip pattern: 7 red, 7 black, 1 green
const WHEEL: BetType[] = [
  'red', 'black', 'red', 'black', 'red', 'black', 'red', 'black',
  'red', 'black', 'red', 'black', 'red', 'green', 'black',
];

const VALID_BET_TYPES = new Set<string>(['red', 'black', 'green']);
const BETTING_DURATION_MS = 30_000;
const RESULT_DISPLAY_MS = 8_000;
const DEFAULT_BUY_IN = 1000;
const DISCONNECT_TIMEOUT_MS = 30_000;
const ROOM_EXPIRY_MS = 30 * 60 * 1000;

export class RouletteRoom extends CasinoRoom {
  protected get gameType(): string { return 'roulette'; }
  protected get maxSeats(): number { return 50; }

  private getTable(): RouletteTableState {
    if (!this.tableState) return this.defaultTable();
    const ts = this.tableState as Partial<RouletteTableState>;
    // Ensure new fields have defaults for backward compatibility
    if (ts.bettingEndsAt === undefined) ts.bettingEndsAt = 0;
    if (ts.displayEndsAt === undefined) ts.displayEndsAt = 0;
    return ts as RouletteTableState;
  }

  private setTable(table: RouletteTableState): void {
    this.tableState = table;
  }

  private defaultTable(): RouletteTableState {
    return {
      playerBets: {},
      result: null,
      resultSlotIndex: null,
      history: [],
      payouts: null,
      betTotals: {},
      bettingEndsAt: 0,
      displayEndsAt: 0,
    };
  }

  protected initRound(): void {
    const ts = this.getTable();
    ts.playerBets = {};
    ts.result = null;
    ts.resultSlotIndex = null;
    ts.payouts = null;
    ts.betTotals = {};
    this.setTable(ts);
  }

  // Override: always allow joining (single shared table, no spectators)
  protected async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const existing = this.players.get(playerId);

    if (existing) {
      this.cosmeticsCache.invalidate(playerId);
      existing.connected = true;
      this.disconnectTimestamps.delete(playerId);
      await this.resolveCosmeticsForPlayer(playerId);
      this.sendToWs(ws, {
        type: 'joined',
        playerId,
        state: this.getGameStateForPlayer(playerId),
      });
      this.broadcastState();
      await this.saveState();
      return;
    }

    if (this.players.size >= this.maxSeats) {
      this.sendToWs(ws, { type: 'error', message: 'Table is full' });
      return;
    }

    const storedName = await this.ctx.storage.get<string>(`name:${playerId}`);
    const name = storedName || 'Player';
    const chips = await this.ctx.storage.get<number>(`chips:${playerId}`) ?? DEFAULT_BUY_IN;
    const isGuest = await this.ctx.storage.get<boolean>(`guest:${playerId}`) ?? playerId.startsWith('guest_');
    const isHost = this.players.size === 0 || !this.hostId;

    const player = { id: playerId, name, connected: true, isHost, chips, isGuest };
    this.players.set(playerId, player);
    if (isHost) this.hostId = playerId;

    await this.resolveCosmeticsForPlayer(playerId);

    // Auto-start game when first player joins an idle table
    if (this.phase === 'lobby') {
      this.phase = 'betting';
      this.roundNumber = 1;
      this.initRound();
      const ts = this.getTable();
      ts.bettingEndsAt = Date.now() + BETTING_DURATION_MS;
      this.setTable(ts);

      try {
        this.gameSessionId = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);
        await this.env.DB.prepare(
          'INSERT INTO game_sessions (id, game_type, room_code, player_count, started_at) VALUES (?, ?, ?, ?, ?)'
        ).bind(this.gameSessionId, this.gameType, this.code, this.players.size, now).run();
      } catch {}

      await this.scheduleNextAlarm();
    }

    await this.updateTableRegistry();
    this.sendToWs(ws, {
      type: 'joined',
      playerId,
      state: this.getGameStateForPlayer(playerId),
    });
    this.broadcastState();
    await this.saveState();
  }

  protected async handlePlayerAction(playerId: string, action: CasinoAction): Promise<void> {
    const ts = this.getTable();

    if (action.type === 'place_bet') {
      if (this.phase !== 'betting') {
        this.sendTo(playerId, { type: 'error', message: 'Betting is closed' });
        return;
      }

      const bet = (action as CasinoAction & { bet: RouletteBet }).bet;
      if (!bet || !this.validateBet(bet)) {
        this.sendTo(playerId, { type: 'error', message: 'Invalid bet' });
        return;
      }

      if (!this.placeBet(playerId, bet.amount)) {
        this.sendTo(playerId, { type: 'error', message: 'Insufficient chips' });
        return;
      }

      if (!ts.playerBets[playerId]) {
        ts.playerBets[playerId] = [];
        ts.betTotals[playerId] = 0;
      }
      ts.playerBets[playerId].push(bet);
      ts.betTotals[playerId] += bet.amount;
      this.setTable(ts);
      this.broadcastState();
      return;
    }

    if (action.type === 'clear_bets') {
      if (this.phase !== 'betting') return;
      const bets = ts.playerBets[playerId];
      if (bets) {
        const total = bets.reduce((sum, b) => sum + b.amount, 0);
        this.awardChips(playerId, total);
        delete ts.playerBets[playerId];
        delete ts.betTotals[playerId];
        this.setTable(ts);
        this.broadcastState();
      }
      return;
    }
  }

  private validateBet(bet: RouletteBet): boolean {
    if (!bet.type || !VALID_BET_TYPES.has(bet.type)) return false;
    if (bet.amount < this.minBet) return false;
    return true;
  }

  protected async startNewRound(): Promise<void> {
    this.roundNumber++;
    this.phase = 'betting';
    this.initRound();
    const ts = this.getTable();
    ts.bettingEndsAt = Date.now() + BETTING_DURATION_MS;
    ts.displayEndsAt = 0;
    this.setTable(ts);
    this.broadcastState();
    await this.scheduleNextAlarm();
  }

  protected async resolveRound(): Promise<void> {
    const ts = this.getTable();

    // Pick random slot from 15-element weighted wheel
    const randomBytes = crypto.getRandomValues(new Uint32Array(1));
    const slotIndex = randomBytes[0] % 15;
    const result = WHEEL[slotIndex];

    ts.result = result;
    ts.resultSlotIndex = slotIndex;
    ts.payouts = {};
    const profitedPlayers: string[] = [];
    const netWinByPlayer: Record<string, number> = {};

    for (const [playerId, bets] of Object.entries(ts.playerBets)) {
      let totalPayout = 0;
      let totalStaked = 0;

      for (const bet of bets) {
        totalStaked += bet.amount;
        if (bet.type === result) {
          const multiplier = PAYOUT_MULTIPLIERS[bet.type];
          const payout = bet.amount + bet.amount * multiplier;
          totalPayout += payout;
        }
      }

      ts.payouts[playerId] = totalPayout;
      netWinByPlayer[playerId] = totalPayout - totalStaked;
      if (totalPayout > 0) {
        this.awardChips(playerId, totalPayout);
        profitedPlayers.push(playerId);
      }
    }

    // Record biggest_win per player for this spin (net win after subtracting all stakes)
    try {
      const stmts: D1PreparedStatement[] = [];
      for (const [pid, netWin] of Object.entries(netWinByPlayer)) {
        if (netWin <= 0) continue;
        const player = this.players.get(pid);
        if (!player || player.isGuest || pid.startsWith('guest_')) continue;
        stmts.push(
          this.env.DB.prepare(
            'UPDATE player_profiles SET biggest_win = ?, biggest_win_game = ? WHERE id = ? AND biggest_win < ?'
          ).bind(netWin, 'roulette', pid, netWin)
        );
      }
      if (stmts.length > 0) await this.env.DB.batch(stmts);
    } catch {}

    // Track history (last 20 results)
    ts.history.unshift(result);
    if (ts.history.length > 20) ts.history.pop();

    // Roulette winner badge
    for (const id of profitedPlayers) {
      const player = this.players.get(id);
      if (player && !player.isGuest && !id.startsWith('guest_')) {
        try {
          const now = Math.floor(Date.now() / 1000);
          await this.env.DB.prepare(
            'INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)'
          ).bind(id, 'b_roulette_win', now).run();
        } catch {}
      }
    }

    // High roller badge
    for (const [playerId, total] of Object.entries(ts.betTotals)) {
      if (total >= 500) {
        const player = this.players.get(playerId);
        if (player && !player.isGuest && !playerId.startsWith('guest_')) {
          try {
            const now = Math.floor(Date.now() / 1000);
            await this.env.DB.prepare(
              'INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)'
            ).bind(playerId, 'b_high_roller', now).run();
          } catch {}
        }
      }
    }

    this.phase = 'round_over';
    ts.bettingEndsAt = 0;
    ts.displayEndsAt = Date.now() + RESULT_DISPLAY_MS;
    this.setTable(ts);

    await this.persistChips();
    await this.recordCasinoRound(profitedPlayers);
    await this.updateTableRegistry();
  }

  // Override alarm to handle roulette auto-timers + disconnect + expiry
  async alarm(): Promise<void> {
    await this.loadState();
    const now = Date.now();

    // Keep room alive while players are connected
    if (this.players.size > 0) {
      this.lastActivity = now;
    }

    // Auto-spin when betting timer expires
    if (this.phase === 'betting' && this.players.size > 0) {
      const ts = this.getTable();
      if (ts.bettingEndsAt > 0 && now >= ts.bettingEndsAt) {
        const hasBets = Object.keys(ts.playerBets).length > 0;
        if (hasBets) {
          this.phase = 'resolving';
          this.broadcastState();
          await this.resolveRound();
          this.broadcastState();
        } else {
          // No bets placed, restart betting timer
          ts.bettingEndsAt = now + BETTING_DURATION_MS;
          this.setTable(ts);
          this.broadcastState();
        }
        await this.saveState();
      }
    }

    // Auto-advance from round_over to next betting round
    if (this.phase === 'round_over' && this.players.size > 0) {
      const ts = this.getTable();
      if (ts.displayEndsAt > 0 && now >= ts.displayEndsAt) {
        await this.startNewRound();
        await this.saveState();
      }
    }

    // Disconnect timeout handling
    if (this.disconnectTimestamps.size > 0) {
      const nowSec = Math.floor(now / 1000);
      const stmts: D1PreparedStatement[] = [];

      for (const [pid, dcTime] of this.disconnectTimestamps) {
        if (now - dcTime >= DISCONNECT_TIMEOUT_MS) {
          this.disconnectTimestamps.delete(pid);
          const player = this.players.get(pid);
          if (player) {
            if (!player.isGuest && !pid.startsWith('guest_')) {
              stmts.push(
                this.env.DB.prepare('UPDATE player_profiles SET chips = ?, updated_at = ? WHERE id = ?')
                  .bind(player.chips, nowSec, pid)
              );
            }
            this.players.delete(pid);
            if (pid === this.hostId && this.players.size > 0) {
              const newHost = this.players.values().next().value!;
              newHost.isHost = true;
              this.hostId = newHost.id;
            }
          }
        }
      }

      if (stmts.length > 0) {
        try { await this.env.DB.batch(stmts); } catch {}
      }

      if (this.players.size === 0) {
        this.phase = 'lobby';
        this.tableState = null;
        await this.removeTableRegistry();
      } else {
        await this.updateTableRegistry();
        this.broadcastState();
      }

      await this.saveState();
    }

    // Room expiry (only when no players)
    if (this.players.size === 0 && now - this.lastActivity > ROOM_EXPIRY_MS) {
      try {
        await this.env.DB.prepare('DELETE FROM casino_tables WHERE code = ?').bind(this.code).run();
      } catch {}
      for (const ws of this.ctx.getWebSockets()) {
        try {
          this.sendToWs(ws, { type: 'error', message: 'Room expired' });
          ws.close(1000, 'Room expired');
        } catch {}
      }
      await this.ctx.storage.deleteAll();
      return;
    }

    await this.scheduleNextAlarm();
  }

  private async scheduleNextAlarm(): Promise<void> {
    const now = Date.now();
    let soonest = this.lastActivity + ROOM_EXPIRY_MS;
    const ts = this.getTable();

    if (this.phase === 'betting' && ts.bettingEndsAt > 0) {
      soonest = Math.min(soonest, ts.bettingEndsAt);
    }
    if (this.phase === 'round_over' && ts.displayEndsAt > 0) {
      soonest = Math.min(soonest, ts.displayEndsAt);
    }
    for (const dcTs of this.disconnectTimestamps.values()) {
      soonest = Math.min(soonest, dcTs + DISCONNECT_TIMEOUT_MS);
    }

    await this.ctx.storage.setAlarm(Math.max(soonest, now + 100));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await super.webSocketClose(ws, code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await super.webSocketError(ws, error);
  }

  protected getGameStateForPlayer(playerId: string): CasinoGameState {
    const ts = this.getTable();
    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      connected: p.connected,
      isHost: p.isHost,
      frameSvg: p.frameSvg ?? null,
      emblemSvg: p.emblemSvg ?? null,
      nameColour: p.nameColour ?? null,
      titleBadgeId: p.titleBadgeId ?? null,
    }));

    return {
      code: this.code,
      phase: this.phase,
      players,
      roundNumber: this.roundNumber,
      minBet: this.minBet,
      maxBet: this.maxBet,
      tableState: {
        playerBets: ts.playerBets,
        myBets: ts.playerBets[playerId] ?? [],
        myBetTotal: ts.betTotals[playerId] ?? 0,
        result: ts.result,
        resultSlotIndex: ts.resultSlotIndex,
        history: ts.history,
        payouts: ts.payouts,
        totalBettors: Object.keys(ts.playerBets).length,
        bettingEndsAt: ts.bettingEndsAt,
        displayEndsAt: ts.displayEndsAt,
      },
    };
  }
}
