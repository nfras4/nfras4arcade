/**
 * Fuzz test suite for holeCardsGesture pure functions.
 *
 * Uses a fixed-seed mulberry32 PRNG for full reproducibility.
 * 50 000 generated cases per fuzzer as required.
 *
 * Invariants under test:
 *   I1  isTap === true  =>  shouldCommit === false
 *   I2  shouldCommit === true  =>  isPlayerTurn === true
 *   I3  zone === 'rest'  =>  shouldCommit === false
 *   I4  velocity is finite (not NaN, not Infinity)
 *   I5  zone is one of 'rest' | 'lift' | 'armed'
 *   I6  shouldCommit(touch) === true  =>  shouldCommit(pointer) === true
 *   I7  tap takes precedence over releaseEvent.overMuck (even in armed zone)
 *
 *   V1  empty buffer  =>  computeVelocity returns 0
 *   V2  single-sample buffer  =>  returns 0
 *   V3  all-stale buffer  =>  returns 0
 *   V4  return value is always finite
 *   V5  sign of velocity matches sign of (oldest.y - latest.y) when dt > 0
 */

import { describe, it, expect } from 'bun:test';
import {
  evaluateGesture,
  computeVelocity,
  VELOCITY_BUFFER_MS,
  FLICK_VELOCITY_TOUCH,
  FLICK_VELOCITY_POINTER,
} from '../src/lib/utils/holeCardsGesture';
import type { GestureInput, VelocitySample } from '../src/lib/utils/holeCardsGesture';

// ---------------------------------------------------------------------------
// Mulberry32 PRNG -- fixed seed, no external deps
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0xdeadbeef;

// ---------------------------------------------------------------------------
// Helper: range-mapped random values
// ---------------------------------------------------------------------------

function randFloat(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

function randBool(rng: () => number): boolean {
  return rng() < 0.5;
}

function randInputMode(rng: () => number): 'touch' | 'pointer' {
  return rng() < 0.5 ? 'touch' : 'pointer';
}

/**
 * Generate a pseudo-random velocity buffer.
 * sampleCount in [0, maxSamples].
 * Occasionally all stale, occasionally all fresh, usually mixed.
 */
function randBuffer(
  rng: () => number,
  maxSamples: number,
  now: number,
): VelocitySample[] {
  const count = Math.floor(rng() * (maxSamples + 1));
  const samples: VelocitySample[] = [];
  for (let i = 0; i < count; i++) {
    // Spread timestamps from (now - 200) to now so we get stale and fresh
    const t = now - randFloat(rng, 0, 200);
    const y = randFloat(rng, -200, 1500);
    samples.push({ t, y });
  }
  // Sort ascending by time (oldest first) to match expected buffer ordering
  samples.sort((a, b) => a.t - b.t);
  return samples;
}

/**
 * Build a minimal GestureInput from random values.
 * viewportHeight occasionally 0 to exercise the divide-by-zero guard.
 */
function randGestureInput(rng: () => number): GestureInput {
  const startY = randFloat(rng, 0, 1500);
  const currentY = randFloat(rng, -500, 1500);
  const startTime = randFloat(rng, 0, 100000);
  const now = startTime + randFloat(rng, 0, 5000);

  // 2% chance of viewportHeight = 0 to test divide-by-zero guard
  const viewportHeight = rng() < 0.02 ? 0 : randFloat(rng, 200, 2000);

  const isPlayerTurn = randBool(rng);
  const inputMode = randInputMode(rng);

  const velocityBuffer = randBuffer(rng, 30, now);

  // releaseEvent: 33% undefined, 33% {overMuck:false}, 33% {overMuck:true}
  const re = rng();
  const releaseEvent =
    re < 0.33 ? undefined : { overMuck: re < 0.67 ? false : true };

  return {
    startY,
    currentY,
    startTime,
    now,
    viewportHeight,
    isPlayerTurn,
    inputMode,
    velocityBuffer,
    releaseEvent,
  };
}

// ---------------------------------------------------------------------------
// Fuzz: evaluateGesture invariants  (50 000 cases)
// ---------------------------------------------------------------------------

const FUZZ_COUNT = 50_000;
const VALID_ZONES = new Set(['rest', 'lift', 'armed']);

describe('fuzz: evaluateGesture invariants', () => {
  it(`holds all invariants across ${FUZZ_COUNT} random inputs`, () => {
    const rng = mulberry32(SEED);

    // Accumulators for failures -- collect first example per invariant
    const failures: Record<string, { input: GestureInput; detail: string } | null> = {
      I1: null,
      I2: null,
      I3: null,
      I4: null,
      I5: null,
      I6: null,
      I7: null,
    };

    for (let i = 0; i < FUZZ_COUNT; i++) {
      const input = randGestureInput(rng);
      const out = evaluateGesture(input);

      // I1: isTap => !shouldCommit
      if (out.isTap && out.shouldCommit && failures.I1 === null) {
        failures.I1 = {
          input,
          detail: `isTap=${out.isTap} shouldCommit=${out.shouldCommit}`,
        };
      }

      // I2: shouldCommit => isPlayerTurn
      if (out.shouldCommit && !input.isPlayerTurn && failures.I2 === null) {
        failures.I2 = {
          input,
          detail: `shouldCommit=true but isPlayerTurn=false`,
        };
      }

      // I3: zone='rest' => !shouldCommit
      if (out.zone === 'rest' && out.shouldCommit && failures.I3 === null) {
        failures.I3 = {
          input,
          detail: `zone=rest but shouldCommit=true`,
        };
      }

      // I4: velocity is finite
      if (!isFinite(out.velocity) && failures.I4 === null) {
        failures.I4 = {
          input,
          detail: `velocity=${out.velocity} is not finite`,
        };
      }

      // I5: zone is a known string
      if (!VALID_ZONES.has(out.zone) && failures.I5 === null) {
        failures.I5 = {
          input,
          detail: `zone="${out.zone}" is not a valid GestureZone`,
        };
      }

      // I6: shouldCommit(touch) => shouldCommit(pointer)
      // Run the same input twice -- once with touch, once with pointer.
      // If touch commits, pointer (lower threshold) must also commit.
      {
        const touchInput: GestureInput = { ...input, inputMode: 'touch' };
        const pointerInput: GestureInput = { ...input, inputMode: 'pointer' };
        const touchOut = evaluateGesture(touchInput);
        const pointerOut = evaluateGesture(pointerInput);
        if (touchOut.shouldCommit && !pointerOut.shouldCommit && failures.I6 === null) {
          failures.I6 = {
            input,
            detail:
              `shouldCommit=true in touch mode but false in pointer mode. ` +
              `velocity=${touchOut.velocity} touchThreshold=${FLICK_VELOCITY_TOUCH} pointerThreshold=${FLICK_VELOCITY_POINTER}`,
          };
        }
      }

      // I7: tap takes precedence over releaseEvent.overMuck in armed zone
      // Construct an armed-zone tap with overMuck=true; shouldCommit must be false.
      {
        const viewportHeight = input.viewportHeight > 0 ? input.viewportHeight : 800;
        const tapInput: GestureInput = {
          ...input,
          // Very small movement: tap
          startY: 500,
          currentY: 500 - 3, // 3px < TAP_MOVEMENT_PX=8
          startTime: input.now - 50, // 50ms < TAP_DURATION_MS=200
          viewportHeight,
          // But drag fraction after startY adjustment: armed zone requires fraction >= 0.40
          // fraction = (500 - 497) / vh = 3/vh which is tiny -> rest zone (that's fine)
          // The invariant is: tap => no commit regardless of overMuck
          releaseEvent: { overMuck: true },
          isPlayerTurn: true,
          velocityBuffer: [], // no flick
        };
        const tapOut = evaluateGesture(tapInput);
        if (tapOut.isTap && tapOut.shouldCommit && failures.I7 === null) {
          failures.I7 = {
            input: tapInput,
            detail: `tap with overMuck=true and isPlayerTurn=true produced shouldCommit=true`,
          };
        }
      }
    }

    // Build a human-readable failure report
    const failedInvariants = Object.entries(failures).filter(([, v]) => v !== null);

    if (failedInvariants.length > 0) {
      const report = failedInvariants
        .map(([key, v]) => {
          const snap = JSON.stringify(v!.input, null, 2);
          return `\n  [${key}] ${v!.detail}\n  Reproducer input:\n${snap}`;
        })
        .join('\n');
      // Fail with full details
      expect(failedInvariants.length).toBe(0);
      // The line above will throw; this is unreachable but documents intent.
      throw new Error(`Invariant violations found:${report}`);
    }

    // If we reach here all invariants held for all cases.
    expect(failedInvariants.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fuzz: computeVelocity invariants  (50 000 cases)
// ---------------------------------------------------------------------------

describe('fuzz: computeVelocity invariants', () => {
  it(`V1/V2/V3/V4/V5 hold across ${FUZZ_COUNT} random buffer inputs`, () => {
    const rng = mulberry32(SEED + 1); // different seed from evaluateGesture fuzz

    const failures: Record<string, { buffer: VelocitySample[]; now: number; detail: string } | null> = {
      V1: null,
      V2: null,
      V3: null,
      V4: null,
      V5: null,
    };

    for (let i = 0; i < FUZZ_COUNT; i++) {
      const now = randFloat(rng, 0, 200000);
      const sampleType = rng(); // 0-0.1 empty, 0.1-0.2 single, 0.2-0.3 all-stale, else mixed

      let buffer: VelocitySample[];

      if (sampleType < 0.1) {
        // V1: empty buffer
        buffer = [];
        const result = computeVelocity(buffer, now);
        if (result !== 0 && failures.V1 === null) {
          failures.V1 = { buffer, now, detail: `empty buffer returned ${result}, expected 0` };
        }
      } else if (sampleType < 0.2) {
        // V2: single-sample buffer
        buffer = [{ t: now - randFloat(rng, 0, VELOCITY_BUFFER_MS - 1), y: randFloat(rng, 0, 1000) }];
        const result = computeVelocity(buffer, now);
        if (result !== 0 && failures.V2 === null) {
          failures.V2 = { buffer, now, detail: `single-sample buffer returned ${result}, expected 0` };
        }
      } else if (sampleType < 0.3) {
        // V3: all samples stale (older than VELOCITY_BUFFER_MS)
        const count = 1 + Math.floor(rng() * 10);
        buffer = Array.from({ length: count }, () => ({
          t: now - randFloat(rng, VELOCITY_BUFFER_MS + 1, VELOCITY_BUFFER_MS + 500),
          y: randFloat(rng, 0, 1000),
        }));
        const result = computeVelocity(buffer, now);
        if (result !== 0 && failures.V3 === null) {
          failures.V3 = { buffer, now, detail: `all-stale buffer returned ${result}, expected 0` };
        }
      } else {
        // General case: mixed buffer
        buffer = randBuffer(rng, 50, now);
        const result = computeVelocity(buffer, now);

        // V4: must be finite
        if (!isFinite(result) && failures.V4 === null) {
          failures.V4 = { buffer, now, detail: `result=${result} is not finite` };
        }

        // V5: sign check -- prune manually to replicate internal logic
        const cutoff = now - VELOCITY_BUFFER_MS;
        const pruned = buffer.filter(s => s.t >= cutoff);
        if (pruned.length >= 2) {
          const oldest = pruned[0];
          const latest = pruned[pruned.length - 1];
          const dt = latest.t - oldest.t;
          if (dt > 0) {
            const expectedSign = Math.sign(oldest.y - latest.y);
            const actualSign = Math.sign(result);
            // If expectedSign is 0 the velocity must also be 0; otherwise signs must match.
            const signMismatch =
              expectedSign === 0 ? result !== 0 : actualSign !== 0 && actualSign !== expectedSign;
            if (signMismatch && failures.V5 === null) {
              failures.V5 = {
                buffer,
                now,
                detail:
                  `sign mismatch: oldest.y=${oldest.y} latest.y=${latest.y} ` +
                  `expected sign=${expectedSign} got result=${result} (sign=${actualSign})`,
              };
            }
          }
        }
      }
    }

    const failedInvariants = Object.entries(failures).filter(([, v]) => v !== null);

    if (failedInvariants.length > 0) {
      const report = failedInvariants
        .map(([key, v]) => {
          const bufSnap = JSON.stringify(v!.buffer);
          return `\n  [${key}] ${v!.detail}\n  buffer=${bufSnap}  now=${v!.now}`;
        })
        .join('\n');
      expect(failedInvariants.length).toBe(0);
      throw new Error(`computeVelocity invariant violations:${report}`);
    }

    expect(failedInvariants.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Dedicated edge-case tests for I6 (threshold implication) and I7 (tap precedence)
// ---------------------------------------------------------------------------

describe('evaluateGesture - I6: pointer-commits-when-touch-commits', () => {
  it('a velocity between pointer and touch thresholds commits in pointer but not touch', () => {
    // This is the EXPECTED difference, not a violation.
    // The invariant is: touch commits => pointer commits (inverse direction).
    const velocityAbovePointerBelowTouch =
      (FLICK_VELOCITY_POINTER + FLICK_VELOCITY_TOUCH) / 2; // 1.0 px/ms
    const nowMs = 5000;
    const dt = 40; // ms, well within VELOCITY_BUFFER_MS=50
    const dy = velocityAbovePointerBelowTouch * dt; // 40px
    const buffer: VelocitySample[] = [
      { t: nowMs - dt, y: 600 },
      { t: nowMs, y: 600 - dy },
    ];
    const base: GestureInput = {
      startY: 600,
      currentY: 600 - 300, // lift zone (37.5% of 800)
      startTime: nowMs - 1000,
      now: nowMs,
      viewportHeight: 800,
      isPlayerTurn: true,
      inputMode: 'touch',
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    };
    const touchOut = evaluateGesture(base);
    const pointerOut = evaluateGesture({ ...base, inputMode: 'pointer' });
    // touch should NOT commit (below touch threshold)
    expect(touchOut.shouldCommit).toBe(false);
    // pointer SHOULD commit (above pointer threshold)
    expect(pointerOut.shouldCommit).toBe(true);
    // Invariant satisfied: touch doesn't commit, so no implication to check.
  });

  it('a velocity above BOTH thresholds commits in both modes', () => {
    const velocityAboveBoth = FLICK_VELOCITY_TOUCH + 0.5; // 1.7 px/ms
    const nowMs = 5000;
    const dt = 40;
    const dy = velocityAboveBoth * dt;
    const buffer: VelocitySample[] = [
      { t: nowMs - dt, y: 600 },
      { t: nowMs, y: 600 - dy },
    ];
    const base: GestureInput = {
      startY: 600,
      currentY: 600 - 300,
      startTime: nowMs - 1000,
      now: nowMs,
      viewportHeight: 800,
      isPlayerTurn: true,
      inputMode: 'touch',
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    };
    expect(evaluateGesture(base).shouldCommit).toBe(true);
    expect(evaluateGesture({ ...base, inputMode: 'pointer' }).shouldCommit).toBe(true);
  });
});

describe('evaluateGesture - I7: tap precedence over overMuck in armed zone', () => {
  it('tap in armed zone with overMuck=true does not commit', () => {
    // Armed zone: fraction >= 0.40. With startY=500, vh=400, need currentY <= 500 - 160 = 340.
    // But tap requires movement < 8px. These two are contradictory for a genuine armed+tap
    // unless the armed zone is reached some other way (which it cannot be with tiny movement).
    // Correct interpretation: when isTap=true, shouldCommit=false regardless of zone/overMuck.
    // Zone during a tap will be 'rest' or 'lift' only (movement < 8px means tiny fraction).
    // We test the invariant: any combination that produces isTap=true must not produce shouldCommit=true.
    const input: GestureInput = {
      startY: 600,
      currentY: 600 - 5, // 5px movement, clearly a tap
      startTime: 2000,
      now: 2050, // 50ms duration
      viewportHeight: 800,
      isPlayerTurn: true,
      inputMode: 'touch',
      velocityBuffer: [],
      releaseEvent: { overMuck: true },
    };
    const out = evaluateGesture(input);
    expect(out.isTap).toBe(true);
    expect(out.shouldCommit).toBe(false);
  });

  it('tap detection is not broken by a high-velocity buffer', () => {
    // Even if velocity would normally flick-commit, tap detection blocks shouldCommit
    const nowMs = 3000;
    const buffer: VelocitySample[] = [
      { t: nowMs - 40, y: 600 },
      { t: nowMs, y: 600 - 120 }, // 3.0 px/ms -- well above both thresholds
    ];
    const input: GestureInput = {
      startY: 600,
      currentY: 600 - 5, // tiny movement: tap
      startTime: nowMs - 50,
      now: nowMs,
      viewportHeight: 800,
      isPlayerTurn: true,
      inputMode: 'touch',
      velocityBuffer: buffer,
      releaseEvent: { overMuck: true },
    };
    const out = evaluateGesture(input);
    expect(out.isTap).toBe(true);
    expect(out.shouldCommit).toBe(false);
  });
});
