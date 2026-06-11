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
  name: string;
  isBot: boolean;
}

const STALE_LOBBY_SECONDS = 15 * 60;
const STALE_PLAYING_SECONDS = 90 * 60;
const STALE_ROUND_OVER_SECONDS = 10 * 60;

export const GET: RequestHandler = async ({ platform, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });

  const db = platform?.env?.DB;
  if (!db) {
    return json({ rooms: [] });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const lobbyCutoff = nowSec - STALE_LOBBY_SECONDS;
  const playingCutoff = nowSec - STALE_PLAYING_SECONDS;
  const roundOverCutoff = nowSec - STALE_ROUND_OVER_SECONDS;

  let rows: ActiveRoomRow[] = [];
  try {
    const result = await db
      .prepare(
        `SELECT code, game, phase, player_count, players_json, started_at, last_updated_at
         FROM active_rooms
         WHERE phase != 'game_over'
           AND (
             (phase = 'lobby' AND last_updated_at >= ?)
             OR (phase = 'playing' AND last_updated_at >= ?)
             OR (phase = 'round_over' AND last_updated_at >= ?)
             OR (phase NOT IN ('lobby', 'playing', 'round_over', 'game_over'))
           )
         ORDER BY
           CASE WHEN phase = 'playing' THEN 0 ELSE 1 END ASC,
           CASE WHEN phase = 'playing' THEN started_at END ASC,
           last_updated_at DESC`
      )
      .bind(lobbyCutoff, playingCutoff, roundOverCutoff)
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
          .map((p: { name?: unknown; isBot?: unknown }) => ({
            name: typeof p.name === 'string' ? p.name : '',
            isBot: !!p.isBot,
          }));
      }
    } catch {}

    const route = gameToRoute(row.game);
    return {
      code: row.code,
      game: row.game,
      phase: row.phase,
      playerCount: row.player_count,
      players,
      startedAt: row.started_at,
      lastUpdatedAt: row.last_updated_at,
      spectateUrl: `/${route}/${row.code}?spectate=1`,
      joinUrl: `/${route}/${row.code}`,
    };
  });

  return json({ rooms });
};
