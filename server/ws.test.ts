import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import type { ServerMessage, GameState } from '../src/lib/types';

const TEST_PORT = 3099;
const WS_URL = `ws://localhost:${TEST_PORT}/ws`;
const HTTP_URL = `http://localhost:${TEST_PORT}`;

let serverProcess: ReturnType<typeof Bun.spawn> | null = null;

// ─── Server lifecycle ────────────────────────────────────────────────────────

beforeAll(async () => {
  // Use the same bun binary that's running this test.
  // On Windows, import.meta.url gives a pathname like "/D:/path" — strip the
  // leading slash before the drive letter so it's a valid Windows path for cwd.
  const bunExe = process.execPath;
  const rawCwd = new URL('..', import.meta.url).pathname;
  const cwd = rawCwd.replace(/^\/([A-Za-z]:)/, '$1');

  serverProcess = Bun.spawn([bunExe, 'server/index.ts'], {
    cwd,
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdout: 'ignore',
    stderr: 'ignore',
  });

  // Wait until the server is accepting connections
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${HTTP_URL}/api/categories`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
});

afterAll(() => {
  serverProcess?.kill();
  serverProcess = null;
});

// ─── WebSocket client helper ─────────────────────────────────────────────────

interface TestClient {
  ws: WebSocket;
  messages: ServerMessage[];
  /**
   * Returns the first message of `type` at index >= fromIndex.
   * If none has arrived yet, waits for the next one of that type to arrive.
   * NOTE: when waiting, the predicate is NOT re-applied to queued callbacks —
   * they fire on the next arrival of that type regardless of fromIndex.
   * For filtering by phase use waitForStatePhase instead.
   */
  waitForMessage: (type: string, fromIndex?: number) => Promise<ServerMessage>;
  /**
   * Waits for a state_update whose state.phase equals `phase`,
   * searching only from `fromIndex` onward.
   */
  waitForStatePhase: (phase: string, fromIndex?: number) => Promise<{ type: 'state_update'; state: GameState }>;
  send: (msg: object) => void;
  close: () => void;
}

function createClient(): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const messages: ServerMessage[] = [];
    // Per-type queues of pending resolve callbacks
    const waiters = new Map<string, Array<(msg: ServerMessage) => void>>();

    const ws = new WebSocket(WS_URL);

    ws.onmessage = (e: MessageEvent) => {
      const msg: ServerMessage = JSON.parse(e.data as string);
      messages.push(msg);
      const queue = waiters.get(msg.type);
      if (queue && queue.length > 0) {
        const cb = queue.shift()!;
        if (queue.length === 0) waiters.delete(msg.type);
        cb(msg);
      }
    };

    ws.onerror = reject;

    ws.onopen = () => {
      const client: TestClient = {
        ws,
        messages,

        waitForMessage(type: string, fromIndex = 0): Promise<ServerMessage> {
          const existing = messages.slice(fromIndex).find(m => m.type === type);
          if (existing) return Promise.resolve(existing);
          return new Promise(r => {
            if (!waiters.has(type)) waiters.set(type, []);
            waiters.get(type)!.push(r);
          });
        },

        waitForStatePhase(phase: string, fromIndex = 0): Promise<{ type: 'state_update'; state: GameState }> {
          // Check already-buffered messages first
          const existing = messages.slice(fromIndex).find(
            m => m.type === 'state_update' && (m as any).state?.phase === phase
          );
          if (existing) return Promise.resolve(existing as any);

          // Otherwise poll: each time a state_update arrives, check its phase
          return new Promise(r => {
            const check = (msg: ServerMessage) => {
              if (msg.type === 'state_update' && (msg as any).state?.phase === phase) {
                r(msg as any);
              } else {
                // Re-register for the next state_update
                if (!waiters.has('state_update')) waiters.set('state_update', []);
                waiters.get('state_update')!.push(check);
              }
            };
            if (!waiters.has('state_update')) waiters.set('state_update', []);
            waiters.get('state_update')!.push(check);
          });
        },

        send(msg: object) {
          ws.send(JSON.stringify(msg));
        },

        close() {
          ws.close();
        },
      };
      resolve(client);
    };
  });
}

/** Small delay to let the server process a message before we assert */
const tick = (ms = 80) => new Promise(r => setTimeout(r, ms));

// ─── HTTP API ────────────────────────────────────────────────────────────────

describe('HTTP API', () => {
  test('GET /api/categories returns an array of category names', async () => {
    const res = await fetch(`${HTTP_URL}/api/categories`);
    expect(res.status).toBe(200);
    const body = await res.json() as string[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(typeof body[0]).toBe('string');
    // Known category from words.ts
    expect(body).toContain('Animals');
  });

  test('POST /api/create returns a 4-character room code', async () => {
    const res = await fetch(`${HTTP_URL}/api/create`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json() as { code: string };
    expect(typeof body.code).toBe('string');
    expect(body.code).toHaveLength(4);
    expect(body.code).toMatch(/^[A-Z]+$/);
  });

  test('GET /api/room/:code returns room info for an existing room', async () => {
    const createRes = await fetch(`${HTTP_URL}/api/create`, { method: 'POST' });
    const { code } = await createRes.json() as { code: string };

    const res = await fetch(`${HTTP_URL}/api/room/${code}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { code: string; playerCount: number; phase: string };
    expect(body.code).toBe(code);
    expect(body.playerCount).toBe(0);
    expect(body.phase).toBe('lobby');
  });

  test('GET /api/room/:code returns 404 for a non-existent room', async () => {
    const res = await fetch(`${HTTP_URL}/api/room/ZZZZ`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBeTruthy();
  });
});

// ─── WebSocket join flow ─────────────────────────────────────────────────────

describe('WebSocket join flow', () => {
  test('joining with code NEW creates a room and returns joined with lobby state', async () => {
    const client = await createClient();
    try {
      client.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const msg = await client.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };

      expect(msg.type).toBe('joined');
      expect(typeof msg.playerId).toBe('string');
      expect(msg.state.phase).toBe('lobby');
      expect(msg.state.players).toHaveLength(1);
      expect(msg.state.players[0].isHost).toBe(true);
      expect(msg.state.players[0].name).toBe('Alice');
    } finally {
      client.close();
    }
  });

  test('second player joining the same room causes both clients to receive state_update with 2 players', async () => {
    const alice = await createClient();
    let roomCode: string;

    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const joined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      roomCode = joined.state.code;

      const bob = await createClient();
      try {
        bob.send({ type: 'join', code: roomCode, name: 'Bob' });
        await bob.waitForMessage('joined');

        // Alice should receive a state_update after Bob joins
        const aliceUpdate = await alice.waitForMessage('state_update', alice.messages.length - 1) as { type: 'state_update'; state: GameState };
        expect(aliceUpdate.state.players).toHaveLength(2);
        const names = aliceUpdate.state.players.map((p: { name: string }) => p.name);
        expect(names).toContain('Alice');
        expect(names).toContain('Bob');
      } finally {
        bob.close();
      }
    } finally {
      alice.close();
    }
  });

  test('joining with an invalid room code receives an error message', async () => {
    const client = await createClient();
    try {
      client.send({ type: 'join', code: 'INVALID_CODE_THAT_DOES_NOT_EXIST', name: 'Ghost' });
      const err = await client.waitForMessage('error') as { type: 'error'; message: string };
      expect(err.type).toBe('error');
      expect(err.message).toBeTruthy();
    } finally {
      client.close();
    }
  });

  test('first player to join is the host', async () => {
    const client = await createClient();
    try {
      client.send({ type: 'join', code: 'NEW', name: 'HostPlayer' });
      const msg = await client.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      expect(msg.state.hostId).toBe(msg.playerId);
      expect(msg.state.players[0].isHost).toBe(true);
    } finally {
      client.close();
    }
  });
});

// ─── Chat ────────────────────────────────────────────────────────────────────

describe('Chat', () => {
  test('chat message is broadcast to all players with name and timestamp', async () => {
    const alice = await createClient();
    const bob = await createClient();
    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const aliceJoined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const roomCode = aliceJoined.state.code;

      bob.send({ type: 'join', code: roomCode, name: 'Bob' });
      await bob.waitForMessage('joined');
      await tick();

      alice.send({ type: 'chat', text: 'hello world' });

      const aliceChat = await alice.waitForMessage('chat_message') as { type: 'chat_message'; name: string; text: string; timestamp: number };
      const bobChat = await bob.waitForMessage('chat_message') as { type: 'chat_message'; name: string; text: string; timestamp: number };

      expect(aliceChat.name).toBe('Alice');
      expect(aliceChat.text).toBe('hello world');
      expect(typeof aliceChat.timestamp).toBe('number');

      expect(bobChat.name).toBe('Alice');
      expect(bobChat.text).toBe('hello world');
    } finally {
      alice.close();
      bob.close();
    }
  });
});

// ─── Host permissions ────────────────────────────────────────────────────────

describe('Host permissions', () => {
  test('non-host sending start_game receives an error', async () => {
    const alice = await createClient();
    const bob = await createClient();
    const carol = await createClient();
    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const aliceJoined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const roomCode = aliceJoined.state.code;

      bob.send({ type: 'join', code: roomCode, name: 'Bob' });
      await bob.waitForMessage('joined');
      carol.send({ type: 'join', code: roomCode, name: 'Carol' });
      await carol.waitForMessage('joined');
      await tick();

      // Bob is not the host
      bob.send({ type: 'start_game' });
      const err = await bob.waitForMessage('error') as { type: 'error'; message: string };
      expect(err.message).toMatch(/host/i);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });

  test('non-host sending start_voting receives an error', async () => {
    const alice = await createClient();
    const bob = await createClient();
    const carol = await createClient();
    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const aliceJoined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const roomCode = aliceJoined.state.code;

      bob.send({ type: 'join', code: roomCode, name: 'Bob' });
      await bob.waitForMessage('joined');
      carol.send({ type: 'join', code: roomCode, name: 'Carol' });
      await carol.waitForMessage('joined');
      await tick();

      // Start the game as host first to get to discussion phase
      alice.send({ type: 'select_category', category: 'Animals' });
      alice.send({ type: 'start_game' });
      await tick(150);

      // Bob tries to start voting (not host)
      bob.send({ type: 'start_voting' });
      const err = await bob.waitForMessage('error') as { type: 'error'; message: string };
      expect(err.message).toMatch(/host/i);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

describe('Disconnect', () => {
  test('player disconnecting during lobby causes others to receive state_update without that player', async () => {
    const alice = await createClient();
    const bob = await createClient();
    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const aliceJoined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const roomCode = aliceJoined.state.code;

      bob.send({ type: 'join', code: roomCode, name: 'Bob' });
      await bob.waitForMessage('joined');
      await tick();

      const beforeDisconnect = alice.messages.length;
      bob.close();
      await tick(200);

      // Alice should receive a state_update with only 1 player
      const update = alice.messages.slice(beforeDisconnect).find(m => m.type === 'state_update') as { type: 'state_update'; state: GameState } | undefined;
      expect(update).toBeDefined();
      expect(update!.state.players).toHaveLength(1);
    } finally {
      alice.close();
    }
  });

  test('player disconnecting during a game is marked as connected=false in state_update', async () => {
    const alice = await createClient();
    const bob = await createClient();
    const carol = await createClient();
    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const aliceJoined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const roomCode = aliceJoined.state.code;

      bob.send({ type: 'join', code: roomCode, name: 'Bob' });
      await bob.waitForMessage('joined');
      carol.send({ type: 'join', code: roomCode, name: 'Carol' });
      await carol.waitForMessage('joined');
      await tick();

      alice.send({ type: 'select_category', category: 'Animals' });
      alice.send({ type: 'start_game' });
      await tick(200);

      const beforeDisconnect = alice.messages.length;
      carol.close();
      await tick(200);

      const update = alice.messages.slice(beforeDisconnect).find(m => m.type === 'state_update') as { type: 'state_update'; state: GameState } | undefined;
      expect(update).toBeDefined();
      const carolInState = update!.state.players.find((p: { name: string }) => p.name === 'Carol');
      expect(carolInState).toBeDefined();
      expect(carolInState!.connected).toBe(false);
    } finally {
      alice.close();
      bob.close();
    }
  });

  test('all players leaving a room causes it to be deleted', async () => {
    const alice = await createClient();
    let roomCode: string;
    try {
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const msg = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      roomCode = msg.state.code;
    } finally {
      alice.close();
    }

    await tick(200);
    const res = await fetch(`${HTTP_URL}/api/room/${roomCode!}`);
    expect(res.status).toBe(404);
  });
});

// ─── Full game simulation (3 players, 2 rounds) ──────────────────────────────

describe('Full game simulation', () => {
  test('3-player game completes 2 rounds and emits game_over', async () => {
    const alice = await createClient();
    const bob = await createClient();
    const carol = await createClient();

    try {
      // ── Lobby setup ──────────────────────────────────────────────────────
      alice.send({ type: 'join', code: 'NEW', name: 'Alice' });
      const aliceJoined = await alice.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const roomCode = aliceJoined.state.code;
      const aliceId = aliceJoined.playerId;

      bob.send({ type: 'join', code: roomCode, name: 'Bob' });
      const bobJoined = await bob.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const bobId = bobJoined.playerId;

      carol.send({ type: 'join', code: roomCode, name: 'Carol' });
      const carolJoined = await carol.waitForMessage('joined') as { type: 'joined'; playerId: string; state: GameState };
      const carolId = carolJoined.playerId;

      await tick();

      // ── Game config & start ──────────────────────────────────────────────
      // Snapshot lengths before start so waitForStatePhase skips lobby updates
      const aliceBeforeStart = alice.messages.length;
      const bobBeforeStart = bob.messages.length;
      const carolBeforeStart = carol.messages.length;

      alice.send({ type: 'select_category', category: 'Animals' });
      alice.send({ type: 'select_mode', mode: 'text' });
      alice.send({ type: 'set_rounds', rounds: 2 });
      alice.send({ type: 'start_game' });

      // All 3 players should receive state_update with phase='hints'
      const aliceHints = await alice.waitForStatePhase('hints', aliceBeforeStart);
      const bobHints = await bob.waitForStatePhase('hints', bobBeforeStart);
      const carolHints = await carol.waitForStatePhase('hints', carolBeforeStart);

      expect(aliceHints.state.phase).toBe('hints');
      expect(bobHints.state.phase).toBe('hints');
      expect(carolHints.state.phase).toBe('hints');
      expect(aliceHints.state.round).toBe(1);
      expect(aliceHints.state.totalRounds).toBe(2);

      // Exactly one player is the impostor
      const roles: Record<string, string | undefined> = {
        [aliceId]: aliceHints.state.role,
        [bobId]: bobHints.state.role,
        [carolId]: carolHints.state.role,
      };
      const impostors = Object.values(roles).filter(r => r === 'impostor');
      expect(impostors).toHaveLength(1);

      // ── Round 1: hints ───────────────────────────────────────────────────
      const turnOrder = aliceHints.state.turnOrder;
      expect(turnOrder).toHaveLength(3);

      const clients: Record<string, TestClient> = {
        [aliceId]: alice,
        [bobId]: bob,
        [carolId]: carol,
      };

      // Each player gives a hint in turn order
      const aliceBeforeDiscussion = alice.messages.length;
      for (const pid of turnOrder) {
        clients[pid].send({ type: 'give_hint', text: `hint from ${pid}` });
        await tick(100);
      }

      // After all hints, phase should transition to discussion
      const aliceDiscussion = await alice.waitForStatePhase('discussion', aliceBeforeDiscussion);
      expect(aliceDiscussion.state.phase).toBe('discussion');

      // ── Round 1: voting ──────────────────────────────────────────────────
      const aliceBeforeVoting = alice.messages.length;
      alice.send({ type: 'start_voting' });

      const aliceVotingState = await alice.waitForStatePhase('voting', aliceBeforeVoting);
      expect(aliceVotingState.state.phase).toBe('voting');

      // Each player votes for someone else (not self)
      const playerIds = [aliceId, bobId, carolId];
      alice.send({ type: 'vote', targetId: playerIds.find(id => id !== aliceId)! });
      await tick(50);
      bob.send({ type: 'vote', targetId: playerIds.find(id => id !== bobId)! });
      await tick(50);

      const beforeLastVote = alice.messages.length;
      carol.send({ type: 'vote', targetId: playerIds.find(id => id !== carolId)! });

      // After last vote, all should receive round_result
      const aliceResult = await alice.waitForMessage('round_result', beforeLastVote) as { type: 'round_result'; result: import('../src/lib/types').RoundResult };
      expect(typeof aliceResult.result.impostorId).toBe('string');
      expect(aliceResult.result.round).toBe(1);
      expect(Array.isArray(aliceResult.result.votes)).toBe(true);

      // ── Advance to round 2 ───────────────────────────────────────────────
      await tick(100);
      const aliceBeforeRound2 = alice.messages.length;
      alice.send({ type: 'next_round' });

      const round2State = await alice.waitForStatePhase('hints', aliceBeforeRound2);
      expect(round2State.state.phase).toBe('hints');
      expect(round2State.state.round).toBe(2);

      // ── Round 2: hints ───────────────────────────────────────────────────
      const round2TurnOrder = round2State.state.turnOrder;

      const aliceBeforeDiscussion2 = alice.messages.length;
      for (const pid of round2TurnOrder) {
        clients[pid].send({ type: 'give_hint', text: `r2 hint from ${pid}` });
        await tick(100);
      }

      const aliceDiscussion2 = await alice.waitForStatePhase('discussion', aliceBeforeDiscussion2);
      expect(aliceDiscussion2.state.phase).toBe('discussion');

      // ── Round 2: voting ──────────────────────────────────────────────────
      const aliceBeforeVoting2 = alice.messages.length;
      alice.send({ type: 'start_voting' });
      await alice.waitForStatePhase('voting', aliceBeforeVoting2);

      alice.send({ type: 'vote', targetId: playerIds.find(id => id !== aliceId)! });
      await tick(50);
      bob.send({ type: 'vote', targetId: playerIds.find(id => id !== bobId)! });
      await tick(50);

      const beforeFinalVote = alice.messages.length;
      carol.send({ type: 'vote', targetId: playerIds.find(id => id !== carolId)! });
      await alice.waitForMessage('round_result', beforeFinalVote);

      // ── End game ─────────────────────────────────────────────────────────
      await tick(100);
      const beforeEndGame = alice.messages.length;
      alice.send({ type: 'next_round' }); // round >= totalRounds → game_over

      const gameOver = await alice.waitForMessage('game_over', beforeEndGame) as { type: 'game_over'; results: import('../src/lib/types').RoundResult[] };
      expect(gameOver.type).toBe('game_over');
      expect(gameOver.results).toHaveLength(2);
      expect(gameOver.results[0].round).toBe(1);
      expect(gameOver.results[1].round).toBe(2);
    } finally {
      alice.close();
      bob.close();
      carol.close();
    }
  }, 30000);
});
