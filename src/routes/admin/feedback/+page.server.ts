import type { PageServerLoad } from './$types';

// TODO: Add auth protection - this route should be restricted to admin users
export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) {
    return { feedback: [] };
  }

  const rows = await db
    .prepare(
      `SELECT id, player_id, player_name, session_id, room_code, game_type, category, message, created_at
       FROM feedback
       ORDER BY created_at DESC`
    )
    .all<{
      id: string;
      player_id: string | null;
      player_name: string;
      session_id: string | null;
      room_code: string | null;
      game_type: string | null;
      category: string;
      message: string;
      created_at: number;
    }>();

  return {
    feedback: rows.results || [],
  };
};
