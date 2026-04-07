import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPassword } from '$lib/server/auth/password';
import { createSession, setSessionCookie } from '$lib/server/auth/session';

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });

  const { email, password, displayName } = body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  // Validate email
  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 255) {
    return json({ error: 'Valid email is required' }, { status: 400 });
  }

  // Validate password
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return json({ error: 'Password must be 8-128 characters' }, { status: 400 });
  }

  // Validate display name
  const name = (displayName || '').trim();
  if (!name || name.length < 1 || name.length > 20) {
    return json({ error: 'Display name must be 1-20 characters' }, { status: 400 });
  }

  // Check if email already exists
  const existing = await db
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first();
  if (existing) {
    return json({ error: 'Email already registered' }, { status: 409 });
  }

  const userId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const hashedPassword = await hashPassword(password);

  // Insert user and profile in a batch
  await db.batch([
    db.prepare('INSERT INTO users (id, email, hashed_password, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, email.toLowerCase(), hashedPassword, now),
    db.prepare('INSERT INTO player_profiles (id, display_name, avatar, games_played, games_won, created_at, updated_at) VALUES (?, ?, null, 0, 0, ?, ?)')
      .bind(userId, name, now, now),
  ]);

  const sessionToken = await createSession(db, userId);
  const isProd = platform?.env?.ENVIRONMENT === 'production';

  return json(
    { user: { id: userId, email: email.toLowerCase(), displayName: name, avatar: null } },
    {
      status: 201,
      headers: { 'Set-Cookie': setSessionCookie(sessionToken, isProd) },
    }
  );
};
