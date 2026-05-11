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

	let body: { friendId?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid body' }, { status: 400 });
	}

	const friendId = typeof body.friendId === 'string' ? body.friendId : '';
	if (!friendId) {
		return json({ error: 'friendId required' }, { status: 400 });
	}

	const me = locals.user.id;
	const [a, b] = lexPair(me, friendId);

	await db
		.prepare('DELETE FROM friendships WHERE player_a_id = ? AND player_b_id = ?')
		.bind(a, b)
		.run();

	return json({ success: true });
};
