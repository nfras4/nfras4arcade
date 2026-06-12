/**
 * Emote registry for the Monkey Table (Phase 0).
 *
 * PORTABILITY: This file is engine-agnostic. No imports from svelte, three, threlte,
 * or SvelteKit. See docs/table-porting.md for the boundary rule.
 *
 * Each entry contains:
 *  - id:         canonical emote key (matches ExpressionName where possible)
 *  - label:      human-readable button label
 *  - glyph:      single CSS-renderable text character shown in the bubble
 *  - expression: ExpressionName pose to hold for holdMs
 *  - holdMs:     how long the expression holds before decaying to neutral
 *  - sting:      pure Web Audio synthesis recipe array (no AudioContext imports)
 */

import type { ExpressionName } from './rig.js';

// ─── Emote IDs ────────────────────────────────────────────────────────────────

export const EMOTE_IDS = ['laugh', 'sweat', 'taunt', 'shock', 'cheer', 'sus'] as const;
export type EmoteId = typeof EMOTE_IDS[number];

// ─── Sting voice recipe ───────────────────────────────────────────────────────

export interface StingVoice {
  wave: 'square' | 'sine' | 'triangle' | 'sawtooth' | 'noise';
  /** Starting frequency in Hz (ignored for noise). */
  freqStartHz: number;
  /** Ending frequency in Hz; if same as start, no glide. */
  freqEndHz: number;
  /** Offset from sting start in seconds. */
  startMs: number;
  /** Duration of this voice in seconds. */
  durationMs: number;
  /** Peak gain (0..1). */
  gain: number;
  /** Frequency glide type (default linear). */
  glide?: 'linear' | 'expo';
}

export interface StingRecipe {
  voices: StingVoice[];
}

// ─── Emote entry ──────────────────────────────────────────────────────────────

export interface EmoteEntry {
  id: EmoteId;
  label: string;
  /** Single CSS-renderable glyph for the bubble. No emoji - Unicode symbols only. */
  glyph: string;
  expression: ExpressionName;
  holdMs: number;
  sting: StingRecipe;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const EMOTE_REGISTRY: Record<EmoteId, EmoteEntry> = {
  /** Three descending square chirps - "heh heh heh" */
  laugh: {
    id: 'laugh',
    label: 'Laugh',
    glyph: 'HA',
    expression: 'laugh',
    holdMs: 3000,
    sting: {
      voices: [
        { wave: 'square', freqStartHz: 480, freqEndHz: 380, startMs: 0,   durationMs: 90,  gain: 0.40 },
        { wave: 'square', freqStartHz: 420, freqEndHz: 320, startMs: 110, durationMs: 90,  gain: 0.35 },
        { wave: 'square', freqStartHz: 360, freqEndHz: 260, startMs: 220, durationMs: 100, gain: 0.30 },
      ],
    },
  },

  /** Wobbly low sine - uneasy warble */
  sweat: {
    id: 'sweat',
    label: 'Sweat',
    glyph: ';)',
    expression: 'sweat',
    holdMs: 3000,
    sting: {
      voices: [
        { wave: 'sine', freqStartHz: 140, freqEndHz: 120, startMs: 0,   durationMs: 120, gain: 0.35 },
        { wave: 'sine', freqStartHz: 120, freqEndHz: 145, startMs: 100, durationMs: 130, gain: 0.28 },
        { wave: 'sine', freqStartHz: 145, freqEndHz: 110, startMs: 200, durationMs: 150, gain: 0.22 },
      ],
    },
  },

  /** Rising nyah-nyah two-tone - smug taunt */
  taunt: {
    id: 'taunt',
    label: 'Taunt',
    glyph: 'na',
    expression: 'smug',
    holdMs: 3000,
    sting: {
      voices: [
        { wave: 'square', freqStartHz: 330, freqEndHz: 440, startMs: 0,   durationMs: 130, gain: 0.38, glide: 'expo' },
        { wave: 'square', freqStartHz: 280, freqEndHz: 370, startMs: 150, durationMs: 130, gain: 0.33, glide: 'expo' },
      ],
    },
  },

  /** Sharp rising frequency sweep - jump-scare blip */
  shock: {
    id: 'shock',
    label: 'Shock',
    glyph: '!!',
    expression: 'shock',
    holdMs: 3000,
    sting: {
      voices: [
        { wave: 'square',  freqStartHz: 180, freqEndHz: 900, startMs: 0,  durationMs: 160, gain: 0.45, glide: 'expo' },
        { wave: 'triangle', freqStartHz: 90, freqEndHz: 450, startMs: 10, durationMs: 140, gain: 0.20, glide: 'expo' },
      ],
    },
  },

  /** Quick major arpeggio - triumphant little fanfare */
  cheer: {
    id: 'cheer',
    label: 'Cheer',
    glyph: 'WO',
    expression: 'laugh',
    holdMs: 3000,
    sting: {
      voices: [
        { wave: 'sine', freqStartHz: 261, freqEndHz: 261, startMs: 0,   durationMs: 90,  gain: 0.38 },
        { wave: 'sine', freqStartHz: 329, freqEndHz: 329, startMs: 80,  durationMs: 90,  gain: 0.38 },
        { wave: 'sine', freqStartHz: 392, freqEndHz: 392, startMs: 160, durationMs: 90,  gain: 0.40 },
        { wave: 'sine', freqStartHz: 523, freqEndHz: 523, startMs: 240, durationMs: 120, gain: 0.42 },
      ],
    },
  },

  /** Slow chromatic descending slide - suspicious glide */
  sus: {
    id: 'sus',
    label: 'Sus',
    glyph: '?',
    expression: 'smug',
    holdMs: 3000,
    sting: {
      voices: [
        { wave: 'triangle', freqStartHz: 370, freqEndHz: 220, startMs: 0,   durationMs: 380, gain: 0.30, glide: 'linear' },
        { wave: 'sine',     freqStartHz: 185, freqEndHz: 110, startMs: 40,  durationMs: 340, gain: 0.18, glide: 'linear' },
      ],
    },
  },
};

/** Ordered array for rendering the emote strip in a fixed sequence. */
export const EMOTE_LIST: EmoteEntry[] = EMOTE_IDS.map((id) => EMOTE_REGISTRY[id]);
