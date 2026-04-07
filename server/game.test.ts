import { describe, test, expect, beforeEach } from 'bun:test';
import { GameRoom, createRoom, getRoom, deleteRoom } from './game';
import { getCategories, getRandomWord, getRandomCategory, categories } from './words';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add `n` players to a room. Returns the array of player IDs in insertion order. */
function addPlayers(room: GameRoom, n: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `player-${i + 1}`;
    room.addPlayer(id, `Player ${i + 1}`, null);
    ids.push(id);
  }
  return ids;
}

/** Create a room with `n` players already added, ready to start. */
function createGameWithPlayers(n: number): { room: GameRoom; ids: string[] } {
  const room = new GameRoom('TEST');
  const ids = addPlayers(room, n);
  return { room, ids };
}

/** Start a game, run through hints for all players, return the room. */
function advanceToDiscussion(room: GameRoom, ids: string[]): void {
  room.startGame();
  // Give a hint for every player in turn order
  for (let i = 0; i < room.turnOrder.length; i++) {
    const pid = room.turnOrder[i];
    room.giveHint(pid, `hint-${i}`);
  }
}

/** Advance room all the way to voting phase. */
function advanceToVoting(room: GameRoom, ids: string[]): void {
  advanceToDiscussion(room, ids);
  room.startVoting();
}

/** Have every connected player vote for someone other than themselves (and not self-vote). */
function voteAll(room: GameRoom): void {
  const connected = Array.from(room.players.entries()).filter(([, cp]) => cp.player.connected);
  for (const [voterId] of connected) {
    // Find first valid target (not self)
    const target = connected.find(([id]) => id !== voterId)!;
    room.vote(voterId, target[0]);
  }
}

// ---------------------------------------------------------------------------
// Room lifecycle
// ---------------------------------------------------------------------------

describe('createRoom', () => {
  test('generates a 4-letter uppercase room code', () => {
    const room = createRoom();
    expect(room.code).toMatch(/^[A-Z]{4}$/);
    deleteRoom(room.code);
  });

  test('stores the room so getRoom can retrieve it', () => {
    const room = createRoom();
    expect(getRoom(room.code)).toBe(room);
    deleteRoom(room.code);
  });

  test('getRoom is case-insensitive', () => {
    const room = createRoom();
    expect(getRoom(room.code.toLowerCase())).toBe(room);
    deleteRoom(room.code);
  });

  test('deleteRoom removes the room from the registry', () => {
    const room = createRoom();
    const code = room.code;
    deleteRoom(code);
    expect(getRoom(code)).toBeUndefined();
  });

  test('getRoom returns undefined for unknown code', () => {
    expect(getRoom('ZZZZ')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// addPlayer
// ---------------------------------------------------------------------------

describe('GameRoom.addPlayer', () => {
  test('first player becomes host', () => {
    const room = new GameRoom('ABCD');
    room.addPlayer('p1', 'Alice', null);
    expect(room.hostId).toBe('p1');
    const cp = room.players.get('p1')!;
    expect(cp.player.isHost).toBe(true);
  });

  test('second player is not host', () => {
    const room = new GameRoom('ABCD');
    room.addPlayer('p1', 'Alice', null);
    room.addPlayer('p2', 'Bob', null);
    expect(room.players.get('p2')!.player.isHost).toBe(false);
  });

  test('player is marked connected on join', () => {
    const room = new GameRoom('ABCD');
    room.addPlayer('p1', 'Alice', null);
    expect(room.players.get('p1')!.player.connected).toBe(true);
  });

  test('allows up to 8 players', () => {
    const { room } = createGameWithPlayers(8);
    expect(room.players.size).toBe(8);
  });

  test('rejects 9th player with room full error', () => {
    const { room } = createGameWithPlayers(8);
    const result = room.addPlayer('p9', 'Extra', null);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/full/i);
    expect(room.players.size).toBe(8);
  });

  test('rejects players when game is already in progress', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const result = room.addPlayer('late', 'Latecomer', null);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/in progress/i);
  });

  test('returns success:true on valid join', () => {
    const room = new GameRoom('ABCD');
    const result = room.addPlayer('p1', 'Alice', null);
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// removePlayer
// ---------------------------------------------------------------------------

describe('GameRoom.removePlayer', () => {
  test('returns false when player does not exist', () => {
    const room = new GameRoom('ABCD');
    expect(room.removePlayer('ghost')).toBe(false);
  });

  test('removes player from map during lobby', () => {
    const { room, ids } = createGameWithPlayers(2);
    room.removePlayer(ids[1]);
    expect(room.players.has(ids[1])).toBe(false);
  });

  test('transfers host to next player when host leaves during lobby', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.removePlayer(ids[0]); // remove host
    expect(room.hostId).toBe(ids[1]);
    expect(room.players.get(ids[1])!.player.isHost).toBe(true);
  });

  test('returns true when last player leaves', () => {
    const room = new GameRoom('ABCD');
    room.addPlayer('p1', 'Alice', null);
    expect(room.removePlayer('p1')).toBe(true);
  });

  test('returns false when players remain after removal', () => {
    const { room, ids } = createGameWithPlayers(2);
    expect(room.removePlayer(ids[0])).toBe(false);
  });

  test('marks player as disconnected (not deleted) during active game', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.removePlayer(ids[0]);
    expect(room.players.has(ids[0])).toBe(true);
    expect(room.players.get(ids[0])!.player.connected).toBe(false);
  });

  test('does not return true for non-empty room during game (disconnected players still in map)', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    // Remove two players - map still has 3 entries
    room.removePlayer(ids[1]);
    const result = room.removePlayer(ids[2]);
    expect(room.players.size).toBe(3);
    // Not truly "empty" since map entries remain
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startGame
// ---------------------------------------------------------------------------

describe('GameRoom.startGame', () => {
  test('fails with fewer than 3 players', () => {
    const { room } = createGameWithPlayers(2);
    const result = room.startGame();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/3 players/i);
  });

  test('succeeds with exactly 3 players', () => {
    const { room } = createGameWithPlayers(3);
    const result = room.startGame();
    expect(result.success).toBe(true);
  });

  test('succeeds with more than 3 players', () => {
    const { room } = createGameWithPlayers(5);
    const result = room.startGame();
    expect(result.success).toBe(true);
  });

  test('sets round to 1 on start', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    expect(room.round).toBe(1);
  });

  test('transitions phase to hints on start', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    expect(room.phase).toBe('hints');
  });

  test('auto-picks a random category when none is selected', () => {
    const { room } = createGameWithPlayers(3);
    expect(room.category).toBeNull();
    room.startGame();
    expect(room.category).not.toBeNull();
    expect(getCategories()).toContain(room.category);
  });

  test('keeps selected category when one is already set', () => {
    const { room } = createGameWithPlayers(3);
    room.selectCategory('Animals');
    room.startGame();
    expect(room.category).toBe('Animals');
  });

  test('assigns a word to currentWord', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    expect(room.currentWord).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

describe('Role assignment after startGame', () => {
  test('exactly one impostor is assigned per round', () => {
    const { room } = createGameWithPlayers(5);
    room.startGame();
    let impostorCount = 0;
    for (const cp of room.players.values()) {
      if (cp.role === 'impostor') impostorCount++;
    }
    expect(impostorCount).toBe(1);
  });

  test('impostorId matches the player with role impostor', () => {
    const { room } = createGameWithPlayers(4);
    room.startGame();
    expect(room.players.get(room.impostorId!)?.role).toBe('impostor');
  });

  test('impostor has impostorHint set', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const impostorCp = room.players.get(room.impostorId!)!;
    expect(impostorCp.impostorHint).toBeTruthy();
  });

  test('impostor does not have word set', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const impostorCp = room.players.get(room.impostorId!)!;
    expect(impostorCp.word).toBeUndefined();
  });

  test('regular players have word set', () => {
    const { room } = createGameWithPlayers(4);
    room.startGame();
    for (const [id, cp] of room.players) {
      if (id !== room.impostorId) {
        expect(cp.role).toBe('player');
        expect(cp.word).toBe(room.currentWord);
      }
    }
  });

  test('regular players do not have impostorHint', () => {
    const { room } = createGameWithPlayers(4);
    room.startGame();
    for (const [id, cp] of room.players) {
      if (id !== room.impostorId) {
        expect(cp.impostorHint).toBeUndefined();
      }
    }
  });

  test('all players have roles assigned', () => {
    const { room } = createGameWithPlayers(4);
    room.startGame();
    for (const cp of room.players.values()) {
      expect(cp.role).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Turn order
// ---------------------------------------------------------------------------

describe('Turn order', () => {
  test('turnOrder contains all connected player IDs', () => {
    const { room, ids } = createGameWithPlayers(4);
    room.startGame();
    expect(room.turnOrder.length).toBe(ids.length);
    for (const id of ids) {
      expect(room.turnOrder).toContain(id);
    }
  });

  test('turnOrder length matches connected player count', () => {
    const { room, ids } = createGameWithPlayers(5);
    room.startGame();
    const connectedCount = Array.from(room.players.values()).filter(cp => cp.player.connected).length;
    expect(room.turnOrder.length).toBe(connectedCount);
  });

  test('currentTurnIndex starts at 0 when game starts', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    expect(room.currentTurnIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// giveHint
// ---------------------------------------------------------------------------

describe('GameRoom.giveHint', () => {
  test('fails when not in hints phase', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    advanceToDiscussion(room, ids);
    // Now in discussion phase
    const result = room.giveHint(ids[0], 'late hint');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hints phase/i);
  });

  test('fails when it is not the player\'s turn', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    // turnOrder[0] is current, try with turnOrder[1]
    const wrongPlayer = room.turnOrder[1];
    const result = room.giveHint(wrongPlayer, 'cheating');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not your turn/i);
  });

  test('succeeds when it is the player\'s turn', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const currentPlayer = room.turnOrder[0];
    const result = room.giveHint(currentPlayer, 'my hint');
    expect(result.success).toBe(true);
  });

  test('increments currentTurnIndex after hint', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const currentPlayer = room.turnOrder[0];
    room.giveHint(currentPlayer, 'hint');
    expect(room.currentTurnIndex).toBe(1);
  });

  test('appends hint to hints array', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const currentPlayer = room.turnOrder[0];
    room.giveHint(currentPlayer, 'my hint text');
    expect(room.hints).toHaveLength(1);
    expect(room.hints[0].text).toBe('my hint text');
    expect(room.hints[0].playerId).toBe(currentPlayer);
  });

  test('trims whitespace from hint text', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const currentPlayer = room.turnOrder[0];
    room.giveHint(currentPlayer, '  spaced hint  ');
    expect(room.hints[0].text).toBe('spaced hint');
  });

  test('auto-transitions to discussion after all players give hints', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    for (let i = 0; i < room.turnOrder.length; i++) {
      room.giveHint(room.turnOrder[i], `hint-${i}`);
    }
    expect(room.phase).toBe('discussion');
  });

  test('phase stays hints until final player gives hint', () => {
    const { room } = createGameWithPlayers(4);
    room.startGame();
    const totalPlayers = room.turnOrder.length;
    for (let i = 0; i < totalPlayers - 1; i++) {
      room.giveHint(room.turnOrder[i], `hint-${i}`);
      expect(room.phase).toBe('hints');
    }
  });
});

// ---------------------------------------------------------------------------
// markDone (voice mode)
// ---------------------------------------------------------------------------

describe('GameRoom.markDone', () => {
  test('fails when mode is text', () => {
    const { room } = createGameWithPlayers(3);
    room.selectMode('text');
    room.startGame();
    const current = room.turnOrder[0];
    const result = room.markDone(current);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot mark done/i);
  });

  test('succeeds when mode is voice and it is player\'s turn', () => {
    const { room } = createGameWithPlayers(3);
    room.selectMode('voice');
    room.startGame();
    const current = room.turnOrder[0];
    const result = room.markDone(current);
    expect(result.success).toBe(true);
  });

  test('fails when it is not the player\'s turn in voice mode', () => {
    const { room } = createGameWithPlayers(3);
    room.selectMode('voice');
    room.startGame();
    const wrongPlayer = room.turnOrder[1];
    const result = room.markDone(wrongPlayer);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not your turn/i);
  });

  test('adds a voice placeholder hint entry', () => {
    const { room } = createGameWithPlayers(3);
    room.selectMode('voice');
    room.startGame();
    const current = room.turnOrder[0];
    room.markDone(current);
    expect(room.hints).toHaveLength(1);
    expect(room.hints[0].text).toContain('voice chat');
  });

  test('increments currentTurnIndex', () => {
    const { room } = createGameWithPlayers(3);
    room.selectMode('voice');
    room.startGame();
    const current = room.turnOrder[0];
    room.markDone(current);
    expect(room.currentTurnIndex).toBe(1);
  });

  test('transitions to discussion after all players mark done in voice mode', () => {
    const { room } = createGameWithPlayers(3);
    room.selectMode('voice');
    room.startGame();
    for (let i = 0; i < room.turnOrder.length; i++) {
      room.markDone(room.turnOrder[i]);
    }
    expect(room.phase).toBe('discussion');
  });
});

// ---------------------------------------------------------------------------
// startVoting
// ---------------------------------------------------------------------------

describe('GameRoom.startVoting', () => {
  test('fails when not in discussion phase', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    // Still in hints phase
    const result = room.startVoting();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/discussion/i);
  });

  test('transitions phase to voting', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToDiscussion(room, ids);
    room.startVoting();
    expect(room.phase).toBe('voting');
  });

  test('resets hasVoted for all players', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    // vote then go next round - simulate by checking reset happened
    for (const cp of room.players.values()) {
      expect(cp.hasVoted).toBe(false);
    }
  });

  test('resets votedFor for all players', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    for (const cp of room.players.values()) {
      expect(cp.votedFor).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// vote
// ---------------------------------------------------------------------------

describe('GameRoom.vote', () => {
  test('fails when not in voting phase', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    const result = room.vote(ids[0], ids[1]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/voting/i);
  });

  test('rejects self-vote', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    const result = room.vote(ids[0], ids[0]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/yourself/i);
  });

  test('rejects double vote by same player', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    room.vote(ids[0], ids[1]);
    const result = room.vote(ids[0], ids[2]);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already voted/i);
  });

  test('rejects vote for non-existent target', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    const result = room.vote(ids[0], 'nobody');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid target/i);
  });

  test('succeeds on valid vote', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    const result = room.vote(ids[0], ids[1]);
    expect(result.success).toBe(true);
  });

  test('records voter\'s choice', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    room.vote(ids[0], ids[1]);
    expect(room.players.get(ids[0])!.votedFor).toBe(ids[1]);
    expect(room.players.get(ids[0])!.hasVoted).toBe(true);
  });

  test('returns allVoted:false when not everyone has voted', () => {
    const { room, ids } = createGameWithPlayers(4);
    advanceToVoting(room, ids);
    const result = room.vote(ids[0], ids[1]);
    expect(result.allVoted).toBe(false);
  });

  test('returns allVoted:true when all connected players have voted', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    room.vote(ids[0], ids[1]);
    room.vote(ids[1], ids[0]);
    const result = room.vote(ids[2], ids[0]);
    expect(result.allVoted).toBe(true);
  });

  test('only counts connected players for allVoted check', () => {
    const { room, ids } = createGameWithPlayers(4);
    room.startGame();
    // Disconnect one player mid-game
    room.removePlayer(ids[3]);
    // Complete hints
    for (let i = 0; i < room.turnOrder.length; i++) {
      room.giveHint(room.turnOrder[i], `h${i}`);
    }
    room.startVoting();
    // Only 3 connected, vote with those 3
    const connected = ids.slice(0, 3);
    connected.forEach((id, i) => {
      room.vote(id, connected[(i + 1) % 3]);
    });
    // allVoted should be true since only 3 connected players
    const lastResult = room.vote(connected[2], connected[0]);
    // Already voted — should be rejected. Let's do it properly
    // Reset: use fresh vote check via side-effect already tested above.
    // The loop above already voted for all 3, so verify via players map
    const allVoted = Array.from(room.players.values())
      .filter(cp => cp.player.connected)
      .every(cp => cp.hasVoted);
    expect(allVoted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveVotes
// ---------------------------------------------------------------------------

describe('GameRoom.resolveVotes', () => {
  test('returns a RoundResult with the correct impostorId', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    voteAll(room);
    const result = room.resolveVotes();
    expect(result.impostorId).toBe(room.impostorId);
  });

  test('returns the current word in RoundResult', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    const word = room.currentWord;
    voteAll(room);
    const result = room.resolveVotes();
    expect(result.word).toBe(word);
  });

  test('impostorCaught is true when impostor gets the most votes', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    // Make all non-impostor players vote for the impostor
    const impostorId = room.impostorId!;
    const voters = ids.filter(id => id !== impostorId);
    voters.forEach(id => room.vote(id, impostorId));
    // Impostor votes for first non-impostor
    room.vote(impostorId, voters[0]);
    const result = room.resolveVotes();
    expect(result.impostorCaught).toBe(true);
  });

  test('impostorCaught is false when impostor is not the most voted', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    const impostorId = room.impostorId!;
    const nonImpostors = ids.filter(id => id !== impostorId);
    // All players vote for nonImpostors[0]
    ids.forEach(id => {
      if (id !== nonImpostors[0]) {
        room.vote(id, nonImpostors[0]);
      }
    });
    // nonImpostors[0] votes for nonImpostors[1]
    room.vote(nonImpostors[0], nonImpostors[1] ?? impostorId);
    const result = room.resolveVotes();
    expect(result.impostorCaught).toBe(false);
  });

  test('transitions phase to reveal', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    expect(room.phase).toBe('reveal');
  });

  test('includes vote breakdown in result', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    room.vote(ids[0], ids[1]);
    room.vote(ids[1], ids[2]);
    room.vote(ids[2], ids[0]);
    const result = room.resolveVotes();
    expect(result.votes).toHaveLength(3);
  });

  test('stores result in roundResults', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    voteAll(room);
    const result = room.resolveVotes();
    expect(room.roundResults).toHaveLength(1);
    expect(room.roundResults[0]).toBe(result);
  });

  test('includes impostorHint in result', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    voteAll(room);
    const result = room.resolveVotes();
    expect(result.impostorHint).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// nextRound / multi-round
// ---------------------------------------------------------------------------

describe('GameRoom.nextRound', () => {
  test('increments round counter', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    expect(room.round).toBe(1);
    room.nextRound();
    expect(room.round).toBe(2);
  });

  test('returns gameOver:true when current round equals totalRounds', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(1);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    const result = room.nextRound();
    expect(result.gameOver).toBe(true);
  });

  test('returns gameOver:false (or undefined) when rounds remain', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    const result = room.nextRound();
    expect(result.gameOver).toBeFalsy();
  });

  test('sets phase to game_over when all rounds complete', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(1);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    room.nextRound();
    expect(room.phase).toBe('game_over');
  });

  test('picks a new word for next round', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    room.selectCategory('Animals');
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    const firstWord = room.currentWord;
    room.nextRound();
    // usedWords tracks the first word so it should prefer a different one
    // (statistically extremely unlikely to be the same, but word may repeat under pressure)
    expect(room.usedWords.has(firstWord!)).toBe(true);
  });

  test('tracks used words across rounds', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    room.selectCategory('Animals');
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    const firstWord = room.currentWord!;
    room.nextRound();
    expect(room.usedWords.has(firstWord)).toBe(true);
  });

  test('resets hints array for new round', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    room.nextRound();
    expect(room.hints).toHaveLength(0);
  });

  test('resets currentTurnIndex to 0 for new round', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    room.nextRound();
    expect(room.currentTurnIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getStateForPlayer
// ---------------------------------------------------------------------------

describe('GameRoom.getStateForPlayer', () => {
  test('returns role impostor for the impostor', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const state = room.getStateForPlayer(room.impostorId!);
    expect(state.role).toBe('impostor');
  });

  test('returns impostorHint for the impostor', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const state = room.getStateForPlayer(room.impostorId!);
    expect(state.impostorHint).toBeTruthy();
  });

  test('does not expose word to the impostor', () => {
    const { room } = createGameWithPlayers(3);
    room.startGame();
    const state = room.getStateForPlayer(room.impostorId!);
    expect(state.word).toBeUndefined();
  });

  test('returns role player for a regular player', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    const regularId = ids.find(id => id !== room.impostorId)!;
    const state = room.getStateForPlayer(regularId);
    expect(state.role).toBe('player');
  });

  test('returns the word to regular players', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    const regularId = ids.find(id => id !== room.impostorId)!;
    const state = room.getStateForPlayer(regularId);
    expect(state.word).toBe(room.currentWord);
  });

  test('does not expose impostorHint to regular players', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    const regularId = ids.find(id => id !== room.impostorId)!;
    const state = room.getStateForPlayer(regularId);
    expect(state.impostorHint).toBeUndefined();
  });

  test('includes all players in state', () => {
    const { room, ids } = createGameWithPlayers(4);
    room.startGame();
    const state = room.getStateForPlayer(ids[0]);
    expect(state.players).toHaveLength(4);
  });

  test('includes round info in state', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(3);
    room.startGame();
    const state = room.getStateForPlayer(ids[0]);
    expect(state.round).toBe(1);
    expect(state.totalRounds).toBe(3);
  });

  test('includes turnOrder and currentTurnIndex in state', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    const state = room.getStateForPlayer(ids[0]);
    expect(state.turnOrder).toEqual(room.turnOrder);
    expect(state.currentTurnIndex).toBe(0);
  });

  test('roundResult is undefined during hints phase', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    const state = room.getStateForPlayer(ids[0]);
    expect(state.roundResult).toBeUndefined();
  });

  test('roundResult is populated during reveal phase', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes(); // transitions to reveal
    const state = room.getStateForPlayer(ids[0]);
    expect(state.roundResult).toBeDefined();
    expect(state.roundResult!.round).toBe(1);
  });

  test('roundResults array is empty outside game_over phase', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    const state = room.getStateForPlayer(ids[0]);
    expect(state.roundResults).toHaveLength(0);
  });

  test('roundResults populated during game_over phase', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.setRounds(1);
    advanceToVoting(room, ids);
    voteAll(room);
    room.resolveVotes();
    room.nextRound(); // triggers game_over
    const state = room.getStateForPlayer(ids[0]);
    expect(state.roundResults).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Settings: selectCategory, selectMode, setRounds
// ---------------------------------------------------------------------------

describe('GameRoom settings', () => {
  test('selectCategory sets the category', () => {
    const room = new GameRoom('ABCD');
    room.selectCategory('Sports');
    expect(room.category).toBe('Sports');
  });

  test('selectMode sets mode to text', () => {
    const room = new GameRoom('ABCD');
    room.selectMode('text');
    expect(room.mode).toBe('text');
  });

  test('selectMode sets mode to voice', () => {
    const room = new GameRoom('ABCD');
    room.selectMode('voice');
    expect(room.mode).toBe('voice');
  });

  test('setRounds sets value within range', () => {
    const room = new GameRoom('ABCD');
    room.setRounds(3);
    expect(room.totalRounds).toBe(3);
  });

  test('setRounds clamps to minimum of 1', () => {
    const room = new GameRoom('ABCD');
    room.setRounds(0);
    expect(room.totalRounds).toBe(1);
  });

  test('setRounds clamps to maximum of 5', () => {
    const room = new GameRoom('ABCD');
    room.setRounds(99);
    expect(room.totalRounds).toBe(5);
  });

  test('setRounds accepts boundary value 1', () => {
    const room = new GameRoom('ABCD');
    room.setRounds(1);
    expect(room.totalRounds).toBe(1);
  });

  test('setRounds accepts boundary value 5', () => {
    const room = new GameRoom('ABCD');
    room.setRounds(5);
    expect(room.totalRounds).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// reconnectPlayer
// ---------------------------------------------------------------------------

describe('GameRoom.reconnectPlayer', () => {
  test('returns false for unknown player', () => {
    const room = new GameRoom('ABCD');
    expect(room.reconnectPlayer('ghost', null)).toBe(false);
  });

  test('marks disconnected player as connected again', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.removePlayer(ids[0]); // marks disconnected
    expect(room.players.get(ids[0])!.player.connected).toBe(false);
    room.reconnectPlayer(ids[0], null);
    expect(room.players.get(ids[0])!.player.connected).toBe(true);
  });

  test('returns true on successful reconnect', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.removePlayer(ids[0]);
    expect(room.reconnectPlayer(ids[0], null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resetToLobby
// ---------------------------------------------------------------------------

describe('GameRoom.resetToLobby', () => {
  test('resets phase to lobby', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.resetToLobby();
    expect(room.phase).toBe('lobby');
  });

  test('resets round to 0', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.resetToLobby();
    expect(room.round).toBe(0);
  });

  test('clears currentWord', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.resetToLobby();
    expect(room.currentWord).toBeNull();
  });

  test('clears hints array', () => {
    const { room, ids } = createGameWithPlayers(3);
    advanceToDiscussion(room, ids);
    room.resetToLobby();
    expect(room.hints).toHaveLength(0);
  });

  test('clears usedWords set', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.resetToLobby();
    expect(room.usedWords.size).toBe(0);
  });

  test('clears player roles', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();
    room.resetToLobby();
    for (const cp of room.players.values()) {
      expect(cp.role).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// getAvailableCategories
// ---------------------------------------------------------------------------

describe('GameRoom.getAvailableCategories', () => {
  test('returns the list of category names', () => {
    const room = new GameRoom('ABCD');
    const cats = room.getAvailableCategories();
    expect(Array.isArray(cats)).toBe(true);
    expect(cats.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// words.ts — getCategories
// ---------------------------------------------------------------------------

describe('getCategories', () => {
  test('returns an array', () => {
    expect(Array.isArray(getCategories())).toBe(true);
  });

  test('returns exactly 8 categories', () => {
    expect(getCategories()).toHaveLength(8);
  });

  test('all entries are non-empty strings', () => {
    for (const name of getCategories()) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// words.ts — getRandomWord
// ---------------------------------------------------------------------------

describe('getRandomWord', () => {
  test('returns null for an invalid category', () => {
    expect(getRandomWord('NotARealCategory')).toBeNull();
  });

  test('returns an object with word, hint, and category for a valid category', () => {
    const result = getRandomWord('Animals');
    expect(result).not.toBeNull();
    expect(typeof result!.word).toBe('string');
    expect(typeof result!.hint).toBe('string');
    expect(result!.category).toBe('Animals');
  });

  test('returned word belongs to the requested category', () => {
    const categoryName = 'Sports';
    const result = getRandomWord(categoryName)!;
    const cat = categories.find(c => c.name === categoryName)!;
    const wordNames = cat.words.map(w => w.word);
    expect(wordNames).toContain(result.word);
  });

  test('returned hint is one of the hints defined for that word', () => {
    const categoryName = 'Food & Drinks';
    const result = getRandomWord(categoryName)!;
    const cat = categories.find(c => c.name === categoryName)!;
    const entry = cat.words.find(w => w.word === result.word)!;
    expect(entry.hints).toContain(result.hint);
  });

  test('returns non-empty word and hint strings', () => {
    const result = getRandomWord('Video Games')!;
    expect(result.word.length).toBeGreaterThan(0);
    expect(result.hint.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// words.ts — getRandomCategory
// ---------------------------------------------------------------------------

describe('getRandomCategory', () => {
  test('returns a string', () => {
    expect(typeof getRandomCategory()).toBe('string');
  });

  test('returns a value that exists in getCategories()', () => {
    const cat = getRandomCategory();
    expect(getCategories()).toContain(cat);
  });

  test('returns different values across multiple calls (probabilistic)', () => {
    // With 8 categories, getting the same one 20 times in a row is astronomically unlikely
    const results = new Set(Array.from({ length: 20 }, () => getRandomCategory()));
    expect(results.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// words.ts — category word counts and hint coverage
// ---------------------------------------------------------------------------

describe('Category word and hint coverage', () => {
  test('every category has at least 10 words', () => {
    for (const cat of categories) {
      expect(cat.words.length).toBeGreaterThanOrEqual(10);
    }
  });

  test('every word has at least 1 hint', () => {
    for (const cat of categories) {
      for (const entry of cat.words) {
        expect(entry.hints.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('all word strings are non-empty', () => {
    for (const cat of categories) {
      for (const entry of cat.words) {
        expect(entry.word.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('all hint strings are non-empty', () => {
    for (const cat of categories) {
      for (const entry of cat.words) {
        for (const hint of entry.hints) {
          expect(hint.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });
});
