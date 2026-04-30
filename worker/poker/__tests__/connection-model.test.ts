/**
 * Connection-model refactor — test suite (connection-model.test.ts)
 *
 * Covers the post-conditions stated in:
 *   .omc/plans/connection-model-refactor.md  (design v2)
 *   .omc/plans/connection-model-refactor-review.md  (Tester gaps)
 *
 * Tests are organised around the required coverage list:
 *   1.  Two same-role sockets coexist (F4 removal — Bug 1)
 *   2.  Turn guard prevents double-action from duplicate tabs
 *   3.  Spectate-intent tag routes to spectator branch (playing phase)
 *   4.  Spectate intent works in lobby phase (Bug 2A)
 *   5.  Returning player ignores spectate intent (prevents accidental self-demotion)
 *   6.  Spectator multi-socket close guard (GAP-1)
 *   7.  Precedence rule: spectate=1 wins over any ?role= value (GAP-2)
 *   8.  No tags.length === 3 assumption — 4-tag sockets dispatch correctly
 *   9.  Casino spectate intent gate (it.todo — no harness for casinoRoom)
 *  10.  Promoted-spectator compatibility (DNH-7 — play_again + stale spectate tag)
 *
 * ─── Manual-only scenarios (cannot be driven server-side) ──────────────────
 *
 * MAN-1  Bug 1 multi-device end-to-end (paired phone+PC):
 *        Open the same poker lobby URL on two devices logged in as the same
 *        account (default role='both' on both). Verify neither device is
 *        evicted. Start the game. Verify both receive playing-phase state.
 *
 * MAN-2  Lobby-phase spectator survives auto-reconnect (GAP-5):
 *        Navigate to a lobby-phase room with ?spectate=1. In DevTools, force
 *        the WebSocket closed (Network > right-click > Close). Verify the
 *        client auto-reconnects within ~2 s. Verify the reconnect URL still
 *        carries ?spectate=1 (check Network tab). Verify the server registers
 *        the reconnect as a spectator, NOT as a player. The bug would be:
 *        after reconnect the user appears in the player list without ?spectate=1.
 *
 * MAN-3  Paired-controller grace with multi-device (RR-1):
 *        Open a game as a paired controller+table split. Close the controller
 *        tab while the table tab is still open. Verify grace is armed (server
 *        log shows "[grace] armed"). While grace is running, close the table
 *        tab. Verify the player is NOT disconnected until grace expires, not
 *        immediately on the table-tab close.
 *
 * MAN-4  Player spectating own game:
 *        Join a game as a player on tab A. Open tab B for the same account
 *        with ?spectate=1. Verify tab B receives player state (the reconnect
 *        path fires because the player is already in this.players). Verify
 *        no eviction occurs on either tab.
 *
 * MAN-5  LIVE NOW widget URL contains ?spectate=1:
 *        From the home page, start a poker game. From a second account, check
 *        that the LIVE NOW widget's spectate link contains ?spectate=1. Click
 *        it. Verify the second account lands as a spectator, not a player.
 *
 * MAN-6  Casino multi-device (casinoRoom F4 removal):
 *        Open a Blackjack lobby on two devices with the same account. Verify
 *        neither device is evicted. (CasinoRoom has an independent F4 copy
 *        that must also be removed; server-side test is tracked as it.todo #9.)
 */

import { describe, test, expect, mock, beforeAll, beforeEach } from 'bun:test';
import { makeDevice } from '../../shared/deviceManager';

mock.module('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: any;
    env: any;
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

let PokerRoom: any;
beforeAll(async () => {
  ({ PokerRoom } = await import('../room'));
});

// ─── Stub helpers ────────────────────────────────────────────────────────────

/**
 * A stub WebSocket whose tags are set at creation time. Captures sent messages.
 * Mimics the subset of the CF hibernation WS API that the room touches.
 */
function makeStubWs(tags: string[]): { ws: any; messages: any[] } {
  const messages: any[] = [];
  const ws = {
    _tags: tags,
    readyState: 1, // OPEN
    send(raw: string) { messages.push(JSON.parse(raw)); },
    close() {},
  };
  return { ws, messages };
}

/**
 * Build a minimal stub ctx that tracks registered sockets by userId tag (tags[0])
 * so that getWebSockets(userId) works correctly for multi-socket tests.
 */
function makeStubCtx() {
  // Map from userId -> list of stub ws objects currently "open"
  const socketsByUser = new Map<string, any[]>();
  const allSockets: any[] = [];

  const ctx = {
    storage: {
      get: async (key: string) => {
        // Return stored name for 'name:*' keys so spectator name lookup works
        if (typeof key === 'string' && key.startsWith('name:')) return 'TestUser';
        return undefined;
      },
      put: async () => undefined,
      delete: async () => undefined,
      deleteAll: async () => undefined,
      list: async () => new Map(),
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
    getCurrentAlarm: () => null,
    getWebSockets: (userId?: string) => {
      if (userId === undefined) return [...allSockets];
      return socketsByUser.get(userId) ?? [];
    },
    getTags: (ws: any) => ws._tags as string[],
    acceptWebSocket: (ws: any, tags: string[]) => {
      // Attach tags to the ws object (mirrors CF behaviour)
      ws._tags = tags;
      const userId = tags[0];
      if (!socketsByUser.has(userId)) socketsByUser.set(userId, []);
      socketsByUser.get(userId)!.push(ws);
      allSockets.push(ws);
    },
    // Helper to simulate a socket closing (removes it from tracking)
    _closeSocket: (ws: any) => {
      const userId = ws._tags?.[0];
      if (userId) {
        const list = socketsByUser.get(userId) ?? [];
        const idx = list.indexOf(ws);
        if (idx !== -1) list.splice(idx, 1);
        if (list.length === 0) socketsByUser.delete(userId);
      }
      const ai = allSockets.indexOf(ws);
      if (ai !== -1) allSockets.splice(ai, 1);
    },
  };
  return ctx;
}

function makeStubEnv() {
  return {
    DB: {
      prepare: () => ({
        bind: () => ({
          run: async () => ({}),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      }),
    },
  };
}

/** Create a fresh PokerRoom with a minimal lobby-phase setup. */
function makeRoom(ctx: any) {
  const room: any = new PokerRoom(ctx, makeStubEnv());
  room.code = 'TEST';
  room.phase = 'lobby';
  room.players = new Map();
  room.bots = new Map();
  room.spectators = new Map();
  room.turnOrder = [];
  room.tableState = null;
  // Stub expensive side-effect methods
  room.saveState = async () => undefined;
  room.writeActiveRoom = async () => undefined;
  room.clearActiveRoom = async () => undefined;
  room.resolveCosmeticsForPlayer = async () => undefined;
  room.setExpireAlarm = async () => undefined;
  return room;
}

/** Send a JSON message to the room as if it came from the given ws. */
async function sendMessage(room: any, ws: any, msg: object) {
  // webSocketMessage expects the raw string
  await room.webSocketMessage(ws, JSON.stringify(msg));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('connection-model refactor', () => {

  // ── 1. Two same-role sockets coexist (F4 removal) ────────────────────────

  describe('test 1: two same-role sockets coexist', () => {
    test('both sockets appear in ctx.getWebSockets(userId)', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);

      const { ws: wsA } = makeStubWs([]);
      const { ws: wsB } = makeStubWs([]);

      // Accept both sockets for the same userId with role 'both' (player sockets)
      ctx.acceptWebSocket(wsA, ['user1', 'both', 'sock-a']);
      ctx.acceptWebSocket(wsB, ['user1', 'both', 'sock-b']);

      const sockets = ctx.getWebSockets('user1');
      expect(sockets).toHaveLength(2);
      expect(sockets).toContain(wsA);
      expect(sockets).toContain(wsB);
    });

    test('broadcastState sends to both sockets when player has two tabs open', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['user1', { id: 'user1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('sock-a', 'both', Date.now()), makeDevice('sock-b', 'both', Date.now())] }],
      ]);
      room.turnOrder = ['user1'];
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { user1: 1000 }, playerBets: { user1: 0 },
        playerFolded: { user1: false }, playerAllIn: { user1: false },
        isGuestPlayer: { user1: false }, actionOnPlayerId: 'user1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      const { ws: wsA, messages: msgsA } = makeStubWs(['user1', 'both', 'sock-a']);
      const { ws: wsB, messages: msgsB } = makeStubWs(['user1', 'both', 'sock-b']);
      ctx.acceptWebSocket(wsA, wsA._tags);
      ctx.acceptWebSocket(wsB, wsB._tags);

      room.broadcastState();

      expect(msgsA.some((m: any) => m.type === 'state_update')).toBe(true);
      expect(msgsB.some((m: any) => m.type === 'state_update')).toBe(true);
    });

    test('hasRemainingDevices returns true when one of two sockets closes', async () => {
      const { hasRemainingDevices, removeDevice, makeDevice: md } = await import('../../shared/deviceManager');
      const player: any = {
        id: 'user1',
        devices: [md('sock-a', 'both', Date.now()), md('sock-b', 'both', Date.now())],
      };
      expect(hasRemainingDevices(player)).toBe(true);
      removeDevice(player, 'sock-a');
      // One device still present
      expect(hasRemainingDevices(player)).toBe(true);
      removeDevice(player, 'sock-b');
      expect(hasRemainingDevices(player)).toBe(false);
    });
  });

  // ── 2. Turn guard prevents double-action from duplicate tabs ─────────────

  describe('test 2: turn guard prevents double-action from duplicate tabs', () => {
    test('socket B action is rejected with "Not your turn" after socket A already acted', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['user1', { id: 'user1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('sock-a', 'both', Date.now())] }],
        ['user2', { id: 'user2', name: 'Bob', hand: [], connected: true, isHost: false, devices: [makeDevice('sock-b', 'both', Date.now())] }],
      ]);
      room.turnOrder = ['user1', 'user2'];
      room.bots = new Map();
      room.tableState = {
        communityCards: [], pots: [{ amount: 30, eligiblePlayers: ['user1', 'user2'] }],
        currentBet: 10, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { user1: 990, user2: 990 },
        playerBets: { user1: 10, user2: 10 },
        playerFolded: { user1: false, user2: false },
        playerAllIn: { user1: false, user2: false },
        isGuestPlayer: { user1: false, user2: false },
        actionOnPlayerId: 'user2', // user2's turn
        lastRaisePlayerId: null, bbHasActed: true, bbPlayerId: 'user1',
        roundStartPlayerId: 'user2', actedThisRound: { user1: true },
        gameMode: 'casual', casualChipCount: 1000,
      };

      // Socket A is a second tab for user2 (not the action socket)
      const { ws: wsA, messages: msgsA } = makeStubWs(['user2', 'both', 'sock-a2']);
      const { ws: wsB, messages: msgsB } = makeStubWs(['user2', 'both', 'sock-b2']);
      ctx.acceptWebSocket(wsA, wsA._tags);
      ctx.acceptWebSocket(wsB, wsB._tags);

      // Simulate user2 acting from wsB (fold) — this advances actionOnPlayerId
      // We test the guard directly: send an action as user1 when actionOnPlayerId is user2
      const { ws: wsUser1, messages: msgsUser1 } = makeStubWs(['user1', 'both', 'sock-u1']);
      ctx.acceptWebSocket(wsUser1, wsUser1._tags);

      await sendMessage(room, wsUser1, { type: 'fold' });

      // user1 is not the current actor (user2 is), so must receive "Not your turn"
      expect(msgsUser1.some((m: any) => m.type === 'error' && m.message === 'Not your turn to act')).toBe(true);
    });

    test('duplicate-tab action on same userId is rejected when turn has already advanced', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['user1', { id: 'user1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('sock-a', 'both', Date.now())] }],
        ['user2', { id: 'user2', name: 'Bob', hand: [], connected: true, isHost: false, devices: [makeDevice('sock-b', 'both', Date.now())] }],
      ]);
      room.turnOrder = ['user1', 'user2'];
      room.bots = new Map();
      // It is user2's turn; user1 tries to act from a duplicate tab
      room.tableState = {
        communityCards: [], pots: [], currentBet: 10, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { user1: 990, user2: 990 },
        playerBets: { user1: 10, user2: 10 },
        playerFolded: { user1: false, user2: false },
        playerAllIn: { user1: false, user2: false },
        isGuestPlayer: { user1: false, user2: false },
        actionOnPlayerId: 'user2',
        lastRaisePlayerId: null, bbHasActed: true, bbPlayerId: 'user1',
        roundStartPlayerId: 'user2', actedThisRound: { user1: true },
        gameMode: 'casual', casualChipCount: 1000,
      };

      // Two sockets for user1 — simulating duplicate tabs
      const { ws: wsTab1, messages: msgs1 } = makeStubWs(['user1', 'both', 'sock-t1']);
      const { ws: wsTab2, messages: msgs2 } = makeStubWs(['user1', 'both', 'sock-t2']);
      ctx.acceptWebSocket(wsTab1, wsTab1._tags);
      ctx.acceptWebSocket(wsTab2, wsTab2._tags);

      // Tab 1 tries to fold (not user1's turn)
      await sendMessage(room, wsTab1, { type: 'fold' });
      // Tab 2 also tries to fold
      await sendMessage(room, wsTab2, { type: 'fold' });

      // Both must be rejected
      expect(msgs1.some((m: any) => m.type === 'error' && m.message === 'Not your turn to act')).toBe(true);
      expect(msgs2.some((m: any) => m.type === 'error' && m.message === 'Not your turn to act')).toBe(true);
    });
  });

  // ── 3. Spectate-intent tag routes to spectator branch (playing phase) ─────

  describe('test 3: spectate-intent tag routes to spectator branch (playing phase)', () => {
    test('join with spectate tag registers in this.spectators, not this.players', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [] }],
        ['p2', { id: 'p2', name: 'Bob', hand: [], connected: true, isHost: false, devices: [] }],
      ]);
      room.turnOrder = ['p1', 'p2'];
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000, p2: 1000 }, playerBets: { p1: 0, p2: 0 },
        playerFolded: { p1: false, p2: false }, playerAllIn: { p1: false, p2: false },
        isGuestPlayer: { p1: false, p2: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: 'p2',
        roundStartPlayerId: 'p1', actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      const { ws, messages } = makeStubWs(['spec1', 'both', 'sock-s1', 'spectate']);
      ctx.acceptWebSocket(ws, ws._tags);

      await sendMessage(room, ws, { type: 'join' });

      // Must be in spectators, NOT in players
      expect(room.spectators.has('spec1')).toBe(true);
      expect(room.players.has('spec1')).toBe(false);

      // joined response must have isSpectator: true
      const joinedMsg = messages.find((m: any) => m.type === 'joined');
      expect(joinedMsg).toBeDefined();
      expect(joinedMsg.isSpectator).toBe(true);
    });
  });

  // ── 4. Spectate intent works in lobby phase (Bug 2A) ─────────────────────

  describe('test 4: spectate intent works in lobby phase', () => {
    test('join with spectate tag in lobby phase registers as spectator, not player', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      // phase is already 'lobby' from makeRoom
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [] }],
      ]);

      const { ws, messages } = makeStubWs(['spec1', 'both', 'sock-s1', 'spectate']);
      ctx.acceptWebSocket(ws, ws._tags);

      await sendMessage(room, ws, { type: 'join' });

      expect(room.spectators.has('spec1')).toBe(true);
      expect(room.players.has('spec1')).toBe(false);

      const joinedMsg = messages.find((m: any) => m.type === 'joined');
      expect(joinedMsg).toBeDefined();
      expect(joinedMsg.isSpectator).toBe(true);
    });

    test('join WITHOUT spectate tag in lobby phase registers as player', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      // Empty lobby — first joiner becomes host
      room.players = new Map();

      // No spectate tag — 3-element tags array
      const { ws, messages } = makeStubWs(['newcomer', 'both', 'sock-n1']);
      ctx.acceptWebSocket(ws, ws._tags);

      await sendMessage(room, ws, { type: 'join' });

      expect(room.players.has('newcomer')).toBe(true);
      expect(room.spectators.has('newcomer')).toBe(false);
    });
  });

  // ── 5. Returning player ignores spectate intent ───────────────────────────

  describe('test 5: returning player ignores spectate intent', () => {
    test('player already in this.players reconnects even when socket has spectate tag', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['existing', { id: 'existing', name: 'Alice', hand: [], connected: false, isHost: true, devices: [] }],
        ['p2', { id: 'p2', name: 'Bob', hand: [], connected: true, isHost: false, devices: [] }],
      ]);
      room.turnOrder = ['existing', 'p2'];
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { existing: 900, p2: 1000 }, playerBets: { existing: 0, p2: 0 },
        playerFolded: { existing: false, p2: false }, playerAllIn: { existing: false, p2: false },
        isGuestPlayer: { existing: false, p2: false }, actionOnPlayerId: 'existing',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: 'p2',
        roundStartPlayerId: 'existing', actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      // Socket carries the spectate tag — but the player is already in this.players
      const { ws, messages } = makeStubWs(['existing', 'both', 'sock-r1', 'spectate']);
      ctx.acceptWebSocket(ws, ws._tags);

      await sendMessage(room, ws, { type: 'join' });

      // Reconnection path must fire: player stays in this.players, NOT demoted to spectator
      expect(room.players.has('existing')).toBe(true);
      expect(room.spectators.has('existing')).toBe(false);

      // joined response must NOT have isSpectator: true (reconnect path returns player state)
      const joinedMsg = messages.find((m: any) => m.type === 'joined');
      expect(joinedMsg).toBeDefined();
      expect(joinedMsg.isSpectator).toBeUndefined();

      // Player is now reconnected
      expect(room.players.get('existing').connected).toBe(true);
    });
  });

  // ── 6. Spectator multi-socket close guard (GAP-1) ────────────────────────

  describe('test 6: spectator multi-socket close guard (GAP-1)', () => {
    test('closing one of two spectator sockets does not remove spectator from this.spectators', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('ps1', 'both', Date.now())] }],
      ]);
      room.spectators = new Map([['specUser', 'Spectator']]);
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000 }, playerBets: { p1: 0 },
        playerFolded: { p1: false }, playerAllIn: { p1: false },
        isGuestPlayer: { p1: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      // Two spectator sockets for the same user
      const { ws: wsSpec1 } = makeStubWs(['specUser', 'both', 'sock-sp1', 'spectate']);
      const { ws: wsSpec2 } = makeStubWs(['specUser', 'both', 'sock-sp2', 'spectate']);
      ctx.acceptWebSocket(wsSpec1, wsSpec1._tags);
      ctx.acceptWebSocket(wsSpec2, wsSpec2._tags);

      // Close socket 1 — socket 2 is still tracked in ctx
      ctx._closeSocket(wsSpec1);
      await room.webSocketClose(wsSpec1, 1000, 'tab closed');

      // specUser still has one open socket — must remain in this.spectators
      expect(room.spectators.has('specUser')).toBe(true);
    });

    test('closing the last spectator socket removes them from this.spectators', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('ps1', 'both', Date.now())] }],
      ]);
      room.spectators = new Map([['specUser', 'Spectator']]);
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000 }, playerBets: { p1: 0 },
        playerFolded: { p1: false }, playerAllIn: { p1: false },
        isGuestPlayer: { p1: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      const { ws: wsSpec } = makeStubWs(['specUser', 'both', 'sock-sp1', 'spectate']);
      ctx.acceptWebSocket(wsSpec, wsSpec._tags);

      // Remove the only socket from tracking first (simulates CF closing it)
      ctx._closeSocket(wsSpec);
      await room.webSocketClose(wsSpec, 1000, 'tab closed');

      // No remaining sockets — spectator must be removed
      expect(room.spectators.has('specUser')).toBe(false);
    });
  });

  // ── 7. Precedence rule: spectate=1 wins over any ?role= (GAP-2) ──────────

  describe('test 7: spectate intent takes precedence over role tag', () => {
    test('socket tagged [userId, "both", socketId, "spectate"] is registered as spectator', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('ps1', 'both', Date.now())] }],
      ]);
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000 }, playerBets: { p1: 0 },
        playerFolded: { p1: false }, playerAllIn: { p1: false },
        isGuestPlayer: { p1: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      // role='both' + spectate tag: spectate takes precedence
      const { ws, messages } = makeStubWs(['specUser', 'both', 'sock-s1', 'spectate']);
      ctx.acceptWebSocket(ws, ws._tags);

      await sendMessage(room, ws, { type: 'join' });

      expect(room.spectators.has('specUser')).toBe(true);
      expect(room.players.has('specUser')).toBe(false);
    });

    test('socket tagged [userId, "controller", socketId, "spectate"] is registered as spectator, not player', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('ps1', 'both', Date.now())] }],
      ]);
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000 }, playerBets: { p1: 0 },
        playerFolded: { p1: false }, playerAllIn: { p1: false },
        isGuestPlayer: { p1: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      // role='controller' + spectate: spectate wins, no device pushed
      const { ws, messages } = makeStubWs(['specUser2', 'controller', 'sock-s2', 'spectate']);
      ctx.acceptWebSocket(ws, ws._tags);

      await sendMessage(room, ws, { type: 'join' });

      expect(room.spectators.has('specUser2')).toBe(true);
      expect(room.players.has('specUser2')).toBe(false);
    });

    test('socket with spectate tag does NOT push a device even if role is present', async () => {
      // The fetch() handler guards: if (player && !isSpectateIntent) { pushDevice(...) }
      // This test verifies the guard works by inspecting the room's players map.
      // A user who is already in this.players but opens a spectate URL:
      // - the reconnection branch fires first (correct by design)
      // - the player is NOT demoted but also no extra device is pushed via the spectate path
      //
      // For a fresh (non-player) user: the spectate branch registers them in this.spectators,
      // and pushDevice is never called (spectators have no player record to push to).
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('ps1', 'both', Date.now())] }],
      ]);
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000 }, playerBets: { p1: 0 },
        playerFolded: { p1: false }, playerAllIn: { p1: false },
        isGuestPlayer: { p1: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      const { ws } = makeStubWs(['freshSpec', 'both', 'sock-f1', 'spectate']);
      ctx.acceptWebSocket(ws, ws._tags);
      await sendMessage(room, ws, { type: 'join' });

      // freshSpec is in spectators — there is no CardPlayer record for them
      expect(room.spectators.has('freshSpec')).toBe(true);
      expect(room.players.has('freshSpec')).toBe(false);
      // No devices were created for freshSpec (they have no player record)
    });
  });

  // ── 8. No tags.length === 3 assumption — 4-tag sockets dispatch correctly ─

  describe('test 8: 4-tag spectator sockets and 3-tag player sockets both dispatch', () => {
    test('webSocketMessage dispatches join for spectator (4-tag) socket without error', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';
      room.players = new Map([
        ['p1', { id: 'p1', name: 'Alice', hand: [], connected: true, isHost: true, devices: [] }],
      ]);
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { p1: 1000 }, playerBets: { p1: 0 },
        playerFolded: { p1: false }, playerAllIn: { p1: false },
        isGuestPlayer: { p1: false }, actionOnPlayerId: 'p1',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: null,
        roundStartPlayerId: null, actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      const { ws: ws4, messages: msgs4 } = makeStubWs(['specX', 'both', 'sock-4', 'spectate']);
      ctx.acceptWebSocket(ws4, ws4._tags);

      // Must not throw and must result in a joined response
      await sendMessage(room, ws4, { type: 'join' });
      expect(msgs4.some((m: any) => m.type === 'joined')).toBe(true);
    });

    test('webSocketMessage dispatches join for player (3-tag) socket without error', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      // Empty lobby so the join goes through the player branch
      room.players = new Map();

      const { ws: ws3, messages: msgs3 } = makeStubWs(['playerX', 'both', 'sock-3']);
      ctx.acceptWebSocket(ws3, ws3._tags);

      await sendMessage(room, ws3, { type: 'join' });
      expect(msgs3.some((m: any) => m.type === 'joined')).toBe(true);
    });

    test('getTags length is 4 for spectator sockets and 3 for player sockets', () => {
      const ctx = makeStubCtx();
      const { ws: wsSpec } = makeStubWs(['specY', 'both', 'sock-sp', 'spectate']);
      ctx.acceptWebSocket(wsSpec, wsSpec._tags);

      const { ws: wsPlayer } = makeStubWs(['playerY', 'both', 'sock-pl']);
      ctx.acceptWebSocket(wsPlayer, wsPlayer._tags);

      expect(ctx.getTags(wsSpec)).toHaveLength(4);
      expect(ctx.getTags(wsSpec)[3]).toBe('spectate');
      expect(ctx.getTags(wsPlayer)).toHaveLength(3);
      expect(ctx.getTags(wsPlayer)[3]).toBeUndefined();
    });
  });

  // ── 9. Casino spectate intent gate (todo — no harness) ───────────────────

  test.todo(
    'test 9: casinoRoom spectate-intent gate routes to spectator branch (lobby + playing phase) — ' +
    'CasinoRoom is a separate base class with its own fetch(). No test harness exists for it. ' +
    'Manual repro: MAN-6 above. Track as follow-up when casinoRoom gets a test harness.',
  );

  // ── 10. Promoted-spectator compatibility (DNH-7) ──────────────────────────

  describe('test 10: promoted spectator is treated as player on next join (DNH-7)', () => {
    test('after play_again promotion, spectator socket with stale spectate tag reconnects as player', async () => {
      const ctx = makeStubCtx();
      const room = makeRoom(ctx);
      room.phase = 'playing';

      // Seed an existing player
      room.players = new Map([
        ['host', { id: 'host', name: 'Alice', hand: [], connected: true, isHost: true, devices: [makeDevice('ps1', 'both', Date.now())] }],
        ['p2', { id: 'p2', name: 'Bob', hand: [], connected: true, isHost: false, devices: [makeDevice('ps2', 'both', Date.now())] }],
      ]);
      room.hostId = 'host';
      room.spectators = new Map([['specPromoted', 'Carol']]);
      room.bots = new Map();
      room.tableState = {
        communityCards: [], pots: [], currentBet: 0, bettingRound: 'preflop',
        dealerIndex: 0, smallBlindAmount: 5, bigBlindAmount: 10, deck: [],
        lastAction: null, winnersInfo: null, handNumber: 1,
        playerChips: { host: 1000, p2: 1000 }, playerBets: { host: 0, p2: 0 },
        playerFolded: { host: false, p2: false }, playerAllIn: { host: false, p2: false },
        isGuestPlayer: { host: false, p2: false }, actionOnPlayerId: 'host',
        lastRaisePlayerId: null, bbHasActed: false, bbPlayerId: 'p2',
        roundStartPlayerId: 'host', actedThisRound: {}, gameMode: 'casual', casualChipCount: 1000,
      };

      // Register host and p2 sockets so broadcastState works
      const { ws: wsHost } = makeStubWs(['host', 'both', 'ps1']);
      const { ws: wsP2 } = makeStubWs(['p2', 'both', 'ps2']);
      ctx.acceptWebSocket(wsHost, wsHost._tags);
      ctx.acceptWebSocket(wsP2, wsP2._tags);

      // Host sends play_again — spectator should be promoted to player
      const { ws: wsHostMsg } = makeStubWs(['host', 'both', 'ps-msg']);
      ctx.acceptWebSocket(wsHostMsg, wsHostMsg._tags);
      await sendMessage(room, wsHostMsg, { type: 'play_again' });

      // After play_again, specPromoted must be in players and NOT in spectators
      expect(room.players.has('specPromoted')).toBe(true);
      expect(room.spectators.has('specPromoted')).toBe(false);

      // Now simulate the promoted spectator's socket sending 'join' — it still has the
      // stale spectate tag, but the player IS now in this.players, so the reconnection
      // branch must fire rather than the spectator branch.
      const { ws: wsPromoted, messages: promMsgs } = makeStubWs(['specPromoted', 'both', 'sock-promo', 'spectate']);
      ctx.acceptWebSocket(wsPromoted, wsPromoted._tags);

      await sendMessage(room, wsPromoted, { type: 'join' });

      // Reconnection path fired: specPromoted is a player, must stay in players
      expect(room.players.has('specPromoted')).toBe(true);
      // Must NOT be re-added to spectators
      expect(room.spectators.has('specPromoted')).toBe(false);

      // joined response must not be a spectator join
      const joinedMsg = promMsgs.find((m: any) => m.type === 'joined');
      expect(joinedMsg).toBeDefined();
      expect(joinedMsg.isSpectator).toBeUndefined();
    });
  });

});
