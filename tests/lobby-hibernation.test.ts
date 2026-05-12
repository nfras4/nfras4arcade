/**
 * Regression test: hibernation wake must NOT mark connected players as disconnected.
 *
 * Before the fix, CardRoom.loadState() blanket-set every non-bot player's
 * connected flag to false on wake. The WebSocket Hibernation API keeps sockets
 * alive across hibernation, so this wrongly told every client they were offline.
 *
 * The fix (cardRoom.ts:164-172) reconciles connected against ctx.getWebSockets()
 * before returning from loadState. This test FAILS if that reconciliation is
 * removed and blanket-false is restored.
 */

import { describe, test, expect, mock, beforeAll } from 'bun:test';

// Mock cloudflare:workers BEFORE importing CardRoom (same pattern as connection-model.test.ts)
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

let ConnectFourRoom: any;
beforeAll(async () => {
	({ ConnectFourRoom } = await import('../worker/connectFour/room'));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStubWs(tags: string[]): any {
	return {
		_tags: tags,
		readyState: 1, // OPEN
		send(_raw: string) {},
		close() {},
	};
}

/**
 * Build a minimal DurableObjectState ctx.
 * storedState is returned by storage.get('room').
 * liveSockets are the WebSockets returned by getWebSockets() — these simulate
 * the sockets the Hibernation API kept alive across the DO sleep.
 */
function makeStubCtx(storedState: unknown, liveSockets: any[]) {
	return {
		storage: {
			get: async (key: string) => {
				if (key === 'room') return storedState;
				return undefined;
			},
			put: async () => undefined,
			delete: async () => undefined,
			deleteAll: async () => undefined,
			list: async () => new Map(),
			getAlarm: async () => null,
			setAlarm: async () => undefined,
		},
		// Return all live sockets (no userId filter needed for loadState)
		getWebSockets: (_userId?: string) => liveSockets,
		getTags: (ws: any) => ws._tags as string[],
		acceptWebSocket: (_ws: any, _tags: string[]) => {},
	};
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

/**
 * Build a CardRoomStoredState with three players:
 *   - p1 (human, connected: true) — has a live socket on wake
 *   - p2 (human, connected: true) — NO socket on wake (e.g. navigated away before hibernation)
 *   - bot1 (bot,  connected: true)
 * Gameplay is in progress so loadState restores a non-trivial state.
 */
function makeStoredState() {
	const now = Date.now();
	return {
		code: 'TEST',
		phase: 'playing',
		hostId: 'p1',
		turnOrder: ['p1', 'p2'],
		currentTurn: 'p1',
		roundNumber: 1,
		scores: [['p1', 0], ['p2', 0], ['bot1', 0]],
		tableState: { board: null, pieces: {}, lastMove: null, winnerId: null, winCells: null, isDraw: false },
		lastActivity: now,
		botTurnPending: false,
		disconnectTimestamps: [],
		spectators: [],
		devices: [
			['p1',   [{ socketId: 'sock-p1', role: 'both', addedAt: now, lastSeenAt: now }]],
			['p2',   [{ socketId: 'sock-p2', role: 'both', addedAt: now, lastSeenAt: now }]],
			['bot1', []],
		],
		players: [
			['p1',   { id: 'p1',   name: 'Alice', hand: [], connected: true,  isHost: true,  isBot: false, devices: [] }],
			['p2',   { id: 'p2',   name: 'Bob',   hand: [], connected: true,  isHost: false, isBot: false, devices: [] }],
			['bot1', { id: 'bot1', name: 'Bot',   hand: [], connected: true,  isHost: false, isBot: true,  devices: [] }],
		],
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CardRoom hibernation wake — connected-status reconciliation', () => {

	test('player with a live socket stays connected: true after loadState', async () => {
		// p1 has a live socket tagged with their player ID
		const wsP1 = makeStubWs(['p1', 'both', 'sock-p1']);
		const ctx = makeStubCtx(makeStoredState(), [wsP1]);
		const room: any = new ConnectFourRoom(ctx, makeStubEnv());

		await room.loadState();

		expect(room.players.get('p1').connected).toBe(true);
	});

	test('player with no live socket is marked connected: false after loadState', async () => {
		// Only p1 has a socket; p2 does not
		const wsP1 = makeStubWs(['p1', 'both', 'sock-p1']);
		const ctx = makeStubCtx(makeStoredState(), [wsP1]);
		const room: any = new ConnectFourRoom(ctx, makeStubEnv());

		await room.loadState();

		expect(room.players.get('p2').connected).toBe(false);
	});

	test('bot remains connected: true regardless of socket presence', async () => {
		// No sockets at all — bots must be unaffected
		const ctx = makeStubCtx(makeStoredState(), []);
		const room: any = new ConnectFourRoom(ctx, makeStubEnv());

		await room.loadState();

		expect(room.players.get('bot1').connected).toBe(true);
	});

	test('second loadState call is a no-op (initialized guard)', async () => {
		const wsP1 = makeStubWs(['p1', 'both', 'sock-p1']);
		const ctx = makeStubCtx(makeStoredState(), [wsP1]);
		const room: any = new ConnectFourRoom(ctx, makeStubEnv());

		await room.loadState();
		// Swap sockets out — second call must not re-run and must not flip p1 to false
		ctx.getWebSockets = () => [];
		await room.loadState();

		// p1 is still connected because the second call was skipped
		expect(room.players.get('p1').connected).toBe(true);
	});

});
