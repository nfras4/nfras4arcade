-- Glasses: a new cosmetic slot (eyewear) for the 3D monkey, alongside hats.
-- Adds the equipped column and seeds the shop items. Rendered procedurally in
-- PlaceholderMonkey.svelte, mounted at the face. Flows through equip,
-- resolvePlayerCosmetics, /api/auth/me, and the customize + home previews.
ALTER TABLE player_equipped ADD COLUMN glasses_id TEXT;

INSERT OR IGNORE INTO shop_items (id, category, subcategory, name, description, price, icon, metadata, is_active, tier, level_requirement, created_at) VALUES
  ('sunglasses', 'cosmetic', 'glasses', 'Sunglasses',    'Cool shades for a cool monkey', 400, '1F576', '{"shape":"sunglasses"}', 1, 'minor', NULL, 0),
  ('nerd',       'cosmetic', 'glasses', 'Nerd Glasses',  'Round wire-rim specs',          300, '1F453', '{"shape":"nerd"}',       1, 'minor', NULL, 0),
  ('threed',     'cosmetic', 'glasses', '3D Glasses',    'Red-and-cyan cinema classic',   350, '1F453', '{"shape":"threed"}',     1, 'minor', NULL, 0),
  ('eye_patch',  'cosmetic', 'glasses', 'Eye Patch',     'Arr, matey',                    300, '1F3F4', '{"shape":"eye_patch"}',  1, 'minor', NULL, 0),
  ('monocle',    'cosmetic', 'glasses', 'Monocle',       'Quite distinguished',           500, '1F9D0', '{"shape":"monocle"}',    1, 'minor', NULL, 0);
