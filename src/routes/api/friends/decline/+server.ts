import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

	await db
		.prepare('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?')
		.bind(fromId, me)
		.run();

	return json({ success: true });
};
