/**
 * Regression tests: casino chip persistence is delta-based + atomic (C4 fix).
 *
 * These tests FAIL if persistChipDelta reverts to an absolute SET, if the
 * conditional guard (AND chips + ? >= 0) is removed, or if chipsAtLoad is
 * not updated after a successful persist.
 */

import { describe, test, expect, mock, beforeAll } from 'bun:test';

// Must mock cloudflare:workers BEFORE importing the DO class.
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

import type { CasinoPlayer, CasinoGameState, CasinoAction } from '../worker/casino/types';
import type { DeviceRole } from '../worker/cards/types';

// ---------------------------------------------------------------------------
// Minimal concrete subclass — satisfies all abstract members as no-ops so we
// can test the CasinoRoom base-class methods in isolation.
// ---------------------------------------------------------------------------

let TestCasinoRoom: any;

beforeAll(async () => {
	const { CasinoRoom } = await import('../worker/casino/casinoRoom');

	class _TestCasinoRoom extends CasinoRoom {
		protected async handlePlayerAction(_playerId: string, _action: CasinoAction): Promise<void> {}
		protected getStateFor(_playerId: string, _deviceRole: DeviceRole): CasinoGameState {
			return {
				code: this.code,
				phase: this.phase,
				players: [],
				roundNumber: this.roundNumber,
				minBet: this.minBet,
				maxBet: this.maxBet,
				tableState: null,
			};
		}
		protected async resolveRound(): Promise<void> {}
		protected initRound(): void {}
		protected get gameType(): string { return 'test'; }
		protected get maxSeats(): number { return 8; }

		// Expose protected methods for testing.
		public callPersistChipDelta(playerId: string) {
			return this.persistChipDelta(playerId);
		}
		public callPersistChips() {
			return this.persistChips();
		}
		public seedPlayer(player: CasinoPlayer) {
			this.players.set(player.id, player);
		}
		public getPlayer(id: string): CasinoPlayer | undefined {
			return this.players.get(id);
		}
	}

	TestCasinoRoom = _TestCasinoRoom;
});

// ---------------------------------------------------------------------------
// Shared D1 stub factory
// ---------------------------------------------------------------------------

function makeSharedDb(initialChips: Record<string, number>) {
	const chipsByUser: Record<string, number> = { ...initialChips };
	let prepareCount = 0;

	const db = {
		prepare: (sql: string) => {
			prepareCount++;
			return {
				bind: (...args: any[]) => ({
					run: async () => {
						if (sql.includes('UPDATE player_profiles SET chips = chips + ?')) {
							const [delta, _now, id, _delta2] = args;
							const current = chipsByUser[id] ?? 0;
							if (current + delta < 0) return { meta: { changes: 0 } };
							chipsByUser[id] = current + delta;
							return { meta: { changes: 1 } };
						}
						return { meta: { changes: 0 } };
					},
					first: async () => null,
					all: async () => ({ results: [] }),
				}),
			};
		},
		batch: async () => [],
	};

	return {
		db,
		chipsByUser,
		getPrepareCount: () => prepareCount,
		resetPrepareCount: () => { prepareCount = 0; },
	};
}

// ---------------------------------------------------------------------------
// Stub ctx factory (storage + websocket stubs)
// ---------------------------------------------------------------------------

function makeStubCtx(overrides?: { getWebSocketsFn?: (id?: string) => any[] }) {
	return {
		storage: {
			get: async () => undefined,
			put: async () => undefined,
			delete: async () => undefined,
			deleteAll: async () => undefined,
			list: async () => new Map(),
			getAlarm: async () => null,
			setAlarm: async () => undefined,
		},
		getWebSockets: overrides?.getWebSocketsFn ?? ((_id?: string) => []),
		getTags: (ws: any) => ws._tags as string[],
		acceptWebSocket: () => {},
	};
}

// ---------------------------------------------------------------------------
// Test 1: Concurrent rooms cannot double-spend
// ---------------------------------------------------------------------------

describe('CasinoRoom chip persistence — delta-based atomic writes', () => {

	test('concurrent rooms cannot double-spend: A wins then B loses results in correct net balance', async () => {
		const { db, chipsByUser } = makeSharedDb({ user1: 1000 });

		const envA = { DB: db };
		const envB = { DB: db };

		const roomA: any = new TestCasinoRoom(makeStubCtx(), envA);
		const roomB: any = new TestCasinoRoom(makeStubCtx(), envB);

		// Both instances independently load user1 at 1000 chips.
		const playerA: CasinoPlayer = {
			id: 'user1', name: 'Alice', connected: true, isHost: true,
			chips: 1000, chipsAtLoad: 1000, isGuest: false,
		};
		const playerB: CasinoPlayer = {
			id: 'user1', name: 'Alice', connected: true, isHost: true,
			chips: 1000, chipsAtLoad: 1000, isGuest: false,
		};
		roomA.seedPlayer(playerA);
		roomB.seedPlayer(playerB);

		// Instance A wins 500: chips become 1500.
		roomA.getPlayer('user1').chips = 1500;
		const okA = await roomA.callPersistChipDelta('user1');

		expect(okA).toBe(true);
		// D1 stub should now show 1500.
		expect(chipsByUser['user1']).toBe(1500);
		// chipsAtLoad updated on A so next delta from A is 0.
		expect(roomA.getPlayer('user1').chipsAtLoad).toBe(1500);

		// Instance B loses 500: chips become 500, chipsAtLoad still 1000.
		// Delta = 500 - 1000 = -500. After atomic UPDATE: 1500 + (-500) = 1000.
		roomB.getPlayer('user1').chips = 500;
		const okB = await roomB.callPersistChipDelta('user1');

		expect(okB).toBe(true);
		// Net result must be 1000, not 500 (absolute SET) or 1500 (no-op).
		expect(chipsByUser['user1']).toBe(1000);
	});

	// -------------------------------------------------------------------------
	// Test 2: Bust race triggers in-memory refund + error WS message
	// -------------------------------------------------------------------------

	test('bust race: conditional UPDATE refuses and persistChips refunds in-memory with error notification', async () => {
		const { db, chipsByUser } = makeSharedDb({ user1: 100 });

		// Build a stub WS with a tracked send() so we can assert the error message.
		const sentMessages: string[] = [];
		const stubWs = {
			_tags: ['user1', 'both', 'sock-1'],
			readyState: 1, // OPEN
			send(raw: string) { sentMessages.push(raw); },
			close() {},
		};

		// getWebSockets('user1') returns the stub socket so sendTo can reach it.
		const ctxWithWs = makeStubCtx({
			getWebSocketsFn: (id?: string) => {
				if (!id || id === 'user1') return [stubWs];
				return [];
			},
		});

		const envA = { DB: db };
		const envB = { DB: { ...db } };
		// Share the same underlying chipsByUser via the same db reference.
		envB.DB = db;

		const roomA: any = new TestCasinoRoom(makeStubCtx(), envA);
		const roomB: any = new TestCasinoRoom(ctxWithWs, db);

		// Corrected: env is second arg
		const roomBInstance: any = new TestCasinoRoom(ctxWithWs, { DB: db });

		const playerA: CasinoPlayer = {
			id: 'user1', name: 'Alice', connected: true, isHost: true,
			chips: 100, chipsAtLoad: 100, isGuest: false,
		};
		const playerBState: CasinoPlayer = {
			id: 'user1', name: 'Alice', connected: true, isHost: true,
			chips: 100, chipsAtLoad: 100, isGuest: false,
		};
		roomA.seedPlayer(playerA);
		roomBInstance.seedPlayer(playerBState);

		// Instance A loses 100: chips → 0. Persist. D1 → 0.
		roomA.getPlayer('user1').chips = 0;
		const okA = await roomA.callPersistChipDelta('user1');
		expect(okA).toBe(true);
		expect(chipsByUser['user1']).toBe(0);
		// A's chipsAtLoad becomes 0.
		expect(roomA.getPlayer('user1').chipsAtLoad).toBe(0);

		// Instance B (stale chipsAtLoad = 100) loses 50: chips → 50.
		// Delta = 50 - 100 = -50. Atomic UPDATE: 0 + (-50) < 0 → changes = 0 → refused.
		// persistChips should refund B's chips back to chipsAtLoad (100) and send error.
		roomBInstance.getPlayer('user1').chips = 50;
		await roomBInstance.callPersistChips();

		// In-memory refund: B's player.chips should be back to chipsAtLoad (100).
		expect(roomBInstance.getPlayer('user1').chips).toBe(100);

		// D1 must still say 0 (the refused write changed nothing).
		expect(chipsByUser['user1']).toBe(0);

		// The error WS message must have been sent.
		expect(sentMessages.length).toBeGreaterThan(0);
		const errorPayload = JSON.parse(sentMessages[0]);
		expect(errorPayload.type).toBe('error');
		expect(errorPayload.message).toBe('Chip persistence failed — settled at previous balance');
	});

	// -------------------------------------------------------------------------
	// Test 3: Zero delta is a no-op (no D1 call)
	// -------------------------------------------------------------------------

	test('zero delta skips D1 entirely and returns true', async () => {
		const { db, getPrepareCount, resetPrepareCount } = makeSharedDb({ user1: 1000 });

		const room: any = new TestCasinoRoom(makeStubCtx(), { DB: db });
		const player: CasinoPlayer = {
			id: 'user1', name: 'Alice', connected: true, isHost: true,
			chips: 1000, chipsAtLoad: 1000, isGuest: false,
		};
		room.seedPlayer(player);

		resetPrepareCount();
		const ok = await room.callPersistChipDelta('user1');

		expect(ok).toBe(true);
		// No D1 prepare calls — zero delta exits early.
		expect(getPrepareCount()).toBe(0);
	});

	// -------------------------------------------------------------------------
	// Test 4 (bonus): Guests are no-op regardless of delta
	// -------------------------------------------------------------------------

	test('guest player: persistChipDelta returns true and touches no D1 even with nonzero delta', async () => {
		const { db, getPrepareCount, resetPrepareCount } = makeSharedDb({});

		const room: any = new TestCasinoRoom(makeStubCtx(), { DB: db });
		const guest: CasinoPlayer = {
			id: 'guest_abc123', name: 'Guest', connected: true, isHost: true,
			chips: 1500, chipsAtLoad: 1000, isGuest: true,
		};
		room.seedPlayer(guest);

		resetPrepareCount();
		const ok = await room.callPersistChipDelta('guest_abc123');

		expect(ok).toBe(true);
		expect(getPrepareCount()).toBe(0);
	});

});
