import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const COOLDOWN_MS = 86400000; // 24 hours

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const profile = await db
		.prepare('SELECT chips, last_chip_claim FROM player_profiles WHERE id = ?')
		.bind(locals.user.id)
		.first<{ chips: number; last_chip_claim: number | null }>();

	if (!profile) {
		return json({ chips: 0, canClaim: false, nextClaimAt: null });
	}

	const now = Date.now();
	const lastClaim = profile.last_chip_claim ? profile.last_chip_claim * 1000 : 0;
	const canClaim = lastClaim === 0 || now - lastClaim >= COOLDOWN_MS;
	const nextClaimAt = lastClaim === 0 ? null : lastClaim + COOLDOWN_MS;

	return json({ chips: profile.chips, canClaim, nextClaimAt });
};
