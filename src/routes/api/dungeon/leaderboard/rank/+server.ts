import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB
  if (!db) return json({ error: 'Database unavailable' }, { status: 500 })

  const name = url.searchParams.get('name')?.trim()
  if (!name) return json({ error: 'name required' }, { status: 400 })

  // Get player entry
  const entry = await db
    .prepare(`SELECT player_name, highest_zone, highest_stage, player_level,
        prestige_tokens, fraser_kills, nick_defeated,
        COALESCE(deepest_post_game_zone, 0) as deepest_post_game_zone, updated_at
      FROM dungeon_leaderboard WHERE player_name = ?`)
    .bind(name)
    .first<{
      player_name: string; highest_zone: number; highest_stage: number
      player_level: number; prestige_tokens: number; fraser_kills: number
      nick_defeated: number; deepest_post_game_zone: number; updated_at: number
    }>()

  if (!entry) return json({ found: false })

  // Rank by zone
  const zoneRank = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dungeon_leaderboard
      WHERE highest_zone > ? OR (highest_zone = ? AND highest_stage > ?)`)
    .bind(entry.highest_zone, entry.highest_zone, entry.highest_stage)
    .first<{ cnt: number }>()

  // Rank by prestige
  const prestigeRank = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dungeon_leaderboard
      WHERE prestige_tokens > ?`)
    .bind(entry.prestige_tokens)
    .first<{ cnt: number }>()

  // Rank by level
  const levelRank = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dungeon_leaderboard
      WHERE player_level > ?`)
    .bind(entry.player_level)
    .first<{ cnt: number }>()

  // Rank by fraser kills
  const fraserRank = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dungeon_leaderboard
      WHERE fraser_kills > ?`)
    .bind(entry.fraser_kills)
    .first<{ cnt: number }>()

  // Rank by deepest post-game zone
  const descentRank = await db
    .prepare(`SELECT COUNT(*) as cnt FROM dungeon_leaderboard
      WHERE COALESCE(deepest_post_game_zone, 0) > COALESCE(?, 0)`)
    .bind(entry.deepest_post_game_zone ?? 0)
    .first<{ cnt: number }>()

  return json({
    found: true,
    playerName: entry.player_name,
    highestZone: entry.highest_zone,
    highestStage: entry.highest_stage,
    playerLevel: entry.player_level,
    prestigeTokens: entry.prestige_tokens,
    fraserKills: entry.fraser_kills,
    nickDefeated: entry.nick_defeated,
    updatedAt: entry.updated_at,
    ranks: {
      zone:    (zoneRank?.cnt ?? 0) + 1,
      prestige: (prestigeRank?.cnt ?? 0) + 1,
      level:   (levelRank?.cnt ?? 0) + 1,
      fraser:  (fraserRank?.cnt ?? 0) + 1,
      descent: (descentRank?.cnt ?? 0) + 1,
    },
  })
}
