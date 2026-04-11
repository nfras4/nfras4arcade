-- Add persistent chip balance to player profiles (default 1000 for all existing and new users)
ALTER TABLE player_profiles ADD COLUMN chips INTEGER NOT NULL DEFAULT 1000;

-- Poker badges
INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_poker_win',   'poker_win',   'High Roller',    'Win a hand of Texas Hold''em',        '1F0CF'),
  ('b_royal_flush', 'royal_flush', 'Royal Flush',    'Get a royal flush in Texas Hold''em',  '1F451'),
  ('b_all_in_win',  'all_in_win',  'All In Win',     'Win an all-in showdown',               '1F4B0');

-- Snap badges
INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_snap_win',    'snap_win',    'Quick Reflexes', 'Win a game of Snap',                   '1F44F'),
  ('b_snap_streak', 'snap_streak', 'Snap Streak',    'Win 3 snaps in a row',                 '1F525');
