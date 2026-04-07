import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTokenFromCookie, deleteSession, clearSessionCookie } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  const token = getTokenFromCookie(request);
  const isProd = platform?.env?.ENVIRONMENT === 'production';

  if (token && db) {
    await deleteSession(db, token);
  }

  return json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie(isProd) } }
  );
};
