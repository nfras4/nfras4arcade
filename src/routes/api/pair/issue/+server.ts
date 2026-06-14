/**
 * POST /api/pair/issue
 *
 * Issues a one-shot pairing token (TTL 60s) the PC scans-as-QR for the phone.
 *
 * v1 simplification: this endpoint does NOT validate the user is currently
 * a player in `roomCode`. The WS accept path on the room DO will reject
 * impostors anyway. If abuse appears, the heavier per-room presence check
 * can be added later.
 *
 * Rate-limit reasoning: per-(user, IP) instead of per-IP. `locals.user`
 * gates this endpoint (401 if absent), and registration is itself
 * rate-limited at 3/hour/IP via src/routes/api/auth/register/+server.ts:12,
 * so attacker key-space is bottlenecked by registration cost. Per-(user, IP)
 * is strictly safer for shared-NAT households than per-IP.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { check, getClientIp } from '$lib/server/auth/rateLimit';
import { issueToken } from '../../../../../worker/shared/pairingTokens';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rl = await check(platform?.env?.RATE_LIMITER, `pair-issue:${locals.user.id}:${ip}`, 10, 60_000);
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

  const { roomCode, playerId, gameType } = body as {
    roomCode?: unknown;
    playerId?: unknown;
    gameType?: unknown;
  };

  if (!roomCode || typeof roomCode !== 'string') {
    return json({ error: 'roomCode required' }, { status: 400 });
  }
  if (!playerId || typeof playerId !== 'string') {
    return json({ error: 'playerId required' }, { status: 400 });
  }
  if (playerId !== locals.user.id) {
    return json({ error: 'playerId must match authenticated user' }, { status: 403 });
  }

  const resolvedGameType =
    typeof gameType === 'string' && gameType.length > 0 ? gameType : 'poker';

  const token = issueToken(playerId, locals.user.id, roomCode, resolvedGameType);
  const expiresAt = Date.now() + 60_000;

  return json({ token, expiresAt });
};
