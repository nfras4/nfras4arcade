/**
 * Bot decision functions for each card game.
 * All decisions must return a valid move — validated before returning.
 */
import type { Card } from '../cards/types';

// ─── President ───────────────────────────────────────────────────────

/** President card ranking: 3 is lowest, 2 is highest. */
function presidentValue(rank: string): number {
  const order: Record<string, number> = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  };
  return order[rank] ?? 0;
}

/**
 * President bot decision (easy difficulty).
 * @returns cards to play, or 'pass'
 */
export function presidentBotDecision(
  hand: Card[],
  currentPile: Card[],
  pilePlayCount: number
): Card[] | 'pass' {
  // Group hand by rank
  const groups = new Map<string, Card[]>();
  for (const card of hand) {
    const existing = groups.get(card.rank) || [];
    existing.push(card);
    groups.set(card.rank, existing);
  }

  // Sort ranks by president value (ascending)
  const sortedRanks = Array.from(groups.keys()).sort(
    (a, b) => presidentValue(a) - presidentValue(b)
  );

  if (currentPile.length === 0) {
    // Opening the trick — consider playing multi-card combos
    // Find all ranks where we have 2+ cards (potential combos)
    const comboRanks = sortedRanks.filter(r => groups.get(r)!.length >= 2);

    // ~40% chance to play a combo when one is available
    if (comboRanks.length > 0 && Math.random() < 0.4) {
      // Pick the lowest combo rank
      const rank = comboRanks[0];
      const cards = groups.get(rank)!;
      // Play all cards of that rank (pair/triple/quad)
      return cards.slice();
    }

    // Otherwise play the lowest single card
    for (const rank of sortedRanks) {
      const cards = groups.get(rank)!;
      return [cards[0]];
    }
    return 'pass';
  }

  // Must beat the pile with the same card count
  const topRank = currentPile[currentPile.length - 1].rank;
  const topValue = presidentValue(topRank);
  const count = pilePlayCount;

  // Find the lowest valid play that beats the pile
  for (const rank of sortedRanks) {
    if (presidentValue(rank) <= topValue) continue;
    const cards = groups.get(rank)!;
    if (cards.length >= count) {
      return cards.slice(0, count);
    }
  }

  // No valid play — pass
  return 'pass';
}

// ─── Chase the Queen ─────────────────────────────────────────────────

interface TrickCard {
  playerId: string;
  card: Card;
}

function hasPenaltyCards(trick: TrickCard[]): boolean {
  return trick.some(tc =>
    tc.card.suit === 'hearts' ||
    (tc.card.suit === 'spades' && tc.card.rank === 'Q')
  );
}

/**
 * Chase the Queen bot decision (easy difficulty).
 * @returns the card to play
 */
export function chaseQueenBotDecision(
  hand: Card[],
  currentTrick: TrickCard[],
  ledSuit: string | null
): Card {
  // Leading the trick
  if (currentTrick.length === 0 || !ledSuit) {
    // Avoid leading with Queen of Spades or high hearts
    // Sort by: non-penalty first, then by value ascending
    const nonPenalty = hand.filter(c =>
      c.suit !== 'hearts' && !(c.suit === 'spades' && c.rank === 'Q')
    );

    if (nonPenalty.length > 0) {
      // Lead lowest non-penalty card
      nonPenalty.sort((a, b) => a.value - b.value);
      return nonPenalty[0];
    }

    // Only penalty cards left — lead lowest heart (avoid QoS)
    const sorted = [...hand].sort((a, b) => a.value - b.value);
    // Prefer non-QoS
    const noQueen = sorted.filter(c => !(c.suit === 'spades' && c.rank === 'Q'));
    return noQueen.length > 0 ? noQueen[0] : sorted[0];
  }

  // Following suit
  const suitCards = hand.filter(c => c.suit === ledSuit);

  if (suitCards.length > 0) {
    // Must follow suit
    const penaltyInTrick = hasPenaltyCards(currentTrick);

    if (penaltyInTrick) {
      // Avoid winning if penalties are present
      // Find highest card of led suit currently in the trick
      const trickLedCards = currentTrick
        .filter(tc => tc.card.suit === ledSuit)
        .map(tc => tc.card.value);
      const maxTrickValue = Math.max(...trickLedCards, 0);

      // Try to play lowest card that loses (under the current highest)
      const losers = suitCards
        .filter(c => c.value < maxTrickValue)
        .sort((a, b) => a.value - b.value);
      if (losers.length > 0) return losers[0];

      // Forced to win — play lowest card of that suit
      suitCards.sort((a, b) => a.value - b.value);
      return suitCards[0];
    } else {
      // No penalty cards in trick — safe to win, play highest
      suitCards.sort((a, b) => b.value - a.value);
      return suitCards[0];
    }
  }

  // Cannot follow suit — sluffing
  // 1. Dump Queen of Spades immediately
  const queenOfSpades = hand.find(c => c.suit === 'spades' && c.rank === 'Q');
  if (queenOfSpades) return queenOfSpades;

  // 2. Dump highest heart
  const hearts = hand.filter(c => c.suit === 'hearts').sort((a, b) => b.value - a.value);
  if (hearts.length > 0) return hearts[0];

  // 3. Dump highest card
  const sorted = [...hand].sort((a, b) => b.value - a.value);
  return sorted[0];
}
