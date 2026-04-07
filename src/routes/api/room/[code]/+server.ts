import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
  const code = params.code?.toUpperCase();
  if (!code) {
    return json({ error: 'Missing room code' }, { status: 400 });
  }

  const doNamespace = platform?.env?.IMPOSTOR_ROOM;
  if (!doNamespace) {
    return json({ error: 'Service unavailable' }, { status: 500 });
  }

  try {
    const id = doNamespace.idFromName(code);
    const stub = doNamespace.get(id);
    // Non-WebSocket fetch returns room info from the DO
    const res = await stub.fetch(new Request(`https://do/room?room=${code}`));
    const data = await res.json() as { code: string; playerCount: number; phase: string };

    if (!data.code) {
      return json({ error: 'Room not found' }, { status: 404 });
    }

    return json(data);
  } catch {
    return json({ error: 'Room not found' }, { status: 404 });
  }
};
