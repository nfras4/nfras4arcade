import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });

  const { displayName, avatar } = body as { displayName?: string; avatar?: string };

  const name = (displayName || '').trim();
  if (!name || name.length < 1 || name.length > 20) {
    return json({ error: 'Display name must be 1-20 characters' }, { status: 400 });
  }

  const avatarValue = avatar?.trim() || null;
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare('UPDATE player_profiles SET display_name = ?, avatar = ?, updated_at = ? WHERE id = ?')
    .bind(name, avatarValue, now, locals.user.id)
    .run();

  return json({ ok: true, displayName: name, avatar: avatarValue });
};
