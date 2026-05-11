import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface FriendRow {
	id: string;
	display_name: string;
	avatar: string | null;
}

interface ActiveRoomRow {
	code: string;
	game: string;
	players_json: string;
}

const STALE_LOBBY_SECONDS = 15 * 60;

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const me = locals.user.id;

	const friendsRes = await db
		.prepare(
			`SELECT pp.id AS id, pp.display_name AS display_name, pp.avatar AS avatar
			 FROM friendships f
			 JOIN player_profiles pp
			   ON pp.id = CASE WHEN f.player_a_id = ? THEN f.player_b_id ELSE f.player_a_id END
			 WHERE f.player_a_id = ? OR f.player_b_id = ?
			 ORDER BY pp.display_name ASC`
		)
		.bind(me, me, me)
		.all<FriendRow>();

	const friendRows = friendsRes.results ?? [];

	if (friendRows.length === 0) {
		return json({ friends: [] });
	}

	const nowSec = Math.floor(Date.now() / 1000);
	const staleCutoff = nowSec - STALE_LOBBY_SECONDS;

	let roomRows: ActiveRoomRow[] = [];
	try {
		const roomsRes = await db
			.prepare(
				`SELECT code, game, players_json
				 FROM active_rooms
				 WHERE phase != 'game_over'
				   AND (phase != 'lobby' OR last_updated_at >= ?)`
			)
			.bind(staleCutoff)
			.all<ActiveRoomRow>();
		roomRows = roomsRes.results ?? [];
	} catch (err) {
		console.error('friends list: active_rooms query failed', err);
	}

	const roomByPlayer = new Map<string, { code: string; game: string }>();
	for (const row of roomRows) {
		try {
			const parsed = JSON.parse(row.players_json);
			if (Array.isArray(parsed)) {
				for (const p of parsed) {
					if (p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string') {
						const id = (p as { id: string }).id;
						if (!roomByPlayer.has(id)) {
							roomByPlayer.set(id, { code: row.code, game: row.game });
						}
					}
				}
			}
		} catch {}
	}

	const friends = friendRows.map((row) => {
		const room = roomByPlayer.get(row.id);
		return {
			id: row.id,
			display_name: row.display_name,
			avatar: row.avatar,
			online: !!room,
			room: room ?? undefined,
		};
	});

	return json({ friends });
};
