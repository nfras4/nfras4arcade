import { describe, it, expect } from 'vitest';
import {
  voiceParamsFor,
  buildBlipRecipe,
  revealSchedule,
} from '../chatVoice.js';
import { FUR_COLOURS } from '../rig.js';

// ─── voiceParamsFor ───────────────────────────────────────────────────────

describe('voiceParamsFor', () => {
  it('returns deterministic params for the same fur colour', () => {
    const params1 = voiceParamsFor('#8B5E3C');
    const params2 = voiceParamsFor('#8B5E3C');
    expect(params1).toEqual(params2);
  });

  it('produces baseHz in the range [280, 540]', () => {
    for (const colour of FUR_COLOURS) {
      const params = voiceParamsFor(colour);
      expect(params.baseHz).toBeGreaterThanOrEqual(280);
      expect(params.baseHz).toBeLessThanOrEqual(540);
    }
  });

  it('produces distinct baseHz across the canonical fur colours', () => {
    const frequencies = new Set<number>();
    for (const colour of FUR_COLOURS) {
      const params = voiceParamsFor(colour);
      frequencies.add(params.baseHz);
    }
    // At least 3 of the 6 colours should produce distinct frequencies
    expect(frequencies.size).toBeGreaterThanOrEqual(3);
  });

  it('produces charDetuneCents in [-12, -4, 4, 12]', () => {
    const seenValues = new Set<number>();
    for (const colour of FUR_COLOURS) {
      const params = voiceParamsFor(colour);
      seenValues.add(params.charDetuneCents);
      expect([-12, -4, 4, 12]).toContain(params.charDetuneCents);
    }
  });

  it('always returns durationMs=80 and gain=0.18', () => {
    for (const colour of FUR_COLOURS) {
      const params = voiceParamsFor(colour);
      expect(params.durationMs).toBe(80);
      expect(params.gain).toBe(0.18);
    }
  });
});

// ─── buildBlipRecipe ──────────────────────────────────────────────────────

describe('buildBlipRecipe', () => {
  const voice = voiceParamsFor('#8B5E3C');

  it('produces a recipe with one voice for a non-space character', () => {
    const recipe = buildBlipRecipe('a', voice, 0);
    expect(recipe.voices).toHaveLength(1);
  });

  it('produces an empty voices array for a space', () => {
    const recipe = buildBlipRecipe(' ', voice, 0);
    expect(recipe.voices).toHaveLength(0);
  });

  it('is deterministic (same char, voice, index → same recipe)', () => {
    const recipe1 = buildBlipRecipe('x', voice, 5);
    const recipe2 = buildBlipRecipe('x', voice, 5);
    expect(recipe1.voices[0]?.freqStartHz).toEqual(recipe2.voices[0]?.freqStartHz);
    expect(recipe1.voices[0]?.freqEndHz).toEqual(recipe2.voices[0]?.freqEndHz);
  });

  it('produces different frequencies for different indices', () => {
    const recipe1 = buildBlipRecipe('a', voice, 0);
    const recipe2 = buildBlipRecipe('a', voice, 1);
    expect(recipe1.voices[0]?.freqStartHz).not.toEqual(recipe2.voices[0]?.freqStartHz);
  });

  it('produces freqEndHz at 92% of freqStartHz', () => {
    const recipe = buildBlipRecipe('b', voice, 2);
    const v = recipe.voices[0];
    if (v) {
      expect(v.freqEndHz).toBeCloseTo(v.freqStartHz * 0.92, 1);
    }
  });

  it('uses square wave for all blips', () => {
    const recipe = buildBlipRecipe('c', voice, 0);
    expect(recipe.voices[0]?.wave).toBe('square');
  });

  it('respects voice.durationMs and voice.gain', () => {
    const recipe = buildBlipRecipe('d', voice, 0);
    expect(recipe.voices[0]?.durationMs).toBe(voice.durationMs);
    expect(recipe.voices[0]?.gain).toBe(voice.gain);
  });
});

// ─── revealSchedule ───────────────────────────────────────────────────────

describe('revealSchedule', () => {
  it('returns monotonically increasing delaysMs', () => {
    const { delaysMs } = revealSchedule('hello', 30);
    for (let i = 1; i < delaysMs.length; i++) {
      expect(delaysMs[i]).toBeGreaterThan(delaysMs[i - 1]);
    }
  });

  it('spaces consume time in the schedule', () => {
    const { delaysMs: schedule1 } = revealSchedule('hello world', 30);
    expect(schedule1).toHaveLength(11); // 11 characters total
    // Space is at index 5, should have a delay
    expect(schedule1[5]).toBeGreaterThan(0);
  });

  it('computes totalMs ≈ length * 1000/charsPerSec', () => {
    const text = 'hello';
    const charsPerSec = 30;
    const { totalMs } = revealSchedule(text, charsPerSec);
    const expectedMs = (text.length - 1) * (1000 / charsPerSec) + 1;
    expect(totalMs).toBeCloseTo(expectedMs, 0);
  });

  it('starts with delaysMs[0] = 0', () => {
    const { delaysMs } = revealSchedule('hello', 30);
    expect(delaysMs[0]).toBe(0);
  });

  it('handles empty string', () => {
    const { delaysMs, totalMs } = revealSchedule('', 30);
    expect(delaysMs).toEqual([]);
    expect(totalMs).toBe(0);
  });

  it('handles single character', () => {
    const { delaysMs, totalMs } = revealSchedule('a', 30);
    expect(delaysMs).toHaveLength(1);
    expect(delaysMs[0]).toBe(0);
    expect(totalMs).toBe(1); // one char takes 1 ms minimum
  });

  it('respects custom charsPerSec', () => {
    const text = 'hello';
    const { delaysMs: fast } = revealSchedule(text, 60);
    const { delaysMs: slow } = revealSchedule(text, 30);
    // At same index, fast reveal should have smaller delay
    expect(fast[2]!).toBeLessThan(slow[2]!);
  });

  it('pauses longer at spaces than between letters', () => {
    const { delaysMs } = revealSchedule('ab c', 30);
    const letterStep = delaysMs[1]! - delaysMs[0]!;        // a -> b
    const spaceStep = delaysMs[3]! - delaysMs[2]!;          // ' ' -> c (interval AFTER space)
    expect(spaceStep).toBeGreaterThan(letterStep);
  });

  it('pauses longer at commas than spaces', () => {
    const { delaysMs } = revealSchedule('a, b', 30);
    // Index 1 is ',', index 2 is ' '. The interval AFTER the comma is the comma pause.
    const commaPause = delaysMs[2]! - delaysMs[1]!;
    const spacePause = delaysMs[3]! - delaysMs[2]!;
    expect(commaPause).toBeGreaterThan(spacePause);
  });

  it('pauses longest at full stops', () => {
    const { delaysMs } = revealSchedule('a. b', 30);
    const fullStopPause = delaysMs[2]! - delaysMs[1]!;     // pause AFTER '.'
    const spacePause = delaysMs[3]! - delaysMs[2]!;
    expect(fullStopPause).toBeGreaterThan(spacePause);
  });

  it('treats !, ?, ; and : as expected', () => {
    const tests = [
      ['a!b', 'fullStop'],
      ['a?b', 'fullStop'],
      ['a;b', 'comma'],
      ['a:b', 'comma'],
    ] as const;
    const { delaysMs: ref } = revealSchedule('aab', 30);
    const letterStep = ref[1]! - ref[0]!;
    for (const [text, kind] of tests) {
      const { delaysMs } = revealSchedule(text, 30);
      const pause = delaysMs[2]! - delaysMs[1]!;
      if (kind === 'fullStop') expect(pause).toBeCloseTo(letterStep * 8, 1);
      if (kind === 'comma') expect(pause).toBeCloseTo(letterStep * 5, 1);
    }
  });
});
