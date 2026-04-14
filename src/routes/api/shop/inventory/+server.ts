import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const [inventoryResult, equipped] = await Promise.all([
		db
			.prepare(
				`SELECT
					pi.item_id,
					pi.quantity,
					pi.purchased_at,
					si.id,
					si.category,
					si.subcategory,
					si.name,
					si.description,
					si.price,
					si.icon,
					si.metadata
				FROM player_inventory pi
				JOIN shop_items si ON si.id = pi.item_id
				WHERE pi.player_id = ?
				ORDER BY si.category, si.price`
			)
			.bind(locals.user.id)
			.all<{
				item_id: string;
				quantity: number;
				purchased_at: number;
				id: string;
				category: string;
				subcategory: string | null;
				name: string;
				description: string;
				price: number;
				icon: string;
				metadata: string | null;
			}>(),
		db
			.prepare('SELECT avatar_id, name_colour_id, card_back_id, table_felt_id FROM player_equipped WHERE player_id = ?')
			.bind(locals.user.id)
			.first<{
				avatar_id: string | null;
				name_colour_id: string | null;
				card_back_id: string | null;
				table_felt_id: string | null;
			}>(),
	]);

	const inventory = (inventoryResult.results??[]).map((row) => ({
		item: {
			id: row.id,
			category: row.category,
			subcategory: row.subcategory,
			name: row.name,
			description: row.description,
			price: row.price,
			icon: row.icon,
			metadata: row.metadata,
		},
		quantity: row.quantity,
		purchasedAt: row.purchased_at,
	}));

	return json({
		inventory,
		equipped: equipped ?? {
			avatar_id: null,
			name_colour_id: null,
			card_back_id: null,
			table_felt_id: null,
		},
	});
};
