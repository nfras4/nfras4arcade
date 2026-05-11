import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface ClaimRow {
	quest_id: string;
	progress: number;
	claimed: number;
	objective_target: number;
	reward_chips: number;
	reward_xp: number;
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	let body: { slot?: number };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const slot = body.slot;
	if (slot !== 0 && slot !== 1 && slot !== 2) {
		return json({ error: 'Invalid slot' }, { status: 400 });
	}

	const playerId = locals.user.id;
	const today = new Date().toISOString().slice(0, 10);

	const row = await db
		.prepare(
			`SELECT pqp.quest_id AS quest_id, pqp.progress AS progress, pqp.claimed AS claimed,
			        qd.objective_target AS objective_target,
			        qd.reward_chips AS reward_chips, qd.reward_xp AS reward_xp
			 FROM player_quest_progress pqp
			 JOIN quest_definitions qd ON qd.id = pqp.quest_id
			 WHERE pqp.player_id = ? AND pqp.quest_date = ? AND pqp.slot = ?`
		)
		.bind(playerId, today, slot)
		.first<ClaimRow>();

	if (!row) {
		return json({ error: 'Quest not found' }, { status: 404 });
	}

	if (row.claimed === 1) {
		return json({ error: 'Already claimed' }, { status: 400 });
	}

	if (row.progress < row.objective_target) {
		return json({ error: 'Objective not met' }, { status: 400 });
	}

	const now = Math.floor(Date.now() / 1000);

	const results = await db.batch([
		db
			.prepare(
				'UPDATE player_quest_progress SET claimed = 1 WHERE player_id = ? AND quest_date = ? AND slot = ? AND claimed = 0'
			)
			.bind(playerId, today, slot),
		db
			.prepare(
				'UPDATE player_profiles SET chips = chips + ?, xp = xp + ?, updated_at = ? WHERE id = ?'
			)
			.bind(row.reward_chips, row.reward_xp, now, playerId),
	]);

	const claimChanges = results[0]?.meta?.changes ?? 0;
	if (claimChanges === 0) {
		return json({ error: 'Already claimed' }, { status: 400 });
	}

	const profile = await db
		.prepare('SELECT chips, xp FROM player_profiles WHERE id = ?')
		.bind(playerId)
		.first<{ chips: number; xp: number }>();

	return json({
		success: true,
		chips_awarded: row.reward_chips,
		xp_awarded: row.reward_xp,
		new_chips: profile?.chips ?? 0,
		new_xp: profile?.xp ?? 0,
	});
};
