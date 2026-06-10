import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { recordDungeonProgress } from '../../../../../worker/shared/progression'

export const POST: RequestHandler = async ({ request, locals, platform }) => {
  const user = locals.user
  if (!user) return json({ error: 'unauthorised' }, { status: 401 })

  const db = platform?.env?.DB
  if (!db) return json({ error: 'Database unavailable' }, { status: 500 })

  let body: { saveData: string; saveVersion: number; savedAt: number }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { saveData, saveVersion, savedAt } = body
  if (typeof saveData !== 'string' || typeof saveVersion !== 'number') {
    return json({ error: 'Invalid body' }, { status: 400 })
  }
  if (saveData.length > 32_768) {
    return json({ error: 'Save data too large' }, { status: 413 })
  }

  // Reject stale writes: server version must not exceed incoming version
  const existing = await db
    .prepare('SELECT save_version FROM dungeon_saves WHERE user_id = ?')
    .bind(user.id)
    .first<{ save_version: number }>()

  if (existing && existing.save_version > saveVersion) {
    return json({ ok: false, reason: 'stale' })
  }

  await db
    .prepare(`
      INSERT INTO dungeon_saves (user_id, save_data, saved_at, save_version)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        save_data    = excluded.save_data,
        saved_at     = excluded.saved_at,
        save_version = excluded.save_version
    `)
    .bind(user.id, saveData, savedAt ?? Math.floor(Date.now() / 1000), saveVersion)
    .run()

  // Progression: feed dungeon_zone quest + seasonal leaderboard. The save blob
  // is JSON containing `currentZone` (see src/lib/dungeon/player.svelte.ts).
  // Cap to MAX_PLAUSIBLE_ZONE so a tampered client can't seed an unreachable
  // leaderboard score (recordDungeonProgress is a MAX upsert — once written,
  // can't be reduced for the season).
  if (user.id && !user.id.startsWith('guest_') && !user.id.startsWith('bot_')) {
    try {
      const parsed = JSON.parse(saveData) as { currentZone?: number; highestZone?: number }
      const zoneRaw = Number(parsed?.highestZone ?? parsed?.currentZone ?? 0)
      const MAX_PLAUSIBLE_ZONE = 100
      if (Number.isInteger(zoneRaw) && zoneRaw > 0 && zoneRaw <= MAX_PLAUSIBLE_ZONE) {
        await recordDungeonProgress({ DB: db }, { playerId: user.id, highestZone: zoneRaw })
      }
    } catch (err) {
      console.error('[dungeon/save] progression recordDungeonProgress failed', err)
    }
  }

  return json({ ok: true })
}

export const GET: RequestHandler = async ({ locals, platform }) => {
  const user = locals.user
  if (!user) return json({ error: 'unauthorised' }, { status: 401 })

  const db = platform?.env?.DB
  if (!db) return json({ error: 'Database unavailable' }, { status: 500 })

  const row = await db
    .prepare('SELECT save_data, saved_at, save_version FROM dungeon_saves WHERE user_id = ?')
    .bind(user.id)
    .first<{ save_data: string; saved_at: number; save_version: number }>()

  const displayName = user.displayName

  if (!row) return json({ save: null, displayName })

  return json({
    save: {
      saveData:    row.save_data,
      savedAt:     row.saved_at,
      saveVersion: row.save_version,
    },
    displayName,
  })
}

export const DELETE: RequestHandler = async ({ locals, platform }) => {
  const user = locals.user
  if (!user) return json({ error: 'unauthorised' }, { status: 401 })

  const db = platform?.env?.DB
  if (!db) return json({ error: 'Database unavailable' }, { status: 500 })

  await db
    .prepare('DELETE FROM dungeon_saves WHERE user_id = ?')
    .bind(user.id)
    .run()

  return json({ ok: true })
}
