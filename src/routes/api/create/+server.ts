import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const POST: RequestHandler = async ({ locals, platform }) => {
  if (!locals.user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Generate a unique room code
  const code = generateCode();

  // The Durable Object will be lazily created when the first WebSocket connects
  // via idFromName(code). We just return the code here.
  return json({ code });
};
