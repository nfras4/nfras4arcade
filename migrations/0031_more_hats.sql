-- More hats: a big batch of fun cosmetic hats for the 3D monkey.
-- Reuses the existing 'hat' slot (subcategory='hat'), so they flow through the
-- shop, equip endpoint, /api/auth/me, in-game broadcast, and the 3D preview
-- with no further plumbing. Rendered procedurally in PlaceholderMonkey.svelte.
INSERT OR IGNORE INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, tier, level_requirement, created_at) VALUES
  ('wizard',       'cosmetic', 'hat', 'Wizard Hat',     'A starry sorcerer''s hat',          700, '1F9D9', '{"shape":"wizard"}',       1, 'minor', NULL, 0),
  ('cowboy',       'cosmetic', 'hat', 'Cowboy Hat',     'Yeehaw. Wide-brimmed and ready',    500, '1F920', '{"shape":"cowboy"}',       1, 'minor', NULL, 0),
  ('halo',         'cosmetic', 'hat', 'Halo',           'A glowing ring of pure innocence', 1000, '1F607', '{"shape":"halo"}',         1, 'minor', NULL, 0),
  ('horns',        'cosmetic', 'hat', 'Devil Horns',    'Maybe not so innocent',             450, '1F608', '{"shape":"horns"}',        1, 'minor', NULL, 0),
  ('propeller',    'cosmetic', 'hat', 'Propeller Cap',  'Spins all on its own',              400, '1F681', '{"shape":"propeller"}',    1, 'minor', NULL, 0),
  ('chef',         'cosmetic', 'hat', 'Chef''s Hat',    'For the head of the kitchen',       350, '1F373', '{"shape":"chef"}',         1, 'minor', NULL, 0),
  ('graduate',     'cosmetic', 'hat', 'Graduation Cap', 'Top of the troop',                  600, '1F393', '{"shape":"graduate"}',     1, 'minor', NULL, 0),
  ('viking',       'cosmetic', 'hat', 'Viking Helmet',  'Horns for the brave',               800, '2694',  '{"shape":"viking"}',       1, 'minor', NULL, 0),
  ('flower_crown', 'cosmetic', 'hat', 'Flower Crown',   'Fresh-picked and blooming',         300, '1F490', '{"shape":"flower_crown"}', 1, 'minor', NULL, 0),
  ('cat_ears',     'cosmetic', 'hat', 'Cat Ears',       'Meow',                              350, '1F431', '{"shape":"cat_ears"}',     1, 'minor', NULL, 0),
  ('santa',        'cosmetic', 'hat', 'Santa Hat',      'Ho ho ho',                          250, '1F385', '{"shape":"santa"}',        1, 'minor', NULL, 0),
  ('beret',        'cosmetic', 'hat', 'Beret',          'Tres chic',                         300, '1F3A8', '{"shape":"beret"}',        1, 'minor', NULL, 0);
