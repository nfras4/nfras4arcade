/**
 * Post-build script: patches the adapter-cloudflare generated worker
 * to add Durable Object exports and WebSocket upgrade handling.
 *
 * The adapter overwrites `worker/index.js` (the `main` in wrangler.toml)
 * with its SvelteKit handler. This script adds our custom exports on top.
 */
import { readFileSync, writeFileSync } from 'fs';

const WORKER_PATH = 'worker/index.js';

let code = readFileSync(WORKER_PATH, 'utf8');

// 1. Add Durable Object imports at the top
const doImport = `import { ImpostorRoom } from './impostor/room';\nimport { PresidentRoom } from './cards/president';\nimport { ChaseTheQueenRoom } from './cards/chaseTheQueen';\nimport { ConnectFourRoom } from './connectFour/room';\nimport { WavelengthRoom } from './wavelength/room';\nimport { PokerRoom } from './poker/room';\nimport { SnapRoom } from './snap/room';\nimport { BlackjackRoom } from './casino/blackjack';\nimport { RouletteRoom } from './casino/roulette';\nimport { BaccaratRoom } from './casino/baccarat';\nimport { LiarsDiceRoom } from './liarsDice/room';\n`;
code = doImport + code;

// 2. Capture the original fetch handler and wrap it with WS upgrade + auth
const wsPatch = `
// --- nfras4arcade: WebSocket upgrade + DO export patch ---
const _svelteKitFetch = worker_default.fetch;
worker_default.fetch = async function(req, env, ctx) {
  const url = new URL(req.url);

  // WebSocket upgrade -> authenticate then forward to Durable Object
  const wsRoutes = { '/ws': 'IMPOSTOR_ROOM', '/ws/president': 'PRESIDENT_ROOM', '/ws/chase-the-queen': 'CHASE_QUEEN_ROOM', '/ws/connect-four': 'CONNECT_FOUR_ROOM', '/ws/wavelength': 'WAVELENGTH_ROOM', '/ws/poker': 'POKER_ROOM', '/ws/snap': 'SNAP_ROOM', '/ws/blackjack': 'BLACKJACK_ROOM', '/ws/roulette': 'ROULETTE_ROOM', '/ws/baccarat': 'BACCARAT_ROOM', '/ws/liars-dice': 'LIARS_DICE_ROOM' };
  const doBinding = wsRoutes[url.pathname];
  if (doBinding && req.headers.get('Upgrade') === 'websocket') {
    const room = url.searchParams.get('room');
    if (!room) return new Response('Missing room code', { status: 400 });

    // Validate session cookie (optional — guests allowed)
    const cookie = req.headers.get('Cookie') || '';
    const match = cookie.match(/(?:^|;\\s*)session=([^;]+)/);
    let userId = null;
    let displayName = null;

    if (match) {
      const sessionValue = match[1];
      const dotIndex = sessionValue.indexOf('.');
      if (dotIndex !== -1) {
        const sessionId = sessionValue.slice(dotIndex + 1);
        const now = Math.floor(Date.now() / 1000);
        const row = await env.DB.prepare(
          'SELECT u.id, p.display_name FROM sessions s JOIN users u ON u.id = s.user_id JOIN player_profiles p ON p.id = u.id WHERE s.id = ? AND s.expires_at > ?'
        ).bind(sessionId, now).first();
        if (row) {
          userId = row.id;
          displayName = row.display_name;
        }
      }
    }

    // Guest fallback: use X-Guest-Id header or generate from URL param
    if (!userId) {
      const guestId = url.searchParams.get('guestId');
      if (!guestId) return new Response('Missing authentication or guest ID', { status: 400 });
      userId = 'guest_' + guestId;
      displayName = 'Guest_' + guestId.slice(0, 4);
    }

    // Forward to the appropriate DO with user info in custom headers
    const ns = env[doBinding];
    const id = ns.idFromName(room.toUpperCase());
    const stub = ns.get(id);
    const headers = new Headers(req.headers);
    headers.set('X-User-Id', userId);
    headers.set('X-Display-Name', displayName);
    headers.set('X-Is-Guest', userId.startsWith('guest_') ? 'true' : 'false');

    // For poker and casino games: load chip balance from D1
    if ((doBinding === 'POKER_ROOM' || doBinding === 'BLACKJACK_ROOM' || doBinding === 'ROULETTE_ROOM' || doBinding === 'BACCARAT_ROOM' || doBinding === 'LIARS_DICE_ROOM') && userId && !userId.startsWith('guest_')) {
      try {
        const chipRow = await env.DB.prepare('SELECT chips FROM player_profiles WHERE id = ?').bind(userId).first();
        if (chipRow) headers.set('X-Player-Chips', String(chipRow.chips));
      } catch {}
    }

    return stub.fetch(new Request(req.url, { method: req.method, headers }));
  }

  return _svelteKitFetch.call(this, req, env, ctx);
};
// --- End patch ---
`;

// Insert the patch before the final export statement
code = code.replace(
  'export {\n  worker_default as default\n};',
  wsPatch + '\nexport {\n  worker_default as default,\n  ImpostorRoom,\n  PresidentRoom,\n  ChaseTheQueenRoom,\n  ConnectFourRoom,\n  WavelengthRoom,\n  PokerRoom,\n  SnapRoom,\n  BlackjackRoom,\n  RouletteRoom,\n  BaccaratRoom,\n  LiarsDiceRoom\n};'
);

writeFileSync(WORKER_PATH, code);
console.log('Patched worker/index.js with DO export + WS upgrade + auth handler');
