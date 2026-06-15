import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

export const POST: RequestHandler = async ({ request, platform }) => {
  const ip = getClientIp(request);
  const rl = peek(`create:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.ok) {
    return json({ error: 'Too many room creations, slow down' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }
  record(`create:${ip}`, RATE_WINDOW);

  // Avoid handing out a code that's already a live room — otherwise the creator
  // is silently dropped into a stranger's lobby. active_rooms holds every room
  // that has at least one player, so regenerate on a hit (a few tries is plenty
  // against a 23^4 space). Fail open if the DB is unavailable.
  const db = platform?.env?.DB;
  let code = generateCode();
  if (db) {
    for (let i = 0; i < 5; i++) {
      try {
        const taken = await db.prepare('SELECT 1 FROM active_rooms WHERE code = ? LIMIT 1').bind(code).first();
        if (!taken) break;
      } catch {
        break;
      }
      code = generateCode();
    }
  }

  return json({ code });
};
