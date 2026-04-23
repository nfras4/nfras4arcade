-- Add new cosmetic slots to player_equipped for frames and emblems
ALTER TABLE player_equipped ADD COLUMN frame_id TEXT REFERENCES shop_items(id);
ALTER TABLE player_equipped ADD COLUMN emblem_id TEXT REFERENCES shop_items(id);
ALTER TABLE player_equipped ADD COLUMN title_badge_id TEXT;

-- Seed 3 Frame shop items with category='cosmetic', subcategory='frame'
INSERT OR IGNORE INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, created_at) VALUES
  ('frame_bronze', 'cosmetic', 'frame', 'Bronze Frame', 'A classic bronze-trimmed frame', 500, '1F947', '{"svg":"bronze.svg","gradient":["#cd7f32","#a0522d"],"slice":"30 30 30 30","borderWidth":"12px"}', 1, 0),
  ('frame_silver', 'cosmetic', 'frame', 'Silver Frame', 'A polished silver-trimmed frame', 1250, '1F948', '{"svg":"silver.svg","gradient":["#c0c0c0","#808080"],"slice":"30 30 30 30","borderWidth":"12px"}', 1, 0),
  ('frame_gold', 'cosmetic', 'frame', 'Gold Frame', 'A gleaming gold-trimmed frame', 3000, '1F949', '{"svg":"gold.svg","gradient":["#ffd700","#b8860b"],"slice":"30 30 30 30","borderWidth":"14px"}', 1, 0);

-- Seed 5 Emblem shop items with category='cosmetic', subcategory='emblem'
INSERT OR IGNORE INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, created_at) VALUES
  ('emblem_flame', 'cosmetic', 'emblem', 'Flame Emblem', 'A blazing flame crest', 250, '1F525', '{"svg":"flame.svg"}', 1, 0),
  ('emblem_crown', 'cosmetic', 'emblem', 'Crown Emblem', 'A royal crown emblem', 400, '1F451', '{"svg":"crown.svg"}', 1, 0),
  ('emblem_diamond', 'cosmetic', 'emblem', 'Diamond Emblem', 'A sparkling diamond crest', 600, '1F48E', '{"svg":"diamond.svg"}', 1, 0),
  ('emblem_spade', 'cosmetic', 'emblem', 'Spade Emblem', 'A card suit spade emblem', 200, '2660', '{"svg":"spade.svg"}', 1, 0),
  ('emblem_star', 'cosmetic', 'emblem', 'Star Emblem', 'A shining star crest', 350, '2B50', '{"svg":"star.svg"}', 1, 0);
