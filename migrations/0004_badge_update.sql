-- Badge update: new badges including easter eggs
-- Regular badges
INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_connect_four_win', 'connect_four_win', 'Four in a Row',     'Win a game of Connect 4',              '1F534'),
  ('b_social_butterfly', 'social_butterfly', 'Social Butterfly',  'Win games of 3 or more game types',    '1F98B'),
  ('b_card_shark',       'card_shark',       'Card Shark',        'Win 10 card games',                    '1F988');

-- Easter egg badges (hidden until earned)
INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_night_owl',        'night_owl',        'Night Owl',         'Play a game between midnight and 5am', '1F989'),
  ('b_stalemate',        'stalemate',        'Stalemate',         'Draw in Connect 4',                    '1F91D'),
  ('b_speed_demon',      'speed_demon',      'Speed Demon',       'Win a game in under 2 minutes',        '26A1');
