import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPassword } from '$lib/server/auth/password';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const IP_LIMIT = 100;
const IP_WINDOW = 3_600_000;
const EMAIL_LIMIT = 20;
const EMAIL_WINDOW = 3_600_000;

/**
 * Maps a SQLite unique-constraint error message to a friendly { status, error }
 * pair. Exported so it can be unit-tested without spinning up a full D1 environment.
 *
 * SQLite constraint violation messages take the form:
 *   "UNIQUE constraint failed: <table>.<column>"
 * D1 wraps these verbatim, so we match on the column reference.
 */
// Underscore prefix so SvelteKit permits this non-HTTP export from a +server.ts
// endpoint (it is a pure helper, exported only for unit testing).
export function _mapRegisterConstraintError(message: string): { status: number; error: string } {
  const lower = message.toLowerCase();
  if (lower.includes('users.email')) {
    return { status: 409, error: 'Email already registered' };
  }
  if (lower.includes('player_profiles.display_name')) {
    return { status: 409, error: 'That display name is taken' };
  }
  return { status: 500, error: 'Registration failed' };
}

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

  // Reserved-names guard. Normalise NFKC + casefold + strip whitespace so
  // visually-confusable variants ('NFRAS4', ' nfras4 ', fullwidth 'ｎfras4')
  // all collapse to the same canonical form for the reserved check.
  const RESERVED_NAMES = new Set(['nfras4', 'admin', 'administrator', 'moderator', 'mod', 'owner', 'system', 'staff', 'support', 'root', 'guest', 'bot']);
  const canonical = name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (RESERVED_NAMES.has(canonical)) {
    return json({ error: 'That display name is reserved' }, { status: 400 });
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
    // Check if email already exists (non-racing path; race handled in catch below).
    const existing = await db
      .prepare('SELECT id FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first();
    if (existing) {
      return json({ error: 'Email already registered' }, { status: 409 });
    }

    // Pre-check for case-insensitive display name collision BEFORE the INSERT
    // so the common case returns a clear 409 rather than a 500 from a
    // constraint violation. A race between pre-check and INSERT is handled by
    // the constraint mapping in the catch block below.
    const existingName = await db
      .prepare('SELECT id FROM player_profiles WHERE LOWER(display_name) = ?')
      .bind(name.toLowerCase())
      .first();
    if (existingName) {
      return json({ error: 'That display name is taken' }, { status: 409 });
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
      { user: { id: userId, email: email.toLowerCase(), displayName: name, avatar: null, isOwner: false } },
      {
        status: 201,
        headers: { 'Set-Cookie': setSessionCookie(sessionToken, isProd) },
      }
    );
  } catch (err) {
    // Log the full error server-side; never echo D1/internal error messages to clients
    // (they leak schema details that speed up downstream exploitation).
    console.error('register failed', err);

    // Map unique-constraint violations to friendly 409s. This covers races
    // between the pre-checks above and the INSERT (TOCTOU window).
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('unique constraint failed')) {
      const mapped = _mapRegisterConstraintError(message);
      return json({ error: mapped.error }, { status: mapped.status });
    }

    return json({ error: 'Registration failed' }, { status: 500 });
  }
};
