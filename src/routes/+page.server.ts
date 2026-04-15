import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB
  if (!db) return { leaderboard: null }

  try {
    const [zone, prestige, level] = await Promise.all([
      db.prepare(`SELECT player_name, highest_zone, highest_stage
        FROM dungeon_leaderboard ORDER BY highest_zone DESC, highest_stage DESC LIMIT 5`)
        .all<{ player_name: string; highest_zone: number; highest_stage: number }>(),
      db.prepare(`SELECT player_name, prestige_tokens
        FROM dungeon_leaderboard ORDER BY prestige_tokens DESC, highest_zone DESC LIMIT 5`)
        .all<{ player_name: string; prestige_tokens: number }>(),
      db.prepare(`SELECT player_name, player_level
        FROM dungeon_leaderboard ORDER BY player_level DESC, highest_zone DESC LIMIT 5`)
        .all<{ player_name: string; player_level: number }>(),
    ])

    return {
      leaderboard: {
        zone:    zone.results    ?? [],
        prestige: prestige.results ?? [],
        level:   level.results   ?? [],
      },
    }
  } catch {
    return { leaderboard: null }
  }
}
