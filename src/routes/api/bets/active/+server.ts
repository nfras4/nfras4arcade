import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getBetsForRoom } from '../../../../../worker/shared/bets';

export const GET: RequestHandler = async ({ url, platform, setHeaders }) => {
  setHeaders({ 'Cache-Control': 'no-store' });

  const roomCode = url.searchParams.get('roomCode') ?? '';
  const game = url.searchParams.get('game') ?? '';

  if (!roomCode || !game) {
    return json({ bets: [], totalPot: 0 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ bets: [], totalPot: 0 });
  }

  let bets;
  try {
    bets = await getBetsForRoom(db, roomCode, game);
  } catch (err) {
    console.error('getBetsForRoom failed', err);
    return json({ bets: [], totalPot: 0 });
  }

  // Best-effort enrich bettorName from current display_name; fall back to
  // the snapshotted name on the bet, then "Spectator".
  const bettorIds = Array.from(new Set(bets.map((b) => b.bettorId)));
  const nameMap = new Map<string, string>();
  if (bettorIds.length > 0) {
    try {
      const placeholders = bettorIds.map(() => '?').join(',');
      const profiles = await db
        .prepare(
          `SELECT id, display_name FROM player_profiles WHERE id IN (${placeholders})`
        )
        .bind(...bettorIds)
        .all<{ id: string; display_name: string }>();
      for (const row of profiles.results ?? []) {
        nameMap.set(row.id, row.display_name);
      }
    } catch (err) {
      console.error('bets/active profile lookup failed', err);
    }
  }

  const shaped = bets.map((b) => ({
    id: b.id,
    bettorId: b.bettorId,
    bettorName: nameMap.get(b.bettorId) ?? b.bettorName ?? 'Spectator',
    targetPlayerId: b.targetPlayerId,
    wagerAmount: b.wagerAmount,
    placedAt: b.placedAt,
  }));

  const totalPot = shaped.reduce((sum, b) => sum + b.wagerAmount, 0);

  return json({ bets: shaped, totalPot });
};
