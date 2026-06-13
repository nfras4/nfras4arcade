/**
 * Liar's Ritual: pure data builder for the round-over ceremony timeline.
 *
 * buildRitual() returns an ordered array of RitualCue objects that the
 * TableDirector plays back via useTask-driven elapsed-time accumulation.
 * No framework imports; this file is engine-agnostic.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 * See docs/table-porting.md for the boundary rule.
 */

import type { RoundResultLike } from './types.js';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Duration (ms) of the FREEZE cue: lights dim, ambient down. */
export const FREEZE_DURATION     = 400;

/** Duration (ms) of the SPOTLIGHT cue: two spots lock onto caller + accused. */
export const SPOTLIGHT_DURATION  = 500;

/** Stagger (ms) between successive REVEAL_PULSE cues. */
export const REVEAL_STAGGER      = 250;

/** Duration (ms) of the VERDICT cue: loser shock, vindicated laugh. */
export const VERDICT_DURATION    = 800;

/** Duration (ms) of the RESTORE cue: lights ramp back, expressions decay. */
export const RESTORE_DURATION    = 600;

// ─── Cue discriminated union ──────────────────────────────────────────────────

export type RitualCueData =
  /** Lights dim to 25%, ambient intensity drops. */
  | { kind: 'FREEZE' }
  /** Two spotlights converge on callerId and accusedId. */
  | { kind: 'SPOTLIGHT'; callerId: string; accusedId: string }
  /** Reveal a single player's dice; face expression pulses. */
  | { kind: 'REVEAL_PULSE'; playerId: string; stepIndex: number; totalSteps: number }
  /** Show verdict expressions: loser=shock, vindicated=laugh. */
  | { kind: 'VERDICT'; loserId: string; vindicatedId: string }
  /** Lights ramp back to baseline; expressions decay toward neutral/asleep. */
  | { kind: 'RESTORE' };

export interface RitualCue {
  /** Offset in ms from the start of the ritual at which this cue fires. */
  at: number;
  /** How long this cue's effect holds before the next cue takes over. */
  duration: number;
  cue: RitualCueData;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build the ordered Liar's Ritual timeline for a round result.
 *
 * @param result       The round result (callerId, bid.bidderId, loserId, revealedDice).
 * @param revealOrder  Player ids in the order reveals should cascade (typically turnOrder).
 * @param variant      Ceremony variant; only 'standard' exists today.
 */
export function buildRitual(
  result: RoundResultLike,
  revealOrder: string[],
  variant: 'standard' = 'standard',
): RitualCue[] {
  void variant; // reserved for future ceremony variants

  const cues: RitualCue[] = [];
  let cursor = 0;

  // 1. FREEZE: lights dim
  cues.push({ at: cursor, duration: FREEZE_DURATION, cue: { kind: 'FREEZE' } });
  cursor += FREEZE_DURATION;

  // 2. SPOTLIGHT: two spots on caller + accused (= bid.bidderId)
  const accusedId = result.bid.bidderId;
  cues.push({
    at: cursor,
    duration: SPOTLIGHT_DURATION,
    cue: { kind: 'SPOTLIGHT', callerId: result.callerId, accusedId },
  });
  cursor += SPOTLIGHT_DURATION;

  // 3. REVEAL cascade: one pulse per player in revealOrder
  const totalSteps = revealOrder.length;
  revealOrder.forEach((playerId, stepIndex) => {
    cues.push({
      at: cursor + stepIndex * REVEAL_STAGGER,
      duration: REVEAL_STAGGER,
      cue: { kind: 'REVEAL_PULSE', playerId, stepIndex, totalSteps },
    });
  });
  cursor += totalSteps * REVEAL_STAGGER;

  // 4. VERDICT: loser=shock, vindicated=laugh
  const vindicatedId =
    result.loserId === result.callerId ? result.bid.bidderId : result.callerId;

  cues.push({
    at: cursor,
    duration: VERDICT_DURATION,
    cue: { kind: 'VERDICT', loserId: result.loserId, vindicatedId },
  });
  cursor += VERDICT_DURATION;

  // 5. RESTORE: lights and expressions return to baseline
  cues.push({ at: cursor, duration: RESTORE_DURATION, cue: { kind: 'RESTORE' } });

  return cues;
}
