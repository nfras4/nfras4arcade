import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPassword } from '$lib/server/auth/password';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const IP_LIMIT = 100;
const IP_WINDOW = 3_600_000;
const EMAIL_LIMIT = 20;
const EMAIL_WINDOW = 3_600_000;

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const ip = getClientIp(request);

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });

  const { email, password, displayName } = body as {
    email?: string;
    password?: string;
    displayName?: string;
  };

  // Validate email
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return json({ error: 'Valid email is required' }, { status: 400 });
  }

  // Validate password
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return json({ error: 'Password must be 8-128 characters' }, { status: 400 });
  }

  // Validate display name
  const name = (displayName || '').replace(/<[^>]*>/g, '').trim();
  if (!name || name.length < 1 || name.length > 20) {
    return json({ error: 'Display name must be 1-20 characters' }, { status: 400 });
  }

  // Rate limit AFTER validation so typos don't burn the bucket. Key by both
  // IP and email so one user on a shared NAT can't lock out everyone else.
  const ipKey = `register:ip:${ip}`;
  const emailKey = `register:email:${email.toLowerCase()}`;
  const ipPeek = peek(ipKey, IP_LIMIT, IP_WINDOW);
  const emailPeek = peek(emailKey, EMAIL_LIMIT, EMAIL_WINDOW);
  if (!ipPeek.ok || !emailPeek.ok) {
    const retryAfter = Math.max(ipPeek.retryAfter, emailPeek.retryAfter);
    return json({ error: 'Too many attempts, try again later' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  try {
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

    // db.batch is atomic in D1: if either INSERT fails, both rollback (no orphan rows).
    await db.batch([
      db.prepare('INSERT INTO users (id, email, hashed_password, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, email.toLowerCase(), hashedPassword, now),
      db.prepare('INSERT INTO player_profiles (id, display_name, avatar, games_played, games_won, created_at, updated_at) VALUES (?, ?, null, 0, 0, ?, ?)')
        .bind(userId, name, now, now),
    ]);

    record(ipKey, IP_WINDOW);
    record(emailKey, EMAIL_WINDOW);

    const sessionToken = await createSession(db, userId);
    const isProd = platform?.env?.ENVIRONMENT === 'production';

    return json(
      { user: { id: userId, email: email.toLowerCase(), displayName: name, avatar: null } },
      {
        status: 201,
        headers: { 'Set-Cookie': setSessionCookie(sessionToken, isProd) },
      }
    );
  } catch (err) {
    // Surface a JSON error instead of letting SvelteKit emit `{message:'Internal Error'}`,
    // which the client's `data.error` fallback ignored, leaving users with the opaque
    // generic string and zero diagnostic info.
    console.error('register failed', err);
    const detail = err instanceof Error ? err.message : String(err);
    return json({ error: 'Registration failed', detail }, { status: 500 });
  }
};
