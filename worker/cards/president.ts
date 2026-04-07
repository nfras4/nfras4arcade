import { CardRoom } from './cardRoom';
import type { Card, CardAction, CardGameState, CardGamePhase } from './types';
import { createDeck, shuffle, dealHands } from './deck';

/** President-specific table state. */
interface PresidentTableState {
  pile: Card[];
  pilePlayCount: number; // how many cards were played per turn (e.g. 2 for pairs)
  passedPlayers: Set<string>; // serialized as array
  finishOrder: string[]; // player IDs in order they went out
  titles: Record<string, string>; // playerId -> title from previous round
  lastPlayerId: string | null;
}

/** Serializable version for storage. */
interface PresidentTableStored {
  pile: Card[];
  pilePlayCount: number;
  passedPlayers: string[];
  finishOrder: string[];
  titles: Record<string, string>;
  lastPlayerId: string | null;
}

type PresidentAction = CardAction & (
  | { type: 'play_cards'; cards: Card[] }
  | { type: 'pass' }
);

/** President card ranking: 3 is lowest, 2 is highest. */
function presidentValue(rank: string): number {
  const order: Record<string, number> = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  };
  return order[rank] ?? 0;
}

const TITLES: Record<number, string> = {
  0: 'President',
  1: 'Vice President',
};

function getTitleForPosition(position: number, totalPlayers: number): string {
  if (position === 0) return 'President';
  if (position === 1 && totalPlayers > 3) return 'Vice President';
  if (position === totalPlayers - 1) return 'Scum';
  if (position === totalPlayers - 2 && totalPlayers > 3) return 'Vice Scum';
  return 'Neutral';
}

export class PresidentRoom extends CardRoom {
  protected get minPlayers(): number { return 3; }
  protected get maxPlayers(): number { return 6; }
  protected get gameType(): string { return 'president'; }

  private getTable(): PresidentTableState {
    const stored = this.tableState as PresidentTableStored | null;
    if (!stored) {
      return {
        pile: [],
        pilePlayCount: 0,
        passedPlayers: new Set(),
        finishOrder: [],
        titles: {},
        lastPlayerId: null,
      };
    }
    return {
      ...stored,
      passedPlayers: new Set(stored.passedPlayers),
    };
  }

  private setTable(table: PresidentTableState): void {
    const stored: PresidentTableStored = {
      pile: table.pile,
      pilePlayCount: table.pilePlayCount,
      passedPlayers: Array.from(table.passedPlayers),
      finishOrder: table.finishOrder,
      titles: table.titles,
      lastPlayerId: table.lastPlayerId,
    };
    this.tableState = stored;
  }

  protected initRound(): void {
    const deck = shuffle(createDeck());
    const playerIds = this.turnOrder;
    const { hands } = dealHands(deck, playerIds.length);

    // Sort each hand by president ranking for convenience
    for (let i = 0; i < playerIds.length; i++) {
      hands[i].sort((a, b) => presidentValue(a.rank) - presidentValue(b.rank));
      const player = this.players.get(playerIds[i]);
      if (player) player.hand = hands[i];
    }

    // Preserve titles from previous round
    const prevTable = this.getTable();
    const titles = this.roundNumber > 1 ? prevTable.titles : {};

    this.setTable({
      pile: [],
      pilePlayCount: 0,
      passedPlayers: new Set(),
      finishOrder: [],
      titles,
      lastPlayerId: null,
    });

    // Card swap for round 2+
    if (this.roundNumber > 1) {
      this.doCardSwap();
    }
  }

  private doCardSwap(): void {
    const table = this.getTable();
    const prevOrder = Object.entries(table.titles);
    const president = prevOrder.find(([, t]) => t === 'President');
    const scum = prevOrder.find(([, t]) => t === 'Scum');

    if (!president || !scum) return;

    const presPlayer = this.players.get(president[0]);
    const scumPlayer = this.players.get(scum[0]);
    if (!presPlayer || !scumPlayer) return;

    // Scum gives 2 best cards to President
    scumPlayer.hand.sort((a, b) => presidentValue(b.rank) - presidentValue(a.rank));
    const bestCards = scumPlayer.hand.splice(0, 2);

    // President gives 2 worst cards to Scum
    presPlayer.hand.sort((a, b) => presidentValue(a.rank) - presidentValue(b.rank));
    const worstCards = presPlayer.hand.splice(0, 2);

    presPlayer.hand.push(...bestCards);
    scumPlayer.hand.push(...worstCards);

    // Re-sort hands
    presPlayer.hand.sort((a, b) => presidentValue(a.rank) - presidentValue(b.rank));
    scumPlayer.hand.sort((a, b) => presidentValue(a.rank) - presidentValue(b.rank));
  }

  protected async handleAction(playerId: string, action: PresidentAction): Promise<void> {
    if (this.phase !== 'playing') return;
    if (this.currentTurn !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
      return;
    }

    const table = this.getTable();
    const player = this.players.get(playerId);
    if (!player) return;

    // Player already finished
    if (table.finishOrder.includes(playerId)) {
      this.advanceToNextActive(table);
      this.setTable(table);
      this.broadcastState();
      return;
    }

    if (action.type === 'pass') {
      table.passedPlayers.add(playerId);

      // Check if everyone else passed -> clear pile
      const activePlayers = this.turnOrder.filter(
        id => !table.finishOrder.includes(id) && id !== table.lastPlayerId
      );
      const allPassed = activePlayers.every(id => table.passedPlayers.has(id));

      if (allPassed && table.lastPlayerId) {
        // Pile cleared - last player who played starts fresh
        table.pile = [];
        table.pilePlayCount = 0;
        table.passedPlayers.clear();
        this.currentTurn = table.lastPlayerId;
        // If that player is finished, advance
        if (table.finishOrder.includes(table.lastPlayerId)) {
          this.advanceToNextActive(table);
        }
      } else {
        this.advanceToNextActive(table);
      }

      this.setTable(table);
      this.checkAndHandleRoundEnd(table);
      this.broadcastState();
      return;
    }

    if (action.type === 'play_cards') {
      const cards = action.cards;
      if (!cards || cards.length === 0) {
        this.sendTo(playerId, { type: 'error', message: 'Must play at least one card' });
        return;
      }

      // Validate all cards are same rank
      const rank = cards[0].rank;
      if (!cards.every(c => c.rank === rank)) {
        this.sendTo(playerId, { type: 'error', message: 'All cards must be the same rank' });
        return;
      }

      // Validate player has these cards
      for (const card of cards) {
        const idx = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (idx === -1) {
          this.sendTo(playerId, { type: 'error', message: 'You do not have that card' });
          return;
        }
      }

      // If pile is not empty, validate count and rank
      if (table.pile.length > 0) {
        if (cards.length !== table.pilePlayCount) {
          this.sendTo(playerId, { type: 'error', message: `Must play exactly ${table.pilePlayCount} card(s)` });
          return;
        }
        const topRank = table.pile[table.pile.length - 1].rank;
        if (presidentValue(rank) <= presidentValue(topRank)) {
          this.sendTo(playerId, { type: 'error', message: 'Must play higher ranked cards' });
          return;
        }
      } else {
        // Fresh pile - set the count
        table.pilePlayCount = cards.length;
      }

      // Remove cards from hand
      for (const card of cards) {
        const idx = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (idx !== -1) player.hand.splice(idx, 1);
      }

      // Add to pile
      table.pile.push(...cards);
      table.lastPlayerId = playerId;
      table.passedPlayers.clear();

      // Check if player is now out of cards
      if (player.hand.length === 0) {
        table.finishOrder.push(playerId);
      }

      this.advanceToNextActive(table);
      this.setTable(table);
      this.checkAndHandleRoundEnd(table);
      this.broadcastState();
      return;
    }
  }

  private advanceToNextActive(table: PresidentTableState): void {
    const active = this.turnOrder.filter(
      id => !table.finishOrder.includes(id) && !table.passedPlayers.has(id)
    );

    if (active.length === 0) return;

    const currentIdx = this.turnOrder.indexOf(this.currentTurn || '');
    let nextIdx = (currentIdx + 1) % this.turnOrder.length;

    // Find next active player
    for (let i = 0; i < this.turnOrder.length; i++) {
      const candidateId = this.turnOrder[nextIdx];
      if (!table.finishOrder.includes(candidateId) && !table.passedPlayers.has(candidateId)) {
        this.currentTurn = candidateId;
        return;
      }
      nextIdx = (nextIdx + 1) % this.turnOrder.length;
    }
  }

  private checkAndHandleRoundEnd(table: PresidentTableState): void {
    const activePlayers = this.turnOrder.filter(id => !table.finishOrder.includes(id));

    if (activePlayers.length <= 1) {
      // Last player standing is the loser
      if (activePlayers.length === 1) {
        table.finishOrder.push(activePlayers[0]);
      }

      // Assign titles
      const titles: Record<string, string> = {};
      for (let i = 0; i < table.finishOrder.length; i++) {
        titles[table.finishOrder[i]] = getTitleForPosition(i, table.finishOrder.length);
      }
      table.titles = titles;

      this.setTable(table);
      this.phase = 'round_over';

      // Record D1 stats - President (first out) is the winner
      const winnerId = table.finishOrder[0] || null;
      this.recordGameEnd(winnerId).catch(() => {});
    }
  }

  protected checkRoundEnd(): string | null {
    const table = this.getTable();
    const activePlayers = this.turnOrder.filter(id => !table.finishOrder.includes(id));
    if (activePlayers.length <= 1) {
      return table.finishOrder[0] || null;
    }
    return null;
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
    }));

    return {
      code: this.code,
      phase: this.phase,
      players,
      turnOrder: this.turnOrder,
      currentTurn: this.currentTurn,
      roundNumber: this.roundNumber,
      scores: Object.fromEntries(this.scores),
      tableState: {
        pile: table.pile,
        pilePlayCount: table.pilePlayCount,
        finishOrder: table.finishOrder,
        titles: table.titles,
        myHand: player?.hand || [],
        passedPlayers: Array.from(table.passedPlayers),
      },
    };
  }
}
