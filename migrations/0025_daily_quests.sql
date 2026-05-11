CREATE TABLE IF NOT EXISTS quest_definitions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  objective_type TEXT NOT NULL,
  objective_target INTEGER NOT NULL,
  objective_arg TEXT,
  reward_chips INTEGER NOT NULL DEFAULT 100,
  reward_xp INTEGER NOT NULL DEFAULT 25,
  weight INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS player_quest_progress (
  player_id TEXT NOT NULL REFERENCES users(id),
  quest_date TEXT NOT NULL,
  quest_id TEXT NOT NULL REFERENCES quest_definitions(id),
  slot INTEGER NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  claimed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, quest_date, slot)
);
CREATE INDEX IF NOT EXISTS idx_pqp_player_date ON player_quest_progress(player_id, quest_date);

INSERT OR IGNORE INTO quest_definitions (id, title, description, objective_type, objective_target, objective_arg, reward_chips, reward_xp, weight, is_active) VALUES
  ('q_play2',    'Play 2 games today',  'Play 2 games today',  'play_games',    2,   NULL,           100, 25, 3, 1),
  ('q_play3',    'Play 3 games today',  'Play 3 games today',  'play_games',    3,   NULL,           150, 40, 2, 1),
  ('q_win1',     'Win a game today',    'Win a game today',    'win_games',     1,   NULL,           200, 50, 3, 1),
  ('q_winpoker', 'Win a Poker hand',    'Win a Poker hand',    'win_game_type', 1,   'poker',        250, 60, 1, 1),
  ('q_winsnap',  'Win a Snap match',    'Win a Snap match',    'win_game_type', 1,   'snap',         200, 50, 1, 1),
  ('q_winwave',  'Win Wavelength',      'Win Wavelength',      'win_game_type', 1,   'wavelength',   200, 50, 1, 1),
  ('q_winliars', 'Win Liar''s Dice',    'Win Liar''s Dice',    'win_game_type', 1,   'liars-dice',   200, 50, 1, 1),
  ('q_winc4',    'Win Connect Four',    'Win Connect Four',    'win_game_type', 1,   'connect-four', 200, 50, 1, 1),
  ('q_winimp',   'Win Impostor',        'Win Impostor',        'win_game_type', 1,   'impostor',     200, 50, 1, 1),
  ('q_dungeon1', 'Clear a Dungeon zone','Clear a Dungeon zone','dungeon_zone',  1,   NULL,           250, 75, 2, 1),
  ('q_chips200', 'Earn 200 chips',      'Earn 200 chips',      'earn_chips',    200, NULL,           150, 30, 2, 1),
  ('q_chips500', 'Earn 500 chips',      'Earn 500 chips',      'earn_chips',    500, NULL,           300, 80, 1, 1);
