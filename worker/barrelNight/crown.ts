// Barrel Night crown-recipient selection. Pure + framework-free so it can be
// unit-tested without standing up the Durable Object.
//
// Rule (see .omc/plans/barrel-night-match-routing-ux.md):
//   - winner is an eligible human          -> the winner
//   - winner is a bot but humans played    -> the last eligible human eliminated
//   - no eligible human ever played        -> null (no crown; bots never hold it)
//
// "Eligible human" = a logged-in account (not a bot, not a guest) — only those
// have a player_profiles row the crown can attach to.

export interface PickWinnerInput {
  /** id of the player who won the underlying liar's dice game (last standing). */
  winnerId: string | null;
  /** ids that are eligible humans (logged-in, non-bot, non-guest). */
  eligible: Set<string>;
  /** ids of eligible humans in the order they were eliminated (earliest first). */
  humanElimOrder: string[];
}

export function pickBarrelNightWinner(input: PickWinnerInput): string | null {
  const { winnerId, eligible, humanElimOrder } = input;

  // The game winner, if they're an eligible human, takes the crown outright.
  if (winnerId && eligible.has(winnerId)) return winnerId;

  // Otherwise the best-placing human is the one eliminated last.
  for (let i = humanElimOrder.length - 1; i >= 0; i--) {
    const id = humanElimOrder[i];
    if (eligible.has(id)) return id;
  }

  // No eligible human played — no crown this week.
  return null;
}
