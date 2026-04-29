import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMyBets } from '../../../../../worker/shared/bets';

interface ActiveRoomRow {
  code: string;
  game: string;
  players_json: string;
}

interface PlayerEntry {
  id?: unknown;
  name?: unknown;
}

export const GET: RequestHandler = async ({ locals, platform, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });

  if (!locals.user) {
    return json({ error: 'not_authenticated' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ active: [], history: [] });
  }

  let bets;
  try {
    bets = await getMyBets(db, locals.user.id);
  } catch (err) {
    console.error('getMyBets failed', err);
    return json({ active: [], history: [] });
  }

  // For active bets, try to refresh target name from active_rooms.
  const activeRoomKeys = Array.from(
    new Set(bets.active.map((b) => `${b.roomCode}::${b.game}`))
  );
  const roomNameMap = new Map<string, Map<string, string>>();
  if (activeRoomKeys.length > 0) {
    try {
      const codes = bets.active.map((b) => b.roomCode);
      const games = bets.active.map((b) => b.game);
      // Fetch in one query with OR of (code,game) pairs via IN on code; filter in JS.
      const codeSet = Array.from(new Set(codes));
      const placeholders = codeSet.map(() => '?').join(',');
      const rows = await db
        .prepare(
          `SELECT code, game, players_json FROM active_rooms WHERE code IN (${placeholders})`
        )
        .bind(...codeSet)
        .all<ActiveRoomRow>();
      for (const row of rows.results ?? []) {
        const key = `${row.code}::${row.game}`;
        try {
          const parsed = JSON.parse(row.players_json);
          if (Array.isArray(parsed)) {
            const m = new Map<string, string>();
            for (const p of parsed as PlayerEntry[]) {
              if (typeof p.id === 'string' && typeof p.name === 'string') {
                m.set(p.id, p.name);
              }
            }
            roomNameMap.set(key, m);
          }
        } catch {}
        // suppress unused-var lint by referencing games
        void games;
      }
    } catch (err) {
      console.error('bets/mine room lookup failed', err);
    }
  }

  const active = bets.active.map((b) => {
    const key = `${b.roomCode}::${b.game}`;
    const fresh = roomNameMap.get(key)?.get(b.targetPlayerId);
    return {
      id: b.id,
      roomCode: b.roomCode,
      game: b.game,
      targetPlayerId: b.targetPlayerId,
      targetPlayerName: fresh ?? b.targetPlayerName ?? 'Player',
      wagerAmount: b.wagerAmount,
      placedAt: b.placedAt,
    };
  });

  const history = bets.history.map((b) => ({
    id: b.id,
    roomCode: b.roomCode,
    game: b.game,
    targetPlayerName: b.targetPlayerName ?? 'Player',
    wagerAmount: b.wagerAmount,
    outcome: b.outcome,
    payout: b.payout,
    placedAt: b.placedAt,
    resolvedAt: b.resolvedAt,
  }));

  return json({ active, history });
};
