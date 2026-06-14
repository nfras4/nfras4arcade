import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COSMETICS,
  type CosmeticPayload,
} from '../../../../../worker/shared/cosmetics.js';
import { type HatId } from '../rig.js';

// ── Unit: CosmeticPayload shape ───────────────────────────────────────────────

describe('CosmeticPayload (hat slot)', () => {
  it('accepts hatId: null on a payload literal', () => {
    const payload: CosmeticPayload = {
      frameSvg: null,
      emblemSvg: null,
      nameColour: null,
      titleBadgeId: null,
      titleText: null,
      hatId: null,
    };
    expect(payload.hatId).toBeNull();
  });

  it('accepts hatId: string on a payload literal', () => {
    const payload: CosmeticPayload = {
      frameSvg: null,
      emblemSvg: null,
      nameColour: null,
      titleBadgeId: null,
      titleText: null,
      hatId: 'party',
    };
    expect(payload.hatId).toBe('party');
  });
});

// ── Unit: DEFAULT_COSMETICS ───────────────────────────────────────────────────

describe('DEFAULT_COSMETICS', () => {
  it('has hatId === null', () => {
    expect(DEFAULT_COSMETICS.hatId).toBeNull();
  });

  it('has all nullable cosmetic fields set to null', () => {
    expect(DEFAULT_COSMETICS.frameSvg).toBeNull();
    expect(DEFAULT_COSMETICS.emblemSvg).toBeNull();
    expect(DEFAULT_COSMETICS.nameColour).toBeNull();
    expect(DEFAULT_COSMETICS.titleBadgeId).toBeNull();
    expect(DEFAULT_COSMETICS.titleText).toBeNull();
  });
});

// ── Unit: HatId union members ─────────────────────────────────────────────────

describe('HatId union', () => {
  it('accepts all five seeded hat ids as valid HatId members', () => {
    // If any id is not in the union, TypeScript will emit a compile-time error.
    const ids: HatId[] = ['party', 'top_hat', 'beanie', 'sombrero', 'crown'];
    expect(ids).toHaveLength(5);
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });

  it('includes "none" as the no-hat sentinel', () => {
    const noHat: HatId = 'none';
    expect(noHat).toBe('none');
  });
});
