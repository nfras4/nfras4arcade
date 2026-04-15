import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

const RATE_LIMIT_SECONDS = 60

type LeaderboardRow = {
  rank: number
  playerName: string
  highestZone: number
  highestStage: number
  playerLevel: number
  prestigeTokens: number
  fraserKills: number
  nickDefeated: number
  updatedAt: number
}

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB
  if (!db) return json({ error: 'Database unavailable' }, { status: 500 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    playerName, highestZone, highestStage, playerLevel,
    prestigeTokens, fraserKills, nickDefeated, totalPlaytime,
  } = body as Record<string, unknown>

  if (typeof playerName !== 'string' || !playerName.trim()) {
    return json({ error: 'playerName required' }, { status: 400 })
  }

  const name = playerName.trim().slice(0, 32)
  const BLOCKED_NAMES = new Set(['PLAYER', 'NICK', 'player', 'nick'])
  if (BLOCKED_NAMES.has(name)) return json({ ok: true, skipped: 'blocked_name' })
  const now = Math.floor(Date.now() / 1000)

  // Rate limit: check last submit time
  const existing = await db
    .prepare('SELECT highest_zone, highest_stage, last_submit FROM dungeon_leaderboard WHERE player_name = ?')
    .bind(name)
    .first<{ highest_zone: number; highest_stage: number; last_submit: number }>()

  if (existing && now - existing.last_submit < RATE_LIMIT_SECONDS) {
    return json({ ok: true, skipped: 'rate_limited' })
  }

  const newZone  = Number(highestZone)  || 0
  const newStage = Number(highestStage) || 0

  // Only update if score improved (never go backwards)
  if (existing) {
    const improved =
      newZone > existing.highest_zone ||
      (newZone === existing.highest_zone && newStage > existing.highest_stage)
    if (!improved) {
      // Still update non-progression stats (level, prestige, fraser, playtime) and rate limit stamp
      await db
        .prepare(`UPDATE dungeon_leaderboard SET
          player_level = MAX(player_level, ?),
          prestige_tokens = MAX(prestige_tokens, ?),
          fraser_kills = MAX(fraser_kills, ?),
          nick_defeated = MAX(nick_defeated, ?),
          total_playtime = MAX(total_playtime, ?),
          last_submit = ?,
          updated_at = ?
          WHERE player_name = ?`)
        .bind(
          Number(playerLevel) || 1,
          Number(prestigeTokens) || 0,
          Number(fraserKills) || 0,
          nickDefeated ? 1 : 0,
          Number(totalPlaytime) || 0,
          now, now, name,
        )
        .run()
      return json({ ok: true })
    }
  }

  // Upsert with improved zone/stage
  await db
    .prepare(`INSERT INTO dungeon_leaderboard
      (player_name, highest_zone, highest_stage, player_level, prestige_tokens,
       fraser_kills, nick_defeated, total_playtime, last_submit, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_name) DO UPDATE SET
        highest_zone    = excluded.highest_zone,
        highest_stage   = excluded.highest_stage,
        player_level    = MAX(player_level, excluded.player_level),
        prestige_tokens = MAX(prestige_tokens, excluded.prestige_tokens),
        fraser_kills    = MAX(fraser_kills, excluded.fraser_kills),
        nick_defeated   = MAX(nick_defeated, excluded.nick_defeated),
        total_playtime  = MAX(total_playtime, excluded.total_playtime),
        last_submit     = excluded.last_submit,
        updated_at      = excluded.updated_at`)
    .bind(
      name,
      newZone, newStage,
      Number(playerLevel) || 1,
      Number(prestigeTokens) || 0,
      Number(fraserKills) || 0,
      nickDefeated ? 1 : 0,
      Number(totalPlaytime) || 0,
      now, now,
    )
    .run()

  return json({ ok: true })
}

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB
  if (!db) return json({ error: 'Database unavailable' }, { status: 500 })

  const sort  = url.searchParams.get('sort') ?? 'zone'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 50)

  const ORDER_BY: Record<string, string> = {
    zone:    'highest_zone DESC, highest_stage DESC',
    prestige: 'prestige_tokens DESC, highest_zone DESC',
    level:   'player_level DESC, highest_zone DESC',
    fraser:  'fraser_kills DESC, highest_zone DESC',
  }
  const orderBy = ORDER_BY[sort] ?? ORDER_BY.zone

  const rows = await db
    .prepare(`SELECT
        player_name, highest_zone, highest_stage, player_level,
        prestige_tokens, fraser_kills, nick_defeated, updated_at
      FROM dungeon_leaderboard
      ORDER BY ${orderBy}
      LIMIT ?`)
    .bind(limit)
    .all<{
      player_name: string; highest_zone: number; highest_stage: number
      player_level: number; prestige_tokens: number; fraser_kills: number
      nick_defeated: number; updated_at: number
    }>()

  const entries: LeaderboardRow[] = (rows.results ?? []).map((r, i) => ({
    rank: i + 1,
    playerName: r.player_name,
    highestZone: r.highest_zone,
    highestStage: r.highest_stage,
    playerLevel: r.player_level,
    prestigeTokens: r.prestige_tokens,
    fraserKills: r.fraser_kills,
    nickDefeated: r.nick_defeated,
    updatedAt: r.updated_at,
  }))

  return json({ entries, sort })
}
