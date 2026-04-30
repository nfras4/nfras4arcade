-- Add token_hash to sessions for cookie-token verification.
-- Prevents UUID-enumeration bypass: validateSession now checks both sessionId and a
-- SHA-256 of the cookie token, not just the sessionId.
ALTER TABLE sessions ADD COLUMN token_hash TEXT NOT NULL DEFAULT '';
