/**
 * Active room tracking shared across all multiplayer game DOs.
 *
 * Each game DO calls upsertActiveRoom on lifecycle changes (lobby/playing
 * transitions, joins, disconnects, play_again) and deleteActiveRoom on
 * game_over / room expiry. The hub homepage polls /api/active-rooms to
 * surface live games for friends to spectate.
 *
 * D1 writes are best-effort: any failure is logged and swallowed so game
 * logic is never blocked by the live-rooms feed.
 */

export interface ActiveRoomPlayer {
  id: string;
  name: string;
  isBot: boolean;
}

export interface ActiveRoomUpdate {
  code: string;
  /** Game key matching the DO's gameType, e.g. 'impostor', 'coup', 'connect_four'. */
  game: string;
  phase: 'lobby' | 'playing' | 'round_over' | 'game_over';
  players: ActiveRoomPlayer[];
}

/**
 * Insert or update the active_rooms row for a game.
 *
 * If `phase === 'game_over'`, the row is deleted instead (no need to keep
 * stale finished rooms around).
 *
 * `started_at` is set on the first transition to 'playing' and preserved
 * across subsequent updates via COALESCE — once a game starts, the start
 * time should never move.
 */
export async function upsertActiveRoom(db: D1Database, update: ActiveRoomUpdate): Promise<void> {
  if (!db) return;

  // game_over rooms get deleted instead of upserted
  if (update.phase === 'game_over') {
    await deleteActiveRoom(db, update.code, update.game);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const startedAt = update.phase === 'playing' ? now : null;
  const playersJson = JSON.stringify(update.players);

  try {
    await db.prepare(
      `INSERT INTO active_rooms (code, game, phase, player_count, players_json, started_at, last_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code, game) DO UPDATE SET
         phase = excluded.phase,
         player_count = excluded.player_count,
         players_json = excluded.players_json,
         started_at = COALESCE(active_rooms.started_at, excluded.started_at),
         last_updated_at = excluded.last_updated_at`
    )
      .bind(
        update.code,
        update.game,
        update.phase,
        update.players.length,
        playersJson,
        startedAt,
        now
      )
      .run();
  } catch (err) {
    console.error('upsertActiveRoom failed', { code: update.code, game: update.game, err });
  }
}

export async function deleteActiveRoom(db: D1Database, code: string, game: string): Promise<void> {
  if (!db) return;
  try {
    await db.prepare('DELETE FROM active_rooms WHERE code = ? AND game = ?').bind(code, game).run();
  } catch (err) {
    console.error('deleteActiveRoom failed', { code, game, err });
  }
}
