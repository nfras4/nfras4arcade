-- nfras4arcade: Initial schema
-- All timestamps are integer (unix epoch seconds)

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  hashed_password TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE player_profiles (
  id TEXT PRIMARY KEY REFERENCES users(id),
  display_name TEXT NOT NULL,
  avatar TEXT,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE badges (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL
);

CREATE TABLE player_badges (
  player_id TEXT NOT NULL REFERENCES player_profiles(id),
  badge_id TEXT NOT NULL REFERENCES badges(id),
  awarded_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, badge_id)
);

CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL DEFAULT 'impostor',
  room_code TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  winner_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE INDEX idx_game_sessions_game_type ON game_sessions(game_type);
CREATE INDEX idx_game_sessions_room_code ON game_sessions(room_code);

-- Seed starter badges
INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_first_game',        'first_game',        'First Game',        'Play your first game',                              '1F3AE'),
  ('b_impostor_win',      'impostor_win',      'Impostor Win',      'Win a game as the impostor',                        '1F3AD'),
  ('b_perfect_detective', 'perfect_detective', 'Perfect Detective', 'Vote correctly when everyone else does too',         '1F50D'),
  ('b_veteran',           'veteran',           'Veteran',           'Play 10 games',                                     '2B50'),
  ('b_champion',          'champion',          'Champion',          'Win your first game',                               '1F3C6'),
  ('b_going_bananas',     'going_bananas',     'Going Bananas',     'Shoot the moon in Chase the Queen',                 '1F34C');
