import { CasinoRoom } from './casinoRoom';
import type { CasinoAction, CasinoGameState } from './types';
import type { Card } from '../cards/types';
import { createDeck, shuffle } from '../cards/deck';
import { calculateHandValue, isBlackjack, isBusted, dealerShouldHit } from './handValue';

interface BlackjackHand {
  cards: Card[];
  bet: number;
  stood: boolean;
  busted: boolean;
  doubled: boolean;
  isBlackjack: boolean;
}

type HandResult = 'win' | 'lose' | 'push' | 'blackjack';

interface BlackjackTableState {
  deck: Card[];
  dealerHand: Card[];
  dealerRevealed: boolean;
  playerHands: Record<string, BlackjackHand[]>;
  currentPlayerId: string | null;
  currentHandIndex: number;
  results: Record<string, HandResult[]> | null;
  payouts: Record<string, number> | null;
  betsPlaced: Record<string, number>;
  roundActive: boolean;
  bettingEndsAt: number;
  displayEndsAt: number;
}

const BETTING_DURATION_MS = 20_000;
const RESULT_DISPLAY_MS = 6_000;
const DISCONNECT_TIMEOUT_MS = 30_000;
const ROOM_EXPIRY_MS = 30 * 60 * 1000;

type BlackjackAction = CasinoAction & (
  | { type: 'place_bet'; amount: number }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double_down' }
  | { type: 'split' }
);

export class BlackjackRoom extends CasinoRoom {
  protected get gameType(): string { return 'blackjack'; }
  protected get maxSeats(): number { return 6; }

  private getTable(): BlackjackTableState {
    return (this.tableState as BlackjackTableState) ?? this.defaultTable();
  }

  private setTable(table: BlackjackTableState): void {
    this.tableState = table;
  }

  private defaultTable(): BlackjackTableState {
    return {
      deck: [],
      dealerHand: [],
      dealerRevealed: false,
      playerHands: {},
      currentPlayerId: null,
      currentHandIndex: 0,
      results: null,
      payouts: null,
      betsPlaced: {},
      roundActive: false,
      bettingEndsAt: 0,
      displayEndsAt: 0,
    };
  }

  protected initRound(): void {
    const ts = this.defaultTable();
    ts.deck = shuffle(createDeck());
    ts.betsPlaced = {};
    ts.roundActive = false;
    ts.bettingEndsAt = 0;
    ts.displayEndsAt = 0;
    this.setTable(ts);
  }

  protected async handlePlayerAction(playerId: string, action: BlackjackAction): Promise<void> {
    const ts = this.getTable();

    if (action.type === 'place_bet') {
      if (this.phase !== 'betting') {
        this.sendTo(playerId, { type: 'error', message: 'Betting is closed' });
        return;
      }
      if (ts.betsPlaced[playerId] !== undefined) {
        this.sendTo(playerId, { type: 'error', message: 'Bet already placed' });
        return;
      }
      const amount = action.amount;
      if (!this.placeBet(playerId, amount)) {
        this.sendTo(playerId, { type: 'error', message: 'Invalid bet amount or insufficient chips' });
        return;
      }
      ts.betsPlaced[playerId] = amount;
      this.setTable(ts);
      this.broadcastState();

      // Deal immediately when all players have bet
      const allBet = Array.from(this.players.keys()).every(id => ts.betsPlaced[id] !== undefined);
      if (allBet) {
        ts.bettingEndsAt = 0;
        this.setTable(ts);
        await this.dealCards();
      }
      return;
    }

    // Playing phase actions
    if (this.phase !== 'playing') {
      this.sendTo(playerId, { type: 'error', message: 'Not in playing phase' });
      return;
    }

    if (ts.currentPlayerId !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
      return;
    }

    const hands = ts.playerHands[playerId];
    if (!hands) return;
    const hand = hands[ts.currentHandIndex];
    if (!hand || hand.stood || hand.busted) {
      this.advanceToNextHand(ts);
      this.setTable(ts);
      this.broadcastState();
      return;
    }

    switch (action.type) {
      case 'hit': {
        hand.cards.push(ts.deck.shift()!);
        if (isBusted(hand.cards)) {
          hand.busted = true;
          this.advanceToNextHand(ts);
        }
        break;
      }

      case 'stand': {
        hand.stood = true;
        this.advanceToNextHand(ts);
        break;
      }

      case 'double_down': {
        // Must have exactly 2 cards
        if (hand.cards.length !== 2) {
          this.sendTo(playerId, { type: 'error', message: 'Can only double down on initial hand' });
          return;
        }
        const player = this.players.get(playerId);
        if (!player || player.chips < hand.bet) {
          this.sendTo(playerId, { type: 'error', message: 'Insufficient chips to double down' });
          return;
        }
        player.chips -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        hand.cards.push(ts.deck.shift()!);
        if (isBusted(hand.cards)) {
          hand.busted = true;
        }
        hand.stood = true;
        this.advanceToNextHand(ts);
        break;
      }

      case 'split': {
        if (hand.cards.length !== 2 || hand.cards[0].rank !== hand.cards[1].rank) {
          this.sendTo(playerId, { type: 'error', message: 'Cannot split this hand' });
          return;
        }
        const player2 = this.players.get(playerId);
        if (!player2 || player2.chips < hand.bet) {
          this.sendTo(playerId, { type: 'error', message: 'Insufficient chips to split' });
          return;
        }
        if (hands.length >= 4) {
          this.sendTo(playerId, { type: 'error', message: 'Maximum 4 hands' });
          return;
        }

        player2.chips -= hand.bet;
        const splitCard = hand.cards.pop()!;
        hand.cards.push(ts.deck.shift()!);

        const newHand: BlackjackHand = {
          cards: [splitCard, ts.deck.shift()!],
          bet: hand.bet,
          stood: false,
          busted: false,
          doubled: false,
          isBlackjack: false,
        };
        hands.splice(ts.currentHandIndex + 1, 0, newHand);
        break;
      }

      default:
        return;
    }

    this.setTable(ts);
    this.broadcastState();

    // Check if we need to resolve (no more currentPlayerId)
    if (ts.currentPlayerId === null) {
      await this.resolveRound();
      this.setTable(ts);
      this.broadcastState();
    }
  }

  private async dealCards(): Promise<void> {
    const ts = this.getTable();
    const playerIds = Array.from(this.players.keys()).filter(id => ts.betsPlaced[id] !== undefined);

    // Deal 2 cards to each player, then 2 to dealer
    for (const id of playerIds) {
      const hand: BlackjackHand = {
        cards: [ts.deck.shift()!, ts.deck.shift()!],
        bet: ts.betsPlaced[id],
        stood: false,
        busted: false,
        doubled: false,
        isBlackjack: false,
      };
      if (isBlackjack(hand.cards)) {
        hand.isBlackjack = true;
        hand.stood = true;
      }
      ts.playerHands[id] = [hand];
    }

    ts.dealerHand = [ts.deck.shift()!, ts.deck.shift()!];
    ts.dealerRevealed = false;
    ts.roundActive = true;

    // Check if dealer has blackjack
    const dealerBJ = isBlackjack(ts.dealerHand);

    if (dealerBJ) {
      // All hands resolve immediately
      ts.dealerRevealed = true;
      this.phase = 'resolving';
      this.setTable(ts);
      await this.resolveRound();
      return;
    }

    // Check if all players have blackjack (auto-resolve)
    const allBlackjack = playerIds.every(id => ts.playerHands[id][0].isBlackjack);
    if (allBlackjack) {
      ts.dealerRevealed = true;
      this.phase = 'resolving';
      this.setTable(ts);
      await this.resolveRound();
      return;
    }

    // Set first player to act
    this.phase = 'playing';
    const firstPlayer = playerIds.find(id => !ts.playerHands[id][0].isBlackjack);
    ts.currentPlayerId = firstPlayer ?? null;
    ts.currentHandIndex = 0;

    if (ts.currentPlayerId === null) {
      ts.dealerRevealed = true;
      this.phase = 'resolving';
      this.setTable(ts);
      await this.resolveRound();
      return;
    }

    this.setTable(ts);
    this.broadcastState();
  }

  private advanceToNextHand(ts: BlackjackTableState): void {
    const playerIds = Array.from(this.players.keys()).filter(id => ts.playerHands[id]);

    if (ts.currentPlayerId === null) return;

    const hands = ts.playerHands[ts.currentPlayerId];
    // Try next hand for same player
    if (hands && ts.currentHandIndex + 1 < hands.length) {
      ts.currentHandIndex++;
      return;
    }

    // Move to next player
    const currentIdx = playerIds.indexOf(ts.currentPlayerId);
    for (let i = currentIdx + 1; i < playerIds.length; i++) {
      const nextHands = ts.playerHands[playerIds[i]];
      if (nextHands) {
        const firstActiveHand = nextHands.findIndex(h => !h.stood && !h.busted);
        if (firstActiveHand >= 0) {
          ts.currentPlayerId = playerIds[i];
          ts.currentHandIndex = firstActiveHand;
          return;
        }
        // All hands for this player are done, check for unfinished hands
        const firstUnfinished = nextHands.findIndex(h => !h.stood && !h.busted);
        if (firstUnfinished === -1) continue;
        ts.currentPlayerId = playerIds[i];
        ts.currentHandIndex = firstUnfinished;
        return;
      }
    }

    // No more players to act
    ts.currentPlayerId = null;
    ts.currentHandIndex = 0;
  }

  protected async resolveRound(): Promise<void> {
    const ts = this.getTable();
    ts.dealerRevealed = true;

    // Dealer draws cards
    while (dealerShouldHit(ts.dealerHand)) {
      ts.dealerHand.push(ts.deck.shift()!);
    }

    const dealerValue = calculateHandValue(ts.dealerHand).value;
    const dealerBJ = isBlackjack(ts.dealerHand);
    const dealerBusted = dealerValue > 21;

    ts.results = {};
    ts.payouts = {};
    const profitedPlayers: string[] = [];

    for (const [playerId, hands] of Object.entries(ts.playerHands)) {
      ts.results[playerId] = [];
      ts.payouts[playerId] = 0;

      for (const hand of hands) {
        let result: HandResult;
        const handValue = calculateHandValue(hand.cards).value;

        if (hand.busted) {
          result = 'lose';
        } else if (hand.isBlackjack && dealerBJ) {
          result = 'push';
        } else if (hand.isBlackjack) {
          result = 'blackjack';
        } else if (dealerBJ) {
          result = 'lose';
        } else if (dealerBusted) {
          result = 'win';
        } else if (handValue > dealerValue) {
          result = 'win';
        } else if (handValue < dealerValue) {
          result = 'lose';
        } else {
          result = 'push';
        }

        ts.results[playerId].push(result);

        let payout = 0;
        switch (result) {
          case 'blackjack':
            payout = hand.bet + Math.floor(hand.bet * 1.5); // 3:2
            break;
          case 'win':
            payout = hand.bet * 2; // 1:1
            break;
          case 'push':
            payout = hand.bet; // return bet
            break;
          case 'lose':
            payout = 0;
            break;
        }

        ts.payouts[playerId] += payout;
        if (payout > 0) {
          this.awardChips(playerId, payout);
        }
      }

      if (ts.payouts[playerId] > 0) {
        profitedPlayers.push(playerId);
      }
    }

    // Award blackjack badge
    for (const [playerId, hands] of Object.entries(ts.playerHands)) {
      if (hands.some(h => h.isBlackjack)) {
        const player = this.players.get(playerId);
        if (player && !player.isGuest && !playerId.startsWith('guest_')) {
          try {
            const now = Math.floor(Date.now() / 1000);
            await this.env.DB.prepare(
              'INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)'
            ).bind(playerId, 'b_blackjack_natural', now).run();
          } catch {}
        }
      }
    }

    // High roller badge
    for (const [playerId, bet] of Object.entries(ts.betsPlaced)) {
      if (bet >= 500) {
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
    ts.roundActive = false;
    ts.bettingEndsAt = 0;
    ts.displayEndsAt = Date.now() + RESULT_DISPLAY_MS;
    this.setTable(ts);

    await this.persistChips();
    await this.recordCasinoRound(profitedPlayers);
    await this.updateTableRegistry();
    await this.scheduleNextAlarm();

    this.broadcastState();
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
        const hasBets = Object.keys(ts.betsPlaced).length > 0;
        if (hasBets) {
          ts.bettingEndsAt = 0;
          this.setTable(ts);
          await this.dealCards();
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

  protected getGameStateForPlayer(playerId: string): CasinoGameState {
    const ts = this.getTable();
    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      chips: p.chips,
      connected: p.connected,
      isHost: p.isHost,
    }));

    // Hide dealer's hole card unless revealed
    let dealerHand = ts.dealerHand;
    if (ts.dealerHand.length > 0 && !ts.dealerRevealed) {
      dealerHand = [ts.dealerHand[0]]; // only show first card
    }

    const dealerValue = ts.dealerHand.length === 0
      ? 0
      : ts.dealerRevealed
        ? calculateHandValue(ts.dealerHand).value
        : calculateHandValue([ts.dealerHand[0]]).value;

    return {
      code: this.code,
      phase: this.phase,
      players,
      roundNumber: this.roundNumber,
      minBet: this.minBet,
      maxBet: this.maxBet,
      tableState: {
        dealerHand,
        dealerRevealed: ts.dealerRevealed,
        dealerValue: ts.dealerRevealed ? dealerValue : null,
        playerHands: ts.playerHands,
        currentPlayerId: ts.currentPlayerId,
        currentHandIndex: ts.currentHandIndex,
        results: ts.results,
        payouts: ts.payouts,
        betsPlaced: ts.betsPlaced,
        myBet: ts.betsPlaced[playerId] ?? null,
        bettingEndsAt: ts.bettingEndsAt,
        displayEndsAt: ts.displayEndsAt,
      },
    };
  }
}
