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
 * `char` is a full Unicode code point (a 1-2 UTF-16 code unit string from
 * `Array.from(text)`), so astral-plane emoji are treated as one character
 * and produce a single blip rather than two surrogate-half blips
 * (audit fix #8).
 *
 * Per-character frequency is detuned by:
 *   ((codePoint * 1.3 + indexInMessage * 0.7) % 200) / 100 - 1   // in [-1, 1)
 *   * voice.charDetuneCents
 *
 * The %200/100-1 form centres the detune offset around zero so the applied
 * detune spans both positive and negative cents instead of being one-sided
 * (audit fix #51).
 *
 * Converted to a multiplicative frequency factor:
 *   factor = 2^(cents / 1200)
 *
 * Produces a square wave at voice.baseHz * factor, detuned slightly down to
 * 92% of the base at the end (small glide-down for musicality).
 *
 * Whitespace (space, tab, newline, carriage return, etc.) produces a recipe
 * with an empty voices array (silent placeholder; consumer skips calling
 * playSting()). This covers tab/newline as well as plain space
 * (audit fix #27).
 */
export function buildBlipRecipe(
  char: string,
  voice: VoiceParams,
  indexInMessage: number,
): StingRecipe {
  // Any whitespace is silent (but still consumes time in the reveal schedule).
  // \s covers space, tab, newline, carriage return, vertical tab, and form feed.
  if (/\s/.test(char)) {
    return { voices: [] };
  }

  // Use the full Unicode code point (handles astral-plane emoji).
  const codePoint = char.codePointAt(0) ?? 0;

  // Centre the detune offset around zero so detune is two-sided (audit fix #51).
  const detuneOffset = ((codePoint * 1.3 + indexInMessage * 0.7) % 200) / 100 - 1;
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
 * Compute the reveal schedule for typewriter effect.
 *
 * Iterates the message by Unicode code points (via `Array.from`) so an astral
 * emoji counts as one reveal step rather than two surrogate halves
 * (audit fix #8).
 *
 * @param text          The message text.
 * @param charsPerSec   Reveal speed (default 30 chars/sec).
 *                      Consumers currently pass 18 CPS for slower, more readable reveal.
 * @returns             { delaysMs, totalMs }
 *                      - delaysMs[i] = offset from t=0 at which code point i is revealed
 *                      - totalMs = total reveal duration
 */
export function revealSchedule(
  text: string,
  charsPerSec: number = 30,
): { delaysMs: number[]; totalMs: number } {
  const intervalMs = 1000 / charsPerSec;
  const codePoints = Array.from(text);
  const delaysMs: number[] = [];

  for (let i = 0; i < codePoints.length; i++) {
    delaysMs.push(i * intervalMs);
  }

  const totalMs = codePoints.length > 0 ? (codePoints.length - 1) * intervalMs + 1 : 0;

  return { delaysMs, totalMs };
}
