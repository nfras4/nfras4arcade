import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const VALID_SLOTS = ['avatar', 'name_colour', 'card_back', 'table_felt'] as const;
type EquipSlot = (typeof VALID_SLOTS)[number];

const SLOT_TO_COLUMN: Record<EquipSlot, string> = {
	avatar: 'avatar_id',
	name_colour: 'name_colour_id',
	card_back: 'card_back_id',
	table_felt: 'table_felt_id',
};

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	let body: { slot?: string; itemId?: string | null };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { slot, itemId } = body;

	if (!slot || !VALID_SLOTS.includes(slot as EquipSlot)) {
		return json({ error: 'Invalid slot. Must be one of: avatar, name_colour, card_back, table_felt' }, { status: 400 });
	}

	const equipSlot = slot as EquipSlot;

	if (itemId !== null && itemId !== undefined) {
		if (typeof itemId !== 'string') {
			return json({ error: 'itemId must be a string or null' }, { status: 400 });
		}

		const item = await db
			.prepare('SELECT id, category, subcategory FROM shop_items WHERE id = ? AND is_active = 1')
			.bind(itemId)
			.first<{ id: string; category: string; subcategory: string | null }>();

		if (!item) {
			return json({ error: 'Item not found or unavailable' }, { status: 400 });
		}

		if (item.subcategory !== equipSlot) {
			return json({ error: `Item subcategory "${item.subcategory}" does not match slot "${equipSlot}"` }, { status: 400 });
		}

		const owned = await db
			.prepare('SELECT quantity FROM player_inventory WHERE player_id = ? AND item_id = ?')
			.bind(locals.user.id, itemId)
			.first<{ quantity: number }>();

		if (!owned || owned.quantity < 1) {
			return json({ error: 'You do not own this item' }, { status: 400 });
		}
	}

	const column = SLOT_TO_COLUMN[equipSlot];

	await db
		.prepare(
			`INSERT INTO player_equipped (player_id, avatar_id, name_colour_id, card_back_id, table_felt_id)
			VALUES (?, NULL, NULL, NULL, NULL)
			ON CONFLICT (player_id) DO UPDATE SET ${column} = ?`
		)
		.bind(locals.user.id, itemId ?? null)
		.run();

	return json({ success: true, equipped: { slot: equipSlot, itemId: itemId ?? null } });
};
