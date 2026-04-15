import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

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

  if (!row) return json({ save: null })

  return json({
    save: {
      saveData:    row.save_data,
      savedAt:     row.saved_at,
      saveVersion: row.save_version,
    }
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
