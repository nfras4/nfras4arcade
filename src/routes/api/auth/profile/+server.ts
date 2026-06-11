import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const RESERVED_NAMES = new Set(['nfras4', 'admin', 'administrator', 'moderator', 'mod', 'owner', 'system', 'staff', 'support', 'root', 'guest', 'bot']);

export const PUT: RequestHandler = async ({ request, locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ error: 'Database not available' }, { status: 500 });

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: 'Invalid JSON' }, { status: 400 });

  const { displayName, avatar } = body as { displayName?: string; avatar?: string };

  const name = (displayName || '').replace(/<[^>]*>/g, '').trim();
  if (!name || name.length < 1 || name.length > 20) {
    return json({ error: 'Display name must be 1-20 characters' }, { status: 400 });
  }

  // Reserved-names guard: NFKC + casefold + whitespace-strip catches confusables.
  const canonical = name.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  if (RESERVED_NAMES.has(canonical)) {
    return json({ error: 'That display name is reserved' }, { status: 400 });
  }

  // Case-insensitive collision check against other users. The new UNIQUE INDEX
  // on LOWER(display_name) would also catch this at INSERT time, but checking
  // first gives a clean 409 instead of a 500 schema error.
  const collision = await db
    .prepare('SELECT id FROM player_profiles WHERE LOWER(display_name) = LOWER(?) AND id != ?')
    .bind(name, locals.user.id)
    .first();
  if (collision) {
    return json({ error: 'That display name is already taken' }, { status: 409 });
  }

  const avatarValue = avatar?.trim() || null;
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare('UPDATE player_profiles SET display_name = ?, avatar = ?, updated_at = ? WHERE id = ?')
    .bind(name, avatarValue, now, locals.user.id)
    .run();

  return json({ ok: true, displayName: name, avatar: avatarValue });
};
