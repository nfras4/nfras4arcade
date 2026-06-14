import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const VALID_CATEGORIES = ['bug', 'suggestion', 'other'];
const RATE_LIMIT = 5;
const RATE_WINDOW = 10 * 60 * 1000;

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  const rateNs = platform?.env?.RATE_LIMITER;
  const ip = getClientIp(request);
  const rl = await peek(rateNs, `feedback:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.ok) {
    return json({ error: 'Slow down — try again later' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  const body = (await request.json().catch(() => null)) as { category?: string; message?: string; roomCode?: string; gameType?: string } | null;
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });
  const { category, message, roomCode, gameType } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return json({ error: 'Message is required' }, { status: 400 });
  }

  if (message.length > 2000) {
    return json({ error: 'Message must be 2000 characters or less' }, { status: 400 });
  }

  if (!category || !VALID_CATEGORIES.includes(category)) {
    return json({ error: 'Category must be one of: bug, suggestion, other' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: 'Database unavailable' }, { status: 500 });
  }

  const user = locals.user;
  const playerId = user?.id ?? null;
  // Never derive an identifier from session-cookie material. Use a fresh random
  // suffix per submission so guest feedback remains usefully labelled without
  // leaking session token bytes into the admin viewer.
  const playerName = user?.displayName ?? `Guest-${crypto.randomUUID().slice(0, 8)}`;

  try {
    await db
      .prepare(
        `INSERT INTO feedback (id, player_id, player_name, session_id, room_code, game_type, category, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        playerId,
        playerName,
        null,
        roomCode ?? null,
        gameType ?? null,
        category,
        message.trim(),
        Math.floor(Date.now() / 1000)
      )
      .run();
  } catch (err) {
    console.error('Feedback insert failed:', err);
    return json({ error: 'Failed to save feedback — please try again' }, { status: 500 });
  }

  await record(rateNs, `feedback:${ip}`, RATE_WINDOW);

  return json({ ok: true });
};
