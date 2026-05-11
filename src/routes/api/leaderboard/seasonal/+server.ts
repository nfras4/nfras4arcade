import { json } from '@sveltejs/kit';
import { ensureActiveSeason } from '../../../../../worker/shared/progression';
import type { RequestHandler } from './$types';

const ALLOWED_METRICS = new Set([
  'games_won',
  'poker_wins',
  'snap_wins',
  'wavelength_wins',
  'liars_dice_wins',
  'connect_four_wins',
  'president_wins',
  'chase_the_queen_wins',
  'impostor_wins',
  'chips_earned',
  'dungeon_zone',
]);

type SeasonRow = {
  id: string;
  label: string;
  started_at: number;
  ends_at: number;
  status: string;
};

type EntryRow = {
  player_id: string;
  value: number;
  display_name: string;
  avatar: string | null;
};

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ entries: [] });

  const metric = url.searchParams.get('metric') ?? '';
  if (!ALLOWED_METRICS.has(metric)) {
    return json({ error: 'invalid metric' }, { status: 400 });
  }

  const seasonParam = url.searchParams.get('season');

  try {
    let season: SeasonRow | null = null;

    if (seasonParam) {
      season = await db
        .prepare(
          `SELECT id, label, started_at, ends_at, status
           FROM leaderboard_seasons
           WHERE id = ?`,
        )
        .bind(seasonParam)
        .first<SeasonRow>();

      if (!season) {
        return json({ error: 'season not found' }, { status: 404 });
      }
    } else {
      const active = await ensureActiveSeason(db);
      season = await db
        .prepare(
          `SELECT id, label, started_at, ends_at, status
           FROM leaderboard_seasons
           WHERE id = ?`,
        )
        .bind(active.id)
        .first<SeasonRow>();

      if (!season) {
        return json({ error: 'season not found' }, { status: 404 });
      }
    }

    const { results } = await db
      .prepare(
        `SELECT s.player_id, s.value, p.display_name, p.avatar
         FROM season_scores s
         JOIN player_profiles p ON p.id = s.player_id
         WHERE s.season_id = ? AND s.metric = ?
         ORDER BY s.value DESC, s.updated_at ASC
         LIMIT 10`,
      )
      .bind(season.id, metric)
      .all<EntryRow>();

    return json({
      season: {
        id: season.id,
        label: season.label,
        started_at: season.started_at,
        ends_at: season.ends_at,
        status: season.status,
      },
      metric,
      entries: (results ?? []).map((r, i) => ({
        rank: i + 1,
        player_id: r.player_id,
        display_name: r.display_name,
        avatar: r.avatar,
        value: r.value,
      })),
    });
  } catch (err) {
    console.error('[leaderboard/seasonal]', err);
    return json({ error: 'internal' }, { status: 500 });
  }
};
