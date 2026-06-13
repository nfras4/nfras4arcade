/**
 * Pure emote relay validation helpers.
 *
 * Extracted so they can be unit-tested without a Durable Object context.
 * The worker imports and calls these; the canonical EMOTE_IDS lives in
 * core/emotes.ts and is re-exported here for worker use.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 */

export { EMOTE_IDS } from './emotes.js';
export type { EmoteId } from './emotes.js';

// ─── Rate-limit tracker ───────────────────────────────────────────────────────

/** Minimum gap between emotes from the same player (ms). */
export const EMOTE_RATE_MS = 2000;

/**
 * Check whether the player is within the emote rate window.
 *
 * @param lastEmoteAt  Map<playerId, lastEmoteTimestampMs> stored on the DO instance.
 * @param playerId     Sender.
 * @param nowMs        Current timestamp (Date.now()).
 * @returns            true if the emote should be dropped (rate-limited).
 */
export function isEmoteRateLimited(
  lastEmoteAt: Map<string, number>,
  playerId: string,
  nowMs: number,
): boolean {
  const last = lastEmoteAt.get(playerId);
  return last !== undefined && nowMs - last < EMOTE_RATE_MS;
}

/**
 * Record that the player just emoted.
 * Call this only after validation passes.
 */
export function recordEmote(
  lastEmoteAt: Map<string, number>,
  playerId: string,
  nowMs: number,
): void {
  lastEmoteAt.set(playerId, nowMs);
}

// ─── Emote ID validation ──────────────────────────────────────────────────────

import { EMOTE_IDS } from './emotes.js';

/**
 * Returns true if emoteId is a member of the canonical EMOTE_IDS list.
 */
export function isValidEmoteId(emoteId: unknown): boolean {
  return typeof emoteId === 'string' && (EMOTE_IDS as readonly string[]).includes(emoteId);
}

// ─── Phase gating ─────────────────────────────────────────────────────────────

/** Phases in which emotes are allowed. */
export const EMOTE_ALLOWED_PHASES = new Set(['lobby', 'playing', 'round_over']);

export function isEmotePhaseAllowed(phase: string): boolean {
  return EMOTE_ALLOWED_PHASES.has(phase);
}
