-- Level-based cosmetic rewards: schema additions + seed data
-- Adds tier + level_requirement columns, dedup guard, unique index,
-- 7 hero cosmetics (one per milestone), 18 minor cosmetics across non-milestone levels.

-- Schema changes: extend shop_items with tier and level_requirement
ALTER TABLE shop_items ADD COLUMN tier TEXT NOT NULL DEFAULT 'shop'
  CHECK(tier IN ('shop','hero','minor'));
ALTER TABLE shop_items ADD COLUMN level_requirement INTEGER;

-- Dedup guard: collapse any duplicate (player_id, item_id) rows in player_inventory
-- to the earliest-rowid copy before adding the unique index.
-- Safe no-op if no duplicates exist.
DELETE FROM player_inventory
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM player_inventory GROUP BY player_id, item_id
);

-- Unique constraint enabling INSERT ... ON CONFLICT DO NOTHING for idempotent grants
CREATE UNIQUE INDEX idx_inventory_player_item
  ON player_inventory(player_id, item_id);

-- ============================================================
-- HERO COSMETICS (7 rows) -- earn-only, one per milestone level
-- price = NULL signals not purchasable; purchase endpoint rejects on tier check
-- is_active = 1 always; placeholder art used where finals not ready
-- ============================================================

INSERT INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, tier, level_requirement, created_at) VALUES
  -- Level 2: frame hero (first milestone, gateway reward)
  ('lvl_frame_hero_2', 'cosmetic', 'frame', 'Sunlit Frame', 'A radiant frame that glows with early promise', 0, '1F31F',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Crect x=''2'' y=''2'' width=''60'' height=''60'' rx=''6'' fill=''none'' stroke=''%23f9d423'' stroke-width=''6''/%3E%3C/svg%3E","gradient":["#f9d423","#e8a000"],"slice":"30 30 30 30","borderWidth":"12px"}',
    1, 'hero', 2, 0),

  -- Level 5: emblem hero
  ('lvl_emblem_hero_5', 'cosmetic', 'emblem', 'Aurora Emblem', 'A shimmering crest earned at the first proving ground', 0, '1F4AB',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Ccircle cx=''32'' cy=''32'' r=''28'' fill=''none'' stroke=''%2300d4ff'' stroke-width=''5''/%3E%3Cpolygon points=''32,10 38,26 56,26 42,36 48,52 32,42 16,52 22,36 8,26 26,26'' fill=''%2300d4ff'' opacity=''0.6''/%3E%3C/svg%3E"}',
    1, 'hero', 5, 0),

  -- Level 10: name_colour hero
  ('lvl_colour_hero_10', 'cosmetic', 'name_colour', 'Phoenix Nameflame', 'Your name burns in legendary orange-red at level 10', 0, '1F525',
    '{"hex":"#ff4500"}',
    1, 'hero', 10, 0),

  -- Level 15: card_back hero
  ('lvl_back_hero_15', 'cosmetic', 'card_back', 'Obsidian Sigil Back', 'A sleek black card back etched with silver runes', 0, '1F0CF',
    '{"style":"obsidian_sigil"}',
    1, 'hero', 15, 0),

  -- Level 20: table_felt hero
  ('lvl_felt_hero_20', 'cosmetic', 'table_felt', 'Midnight Velvet Felt', 'A deep navy felt reserved for those who have mastered the table', 0, '1F3B1',
    '{"hex":"#0d1b2a"}',
    1, 'hero', 20, 0),

  -- Level 30: avatar hero
  ('lvl_avatar_hero_30', 'cosmetic', 'avatar', 'Celestial Ring', 'A cosmic avatar ring marking a true veteran', 0, '1FA90',
    '{"frame":"celestial"}',
    1, 'hero', 30, 0),

  -- Level 50: frame hero (showpiece at the top of the ladder)
  ('lvl_frame_hero_50', 'cosmetic', 'frame', 'Eternal Crown Frame', 'The pinnacle frame. Proof of a journey completed.', 0, '1F451',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Crect x=''2'' y=''2'' width=''60'' height=''60'' rx=''6'' fill=''none'' stroke=''%23c9a84c'' stroke-width=''8''/%3E%3Crect x=''8'' y=''8'' width=''48'' height=''48'' rx=''4'' fill=''none'' stroke=''%23ffe066'' stroke-width=''2''/%3E%3C/svg%3E","gradient":["#c9a84c","#ffe066","#c9a84c"],"slice":"30 30 30 30","borderWidth":"16px"}',
    1, 'hero', 50, 0);

-- ============================================================
-- MINOR COSMETICS (18 rows) -- dual-path: auto-grant OR purchasable
-- Distributed across: 3,4,6,7,8,9,11,12,13,14,16,17,18,19,25,35,40,45
-- Price scale: lvl 3-9 = 150, lvl 11-19 = 300, lvl 25-35 = 750, lvl 40-45 = 1500
-- Mixed across all 6 cosmetic types (~3 per type across 18 rows)
-- ============================================================

INSERT INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, tier, level_requirement, created_at) VALUES
  -- Level 3: name_colour minor (150 chips)
  ('lvl_colour_minor_3', 'cosmetic', 'name_colour', 'Teal Spark', 'A cool teal name colour for the early adventurer', 150, '1F7E6',
    '{"hex":"#00b4d8"}',
    1, 'minor', 3, 0),

  -- Level 4: emblem minor (150 chips)
  ('lvl_emblem_minor_4', 'cosmetic', 'emblem', 'Ember Crest', 'A small but fierce ember emblem', 150, '1F525',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Ccircle cx=''32'' cy=''32'' r=''26'' fill=''%23ff6b35'' opacity=''0.8''/%3E%3C/svg%3E"}',
    1, 'minor', 4, 0),

  -- Level 6: card_back minor (150 chips)
  ('lvl_back_minor_6', 'cosmetic', 'card_back', 'Forest Weave', 'A nature-patterned card back in deep greens', 150, '1F0CF',
    '{"style":"forest_weave"}',
    1, 'minor', 6, 0),

  -- Level 7: table_felt minor (150 chips)
  ('lvl_felt_minor_7', 'cosmetic', 'table_felt', 'Dusk Rose Felt', 'A warm rose-toned felt for twilight sessions', 150, '1F7E5',
    '{"hex":"#c1666b"}',
    1, 'minor', 7, 0),

  -- Level 8: avatar minor (150 chips)
  ('lvl_avatar_minor_8', 'cosmetic', 'avatar', 'Copper Ring', 'A warm copper avatar ring for mid-rank players', 150, '1FA99',
    '{"frame":"copper"}',
    1, 'minor', 8, 0),

  -- Level 9: frame minor (150 chips)
  ('lvl_frame_minor_9', 'cosmetic', 'frame', 'Slate Edge Frame', 'A clean slate-grey frame with sharp corners', 150, '1F5FC',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Crect x=''2'' y=''2'' width=''60'' height=''60'' fill=''none'' stroke=''%23708090'' stroke-width=''6''/%3E%3C/svg%3E","gradient":["#708090","#4a5568"],"slice":"30 30 30 30","borderWidth":"12px"}',
    1, 'minor', 9, 0),

  -- Level 11: name_colour minor (300 chips)
  ('lvl_colour_minor_11', 'cosmetic', 'name_colour', 'Violet Haze', 'A mysterious violet name colour', 300, '1F7EA',
    '{"hex":"#7c3aed"}',
    1, 'minor', 11, 0),

  -- Level 12: emblem minor (300 chips)
  ('lvl_emblem_minor_12', 'cosmetic', 'emblem', 'Crescent Mark', 'A crescent moon emblem for the night players', 300, '1F319',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Cpath d=''M 44 20 A 20 20 0 1 0 44 44 A 14 14 0 1 1 44 20'' fill=''%23a78bfa''/%3E%3C/svg%3E"}',
    1, 'minor', 12, 0),

  -- Level 13: card_back minor (300 chips)
  ('lvl_back_minor_13', 'cosmetic', 'card_back', 'Storm Grid', 'A sharp geometric storm pattern on dark slate', 300, '1F0CF',
    '{"style":"storm_grid"}',
    1, 'minor', 13, 0),

  -- Level 14: table_felt minor (300 chips)
  ('lvl_felt_minor_14', 'cosmetic', 'table_felt', 'Charcoal Smoke Felt', 'A sophisticated dark charcoal felt', 300, '1F7F0',
    '{"hex":"#2b2d42"}',
    1, 'minor', 14, 0),

  -- Level 16: avatar minor (300 chips)
  ('lvl_avatar_minor_16', 'cosmetic', 'avatar', 'Gilt Edge', 'A gilded avatar ring with subtle engraving', 300, '1F947',
    '{"frame":"gilt"}',
    1, 'minor', 16, 0),

  -- Level 17: frame minor (300 chips)
  ('lvl_frame_minor_17', 'cosmetic', 'frame', 'Neon Pulse Frame', 'A vibrant electric-blue frame with neon glow', 300, '1F4A1',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Crect x=''2'' y=''2'' width=''60'' height=''60'' rx=''4'' fill=''none'' stroke=''%231e90ff'' stroke-width=''6'' filter=''url(%23glow)''/%3E%3C/svg%3E","gradient":["#1e90ff","#00cfff"],"slice":"30 30 30 30","borderWidth":"12px"}',
    1, 'minor', 17, 0),

  -- Level 18: name_colour minor (300 chips)
  ('lvl_colour_minor_18', 'cosmetic', 'name_colour', 'Jade Gleam', 'A rich jade green for seasoned players', 300, '1F7E2',
    '{"hex":"#00a878"}',
    1, 'minor', 18, 0),

  -- Level 19: emblem minor (300 chips)
  ('lvl_emblem_minor_19', 'cosmetic', 'emblem', 'Iron Anchor', 'A solid iron anchor for those who hold steady', 300, '2693',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Ctext x=''32'' y=''46'' font-size=''40'' text-anchor=''middle'' fill=''%23607d8b''%3E%E2%9A%93%3C/text%3E%3C/svg%3E"}',
    1, 'minor', 19, 0),

  -- Level 25: card_back minor (750 chips)
  ('lvl_back_minor_25', 'cosmetic', 'card_back', 'Crimson Lattice', 'An intricate crimson lattice pattern for elite players', 750, '1F0CF',
    '{"style":"crimson_lattice"}',
    1, 'minor', 25, 0),

  -- Level 35: table_felt minor (750 chips)
  ('lvl_felt_minor_35', 'cosmetic', 'table_felt', 'Abyssal Teal Felt', 'A deep teal felt that swallows light whole', 750, '1F9A2',
    '{"hex":"#003d4d"}',
    1, 'minor', 35, 0),

  -- Level 40: avatar minor (1500 chips)
  ('lvl_avatar_minor_40', 'cosmetic', 'avatar', 'Prism Halo', 'A prismatic avatar halo that catches every light', 1500, '1F308',
    '{"frame":"prism"}',
    1, 'minor', 40, 0),

  -- Level 45: frame minor (1500 chips)
  ('lvl_frame_minor_45', 'cosmetic', 'frame', 'Sovereign Frame', 'A commanding sovereign-tier frame for near-legendary players', 1500, '1F396',
    '{"svg":"data:image/svg+xml,%3Csvg xmlns=''http://www.w3.org/2000/svg'' width=''64'' height=''64''%3E%3Crect x=''2'' y=''2'' width=''60'' height=''60'' rx=''8'' fill=''none'' stroke=''%238b5cf6'' stroke-width=''7''/%3E%3Crect x=''10'' y=''10'' width=''44'' height=''44'' rx=''5'' fill=''none'' stroke=''%23c4b5fd'' stroke-width=''2''/%3E%3C/svg%3E","gradient":["#8b5cf6","#c4b5fd"],"slice":"30 30 30 30","borderWidth":"14px"}',
    1, 'minor', 45, 0);
