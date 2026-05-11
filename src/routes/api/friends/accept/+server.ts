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

	let body: { fromId?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid body' }, { status: 400 });
	}

	const fromId = typeof body.fromId === 'string' ? body.fromId : '';
	if (!fromId) {
		return json({ error: 'fromId required' }, { status: 400 });
	}

	const me = locals.user.id;

	const existing = await db
		.prepare('SELECT 1 AS x FROM friend_requests WHERE from_id = ? AND to_id = ?')
		.bind(fromId, me)
		.first<{ x: number }>();

	if (!existing) {
		return json({ error: 'Request not found' }, { status: 404 });
	}

	const [a, b] = lexPair(me, fromId);
	const nowSec = Math.floor(Date.now() / 1000);

	await db.batch([
		db
			.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?')
			.bind(fromId, me),
		db
			.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?')
			.bind(me, fromId),
		db
			.prepare(
				'INSERT OR IGNORE INTO friendships (player_a_id, player_b_id, created_at) VALUES (?, ?, ?)'
			)
			.bind(a, b, nowSec),
	]);

	return json({ success: true });
};
