-- Contingency migration: D1-backed token store fallback.
-- DO NOT apply at Phase 3 deploy. Apply only if observability shows
-- pair-token-miss rate exceeds 2% of pair-token-issue events over a
-- rolling 24h window. See ralplan-paired-device-phase3.md Section 3.3.
CREATE TABLE pairing_tokens (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  room_code TEXT NOT NULL,
  game_type TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_pairing_tokens_expires ON pairing_tokens(expires_at);
