import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pickDailyQuests } from '$lib/server/quest-selector';

interface QuestDefinitionRow {
	id: string;
	title: string;
	description: string;
	objective_type: string;
	objective_target: number;
	objective_arg: string | null;
	reward_chips: number;
	reward_xp: number;
	weight: number;
	is_active: number;
}

interface ProgressJoinedRow {
	slot: number;
	id: string;
	title: string;
	description: string;
	objective_type: string;
	objective_target: number;
	objective_arg: string | null;
	progress: number;
	claimed: number;
	reward_chips: number;
	reward_xp: number;
}

function nextUtcMidnightUnixSeconds(): number {
	const now = new Date();
	const next = Date.UTC(
		now.getUTCFullYear(),
		now.getUTCMonth(),
		now.getUTCDate() + 1,
		0,
		0,
		0,
		0
	);
	return Math.floor(next / 1000);
}

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const playerId = locals.user.id;
	const today = new Date().toISOString().slice(0, 10);

	const joinQuery = `
		SELECT
			pqp.slot AS slot,
			qd.id AS id,
			qd.title AS title,
			qd.description AS description,
			qd.objective_type AS objective_type,
			qd.objective_target AS objective_target,
			qd.objective_arg AS objective_arg,
			pqp.progress AS progress,
			pqp.claimed AS claimed,
			qd.reward_chips AS reward_chips,
			qd.reward_xp AS reward_xp
		FROM player_quest_progress pqp
		JOIN quest_definitions qd ON qd.id = pqp.quest_id
		WHERE pqp.player_id = ? AND pqp.quest_date = ?
		ORDER BY pqp.slot ASC
	`;

	const existing = await db
		.prepare(joinQuery)
		.bind(playerId, today)
		.all<ProgressJoinedRow>();

	let rows = existing.results ?? [];

	if (rows.length < 3) {
		const poolRes = await db
			.prepare(
				'SELECT id, title, description, objective_type, objective_target, objective_arg, reward_chips, reward_xp, weight, is_active FROM quest_definitions WHERE is_active = 1'
			)
			.all<QuestDefinitionRow>();
		const pool = poolRes.results ?? [];
		const picked = pickDailyQuests(playerId, today, pool);

		const inserts = picked.slice(0, 3).map((questId, slot) =>
			db
				.prepare(
					'INSERT OR IGNORE INTO player_quest_progress (player_id, quest_date, quest_id, slot, progress, claimed) VALUES (?, ?, ?, ?, 0, 0)'
				)
				.bind(playerId, today, questId, slot)
		);

		if (inserts.length > 0) {
			await db.batch(inserts);
		}

		const refreshed = await db
			.prepare(joinQuery)
			.bind(playerId, today)
			.all<ProgressJoinedRow>();
		rows = refreshed.results ?? [];
	}

	const quests = rows.map((r) => ({
		slot: r.slot,
		id: r.id,
		title: r.title,
		description: r.description,
		objective_type: r.objective_type,
		objective_target: r.objective_target,
		objective_arg: r.objective_arg,
		progress: r.progress,
		claimed: r.claimed === 1,
		reward_chips: r.reward_chips,
		reward_xp: r.reward_xp,
	}));

	return json({
		quests,
		reset_at: nextUtcMidnightUnixSeconds(),
	});
};
