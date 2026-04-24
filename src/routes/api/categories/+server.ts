import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCategoriesWithDifficulty } from '../../../../worker/impostor/words';

export const GET: RequestHandler = async () => {
  return json(getCategoriesWithDifficulty(), {
    headers: { 'Cache-Control': 'no-cache, no-store' }
  });
};
