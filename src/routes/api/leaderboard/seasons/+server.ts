import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type SeasonRow = {
  id: string;
  label: string;
  started_at: number;
  ends_at: number;
  status: string;
};

export const GET: RequestHandler = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ seasons: [] });

  try {
    const { results } = await db
      .prepare(
        `SELECT id, label, started_at, ends_at, status
         FROM leaderboard_seasons
         ORDER BY started_at DESC`,
      )
      .all<SeasonRow>();

    return json({ seasons: results ?? [] });
  } catch (err) {
    console.error('[leaderboard/seasons]', err);
    return json({ seasons: [] });
  }
};
