import { describe, it, expect } from 'vitest';
import {
  buildRitual,
  FREEZE_DURATION,
  SPOTLIGHT_DURATION,
  SHOWDOWN_DURATION,
  REVEAL_STAGGER,
  HOLD_DURATION,
  VERDICT_DURATION,
  RESTORE_DURATION,
} from '../ritual.js';
import type { RoundResultLike } from '../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockResult(overrides?: Partial<RoundResultLike>): RoundResultLike {
  const defaults: RoundResultLike = {
    bid: { count: 5, face: 3, bidderId: 'accused' },
    actualCount: 3,
    callerId: 'caller',
    loserId: 'accused',
    revealedDice: {
      'caller': [2, 3, 4],
      'accused': [3, 5, 6],
      'player3': [1, 2, 3],
    },
  };
  return { ...defaults, ...overrides };
}

// ─── Cue order and timing ──────────────────────────────────────────────────────

describe('buildRitual', () => {
  it('returns cues in correct order: FREEZE, SPOTLIGHT, SHOWDOWN, REVEAL_PULSE..., HOLD, VERDICT, RESTORE', () => {
    const result = createMockResult();
    const revealOrder = ['caller', 'accused', 'player3'];
    const cues = buildRitual(result, revealOrder);

    const kinds = cues.map((c) => c.cue.kind);
    expect(kinds[0]).toBe('FREEZE');
    expect(kinds[1]).toBe('SPOTLIGHT');
    expect(kinds[2]).toBe('SHOWDOWN');
    expect(kinds[3]).toBe('REVEAL_PULSE');
    expect(kinds[4]).toBe('REVEAL_PULSE');
    expect(kinds[5]).toBe('REVEAL_PULSE');
    expect(kinds[6]).toBe('HOLD');
    expect(kinds[7]).toBe('VERDICT');
    expect(kinds[8]).toBe('RESTORE');
  });

  it('2-player reveal has correct cue count and timing', () => {
    const result = createMockResult({ revealedDice: { 'p1': [1, 2], 'p2': [3, 4] } });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder);

    // FREEZE, SPOTLIGHT, SHOWDOWN, 2xREVEAL_PULSE, HOLD, VERDICT, RESTORE = 8 cues
    expect(cues).toHaveLength(8);

    // Check timings
    expect(cues[0].at).toBe(0);
    expect(cues[0].duration).toBe(FREEZE_DURATION);

    expect(cues[1].at).toBe(FREEZE_DURATION);
    expect(cues[1].duration).toBe(SPOTLIGHT_DURATION);

    expect(cues[2].at).toBe(FREEZE_DURATION + SPOTLIGHT_DURATION);
    expect(cues[2].duration).toBe(SHOWDOWN_DURATION);

    const showdownEnd = FREEZE_DURATION + SPOTLIGHT_DURATION + SHOWDOWN_DURATION;
    expect(cues[3].at).toBe(showdownEnd);
    expect(cues[3].duration).toBe(REVEAL_STAGGER);
    expect(cues[4].at).toBe(showdownEnd + REVEAL_STAGGER);
    expect(cues[4].duration).toBe(REVEAL_STAGGER);

    const holdAt = showdownEnd + 2 * REVEAL_STAGGER;
    expect(cues[5].at).toBe(holdAt);
    expect(cues[5].duration).toBe(HOLD_DURATION);

    const verdictAt = holdAt + HOLD_DURATION;
    expect(cues[6].at).toBe(verdictAt);
    expect(cues[6].duration).toBe(VERDICT_DURATION);

    const restoreAt = verdictAt + VERDICT_DURATION;
    expect(cues[7].at).toBe(restoreAt);
    expect(cues[7].duration).toBe(RESTORE_DURATION);
  });

  it('5-player reveal has correct timings (sanity check)', () => {
    const result = createMockResult({
      revealedDice: {
        'p1': [1, 2],
        'p2': [3, 4],
        'p3': [5, 6],
        'p4': [1, 1],
        'p5': [2, 2],
      },
    });
    const revealOrder = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const cues = buildRitual(result, revealOrder);

    // FREEZE, SPOTLIGHT, SHOWDOWN, 5xREVEAL_PULSE, HOLD, VERDICT, RESTORE = 11 cues
    expect(cues).toHaveLength(11);

    // Total ritual duration for 5 players
    const expectedTotal =
      FREEZE_DURATION +
      SPOTLIGHT_DURATION +
      SHOWDOWN_DURATION +
      5 * REVEAL_STAGGER +
      HOLD_DURATION +
      VERDICT_DURATION +
      RESTORE_DURATION;
    // RESTORE cue ends at expectedTotal
    const lastCue = cues[cues.length - 1];
    expect(lastCue.at + lastCue.duration).toBe(expectedTotal);
    // Total should be ~10.3s
    expect(expectedTotal).toBeGreaterThan(10000);
    expect(expectedTotal).toBeLessThan(11000);
  });
});

// ─── REVEAL_PULSE match counting ──────────────────────────────────────────────

describe('REVEAL_PULSE match counting', () => {
  it('counts exact face matches correctly', () => {
    const result = createMockResult({
      bid: { count: 5, face: 3, bidderId: 'accused' },
      revealedDice: {
        'p1': [3, 3, 4], // 2 matches
        'p2': [2, 3, 5], // 1 match
      },
    });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder);

    const p1Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p1') as any;
    expect(p1Pulse?.cue.kind).toBe('REVEAL_PULSE');
    expect(p1Pulse?.cue.matchCount).toBe(2);
    expect(p1Pulse?.cue.runningCount).toBe(2);

    const p2Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p2') as any;
    expect(p2Pulse?.cue.kind).toBe('REVEAL_PULSE');
    expect(p2Pulse?.cue.matchCount).toBe(1);
    expect(p2Pulse?.cue.runningCount).toBe(3); // cumulative
  });

  it('counts wild ones when onesWild=true and face !== 1', () => {
    const result = createMockResult({
      bid: { count: 4, face: 3, bidderId: 'accused' },
      revealedDice: {
        'p1': [3, 1, 1], // 1 explicit + 2 wild = 3 matches
        'p2': [1, 4, 5], // 1 wild = 1 match
      },
    });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder, { onesWild: true });

    const p1Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p1') as any;
    expect(p1Pulse?.cue.matchCount).toBe(3);
    expect(p1Pulse?.cue.runningCount).toBe(3);

    const p2Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p2') as any;
    expect(p2Pulse?.cue.matchCount).toBe(1);
    expect(p2Pulse?.cue.runningCount).toBe(4);
  });

  it('does not double-count ones when face=1 and onesWild=true', () => {
    const result = createMockResult({
      bid: { count: 3, face: 1, bidderId: 'accused' },
      revealedDice: {
        'p1': [1, 1, 5], // face=1 means ones are NOT wild, just exact matches
      },
    });
    const revealOrder = ['p1'];
    const cues = buildRitual(result, revealOrder, { onesWild: true });

    const p1Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p1') as any;
    expect(p1Pulse?.cue.matchCount).toBe(2); // Only exact 1s, not doubled
    expect(p1Pulse?.cue.runningCount).toBe(2);
  });

  it('onesWild=false treats ones as regular dice (no wild)', () => {
    const result = createMockResult({
      bid: { count: 4, face: 3, bidderId: 'accused' },
      revealedDice: {
        'p1': [3, 1, 1], // Only the 3 matches, ones do NOT count as wild
      },
    });
    const revealOrder = ['p1'];
    const cues = buildRitual(result, revealOrder, { onesWild: false });

    const p1Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p1') as any;
    expect(p1Pulse?.cue.matchCount).toBe(1);
    expect(p1Pulse?.cue.runningCount).toBe(1);
  });

  it('includes revealed dice array in each REVEAL_PULSE', () => {
    const result = createMockResult({
      revealedDice: {
        'p1': [2, 3, 4],
        'p2': [5, 6, 1],
      },
    });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder);

    const p1Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p1') as any;
    expect(p1Pulse?.cue.dice).toEqual([2, 3, 4]);

    const p2Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p2') as any;
    expect(p2Pulse?.cue.dice).toEqual([5, 6, 1]);
  });

  it('handles absent player in revealedDice as empty array', () => {
    const result = createMockResult({
      revealedDice: {
        'p1': [1, 2, 3],
        // p2 not in revealedDice
      },
    });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder);

    const p2Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE' && c.cue.playerId === 'p2') as any;
    expect(p2Pulse?.cue.dice).toEqual([]);
    expect(p2Pulse?.cue.matchCount).toBe(0);
  });
});

// ─── HOLD and VERDICT cues ────────────────────────────────────────────────────

describe('HOLD and VERDICT cues', () => {
  it('HOLD cue has bidCount and runningCount from final tally', () => {
    const result = createMockResult({
      bid: { count: 5, face: 3, bidderId: 'accused' },
      revealedDice: {
        'p1': [3, 3, 4],
        'p2': [2, 3, 5],
        'p3': [3, 4, 5], // 1 match
      },
    });
    const revealOrder = ['p1', 'p2', 'p3'];
    const cues = buildRitual(result, revealOrder);

    const holdCue = cues.find((c) => c.cue.kind === 'HOLD') as any;
    expect(holdCue?.cue.bidCount).toBe(5);
    expect(holdCue?.cue.runningCount).toBe(4); // 2 + 1 + 1
  });

  it('VERDICT cue has liarCaught=true when actualCount < bid.count', () => {
    const result = createMockResult({
      bid: { count: 5, face: 3, bidderId: 'accused' },
      actualCount: 3,
      revealedDice: { 'p1': [3, 3, 4], 'p2': [2, 3, 5] },
    });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder);

    const verdictCue = cues.find((c) => c.cue.kind === 'VERDICT') as any;
    expect(verdictCue?.cue.liarCaught).toBe(true);
    expect(verdictCue?.cue.actualCount).toBe(3);
    expect(verdictCue?.cue.bidCount).toBe(5);
  });

  it('VERDICT cue has liarCaught=false when actualCount >= bid.count', () => {
    const result = createMockResult({
      bid: { count: 3, face: 3, bidderId: 'accused' },
      actualCount: 4,
      revealedDice: { 'p1': [3, 3, 4], 'p2': [2, 3, 5] },
    });
    const revealOrder = ['p1', 'p2'];
    const cues = buildRitual(result, revealOrder);

    const verdictCue = cues.find((c) => c.cue.kind === 'VERDICT') as any;
    expect(verdictCue?.cue.liarCaught).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('RESTORE is always the last cue', () => {
    const result = createMockResult();
    const revealOrder = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const cues = buildRitual(result, revealOrder);

    const lastCue = cues[cues.length - 1];
    expect(lastCue.cue.kind).toBe('RESTORE');
  });

  it('stepIndex and totalSteps correctly track position in reveal cascade', () => {
    const result = createMockResult({
      revealedDice: {
        'p1': [1, 2],
        'p2': [3, 4],
        'p3': [5, 6],
      },
    });
    const revealOrder = ['p1', 'p2', 'p3'];
    const cues = buildRitual(result, revealOrder);

    const reveals = cues.filter((c) => c.cue.kind === 'REVEAL_PULSE') as any;
    expect(reveals[0].cue.stepIndex).toBe(0);
    expect(reveals[0].cue.totalSteps).toBe(3);
    expect(reveals[1].cue.stepIndex).toBe(1);
    expect(reveals[1].cue.totalSteps).toBe(3);
    expect(reveals[2].cue.stepIndex).toBe(2);
    expect(reveals[2].cue.totalSteps).toBe(3);
  });

  it('default onesWild is false when opts not provided', () => {
    const result = createMockResult({
      bid: { count: 4, face: 3, bidderId: 'accused' },
      revealedDice: { 'p1': [3, 1, 1] },
    });
    const revealOrder = ['p1'];
    const cues = buildRitual(result, revealOrder); // no opts

    const p1Pulse = cues.find((c) => c.cue.kind === 'REVEAL_PULSE') as any;
    expect(p1Pulse?.cue.matchCount).toBe(1); // ones do not count as wild
  });

  it('SHOWDOWN cue includes bid and onesWild', () => {
    const result = createMockResult({
      bid: { count: 5, face: 3, bidderId: 'accused' },
    });
    const revealOrder = ['p1'];
    const cues = buildRitual(result, revealOrder, { onesWild: true });

    const showdownCue = cues.find((c) => c.cue.kind === 'SHOWDOWN') as any;
    expect(showdownCue?.cue.bid).toEqual({ count: 5, face: 3, bidderId: 'accused' });
    expect(showdownCue?.cue.onesWild).toBe(true);
  });
});
