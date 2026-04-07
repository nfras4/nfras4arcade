import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Import the word categories directly (pure TS, no runtime deps)
const categories = [
  'Clash Royale Cards', 'Animals', 'Food & Drinks', 'Movies & Shows',
  'Professions', 'Sports', 'Landmarks', 'Video Games'
];

export const GET: RequestHandler = async () => {
  return json(categories);
};
