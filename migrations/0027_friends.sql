CREATE TABLE IF NOT EXISTS friend_requests (
  from_id TEXT NOT NULL REFERENCES users(id),
  to_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_id);

CREATE TABLE IF NOT EXISTS friendships (
  player_a_id TEXT NOT NULL REFERENCES users(id),
  player_b_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_a_id, player_b_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(player_a_id);
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(player_b_id);
