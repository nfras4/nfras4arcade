import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCategories } from '../../../../worker/impostor/words';

export const GET: RequestHandler = async () => {
  return json(getCategories());
};
