// Shared progression hooks: daily quests + seasonal leaderboards.
// Designed to keep all D1 work for a single game-end inside one db.batch()
// so we stay well under the Cloudflare Pages 50-subrequest budget.

export type GameType =
  | 'poker'
  | 'snap'
  | 'wavelength'
  | 'liars-dice'
  | 'connect-four'
  | 'president'
  | 'chase-the-queen'
  | 'impostor'
  | 'big-two'
  | 'baccarat'
  | 'blackjack'
  | 'roulette'
  | 'slots';

// Metrics tracked on season_scores. Keep in sync with /api/leaderboard.
const MAIN_GAME_METRICS: Partial<Record<GameType, string>> = {
  poker: 'poker_wins',
  snap: 'snap_wins',
  wavelength: 'wavelength_wins',
  'liars-dice': 'liars_dice_wins',
  'connect-four': 'connect_four_wins',
  president: 'president_wins',
  'chase-the-queen': 'chase_the_queen_wins',
  impostor: 'impostor_wins',
};

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthStartSec(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

function nextMonthStartSec(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000);
}

interface SeasonRow {
  id: string;
  ends_at: number;
}

interface WinnerCandidate {
  metric: string;
  player_id: string;
  value: number;
}

/**
 * Ensure there is an 'active' season for the current month. Opportunistically
 * close any past seasons whose ends_at has elapsed and archive top-3 per metric
 * into season_winners.
 */
export async function ensureActiveSeason(db: D1Database): Promise<{ id: string; ends_at: number }> {
  const now = nowSec();
  const today = new Date();
  const key = monthKey(today);
  const seasonId = `season_${key}`;

  // Close any stale active seasons (ends_at <= now) that aren't this one.
  const stale = await db
    .prepare(
      `SELECT id FROM leaderboard_seasons WHERE status = 'active' AND ends_at <= ? AND id != ?`
    )
    .bind(now, seasonId)
    .all<{ id: string }>();

  if (stale.results && stale.results.length > 0) {
    for (const s of stale.results) {
      const metrics = await db
        .prepare(`SELECT DISTINCT metric FROM season_scores WHERE season_id = ?`)
        .bind(s.id)
        .all<{ metric: string }>();

      const winnerRows: WinnerCandidate[] = [];
      if (metrics.results) {
        for (const m of metrics.results) {
          const top = await db
            .prepare(
              `SELECT player_id, value FROM season_scores
               WHERE season_id = ? AND metric = ?
               ORDER BY value DESC LIMIT 3`
            )
            .bind(s.id, m.metric)
            .all<{ player_id: string; value: number }>();
          if (top.results) {
            for (const t of top.results) {
              winnerRows.push({ metric: m.metric, player_id: t.player_id, value: t.value });
            }
          }
        }
      }

      const stmts: D1PreparedStatement[] = [];
      let rank = 0;
      let lastMetric = '';
      for (const w of winnerRows) {
        if (w.metric !== lastMetric) {
          rank = 1;
          lastMetric = w.metric;
        } else {
          rank += 1;
        }
        stmts.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO season_winners (season_id, metric, rank, player_id, value)
               VALUES (?, ?, ?, ?, ?)`
            )
            .bind(s.id, w.metric, rank, w.player_id, w.value)
        );
      }
      stmts.push(
        db
          .prepare(`UPDATE leaderboard_seasons SET status = 'closed' WHERE id = ?`)
          .bind(s.id)
      );
      if (stmts.length > 0) {
        await db.batch(stmts);
      }
    }
  }

  // Look up or create current month season.
  const existing = await db
    .prepare(`SELECT id, ends_at FROM leaderboard_seasons WHERE id = ?`)
    .bind(seasonId)
    .first<SeasonRow>();

  if (existing) {
    return { id: existing.id, ends_at: existing.ends_at };
  }

  const startedAt = monthStartSec(today);
  const endsAt = nextMonthStartSec(today);
  await db
    .prepare(
      `INSERT OR IGNORE INTO leaderboard_seasons (id, label, started_at, ends_at, status)
       VALUES (?, ?, ?, ?, 'active')`
    )
    .bind(seasonId, key, startedAt, endsAt)
    .run();

  return { id: seasonId, ends_at: endsAt };
}

/**
 * Build an UPSERT statement for a season_scores row that adds `delta` to the
 * existing value (or inserts).
 */
function upsertScoreDelta(
  db: D1Database,
  seasonId: string,
  playerId: string,
  metric: string,
  delta: number,
  ts: number
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO season_scores (season_id, player_id, metric, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(season_id, player_id, metric)
       DO UPDATE SET value = value + excluded.value, updated_at = excluded.updated_at`
    )
    .bind(seasonId, playerId, metric, delta, ts);
}

/**
 * Build an UPSERT that sets value = MAX(value, newValue). Used for highest-zone
 * metrics that should not accumulate.
 */
function upsertScoreMax(
  db: D1Database,
  seasonId: string,
  playerId: string,
  metric: string,
  newValue: number,
  ts: number
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO season_scores (season_id, player_id, metric, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(season_id, player_id, metric)
       DO UPDATE SET value = MAX(value, excluded.value), updated_at = excluded.updated_at`
    )
    .bind(seasonId, playerId, metric, newValue, ts);
}

/**
 * Increment any quest_progress rows for today whose quest matches the event.
 * Uses a single UPDATE...FROM JOIN-style statement via subquery for SQLite.
 */
function questIncrementStmt(
  db: D1Database,
  playerId: string,
  date: string,
  objectiveType: string,
  objectiveArg: string | null,
  amount: number
): D1PreparedStatement {
  if (objectiveArg === null) {
    return db
      .prepare(
        `UPDATE player_quest_progress
         SET progress = progress + ?
         WHERE player_id = ? AND quest_date = ?
           AND quest_id IN (
             SELECT id FROM quest_definitions
             WHERE objective_type = ? AND objective_arg IS NULL AND is_active = 1
           )`
      )
      .bind(amount, playerId, date, objectiveType);
  }
  return db
    .prepare(
      `UPDATE player_quest_progress
       SET progress = progress + ?
       WHERE player_id = ? AND quest_date = ?
         AND quest_id IN (
           SELECT id FROM quest_definitions
           WHERE objective_type = ? AND objective_arg = ? AND is_active = 1
         )`
    )
    .bind(amount, playerId, date, objectiveType, objectiveArg);
}

/**
 * Record a finished game for a player. Updates the active season's scores AND
 * any matching daily quest progress, all in a single db.batch() call.
 */
export async function recordGameEnd(
  env: { DB: D1Database },
  params: {
    playerId: string;
    gameType: GameType;
    didWin: boolean;
    chipsDelta?: number;
  }
): Promise<void> {
  if (params.playerId.startsWith('guest_')) {
    return;
  }
  const db = env.DB;
  const season = await ensureActiveSeason(db);
  const ts = nowSec();
  const date = todayIso();

  const stmts: D1PreparedStatement[] = [];

  // Season score: games_played always increments.
  stmts.push(upsertScoreDelta(db, season.id, params.playerId, 'games_played', 1, ts));

  if (params.didWin) {
    stmts.push(upsertScoreDelta(db, season.id, params.playerId, 'games_won', 1, ts));
    const perGameMetric = MAIN_GAME_METRICS[params.gameType];
    if (perGameMetric) {
      stmts.push(upsertScoreDelta(db, season.id, params.playerId, perGameMetric, 1, ts));
    }
  }

  // Quest progress: play_games always; win_games and win_game_type only if won.
  stmts.push(questIncrementStmt(db, params.playerId, date, 'play_games', null, 1));
  if (params.didWin) {
    stmts.push(questIncrementStmt(db, params.playerId, date, 'win_games', null, 1));
    stmts.push(questIncrementStmt(db, params.playerId, date, 'win_game_type', params.gameType, 1));
  }

  await db.batch(stmts);
}

/**
 * Record dungeon progress. Stores highest zone in season_scores (MAX) and
 * increments any dungeon_zone quest.
 */
export async function recordDungeonProgress(
  env: { DB: D1Database },
  params: { playerId: string; highestZone: number }
): Promise<void> {
  if (params.playerId.startsWith('guest_')) {
    return;
  }
  const db = env.DB;
  const season = await ensureActiveSeason(db);
  const ts = nowSec();
  const date = todayIso();

  const stmts: D1PreparedStatement[] = [
    upsertScoreMax(db, season.id, params.playerId, 'dungeon_zone', params.highestZone, ts),
    questIncrementStmt(db, params.playerId, date, 'dungeon_zone', null, 1),
  ];

  await db.batch(stmts);
}

/**
 * Record chips earned. Increments season chips_earned + earn_chips quest progress.
 */
export async function recordChipsEarned(
  env: { DB: D1Database },
  params: { playerId: string; amount: number }
): Promise<void> {
  if (params.playerId.startsWith('guest_')) {
    return;
  }
  if (params.amount <= 0) {
    return;
  }
  const db = env.DB;
  const season = await ensureActiveSeason(db);
  const ts = nowSec();
  const date = todayIso();

  const stmts: D1PreparedStatement[] = [
    upsertScoreDelta(db, season.id, params.playerId, 'chips_earned', params.amount, ts),
    questIncrementStmt(db, params.playerId, date, 'earn_chips', null, params.amount),
  ];

  await db.batch(stmts);
}
