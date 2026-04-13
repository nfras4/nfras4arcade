import type { Card } from '../cards/types';

export interface HandValue {
  value: number;
  soft: boolean;
}

/** Calculate the best blackjack hand value. Aces count as 11 unless that would bust. */
export function calculateHandValue(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
      total += 10;
    } else {
      total += parseInt(card.rank, 10);
    }
  }

  // Convert aces from 11 to 1 as needed to avoid bust
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { value: total, soft: aces > 0 };
}

/** Check if a hand is a natural blackjack (exactly 2 cards totaling 21). */
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && calculateHandValue(cards).value === 21;
}

/** Check if a hand is busted. */
export function isBusted(cards: Card[]): boolean {
  return calculateHandValue(cards).value > 21;
}

/** Determine if dealer should hit based on house rules: hit soft 16, stand soft 17. */
export function dealerShouldHit(cards: Card[]): boolean {
  const { value, soft } = calculateHandValue(cards);
  if (value < 17) return true;
  if (value === 17 && soft) return false; // Stand on soft 17
  return false;
}
