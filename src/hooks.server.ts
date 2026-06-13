import type { Handle } from '@sveltejs/kit';
import { getTokenFromCookie, validateSession } from '$lib/server/auth/session';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // canvas-confetti spawns a blob: Web Worker for off-main-thread particles;
  // without worker-src it falls back to script-src and gets blocked at win moments.
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self' wss://arcade.nickwfraser.dev wss://*.workers.dev",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const handle: Handle = async ({ event, resolve }) => {
  const token = getTokenFromCookie(event.request);
  if (token && event.platform?.env?.DB) {
    event.locals.user = await validateSession(event.platform.env.DB, token);
  } else {
    event.locals.user = null;
  }
  const response = await resolve(event);
  response.headers.set('Content-Security-Policy', CSP);
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // microphone=(self) is required for the Phase 3 voice feature (getUserMedia
  // for WebRTC voice chat). Camera, geolocation, payment stay disallowed.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
  return response;
};
