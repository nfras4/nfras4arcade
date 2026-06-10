import type { Handle } from '@sveltejs/kit';
import { getTokenFromCookie, validateSession } from '$lib/server/auth/session';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
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
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  return response;
};
