-- Paired-device "remember this pairing" persistence (7-day TTL).
-- See .omc/specs/deep-interview-paired-device-phase3.md.
CREATE TABLE device_pairings (
  user_id TEXT NOT NULL REFERENCES users(id),
  partner_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, partner_fingerprint)
);
CREATE INDEX idx_device_pairings_user ON device_pairings(user_id);
CREATE INDEX idx_device_pairings_expires ON device_pairings(expires_at);
