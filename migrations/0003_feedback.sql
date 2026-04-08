CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  player_name TEXT NOT NULL,
  session_id TEXT,
  room_code TEXT,
  game_type TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_feedback_created_at ON feedback(created_at);
CREATE INDEX idx_feedback_category ON feedback(category);
