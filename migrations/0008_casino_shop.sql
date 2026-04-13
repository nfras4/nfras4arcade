-- Casino shop items catalog
CREATE TABLE shop_items (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  subcategory TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  icon TEXT,
  metadata TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Player inventory (purchased items)
CREATE TABLE player_inventory (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES player_profiles(id),
  item_id TEXT NOT NULL REFERENCES shop_items(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  purchased_at INTEGER NOT NULL
);
CREATE INDEX idx_player_inventory_player ON player_inventory(player_id);

-- Active equipped cosmetics
CREATE TABLE player_equipped (
  player_id TEXT PRIMARY KEY REFERENCES player_profiles(id),
  avatar_id TEXT REFERENCES shop_items(id),
  name_colour_id TEXT REFERENCES shop_items(id),
  card_back_id TEXT REFERENCES shop_items(id),
  table_felt_id TEXT REFERENCES shop_items(id)
);

-- Casino table registry for lobby listing
CREATE TABLE casino_tables (
  code TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  player_count INTEGER NOT NULL DEFAULT 0,
  max_seats INTEGER NOT NULL,
  min_bet INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL
);
CREATE INDEX idx_casino_tables_game_type ON casino_tables(game_type);

-- Casino badges
INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_blackjack_natural', 'blackjack_natural', 'Blackjack!', 'Get a natural 21', '1F0CF'),
  ('b_high_roller', 'high_roller', 'High Roller', 'Bet 500+ chips in a single round', '1F4B0'),
  ('b_roulette_win', 'roulette_win', 'Wheel Winner', 'Win a roulette bet', '1F3B0'),
  ('b_lucky_streak', 'lucky_streak', 'Lucky Streak', 'Win 5 casino rounds in a row', '1F340');

-- Seed shop items
INSERT INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, created_at) VALUES
  -- Avatars
  ('avatar_flame', 'cosmetic', 'avatar', 'Flame', 'A fiery avatar frame', 200, '1F525', '{"frame":"flame"}', 1, 0),
  ('avatar_crown', 'cosmetic', 'avatar', 'Royal Crown', 'A golden crown avatar frame', 500, '1F451', '{"frame":"crown"}', 1, 0),
  ('avatar_diamond', 'cosmetic', 'avatar', 'Diamond', 'A sparkling diamond frame', 1000, '1F48E', '{"frame":"diamond"}', 1, 0),

  -- Name colours
  ('colour_gold', 'cosmetic', 'name_colour', 'Gold', 'Golden name colour', 150, '1F7E1', '{"hex":"#f39c12"}', 1, 0),
  ('colour_crimson', 'cosmetic', 'name_colour', 'Crimson', 'Deep red name colour', 150, '1F534', '{"hex":"#e74c3c"}', 1, 0),
  ('colour_emerald', 'cosmetic', 'name_colour', 'Emerald', 'Rich green name colour', 150, '1F7E2', '{"hex":"#2ecc71"}', 1, 0),
  ('colour_sapphire', 'cosmetic', 'name_colour', 'Sapphire', 'Deep blue name colour', 150, '1F535', '{"hex":"#3498db"}', 1, 0),
  ('colour_purple', 'cosmetic', 'name_colour', 'Amethyst', 'Purple name colour', 150, '1F7E3', '{"hex":"#9b59b6"}', 1, 0),

  -- Card backs
  ('back_red_pattern', 'cosmetic', 'card_back', 'Classic Red', 'Traditional red card back', 300, '1F0CF', '{"style":"red_pattern"}', 1, 0),
  ('back_blue_pattern', 'cosmetic', 'card_back', 'Royal Blue', 'Elegant blue card back', 300, '1F0CF', '{"style":"blue_pattern"}', 1, 0),
  ('back_gold_foil', 'cosmetic', 'card_back', 'Gold Foil', 'Luxurious gold card back', 750, '1F0CF', '{"style":"gold_foil"}', 1, 0),

  -- Table felts
  ('felt_green', 'cosmetic', 'table_felt', 'Classic Green', 'Traditional casino green', 100, '1F7E9', '{"hex":"#2d5a27"}', 1, 0),
  ('felt_blue', 'cosmetic', 'table_felt', 'Ocean Blue', 'Cool blue felt', 200, '1F7E6', '{"hex":"#1a3a5c"}', 1, 0),
  ('felt_red', 'cosmetic', 'table_felt', 'Vegas Red', 'Bold red felt', 200, '1F7E5', '{"hex":"#8b1a1a"}', 1, 0),
  ('felt_purple', 'cosmetic', 'table_felt', 'Royal Purple', 'Regal purple felt', 300, '1F7EA', '{"hex":"#4a1a6b"}', 1, 0),

  -- Consumables (flagged: require game-side integration)
  ('consumable_double_down', 'consumable', 'double_down_token', 'Double Down Token', 'Double down in blackjack without extra chips (1 use)', 250, '2747', '{"uses":1}', 1, 0),
  ('consumable_insurance', 'consumable', 'insurance_voucher', 'Insurance Voucher', 'Free insurance bet in blackjack (1 use)', 200, '1F6E1', '{"uses":1}', 1, 0),

  -- Boosts (flagged: require game-side integration)
  ('boost_multiplier_3', 'boost', 'chip_multiplier', '1.5x Chip Boost (3 games)', 'Earn 1.5x chips for the next 3 casino games', 400, '1F4B0', '{"multiplier":1.5,"games":3}', 1, 0),
  ('boost_multiplier_10', 'boost', 'chip_multiplier', '1.5x Chip Boost (10 games)', 'Earn 1.5x chips for the next 10 casino games', 1000, '1F4B0', '{"multiplier":1.5,"games":10}', 1, 0);
