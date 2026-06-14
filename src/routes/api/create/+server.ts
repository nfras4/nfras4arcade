import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

export const POST: RequestHandler = async ({ request, platform }) => {
  const rateNs = platform?.env?.RATE_LIMITER;
  const ip = getClientIp(request);
  const rl = await peek(rateNs, `create:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.ok) {
    return json({ error: 'Too many room creations, slow down' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }
  await record(rateNs, `create:${ip}`, RATE_WINDOW);
  const code = generateCode();
  return json({ code });
};
