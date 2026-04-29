/**
 * Spectator chip-betting helpers.
 *
 * Spectators wager chips on a target player in an active game. Wagered chips
 * are deducted up front (forfeited at placement). When the game ends:
 *   - If the bettor's target won, they receive 2x their wager back.
 *   - If the target lost, the wager is gone.
 *   - If there is no clear winner, the wager is refunded.
 *
 * All chip writes are wrapped in try/catch by callers — bet logic must
 * never block game logic. Failures are logged and swallowed.
 */

export interface PlaceBetInput {
  bettorId: string;
  bettorName: string;
  roomCode: string;
  game: string;
  targetPlayerId: string;
  targetPlayerName: string;
  wagerAmount: number;
}

export type PlaceBetResult =
  | { ok: true; betId: number; newChips: number }
  | { ok: false; error: 'insufficient_chips' | 'duplicate_pending' };

export interface BetRow {
  id: number;
  bettorId: string;
  bettorName: string;
  roomCode: string;
  game: string;
  targetPlayerId: string;
  targetPlayerName: string;
  wagerAmount: number;
  placedAt: number;
  resolvedAt: number | null;
  outcome: 'won' | 'lost' | 'refunded' | null;
  payout: number | null;
}

export type ResolveOutcome = 'won' | 'lost' | 'refunded';

interface BetDbRow {
  id: number;
  bettor_id: string;
  bettor_name: string;
  room_code: string;
  game: string;
  target_player_id: string;
  target_player_name: string;
  wager_amount: number;
  placed_at: number;
  resolved_at: number | null;
  outcome: 'won' | 'lost' | 'refunded' | null;
  payout: number | null;
}

function rowToBet(row: BetDbRow): BetRow {
  return {
    id: row.id,
    bettorId: row.bettor_id,
    bettorName: row.bettor_name,
    roomCode: row.room_code,
    game: row.game,
    targetPlayerId: row.target_player_id,
    targetPlayerName: row.target_player_name,
    wagerAmount: row.wager_amount,
    placedAt: row.placed_at,
    resolvedAt: row.resolved_at,
    outcome: row.outcome,
    payout: row.payout,
  };
}

/**
 * Atomically deducts wagerAmount from bettor's chips and inserts a bet row.
 * Pre-validation (room exists, target valid, etc.) is the caller's responsibility.
 *
 * Uses a conditional UPDATE so the deduction only happens when the bettor
 * actually has enough chips. If meta.changes is 0, returns insufficient_chips.
 */
export async function placeBet(db: D1Database, input: PlaceBetInput): Promise<PlaceBetResult> {
  const now = Math.floor(Date.now() / 1000);

  // Conditional UPDATE: only deduct if chips >= wagerAmount.
  const deductResult = await db
    .prepare(
      'UPDATE player_profiles SET chips = chips - ?, updated_at = ? WHERE id = ? AND chips >= ?'
    )
    .bind(input.wagerAmount, now, input.bettorId, input.wagerAmount)
    .run();

  if (!deductResult.meta.changes) {
    return { ok: false, error: 'insufficient_chips' };
  }

  // Insert the bet row. If this fails, refund the chips so we don't leave
  // a hole. (D1 batch can't do auto-increment + return last_insert_rowid easily.)
  let insertResult: D1Result;
  try {
    insertResult = await db
      .prepare(
        `INSERT INTO bets (
          bettor_id, bettor_name, room_code, game,
          target_player_id, target_player_name,
          wager_amount, placed_at, resolved_at, outcome, payout
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .bind(
        input.bettorId,
        input.bettorName,
        input.roomCode,
        input.game,
        input.targetPlayerId,
        input.targetPlayerName,
        input.wagerAmount,
        now
      )
      .run();
  } catch (err) {
    console.error('placeBet insert failed, refunding chips', err);
    try {
      await db
        .prepare('UPDATE player_profiles SET chips = chips + ?, updated_at = ? WHERE id = ?')
        .bind(input.wagerAmount, now, input.bettorId)
        .run();
    } catch (refundErr) {
      console.error('placeBet refund failed', refundErr);
    }
    return { ok: false, error: 'insufficient_chips' };
  }

  const betId = Number(insertResult.meta.last_row_id ?? 0);

  const updated = await db
    .prepare('SELECT chips FROM player_profiles WHERE id = ?')
    .bind(input.bettorId)
    .first<{ chips: number }>();

  return {
    ok: true,
    betId,
    newChips: updated?.chips ?? 0,
  };
}

export async function getBetsForRoom(
  db: D1Database,
  roomCode: string,
  game: string
): Promise<BetRow[]> {
  const result = await db
    .prepare(
      `SELECT id, bettor_id, bettor_name, room_code, game,
              target_player_id, target_player_name, wager_amount,
              placed_at, resolved_at, outcome, payout
       FROM bets
       WHERE room_code = ? AND game = ? AND outcome IS NULL
       ORDER BY placed_at ASC`
    )
    .bind(roomCode, game)
    .all<BetDbRow>();
  return (result.results ?? []).map(rowToBet);
}

export async function getMyBets(
  db: D1Database,
  bettorId: string,
  historyLimit = 20
): Promise<{ active: BetRow[]; history: BetRow[] }> {
  const [activeRes, historyRes] = await Promise.all([
    db
      .prepare(
        `SELECT id, bettor_id, bettor_name, room_code, game,
                target_player_id, target_player_name, wager_amount,
                placed_at, resolved_at, outcome, payout
         FROM bets
         WHERE bettor_id = ? AND outcome IS NULL
         ORDER BY placed_at DESC`
      )
      .bind(bettorId)
      .all<BetDbRow>(),
    db
      .prepare(
        `SELECT id, bettor_id, bettor_name, room_code, game,
                target_player_id, target_player_name, wager_amount,
                placed_at, resolved_at, outcome, payout
         FROM bets
         WHERE bettor_id = ? AND outcome IS NOT NULL
         ORDER BY resolved_at DESC, placed_at DESC
         LIMIT ?`
      )
      .bind(bettorId, historyLimit)
      .all<BetDbRow>(),
  ]);

  return {
    active: (activeRes.results ?? []).map(rowToBet),
    history: (historyRes.results ?? []).map(rowToBet),
  };
}

/**
 * Called when a game ends. Resolves all unresolved bets for the room+game.
 *
 * - winnerId === null  → refund all bets (no clear winner).
 * - target_player_id === winnerId → outcome='won', pay 2x wager to bettor.
 * - else → outcome='lost', no chip change.
 *
 * Bots/guests can be targets; bettors are always logged-in humans (enforced
 * at /api/bets/place). Idempotent: only touches rows with outcome IS NULL.
 */
export async function resolveBets(
  db: D1Database,
  roomCode: string,
  game: string,
  winnerId: string | null
): Promise<{ resolved: number; totalPaidOut: number }> {
  const now = Math.floor(Date.now() / 1000);

  const pending = await db
    .prepare(
      `SELECT id, bettor_id, bettor_name, room_code, game,
              target_player_id, target_player_name, wager_amount,
              placed_at, resolved_at, outcome, payout
       FROM bets
       WHERE room_code = ? AND game = ? AND outcome IS NULL`
    )
    .bind(roomCode, game)
    .all<BetDbRow>();

  const rows = pending.results ?? [];
  if (rows.length === 0) return { resolved: 0, totalPaidOut: 0 };

  const stmts: D1PreparedStatement[] = [];
  let totalPaidOut = 0;

  for (const row of rows) {
    let outcome: ResolveOutcome;
    let payout: number;

    if (winnerId === null) {
      outcome = 'refunded';
      payout = row.wager_amount;
    } else if (row.target_player_id === winnerId) {
      outcome = 'won';
      payout = row.wager_amount * 2;
    } else {
      outcome = 'lost';
      payout = 0;
    }

    stmts.push(
      db
        .prepare(
          'UPDATE bets SET outcome = ?, payout = ?, resolved_at = ? WHERE id = ? AND outcome IS NULL'
        )
        .bind(outcome, payout, now, row.id)
    );

    if (payout > 0) {
      stmts.push(
        db
          .prepare('UPDATE player_profiles SET chips = chips + ?, updated_at = ? WHERE id = ?')
          .bind(payout, now, row.bettor_id)
      );
      totalPaidOut += payout;
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return { resolved: rows.length, totalPaidOut };
}
