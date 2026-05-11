import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface RequestRow {
	id: string;
	display_name: string;
	avatar: string | null;
	created_at: number;
}

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const me = locals.user.id;

	const incomingRes = await db
		.prepare(
			`SELECT pp.id AS id, pp.display_name AS display_name, pp.avatar AS avatar, fr.created_at AS created_at
			 FROM friend_requests fr
			 JOIN player_profiles pp ON pp.id = fr.from_id
			 WHERE fr.to_id = ?
			 ORDER BY fr.created_at DESC`
		)
		.bind(me)
		.all<RequestRow>();

	const outgoingRes = await db
		.prepare(
			`SELECT pp.id AS id, pp.display_name AS display_name, pp.avatar AS avatar, fr.created_at AS created_at
			 FROM friend_requests fr
			 JOIN player_profiles pp ON pp.id = fr.to_id
			 WHERE fr.from_id = ?
			 ORDER BY fr.created_at DESC`
		)
		.bind(me)
		.all<RequestRow>();

	return json({
		incoming: incomingRes.results ?? [],
		outgoing: outgoingRes.results ?? [],
	});
};
