import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTokenFromCookie, validateSession, deleteSession, clearSessionCookie } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const token = getTokenFromCookie(request);
  const isProd = platform?.env?.ENVIRONMENT === 'production';

  // WHY: resolve user_id BEFORE deleteSession; the session row is gone afterwards.
  const session = token && db ? await validateSession(db, token) : null;
  if (token && db) {
    await deleteSession(db, token);
  }
  if (session && db) {
    await db.prepare('DELETE FROM device_pairings WHERE user_id = ?').bind(session.id).run();
  }

  return json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie(isProd) } }
  );
};
