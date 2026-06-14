-- 0029: hat slot on player_equipped + 5-hat seed.
-- Wave 1 of Phase 4 cosmetics economy. See .omc/plans/table-phase4-brief.md.

ALTER TABLE player_equipped ADD COLUMN hat_id TEXT REFERENCES shop_items(id);

-- Seed 5 hat items + the unbuyable crown.
-- party: cheap starter; top_hat / beanie / sombrero: mid-tier; crown: tier='hero' so /api/shop/purchase rejects buys.
INSERT OR IGNORE INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, tier, level_requirement, created_at) VALUES
  ('party',    'cosmetic', 'hat', 'Party Hat',   'A cheerful pointed party hat',     200, '1F389', '{"shape":"party"}',    1, 'minor', NULL, 0),
  ('top_hat',  'cosmetic', 'hat', 'Top Hat',     'A classy black top hat',           600, '1F3A9', '{"shape":"top_hat"}',  1, 'minor', NULL, 0),
  ('beanie',   'cosmetic', 'hat', 'Beanie',      'A snug winter beanie',             350, '1F9E2', '{"shape":"beanie"}',   1, 'minor', NULL, 0),
  ('sombrero', 'cosmetic', 'hat', 'Sombrero',    'A wide-brimmed sombrero', 800, '1F920', '{"shape":"sombrero"}', 1, 'minor', 5,    0),
  ('crown',    'cosmetic', 'hat', 'Barrel Crown','Awarded weekly to Barrel Night winners', 0, '1F451', '{"shape":"crown"}', 1, 'hero',  NULL, 0);
