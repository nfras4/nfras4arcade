-- Cloud saves for Wolton Dungeon
CREATE TABLE IF NOT EXISTS dungeon_saves (
  user_id      TEXT    PRIMARY KEY,
  save_data    TEXT    NOT NULL,
  saved_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  save_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_dungeon_saves_user
  ON dungeon_saves(user_id);
