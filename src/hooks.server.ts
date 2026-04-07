import type { Handle } from '@sveltejs/kit';
import { getTokenFromCookie, validateSession } from '$lib/server/auth/session';

export const handle: Handle = async ({ event, resolve }) => {
  const token = getTokenFromCookie(event.request);
  if (token && event.platform?.env?.DB) {
    event.locals.user = await validateSession(event.platform.env.DB, token);
  } else {
    event.locals.user = null;
  }
  return resolve(event);
};
