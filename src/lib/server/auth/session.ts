/**
 * Session management using D1 and crypto.getRandomValues().
 * Cookie-based sessions: HttpOnly, Secure (prod only), SameSite=Lax, 7 day expiry.
 */

const SESSION_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
const TOKEN_BYTES = 32;

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  avatar: string | null;
}

export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = generateToken();
  const id = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_EXPIRY_SECONDS;

  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt)
    .run();

  return token + '.' + id;
}

export async function validateSession(db: D1Database, sessionValue: string): Promise<SessionUser | null> {
  const dotIndex = sessionValue.indexOf('.');
  if (dotIndex === -1) return null;

  const sessionId = sessionValue.slice(dotIndex + 1);
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(
      `SELECT u.id, u.email, p.display_name, p.avatar
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN player_profiles p ON p.id = u.id
       WHERE s.id = ? AND s.expires_at > ?`
    )
    .bind(sessionId, now)
    .first<{ id: string; email: string; display_name: string; avatar: string | null }>();

  if (!row) return null;
  return { id: row.id, email: row.email, displayName: row.display_name, avatar: row.avatar };
}

export async function deleteSession(db: D1Database, sessionValue: string): Promise<void> {
  const dotIndex = sessionValue.indexOf('.');
  if (dotIndex === -1) return;
  const sessionId = sessionValue.slice(dotIndex + 1);
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export function setSessionCookie(token: string, isProduction: boolean): string {
  const parts = [
    `session=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_EXPIRY_SECONDS}`,
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(isProduction: boolean): string {
  const parts = [
    'session=',
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0',
  ];
  if (isProduction) parts.push('Secure');
  return parts.join('; ');
}

export function getTokenFromCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}
