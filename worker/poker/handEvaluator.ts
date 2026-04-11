/**
 * Texas Hold'em hand evaluation.
 * Pure functions — no Durable Object dependencies.
 */
import type { Card } from '../cards/types';

export enum HandRank {
  HIGH_CARD = 0,
  ONE_PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

export interface HandResult {
  rank: HandRank;
  highCards: number[]; // For tiebreaking, sorted descending
  description: string; // e.g. "Full House, Kings over Tens"
}

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

const RANK_NAME: Record<number, string> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes',
  7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens',
  11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

const RANK_NAME_SINGULAR: Record<number, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six',
  7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

function rankValue(card: Card): number {
  return RANK_VALUE[card.rank] ?? 0;
}

/** Generate all C(n, k) combinations from an array. */
function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const combo: T[] = [];

  function backtrack(start: number): void {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return result;
}

/** Evaluate exactly 5 cards. */
export function evaluate5(cards: Card[]): HandResult {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  // Check flush
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;

  // Normal straight check
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }

  // Ace-low straight (A-2-3-4-5): values would be [14, 5, 4, 3, 2]
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Straight flush / Royal flush
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { rank: HandRank.ROYAL_FLUSH, highCards: [14], description: 'Royal Flush' };
    }
    return {
      rank: HandRank.STRAIGHT_FLUSH,
      highCards: [straightHigh],
      description: `Straight Flush, ${RANK_NAME_SINGULAR[straightHigh]} high`,
    };
  }

  // Count rank occurrences
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  const entries = Array.from(counts.entries()).sort((a, b) => {
    // Sort by count desc, then value desc
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const pattern = entries.map(e => e[1]).join(',');

  // Four of a kind
  if (pattern === '4,1') {
    return {
      rank: HandRank.FOUR_OF_A_KIND,
      highCards: [entries[0][0], entries[1][0]],
      description: `Four of a Kind, ${RANK_NAME[entries[0][0]]}`,
    };
  }

  // Full house
  if (pattern === '3,2') {
    return {
      rank: HandRank.FULL_HOUSE,
      highCards: [entries[0][0], entries[1][0]],
      description: `Full House, ${RANK_NAME[entries[0][0]]} over ${RANK_NAME[entries[1][0]]}`,
    };
  }

  // Flush
  if (isFlush) {
    return {
      rank: HandRank.FLUSH,
      highCards: values,
      description: `Flush, ${RANK_NAME_SINGULAR[values[0]]} high`,
    };
  }

  // Straight
  if (isStraight) {
    return {
      rank: HandRank.STRAIGHT,
      highCards: [straightHigh],
      description: `Straight, ${RANK_NAME_SINGULAR[straightHigh]} high`,
    };
  }

  // Three of a kind
  if (pattern === '3,1,1') {
    const kickers = entries.filter(e => e[1] === 1).map(e => e[0]).sort((a, b) => b - a);
    return {
      rank: HandRank.THREE_OF_A_KIND,
      highCards: [entries[0][0], ...kickers],
      description: `Three of a Kind, ${RANK_NAME[entries[0][0]]}`,
    };
  }

  // Two pair
  if (pattern === '2,2,1') {
    const pairs = entries.filter(e => e[1] === 2).map(e => e[0]).sort((a, b) => b - a);
    const kicker = entries.find(e => e[1] === 1)![0];
    return {
      rank: HandRank.TWO_PAIR,
      highCards: [...pairs, kicker],
      description: `Two Pair, ${RANK_NAME[pairs[0]]} and ${RANK_NAME[pairs[1]]}`,
    };
  }

  // One pair
  if (pattern === '2,1,1,1') {
    const pairVal = entries[0][0];
    const kickers = entries.filter(e => e[1] === 1).map(e => e[0]).sort((a, b) => b - a);
    return {
      rank: HandRank.ONE_PAIR,
      highCards: [pairVal, ...kickers],
      description: `Pair of ${RANK_NAME[pairVal]}`,
    };
  }

  // High card
  return {
    rank: HandRank.HIGH_CARD,
    highCards: values,
    description: `High Card, ${RANK_NAME_SINGULAR[values[0]]}`,
  };
}

/**
 * Find the best 5-card hand from hole cards + community cards.
 * Generates all C(7,5) = 21 combinations, evaluates each, returns best.
 */
export function evaluateHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  const combos = combinations(allCards, 5);

  let best: HandResult | null = null;
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareHands(result, best) < 0) {
      best = result;
    }
  }

  return best!;
}

/**
 * Compare two hand results.
 * @returns negative = a wins, positive = b wins, 0 = tie
 */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return b.rank - a.rank; // higher rank wins

  // Same rank — compare high cards for tiebreaking
  const len = Math.max(a.highCards.length, b.highCards.length);
  for (let i = 0; i < len; i++) {
    const av = a.highCards[i] ?? 0;
    const bv = b.highCards[i] ?? 0;
    if (av !== bv) return bv - av; // higher card wins
  }

  return 0; // exact tie
}
