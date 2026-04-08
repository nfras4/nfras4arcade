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
  // Room creation allowed for both authenticated and guest users
  const code = generateCode();
  return json({ code });
};
