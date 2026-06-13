/**
 * TableDirector: reactive interpreter that bridges raw LDStateLike snapshots
 * to the visual state consumed by LiarsDiceTableLayer and its children.
 *
 * Lives in a .svelte.ts runes module so $state/$effect are legal here.
 * Threlte frame work (useTask) lives in TableDirectorTick.svelte (Canvas child).
 *
 * Design contract:
 *  - deriveTableEvents() is called on every ldState change.
 *  - Each event type dispatches to a handler that mutates $state.
 *  - Ritual playback state (activeCues, elapsed) is advanced by TableDirectorTick
 *    which calls director.tick(delta) each frame.
 *  - prefers-reduced-motion: skip light animation + reveal cascade; apply
 *    verdict expressions instantly and skip FREEZE/SPOTLIGHT/RESTORE.
 */

import { deriveTableEvents } from './core/events.js';
import { buildRitual } from './core/ritual.js';
import type { LDStateLike, TableEvent } from './core/types.js';
import type { ExpressionName } from './core/rig.js';
import type { RitualCue } from './core/ritual.js';
import { EMOTE_REGISTRY, type EmoteId } from './core/emotes.js';

// ─── Light state ──────────────────────────────────────────────────────────────

export interface LightState {
  /** Ambient intensity multiplier (0..1, 1 = baseline). */
  ambientFactor: number;
  /** Key spotlight intensity multiplier. */
  keyFactor: number;
  /** Caller spotlight intensity (absolute candela, 0 = off). */
  callerSpotIntensity: number;
  /** Accused spotlight intensity (absolute candela, 0 = off). */
  accusedSpotIntensity: number;
  /** Player id currently lit by the caller spotlight. */
  callerSpotTarget: string | null;
  /** Player id currently lit by the accused spotlight. */
  accusedSpotTarget: string | null;
}

const LIGHT_BASELINE: LightState = {
  ambientFactor: 1,
  keyFactor: 1,
  callerSpotIntensity: 0,
  accusedSpotIntensity: 0,
  callerSpotTarget: null,
  accusedSpotTarget: null,
};

// ─── Jaw-chatter constants ────────────────────────────────────────────────────

/** Duration (ms) of the jaw-chatter pulse on BID_PLACED. */
const BID_CHATTER_DURATION_MS = 600;

/** Duration (ms) of a grin hold on BIG_BID bidder. */
const BIG_BID_GRIN_DURATION_MS = 2000;

/** Duration (ms) of brow-pinch/sweat on previous bidder after a BIG_BID. */
const BIG_BID_SWEAT_DURATION_MS = 2000;

/** Duration (ms) of shock on eliminated player before transitioning to asleep. */
const ELIMINATE_SHOCK_DURATION_MS = 1200;

// ─── TableDirector class ──────────────────────────────────────────────────────

// ─── Emote bubble entry ───────────────────────────────────────────────────────

export interface EmoteBubble {
  emoteId: EmoteId;
  firedAt: number; // Date.now() ms
}

export class TableDirector {
  // Reactive output consumed by the layer
  expressions = $state<Record<string, ExpressionName>>({});
  talkAmplitudes = $state<Record<string, number>>({});
  lights = $state<LightState>({ ...LIGHT_BASELINE });

  /**
   * Active emote bubbles keyed by playerId. Layer renders a pop-in glyph
   * above the named monkey's nameplate. Entries are cleared after holdMs.
   */
  emoteBubbles = $state<Record<string, EmoteBubble>>({});

  /**
   * Ritual playback speed multiplier.
   * 1 = real-time, 0.2 = 5x slow-mo for harness review.
   * Harness-only: production code should not change this from 1.
   */
  ritualTimescale = $state(1);

  /**
   * True while a ritual is actively playing.
   * The CameraRig reads this to ease parallax back to centre so
   * the authored ritual framing wins during the ceremony.
   */
  get ritualInProgress(): boolean {
    return this.#ritualActive;
  }

  // Internal tracking
  #prev: LDStateLike | null = null;
  #reducedMotion = false;

  // Ritual playback
  #activeCues: RitualCue[] = [];
  #ritualElapsed = 0;
  #ritualActive = false;
  #nextCueIndex = 0;

  // Per-player timer handles: maps playerId -> { expression, expiresAt ms }
  // We track wall-clock ms via Date.now() for expression timeouts outside ritual
  #expressionTimers = new Map<string, { expr: ExpressionName; expiresAt: number }>();

  // Jaw chatter: per-player elapsed accumulator (seconds, driven by tick)
  #chatterState = new Map<string, { elapsed: number; duration: number }>();

  constructor(reducedMotion = false) {
    this.#reducedMotion = reducedMotion;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Call when ldState changes. Derives events and dispatches handlers. */
  update(next: LDStateLike): void {
    const events = deriveTableEvents(this.#prev, next);
    this.#prev = next;

    for (const event of events) {
      this.#dispatch(event, next);
    }

    // Decay expired expression timers
    this.#tickExpressionTimers();
  }

  /** Set reduced-motion preference. Can be called at any time. */
  setReducedMotion(value: boolean): void {
    this.#reducedMotion = value;
  }

  /**
   * Apply an emote directly (bypasses state-diff derivation).
   * Called by the layer when a player_emote WebSocket message arrives,
   * and also for local-echo when the local player fires an emote.
   */
  applyEmote(playerId: string, emoteId: string): void {
    this.#onEmote(playerId, emoteId);
  }

  /**
   * Called every frame by TableDirectorTick with delta in seconds.
   * Advances jaw chatter oscillators and ritual timeline.
   */
  tick(delta: number): void {
    this.#advanceChatter(delta);
    if (this.#ritualActive) {
      this.#advanceRitual(delta);
    }
    this.#tickExpressionTimers();
  }

  /** Cancel any active ritual (e.g. on scene unmount). */
  cancelRitual(): void {
    this.#ritualActive = false;
    this.#activeCues = [];
    this.#ritualElapsed = 0;
    this.#nextCueIndex = 0;
    this.lights = { ...LIGHT_BASELINE };
  }

  // ── Event dispatch ──────────────────────────────────────────────────────────

  #dispatch(event: TableEvent, state: LDStateLike): void {
    switch (event.type) {
      case 'BID_PLACED':
        this.#onBidPlaced(event.bidderId);
        break;

      case 'BIG_BID':
        this.#onBigBid(event.bidderId, event.prevBidderId);
        break;

      case 'LIAR_CALLED':
        // Handled as part of round_over sequence; individual LIAR_CALLED just
        // primes sweat on accused before ritual fires.
        this.#setExpression(event.accusedId, 'sweat', 800);
        break;

      case 'REVEAL_STEP':
        // No direct visual outside the ritual; ritual handles REVEAL_PULSE cues.
        break;

      case 'VERDICT': {
        // Ritual handles this if active; but if reduced motion, apply instantly.
        if (this.#reducedMotion) {
          this.#setExpression(event.loserId, 'shock', 2000);
          this.#setExpression(event.vindicatedId, 'laugh', 2000);
        }
        break;
      }

      case 'PLAYER_ELIMINATED':
        this.#onPlayerEliminated(event.playerId);
        break;

      case 'PHASE_CHANGED':
        if (event.newPhase === 'round_over' && event.prevPhase === 'playing') {
          // LIAR_CALLED / VERDICT events handle the ritual; phase change resets lights
          // if no ritual fires (shouldn't normally happen but defensive).
        }
        break;

      case 'TURN_CHANGED':
      case 'POT_CHANGED':
        break;

      case 'EMOTE':
        this.#onEmote(event.playerId, event.emoteId);
        break;
    }

    // Start ritual on playing->round_over if we have a result
    if (
      event.type === 'LIAR_CALLED' &&
      state.phase === 'round_over' &&
      state.lastRoundResult
    ) {
      const revealOrder = state.turnOrder
        ? state.turnOrder.filter((id) => id in (state.lastRoundResult?.revealedDice ?? {}))
        : Object.keys(state.lastRoundResult.revealedDice);
      this.#startRitual(state.lastRoundResult, revealOrder);
    }
  }

  // ── Bid reactions ───────────────────────────────────────────────────────────

  #onBidPlaced(bidderId: string): void {
    // 600ms jaw chatter pulse
    this.#chatterState.set(bidderId, { elapsed: 0, duration: BID_CHATTER_DURATION_MS / 1000 });
  }

  #onBigBid(bidderId: string, prevBidderId: string): void {
    // Bidder grins ~2s
    this.#setExpression(bidderId, 'grin', BIG_BID_GRIN_DURATION_MS);
    // Previous bidder sweats (brow-pinch side-eye)
    this.#setExpression(prevBidderId, 'sweat', BIG_BID_SWEAT_DURATION_MS);
    // Extend chatter for the big bidder
    this.#chatterState.set(bidderId, { elapsed: 0, duration: BID_CHATTER_DURATION_MS / 1000 });
  }

  // ── Emote reaction ──────────────────────────────────────────────────────────

  #onEmote(playerId: string, emoteId: string): void {
    const entry = EMOTE_REGISTRY[emoteId as EmoteId];
    if (!entry) return; // unknown emote id, drop silently

    // Set expression with hold duration
    this.#setExpression(playerId, entry.expression, entry.holdMs);

    // Surface bubble for the layer to render
    this.emoteBubbles = {
      ...this.emoteBubbles,
      [playerId]: { emoteId: entry.id, firedAt: Date.now() },
    };

    // Auto-clear bubble after holdMs
    setTimeout(() => {
      const current = this.emoteBubbles[playerId];
      // Only clear if this is still the same emote (not superseded by a newer one)
      if (current && current.emoteId === entry.id) {
        const next = { ...this.emoteBubbles };
        delete next[playerId];
        this.emoteBubbles = next;
      }
    }, entry.holdMs);
  }

  // ── Elimination reaction ────────────────────────────────────────────────────

  #onPlayerEliminated(playerId: string): void {
    if (this.#reducedMotion) {
      this.expressions = { ...this.expressions, [playerId]: 'asleep' };
      return;
    }
    // Brief shock, then decay to asleep via expression timer
    this.#setExpression(playerId, 'shock', ELIMINATE_SHOCK_DURATION_MS);
    // Schedule asleep after shock expires
    setTimeout(() => {
      this.expressions = { ...this.expressions, [playerId]: 'asleep' };
    }, ELIMINATE_SHOCK_DURATION_MS + 200);
  }

  // ── Ritual playback ─────────────────────────────────────────────────────────

  #startRitual(result: import('./core/types.js').RoundResultLike, revealOrder: string[]): void {
    if (this.#reducedMotion) {
      // Reduced motion: skip ceremony, apply verdict instantly
      const vindicatedId =
        result.loserId === result.callerId ? result.bid.bidderId : result.callerId;
      this.#setExpression(result.loserId, 'shock', 2000);
      this.#setExpression(vindicatedId, 'laugh', 2000);
      return;
    }

    this.cancelRitual();
    this.#activeCues = buildRitual(result, revealOrder);
    this.#ritualElapsed = 0;
    this.#nextCueIndex = 0;
    this.#ritualActive = true;
  }

  #advanceRitual(delta: number): void {
    this.#ritualElapsed += delta * 1000 * this.ritualTimescale; // convert s -> ms

    while (
      this.#nextCueIndex < this.#activeCues.length &&
      this.#activeCues[this.#nextCueIndex].at <= this.#ritualElapsed
    ) {
      this.#fireCue(this.#activeCues[this.#nextCueIndex]);
      this.#nextCueIndex++;
    }

    if (this.#nextCueIndex >= this.#activeCues.length) {
      this.#ritualActive = false;
    }
  }

  #fireCue(cue: RitualCue): void {
    const c = cue.cue;
    switch (c.kind) {
      case 'FREEZE':
        this.lights = {
          ...this.lights,
          ambientFactor: 0.12,
          keyFactor: 0.12,
        };
        break;

      case 'SPOTLIGHT':
        this.lights = {
          ...this.lights,
          callerSpotIntensity: 90,
          accusedSpotIntensity: 90,
          callerSpotTarget: c.callerId,
          accusedSpotTarget: c.accusedId,
        };
        // accused sweats, caller grins during spotlight
        this.expressions = {
          ...this.expressions,
          [c.accusedId]: 'sweat',
          [c.callerId]: 'grin',
        };
        break;

      case 'REVEAL_PULSE':
        // Brief jaw-chatter on the revealed player
        this.#chatterState.set(c.playerId, { elapsed: 0, duration: 0.3 });
        break;

      case 'VERDICT':
        this.lights = {
          ...this.lights,
          callerSpotIntensity: 0,
          accusedSpotIntensity: 0,
          callerSpotTarget: null,
          accusedSpotTarget: null,
        };
        this.expressions = {
          ...this.expressions,
          [c.loserId]: 'shock',
          [c.vindicatedId]: 'laugh',
        };
        break;

      case 'RESTORE':
        this.lights = { ...LIGHT_BASELINE };
        // Expressions will decay naturally via timers; just clear any holds
        this.#expressionTimers.clear();
        break;
    }
  }

  // ── Jaw chatter oscillator ──────────────────────────────────────────────────

  #advanceChatter(delta: number): void {
    const PI = Math.PI;
    const updates: Record<string, number> = {};
    const toDelete: string[] = [];

    for (const [playerId, state] of this.#chatterState) {
      const newElapsed = state.elapsed + delta;
      if (newElapsed >= state.duration) {
        toDelete.push(playerId);
        updates[playerId] = 0;
      } else {
        // Two-sine jaw chatter shape from the art bible
        const t = newElapsed;
        const amp =
          ((Math.sin(t * 1.8 * PI * 2) + 1) / 2) *
          ((Math.sin(t * 5.5 * PI * 2) + 1) / 2) *
          1.4;
        updates[playerId] = Math.min(amp, 1);
        this.#chatterState.set(playerId, { ...state, elapsed: newElapsed });
      }
    }

    for (const id of toDelete) this.#chatterState.delete(id);

    if (Object.keys(updates).length > 0) {
      this.talkAmplitudes = { ...this.talkAmplitudes, ...updates };
    }
  }

  // ── Expression timer helpers ────────────────────────────────────────────────

  #setExpression(playerId: string, expr: ExpressionName, durationMs: number): void {
    this.expressions = { ...this.expressions, [playerId]: expr };
    this.#expressionTimers.set(playerId, {
      expr,
      expiresAt: Date.now() + durationMs,
    });
  }

  #tickExpressionTimers(): void {
    const now = Date.now();
    const updates: Record<string, ExpressionName> = {};

    for (const [playerId, timer] of this.#expressionTimers) {
      if (now >= timer.expiresAt) {
        // Check if the player is eliminated (should stay asleep)
        const currentExpr = this.expressions[playerId];
        if (currentExpr !== 'asleep') {
          updates[playerId] = 'neutral';
        }
        this.#expressionTimers.delete(playerId);
      }
    }

    if (Object.keys(updates).length > 0) {
      this.expressions = { ...this.expressions, ...updates };
    }
  }
}
