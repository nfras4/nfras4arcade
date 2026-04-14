CREATE TABLE IF NOT EXISTS dungeon_leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL UNIQUE,
  highest_zone INTEGER NOT NULL DEFAULT 0,
  highest_stage INTEGER NOT NULL DEFAULT 0,
  player_level INTEGER NOT NULL DEFAULT 1,
  prestige_tokens INTEGER NOT NULL DEFAULT 0,
  fraser_kills INTEGER NOT NULL DEFAULT 0,
  nick_defeated INTEGER NOT NULL DEFAULT 0,
  total_playtime INTEGER NOT NULL DEFAULT 0,
  last_submit INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_zone
  ON dungeon_leaderboard(highest_zone DESC, highest_stage DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_prestige
  ON dungeon_leaderboard(prestige_tokens DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_level
  ON dungeon_leaderboard(player_level DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_fraser
  ON dungeon_leaderboard(fraser_kills DESC);
