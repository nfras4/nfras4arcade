import { CardRoom } from './cardRoom';
import type { Card, CardAction, CardGameState } from './types';
import { createDeck, shuffle } from './deck';
import { chaseQueenBotDecision } from '../bots/botDecision';

/** Penalty value of a card in Chase the Queen. */
function penaltyValue(card: Card): number {
  if (card.suit === 'spades' && card.rank === 'Q') return 50;
  if (card.suit === 'hearts') {
    const vals: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 10, 'Q': 10, 'K': 10, 'A': 11,
    };
    return vals[card.rank] ?? 0;
  }
  return 0;
}

/** Total penalty points available per round (all hearts + Queen of Spades). */
const TOTAL_PENALTY_POINTS = 145;

interface TrickCard {
  playerId: string;
  card: Card;
}

interface ChaseTheQueenTableState {
  currentTrick: TrickCard[];
  wonTricks: Record<string, Card[]>; // playerId -> flat array of cards won
  roundScores: Record<string, number>; // penalty points this round
  dealerIndex: number;
  leadPlayer: string | null;
  trickNumber: number;
  totalTricks: number;
  cardsOutOfPlay: Card[];
  awaitingMoonChoice: string | null; // player ID choosing shoot-the-moon
  lastCompletedTrick: TrickCard[]; // previous trick cards for display
  lastTrickWinner: string | null;
}

type ChaseTheQueenAction = CardAction & (
  | { type: 'play_card'; card: Card }
  | { type: 'moon_choice'; choice: 'double_others' | 'halve_self' }
  | { type: 'next_round' }
);

export class ChaseTheQueenRoom extends CardRoom {
  protected get minPlayers(): number { return 3; }
  protected get maxPlayers(): number { return 6; }
  protected get gameType(): string { return 'chase_the_queen'; }

  private getTable(): ChaseTheQueenTableState {
    return (this.tableState as ChaseTheQueenTableState) ?? {
      currentTrick: [],
      wonTricks: {},
      roundScores: {},
      dealerIndex: 0,
      leadPlayer: null,
      trickNumber: 0,
      totalTricks: 0,
      cardsOutOfPlay: [],
      awaitingMoonChoice: null,
      lastCompletedTrick: [],
      lastTrickWinner: null,
    };
  }

  private setTable(table: ChaseTheQueenTableState): void {
    this.tableState = table;
  }

  protected initRound(): void {
    const deck = shuffle(createDeck());
    // Use all players, not just turnOrder (which may be stale after hibernation)
    const playerIds = Array.from(this.players.keys());
    const n = playerIds.length;
    const cardsEach = Math.floor(52 / n);
    const totalDealt = cardsEach * n;

    // Deal evenly, extras go out of play
    for (let i = 0; i < playerIds.length; i++) {
      const player = this.players.get(playerIds[i]);
      if (player) {
        player.hand = deck.slice(i * cardsEach, (i + 1) * cardsEach);
        // Sort hand by alternating red/black suits, then rank within suit
        player.hand.sort((a, b) => {
          const suitOrder = ['hearts', 'spades', 'diamonds', 'clubs'];
          const si = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
          if (si !== 0) return si;
          return a.value - b.value;
        });
      }
    }

    const cardsOutOfPlay = deck.slice(totalDealt);

    // Dealer rotates; player left of dealer leads first trick
    const prevTable = this.getTable();
    const dealerIndex = this.roundNumber > 1
      ? (prevTable.dealerIndex + 1) % n
      : 0;
    const leadIndex = (dealerIndex + 1) % n;
    const leadPlayer = playerIds[leadIndex];

    this.currentTurn = leadPlayer;

    const wonTricks: Record<string, Card[]> = {};
    const roundScores: Record<string, number> = {};
    for (const id of playerIds) {
      wonTricks[id] = [];
      roundScores[id] = 0;
    }

    this.setTable({
      currentTrick: [],
      wonTricks,
      roundScores,
      dealerIndex,
      leadPlayer,
      trickNumber: 1,
      totalTricks: cardsEach,
      cardsOutOfPlay,
      awaitingMoonChoice: null,
      lastCompletedTrick: [],
      lastTrickWinner: null,
    });
  }

  protected async handleAction(playerId: string, action: ChaseTheQueenAction): Promise<void> {
    const table = this.getTable();

    // Host can start next round from round_over
    if (action.type === 'next_round' && playerId === this.hostId) {
      if (this.phase !== 'round_over') return;

      // Check if any player hit 500+ -> game over
      const gameOver = this.turnOrder.some(id => (this.scores.get(id) ?? 0) >= 500);
      if (gameOver) {
        this.phase = 'game_over';
        // Winner is the player with lowest score
        const winner = this.turnOrder.reduce((best, id) =>
          (this.scores.get(id) ?? 0) < (this.scores.get(best) ?? 0) ? id : best
        );
        this.recordGameEnd(winner).catch(() => {});
        this.broadcastState();
        return;
      }

      this.roundNumber++;
      this.phase = 'playing';
      this.initRound();
      this.broadcastState();
      // If first turn of new round is a bot, schedule it
      if (this.isBotTurn()) {
        await this.scheduleBotTurn();
      }
      return;
    }

    // Shoot the moon choice
    if (action.type === 'moon_choice') {
      if (table.awaitingMoonChoice !== playerId) {
        this.sendTo(playerId, { type: 'error', message: 'Not your choice to make' });
        return;
      }

      if (action.choice === 'double_others') {
        for (const id of this.turnOrder) {
          if (id !== playerId) {
            this.scores.set(id, (this.scores.get(id) ?? 0) * 2);
          }
        }
      } else if (action.choice === 'halve_self') {
        const current = this.scores.get(playerId) ?? 0;
        this.scores.set(playerId, Math.floor(current / 2));
      }

      // Award going_bananas badge
      this.awardMoonBadge(playerId).catch(() => {});

      table.awaitingMoonChoice = null;
      this.setTable(table);
      this.phase = 'round_over';
      this.broadcastState();
      return;
    }

    // Playing a card
    if (action.type === 'play_card') {
      if (this.phase !== 'playing') return;
      if (table.awaitingMoonChoice) {
        this.sendTo(playerId, { type: 'error', message: 'Waiting for shoot the moon decision' });
        return;
      }
      if (this.currentTurn !== playerId) {
        this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
        return;
      }

      const player = this.players.get(playerId);
      if (!player) return;

      const card = action.card;

      // Validate player has this card
      const cardIdx = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
      if (cardIdx === -1) {
        this.sendTo(playerId, { type: 'error', message: 'You do not have that card' });
        return;
      }

      // Validate suit-following
      if (table.currentTrick.length > 0) {
        const ledSuit = table.currentTrick[0].card.suit;
        if (card.suit !== ledSuit) {
          // Check if player has any cards of the led suit
          const hasSuit = player.hand.some(c => c.suit === ledSuit);
          if (hasSuit) {
            this.sendTo(playerId, { type: 'error', message: `You must follow suit (${ledSuit})` });
            return;
          }
          // Can't follow suit - any card is fine
        }
      }

      // Remove card from hand
      player.hand.splice(cardIdx, 1);

      // Add to current trick
      table.currentTrick.push({ playerId, card });

      // Check if trick is complete (all players have played)
      if (table.currentTrick.length === this.turnOrder.length) {
        await this.resolveTrick(table);
      } else {
        // Advance to next player in turn order
        this.advanceTurn();
      }

      this.setTable(table);
      this.broadcastState();
      return;
    }
  }

  private async resolveTrick(table: ChaseTheQueenTableState): Promise<void> {
    const ledSuit = table.currentTrick[0].card.suit;

    // Find highest card of led suit
    let winnerId = table.currentTrick[0].playerId;
    let highestValue = table.currentTrick[0].card.value;

    for (let i = 1; i < table.currentTrick.length; i++) {
      const tc = table.currentTrick[i];
      if (tc.card.suit === ledSuit && tc.card.value > highestValue) {
        highestValue = tc.card.value;
        winnerId = tc.playerId;
      }
    }

    // Add trick cards to winner's won pile
    for (const tc of table.currentTrick) {
      table.wonTricks[winnerId].push(tc.card);
    }

    // Preserve completed trick for client display
    table.lastCompletedTrick = [...table.currentTrick];
    table.lastTrickWinner = winnerId;

    // Clear trick
    table.currentTrick = [];
    table.trickNumber++;

    // Update running round scores after each trick
    for (const id of this.turnOrder) {
      let score = 0;
      for (const card of table.wonTricks[id]) {
        score += penaltyValue(card);
      }
      table.roundScores[id] = score;
    }

    // Winner leads next trick
    table.leadPlayer = winnerId;
    this.currentTurn = winnerId;

    // Check if round is over (all cards played)
    const allHandsEmpty = this.turnOrder.every(id => {
      const p = this.players.get(id);
      return !p || p.hand.length === 0;
    });

    if (allHandsEmpty) {
      await this.handleRoundEnd(table);
    }
  }

  private async handleRoundEnd(table: ChaseTheQueenTableState): Promise<void> {
    // Tally penalty cards from won tricks
    for (const id of this.turnOrder) {
      let score = 0;
      for (const card of table.wonTricks[id]) {
        score += penaltyValue(card);
      }
      table.roundScores[id] = score;
    }

    // Sanity check: total scored must equal 145
    const totalScored = Object.values(table.roundScores).reduce((sum, s) => sum + s, 0);
    // Cards out of play may contain penalty cards, account for them
    let outOfPlayPenalty = 0;
    for (const card of table.cardsOutOfPlay) {
      outOfPlayPenalty += penaltyValue(card);
    }

    const expectedInPlay = TOTAL_PENALTY_POINTS - outOfPlayPenalty;
    if (totalScored !== expectedInPlay) {
      // Log but don't crash - this is a sanity check
      console.error(`Chase the Queen scoring error: total=${totalScored}, expected=${expectedInPlay}`);
    }

    // Check for shoot the moon: one player took ALL penalty points in play
    const moonShooter = this.turnOrder.find(id => table.roundScores[id] === expectedInPlay);

    if (moonShooter && expectedInPlay > 0) {
      // Don't commit scores yet - wait for player choice
      table.awaitingMoonChoice = moonShooter;
      this.setTable(table);
      // Phase stays 'playing' so the choice screen shows
      this.broadcastState();
      // If moon shooter is a bot, auto-resolve after delay
      if (this.bots.has(moonShooter)) {
        this.botTurnPending = true;
        await this.ctx.storage.setAlarm(Date.now() + 1500);
      }
      return;
    }

    // Commit round scores to running totals
    this.commitRoundScores(table);
    this.phase = 'round_over';
  }

  private commitRoundScores(table: ChaseTheQueenTableState): void {
    for (const id of this.turnOrder) {
      const current = this.scores.get(id) ?? 0;
      this.scores.set(id, current + table.roundScores[id]);
    }
  }

  private async awardMoonBadge(playerId: string): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      await this.env.DB.prepare(
        'INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)'
      ).bind(playerId, 'b_going_bananas', now).run();
    } catch {}
  }

  protected checkRoundEnd(): string | null {
    // Not used directly - round end is handled in resolveTrick
    return null;
  }

  protected async processBotTurn(): Promise<void> {
    if (this.phase !== 'playing') return;

    const table = this.getTable();

    // Handle bot shoot the moon choice (not tied to currentTurn)
    if (table.awaitingMoonChoice && this.bots.has(table.awaitingMoonChoice)) {
      const botId = table.awaitingMoonChoice;
      await this.handleAction(botId, { type: 'moon_choice', choice: 'halve_self' });
      return;
    }

    if (!this.currentTurn || !this.bots.has(this.currentTurn)) return;

    const botId = this.currentTurn;
    const player = this.players.get(botId);
    if (!player || player.hand.length === 0) return;

    const ledSuit = table.currentTrick.length > 0
      ? table.currentTrick[0].card.suit
      : null;

    const card = chaseQueenBotDecision(player.hand, table.currentTrick, ledSuit);
    await this.handleAction(botId, { type: 'play_card', card });

    // If next turn is also a bot, schedule it
    if (this.isBotTurn() && this.phase === 'playing') {
      await this.scheduleBotTurn();
    }
  }

  protected getGameStateForPlayer(playerId: string): CardGameState {
    const table = this.getTable();
    const player = this.players.get(playerId);

    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length,
      connected: p.connected,
      isHost: p.isHost,
      isBot: p.isBot,
    }));

    // Check if Queen of Spades is in the current trick
    const queenInTrick = table.currentTrick.some(
      tc => tc.card.suit === 'spades' && tc.card.rank === 'Q'
    );

    return {
      code: this.code,
      phase: this.phase,
      players,
      turnOrder: this.turnOrder,
      currentTurn: this.currentTurn,
      roundNumber: this.roundNumber,
      scores: Object.fromEntries(this.scores),
      tableState: {
        myHand: player?.hand ?? [],
        currentTrick: table.currentTrick,
        wonTricks: table.wonTricks,
        roundScores: table.roundScores,
        trickNumber: table.trickNumber,
        totalTricks: table.totalTricks,
        leadPlayer: table.leadPlayer,
        queenInTrick,
        awaitingMoonChoice: table.awaitingMoonChoice,
        lastCompletedTrick: table.lastCompletedTrick,
        lastTrickWinner: table.lastTrickWinner,
        dealerIndex: table.dealerIndex,
      },
    };
  }
}
