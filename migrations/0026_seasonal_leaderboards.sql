CREATE TABLE IF NOT EXISTS leaderboard_seasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS season_scores (
  season_id TEXT NOT NULL REFERENCES leaderboard_seasons(id),
  player_id TEXT NOT NULL REFERENCES users(id),
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (season_id, player_id, metric)
);
CREATE INDEX IF NOT EXISTS idx_season_scores_metric ON season_scores(season_id, metric, value DESC);

CREATE TABLE IF NOT EXISTS season_winners (
  season_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  rank INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (season_id, metric, rank)
);
