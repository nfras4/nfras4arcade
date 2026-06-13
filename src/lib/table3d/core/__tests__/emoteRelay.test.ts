import { describe, it, expect, beforeEach } from 'vitest';
import {
  isValidEmoteId,
  isEmoteRateLimited,
  isEmotePhaseAllowed,
  recordEmote,
  EMOTE_RATE_MS,
} from '../emoteRelay.js';
import { EMOTE_IDS } from '../emotes.js';

// ─── isValidEmoteId ───────────────────────────────────────────────────────────

describe('isValidEmoteId', () => {
  it('accepts all canonical emote ids', () => {
    for (const id of EMOTE_IDS) {
      expect(isValidEmoteId(id)).toBe(true);
    }
  });

  it('rejects unknown string', () => {
    expect(isValidEmoteId('rage')).toBe(false);
    expect(isValidEmoteId('')).toBe(false);
    expect(isValidEmoteId('LAUGH')).toBe(false); // case-sensitive
  });

  it('rejects non-strings', () => {
    expect(isValidEmoteId(null)).toBe(false);
    expect(isValidEmoteId(undefined)).toBe(false);
    expect(isValidEmoteId(42)).toBe(false);
    expect(isValidEmoteId({})).toBe(false);
  });
});

// ─── isEmotePhaseAllowed ──────────────────────────────────────────────────────

describe('isEmotePhaseAllowed', () => {
  it('allows lobby, playing, round_over', () => {
    expect(isEmotePhaseAllowed('lobby')).toBe(true);
    expect(isEmotePhaseAllowed('playing')).toBe(true);
    expect(isEmotePhaseAllowed('round_over')).toBe(true);
  });

  it('blocks game_over', () => {
    expect(isEmotePhaseAllowed('game_over')).toBe(false);
  });

  it('blocks unknown phases', () => {
    expect(isEmotePhaseAllowed('')).toBe(false);
    expect(isEmotePhaseAllowed('ended')).toBe(false);
  });
});

// ─── rate-limit helpers ───────────────────────────────────────────────────────

describe('emote rate limiting', () => {
  let lastEmoteAt: Map<string, number>;

  beforeEach(() => {
    lastEmoteAt = new Map();
  });

  it('allows first emote (no prior record)', () => {
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', 1000)).toBe(false);
  });

  it('blocks second emote within rate window', () => {
    const now = 5000;
    recordEmote(lastEmoteAt, 'p1', now);
    // 1 ms later - still inside EMOTE_RATE_MS window
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', now + 1)).toBe(true);
  });

  it('allows emote after rate window expires', () => {
    const first = 5000;
    recordEmote(lastEmoteAt, 'p1', first);
    // Exactly at boundary is still blocked (< not <=), just past is allowed
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', first + EMOTE_RATE_MS - 1)).toBe(true);
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', first + EMOTE_RATE_MS)).toBe(false);
  });

  it('tracks players independently', () => {
    const now = 5000;
    recordEmote(lastEmoteAt, 'p1', now);
    // p2 has no record - not rate-limited
    expect(isEmoteRateLimited(lastEmoteAt, 'p2', now + 1)).toBe(false);
    // p1 still rate-limited
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', now + 1)).toBe(true);
  });

  it('recordEmote updates an existing entry', () => {
    const t1 = 1000;
    recordEmote(lastEmoteAt, 'p1', t1);
    // After window: allowed, then record again
    const t2 = t1 + EMOTE_RATE_MS;
    recordEmote(lastEmoteAt, 'p1', t2);
    // Now rate-limited from t2
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', t2 + 1)).toBe(true);
    expect(isEmoteRateLimited(lastEmoteAt, 'p1', t2 + EMOTE_RATE_MS)).toBe(false);
  });
});

// ─── Canonical EMOTE_IDS list ─────────────────────────────────────────────────

describe('EMOTE_IDS', () => {
  it('contains exactly the six expected emotes', () => {
    expect(EMOTE_IDS).toHaveLength(6);
    expect(EMOTE_IDS).toContain('laugh');
    expect(EMOTE_IDS).toContain('sweat');
    expect(EMOTE_IDS).toContain('taunt');
    expect(EMOTE_IDS).toContain('shock');
    expect(EMOTE_IDS).toContain('cheer');
    expect(EMOTE_IDS).toContain('sus');
  });
});
