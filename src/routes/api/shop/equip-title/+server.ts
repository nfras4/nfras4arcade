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

	let body: { badgeId?: string | null };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { badgeId } = body;

	if (badgeId === undefined) {
		return json({ error: 'badgeId is required' }, { status: 400 });
	}

	// If non-null, validate the user has earned this badge
	if (badgeId !== null) {
		if (typeof badgeId !== 'string') {
			return json({ error: 'badgeId must be a string or null' }, { status: 400 });
		}

		const earned = await db
			.prepare(
				`SELECT pb.badge_id FROM player_badges pb
				 JOIN badges b ON b.id = pb.badge_id
				 WHERE pb.player_id = ? AND b.slug = ?`
			)
			.bind(locals.user.id, badgeId)
			.first<{ badge_id: string }>();

		if (!earned) {
			return json({ error: 'Badge not earned' }, { status: 400 });
		}
	}

	// Upsert player_equipped with updated title_badge_id
	await db
		.prepare(
			`INSERT INTO player_equipped (player_id, avatar_id, name_colour_id, card_back_id, table_felt_id, frame_id, emblem_id, title_badge_id)
			VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, ?)
			ON CONFLICT (player_id) DO UPDATE SET title_badge_id = ?`
		)
		.bind(locals.user.id, badgeId ?? null, badgeId ?? null)
		.run();

	return json({ titleBadgeId: badgeId ?? null });
};
