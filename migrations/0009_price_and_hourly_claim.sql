-- Increase shop prices ~3-4x
UPDATE shop_items SET price = 700 WHERE id = 'avatar_flame';
UPDATE shop_items SET price = 1750 WHERE id = 'avatar_crown';
UPDATE shop_items SET price = 3500 WHERE id = 'avatar_diamond';

UPDATE shop_items SET price = 500 WHERE id = 'colour_gold';
UPDATE shop_items SET price = 500 WHERE id = 'colour_crimson';
UPDATE shop_items SET price = 500 WHERE id = 'colour_emerald';
UPDATE shop_items SET price = 500 WHERE id = 'colour_sapphire';
UPDATE shop_items SET price = 500 WHERE id = 'colour_purple';

UPDATE shop_items SET price = 1000 WHERE id = 'back_red_pattern';
UPDATE shop_items SET price = 1000 WHERE id = 'back_blue_pattern';
UPDATE shop_items SET price = 2500 WHERE id = 'back_gold_foil';

UPDATE shop_items SET price = 350 WHERE id = 'felt_green';
UPDATE shop_items SET price = 700 WHERE id = 'felt_blue';
UPDATE shop_items SET price = 700 WHERE id = 'felt_red';
UPDATE shop_items SET price = 1000 WHERE id = 'felt_purple';

UPDATE shop_items SET price = 800 WHERE id = 'consumable_double_down';
UPDATE shop_items SET price = 700 WHERE id = 'consumable_insurance';

UPDATE shop_items SET price = 1500 WHERE id = 'boost_multiplier_3';
UPDATE shop_items SET price = 3500 WHERE id = 'boost_multiplier_10';

-- Add hourly mini-claim column
ALTER TABLE player_profiles ADD COLUMN last_hourly_claim INTEGER;
