import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

type ChipRow = { display_name: string; chips: number }
type WinRow  = { display_name: string; biggest_win: number; biggest_win_game: string | null }

export const GET: RequestHandler = async ({ url, platform }) => {
  const db = platform?.env?.DB
  if (!db) return json({ entries: [] })

  const sort = url.searchParams.get('sort') === 'biggest_win' ? 'biggest_win' : 'chips'
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 25)

  try {
    if (sort === 'biggest_win') {
      const { results } = await db
        .prepare(
          `SELECT display_name, biggest_win, biggest_win_game
           FROM player_profiles
           WHERE biggest_win > 0
           ORDER BY biggest_win DESC
           LIMIT ?`
        )
        .bind(limit)
        .all<WinRow>()
      return json({
        entries: (results ?? []).map((r, i) => ({
          rank: i + 1,
          playerName: r.display_name,
          biggestWin: r.biggest_win,
          game: r.biggest_win_game,
        })),
      })
    }

    const { results } = await db
      .prepare(
        `SELECT display_name, chips
         FROM player_profiles
         ORDER BY chips DESC
         LIMIT ?`
      )
      .bind(limit)
      .all<ChipRow>()
    return json({
      entries: (results ?? []).map((r, i) => ({
        rank: i + 1,
        playerName: r.display_name,
        chips: r.chips,
      })),
    })
  } catch {
    return json({ entries: [] })
  }
}
