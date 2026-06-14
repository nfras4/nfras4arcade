import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { peek, record, getClientIp } from '$lib/server/auth/rateLimit';

const RATE_LIMIT = 30;
const RATE_WINDOW = 60_000;

export const GET: RequestHandler = async ({ request, params, platform }) => {
  const rateNs = platform?.env?.RATE_LIMITER;
  const ip = getClientIp(request);
  const rl = await peek(rateNs, `room-lookup:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rl.ok) {
    return json({ error: 'Too many room lookups, slow down' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  const code = params.code?.toUpperCase();
  if (!code) {
    return json({ error: 'Missing room code' }, { status: 400 });
  }

  const db = platform?.env?.DB;
  const doNamespace = platform?.env?.IMPOSTOR_ROOM;
  if (!db || !doNamespace) {
    return json({ error: 'Service unavailable' }, { status: 500 });
  }

  // Existence check BEFORE idFromName — otherwise any 4-char code probe
  // instantiates a fresh DO (24^4 = 331k codes = 331k DOs from one script).
  // active_rooms is populated by the DO itself on first WS join, so a
  // fresh room created via /api/create but never joined will 404 here
  // (acceptable — spectate links are shared after someone joins).
  try {
    const exists = await db.prepare('SELECT 1 FROM active_rooms WHERE code = ? LIMIT 1').bind(code).first();
    if (!exists) {
      await record(rateNs, `room-lookup:${ip}`, RATE_WINDOW);
      return json({ error: 'Room not found' }, { status: 404 });
    }
  } catch (err) {
    console.error('active_rooms existence check failed', err);
    return json({ error: 'Service unavailable' }, { status: 500 });
  }

  try {
    const id = doNamespace.idFromName(code);
    const stub = doNamespace.get(id);
    const res = await stub.fetch(new Request(`https://do/room?room=${code}`));
    const data = (await res.json()) as { code: string; playerCount: number; phase: string };

    if (!data.code) {
      await record(rateNs, `room-lookup:${ip}`, RATE_WINDOW);
      return json({ error: 'Room not found' }, { status: 404 });
    }

    await record(rateNs, `room-lookup:${ip}`, RATE_WINDOW);
    return json(data);
  } catch {
    await record(rateNs, `room-lookup:${ip}`, RATE_WINDOW);
    return json({ error: 'Room not found' }, { status: 404 });
  }
};
