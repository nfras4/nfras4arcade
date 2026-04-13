import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	let body: { itemId?: string; quantity?: number };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { itemId, quantity = 1 } = body;

	if (!itemId || typeof itemId !== 'string') {
		return json({ error: 'itemId is required' }, { status: 400 });
	}

	if (quantity < 1 || !Number.isInteger(quantity)) {
		return json({ error: 'quantity must be a positive integer' }, { status: 400 });
	}

	const item = await db
		.prepare('SELECT * FROM shop_items WHERE id = ? AND is_active = 1')
		.bind(itemId)
		.first<{
			id: string;
			category: string;
			subcategory: string | null;
			name: string;
			price: number;
		}>();

	if (!item) {
		return json({ error: 'Item not found or unavailable' }, { status: 400 });
	}

	const profile = await db
		.prepare('SELECT chips FROM player_profiles WHERE id = ?')
		.bind(locals.user.id)
		.first<{ chips: number }>();

	if (!profile) {
		return json({ error: 'Player profile not found' }, { status: 400 });
	}

	const totalCost = item.price * quantity;

	if (profile.chips < totalCost) {
		return json({ error: 'Insufficient chips' }, { status: 400 });
	}

	const isCosmetic = item.category === 'cosmetic';

	if (isCosmetic) {
		const existing = await db
			.prepare('SELECT quantity FROM player_inventory WHERE player_id = ? AND item_id = ?')
			.bind(locals.user.id, itemId)
			.first<{ quantity: number }>();

		if (existing && existing.quantity > 0) {
			return json({ error: 'Item already owned' }, { status: 400 });
		}
	}

	const now = Math.floor(Date.now() / 1000);
	const inventoryId = crypto.randomUUID();

	if (isCosmetic) {
		await db.batch([
			db
				.prepare('UPDATE player_profiles SET chips = chips - ? WHERE id = ? AND chips >= ?')
				.bind(totalCost, locals.user.id, totalCost),
			db
				.prepare(
					'INSERT INTO player_inventory (id, player_id, item_id, quantity, purchased_at) VALUES (?, ?, ?, 1, ?)'
				)
				.bind(inventoryId, locals.user.id, itemId, now),
		]);
	} else {
		await db.batch([
			db
				.prepare('UPDATE player_profiles SET chips = chips - ? WHERE id = ? AND chips >= ?')
				.bind(totalCost, locals.user.id, totalCost),
			db
				.prepare(
					`INSERT INTO player_inventory (id, player_id, item_id, quantity, purchased_at)
					VALUES (?, ?, ?, ?, ?)
					ON CONFLICT (player_id, item_id) DO UPDATE SET quantity = quantity + excluded.quantity`
				)
				.bind(inventoryId, locals.user.id, itemId, quantity, now),
		]);
	}

	const updated = await db
		.prepare('SELECT chips FROM player_profiles WHERE id = ?')
		.bind(locals.user.id)
		.first<{ chips: number }>();

	const inventoryRow = await db
		.prepare('SELECT quantity FROM player_inventory WHERE player_id = ? AND item_id = ?')
		.bind(locals.user.id, itemId)
		.first<{ quantity: number }>();

	return json({
		success: true,
		chips: updated?.chips ?? profile.chips - totalCost,
		inventory: { itemId, quantity: inventoryRow?.quantity ?? quantity },
	});
};
