import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeSpin } from '$lib/slots/engine';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: 'Database unavailable' }, { status: 500 });
  }

  let body: { betPerLine?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const betPerLine = body.betPerLine;
  if (typeof betPerLine !== 'number' || !Number.isInteger(betPerLine) || betPerLine < 1 || betPerLine > 10) {
    return json({ error: 'betPerLine must be an integer from 1 to 10' }, { status: 400 });
  }

  const totalBet = betPerLine * 10;
  const now = Math.floor(Date.now() / 1000);

  // Atomic deduct with balance check (prevents negative chips and TOCTOU races)
  const deduct = await db
    .prepare('UPDATE player_profiles SET chips = chips - ?, updated_at = ? WHERE id = ? AND chips >= ?')
    .bind(totalBet, now, locals.user.id, totalBet)
    .run();

  if (!deduct.meta.changes) {
    return json({ error: 'Insufficient chips' }, { status: 400 });
  }

  // Execute spin (server-side RNG)
  const outcome = executeSpin(betPerLine);

  // Award winnings if any
  if (outcome.totalWin > 0) {
    await db.batch([
      db.prepare('UPDATE player_profiles SET chips = chips + ?, updated_at = ? WHERE id = ?')
        .bind(outcome.totalWin, now, locals.user.id),
      db.prepare('UPDATE player_profiles SET biggest_win = ?, biggest_win_game = ? WHERE id = ? AND biggest_win < ?')
        .bind(outcome.totalWin, 'slots', locals.user.id, outcome.totalWin),
    ]);
  }

  // Read final balance
  const profile = await db
    .prepare('SELECT chips FROM player_profiles WHERE id = ?')
    .bind(locals.user.id)
    .first<{ chips: number }>();

  return json({
    success: true,
    grid: outcome.grid,
    baseGrid: outcome.baseGrid,
    wins: outcome.wins,
    totalWin: outcome.totalWin,
    totalBet,
    expandedReels: outcome.expandedReels,
    respinHistory: outcome.respinHistory,
    balance: profile?.chips ?? 0,
  });
};
