/**
 * Chat voice synthesis for Liars Dice.
 *
 * Generates deterministic per-player voice parameters (pitch) seeded from fur
 * colour hash, builds Web Audio blip recipes per character, and schedules
 * typewriter reveal timing.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 * Pure functions; SSR-safe.
 * See docs/table-porting.md for the boundary rule.
 */

import type { StingRecipe, StingVoice } from './emotes.js';

// ─── DJB2 hash helper ─────────────────────────────────────────────────────

/**
 * DJB2 hash: fast, good distribution for short strings.
 * Returns a non-negative integer.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// ─── Voice parameters ─────────────────────────────────────────────────────

export interface VoiceParams {
  baseHz: number;
  charDetuneCents: number;
  durationMs: number;
  gain: number;
}

/**
 * Deterministic voice parameters seeded from fur colour string.
 *
 * - baseHz: 8 evenly-spaced frequencies in [280, 540] Hz.
 * - charDetuneCents: 4 levels in [-12, +12] cents.
 * - durationMs: fixed 80 ms per character.
 * - gain: fixed 0.18 (under the emote stings' ~0.4 to sit behind voice).
 */
export function voiceParamsFor(furColour: string): VoiceParams {
  const hash = djb2Hash(furColour);

  // 8 evenly-spaced frequencies: [280, 306.7, 333.3, 360, 386.7, 413.3, 440, 466.7, 493.3, 520, 540]
  // Step size: (540 - 280) / 8 = 32.5 Hz
  const freqIndex = hash % 8;
  const baseHz = 280 + freqIndex * 32.5;

  // 4 levels of character detune: [-12, -4, +4, +12] cents
  const detuneIndex = (hash >> 8) % 4;
  const charDetuneCents = [-12, -4, 4, 12][detuneIndex];

  const durationMs = 80;
  const gain = 0.18;

  return { baseHz, charDetuneCents, durationMs, gain };
}

// ─── Blip recipe builder ──────────────────────────────────────────────────

/**
 * Build a blip recipe for a single character in a message.
 *
 * Per-character frequency is detuned by:
 *   (charCode * 1.3 + indexInMessage * 0.7) % 100 / 100 * voice.charDetuneCents
 *
 * Converted to a multiplicative frequency factor:
 *   factor = 2^(cents / 1200)
 *
 * Produces a square wave at voice.baseHz * factor, detuned slightly down to
 * 92% of the base at the end (small glide-down for musicality).
 *
 * Spaces produce a recipe with an empty voices array (silent placeholder;
 * consumer skips calling playSting()).
 */
export function buildBlipRecipe(
  char: string,
  voice: VoiceParams,
  indexInMessage: number,
): StingRecipe {
  // Spaces are silent (but still consume time in the reveal schedule)
  if (char === ' ') {
    return { voices: [] };
  }

  // Compute per-char detune offset
  const charCode = char.charCodeAt(0);
  const detuneOffset = ((charCode * 1.3 + indexInMessage * 0.7) % 100) / 100;
  const appliedDetuneCents = detuneOffset * voice.charDetuneCents;

  // Convert cents to frequency multiplier: 2^(cents/1200)
  const freqFactor = Math.pow(2, appliedDetuneCents / 1200);

  const freqStartHz = voice.baseHz * freqFactor;
  const freqEndHz = freqStartHz * 0.92; // Slight glide-down

  const voiceData: StingVoice = {
    wave: 'square',
    freqStartHz,
    freqEndHz,
    startMs: 0,
    durationMs: voice.durationMs,
    gain: voice.gain,
  };

  return { voices: [voiceData] };
}

// ─── Typewriter reveal schedule ────────────────────────────────────────────

/**
 * Per-character interval multipliers relative to the letter interval.
 * Calibrated so chat reads with a natural reading rhythm: word breaks pause,
 * commas pause longer, sentence-ends pause longer still. Letters drive the
 * underlying `charsPerSec` rate; the other kinds are scaled off it so the
 * relative feel holds at any reveal speed.
 */
const PAUSE_MULTIPLIER = {
  letter: 1,
  space: 2.5,
  comma: 5,
  fullStop: 8,
  newline: 8,
} as const;

type CharKind = keyof typeof PAUSE_MULTIPLIER;

function charKind(c: string): CharKind {
  if (c === ' ' || c === '\t') return 'space';
  if (c === ',' || c === ';' || c === ':') return 'comma';
  if (c === '.' || c === '!' || c === '?') return 'fullStop';
  if (c === '\n' || c === '\r') return 'newline';
  return 'letter';
}

/**
 * Compute the reveal schedule for typewriter effect with natural cadence.
 *
 * Letters reveal at `charsPerSec`; spaces add a brief word-pause; commas
 * (and `;`/`:`) add a mid-sentence pause; full stops, `!`, `?`, and newlines
 * pause longest. The audio path keeps emitting one blip per non-space char
 * via `buildBlipRecipe`; the visual and audio both consume this schedule so
 * they stay in sync.
 *
 * @param text          The message text.
 * @param charsPerSec   Letter reveal speed (default 30 chars/sec).
 *                      Consumers currently pass 18 CPS for a comfortable read.
 * @returns             { delaysMs, totalMs }
 *                      - delaysMs[i] = offset from t=0 at which char i is revealed
 *                      - totalMs = total reveal duration
 */
export function revealSchedule(
  text: string,
  charsPerSec: number = 30,
): { delaysMs: number[]; totalMs: number } {
  const letterMs = 1000 / charsPerSec;
  const delaysMs: number[] = [];

  let t = 0;
  for (let i = 0; i < text.length; i++) {
    delaysMs.push(t);
    t += letterMs * PAUSE_MULTIPLIER[charKind(text[i])];
  }

  // `t` is now where the next char WOULD reveal; subtract one letter-step so
  // totalMs reflects the moment the last char appears, plus 1ms for the empty
  // string case.
  const totalMs = text.length > 0 ? t - letterMs * PAUSE_MULTIPLIER[charKind(text[text.length - 1])] + 1 : 0;

  return { delaysMs, totalMs };
}
