import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB
  if (!db) return { leaderboard: null, chipLeaderboard: null }

  try {
    const [zone, prestige, level, topChips, topWins] = await Promise.all([
      db.prepare(`SELECT player_name, highest_zone, highest_stage
        FROM dungeon_leaderboard ORDER BY highest_zone DESC, highest_stage DESC LIMIT 5`)
        .all<{ player_name: string; highest_zone: number; highest_stage: number }>(),
      db.prepare(`SELECT player_name, prestige_tokens
        FROM dungeon_leaderboard ORDER BY prestige_tokens DESC, highest_zone DESC LIMIT 5`)
        .all<{ player_name: string; prestige_tokens: number }>(),
      db.prepare(`SELECT player_name, player_level
        FROM dungeon_leaderboard ORDER BY player_level DESC, highest_zone DESC LIMIT 5`)
        .all<{ player_name: string; player_level: number }>(),
      db.prepare(`SELECT display_name, chips
        FROM player_profiles ORDER BY chips DESC LIMIT 5`)
        .all<{ display_name: string; chips: number }>(),
      db.prepare(`SELECT display_name, biggest_win, biggest_win_game
        FROM player_profiles WHERE biggest_win > 0
        ORDER BY biggest_win DESC LIMIT 5`)
        .all<{ display_name: string; biggest_win: number; biggest_win_game: string | null }>(),
    ])

    return {
      leaderboard: {
        zone:    zone.results    ?? [],
        prestige: prestige.results ?? [],
        level:   level.results   ?? [],
      },
      chipLeaderboard: {
        chips:   topChips.results ?? [],
        wins:    topWins.results  ?? [],
      },
    }
  } catch {
    return { leaderboard: null, chipLeaderboard: null }
  }
}
