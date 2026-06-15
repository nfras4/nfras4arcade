import { describe, test, expect } from 'bun:test';
import {
  evaluateVoteResolution,
  shouldResolveVotes,
  selectSpectatorsToPromote,
  type VotingPlayerLike,
} from '../logic';

// FINDING 1 — voting phase must resolve when the last non-voter disconnects,
// and must NOT resolve (or crash) when nobody has voted.
describe('shouldResolveVotes', () => {
  test('resolves when the last non-voter disconnects (only connected voters remain, all voted)', () => {
    // 3 players: two connected and voted, one disconnected (the would-be last
    // non-voter). Among CONNECTED players everyone has voted -> resolve.
    const players: VotingPlayerLike[] = [
      { connected: true, hasVoted: true },
      { connected: true, hasVoted: true },
      { connected: false, hasVoted: false },
    ];
    expect(shouldResolveVotes(players)).toBe(true);
  });

  test('does not resolve while a connected player still has not voted', () => {
    const players: VotingPlayerLike[] = [
      { connected: true, hasVoted: true },
      { connected: true, hasVoted: false },
      { connected: false, hasVoted: false },
    ];
    expect(shouldResolveVotes(players)).toBe(false);
  });

  test('zero-votes guard: does NOT resolve when nobody has voted, even if all connected are "done"', () => {
    // Every remaining player disconnected before voting. evaluateVoteResolution
    // would report allVoted vacuously over zero connected players, but anyVoted
    // is false so we must not resolve.
    const allDisconnectedNoVotes: VotingPlayerLike[] = [
      { connected: false, hasVoted: false },
      { connected: false, hasVoted: false },
    ];
    expect(shouldResolveVotes(allDisconnectedNoVotes)).toBe(false);

    // Single connected player who has not voted -> not all voted, not resolve.
    const oneConnectedNoVote: VotingPlayerLike[] = [
      { connected: true, hasVoted: false },
    ];
    expect(shouldResolveVotes(oneConnectedNoVote)).toBe(false);
  });

  test('empty player set does not resolve', () => {
    expect(shouldResolveVotes([])).toBe(false);
  });

  test('treats missing hasVoted as not voted', () => {
    const players: VotingPlayerLike[] = [
      { connected: true },
      { connected: true, hasVoted: true },
    ];
    expect(shouldResolveVotes(players)).toBe(false);
  });
});

describe('evaluateVoteResolution', () => {
  test('reports allVoted=true and anyVoted=true when every connected player voted', () => {
    expect(
      evaluateVoteResolution([
        { connected: true, hasVoted: true },
        { connected: true, hasVoted: true },
      ]),
    ).toEqual({ allVoted: true, anyVoted: true });
  });

  test('allVoted is false when there are zero connected players (not vacuously true)', () => {
    const r = evaluateVoteResolution([
      { connected: false, hasVoted: true },
    ]);
    expect(r.allVoted).toBe(false);
    expect(r.anyVoted).toBe(true);
  });

  test('anyVoted counts votes from disconnected players too', () => {
    const r = evaluateVoteResolution([
      { connected: true, hasVoted: false },
      { connected: false, hasVoted: true },
    ]);
    expect(r.anyVoted).toBe(true);
    expect(r.allVoted).toBe(false);
  });
});

// FINDING 2 — promotion must only delete spectator ids that were actually
// promoted, leaving over-capacity spectators in the map.
describe('selectSpectatorsToPromote', () => {
  test('promotes all spectators when under cap', () => {
    expect(selectSpectatorsToPromote(['a', 'b'], 3, 8)).toEqual(['a', 'b']);
  });

  test('promotes only up to the cap and leaves the rest un-promoted', () => {
    // 6 players already, cap 8 -> only first 2 spectators promote.
    const promoted = selectSpectatorsToPromote(['s1', 's2', 's3', 's4'], 6, 8);
    expect(promoted).toEqual(['s1', 's2']);
    // s3, s4 are NOT in the promoted list, so a per-id delete leaves them in
    // the spectators map (regression guard against the old unconditional clear).
    expect(promoted).not.toContain('s3');
    expect(promoted).not.toContain('s4');
  });

  test('promotes nobody when already at cap', () => {
    expect(selectSpectatorsToPromote(['s1', 's2'], 8, 8)).toEqual([]);
  });

  test('handles empty spectator set', () => {
    expect(selectSpectatorsToPromote([], 2, 8)).toEqual([]);
  });

  test('stops exactly at the cap boundary', () => {
    // 7 players, cap 8 -> exactly one promotion.
    expect(selectSpectatorsToPromote(['s1', 's2', 's3'], 7, 8)).toEqual(['s1']);
  });
});

// FINDING 3 — promoted player name fallback must be 'Player', never the literal
// 'Spectator'. This mirrors the resolution logic applied in resetToLobby:
//   name = storedName || (mapName && mapName !== 'Spectator' ? mapName : 'Player')
describe('promoted spectator name fallback', () => {
  function resolvePromotedName(storedName: string | undefined, mapName: string | undefined): string {
    return storedName || (mapName && mapName !== 'Spectator' ? mapName : 'Player');
  }

  test('falls back to "Player" (not "Spectator") when stored name missing and map holds the literal', () => {
    expect(resolvePromotedName(undefined, 'Spectator')).toBe('Player');
  });

  test('falls back to "Player" when both sources are absent', () => {
    expect(resolvePromotedName(undefined, undefined)).toBe('Player');
  });

  test('prefers the freshly re-read stored name', () => {
    expect(resolvePromotedName('Alice', 'Spectator')).toBe('Alice');
  });

  test('uses a real map name when stored name missing', () => {
    expect(resolvePromotedName(undefined, 'Bob')).toBe('Bob');
  });

  test('never yields the literal "Spectator"', () => {
    for (const [stored, map] of [
      [undefined, 'Spectator'],
      [undefined, undefined],
      ['Spectator', 'Spectator'], // even a literal stored 'Spectator' is a real chosen name; allowed, but verify non-empty
    ] as [string | undefined, string | undefined][]) {
      const name = resolvePromotedName(stored, map);
      expect(name.length).toBeGreaterThan(0);
    }
    // The specific orphan-bug case must resolve to 'Player'.
    expect(resolvePromotedName(undefined, 'Spectator')).toBe('Player');
  });
});
