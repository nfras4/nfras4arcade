import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Map a DO gameType string to the public spectate route segment.
 * Underscores are normalized to hyphens for any game not explicitly listed.
 */
function gameToRoute(game: string): string {
  const explicit: Record<string, string> = {
    impostor: 'impostor',
    wavelength: 'wavelength',
    poker: 'poker',
    coup: 'coup',
    president: 'president',
    'chase-the-queen': 'chase-the-queen',
    chase_the_queen: 'chase-the-queen',
    connect_four: 'connect-four',
    'connect-four': 'connect-four',
  };
  return explicit[game] ?? game.replace(/_/g, '-');
}

interface ActiveRoomRow {
  code: string;
  game: string;
  phase: string;
  player_count: number;
  players_json: string;
  started_at: number | null;
  last_updated_at: number;
}

interface PlayerEntry {
  id: string;
  name: string;
  isBot: boolean;
}

const STALE_LOBBY_SECONDS = 15 * 60;

export const GET: RequestHandler = async ({ platform, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });

  const db = platform?.env?.DB;
  if (!db) {
    return json({ rooms: [] });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const staleCutoff = nowSec - STALE_LOBBY_SECONDS;

  let rows: ActiveRoomRow[] = [];
  try {
    const result = await db
      .prepare(
        `SELECT code, game, phase, player_count, players_json, started_at, last_updated_at
         FROM active_rooms
         WHERE phase != 'game_over'
           AND (phase != 'lobby' OR last_updated_at >= ?)
         ORDER BY
           CASE WHEN phase = 'playing' THEN 0 ELSE 1 END ASC,
           CASE WHEN phase = 'playing' THEN started_at END ASC,
           last_updated_at DESC`
      )
      .bind(staleCutoff)
      .all<ActiveRoomRow>();
    rows = result.results ?? [];
  } catch (err) {
    console.error('active-rooms query failed', err);
    return json({ rooms: [] });
  }

  const rooms = rows.map((row) => {
    let players: PlayerEntry[] = [];
    try {
      const parsed = JSON.parse(row.players_json);
      if (Array.isArray(parsed)) {
        players = parsed
          .filter((p) => p && typeof p === 'object')
          .map((p: { id?: unknown; name?: unknown; isBot?: unknown }) => ({
            id: typeof p.id === 'string' ? p.id : '',
            name: typeof p.name === 'string' ? p.name : '',
            isBot: !!p.isBot,
          }));
      }
    } catch {}

    return {
      code: row.code,
      game: row.game,
      phase: row.phase,
      playerCount: row.player_count,
      players,
      startedAt: row.started_at,
      lastUpdatedAt: row.last_updated_at,
      spectateUrl: `/${gameToRoute(row.game)}/${row.code}`,
    };
  });

  return json({ rooms });
};
