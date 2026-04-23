import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

type Row = { display_name: string; liars_dice_wins: number; chips: number };

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ entries: [] });

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 25);

  try {
    const { results } = await db
      .prepare(
        `SELECT display_name, liars_dice_wins, chips
         FROM player_profiles
         WHERE liars_dice_wins > 0
         ORDER BY liars_dice_wins DESC, chips DESC
         LIMIT ?`,
      )
      .bind(limit)
      .all<Row>();

    return json({
      entries: (results ?? []).map((r, i) => ({
        rank: i + 1,
        playerName: r.display_name,
        wins: r.liars_dice_wins,
      })),
    });
  } catch {
    return json({ entries: [] });
  }
};
