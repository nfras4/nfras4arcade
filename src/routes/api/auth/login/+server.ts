import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, setSessionCookie } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });

  const { email, password } = body as { email?: string; password?: string };

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await db
    .prepare(
      `SELECT u.id, u.email, u.hashed_password, p.display_name, p.avatar
       FROM users u
       JOIN player_profiles p ON p.id = u.id
       WHERE u.email = ?`
    )
    .bind(email.toLowerCase())
    .first<{ id: string; email: string; hashed_password: string; display_name: string; avatar: string | null }>();

  if (!user) {
    return json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.hashed_password);
  if (!valid) {
    return json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const sessionToken = await createSession(db, user.id);
  const isProd = platform?.env?.ENVIRONMENT === 'production';

  return json(
    { user: { id: user.id, email: user.email, displayName: user.display_name, avatar: user.avatar } },
    { headers: { 'Set-Cookie': setSessionCookie(sessionToken, isProd) } }
  );
};
