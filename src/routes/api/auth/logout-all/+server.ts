import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTokenFromCookie, validateSession, clearSessionCookie } from '$lib/server/auth/session';

// POST /api/auth/logout-all — revoke every session for the current user, not
// just the one on this device (audit H11). Useful after a suspected
// compromise. Resolves the user from the current cookie, then deletes all of
// their session rows and clears the local cookie.
export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const token = getTokenFromCookie(request);
  const isProd = platform?.env?.ENVIRONMENT === 'production';

  if (!db || !token) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = await validateSession(db, token);
  if (!session) {
    return json({ error: 'Not authenticated' }, { status: 401, headers: { 'Set-Cookie': clearSessionCookie(isProd) } });
  }

  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(session.id).run();
  await db.prepare('DELETE FROM device_pairings WHERE user_id = ?').bind(session.id).run();

  return json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie(isProd) } }
  );
};
