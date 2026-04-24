import { xpToLevel } from '../../src/lib/xp';

export interface GrantedReward {
	itemId: string;
	name: string;
	type: string; // subcategory: 'frame' | 'emblem' | 'avatar' | 'name_colour' | 'card_back' | 'table_felt'
	tier: 'hero' | 'minor';
	level: number;
}

interface ShopItemRow {
	id: string;
	name: string;
	subcategory: string;
	tier: 'hero' | 'minor';
	level_requirement: number;
}

interface PlayerXpRow {
	xp: number;
}

export async function checkLevelGrants(
	db: D1Database,
	playerId: string,
	xpGain: number
): Promise<{ grants: GrantedReward[]; stmts: D1PreparedStatement[]; newXp: number }> {
	const profile = await db
		.prepare('SELECT xp FROM player_profiles WHERE id = ?')
		.bind(playerId)
		.first<PlayerXpRow>();

	const currentXp = profile?.xp ?? 0;
	const newXp = currentXp + xpGain;
	const oldLevel = xpToLevel(currentXp);
	const newLevel = xpToLevel(newXp);

	if (newLevel <= oldLevel) {
		return { grants: [], stmts: [], newXp };
	}

	const items = await db
		.prepare(
			`SELECT id, name, subcategory, tier, level_requirement
			FROM shop_items
			WHERE tier IN ('hero','minor')
			  AND level_requirement > ?
			  AND level_requirement <= ?`
		)
		.bind(oldLevel, newLevel)
		.all<ShopItemRow>();

	const rows = items.results ?? [];

	if (rows.length === 0) {
		return { grants: [], stmts: [], newXp };
	}

	const now = Math.floor(Date.now() / 1000);
	const grants: GrantedReward[] = [];
	const stmts: D1PreparedStatement[] = [];

	for (const row of rows) {
		const inventoryId = crypto.randomUUID();
		grants.push({
			itemId: row.id,
			name: row.name,
			type: row.subcategory,
			tier: row.tier,
			level: row.level_requirement,
		});
		stmts.push(
			db
				.prepare(
					`INSERT INTO player_inventory (id, player_id, item_id, quantity, purchased_at)
					VALUES (?, ?, ?, 1, ?)
					ON CONFLICT(player_id, item_id) DO NOTHING`
				)
				.bind(inventoryId, playerId, row.id, now)
		);
	}

	return { grants, stmts, newXp };
}
