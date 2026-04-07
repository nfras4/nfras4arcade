import type { Card, Suit, Rank } from './types';

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Default numeric values: 2=2 ... 10=10, J=11, Q=12, K=13, A=14 */
const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

/** Create a standard 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle using crypto.getRandomValues (Workers-compatible). */
export function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  const randomBytes = crypto.getRandomValues(new Uint32Array(arr.length));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal cards from a deck into hands.
 * @param deck - shuffled deck to deal from
 * @param playerCount - number of players
 * @param cardsEach - cards per player. If omitted, deals entire deck evenly (remainder to first player).
 * @returns Array of hands (one per player), and remaining deck.
 */
export function dealHands(
  deck: Card[],
  playerCount: number,
  cardsEach?: number
): { hands: Card[][]; remaining: Card[] } {
  const remaining = [...deck];
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);

  if (cardsEach !== undefined) {
    for (let c = 0; c < cardsEach; c++) {
      for (let p = 0; p < playerCount; p++) {
        const card = remaining.shift();
        if (card) hands[p].push(card);
      }
    }
  } else {
    // Deal entire deck, remainder to first player
    let p = 0;
    while (remaining.length > 0) {
      hands[p % playerCount].push(remaining.shift()!);
      p++;
    }
  }

  return { hands, remaining };
}
