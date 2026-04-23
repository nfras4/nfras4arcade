/**
 * Pure game-logic helpers for Liar's Dice. Kept free of Durable Object / Env / D1
 * dependencies so they can be unit-tested in isolation under bun:test.
 */

export interface Bid {
  count: number;
  face: number;
  bidderId?: string;
}

export interface BotInput {
  ownDice: number[];
  totalDice: number;
  currentBid: Pick<Bid, 'count' | 'face'> | null;
  onesWild: boolean;
  /** 0..1 probability threshold the bot needs to continue raising (higher = more cautious). */
  bluffThreshold?: number;
  /** Seed source for deterministic tests. If omitted, Math.random is used. */
  random?: () => number;
}

export type BotDecision =
  | { action: 'bid'; count: number; face: number }
  | { action: 'call_liar' };

/**
 * Count how many dice match the bid face. When onesWild is active and the bid
 * face is not 1, dice showing 1 also count as matches. When the bid face IS 1,
 * only exact matches count (no wild self-reference).
 */
export function countBidFace(dice: number[], face: number, onesWild: boolean): number {
  let n = 0;
  for (const d of dice) {
    if (d === face) n++;
    else if (onesWild && face !== 1 && d === 1) n++;
  }
  return n;
}

/**
 * Validate a proposed bid against the rules. Returns null on valid bid, or a
 * human-readable error message string.
 */
export function validateBid(
  count: number,
  face: number,
  totalDice: number,
  currentBid: Pick<Bid, 'count' | 'face'> | null,
): string | null {
  if (!Number.isInteger(count) || count < 1) return 'Bid count must be at least 1';
  if (!Number.isInteger(face) || face < 1 || face > 6) return 'Bid face must be 1 through 6';
  if (count > totalDice) return `Bid count cannot exceed total dice (${totalDice})`;
  if (currentBid) {
    // Real Liar's Dice (common-hand) rule: count can only go up, face can only
    // stay the same or go up, and at least one must strictly increase.
    if (face < currentBid.face) return 'New bid face cannot be lower than the previous face';
    if (count < currentBid.count) return 'New bid count cannot be lower than the previous count';
    if (count === currentBid.count && face === currentBid.face) return 'New bid must raise either the count or the face';
    return null;
  }
  return null;
}

/** Return the turn id that follows `currentId` in `turnOrder`, wrapping around. */
export function nextInTurnOrder(turnOrder: string[], currentId: string | null): string | null {
  if (turnOrder.length === 0) return null;
  if (!currentId) return turnOrder[0];
  const idx = turnOrder.indexOf(currentId);
  if (idx === -1) return turnOrder[0];
  return turnOrder[(idx + 1) % turnOrder.length];
}

/**
 * Easy-difficulty bot decision.
 *
 * Heuristic:
 * - With no current bid: open at the bot's own modal face count (minimum 1).
 * - With a current bid: estimate actual count = own matches + (unseen dice * base rate).
 *   Base rate is 1/6 by default, or 2/6 when onesWild is active and face !== 1.
 *   If estimate < bid.count * bluffThreshold, call liar.
 *   Otherwise raise: prefer +1 count same face; if that would exceed totalDice,
 *   switch to same count with higher face; otherwise fall back to call_liar.
 * - Never calls liar if own matches alone already satisfy the bid.
 * - Never returns a bid with count > totalDice or an invalid face.
 */
export function decideLiarsDiceAction(input: BotInput): BotDecision {
  const { ownDice, totalDice, currentBid, onesWild } = input;
  const random = input.random ?? Math.random;
  const bluffThreshold = input.bluffThreshold ?? 0.85;

  // No current bid: open
  if (!currentBid) {
    const counts: Record<number, number> = {};
    for (const d of ownDice) counts[d] = (counts[d] ?? 0) + 1;
    if (onesWild) {
      // Add wild 1s to each non-1 face count as a planning aid
      const ones = counts[1] ?? 0;
      for (const f of [2, 3, 4, 5, 6]) counts[f] = (counts[f] ?? 0) + ones;
    }
    let bestFace = 2;
    let bestCount = 1;
    for (const f of [2, 3, 4, 5, 6, 1]) {
      const c = counts[f] ?? 0;
      if (c > bestCount) {
        bestCount = c;
        bestFace = f;
      }
    }
    // Sandbag slightly: open with own-face-count, never more than totalDice
    const count = Math.max(1, Math.min(bestCount, totalDice));
    return { action: 'bid', count, face: bestFace };
  }

  const ownMatches = countBidFace(ownDice, currentBid.face, onesWild);
  const unseen = totalDice - ownDice.length;
  const baseRate = onesWild && currentBid.face !== 1 ? 2 / 6 : 1 / 6;
  const expectedTotal = ownMatches + unseen * baseRate;

  // Never call liar if own dice alone already meet the bid
  if (ownMatches >= currentBid.count) {
    return raiseOrFallback(currentBid, totalDice);
  }

  // If the bid is too aspirational, call liar
  if (expectedTotal < currentBid.count * bluffThreshold) {
    return { action: 'call_liar' };
  }

  // Otherwise, roll a raise with some noise so bots don't always pick the same move
  const noise = random();
  if (noise < 0.2 && expectedTotal < currentBid.count) {
    return { action: 'call_liar' };
  }
  return raiseOrFallback(currentBid, totalDice);
}

function raiseOrFallback(currentBid: Pick<Bid, 'count' | 'face'>, totalDice: number): BotDecision {
  // Strict-rule: never pick face below currentBid.face.
  // Try +1 count same face
  if (currentBid.count + 1 <= totalDice) {
    return { action: 'bid', count: currentBid.count + 1, face: currentBid.face };
  }
  // Try same count, higher face
  if (currentBid.face < 6) {
    return { action: 'bid', count: currentBid.count, face: currentBid.face + 1 };
  }
  // No valid raise possible, call liar
  return { action: 'call_liar' };
}
