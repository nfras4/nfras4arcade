-- H2: Owner identification + case-insensitive uniqueness on email and display_name.
--
-- Closes the visual owner-impersonation hole: previously displayName === 'nfras4'
-- was a client-side string match with no DB-side guarantee that only one user
-- could hold that name.
--
-- is_owner: queried in validateSession + surfaced as $currentUser.isOwner so the
-- crown can stop relying on a hard-coded display name string. Owner is identified
-- by email (nickwfraser@gmail.com). LOWER() compare guards against a future
-- case-mutation of the email.
--
-- users_email_lower_unique: closes the registration race where two casings of
-- the same email could both succeed (L4 from the audit).
--
-- player_profiles_display_name_lower_unique: enforces that display_name is
-- unique case-insensitively. Combined with reserved-names + NFKC normalisation
-- in register/profile, this means `player.name === 'nfras4'` in any DO
-- broadcast is provably the owner.

ALTER TABLE player_profiles ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0;

UPDATE player_profiles
SET is_owner = 1
WHERE id IN (SELECT id FROM users WHERE LOWER(email) = 'nickwfraser@gmail.com');

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users(LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_display_name_lower_unique
  ON player_profiles(LOWER(display_name));
