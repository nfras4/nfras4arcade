import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    const returnTo = '/pair' + url.search;
    throw redirect(302, '/login?return=' + encodeURIComponent(returnTo));
  }
  return { user: locals.user };
};
