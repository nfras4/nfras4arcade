CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bettor_id TEXT NOT NULL,
  bettor_name TEXT NOT NULL,
  room_code TEXT NOT NULL,
  game TEXT NOT NULL,
  target_player_id TEXT NOT NULL,
  target_player_name TEXT NOT NULL,
  wager_amount INTEGER NOT NULL,
  placed_at INTEGER NOT NULL,
  resolved_at INTEGER,
  outcome TEXT,
  payout INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bets_room ON bets(room_code, game, resolved_at);
CREATE INDEX IF NOT EXISTS idx_bets_bettor ON bets(bettor_id, placed_at DESC);
