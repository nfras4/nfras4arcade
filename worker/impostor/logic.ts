// Pure decision helpers for ImpostorRoom, extracted so the disconnect /
// vote-resolution and spectator-promotion edge cases are unit-testable without
// standing up the Durable Object.

/** Minimal shape of a player needed to decide vote resolution. */
export interface VotingPlayerLike {
  connected: boolean;
  hasVoted?: boolean;
}

export interface VoteResolutionState {
  /** Every CONNECTED player has cast a vote. */
  allVoted: boolean;
  /** At least one player (connected or not) has cast a vote. */
  anyVoted: boolean;
}

/**
 * Evaluate voting completion over CONNECTED players only. Mirrors the inline
 * checks in vote()/handlePlayerLeave but adds an explicit anyVoted flag so the
 * caller can guard against resolving a round where nobody voted (e.g. every
 * remaining player disconnected mid-vote).
 *
 * Note: a room with zero connected players returns allVoted=true vacuously
 * (every() over an empty set), so callers MUST also require anyVoted before
 * resolving.
 */
export function evaluateVoteResolution(
  players: Iterable<VotingPlayerLike>,
): VoteResolutionState {
  let connectedCount = 0;
  let connectedVoted = 0;
  let anyVoted = false;
  for (const p of players) {
    if (p.hasVoted) anyVoted = true;
    if (p.connected) {
      connectedCount++;
      if (p.hasVoted) connectedVoted++;
    }
  }
  const allVoted = connectedCount > 0 && connectedVoted === connectedCount;
  return { allVoted, anyVoted };
}

/**
 * True when the voting round should resolve now: every connected player has
 * voted AND at least one vote was actually cast. The anyVoted guard prevents a
 * crash / mis-resolve when every remaining player disconnects before voting.
 */
export function shouldResolveVotes(players: Iterable<VotingPlayerLike>): boolean {
  const { allVoted, anyVoted } = evaluateVoteResolution(players);
  return allVoted && anyVoted;
}

/**
 * Decide which spectator ids get promoted to players on round restart, honoring
 * the player cap. Spectators beyond the cap are intentionally left out so the
 * caller can keep them in the spectators map (preserving their banner +
 * read-only state) instead of orphaning them. Mirrors cardRoom's promotedIds
 * pattern.
 */
export function selectSpectatorsToPromote(
  spectatorIds: Iterable<string>,
  currentPlayerCount: number,
  maxPlayers: number,
): string[] {
  const promoted: string[] = [];
  let count = currentPlayerCount;
  for (const id of spectatorIds) {
    if (count >= maxPlayers) break;
    promoted.push(id);
    count++;
  }
  return promoted;
}
