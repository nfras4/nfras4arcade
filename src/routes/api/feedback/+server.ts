import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const VALID_CATEGORIES = ['bug', 'suggestion', 'other'];

export const POST: RequestHandler = async ({ request, locals, platform, cookies }) => {
  const body = (await request.json()) as { category: string; message: string; roomCode?: string; gameType?: string };
  const { category, message, roomCode, gameType } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return json({ error: 'Message is required' }, { status: 400 });
  }

  if (message.length > 2000) {
    return json({ error: 'Message must be 2000 characters or less' }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return json({ error: 'Category must be one of: bug, suggestion, other' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: 'Database unavailable' }, { status: 500 });
  }

  const user = locals.user;
  const playerId = user?.id ?? null;
  const playerName = user?.displayName ?? `Guest-${(cookies.get('session') ?? crypto.randomUUID()).slice(0, 8)}`;
  const sessionId = cookies.get('session')?.split('.').pop() ?? null;

  await db
    .prepare(
      `INSERT INTO feedback (id, player_id, player_name, session_id, room_code, game_type, category, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      playerId,
      playerName,
      sessionId,
      roomCode ?? null,
      gameType ?? null,
      category,
      message.trim(),
      Math.floor(Date.now() / 1000)
    )
    .run();

  return json({ ok: true });
};
