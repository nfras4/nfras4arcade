-- Track biggest single-win across any chip-granting game for the landing-page chip leaderboard.
ALTER TABLE player_profiles ADD COLUMN biggest_win INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_profiles ADD COLUMN biggest_win_game TEXT;

CREATE INDEX IF NOT EXISTS idx_player_profiles_chips
  ON player_profiles(chips DESC);
CREATE INDEX IF NOT EXISTS idx_player_profiles_biggest_win
  ON player_profiles(biggest_win DESC);
