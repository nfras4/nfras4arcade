// Cosmetic tier → tint treatment lookup.
//
// Keyed by the frameSvg URL the rest of the app already passes around, so
// call sites don't need to change. The SVG asset contents are no longer
// rendered as border-image; the URL acts purely as a tier identifier.
//
// Tiers progressively layer decoration on a shared left-to-right linear
// fade: bronze is a clean tint fade, silver adds diagonal line texture,
// gold adds a soft shimmer highlight. Unknown URLs get a neutral fallback
// so custom / future frames render as a plain tinted fade rather than
// reverting to the old chunky border-image.

export type CosmeticTier = 'bronze' | 'silver' | 'gold' | 'none';
export type TintPattern = 'none' | 'diagonals' | 'shimmer';

export interface TintSpec {
	tier: CosmeticTier;
	tintRgb: string;
	opacity: number;
	pattern: TintPattern;
}

const TIER_SPECS: Record<string, TintSpec> = {
	'/cosmetics/frames/bronze.svg': {
		tier: 'bronze',
		tintRgb: '166 124 82',
		opacity: 0.21,
		pattern: 'none'
	},
	'/cosmetics/frames/silver.svg': {
		tier: 'silver',
		tintRgb: '192 192 192',
		opacity: 0.25,
		pattern: 'diagonals'
	},
	'/cosmetics/frames/gold.svg': {
		tier: 'gold',
		tintRgb: '255 215 0',
		opacity: 0.28,
		pattern: 'shimmer'
	}
};

const FALLBACK: TintSpec = {
	tier: 'none',
	tintRgb: '107 114 128',
	opacity: 0.21,
	pattern: 'none'
};

export function resolveTint(frameSvg: string | null | undefined): TintSpec | null {
	if (!frameSvg) return null;
	return TIER_SPECS[frameSvg] ?? FALLBACK;
}
