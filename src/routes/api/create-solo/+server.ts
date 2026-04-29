import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GAME_CONFIG: Record<string, { binding: string; minPlayers: number }> = {
  president: { binding: 'PRESIDENT_ROOM', minPlayers: 3 },
  'chase-the-queen': { binding: 'CHASE_QUEEN_ROOM', minPlayers: 3 },
  'connect-four': { binding: 'CONNECT_FOUR_ROOM', minPlayers: 2 },
  poker: { binding: 'POKER_ROOM', minPlayers: 2 },
  wavelength: { binding: 'WAVELENGTH_ROOM', minPlayers: 2 },
  blackjack: { binding: 'BLACKJACK_ROOM', minPlayers: 1 },
  roulette: { binding: 'ROULETTE_ROOM', minPlayers: 1 },
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const POST: RequestHandler = async ({ url, locals, platform }) => {
  // Allow both authenticated and guest users to create solo games
  const game = url.searchParams.get('game');
  if (!game || !GAME_CONFIG[game]) {
    return json({ error: 'Invalid game type' }, { status: 400 });
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

  return json({ code, game });
};
