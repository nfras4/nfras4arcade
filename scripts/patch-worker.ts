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
const doImport = `import { ImpostorRoom } from './impostor/room';\nimport { PresidentRoom } from './cards/president';\nimport { ChaseTheQueenRoom } from './cards/chaseTheQueen';\nimport { ConnectFourRoom } from './connectFour/room';\nimport { WavelengthRoom } from './wavelength/room';\nimport { PokerRoom } from './poker/room';\nimport { SnapRoom } from './snap/room';\nimport { BlackjackRoom } from './casino/blackjack';\nimport { RouletteRoom } from './casino/roulette';\nimport { BaccaratRoom } from './casino/baccarat';\nimport { LiarsDiceRoom } from './liarsDice/room';\nimport { CoupRoom } from './coup/room';\n`;
code = doImport + code;

// 2. Capture the original fetch handler and wrap it with WS upgrade + auth
const wsPatch = `
// --- nfras4arcade: WebSocket upgrade + DO export patch ---
const _svelteKitFetch = worker_default.fetch;

// Mirror src/lib/server/auth/session.ts — base64url SHA-256 + constant-time compare
// so the WS auth path verifies sessions.token_hash the same way validateSession does.
async function _sha256B64Url(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
    .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
}
function _constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

worker_default.fetch = async function(req, env, ctx) {
  const url = new URL(req.url);

  // Redirect legacy workers.dev hostname to the custom domain
  if (url.hostname.endsWith('.workers.dev')) {
    return Response.redirect('https://arcade.nickwfraser.dev' + url.pathname + url.search, 301);
  }

  // WebSocket upgrade -> authenticate then forward to Durable Object
  // KILL SWITCH: poker disabled (DO usage runaway). Reject before DO is touched.
  if (url.pathname === '/ws/poker') {
    return new Response('Poker is temporarily disabled', { status: 503 });
  }

  const wsRoutes = { '/ws': 'IMPOSTOR_ROOM', '/ws/president': 'PRESIDENT_ROOM', '/ws/chase-the-queen': 'CHASE_QUEEN_ROOM', '/ws/connect-four': 'CONNECT_FOUR_ROOM', '/ws/wavelength': 'WAVELENGTH_ROOM', '/ws/poker': 'POKER_ROOM', '/ws/snap': 'SNAP_ROOM', '/ws/blackjack': 'BLACKJACK_ROOM', '/ws/roulette': 'ROULETTE_ROOM', '/ws/baccarat': 'BACCARAT_ROOM', '/ws/liars-dice': 'LIARS_DICE_ROOM', '/ws/coup': 'COUP_ROOM' };
  const doBinding = wsRoutes[url.pathname];
  if (doBinding && req.headers.get('Upgrade') === 'websocket') {
    const room = url.searchParams.get('room');
    if (!room) return new Response('Missing room code', { status: 400 });

    // Cross-Site WebSocket Hijacking guard: cookie-authed WS would otherwise be
    // accepted from any origin (SameSite=Lax does not cover WebSockets).
    const origin = req.headers.get('Origin');
    const ALLOWED_ORIGINS = ['https://arcade.nickwfraser.dev'];
    // Local dev (wrangler dev): accept localhost origins ONLY when the request
    // itself is served from localhost, so production posture is unchanged.
    // String ops, not regex: this code is emitted through a string literal in
    // patch-worker.ts, where backslash escapes get consumed.
    const isLocalDev =
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      origin !== null &&
      (origin === 'http://localhost' || origin.startsWith('http://localhost:') ||
       origin === 'http://127.0.0.1' || origin.startsWith('http://127.0.0.1:'));
    if (origin && !isLocalDev && !ALLOWED_ORIGINS.includes(origin) && !origin.endsWith('.workers.dev')) {
      return new Response('Forbidden origin', { status: 403 });
    }

    // Validate session cookie (optional — guests allowed)
    const cookie = req.headers.get('Cookie') || '';
    const match = cookie.match(/(?:^|;\\s*)session=([^;]+)/);
    let userId = null;
    let displayName = null;

    if (match) {
      const sessionValue = match[1];
      const dotIndex = sessionValue.indexOf('.');
      if (dotIndex !== -1) {
        const token = sessionValue.slice(0, dotIndex);
        const sessionId = sessionValue.slice(dotIndex + 1);
        const now = Math.floor(Date.now() / 1000);
        const row = await env.DB.prepare(
          'SELECT u.id, p.display_name, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id JOIN player_profiles p ON p.id = u.id WHERE s.id = ? AND s.expires_at > ?'
        ).bind(sessionId, now).first();
        // Verify the cookie token half matches sessions.token_hash. Without this,
        // anyone who knows a sessions.id could spoof the session by appending a
        // fake token half. SK-side validateSession already does this; the WS shim
        // forked off this code path and was missed.
        if (row && row.token_hash) {
          const expectedHash = await _sha256B64Url(token);
          if (_constantTimeEquals(expectedHash, row.token_hash)) {
            userId = row.id;
            displayName = row.display_name;
          }
        }
      }
    }

    // Guest fallback: use X-Guest-Id header or generate from URL param
    if (!userId) {
      const guestId = url.searchParams.get('guestId');
      if (!guestId) return new Response('Missing authentication or guest ID', { status: 400 });
      // Strict format guard: prevents unbounded / control-char / SQL-fragment IDs
      // from reaching downstream DO storage keys (worker/cards/cardRoom.ts grace:*
      // alarm iteration in particular).
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(guestId)) {
        return new Response('Invalid guest ID format', { status: 400 });
      }
      userId = 'guest_' + guestId;
      displayName = 'Guest_' + guestId.slice(0, 4);
    }

    // Forward to the appropriate DO with user info in custom headers
    const ns = env[doBinding];
    const id = ns.idFromName(room.toUpperCase());
    const stub = ns.get(id);
    const headers = new Headers(req.headers);
    // Strip any client-supplied trust headers before adding the server-derived ones.
    headers.delete('X-User-Id');
    headers.delete('X-Display-Name');
    headers.delete('X-Is-Guest');
    headers.delete('X-Player-Chips');
    headers.set('X-User-Id', userId);
    headers.set('X-Display-Name', displayName);
    headers.set('X-Is-Guest', userId.startsWith('guest_') ? 'true' : 'false');

    // For poker and casino games: load chip balance from D1
    if ((doBinding === 'POKER_ROOM' || doBinding === 'BLACKJACK_ROOM' || doBinding === 'ROULETTE_ROOM' || doBinding === 'BACCARAT_ROOM' || doBinding === 'LIARS_DICE_ROOM' || doBinding === 'COUP_ROOM') && userId && !userId.startsWith('guest_')) {
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
  wsPatch + '\nexport {\n  worker_default as default,\n  ImpostorRoom,\n  PresidentRoom,\n  ChaseTheQueenRoom,\n  ConnectFourRoom,\n  WavelengthRoom,\n  PokerRoom,\n  SnapRoom,\n  BlackjackRoom,\n  RouletteRoom,\n  BaccaratRoom,\n  LiarsDiceRoom,\n  CoupRoom\n};'
);

writeFileSync(WORKER_PATH, code);
console.log('Patched worker/index.js with DO export + WS upgrade + auth handler');
