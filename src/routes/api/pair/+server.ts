/**
 * POST /api/pair
 *
 * Phone-side endpoint: consume a pairing token issued by /api/pair/issue.
 * Single-use; mismatched user returns 403 without deleting the entry so the
 * legitimate user can still consume within TTL.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { check, getClientIp } from '$lib/server/auth/rateLimit';
import { consumeToken } from '../../../../worker/shared/pairingTokens';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rl = check(`pair-consume:${ip}`, 10, 60_000);
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

  const { token, role } = body as { token?: unknown; role?: unknown };
  if (!token || typeof token !== 'string') {
    return json({ error: 'token required' }, { status: 400 });
  }
  if (role !== 'controller') {
    return json({ error: 'role must be controller' }, { status: 400 });
  }

  const result = consumeToken(token, locals.user.id);
  if ('error' in result) {
    if (result.error === 'auth-mismatch') {
      return json({ error: 'auth-mismatch' }, { status: 403 });
    }
    // 'expired' (includes unknown-token and already-consumed, deliberately) -> 400.
    return json({ error: result.error }, { status: 400 });
  }

  return json({
    ok: true,
    playerId: result.playerId,
    roomCode: result.roomCode,
    gameType: result.gameType,
  });
};
