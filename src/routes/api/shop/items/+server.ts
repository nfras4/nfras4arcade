import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform }) => {
	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const items = await db
		.prepare('SELECT * FROM shop_items WHERE is_active = 1 ORDER BY category, price')
		.all<{
			id: string;
			category: string;
			subcategory: string | null;
			name: string;
			description: string;
			price: number;
			icon: string;
			metadata: string | null;
			is_active: number;
			created_at: number;
			tier: 'shop' | 'hero' | 'minor';
			level_requirement: number | null;
		}>();

	const owned: Record<string, number> = {};

	if (locals.user) {
		const inventory = await db
			.prepare('SELECT item_id, quantity FROM player_inventory WHERE player_id = ?')
			.bind(locals.user.id)
			.all<{ item_id: string; quantity: number }>();

		for (const row of (inventory.results??[])) {
			owned[row.item_id] = row.quantity;
		}
	}

	return json({ items: items.results??[], owned });
};
