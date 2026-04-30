/**
 * POST /api/pair/check_remembered
 *
 * Lightweight existence check: does the calling user have a non-expired
 * remembered pairing for the supplied fingerprint?
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { check, getClientIp } from '$lib/server/auth/rateLimit';

const FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const ip = getClientIp(request);
  const rl = check(`pair-check:${ip}`, 20, 60_000);
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

  const { fingerprint } = body as { fingerprint?: unknown };
  if (
    !fingerprint ||
    typeof fingerprint !== 'string' ||
    !FINGERPRINT_PATTERN.test(fingerprint)
  ) {
    return json({ error: 'invalid fingerprint' }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `SELECT 1 FROM device_pairings
       WHERE user_id = ? AND partner_fingerprint = ? AND expires_at > ?`,
    )
    .bind(locals.user.id, fingerprint, now)
    .first();

  return json({ remembered: row !== null });
};
