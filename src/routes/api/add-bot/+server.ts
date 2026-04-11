import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const DO_BINDINGS: Record<string, string> = {
  president: 'PRESIDENT_ROOM',
  'chase-the-queen': 'CHASE_QUEEN_ROOM',
  'connect-four': 'CONNECT_FOUR_ROOM',
  wavelength: 'WAVELENGTH_ROOM',
  poker: 'POKER_ROOM',
};

export const POST: RequestHandler = async ({ url, locals, platform }) => {
  const room = url.searchParams.get('room')?.toUpperCase();
  const game = url.searchParams.get('game');

  if (!room || !game) {
    return json({ error: 'Missing room or game parameter' }, { status: 400 });
  }

  const binding = DO_BINDINGS[game];
  if (!binding) {
    return json({ error: 'Invalid game type' }, { status: 400 });
  }

  const env = platform!.env;
  const ns = env[binding as keyof typeof env] as DurableObjectNamespace;
  const id = ns.idFromName(room);
  const stub = ns.get(id);

  const doUrl = `https://do-internal/room?room=${room}&action=add-bot`;
  const res = await stub.fetch(new Request(doUrl, { method: 'POST' }));
  const data = await res.json();

  return json(data, { status: res.status });
};
