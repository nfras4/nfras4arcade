import { CasinoRoom } from './casinoRoom';
import type { CasinoAction, CasinoGameState } from './types';

// European roulette: numbers 0-36
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

type BetType = 'straight' | 'split' | 'street' | 'corner' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen' | 'column';

interface RouletteBet {
  type: BetType;
  numbers: number[];
  amount: number;
}

interface RouletteTableState {
  playerBets: Record<string, RouletteBet[]>;
  result: number | null;
  history: number[];
  payouts: Record<string, number> | null;
  betTotals: Record<string, number>;
}

const PAYOUT_MULTIPLIERS: Record<BetType, number> = {
  straight: 35,
  split: 17,
  street: 11,
  corner: 8,
  red: 1,
  black: 1,
  odd: 1,
  even: 1,
  low: 1,
  high: 1,
  dozen: 2,
  column: 2,
};

// Valid number counts per bet type
const VALID_BET_SIZES: Record<BetType, number> = {
  straight: 1,
  split: 2,
  street: 3,
  corner: 4,
  red: 0,
  black: 0,
  odd: 0,
  even: 0,
  low: 0,
  high: 0,
  dozen: 0,
  column: 0,
};

export class RouletteRoom extends CasinoRoom {
  protected get gameType(): string { return 'roulette'; }
  protected get maxSeats(): number { return 20; }

  private getTable(): RouletteTableState {
    return (this.tableState as RouletteTableState) ?? this.defaultTable();
  }

  private setTable(table: RouletteTableState): void {
    this.tableState = table;
  }

  private defaultTable(): RouletteTableState {
    return {
      playerBets: {},
      result: null,
      history: [],
      payouts: null,
      betTotals: {},
    };
  }

  protected initRound(): void {
    const ts = this.getTable();
    ts.playerBets = {};
    ts.result = null;
    ts.payouts = null;
    ts.betTotals = {};
    this.setTable(ts);
  }

  protected async handlePlayerAction(playerId: string, action: CasinoAction): Promise<void> {
    const ts = this.getTable();

    if (action.type === 'place_bet') {
      if (this.phase !== 'betting') {
        this.sendTo(playerId, { type: 'error', message: 'Betting is closed' });
        return;
      }

      const bet = action as CasinoAction & { bet: RouletteBet };
      if (!bet.bet || !this.validateBet(bet.bet)) {
        this.sendTo(playerId, { type: 'error', message: 'Invalid bet' });
        return;
      }

      if (!this.placeBet(playerId, bet.bet.amount)) {
        this.sendTo(playerId, { type: 'error', message: 'Insufficient chips' });
        return;
      }

      if (!ts.playerBets[playerId]) {
        ts.playerBets[playerId] = [];
        ts.betTotals[playerId] = 0;
      }
      ts.playerBets[playerId].push(bet.bet);
      ts.betTotals[playerId] += bet.bet.amount;
      this.setTable(ts);
      this.broadcastState();
      return;
    }

    if (action.type === 'clear_bets') {
      if (this.phase !== 'betting') return;
      const bets = ts.playerBets[playerId];
      if (bets) {
        // Refund all bets
        const total = bets.reduce((sum, b) => sum + b.amount, 0);
        this.awardChips(playerId, total);
        delete ts.playerBets[playerId];
        delete ts.betTotals[playerId];
        this.setTable(ts);
        this.broadcastState();
      }
      return;
    }

    if (action.type === 'spin') {
      if (this.phase !== 'betting') return;
      if (playerId !== this.hostId) {
        this.sendTo(playerId, { type: 'error', message: 'Only the host can spin' });
        return;
      }

      // Need at least one bet placed
      const hasBets = Object.keys(ts.playerBets).length > 0;
      if (!hasBets) {
        this.sendTo(playerId, { type: 'error', message: 'No bets placed' });
        return;
      }

      this.phase = 'resolving';
      this.setTable(ts);
      this.broadcastState();

      await this.resolveRound();
      this.setTable(ts);
      this.broadcastState();
      return;
    }
  }

  private validateBet(bet: RouletteBet): boolean {
    if (!bet.type || bet.amount < this.minBet) return false;
    if (!(bet.type in PAYOUT_MULTIPLIERS)) return false;

    const expectedSize = VALID_BET_SIZES[bet.type];

    // For outside bets, numbers array is ignored
    if (expectedSize === 0) {
      return true;
    }

    if (!Array.isArray(bet.numbers) || bet.numbers.length !== expectedSize) return false;

    // Validate all numbers are 0-36
    for (const n of bet.numbers) {
      if (typeof n !== 'number' || n < 0 || n > 36 || !Number.isInteger(n)) return false;
    }

    // Validate specific bet type constraints
    switch (bet.type) {
      case 'straight':
        return true;
      case 'split':
        return this.isAdjacentPair(bet.numbers[0], bet.numbers[1]);
      case 'street':
        return this.isValidStreet(bet.numbers);
      case 'corner':
        return this.isValidCorner(bet.numbers);
      default:
        return true;
    }
  }

  private isAdjacentPair(a: number, b: number): boolean {
    if (a === 0 || b === 0) return (a <= 3 && b <= 3); // 0 pairs with 1,2,3
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    // Horizontal adjacency (same row)
    if (max - min === 1 && Math.ceil(min / 3) === Math.ceil(max / 3)) return true;
    // Vertical adjacency
    if (max - min === 3) return true;
    return false;
  }

  private isValidStreet(nums: number[]): boolean {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted[0] === 0) return false; // no street with 0
    // Street: 3 consecutive numbers in a row (1-3, 4-6, 7-9, ...)
    return sorted[0] % 3 === 1 && sorted[1] === sorted[0] + 1 && sorted[2] === sorted[0] + 2;
  }

  private isValidCorner(nums: number[]): boolean {
    if (nums.includes(0)) return false;
    const sorted = [...nums].sort((a, b) => a - b);
    // Corner: 4 numbers forming a 2x2 block on the grid
    const base = sorted[0];
    if (base % 3 === 0) return false; // rightmost column can't be top-left of corner
    return (
      sorted[1] === base + 1 &&
      sorted[2] === base + 3 &&
      sorted[3] === base + 4
    );
  }

  private getWinningNumbers(result: number, betType: BetType): Set<number> {
    switch (betType) {
      case 'red': return RED_NUMBERS;
      case 'black': return BLACK_NUMBERS;
      case 'odd': {
        const s = new Set<number>();
        for (let i = 1; i <= 36; i += 2) s.add(i);
        return s;
      }
      case 'even': {
        const s = new Set<number>();
        for (let i = 2; i <= 36; i += 2) s.add(i);
        return s;
      }
      case 'low': {
        const s = new Set<number>();
        for (let i = 1; i <= 18; i++) s.add(i);
        return s;
      }
      case 'high': {
        const s = new Set<number>();
        for (let i = 19; i <= 36; i++) s.add(i);
        return s;
      }
      case 'dozen': {
        // Determined by bet.numbers content at resolve time, not here
        return new Set<number>();
      }
      case 'column': {
        return new Set<number>();
      }
      default:
        return new Set<number>();
    }
  }

  private doesBetWin(bet: RouletteBet, result: number): boolean {
    if (result === 0) {
      // 0 only wins straight bets on 0
      return bet.type === 'straight' && bet.numbers[0] === 0;
    }

    switch (bet.type) {
      case 'straight':
      case 'split':
      case 'street':
      case 'corner':
        return bet.numbers.includes(result);
      case 'red':
        return RED_NUMBERS.has(result);
      case 'black':
        return BLACK_NUMBERS.has(result);
      case 'odd':
        return result % 2 === 1;
      case 'even':
        return result % 2 === 0;
      case 'low':
        return result >= 1 && result <= 18;
      case 'high':
        return result >= 19 && result <= 36;
      case 'dozen': {
        // Numbers field indicates which dozen: [1]=1st, [2]=2nd, [3]=3rd
        const dozenNum = bet.numbers[0];
        if (dozenNum === 1) return result >= 1 && result <= 12;
        if (dozenNum === 2) return result >= 13 && result <= 24;
        if (dozenNum === 3) return result >= 25 && result <= 36;
        return false;
      }
      case 'column': {
        // Numbers field indicates column: [1]=1st, [2]=2nd, [3]=3rd
        const col = bet.numbers[0];
        return result % 3 === (col % 3); // col 1: r%3==1, col 2: r%3==2, col 3: r%3==0
      }
      default:
        return false;
    }
  }

  protected async resolveRound(): Promise<void> {
    const ts = this.getTable();

    // Generate random result (0-36) using crypto
    const randomBytes = crypto.getRandomValues(new Uint32Array(1));
    ts.result = randomBytes[0] % 37;

    ts.payouts = {};
    const profitedPlayers: string[] = [];

    for (const [playerId, bets] of Object.entries(ts.playerBets)) {
      let totalPayout = 0;

      for (const bet of bets) {
        if (this.doesBetWin(bet, ts.result)) {
          const multiplier = PAYOUT_MULTIPLIERS[bet.type];
          const payout = bet.amount + bet.amount * multiplier; // original bet + winnings
          totalPayout += payout;
        }
      }

      ts.payouts[playerId] = totalPayout;
      if (totalPayout > 0) {
        this.awardChips(playerId, totalPayout);
        profitedPlayers.push(playerId);
      }
    }

    // Track history (last 20 results)
    ts.history.unshift(ts.result);
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
    this.setTable(ts);

    await this.persistChips();
    await this.recordCasinoRound(profitedPlayers);
    await this.updateTableRegistry();
  }

  protected getGameStateForPlayer(playerId: string): CasinoGameState {
    const ts = this.getTable();
    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      connected: p.connected,
      isHost: p.isHost,
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
        history: ts.history,
        payouts: ts.payouts,
        totalBettors: Object.keys(ts.playerBets).length,
      },
    };
  }
}
