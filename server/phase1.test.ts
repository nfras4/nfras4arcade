import { describe, test, expect } from 'bun:test';
import { GameRoom, createRoom, getRoom, deleteRoom, cleanupExpiredRooms } from './game';

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

/** Advance room through hints into discussion phase. */
function advanceToDiscussion(room: GameRoom, ids: string[]): void {
  room.startGame();
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

/**
 * Create a 4-player room at voting phase with specific votes so that
 * player-1 and player-2 are tied with 2 votes each.
 * Returns the room after votes are cast (but before resolveVotes).
 */
function setupTiedVoting(): GameRoom {
  const { room, ids } = createGameWithPlayers(4);
  advanceToVoting(room, ids);

  // Cast votes so player-1 and player-2 each get 2 votes:
  // player-1 votes for player-2
  // player-2 votes for player-1
  // player-3 votes for player-1
  // player-4 votes for player-2
  room.vote('player-1', 'player-2');
  room.vote('player-2', 'player-1');
  room.vote('player-3', 'player-1');
  room.vote('player-4', 'player-2');

  return room;
}

// ---------------------------------------------------------------------------
// 1. Input validation (hint trimming)
// ---------------------------------------------------------------------------

describe('input validation', () => {
  test('hint text gets trimmed', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();

    const firstPlayer = room.turnOrder[0];
    room.giveHint(firstPlayer, '  padded hint  ');

    expect(room.hints[0].text).toBe('padded hint');
  });

  test('game works with normal hint text', () => {
    const { room, ids } = createGameWithPlayers(3);
    room.startGame();

    const firstPlayer = room.turnOrder[0];
    const result = room.giveHint(firstPlayer, 'normal hint');

    expect(result.success).toBe(true);
    expect(room.hints[0].text).toBe('normal hint');
  });
});

// ---------------------------------------------------------------------------
// 2. Room expiry
// ---------------------------------------------------------------------------

describe('room expiry', () => {
  test('room with recent activity is NOT cleaned up', () => {
    const room = createRoom();
    const code = room.code;

    const cleaned = cleanupExpiredRooms();

    // Room should still exist
    expect(getRoom(code)).toBeDefined();
    deleteRoom(code);
  });

  test('room with lastActivity 31 minutes ago IS cleaned up', () => {
    const room = createRoom();
    const code = room.code;

    // Set lastActivity to 31 minutes ago
    room.lastActivity = Date.now() - 31 * 60 * 1000;

    const cleaned = cleanupExpiredRooms();

    expect(cleaned).toBeGreaterThanOrEqual(1);
    expect(getRoom(code)).toBeUndefined();
  });

  test('touch() updates lastActivity', () => {
    const room = new GameRoom('TUCH');
    const before = room.lastActivity;

    // Small delay to ensure timestamp differs
    room.lastActivity = Date.now() - 5000;
    const stale = room.lastActivity;
    room.touch();

    expect(room.lastActivity).toBeGreaterThan(stale);
  });

  test('cleanup sends error message to connected players before removing room', () => {
    const room = createRoom();
    const code = room.code;

    // Track messages sent to the fake websocket
    const messages: string[] = [];
    const fakeWs = {
      send(data: string) { messages.push(data); },
      close() {}
    };

    room.addPlayer('p1', 'Alice', fakeWs);
    room.lastActivity = Date.now() - 31 * 60 * 1000;

    cleanupExpiredRooms();

    expect(messages.length).toBe(1);
    const parsed = JSON.parse(messages[0]);
    expect(parsed.type).toBe('error');
    expect(parsed.message).toContain('expired');
  });
});

// ---------------------------------------------------------------------------
// 3. Vote ties (random selection among tied players)
// ---------------------------------------------------------------------------

describe('vote tie resolution', () => {
  test('both tied players can be selected as accused (random tie-breaking)', () => {
    // With random tie-breaking between player-1 and player-2, plus random
    // impostor assignment, the impostorCaught outcome should vary across runs.
    // Over 100 iterations both outcomes should appear at least once.
    let caughtCount = 0;
    let missedCount = 0;

    for (let i = 0; i < 100; i++) {
      const room = setupTiedVoting();
      const result = room.resolveVotes();

      // Verify vote counts are correct
      const votes = new Map<string, number>();
      for (const v of result.votes) {
        votes.set(v.targetId, (votes.get(v.targetId) || 0) + 1);
      }
      expect(votes.get('player-1')).toBe(2);
      expect(votes.get('player-2')).toBe(2);

      if (result.impostorCaught) {
        caughtCount++;
      } else {
        missedCount++;
      }
    }

    // With random tie-breaking between 2 players and random impostor assignment,
    // we should see both outcomes over 100 iterations
    expect(caughtCount).toBeGreaterThan(0);
    expect(missedCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Concurrent room operations
// ---------------------------------------------------------------------------

describe('concurrent room operations', () => {
  test('multiple rooms created simultaneously get unique codes', () => {
    const rooms: GameRoom[] = [];
    for (let i = 0; i < 20; i++) {
      rooms.push(createRoom());
    }

    const codes = rooms.map(r => r.code);
    const uniqueCodes = new Set(codes);

    expect(uniqueCodes.size).toBe(rooms.length);

    // Cleanup
    for (const room of rooms) {
      deleteRoom(room.code);
    }
  });

  test('operations on one room do not affect another', () => {
    const room1 = createRoom();
    const room2 = createRoom();

    room1.addPlayer('p1', 'Alice', null);
    room1.addPlayer('p2', 'Bob', null);
    room1.addPlayer('p3', 'Carol', null);

    room2.addPlayer('p4', 'Dave', null);

    // Starting a game in room1 should not affect room2
    room1.startGame();

    expect(room1.phase).toBe('hints');
    expect(room2.phase).toBe('lobby');
    expect(room1.players.size).toBe(3);
    expect(room2.players.size).toBe(1);

    deleteRoom(room1.code);
    deleteRoom(room2.code);
  });
});

// ---------------------------------------------------------------------------
// 5. Room activity tracking
// ---------------------------------------------------------------------------

describe('room activity tracking', () => {
  test('lastActivity is set on construction', () => {
    const before = Date.now();
    const room = new GameRoom('ACTV');
    const after = Date.now();

    expect(room.lastActivity).toBeGreaterThanOrEqual(before);
    expect(room.lastActivity).toBeLessThanOrEqual(after);
  });

  test('touch() updates the timestamp', () => {
    const room = new GameRoom('TCHR');

    // Artificially age the room
    room.lastActivity = Date.now() - 10000;
    const stale = room.lastActivity;

    const beforeTouch = Date.now();
    room.touch();
    const afterTouch = Date.now();

    expect(room.lastActivity).toBeGreaterThanOrEqual(beforeTouch);
    expect(room.lastActivity).toBeLessThanOrEqual(afterTouch);
    expect(room.lastActivity).toBeGreaterThan(stale);
  });
});
