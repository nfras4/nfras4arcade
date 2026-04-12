import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CLAIM_AMOUNT = 500;
const COOLDOWN_MS = 86400000; // 24 hours

export const POST: RequestHandler = async ({ locals, platform }) => {
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
		return json({ error: 'Profile not found' }, { status: 404 });
	}

	const now = Date.now();
	const nowSec = Math.floor(now / 1000);
	const lastClaim = profile.last_chip_claim ? profile.last_chip_claim * 1000 : 0;

	if (lastClaim > 0 && now - lastClaim < COOLDOWN_MS) {
		return json({
			success: false,
			chips: profile.chips,
			nextClaimAt: lastClaim + COOLDOWN_MS,
		});
	}

	// Conditional UPDATE to prevent TOCTOU race (cooldown check in WHERE clause)
	const cooldownThreshold = nowSec - 86400;
	const result = await db
		.prepare(
			'UPDATE player_profiles SET chips = chips + ?, last_chip_claim = ?, updated_at = ? WHERE id = ? AND (last_chip_claim IS NULL OR last_chip_claim < ?)'
		)
		.bind(CLAIM_AMOUNT, nowSec, nowSec, locals.user.id, cooldownThreshold)
		.run();

	if (!result.meta.changes) {
		return json({
			success: false,
			chips: profile.chips,
			nextClaimAt: lastClaim + COOLDOWN_MS,
		});
	}

	const updated = await db
		.prepare('SELECT chips FROM player_profiles WHERE id = ?')
		.bind(locals.user.id)
		.first<{ chips: number }>();

	return json({
		success: true,
		chips: updated?.chips ?? profile.chips + CLAIM_AMOUNT,
		nextClaimAt: now + COOLDOWN_MS,
	});
};
