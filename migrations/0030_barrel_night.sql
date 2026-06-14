-- 0030: Barrel Night weekly bracket + crown override column.
-- Wave 2 of Phase 4 cosmetics economy. See .omc/plans/table-phase4-brief.md (Stage C).
-- Deploys AFTER 0029 has baked in prod (hat slot live + verified).

-- One row per ISO week. week_start is the UTC ISO week string ('YYYY-Www'),
-- UNIQUE so the cron's INSERT OR IGNORE is idempotent on a double-fire / DST edge.
CREATE TABLE IF NOT EXISTS barrel_night_events (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,              -- 'open' | 'locked' | 'running' | 'complete'
  winner_player_id TEXT,
  bracket_json TEXT,
  created_at INTEGER NOT NULL
);

-- Crown override window. 0 = no crown. Set to week_start_unix + 604800 on win.
-- The crown override lives at the CosmeticsCache layer; this read is wrapped in
-- its own nested try so a missing column degrades gracefully to "no crown",
-- never to "no cosmetics" (pre-mortem scenario 1).
ALTER TABLE player_profiles ADD COLUMN crown_active_until INTEGER NOT NULL DEFAULT 0;
