import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { placeBet } from '../../../../../worker/shared/bets';

const ALLOWED_WAGERS = new Set([5, 10, 25, 50, 100, 250]);

interface PlayerEntry {
  id?: unknown;
  name?: unknown;
  isBot?: unknown;
}

interface ActiveRoomRow {
  phase: string;
  players_json: string;
}

export const POST: RequestHandler = async ({ locals, platform, request }) => {
  // Auth: must be a logged-in non-guest.
  if (!locals.user || locals.user.id.startsWith('guest_')) {
    return json({ error: 'guest_blocked' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: 'room_not_found' }, { status: 400 });
  }

  let body: { roomCode?: unknown; game?: unknown; targetPlayerId?: unknown; wagerAmount?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_wager' }, { status: 400 });
  }

  const roomCode = typeof body.roomCode === 'string' ? body.roomCode : '';
  const game = typeof body.game === 'string' ? body.game : '';
  const targetPlayerId = typeof body.targetPlayerId === 'string' ? body.targetPlayerId : '';
  const wagerAmount = typeof body.wagerAmount === 'number' ? body.wagerAmount : -1;

  if (!ALLOWED_WAGERS.has(wagerAmount)) {
    return json({ error: 'invalid_wager' }, { status: 400 });
  }
  if (!roomCode || !game || !targetPlayerId) {
    return json({ error: 'invalid_target' }, { status: 400 });
  }

  // Look up active room.
  const room = await db
    .prepare('SELECT phase, players_json FROM active_rooms WHERE code = ? AND game = ?')
    .bind(roomCode, game)
    .first<ActiveRoomRow>();

  if (!room) {
    return json({ error: 'room_not_found' }, { status: 400 });
  }
  if (room.phase !== 'playing') {
    return json({ error: 'room_not_playing' }, { status: 400 });
  }

  // Parse players_json.
  let players: PlayerEntry[] = [];
  try {
    const parsed = JSON.parse(room.players_json);
    if (Array.isArray(parsed)) players = parsed;
  } catch {
    return json({ error: 'room_not_found' }, { status: 400 });
  }

  // Block bettors who are in the room (no betting on your own game).
  if (players.some((p) => typeof p.id === 'string' && p.id === locals.user!.id)) {
    return json({ error: 'self_bet' }, { status: 400 });
  }

  // Find the target. Bots are valid targets; guests are not.
  const target = players.find((p) => typeof p.id === 'string' && p.id === targetPlayerId);
  if (!target || typeof target.id !== 'string') {
    return json({ error: 'invalid_target' }, { status: 400 });
  }
  if (target.id.startsWith('guest_')) {
    return json({ error: 'invalid_target' }, { status: 400 });
  }
  const targetName = typeof target.name === 'string' ? target.name : 'Player';

  // Optional duplicate-pending check: same bettor + room + game + target.
  const existing = await db
    .prepare(
      'SELECT id FROM bets WHERE bettor_id = ? AND room_code = ? AND game = ? AND target_player_id = ? AND outcome IS NULL LIMIT 1'
    )
    .bind(locals.user.id, roomCode, game, targetPlayerId)
    .first<{ id: number }>();
  if (existing) {
    return json({ error: 'duplicate_pending' }, { status: 400 });
  }

  const result = await placeBet(db, {
    bettorId: locals.user.id,
    bettorName: locals.user.displayName,
    roomCode,
    game,
    targetPlayerId,
    targetPlayerName: targetName,
    wagerAmount,
  });

  if (!result.ok) {
    return json({ error: result.error }, { status: 400 });
  }

  return json({ betId: result.betId, success: true, newChips: result.newChips });
};
