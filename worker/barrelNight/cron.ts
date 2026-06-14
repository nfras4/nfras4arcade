import type { Env } from '../types';
import { isoWeekUTC, barrelNightCode } from './week';

// Weekly Barrel Night opener. Wired as worker_default.scheduled by patch-worker
// against the cron trigger "0 9 * * 0" (Sunday 09:00 UTC = 19:00 AEST).
//
// It opens this week's room into BN mode with a 10-minute join window; the room's
// own alarm then fills bots and starts the game. Stateless + idempotent: /bn-open
// does INSERT OR IGNORE on the event row, and re-opening an already-running room
// is a no-op (seedBots/startGame only act in lobby).
export async function barrelNightScheduled(
  _controller: ScheduledController,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  if (env.BARREL_NIGHT_ENABLED !== 'true') return;
  const now = Date.now();
  const week = isoWeekUTC(now);
  const code = barrelNightCode(now);
  try {
    const stub = env.LIARS_DICE_ROOM.get(env.LIARS_DICE_ROOM.idFromName(code));
    const res = await stub.fetch(`https://do/bn-open?room=${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week, startInMs: 10 * 60 * 1000 }),
    });
    console.log(JSON.stringify({ event: 'barrel_night_cron_open', week, status: res.status }));
  } catch (err) {
    console.error('barrel_night_cron failed', { week, err: String(err) });
  }
}
