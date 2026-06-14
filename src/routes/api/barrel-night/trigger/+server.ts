import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isoWeekUTC } from '../../../../../worker/barrelNight/week';

// Owner-only manual trigger for a Barrel Night game. The weekly cron will reuse
// the same stub.fetch('/bn-open') call; this lets us fire and verify the event
// end to end on demand before the cron exists.
//
// Body: { week?: string, bots?: number, startNow?: boolean }
export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user?.isOwner) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }
  const env = platform?.env;
  if (!env?.LIARS_DICE_ROOM) {
    return json({ error: 'Bindings unavailable' }, { status: 500 });
  }

  let body: { week?: string; bots?: number; startNow?: boolean };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  // Default to the current ISO week (what the cron will use) so the /barrel-night
  // page's "live" link points at this exact room.
  const week = (body.week ?? '').toString().trim() || isoWeekUTC(Date.now());
  const code = `BN-${week}`.toUpperCase();

  const stub = env.LIARS_DICE_ROOM.get(env.LIARS_DICE_ROOM.idFromName(code));
  const res = await stub.fetch(`https://do/bn-open?room=${encodeURIComponent(code)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ week, bots: body.bots ?? 0, startNow: body.startNow === true }),
  });
  const room = await res.json().catch(() => ({}));
  return json({ triggered: true, code, status: res.status, room });
};
