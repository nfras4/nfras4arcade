/**
 * POST /api/pair/remember
 *
 * Stores a (user_id, partner_fingerprint) pairing for 7 days so the next
 * /pair visit on the same device pair can offer auto-rejoin instead of
 * requiring a fresh QR scan.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { check, getClientIp } from '$lib/server/auth/rateLimit';

const FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REMEMBER_TTL_SECONDS = 7 * 24 * 3600;

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const ip = getClientIp(request);
  const rl = check(`pair-remember:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return json(
      { error: 'Too many attempts, try again later' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { partnerFingerprint } = body as { partnerFingerprint?: unknown };
  if (
    !partnerFingerprint ||
    typeof partnerFingerprint !== 'string' ||
    !FINGERPRINT_PATTERN.test(partnerFingerprint)
  ) {
    return json({ error: 'invalid fingerprint' }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REMEMBER_TTL_SECONDS;

  await db
    .prepare(
      `INSERT INTO device_pairings (user_id, partner_fingerprint, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, partner_fingerprint) DO UPDATE SET
         expires_at = excluded.expires_at,
         last_used_at = excluded.last_used_at`,
    )
    .bind(locals.user.id, partnerFingerprint, now, expiresAt, now)
    .run();

  return json({ ok: true });
};
