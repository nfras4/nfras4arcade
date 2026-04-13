import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CLAIM_AMOUNT = 50;
const COOLDOWN_MS = 3600000; // 1 hour

export const POST: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const db = platform?.env?.DB;
	if (!db) {
		return json({ error: 'Database unavailable' }, { status: 500 });
	}

	const profile = await db
		.prepare('SELECT chips, last_hourly_claim FROM player_profiles WHERE id = ?')
		.bind(locals.user.id)
		.first<{ chips: number; last_hourly_claim: number | null }>();

	if (!profile) {
		return json({ error: 'Profile not found' }, { status: 404 });
	}

	const now = Date.now();
	const nowSec = Math.floor(now / 1000);
	const lastClaim = profile.last_hourly_claim ? profile.last_hourly_claim * 1000 : 0;

	if (lastClaim > 0 && now - lastClaim < COOLDOWN_MS) {
		return json({
			success: false,
			chips: profile.chips,
			nextHourlyClaimAt: lastClaim + COOLDOWN_MS,
		});
	}

	const cooldownThreshold = nowSec - 3600;
	const result = await db
		.prepare(
			'UPDATE player_profiles SET chips = chips + ?, last_hourly_claim = ?, updated_at = ? WHERE id = ? AND (last_hourly_claim IS NULL OR last_hourly_claim < ?)'
		)
		.bind(CLAIM_AMOUNT, nowSec, nowSec, locals.user.id, cooldownThreshold)
		.run();

	if (!result.meta.changes) {
		return json({
			success: false,
			chips: profile.chips,
			nextHourlyClaimAt: lastClaim + COOLDOWN_MS,
		});
	}

	const updated = await db
		.prepare('SELECT chips FROM player_profiles WHERE id = ?')
		.bind(locals.user.id)
		.first<{ chips: number }>();

	return json({
		success: true,
		chips: updated?.chips ?? profile.chips + CLAIM_AMOUNT,
		nextHourlyClaimAt: now + COOLDOWN_MS,
	});
};
