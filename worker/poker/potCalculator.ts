/**
 * Side-pot calculation for Texas Hold'em.
 * Pure functions — no Durable Object dependencies.
 */

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

/**
 * Calculate main pot and side pots from player bets.
 * Folded players' bets contribute to pots but they cannot win.
 *
 * Algorithm: sort unique bet amounts ascending, create layered pots.
 * Each layer collects (currentTier - previousTier) from every player
 * who bet at least the current tier. Only non-folded players are eligible.
 */
export function calculatePots(
  playerBets: Map<string, number>,
  foldedPlayerIds: Set<string>
): Pot[] {
  // Collect unique non-zero bet amounts, sorted ascending
  const betAmounts = new Set<number>();
  for (const amount of playerBets.values()) {
    if (amount > 0) betAmounts.add(amount);
  }
  const tiers = Array.from(betAmounts).sort((a, b) => a - b);

  if (tiers.length === 0) return [];

  const pots: Pot[] = [];
  let previousTier = 0;

  for (const tier of tiers) {
    const layerAmount = tier - previousTier;
    if (layerAmount <= 0) continue;

    let potTotal = 0;
    const eligible: string[] = [];

    for (const [playerId, bet] of playerBets) {
      if (bet >= tier) {
        potTotal += layerAmount;
        if (!foldedPlayerIds.has(playerId)) {
          eligible.push(playerId);
        }
      }
    }

    if (potTotal > 0) {
      pots.push({ amount: potTotal, eligiblePlayerIds: eligible });
    }

    previousTier = tier;
  }

  // Merge pots that have the same eligible players
  const merged: Pot[] = [];
  for (const pot of pots) {
    const key = pot.eligiblePlayerIds.sort().join(',');
    const existing = merged.find(
      m => m.eligiblePlayerIds.sort().join(',') === key
    );
    if (existing) {
      existing.amount += pot.amount;
    } else {
      merged.push({ ...pot });
    }
  }

  return merged;
}
