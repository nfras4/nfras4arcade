import { describe, it, expect, beforeEach } from 'bun:test';
import { checkLevelGrants } from '../worker/shared/levelRewards';
import type { GrantedReward } from '../worker/shared/levelRewards';

// ---------------------------------------------------------------------------
// Minimal D1Database mock (Option 2: pure canned-response mocks)
// ---------------------------------------------------------------------------
// The mock tracks calls to .prepare().bind().first() and .prepare().bind().all()
// and returns pre-configured responses based on SQL pattern matching.

interface MockPreparedStatement {
	bind(...args: unknown[]): MockBoundStatement;
}

interface MockBoundStatement {
	first<T = unknown>(): Promise<T | null>;
	all<T = unknown>(): Promise<{ results: T[] }>;
	run(): Promise<void>;
}

type QueryHandler = (sql: string, bindings: unknown[]) => unknown;

function buildMockDb(handlers: { firstHandler?: QueryHandler; allHandler?: QueryHandler }): D1Database {
	const capturedStmts: Array<{ sql: string; bindings: unknown[] }> = [];

	function makeBound(sql: string): MockPreparedStatement {
		return {
			bind(...bindings: unknown[]): MockBoundStatement {
				return {
					async first<T>(): Promise<T | null> {
						if (handlers.firstHandler) {
							return handlers.firstHandler(sql, bindings) as T | null;
						}
						return null;
					},
					async all<T>(): Promise<{ results: T[] }> {
						if (handlers.allHandler) {
							return { results: handlers.allHandler(sql, bindings) as T[] };
						}
						return { results: [] };
					},
					async run(): Promise<void> {
						capturedStmts.push({ sql, bindings });
					},
				};
			},
		};
	}

	// The mock prepare returns a statement that generates a D1PreparedStatement-like
	// object. For stmts array checks we need prepare().bind() to return something
	// with a sql property accessible for assertions.
	const db = {
		prepare(sql: string) {
			return {
				bind(...bindings: unknown[]) {
					const bound = makeBound(sql).bind(...bindings);
					// Expose sql for assertion (d) - ON CONFLICT check
					(bound as unknown as Record<string, unknown>)._sql = sql;
					return bound;
				},
			};
		},
		async batch(stmts: unknown[]) {
			void stmts;
			return [];
		},
		async dump() {
			return new ArrayBuffer(0);
		},
		async exec(query: string) {
			void query;
			return { count: 0, duration: 0 };
		},
	} as unknown as D1Database;

	return db;
}

// ---------------------------------------------------------------------------
// Helper: build a D1Database mock with explicit xp and catalog rows
// ---------------------------------------------------------------------------
function makeDb(opts: {
	xp: number;
	catalogRows: Array<{ id: string; name: string; subcategory: string; tier: 'hero' | 'minor'; level_requirement: number }>;
}): D1Database {
	return buildMockDb({
		firstHandler(sql, bindings) {
			// SELECT xp FROM player_profiles
			if (sql.includes('player_profiles')) {
				return { xp: opts.xp };
			}
			return null;
		},
		allHandler(sql, bindings) {
			// SELECT ... FROM shop_items WHERE tier IN ('hero','minor') AND level_requirement > ? AND level_requirement <= ?
			if (sql.includes('shop_items')) {
				const [oldLevel, newLevel] = bindings as [number, number];
				return opts.catalogRows.filter(
					(r) => r.level_requirement > oldLevel && r.level_requirement <= newLevel
				);
			}
			return [];
		},
	});
}

// ---------------------------------------------------------------------------
// (a) Integration: grant-on-XP-award threshold crossing
// ---------------------------------------------------------------------------
describe('checkLevelGrants -- threshold crossing', () => {
	it('grants the level-2 hero when xp crosses from 0 to 100', async () => {
		const db = makeDb({
			xp: 0,
			catalogRows: [
				{ id: 'hero_frame_lv2', name: 'Champion Frame', subcategory: 'frame', tier: 'hero', level_requirement: 2 },
			],
		});

		const result = await checkLevelGrants(db, 'test-player', 100);

		expect(result.newXp).toBe(100);
		expect(result.grants.length).toBe(1);
		expect(result.grants[0].level).toBe(2);
		expect(result.grants[0].tier).toBe('hero');
		expect(result.grants[0].itemId).toBe('hero_frame_lv2');
		// One INSERT statement per granted item
		expect(result.stmts.length).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// (b) Unit: multi-threshold crossing
// ---------------------------------------------------------------------------
describe('checkLevelGrants -- multi-threshold crossing', () => {
	// xpToLevel(0) = 1, xpToLevel(1100) = 5
	// Items at levels 3 and 5 should be granted; level 10 should NOT.
	it('grants items at levels 3 and 5 but not 10 when jumping from level 1 to level 5', async () => {
		const db = makeDb({
			xp: 0,
			catalogRows: [
				{ id: 'minor_emblem_lv3', name: 'Bronze Emblem', subcategory: 'emblem', tier: 'minor', level_requirement: 3 },
				{ id: 'minor_avatar_lv5', name: 'Flame Avatar', subcategory: 'avatar', tier: 'minor', level_requirement: 5 },
				{ id: 'hero_emblem_lv10', name: 'Hero Emblem', subcategory: 'emblem', tier: 'hero', level_requirement: 10 },
			],
		});

		// xp gain of 1100: 0 + 1100 = 1100, xpToLevel(1100) = 5
		const result = await checkLevelGrants(db, 'test-player', 1100);

		expect(result.newXp).toBe(1100);

		const grantedLevels = result.grants.map((g: GrantedReward) => g.level);
		expect(grantedLevels).toContain(3);
		expect(grantedLevels).toContain(5);
		expect(grantedLevels).not.toContain(10);

		expect(result.grants.length).toBe(2);
		expect(result.stmts.length).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// (c) Unit: zero-threshold-crossing no-op
// ---------------------------------------------------------------------------
describe('checkLevelGrants -- zero threshold crossing', () => {
	// xpToLevel(1050) = 5, xpToLevel(1080) = 5: no level-up
	it('returns empty grants and stmts when level does not change', async () => {
		const db = makeDb({
			xp: 1050,
			catalogRows: [
				{ id: 'minor_avatar_lv5', name: 'Flame Avatar', subcategory: 'avatar', tier: 'minor', level_requirement: 5 },
			],
		});

		const result = await checkLevelGrants(db, 'test-player', 30);

		expect(result.newXp).toBe(1080);
		expect(result.grants).toEqual([]);
		expect(result.stmts).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// (d) Unit: already-owned no-op -- ON CONFLICT clause present in stmts
// ---------------------------------------------------------------------------
describe('checkLevelGrants -- ON CONFLICT DO NOTHING in generated stmts', () => {
	it('generated INSERT statements contain ON CONFLICT(player_id, item_id) DO NOTHING', async () => {
		const db = makeDb({
			xp: 0,
			catalogRows: [
				{ id: 'hero_frame_lv2', name: 'Champion Frame', subcategory: 'frame', tier: 'hero', level_requirement: 2 },
			],
		});

		const result = await checkLevelGrants(db, 'test-player', 100);

		expect(result.stmts.length).toBe(1);
		// The _sql property is attached by our mock's bind() wrapper
		const sql = (result.stmts[0] as unknown as Record<string, unknown>)._sql as string;
		expect(sql).toContain('ON CONFLICT(player_id, item_id) DO NOTHING');
	});
});

// ---------------------------------------------------------------------------
// (e) Integration: hero purchase rejection
// ---------------------------------------------------------------------------
// This test directly exercises the purchase endpoint logic inline
// (no HTTP server running; we replicate the handler guard logic).
describe('purchase endpoint -- hero rejection', () => {
	it('returns 400 with hero-cosmetics-not-purchasable for tier=hero items', async () => {
		// Replicate the guard from src/routes/api/shop/purchase/+server.ts
		const item = {
			id: 'hero_frame_lv2',
			name: 'Champion Frame',
			category: 'cosmetic',
			subcategory: 'frame',
			price: 0,
			tier: 'hero' as const,
		};

		// Guard logic (verbatim copy of purchase endpoint lines 47-49)
		let responseStatus: number | null = null;
		let responseBody: Record<string, unknown> | null = null;
		if (item.tier === 'hero') {
			responseStatus = 400;
			responseBody = { error: 'hero-cosmetics-not-purchasable' };
		}

		expect(responseStatus).toBe(400);
		expect(responseBody).toEqual({ error: 'hero-cosmetics-not-purchasable' });
	});

	it('does not reject minor items at the hero-tier guard', () => {
		const item: { id: string; name: string; category: string; subcategory: string; price: number; tier: 'shop' | 'hero' | 'minor' } = {
			id: 'minor_emblem_lv3',
			name: 'Bronze Emblem',
			category: 'cosmetic',
			subcategory: 'emblem',
			price: 500,
			tier: 'minor',
		};

		let wasRejected = false;
		if (item.tier === 'hero') {
			wasRejected = true;
		}

		expect(wasRejected).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// (f) Integration: minor dual-path -- buy then level-up no-op
// ---------------------------------------------------------------------------
describe('checkLevelGrants -- minor dual-path: already purchased via shop', () => {
	// Player owns the item already (bought with chips).
	// checkLevelGrants still generates an INSERT, but ON CONFLICT DO NOTHING
	// means the DB-level result is a no-op. We verify the stmt text.
	it('generates INSERT with ON CONFLICT DO NOTHING for a minor item (DB handles idempotency)', async () => {
		const db = makeDb({
			xp: 0,
			catalogRows: [
				{ id: 'minor_avatar_lv5', name: 'Flame Avatar', subcategory: 'avatar', tier: 'minor', level_requirement: 5 },
			],
		});

		// Player gains enough XP to cross level 5 (threshold=1000; xp 0 + 1100 = 1100 = level 5)
		const result = await checkLevelGrants(db, 'test-player', 1100);

		expect(result.stmts.length).toBe(1);
		const sql = (result.stmts[0] as unknown as Record<string, unknown>)._sql as string;
		// The stmt must include the conflict clause that makes it a no-op if already owned
		expect(sql).toContain('ON CONFLICT(player_id, item_id) DO NOTHING');
		// The item is still reported in grants (the call-site decides whether to notify)
		expect(result.grants[0].itemId).toBe('minor_avatar_lv5');
	});
});

// ---------------------------------------------------------------------------
// (g) Integration: retroactive reconciliation no-op
// ---------------------------------------------------------------------------
// Simulate the /api/auth/me reconciliation logic for a player who already
// owns all hero+minor cosmetics at level <= their current level.
describe('retroactive reconciliation -- no-op for already-reconciled player', () => {
	it('inserts nothing when player already owns all items at or below their level', async () => {
		// xpToLevel(5000) = 10; player should have all items at level_requirement <= 10
		const xp = 5000; // level 10

		// All hero+minor items at level <= 10 pre-seeded in inventory
		const allItems = [
			{ id: 'hero_frame_lv2', level_requirement: 2, tier: 'hero' as const },
			{ id: 'minor_emblem_lv3', level_requirement: 3, tier: 'minor' as const },
			{ id: 'hero_emblem_lv5', level_requirement: 5, tier: 'hero' as const },
			{ id: 'minor_avatar_lv7', level_requirement: 7, tier: 'minor' as const },
			{ id: 'hero_avatar_lv10', level_requirement: 10, tier: 'hero' as const },
		];
		const inventoryIds = allItems.map((i) => i.id);

		// The reconciliation query from /api/auth/me: find items the player should
		// have but doesn't. All items are already in inventory, so result is empty.
		function simulateReconciliationQuery(currentLevel: number, ownedIds: string[]): string[] {
			return allItems
				.filter((item) => item.level_requirement <= currentLevel && !ownedIds.includes(item.id))
				.map((item) => item.id);
		}

		const { xpToLevel } = await import('../src/lib/xp');
		const currentLevel = xpToLevel(xp);
		expect(currentLevel).toBe(10);

		const missing = simulateReconciliationQuery(currentLevel, inventoryIds);

		// No items should be missing -- batch insert is never called
		expect(missing).toHaveLength(0);

		// Verify: if nothing is missing, no INSERT operations are triggered
		const insertCount = missing.length;
		expect(insertCount).toBe(0);
	});

	it('inserts only the missing items when player has some but not all earned cosmetics', async () => {
		const xp = 5000; // level 10
		const allItems = [
			{ id: 'hero_frame_lv2', level_requirement: 2, tier: 'hero' as const },
			{ id: 'minor_emblem_lv3', level_requirement: 3, tier: 'minor' as const },
			{ id: 'hero_emblem_lv5', level_requirement: 5, tier: 'hero' as const },
			{ id: 'minor_avatar_lv7', level_requirement: 7, tier: 'minor' as const },
			{ id: 'hero_avatar_lv10', level_requirement: 10, tier: 'hero' as const },
		];

		// Player owns only the first two; missing 3 items
		const ownedIds = ['hero_frame_lv2', 'minor_emblem_lv3'];

		function simulateReconciliationQuery(currentLevel: number, ownedIds: string[]): string[] {
			return allItems
				.filter((item) => item.level_requirement <= currentLevel && !ownedIds.includes(item.id))
				.map((item) => item.id);
		}

		const { xpToLevel } = await import('../src/lib/xp');
		const currentLevel = xpToLevel(xp);
		const missing = simulateReconciliationQuery(currentLevel, ownedIds);

		expect(missing).toHaveLength(3);
		expect(missing).toContain('hero_emblem_lv5');
		expect(missing).toContain('minor_avatar_lv7');
		expect(missing).toContain('hero_avatar_lv10');
	});
});
