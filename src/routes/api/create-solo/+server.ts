import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const GAME_CONFIG: Record<string, { binding: string; minPlayers: number }> = {
  president: { binding: 'PRESIDENT_ROOM', minPlayers: 3 },
  'chase-the-queen': { binding: 'CHASE_QUEEN_ROOM', minPlayers: 3 },
  'connect-four': { binding: 'CONNECT_FOUR_ROOM', minPlayers: 2 },
  poker: { binding: 'POKER_ROOM', minPlayers: 2 },
  wavelength: { binding: 'WAVELENGTH_ROOM', minPlayers: 2 },
  blackjack: { binding: 'BLACKJACK_ROOM', minPlayers: 1 },
  roulette: { binding: 'ROULETTE_ROOM', minPlayers: 1 },
  coup: { binding: 'COUP_ROOM', minPlayers: 2 },
};

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

export const POST: RequestHandler = async ({ request, url, platform }) => {
  const ip = getClientIp(request);
  const rl = peek(`create-solo:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.ok) {
    return json({ error: 'Too many solo games, slow down' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  const game = url.searchParams.get('game');
  if (!game || !GAME_CONFIG[game]) {
    return json({ error: 'Invalid game type' }, { status: 400 });
  }
  if (game === 'poker') {
    return json({ error: 'Poker is temporarily disabled' }, { status: 503 });
  }

  const config = GAME_CONFIG[game];
  const code = generateCode();

  const env = platform!.env;
  const ns = env[config.binding as keyof typeof env] as DurableObjectNamespace;
  const id = ns.idFromName(code);
  const stub = ns.get(id);

  // Initialize the room by fetching it (sets the code)
  const initUrl = `https://do-internal/room?room=${code}`;
  await stub.fetch(new Request(initUrl));

  // Fill remaining slots with bots (minPlayers - 1 because the human will join)
  const botsNeeded = config.minPlayers - 1;
  for (let i = 0; i < botsNeeded; i++) {
    const botUrl = `https://do-internal/room?room=${code}&action=add-bot`;
    await stub.fetch(new Request(botUrl, { method: 'POST' }));
  }

  record(`create-solo:${ip}`, RATE_WINDOW);
  return json({ code, game });
};
