import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
  const db = platform!.env.DB;

  try {
    const { results } = await db.prepare(
      `SELECT code, game_type, player_count, max_seats, min_bet, created_at, last_active
       FROM casino_tables
       ORDER BY last_active DESC
       LIMIT 50`
    ).all();

    return json({ tables: results ?? [] });
  } catch {
    return json({ tables: [] });
  }
};
