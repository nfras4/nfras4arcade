import type { PageServerLoad } from './$types'

export type AboutStats = {
  users: number
  gamesPlayed: number
  badgesEarned: number
  chipsCirculating: number
  runningSince: number | null
}

const FALLBACK: AboutStats = {
  users: 0,
  gamesPlayed: 0,
  badgesEarned: 0,
  chipsCirculating: 0,
  runningSince: null,
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB
  if (!db) return { stats: FALLBACK }

  try {
    const [users, games, badges, chips, oldest] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>(),
      db.prepare(`SELECT COALESCE(SUM(games_played), 0) AS n FROM player_profiles`).first<{ n: number }>(),
      db.prepare(`SELECT COUNT(*) AS n FROM player_badges`).first<{ n: number }>(),
      db.prepare(`SELECT COALESCE(SUM(chips), 0) AS n FROM player_profiles`).first<{ n: number }>(),
      db.prepare(`SELECT MIN(created_at) AS t FROM users`).first<{ t: number | null }>(),
    ])

    return {
      stats: {
        users: users?.n ?? 0,
        gamesPlayed: games?.n ?? 0,
        badgesEarned: badges?.n ?? 0,
        chipsCirculating: chips?.n ?? 0,
        runningSince: oldest?.t ?? null,
      } satisfies AboutStats,
    }
  } catch {
    return { stats: FALLBACK }
  }
}
