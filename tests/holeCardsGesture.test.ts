import { describe, it, expect } from 'bun:test';
import {
  evaluateGesture,
  computeVelocity,
  LIFT_MAX,
  ARM_THRESHOLD,
  FLICK_VELOCITY_TOUCH,
  FLICK_VELOCITY_POINTER,
  TAP_MOVEMENT_PX,
  TAP_DURATION_MS,
  VELOCITY_BUFFER_MS,
} from '../src/lib/utils/holeCardsGesture';
import type { GestureInput, VelocitySample } from '../src/lib/utils/holeCardsGesture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal GestureInput with sensible defaults. Override any field. */
function makeInput(overrides: Partial<GestureInput> = {}): GestureInput {
  return {
    startY: 600,
    currentY: 600,
    startTime: 1000,
    now: 1100,
    viewportHeight: 800,
    isPlayerTurn: true,
    inputMode: 'touch',
    velocityBuffer: [],
    releaseEvent: undefined,
    ...overrides,
  };
}

/**
 * Build a velocity buffer whose samples span exactly `durationMs` and
 * produce the requested upward velocity (px/ms).
 * Upward = currentY decreasing over time.
 */
function makeBuffer(
  nowMs: number,
  velocityPxPerMs: number,
  durationMs: number = VELOCITY_BUFFER_MS - 1,
): VelocitySample[] {
  const oldest = { t: nowMs - durationMs, y: 600 };
  const latest = { t: nowMs, y: oldest.y - velocityPxPerMs * durationMs };
  return [oldest, latest];
}

// ---------------------------------------------------------------------------
// evaluateGesture - tap detection
// ---------------------------------------------------------------------------

describe('evaluateGesture - tap detection', () => {
  it('returns isTap=true when movement and duration are both below thresholds', () => {
    const input = makeInput({
      startY: 600,
      currentY: 600 - (TAP_MOVEMENT_PX - 1), // movement = 7px, below 8
      startTime: 1000,
      now: 1000 + (TAP_DURATION_MS - 1), // duration = 199ms, below 200
    });
    const out = evaluateGesture(input);
    expect(out.isTap).toBe(true);
  });

  it('returns shouldCommit=false for a tap even with isPlayerTurn=true and releaseEvent', () => {
    const input = makeInput({
      startY: 600,
      currentY: 600 - (TAP_MOVEMENT_PX - 1),
      startTime: 1000,
      now: 1000 + (TAP_DURATION_MS - 1),
      releaseEvent: { overMuck: true },
    });
    const out = evaluateGesture(input);
    expect(out.isTap).toBe(true);
    expect(out.shouldCommit).toBe(false);
  });

  it('returns isTap=false when movement exceeds TAP_MOVEMENT_PX', () => {
    const input = makeInput({
      startY: 600,
      currentY: 600 - TAP_MOVEMENT_PX, // exactly at threshold = not a tap
      startTime: 1000,
      now: 1100,
    });
    const out = evaluateGesture(input);
    expect(out.isTap).toBe(false);
  });

  it('returns isTap=false when duration exceeds TAP_DURATION_MS', () => {
    const input = makeInput({
      startY: 600,
      currentY: 601, // 1px movement - tiny
      startTime: 1000,
      now: 1000 + TAP_DURATION_MS, // exactly at threshold = not a tap
    });
    const out = evaluateGesture(input);
    expect(out.isTap).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateGesture - zone classification
// ---------------------------------------------------------------------------

describe('evaluateGesture - zone classification', () => {
  it('returns zone=rest for small upward delta below the idle deadband', () => {
    // fraction = 0.01 / 800 * 800 = 0.01 - well below ZONE_IDLE_DEADBAND (0.02)
    const input = makeInput({
      startY: 600,
      currentY: 600 - 8, // 8px = 1% of 800px viewport
      viewportHeight: 800,
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('rest');
  });

  it('returns zone=lift when drag fraction is between deadband and ARM_THRESHOLD', () => {
    // 30% of viewport = 240px; ARM_THRESHOLD = 0.40, so 30% is in lift zone
    const viewportHeight = 800;
    const liftFraction = 0.30; // between ZONE_IDLE_DEADBAND (0.02) and ARM_THRESHOLD (0.40)
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * liftFraction,
      viewportHeight,
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('lift');
  });

  it('returns zone=armed when drag fraction is at or above ARM_THRESHOLD', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * ARM_THRESHOLD, // exactly 40%
      viewportHeight,
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
  });

  it('returns zone=armed for drag well past ARM_THRESHOLD', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.60, // 60%, clearly armed
      viewportHeight,
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
  });

  it('returns zone=rest for zero viewportHeight (guard against divide-by-zero)', () => {
    const input = makeInput({ viewportHeight: 0 });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('rest');
  });
});

// ---------------------------------------------------------------------------
// evaluateGesture - shouldCommit: slow drag scenarios
// ---------------------------------------------------------------------------

describe('evaluateGesture - shouldCommit: slow drag (no flick)', () => {
  it('does not commit slow drag to lift zone even with isPlayerTurn=true and releaseEvent', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30, // 30% = lift, not armed
      viewportHeight,
      isPlayerTurn: true,
      releaseEvent: { overMuck: false },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('lift');
    expect(out.shouldCommit).toBe(false);
  });

  it('does not commit slow drag in lift zone with isPlayerTurn=false', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30,
      viewportHeight,
      isPlayerTurn: false,
      releaseEvent: { overMuck: false },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('lift');
    expect(out.shouldCommit).toBe(false);
  });

  it('commits armed drag when isPlayerTurn=true and release is over muck', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.50, // 50% = armed
      viewportHeight,
      isPlayerTurn: true,
      releaseEvent: { overMuck: true },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
    expect(out.shouldCommit).toBe(true);
  });

  it('does not commit armed drag when isPlayerTurn=false even with release over muck', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.50,
      viewportHeight,
      isPlayerTurn: false,
      releaseEvent: { overMuck: true },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
    expect(out.shouldCommit).toBe(false);
  });

  it('does not commit armed drag when no releaseEvent is present', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.50,
      viewportHeight,
      isPlayerTurn: true,
      releaseEvent: undefined,
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
    expect(out.shouldCommit).toBe(false);
  });

  it('does not commit armed drag when release is not over muck and no flick', () => {
    const viewportHeight = 800;
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.50,
      viewportHeight,
      isPlayerTurn: true,
      releaseEvent: { overMuck: false },
      velocityBuffer: [], // no velocity
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
    // Not over muck and no flick velocity: should NOT commit
    expect(out.shouldCommit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateGesture - shouldCommit: flick scenarios (touch)
// ---------------------------------------------------------------------------

describe('evaluateGesture - shouldCommit: flick (inputMode=touch)', () => {
  it('commits on flick from lift zone when isPlayerTurn=true and velocity exceeds FLICK_VELOCITY_TOUCH', () => {
    const nowMs = 2000;
    const viewportHeight = 800;
    // Lift zone: 30% of viewport
    const buffer = makeBuffer(nowMs, FLICK_VELOCITY_TOUCH + 0.1); // above threshold
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30, // lift zone
      viewportHeight,
      now: nowMs,
      inputMode: 'touch',
      isPlayerTurn: true,
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('lift');
    expect(out.shouldCommit).toBe(true);
  });

  it('does not commit on flick from lift zone when isPlayerTurn=false', () => {
    const nowMs = 2000;
    const viewportHeight = 800;
    const buffer = makeBuffer(nowMs, FLICK_VELOCITY_TOUCH + 0.1);
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30,
      viewportHeight,
      now: nowMs,
      inputMode: 'touch',
      isPlayerTurn: false,
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('lift');
    expect(out.shouldCommit).toBe(false);
  });

  it('does not commit when flick velocity is below FLICK_VELOCITY_TOUCH threshold', () => {
    const nowMs = 2000;
    const viewportHeight = 800;
    const buffer = makeBuffer(nowMs, FLICK_VELOCITY_TOUCH - 0.1); // below threshold
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30,
      viewportHeight,
      now: nowMs,
      inputMode: 'touch',
      isPlayerTurn: true,
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('lift');
    expect(out.shouldCommit).toBe(false);
  });

  it('commits on flick from armed zone with isPlayerTurn=true', () => {
    const nowMs = 2000;
    const viewportHeight = 800;
    const buffer = makeBuffer(nowMs, FLICK_VELOCITY_TOUCH + 0.1);
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.50, // armed zone
      viewportHeight,
      now: nowMs,
      inputMode: 'touch',
      isPlayerTurn: true,
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    });
    const out = evaluateGesture(input);
    expect(out.zone).toBe('armed');
    expect(out.shouldCommit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluateGesture - shouldCommit: flick scenarios (pointer mode)
// ---------------------------------------------------------------------------

describe('evaluateGesture - shouldCommit: flick (inputMode=pointer)', () => {
  it('uses the lower FLICK_VELOCITY_POINTER threshold for pointer input mode', () => {
    // FLICK_VELOCITY_POINTER (0.8) < FLICK_VELOCITY_TOUCH (1.2)
    // Use a velocity between the two thresholds: should commit with pointer, not with touch
    const velocityBetweenThresholds = (FLICK_VELOCITY_POINTER + FLICK_VELOCITY_TOUCH) / 2;
    const nowMs = 2000;
    const viewportHeight = 800;
    const buffer = makeBuffer(nowMs, velocityBetweenThresholds);

    const pointerInput = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30,
      viewportHeight,
      now: nowMs,
      inputMode: 'pointer',
      isPlayerTurn: true,
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    });
    const touchInput = makeInput({
      ...pointerInput,
      inputMode: 'touch',
    });

    expect(evaluateGesture(pointerInput).shouldCommit).toBe(true);
    expect(evaluateGesture(touchInput).shouldCommit).toBe(false);
  });

  it('does not commit pointer flick when isPlayerTurn=false', () => {
    const nowMs = 2000;
    const viewportHeight = 800;
    const buffer = makeBuffer(nowMs, FLICK_VELOCITY_POINTER + 0.1);
    const input = makeInput({
      startY: 600,
      currentY: 600 - viewportHeight * 0.30,
      viewportHeight,
      now: nowMs,
      inputMode: 'pointer',
      isPlayerTurn: false,
      velocityBuffer: buffer,
      releaseEvent: { overMuck: false },
    });
    expect(evaluateGesture(input).shouldCommit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeVelocity
// ---------------------------------------------------------------------------

describe('computeVelocity - edge cases', () => {
  it('returns 0 for an empty buffer', () => {
    expect(computeVelocity([], 1000)).toBe(0);
  });

  it('returns 0 for a single sample', () => {
    const buffer: VelocitySample[] = [{ t: 990, y: 500 }];
    expect(computeVelocity(buffer, 1000)).toBe(0);
  });

  it('returns 0 when dt between two samples is zero', () => {
    const buffer: VelocitySample[] = [
      { t: 990, y: 500 },
      { t: 990, y: 480 }, // same timestamp
    ];
    expect(computeVelocity(buffer, 1000)).toBe(0);
  });
});

describe('computeVelocity - two-sample calculation', () => {
  it('returns expected px/ms for two samples 50ms apart', () => {
    const now = 1000;
    // oldest sample 49ms ago at y=600, latest at y=550 (upward move of 50px over 49ms)
    const dt = 49;
    const dy = 50; // y decreased by 50 (upward)
    const buffer: VelocitySample[] = [
      { t: now - dt, y: 600 },
      { t: now, y: 600 - dy },
    ];
    const velocity = computeVelocity(buffer, now);
    expect(velocity).toBeCloseTo(dy / dt);
  });

  it('returns positive velocity for upward motion (y decreasing over time)', () => {
    const now = 1000;
    const buffer: VelocitySample[] = [
      { t: 960, y: 600 },
      { t: 1000, y: 560 }, // moved up 40px in 40ms = 1.0 px/ms
    ];
    const velocity = computeVelocity(buffer, now);
    expect(velocity).toBeCloseTo(1.0);
  });

  it('returns negative velocity for downward motion (y increasing over time)', () => {
    const now = 1000;
    const buffer: VelocitySample[] = [
      { t: 960, y: 560 },
      { t: 1000, y: 600 }, // moved down 40px in 40ms = -1.0 px/ms
    ];
    const velocity = computeVelocity(buffer, now);
    expect(velocity).toBeCloseTo(-1.0);
  });
});

describe('computeVelocity - buffer pruning', () => {
  it('prunes samples older than VELOCITY_BUFFER_MS and computes from remaining', () => {
    const now = 1000;
    // One stale sample (>50ms old) and two fresh samples
    const stale: VelocitySample = { t: now - VELOCITY_BUFFER_MS - 1, y: 700 }; // 51ms ago
    const fresh1: VelocitySample = { t: now - 40, y: 600 };
    const fresh2: VelocitySample = { t: now, y: 560 }; // 40px up in 40ms = 1.0 px/ms
    const buffer = [stale, fresh1, fresh2];

    const velocity = computeVelocity(buffer, now);
    // Stale sample excluded; velocity from fresh1 to fresh2 = 40px / 40ms = 1.0
    expect(velocity).toBeCloseTo(1.0);
  });

  it('returns 0 when all samples are older than VELOCITY_BUFFER_MS (stale buffer)', () => {
    const now = 1000;
    // All samples are outside the 50ms window
    const buffer: VelocitySample[] = [
      { t: now - VELOCITY_BUFFER_MS - 10, y: 600 },
      { t: now - VELOCITY_BUFFER_MS - 5, y: 580 },
    ];
    // After pruning, zero samples remain => returns 0
    const velocity = computeVelocity(buffer, now);
    expect(velocity).toBe(0);
  });

  it('returns 0 when exactly one sample survives pruning', () => {
    const now = 1000;
    const buffer: VelocitySample[] = [
      { t: now - VELOCITY_BUFFER_MS - 1, y: 600 }, // pruned (51ms ago)
      { t: now - VELOCITY_BUFFER_MS + 1, y: 580 }, // survives (49ms ago)
    ];
    const velocity = computeVelocity(buffer, now);
    expect(velocity).toBe(0); // only one sample after pruning
  });

  it('uses oldest-to-latest pair, not just the last two deltas', () => {
    const now = 1000;
    // Three fresh samples; velocity should be oldest-to-latest
    const buffer: VelocitySample[] = [
      { t: now - 40, y: 640 }, // oldest fresh
      { t: now - 20, y: 620 }, // middle
      { t: now, y: 600 },      // latest (total: 40px up in 40ms = 1.0 px/ms)
    ];
    // oldest-to-latest: (640 - 600) / (1000 - 960) = 40 / 40 = 1.0 px/ms
    const velocity = computeVelocity(buffer, now);
    expect(velocity).toBeCloseTo(1.0);
  });
});
