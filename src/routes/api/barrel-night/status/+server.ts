import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isoWeekUTC, barrelNightCode, nextBarrelNightStartUTC } from '../../../../../worker/barrelNight/week';

// Public, guest-readable status for the /barrel-night page: next start, whether a
// game is live right now, and the most recent champion. No auth, no WebSocket.
export const GET: RequestHandler = async ({ platform }) => {
  const now = Date.now();
  const week = isoWeekUTC(now);
  const code = barrelNightCode(now);

  let live: { week: string; code: string } | null = null;
  let lastChampion: { week: string; displayName: string; until: number } | null = null;

  const db = platform?.env?.DB;
  if (db) {
    try {
      const liveRow = await db
        .prepare("SELECT week_start FROM barrel_night_events WHERE week_start = ? AND status != 'complete'")
        .bind(week)
        .first<{ week_start: string }>();
      if (liveRow) live = { week, code };

      const champ = await db
        .prepare(
          `SELECT e.week_start AS week, p.display_name AS name, p.crown_active_until AS until
           FROM barrel_night_events e
           JOIN player_profiles p ON p.id = e.winner_player_id
           WHERE e.winner_player_id IS NOT NULL
           ORDER BY e.created_at DESC
           LIMIT 1`
        )
        .first<{ week: string; name: string; until: number }>();
      if (champ) lastChampion = { week: champ.week, displayName: champ.name, until: champ.until };
    } catch {
      // status is best-effort; the page still renders the countdown
    }
  }

  return json({
    serverNow: now,
    nextStartIso: new Date(nextBarrelNightStartUTC(now)).toISOString(),
    live,
    lastChampion,
  });
};
