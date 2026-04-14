import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB
  if (!db) return { leaderboard: null }

  try {
    const [zone, prestige, fraser] = await Promise.all([
      db.prepare(`SELECT player_name, highest_zone, highest_stage
        FROM dungeon_leaderboard ORDER BY highest_zone DESC, highest_stage DESC LIMIT 5`)
        .all<{ player_name: string; highest_zone: number; highest_stage: number }>(),
      db.prepare(`SELECT player_name, prestige_tokens
        FROM dungeon_leaderboard ORDER BY prestige_tokens DESC, highest_zone DESC LIMIT 5`)
        .all<{ player_name: string; prestige_tokens: number }>(),
      db.prepare(`SELECT player_name, fraser_kills
        FROM dungeon_leaderboard ORDER BY fraser_kills DESC, highest_zone DESC LIMIT 5`)
        .all<{ player_name: string; fraser_kills: number }>(),
    ])

    return {
      leaderboard: {
        zone:    zone.results    ?? [],
        prestige: prestige.results ?? [],
        fraser:  fraser.results  ?? [],
      },
    }
  } catch {
    return { leaderboard: null }
  }
}
