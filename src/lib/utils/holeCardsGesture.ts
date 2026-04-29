// Pure-function gesture state evaluator for poker hole-cards.
// Extracted so the three-zone state machine (resting / lift / armed) plus
// tap-to-flip plus flick-velocity commit is testable without a browser.
//
// Design notes:
// - Velocity is computed from a circular buffer of (timestamp, y) samples
//   that the caller maintains. Oldest-to-latest two-point estimate. Do NOT
//   use raw pointermove deltas, Safari coalesces them and the tail is stale.
// - Off-turn (isPlayerTurn === false): zone may reach 'armed' visually, but
//   shouldCommit is always false. The visual cue is the parent's job.

import type { InputMode } from './inputMode';

export type GestureZone = 'rest' | 'lift' | 'armed';

export interface VelocitySample {
  t: number;
  y: number;
}

export interface ReleaseEvent {
  // True if pointerup landed inside the muck zone rect.
  overMuck: boolean;
}

export interface GestureInput {
  startY: number;
  currentY: number;
  startTime: number;
  now: number;
  viewportHeight: number;
  isPlayerTurn: boolean;
  inputMode: InputMode;
  velocityBuffer: VelocitySample[];
  releaseEvent?: ReleaseEvent;
}

export interface GestureOutput {
  zone: GestureZone;
  isTap: boolean;
  shouldCommit: boolean;
  velocity: number;
}

// Tunable thresholds. Exported so HoleCards.svelte can import rather than
// redeclare, preventing drift between the pure evaluator and the component.
export const LIFT_MAX = 0.25;
export const ARM_THRESHOLD = 0.40;
export const FLICK_VELOCITY_TOUCH = 1.2;
export const FLICK_VELOCITY_POINTER = 0.8;
export const TAP_MOVEMENT_PX = 8;
export const TAP_DURATION_MS = 200;
export const VELOCITY_BUFFER_MS = 50;

// Deadband below which the zone is treated as 'idle' (prevents jitter at rest).
// Three-zone model: idle -> lift -> armed, matching the plan spec exactly.
const ZONE_IDLE_DEADBAND = 0.02;

export function computeVelocity(buffer: VelocitySample[], now: number): number {
  // Prune stale samples inside the function so callers need not pre-prune.
  // Callers may also pre-prune for memory-bounded behaviour; both are safe.
  const cutoff = now - VELOCITY_BUFFER_MS;
  const pruned = buffer.filter(s => s.t >= cutoff);
  if (pruned.length < 2) return 0;
  const oldest = pruned[0];
  const latest = pruned[pruned.length - 1];
  const dt = latest.t - oldest.t;
  if (dt <= 0) return 0;
  // Negative dy means upward, return positive upward-velocity in px/ms.
  return (oldest.y - latest.y) / dt;
}

export function evaluateGesture(input: GestureInput): GestureOutput {
  const {
    startY,
    currentY,
    startTime,
    now,
    viewportHeight,
    isPlayerTurn,
    inputMode,
    velocityBuffer,
    releaseEvent,
  } = input;

  const deltaY = startY - currentY; // upward is positive
  const movementAbs = Math.abs(deltaY);
  const duration = now - startTime;
  const fraction = viewportHeight > 0 ? deltaY / viewportHeight : 0;

  // Three-zone model: idle (deadband) -> lift -> armed.
  let zone: GestureZone = 'rest';
  if (fraction >= ARM_THRESHOLD) zone = 'armed';
  else if (fraction >= ZONE_IDLE_DEADBAND) zone = 'lift';
  // fraction < ZONE_IDLE_DEADBAND: remains 'rest' (deadband prevents jitter).

  // Tap detection takes precedence on release.
  const isTap = movementAbs < TAP_MOVEMENT_PX && duration < TAP_DURATION_MS;

  const velocity = computeVelocity(velocityBuffer, now);
  const flickThreshold =
    inputMode === 'touch' ? FLICK_VELOCITY_TOUCH : FLICK_VELOCITY_POINTER;
  const flickPassed = velocity >= flickThreshold;

  let shouldCommit = false;
  if (releaseEvent && !isTap && isPlayerTurn) {
    const inArmed = zone === 'armed';
    const flickFromLift = flickPassed && (zone === 'lift' || zone === 'armed');
    const releasedOverMuck = inArmed && releaseEvent.overMuck;
    if (releasedOverMuck || flickFromLift) {
      shouldCommit = true;
    }
  }

  return { zone, isTap, shouldCommit, velocity };
}
