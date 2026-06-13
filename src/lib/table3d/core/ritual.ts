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

import type { RoundResultLike, BidLike } from './types.js';

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Duration (ms) of the FREEZE cue: lights dim, ambient down. */
export const FREEZE_DURATION     = 600;

/** Duration (ms) of the SPOTLIGHT cue: two spots lock onto caller + accused. */
export const SPOTLIGHT_DURATION  = 1300;

/** Duration (ms) of the SHOWDOWN cue: display bid text and countdown. */
export const SHOWDOWN_DURATION   = 1500;

/** Stagger (ms) between successive REVEAL_PULSE cues. */
export const REVEAL_STAGGER      = 600;

/** Duration (ms) of the HOLD cue: tally display holds before verdict. */
export const HOLD_DURATION       = 900;

/** Duration (ms) of the VERDICT cue: loser shock, vindicated laugh. */
export const VERDICT_DURATION    = 2400;

/** Duration (ms) of the RESTORE cue: lights ramp back, expressions decay. */
export const RESTORE_DURATION    = 600;

// ─── Cue discriminated union ──────────────────────────────────────────────────

export type RitualCueData =
  /** Lights dim to 25%, ambient intensity drops. */
  | { kind: 'FREEZE' }
  /** Two spotlights converge on callerId and accusedId. */
  | { kind: 'SPOTLIGHT'; callerId: string; accusedId: string }
  /** Showdown: display the bid and prepare to count. */
  | { kind: 'SHOWDOWN'; bid: BidLike; onesWild: boolean }
  /** Reveal a single player's dice; face expression pulses. */
  | { kind: 'REVEAL_PULSE'; playerId: string; dice: number[]; matchCount: number; runningCount: number; stepIndex: number; totalSteps: number }
  /** Hold the count before verdict. */
  | { kind: 'HOLD'; bidCount: number; runningCount: number }
  /** Show verdict expressions: loser=shock, vindicated=laugh. */
  | { kind: 'VERDICT'; loserId: string; vindicatedId: string; liarCaught: boolean; actualCount: number; bidCount: number }
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
 * @param opts         Optional flags (onesWild).
 */
export function buildRitual(
  result: RoundResultLike,
  revealOrder: string[],
  opts?: { onesWild?: boolean },
): RitualCue[] {
  const onesWild = opts?.onesWild ?? false;

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

  // 3. SHOWDOWN: display the bid
  cues.push({
    at: cursor,
    duration: SHOWDOWN_DURATION,
    cue: { kind: 'SHOWDOWN', bid: result.bid, onesWild },
  });
  cursor += SHOWDOWN_DURATION;

  // 4. REVEAL cascade: one pulse per player in revealOrder with match tallies
  const totalSteps = revealOrder.length;
  let runningCount = 0;
  revealOrder.forEach((playerId, stepIndex) => {
    const playerDice = result.revealedDice[playerId] ?? [];
    const matchCount = playerDice.filter((die) => {
      if (die === result.bid.face) return true;
      if (onesWild && result.bid.face !== 1 && die === 1) return true;
      return false;
    }).length;
    runningCount += matchCount;

    cues.push({
      at: cursor + stepIndex * REVEAL_STAGGER,
      duration: REVEAL_STAGGER,
      cue: {
        kind: 'REVEAL_PULSE',
        playerId,
        dice: playerDice,
        matchCount,
        runningCount,
        stepIndex,
        totalSteps,
      },
    });
  });
  cursor += totalSteps * REVEAL_STAGGER;

  // 5. HOLD: display the final tally
  cues.push({
    at: cursor,
    duration: HOLD_DURATION,
    cue: { kind: 'HOLD', bidCount: result.bid.count, runningCount },
  });
  cursor += HOLD_DURATION;

  // 6. VERDICT: loser=shock, vindicated=laugh
  const vindicatedId =
    result.loserId === result.callerId ? result.bid.bidderId : result.callerId;
  const liarCaught = result.actualCount < result.bid.count;

  cues.push({
    at: cursor,
    duration: VERDICT_DURATION,
    cue: {
      kind: 'VERDICT',
      loserId: result.loserId,
      vindicatedId,
      liarCaught,
      actualCount: result.actualCount,
      bidCount: result.bid.count,
    },
  });
  cursor += VERDICT_DURATION;

  // 7. RESTORE: lights and expressions return to baseline
  cues.push({ at: cursor, duration: RESTORE_DURATION, cue: { kind: 'RESTORE' } });

  return cues;
}
