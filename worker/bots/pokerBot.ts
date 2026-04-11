/**
 * Poker bot decision logic (easy difficulty).
 * Simple heuristic strategy suitable for a party game.
 */
import type { Card } from '../cards/types';
import { evaluateHand, HandRank } from '../poker/handEvaluator';

const RANK_VALUE: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

function rv(card: Card): number {
  return RANK_VALUE[card.rank] ?? 0;
}

function isPremiumHand(hand: Card[]): boolean {
  if (hand.length !== 2) return false;
  const [a, b] = [rv(hand[0]), rv(hand[1])];
  const high = Math.max(a, b);
  const low = Math.min(a, b);

  // Pairs 10+
  if (a === b && a >= 10) return true;
  // AK, AQ
  if (high === 14 && low >= 12) return true;

  return false;
}

function isDecentHand(hand: Card[]): boolean {
  if (hand.length !== 2) return false;
  const [a, b] = [rv(hand[0]), rv(hand[1])];
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  const suited = hand[0].suit === hand[1].suit;

  // Any pair
  if (a === b) return true;
  // Suited connectors (adjacent ranks, same suit)
  if (suited && Math.abs(a - b) === 1) return true;
  // Two face cards (J+)
  if (high >= 11 && low >= 11) return true;
  // Ace + anything suited
  if (suited && high === 14) return true;

  return false;
}

/** Random float 0..1 using crypto. */
function rand(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
}

/**
 * Get a poker bot action given the current game state.
 * @returns action object with type and optional amount
 */
export function getPokerBotAction(
  hand: Card[],
  communityCards: Card[],
  currentBet: number,
  playerBet: number,
  playerChips: number,
  bigBlind: number,
  bettingRound: string
): { type: string; amount?: number } {
  const toCall = currentBet - playerBet;

  // Pre-flop strategy
  if (bettingRound === 'preflop') {
    if (isPremiumHand(hand)) {
      // Raise 3x big blind
      const raiseAmount = currentBet + bigBlind * 3;
      if (raiseAmount <= playerChips + playerBet) {
        return { type: 'raise', amount: raiseAmount };
      }
      return { type: 'all_in' };
    }

    if (isDecentHand(hand)) {
      if (toCall <= 0) return { type: 'check' };
      return { type: 'call' };
    }

    // Junk hand: fold 60%, call 40%
    if (toCall <= 0) return { type: 'check' };
    if (rand() < 0.6) return { type: 'fold' };
    return { type: 'call' };
  }

  // Post-flop: evaluate actual hand strength
  const result = evaluateHand(hand, communityCards);

  // Strong hand (two pair or better): raise
  if (result.rank >= HandRank.TWO_PAIR) {
    if (toCall <= 0) {
      // Bet ~half pot or 2x BB
      const raiseAmount = currentBet + Math.max(bigBlind * 2, bigBlind);
      if (raiseAmount <= playerChips + playerBet) {
        return { type: 'raise', amount: raiseAmount };
      }
      return { type: 'all_in' };
    }
    return { type: 'call' };
  }

  // Medium hand (one pair): call, check
  if (result.rank >= HandRank.ONE_PAIR) {
    if (toCall <= 0) return { type: 'check' };
    // Call small bets, fold to large ones
    if (toCall <= bigBlind * 4) return { type: 'call' };
    if (rand() < 0.4) return { type: 'call' };
    return { type: 'fold' };
  }

  // Weak hand: check if possible, fold to bets
  if (toCall <= 0) return { type: 'check' };
  if (toCall <= bigBlind && rand() < 0.3) return { type: 'call' };
  return { type: 'fold' };
}
