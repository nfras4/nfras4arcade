CREATE TABLE IF NOT EXISTS active_rooms (
  code TEXT NOT NULL,
  game TEXT NOT NULL,
  phase TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  players_json TEXT NOT NULL,
  started_at INTEGER,
  last_updated_at INTEGER NOT NULL,
  PRIMARY KEY (code, game)
);
CREATE INDEX IF NOT EXISTS idx_active_rooms_phase_updated ON active_rooms(phase, last_updated_at DESC);
