import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function lexPair(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	let body: { username?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid body' }, { status: 400 });
	}

	const username = typeof body.username === 'string' ? body.username.trim() : '';
	if (!username) {
		return json({ error: 'Username required' }, { status: 400 });
	}

	const me = locals.user.id;

	const target = await db
		.prepare('SELECT id FROM player_profiles WHERE LOWER(display_name) = LOWER(?)')
		.bind(username)
		.first<{ id: string }>();

	if (!target) {
		return json({ error: 'User not found' }, { status: 404 });
	}

	const targetId = target.id;

	if (targetId === me) {
		return json({ error: 'Cannot add yourself' }, { status: 400 });
	}

	const [a, b] = lexPair(me, targetId);

	const existingFriendship = await db
		.prepare('SELECT 1 AS x FROM friendships WHERE player_a_id = ? AND player_b_id = ?')
		.bind(a, b)
		.first<{ x: number }>();

	if (existingFriendship) {
		return json({ error: 'Already friends' }, { status: 400 });
	}

	const existingOutgoing = await db
		.prepare('SELECT 1 AS x FROM friend_requests WHERE from_id = ? AND to_id = ?')
		.bind(me, targetId)
		.first<{ x: number }>();

	if (existingOutgoing) {
		return json({ error: 'Request already pending' }, { status: 400 });
	}

	const reciprocal = await db
		.prepare('SELECT 1 AS x FROM friend_requests WHERE from_id = ? AND to_id = ?')
		.bind(targetId, me)
		.first<{ x: number }>();

	const nowSec = Math.floor(Date.now() / 1000);

	if (reciprocal) {
		await db.batch([
			db
				.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?')
				.bind(targetId, me),
			db
				.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?')
				.bind(me, targetId),
			db
				.prepare(
					'INSERT OR IGNORE INTO friendships (player_a_id, player_b_id, created_at) VALUES (?, ?, ?)'
				)
				.bind(a, b, nowSec),
		]);
		return json({ success: true, autoAccepted: true });
	}

	await db
		.prepare(
			'INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)'
		)
		.bind(me, targetId, nowSec)
		.run();

	return json({ success: true });
};
