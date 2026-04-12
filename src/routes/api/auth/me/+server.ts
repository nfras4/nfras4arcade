import { json } from '@sveltejs/kit';
import { xpToLevel } from '$lib/xp';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform }) => {
  if (!locals.user) {
    return json({ user: null }, { status: 401 });
  }

  // Fetch badges for this user
  const db = platform?.env?.DB;
  let badges: Array<{ slug: string; label: string; description: string; icon: string; awardedAt: number }> = [];

  if (db) {
    const rows = await db
      .prepare(
        `SELECT b.slug, b.label, b.description, b.icon, pb.awarded_at
         FROM player_badges pb
         JOIN badges b ON b.id = pb.badge_id
         WHERE pb.player_id = ?`
      )
      .bind(locals.user.id)
      .all<{ slug: string; label: string; description: string; icon: string; awarded_at: number }>();

    badges = (rows.results || []).map((r) => ({
      slug: r.slug,
      label: r.label,
      description: r.description,
      icon: r.icon,
      awardedAt: r.awarded_at,
    }));

    // Also fetch profile stats
    const profile = await db
      .prepare('SELECT games_played, games_won, chips, xp FROM player_profiles WHERE id = ?')
      .bind(locals.user.id)
      .first<{ games_played: number; games_won: number; chips: number; xp: number }>();

    // Recent game history (last 20)
    const historyRows = await db
      .prepare(
        `SELECT gs.id, gs.game_type, gs.room_code, gs.player_count, gs.started_at, gs.ended_at,
                CASE WHEN gs.winner_id = ? THEN 1 ELSE 0 END as won
         FROM game_sessions gs
         WHERE gs.id IN (
           SELECT gs2.id FROM game_sessions gs2
           WHERE gs2.room_code IN (
             SELECT DISTINCT gs3.room_code FROM game_sessions gs3
             WHERE gs3.winner_id = ? OR gs3.room_code IN (
               SELECT room_code FROM game_sessions WHERE winner_id IS NOT NULL
             )
           )
         )
         AND gs.ended_at IS NOT NULL
         ORDER BY gs.ended_at DESC
         LIMIT 20`
      )
      .bind(locals.user.id, locals.user.id)
      .all<{ id: string; game_type: string; room_code: string; player_count: number; started_at: number; ended_at: number; won: number }>();

    // Per-game-type stats
    const gameTypeStats = await db
      .prepare(
        `SELECT game_type,
                COUNT(*) as played,
                SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as won
         FROM game_sessions
         WHERE ended_at IS NOT NULL
         AND id IN (
           SELECT id FROM game_sessions WHERE winner_id = ?
           UNION
           SELECT id FROM game_sessions WHERE ended_at IS NOT NULL
         )
         GROUP BY game_type`
      )
      .bind(locals.user.id, locals.user.id)
      .all<{ game_type: string; played: number; won: number }>();

    const gameHistory = (historyRows.results || []).map((r) => ({
      id: r.id,
      gameType: r.game_type,
      roomCode: r.room_code,
      playerCount: r.player_count,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      won: r.won === 1,
    }));

    const perGameStats = (gameTypeStats.results || []).map((r) => ({
      gameType: r.game_type,
      played: r.played,
      won: r.won,
    }));

    return json({
      user: locals.user,
      stats: profile ? { gamesPlayed: profile.games_played, gamesWon: profile.games_won, chips: profile.chips, xp: profile.xp ?? 0, level: xpToLevel(profile.xp ?? 0) } : null,
      badges,
      gameHistory,
      perGameStats,
    });
  }

  return json({ user: locals.user, stats: null, badges });
};
