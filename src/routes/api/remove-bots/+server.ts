import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const DO_BINDINGS: Record<string, string> = {
  president: 'PRESIDENT_ROOM',
  'chase-the-queen': 'CHASE_QUEEN_ROOM',
  'connect-four': 'CONNECT_FOUR_ROOM',
  wavelength: 'WAVELENGTH_ROOM',
  poker: 'POKER_ROOM',
  coup: 'COUP_ROOM',
};

const RATE_LIMIT = 15;
const RATE_WINDOW = 60_000;

export const POST: RequestHandler = async ({ request, url, platform }) => {
  const rateNs = platform?.env?.RATE_LIMITER;
  const ip = getClientIp(request);
  const rl = await peek(rateNs, `remove-bots:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.ok) {
    return json({ error: 'Too many bot removes, slow down' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  const room = url.searchParams.get('room')?.toUpperCase();
  const game = url.searchParams.get('game');

  if (!room || !game) {
    return json({ error: 'Missing room or game parameter' }, { status: 400 });
  }

  const binding = DO_BINDINGS[game];
  if (!binding) {
    return json({ error: 'Invalid game type' }, { status: 400 });
  }
  if (game === 'poker') {
    return json({ error: 'Poker is temporarily disabled' }, { status: 503 });
  }

  const env = platform!.env;
  const ns = env[binding as keyof typeof env] as DurableObjectNamespace;
  const id = ns.idFromName(room);
  const stub = ns.get(id);

  const doUrl = `https://do-internal/room?room=${room}&action=remove-bots`;
  const res = await stub.fetch(new Request(doUrl, { method: 'POST' }));
  const data = await res.json();

  await record(rateNs, `remove-bots:${ip}`, RATE_WINDOW);
  return json(data, { status: res.status });
};
