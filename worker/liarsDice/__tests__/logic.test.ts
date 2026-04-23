import { describe, test, expect } from 'bun:test';
import {
  validateBid,
  countBidFace,
  decideLiarsDiceAction,
  nextInTurnOrder,
} from '../logic';

// Seeded PRNG using xmur3 -> sfc32 for reproducible bot behavior tests.
function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h = (h ^= h >>> 16) >>> 0);
  let b = (h = Math.imul(h ^ 0x9e3779b9, 0x85ebca6b)) >>> 0;
  let c = (h = Math.imul(h ^ 0xc2b2ae35, 0x27d4eb2f)) >>> 0;
  let d = (h = (h + 1) | 0) >>> 0;
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

describe('validateBid', () => {
  test('allows higher count with same face', () => {
    expect(validateBid(4, 3, 10, { count: 3, face: 3 })).toBeNull();
  });

  test('allows higher count with higher face', () => {
    expect(validateBid(5, 6, 10, { count: 3, face: 3 })).toBeNull();
  });

  test('allows same count with higher face', () => {
    expect(validateBid(3, 5, 10, { count: 3, face: 3 })).toBeNull();
  });

  test('rejects higher count with lower face (strict rule)', () => {
    expect(validateBid(5, 2, 10, { count: 3, face: 6 })).not.toBeNull();
    expect(validateBid(4, 1, 10, { count: 3, face: 2 })).not.toBeNull();
  });

  test('rejects lower count raise', () => {
    expect(validateBid(2, 6, 10, { count: 3, face: 3 })).not.toBeNull();
  });

  test('rejects same count same face', () => {
    expect(validateBid(3, 3, 10, { count: 3, face: 3 })).not.toBeNull();
  });

  test('rejects same count lower face', () => {
    expect(validateBid(3, 2, 10, { count: 3, face: 5 })).not.toBeNull();
  });

  test('rejects count greater than total dice', () => {
    expect(validateBid(11, 3, 10, null)).not.toBeNull();
  });

  test('rejects count below 1', () => {
    expect(validateBid(0, 3, 10, null)).not.toBeNull();
    expect(validateBid(-1, 3, 10, null)).not.toBeNull();
  });

  test('rejects face outside 1..6', () => {
    expect(validateBid(1, 0, 10, null)).not.toBeNull();
    expect(validateBid(1, 7, 10, null)).not.toBeNull();
  });

  test('accepts first bid with no prior bid', () => {
    expect(validateBid(1, 1, 10, null)).toBeNull();
    expect(validateBid(5, 6, 10, null)).toBeNull();
  });

  test('rejects non-integer count', () => {
    expect(validateBid(1.5, 3, 10, null)).not.toBeNull();
  });
});

describe('countBidFace', () => {
  test('onesWild false counts exact face only', () => {
    expect(countBidFace([1, 2, 3, 3, 6], 3, false)).toBe(2);
    expect(countBidFace([1, 1, 1], 3, false)).toBe(0);
  });

  test('onesWild true counts ones as wild for non-1 face', () => {
    expect(countBidFace([1, 2, 3, 3, 6], 3, true)).toBe(3);
    expect(countBidFace([1, 1, 1], 3, true)).toBe(3);
  });

  test('onesWild true with face=1 does not double-count', () => {
    expect(countBidFace([1, 1, 3, 6], 1, true)).toBe(2);
    expect(countBidFace([3, 6], 1, true)).toBe(0);
  });

  test('empty dice returns 0', () => {
    expect(countBidFace([], 3, true)).toBe(0);
    expect(countBidFace([], 3, false)).toBe(0);
  });
});

describe('nextInTurnOrder', () => {
  test('advances to the next id', () => {
    expect(nextInTurnOrder(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextInTurnOrder(['a', 'b', 'c'], 'b')).toBe('c');
  });

  test('wraps around', () => {
    expect(nextInTurnOrder(['a', 'b', 'c'], 'c')).toBe('a');
  });

  test('missing current id falls back to first', () => {
    expect(nextInTurnOrder(['a', 'b', 'c'], 'z')).toBe('a');
    expect(nextInTurnOrder(['a', 'b', 'c'], null)).toBe('a');
  });

  test('empty turn order returns null', () => {
    expect(nextInTurnOrder([], 'a')).toBeNull();
  });
});

describe('decideLiarsDiceAction', () => {
  test('opens with highest own face count when no current bid', () => {
    const d = decideLiarsDiceAction({
      ownDice: [3, 3, 3, 4, 5],
      totalDice: 10,
      currentBid: null,
      onesWild: false,
    });
    expect(d.action).toBe('bid');
    if (d.action === 'bid') {
      expect(d.face).toBe(3);
      expect(d.count).toBeGreaterThanOrEqual(1);
    }
  });

  test('never calls liar when own dice already satisfy the bid', () => {
    const d = decideLiarsDiceAction({
      ownDice: [3, 3, 3, 3, 3],
      totalDice: 10,
      currentBid: { count: 3, face: 3 },
      onesWild: false,
      random: () => 0,
    });
    expect(d.action).toBe('bid');
  });

  test('calls liar when bid is wildly implausible', () => {
    // Bid of 15 sixes but bot has no sixes - call expected
    const d = decideLiarsDiceAction({
      ownDice: [1, 2, 3, 4, 5],
      totalDice: 15,
      currentBid: { count: 15, face: 6 },
      onesWild: false,
      random: () => 0.5,
    });
    expect(d.action).toBe('call_liar');
  });

  test('never returns a bid with count > totalDice', () => {
    for (let i = 0; i < 30; i++) {
      const random = seeded(`case-${i}`);
      const d = decideLiarsDiceAction({
        ownDice: [3, 3, 4, 5, 6],
        totalDice: 5,
        currentBid: { count: 5, face: 6 },
        onesWild: false,
        random,
      });
      if (d.action === 'bid') {
        expect(d.count).toBeLessThanOrEqual(5);
      }
    }
  });

  test('calls liar at least once across 20 implausible seeded runs', () => {
    let calls = 0;
    for (let i = 0; i < 20; i++) {
      const random = seeded(`call-${i}`);
      const d = decideLiarsDiceAction({
        ownDice: [2, 2, 4, 5, 6],
        totalDice: 10,
        currentBid: { count: 8, face: 3 },
        onesWild: false,
        random,
      });
      if (d.action === 'call_liar') calls++;
    }
    expect(calls).toBeGreaterThan(0);
  });

  test('onesWild treats 1s as wild when estimating non-1 face', () => {
    // Bot has four 1s and a 2, ones-wild. Bid of 5 threes includes ~4 wild matches
    // from bot's own hand plus probability from unseen. Should NOT call liar.
    const d = decideLiarsDiceAction({
      ownDice: [1, 1, 1, 1, 2],
      totalDice: 10,
      currentBid: { count: 5, face: 3 },
      onesWild: true,
      random: () => 0.5,
    });
    expect(d.action).toBe('bid');
  });
});
