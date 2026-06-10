import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

const ADMIN_EMAILS = new Set(['nickwfraser@gmail.com']);

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user || !ADMIN_EMAILS.has(locals.user.email)) {
    throw error(404, 'Not found');
  }
  return {};
};
