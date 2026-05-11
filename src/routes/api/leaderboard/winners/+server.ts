import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type WinnerRow = {
  metric: string;
  rank: number;
  player_id: string;
  display_name: string;
  avatar: string | null;
  value: number;
};

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ winners: [] });

  const seasonId = url.searchParams.get('seasonId');
  if (!seasonId) {
    return json({ error: 'seasonId required' }, { status: 400 });
  }

  try {
    const { results } = await db
      .prepare(
        `SELECT w.metric, w.rank, w.player_id, w.value,
                p.display_name, p.avatar
         FROM season_winners w
         JOIN player_profiles p ON p.id = w.player_id
         WHERE w.season_id = ?
         ORDER BY w.metric ASC, w.rank ASC`,
      )
      .bind(seasonId)
      .all<WinnerRow>();

    return json({
      winners: (results ?? []).map((r) => ({
        metric: r.metric,
        rank: r.rank,
        player_id: r.player_id,
        display_name: r.display_name,
        avatar: r.avatar,
        value: r.value,
      })),
    });
  } catch (err) {
    console.error('[leaderboard/winners]', err);
    return json({ winners: [] });
  }
};
