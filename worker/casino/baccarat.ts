import { CasinoRoom } from './casinoRoom';
import type { CasinoAction, CasinoGameState } from './types';
import type { Card } from '../cards/types';
import { createDeck, shuffle } from '../cards/deck';

interface BaccaratBet {
  type: 'player' | 'banker' | 'tie';
  amount: number;
}

interface BaccaratTableState {
  playerBets: Record<string, BaccaratBet[]>;
  deck: Card[];
  playerHand: Card[];
  bankerHand: Card[];
  result: 'player' | 'banker' | 'tie' | null;
  payouts: Record<string, number> | null;
  betTotals: Record<string, number>;
  history: Array<'player' | 'banker' | 'tie'>;
  bettingEndsAt: number;
  displayEndsAt: number;
}

const VALID_BET_TYPES = new Set<string>(['player', 'banker', 'tie']);
const BETTING_DURATION_MS = 20_000;
const RESULT_DISPLAY_MS = 6_000;
const DEFAULT_BUY_IN = 1000;
const DISCONNECT_TIMEOUT_MS = 30_000;
const ROOM_EXPIRY_MS = 30 * 60 * 1000;

function cardValue(card: Card): number {
  const rank = card.rank;
  if (rank === 'A') return 1;
  if (rank === '10' || rank === 'J' || rank === 'Q' || rank === 'K') return 0;
  return parseInt(rank, 10);
}

function handTotal(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c), 0) % 10;
}

export class BaccaratRoom extends CasinoRoom {
  protected get gameType(): string { return 'baccarat'; }
  protected get maxSeats(): number { return 50; }

  private getTable(): BaccaratTableState {
    if (!this.tableState) return this.defaultTable();
    const ts = this.tableState as Partial<BaccaratTableState>;
    if (ts.bettingEndsAt === undefined) ts.bettingEndsAt = 0;
    if (ts.displayEndsAt === undefined) ts.displayEndsAt = 0;
    if (ts.deck === undefined) ts.deck = shuffle(createDeck());
    if (ts.playerHand === undefined) ts.playerHand = [];
    if (ts.bankerHand === undefined) ts.bankerHand = [];
    return ts as BaccaratTableState;
  }

  private setTable(table: BaccaratTableState): void {
    this.tableState = table;
  }

  private defaultTable(): BaccaratTableState {
    return {
      playerBets: {},
      deck: shuffle(createDeck()),
      playerHand: [],
      bankerHand: [],
      result: null,
      payouts: null,
      betTotals: {},
      history: [],
      bettingEndsAt: 0,
      displayEndsAt: 0,
    };
  }

  protected initRound(): void {
    const ts = this.getTable();
    ts.playerBets = {};
    ts.playerHand = [];
    ts.bankerHand = [];
    ts.result = null;
    ts.payouts = null;
    ts.betTotals = {};
    // Reshuffle when deck runs low (need at least 6 cards for a full round)
    if (ts.deck.length < 6) {
      ts.deck = shuffle(createDeck());
    }
    this.setTable(ts);
  }

  // Override: always allow joining (single shared table, no spectators)
  protected async handleJoin(ws: WebSocket, playerId: string): Promise<void> {
    const existing = this.players.get(playerId);

    if (existing) {
      this.cosmeticsCache.invalidate(playerId);
      existing.connected = true;
      this.disconnectTimestamps.delete(playerId);
      this.resolveCosmeticsForPlayer(playerId);
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

    this.resolveCosmeticsForPlayer(playerId);

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

      const bet = (action as CasinoAction & { bet: BaccaratBet }).bet;
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

  private validateBet(bet: BaccaratBet): boolean {
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

    // Deal initial two cards to each hand
    const deal = (): Card => ts.deck.shift()!;
    ts.playerHand = [deal(), deal()];
    ts.bankerHand = [deal(), deal()];

    let playerTotal = handTotal(ts.playerHand);
    let bankerTotal = handTotal(ts.bankerHand);

    // Check for naturals (8 or 9 on first two cards)
    const isNatural = playerTotal >= 8 || bankerTotal >= 8;

    if (!isNatural) {
      let playerDrewThird = false;
      let playerThirdCard: Card | null = null;

      // Player third card rule: draw on 0-5, stand on 6-7
      if (playerTotal <= 5) {
        playerThirdCard = deal();
        ts.playerHand.push(playerThirdCard);
        playerTotal = handTotal(ts.playerHand);
        playerDrewThird = true;
      }

      // Banker third card rules
      if (!playerDrewThird) {
        // Player stood: banker draws on 0-5, stands on 6-7
        if (bankerTotal <= 5) {
          ts.bankerHand.push(deal());
          bankerTotal = handTotal(ts.bankerHand);
        }
      } else {
        // Player drew: use standard baccarat tableau
        const p3 = cardValue(playerThirdCard!);
        let bankerDraws = false;

        if (bankerTotal <= 2) {
          bankerDraws = true;
        } else if (bankerTotal === 3) {
          bankerDraws = p3 !== 8;
        } else if (bankerTotal === 4) {
          bankerDraws = p3 >= 2 && p3 <= 7;
        } else if (bankerTotal === 5) {
          bankerDraws = p3 >= 4 && p3 <= 7;
        } else if (bankerTotal === 6) {
          bankerDraws = p3 === 6 || p3 === 7;
        }
        // bankerTotal === 7: always stand

        if (bankerDraws) {
          ts.bankerHand.push(deal());
          bankerTotal = handTotal(ts.bankerHand);
        }
      }
    }

    // Determine result
    const finalPlayerTotal = handTotal(ts.playerHand);
    const finalBankerTotal = handTotal(ts.bankerHand);

    let result: 'player' | 'banker' | 'tie';
    if (finalPlayerTotal > finalBankerTotal) {
      result = 'player';
    } else if (finalBankerTotal > finalPlayerTotal) {
      result = 'banker';
    } else {
      result = 'tie';
    }

    ts.result = result;
    ts.payouts = {};
    const profitedPlayers: string[] = [];
    const netWinByPlayer: Record<string, number> = {};

    for (const [playerId, bets] of Object.entries(ts.playerBets)) {
      let totalPayout = 0;
      let totalStaked = 0;

      for (const bet of bets) {
        totalStaked += bet.amount;
        if (result === 'tie') {
          // Push on player/banker bets (return stake), tie bet pays 8:1
          if (bet.type === 'tie') {
            totalPayout += bet.amount + bet.amount * 8;
          } else {
            totalPayout += bet.amount; // push
          }
        } else {
          if (bet.type === result) {
            if (bet.type === 'banker') {
              // Super 6: banker wins with 6 pays 0.5:1, otherwise 1:1
              totalPayout += bet.amount + (finalBankerTotal === 6 ? Math.floor(bet.amount * 0.5) : bet.amount);
            } else {
              // Player pays 1:1
              totalPayout += bet.amount + bet.amount;
            }
          }
          // Losing tie bets are forfeited
        }
      }

      ts.payouts[playerId] = totalPayout;
      netWinByPlayer[playerId] = totalPayout - totalStaked;
      if (totalPayout > 0) {
        this.awardChips(playerId, totalPayout);
        profitedPlayers.push(playerId);
      }
    }

    // Record biggest_win per player for this round (net win after subtracting all stakes)
    try {
      const stmts: D1PreparedStatement[] = [];
      for (const [pid, netWin] of Object.entries(netWinByPlayer)) {
        if (netWin <= 0) continue;
        const player = this.players.get(pid);
        if (!player || player.isGuest || pid.startsWith('guest_')) continue;
        stmts.push(
          this.env.DB.prepare(
            'UPDATE player_profiles SET biggest_win = ?, biggest_win_game = ? WHERE id = ? AND biggest_win < ?'
          ).bind(netWin, 'baccarat', pid, netWin)
        );
      }
      if (stmts.length > 0) await this.env.DB.batch(stmts);
    } catch {}

    // Track history (last 20 results)
    ts.history.unshift(result);
    if (ts.history.length > 20) ts.history.pop();

    // Baccarat winner badge
    for (const id of profitedPlayers) {
      const player = this.players.get(id);
      if (player && !player.isGuest && !id.startsWith('guest_')) {
        try {
          const now = Math.floor(Date.now() / 1000);
          await this.env.DB.prepare(
            'INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)'
          ).bind(id, 'b_baccarat_win', now).run();
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

  // Override alarm to handle baccarat auto-timers + disconnect + expiry
  async alarm(): Promise<void> {
    await this.loadState();
    const now = Date.now();

    // Keep room alive while players are connected
    if (this.players.size > 0) {
      this.lastActivity = now;
    }

    // Auto-deal when betting timer expires
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
        playerHand: ts.playerHand,
        bankerHand: ts.bankerHand,
        playerTotal: handTotal(ts.playerHand),
        bankerTotal: handTotal(ts.bankerHand),
        result: ts.result,
        payouts: ts.payouts,
        myPayout: ts.payouts?.[playerId] ?? null,
        totalBettors: Object.keys(ts.playerBets).length,
        history: ts.history,
        bettingEndsAt: ts.bettingEndsAt,
        displayEndsAt: ts.displayEndsAt,
      },
    };
  }
}
