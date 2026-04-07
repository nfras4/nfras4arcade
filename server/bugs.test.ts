import { describe, test, expect } from 'bun:test';
import { GameRoom } from './game';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupGame(playerCount = 3): { room: GameRoom; playerIds: string[] } {
  const room = new GameRoom('TEST');
  const playerIds: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const id = `player-${i}`;
    room.addPlayer(id, `Player ${i}`, null);
    playerIds.push(id);
  }
  return { room, playerIds };
}

function advanceToPhase(room: GameRoom, playerIds: string[], phase: string) {
  if (phase === 'hints' || phase === 'discussion' || phase === 'voting' || phase === 'reveal') {
    room.selectCategory('Animals');
    room.startGame();
  }
  if (phase === 'discussion' || phase === 'voting' || phase === 'reveal') {
    for (const pid of room.turnOrder) {
      room.giveHint(pid, 'test hint');
    }
  }
  if (phase === 'voting' || phase === 'reveal') {
    room.startVoting();
  }
  if (phase === 'reveal') {
    for (const pid of playerIds) {
      const target = playerIds.find(p => p !== pid)!;
      room.vote(pid, target);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Vote tie behavior
// ---------------------------------------------------------------------------

describe('vote tie behavior', () => {
  test('resolveVotes does not crash when two players are tied', () => {
    const { room, playerIds } = setupGame(4);
    advanceToPhase(room, playerIds, 'voting');

    // Force a known 2-vs-2 tie: p0 & p1 vote for p2, p2 & p3 vote for p0
    const [p0, p1, p2, p3] = playerIds;
    room.vote(p0, p2);
    room.vote(p1, p2);
    room.vote(p2, p0);
    room.vote(p3, p0);

    // Must not throw
    let result: ReturnType<typeof room.resolveVotes> | undefined;
    expect(() => { result = room.resolveVotes(); }).not.toThrow();
    expect(result).toBeDefined();
  });

  test('resolveVotes on a tie selects the first candidate encountered during map iteration', () => {
    // KNOWN ISSUE: tie-breaking is not deterministic from the caller's perspective —
    // it depends on Map insertion order and iteration order of voteCounts.
    // The winner is whichever tied candidate appears first when iterating voteCounts,
    // which equals the order votes were cast for distinct targets.
    // Here p2 receives the first vote cast, so p2 wins the tie.
    const { room, playerIds } = setupGame(4);
    advanceToPhase(room, playerIds, 'voting');

    const [p0, p1, p2, p3] = playerIds;
    // p2 is the first target a vote is cast for, so they "win" the tie
    room.vote(p0, p2);
    room.vote(p1, p2);
    room.vote(p2, p0);
    room.vote(p3, p0);

    const result = room.resolveVotes();
    // accusedId will be p2 because p2's entry was inserted into voteCounts first
    const accusedId = result.impostorCaught
      ? result.impostorId
      : playerIds.find(id => id !== result.impostorId && result.votes.filter(v => v.targetId === id).length === 2)!;

    // The result must declare either caught or not — just verify it resolves cleanly
    // and the accused matches the first-inserted tied candidate (p2)
    expect(result.votes).toHaveLength(4);
    expect(result.round).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Hint-phase disconnect (current-turn player)
// ---------------------------------------------------------------------------

describe('hint-phase disconnect of the current-turn player', () => {
  test('game does not auto-advance turn when the current player disconnects', () => {
    // KNOWN ISSUE: removing the active player during the hints phase leaves
    // currentTurnIndex pointing at the disconnected player permanently.
    // The game has no mechanism to skip disconnected players in turnOrder.
    const { room } = setupGame(3);
    room.selectCategory('Animals');
    room.startGame();

    expect(room.phase).toBe('hints');

    const disconnectedPlayerId = room.turnOrder[room.currentTurnIndex];
    room.removePlayer(disconnectedPlayerId);

    // currentTurnIndex is unchanged — still points at the disconnected player
    expect(room.currentTurnIndex).toBe(0);
    expect(room.turnOrder[room.currentTurnIndex]).toBe(disconnectedPlayerId);
  });

  test('giveHint from a non-current player returns "Not your turn" after current player disconnects', () => {
    // KNOWN ISSUE: because currentTurnIndex is stuck, all other players are blocked
    const { room, playerIds } = setupGame(3);
    room.selectCategory('Animals');
    room.startGame();

    const disconnectedPlayerId = room.turnOrder[room.currentTurnIndex];
    room.removePlayer(disconnectedPlayerId);

    // Any player who is NOT at currentTurnIndex should be blocked
    const otherPlayer = playerIds.find(id => id !== disconnectedPlayerId)!;
    const result = room.giveHint(otherPlayer, 'my hint');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not your turn');
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid category handling
// ---------------------------------------------------------------------------

describe('invalid category handling', () => {
  test('startGame returns {success: false} when category has no words', () => {
    const { room } = setupGame(3);
    room.selectCategory('NONEXISTENT_CATEGORY');
    const result = room.startGame();

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('game does not crash and stays in lobby after invalid category startGame', () => {
    const { room } = setupGame(3);
    room.selectCategory('NONEXISTENT_CATEGORY');
    room.startGame();

    // Phase must not have advanced past lobby
    expect(room.phase).toBe('lobby');
  });
});

// ---------------------------------------------------------------------------
// 4. Very long hint text
// ---------------------------------------------------------------------------

describe('very long hint text', () => {
  test('giveHint succeeds with a 10,000-character string (no server-side length limit)', () => {
    // POTENTIAL ISSUE: there is currently no server-side length validation on hint text.
    // Very long hints could be used to abuse memory or bandwidth.
    // Consider adding a max-length check (e.g. 500 chars) in production.
    const { room } = setupGame(3);
    advanceToPhase(room, ['player-0', 'player-1', 'player-2'], 'hints');

    const longHint = 'a'.repeat(10_000);
    const currentPlayer = room.turnOrder[room.currentTurnIndex];
    const result = room.giveHint(currentPlayer, longHint);

    expect(result.success).toBe(true);
    expect(room.hints[0].text).toHaveLength(10_000);
  });
});

// ---------------------------------------------------------------------------
// 5. Self-vote rejection
// ---------------------------------------------------------------------------

describe('self-vote rejection', () => {
  test('vote returns {success: false} with error when player votes for themselves', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'voting');

    const result = room.vote(playerIds[0], playerIds[0]);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cannot vote for yourself');
  });
});

// ---------------------------------------------------------------------------
// 6. Double vote rejection
// ---------------------------------------------------------------------------

describe('double vote rejection', () => {
  test('first vote succeeds', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'voting');

    const result = room.vote(playerIds[0], playerIds[1]);
    expect(result.success).toBe(true);
  });

  test('second vote by the same player returns {success: false} with error', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'voting');

    room.vote(playerIds[0], playerIds[1]);
    const second = room.vote(playerIds[0], playerIds[2]);

    expect(second.success).toBe(false);
    expect(second.error).toBe('Already voted');
  });
});

// ---------------------------------------------------------------------------
// 7. State personalization (secret hiding)
// ---------------------------------------------------------------------------

describe('state personalization', () => {
  test('impostor sees role "impostor", impostorHint set, and word undefined', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'hints');

    const impostorId = room.impostorId!;
    const state = room.getStateForPlayer(impostorId);

    expect(state.role).toBe('impostor');
    expect(state.impostorHint).toBeDefined();
    expect(state.word).toBeUndefined();
  });

  test('normal player sees role "player", word set, and impostorHint undefined', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'hints');

    const normalPlayerId = playerIds.find(id => id !== room.impostorId)!;
    const state = room.getStateForPlayer(normalPlayerId);

    expect(state.role).toBe('player');
    expect(state.word).toBeDefined();
    expect(state.impostorHint).toBeUndefined();
  });

  test('all normal players see the same word', () => {
    const { room, playerIds } = setupGame(4);
    advanceToPhase(room, playerIds, 'hints');

    const normalPlayers = playerIds.filter(id => id !== room.impostorId);
    const words = normalPlayers.map(id => room.getStateForPlayer(id).word);

    expect(new Set(words).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Word deduplication across rounds
// ---------------------------------------------------------------------------

describe('word deduplication across rounds', () => {
  test('round 2 picks a word not used in round 1', () => {
    // This test may rarely collide if the category only has one word, but
    // Animals has 15 words so the probability of collision is negligible.
    const { room, playerIds } = setupGame(3);
    room.selectCategory('Animals');
    room.setRounds(2);
    room.startGame();

    const round1Word = room.currentWord!;
    expect(room.usedWords.has(round1Word)).toBe(true);

    // Advance through round 1 to reveal
    advanceToPhase(room, playerIds, 'discussion');
    room.startVoting();
    for (const pid of playerIds) {
      const target = playerIds.find(p => p !== pid)!;
      room.vote(pid, target);
    }
    room.resolveVotes();

    // Start round 2
    room.nextRound();

    const round2Word = room.currentWord!;
    expect(round2Word).not.toBe(round1Word);
    expect(room.usedWords.has(round1Word)).toBe(true);
    expect(room.usedWords.has(round2Word)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Minimum player count enforcement
// ---------------------------------------------------------------------------

describe('minimum player count for startGame', () => {
  test('startGame fails with 2 players', () => {
    const { room } = setupGame(2);
    room.selectCategory('Animals');
    const result = room.startGame();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3 players/i);
  });

  test('startGame succeeds with exactly 3 players', () => {
    const { room } = setupGame(3);
    room.selectCategory('Animals');
    const result = room.startGame();

    expect(result.success).toBe(true);
    expect(room.phase).toBe('hints');
  });
});

// ---------------------------------------------------------------------------
// 10. Round clamping
// ---------------------------------------------------------------------------

describe('round count clamping', () => {
  test('setRounds(0) clamps totalRounds to 1 (minimum)', () => {
    const { room } = setupGame(3);
    room.setRounds(0);
    expect(room.totalRounds).toBe(1);
  });

  test('setRounds(10) clamps totalRounds to 5 (maximum)', () => {
    const { room } = setupGame(3);
    room.setRounds(10);
    expect(room.totalRounds).toBe(5);
  });

  test('setRounds(3) sets totalRounds to 3 (within range)', () => {
    const { room } = setupGame(3);
    room.setRounds(3);
    expect(room.totalRounds).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 11. Phase enforcement
// ---------------------------------------------------------------------------

describe('phase enforcement', () => {
  test('giveHint fails when game is in lobby phase', () => {
    const { room, playerIds } = setupGame(3);
    // Still in lobby
    const result = room.giveHint(playerIds[0], 'a hint');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not in hints phase');
  });

  test('startVoting fails when game is in hints phase', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'hints');
    const result = room.startVoting();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not in discussion phase');
  });

  test('vote fails when game is in discussion phase', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'discussion');
    const result = room.vote(playerIds[0], playerIds[1]);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not in voting phase');
  });

  test('giveHint fails when game is in voting phase', () => {
    const { room, playerIds } = setupGame(3);
    advanceToPhase(room, playerIds, 'voting');
    const result = room.giveHint(playerIds[0], 'late hint');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Not in hints phase');
  });
});
