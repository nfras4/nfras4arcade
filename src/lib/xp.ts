export function xpToLevel(xp: number): number {
	if (xp <= 0) return 1;
	return Math.floor((-1 + Math.sqrt(1 + (8 * xp) / 100)) / 2) + 1;
}

export function levelXpThreshold(level: number): number {
	return ((level - 1) * level / 2) * 100;
}

export function xpProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
	const level = xpToLevel(xp);
	const currentThreshold = levelXpThreshold(level);
	const nextThreshold = levelXpThreshold(level + 1);
	const current = xp - currentThreshold;
	const needed = nextThreshold - currentThreshold;
	const percent = needed > 0 ? Math.min(100, Math.round((current / needed) * 100)) : 100;
	return { level, current, needed, percent };
}
