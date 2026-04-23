-- Liar's Dice: per-player win counter + dedicated win badge.
ALTER TABLE player_profiles ADD COLUMN liars_dice_wins INTEGER DEFAULT 0;

INSERT INTO badges (id, slug, label, description, icon) VALUES
  ('b_liars_dice_win', 'liars_dice_win', 'Silver Tongue', 'Win your first game of Liar''s Dice', '1F3B2');
