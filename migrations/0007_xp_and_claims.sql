-- Add XP column to player_profiles
ALTER TABLE player_profiles ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;

-- Add last_chip_claim timestamp column
ALTER TABLE player_profiles ADD COLUMN last_chip_claim INTEGER;
