import { describe, it, expect } from 'vitest';
import { rms, bandpassRms, createEnvelope } from '../audioMeter.js';

// ─── RMS ──────────────────────────────────────────────────────────────────────

describe('rms', () => {
  it('returns 0 for zero input', () => {
    const samples = new Uint8Array(512);
    expect(rms(samples)).toBe(0);
  });

  it('returns 1.0 for uniform 255 input', () => {
    const samples = new Uint8Array(512);
    samples.fill(255);
    expect(rms(samples)).toBeCloseTo(1.0, 5);
  });

  it('computes RMS of a ramp 0..255', () => {
    const samples = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      samples[i] = i;
    }
    const result = rms(samples);
    // RMS of uniform distribution [0, 1] is sqrt(1/3) ≈ 0.577
    expect(result).toBeCloseTo(Math.sqrt(1 / 3), 2);
  });

  it('returns a value between 0 and 1', () => {
    const samples = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      samples[i] = Math.floor(Math.random() * 256);
    }
    const result = rms(samples);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ─── Bandpass RMS ─────────────────────────────────────────────────────────────

describe('bandpassRms', () => {
  it('returns 0 for zero input', () => {
    const samples = new Uint8Array(256);
    const result = bandpassRms(samples, 44100, 512, 250, 3500);
    expect(result).toBe(0);
  });

  it('ignores out-of-band bins', () => {
    const samples = new Uint8Array(256);
    // Set only the first bin (out of band for 250Hz)
    samples[0] = 255;
    const result = bandpassRms(samples, 44100, 512, 250, 3500);
    // Should be much lower than 1.0 since one non-zero bin is spread across the calculation
    expect(result).toBeLessThan(0.5);
  });

  it('selects in-band bins correctly', () => {
    const samples = new Uint8Array(256);
    // Fill only bins 3-40 (roughly 250-3500 Hz at 44100/512)
    for (let i = 3; i <= 40; i++) {
      samples[i] = 255;
    }
    const result = bandpassRms(samples, 44100, 512, 250, 3500);
    // Should be close to 1.0 since all selected bins are at max
    expect(result).toBeCloseTo(1.0, 1);
  });

  it('handles edge case: fLow > fHigh', () => {
    const samples = new Uint8Array(256);
    samples.fill(128);
    const result = bandpassRms(samples, 44100, 512, 3500, 250);
    expect(result).toBe(0);
  });

  it('clamps to valid bin range', () => {
    const samples = new Uint8Array(256);
    samples.fill(255);
    // Request a range far beyond the sample array
    const result = bandpassRms(samples, 44100, 512, 10000, 20000);
    // Should still compute something (upper bins are included)
    expect(result).toBeGreaterThan(0);
  });
});

// ─── Envelope ─────────────────────────────────────────────────────────────────

describe('createEnvelope', () => {
  it('starts at 0', () => {
    const env = createEnvelope({ attack: 0.4, release: 0.15 });
    expect(env.update(0)).toBe(0);
  });

  it('attack is faster than release', () => {
    const env1 = createEnvelope({ attack: 0.4, release: 0.15 });
    const env2 = createEnvelope({ attack: 0.4, release: 0.15 });

    // Drive up with high input (attack)
    env1.update(1.0);
    const afterAttack = env1.update(1.0);

    // Drive down with low input (release)
    env2.update(1.0);
    env2.update(1.0);
    const afterRelease = env2.update(0);

    // After a few steps, attack should have climbed further than release dropped
    expect(afterAttack).toBeGreaterThan(afterRelease);
  });

  it('converges to steady-state input', () => {
    const env = createEnvelope({ attack: 0.4, release: 0.15 });
    let current = 0;
    for (let i = 0; i < 100; i++) {
      current = env.update(0.5);
    }
    expect(current).toBeCloseTo(0.5, 1);
  });

  it('reducedMotion clamps at 0.6', () => {
    const env = createEnvelope({ attack: 1.0, release: 0.15, reducedMotion: true });
    // Drive with high input
    env.update(1.0);
    const result = env.update(1.0);
    expect(result).toBeLessThanOrEqual(0.6);
  });

  it('gain amplifies input before clamping', () => {
    const plain = createEnvelope({ attack: 1.0, release: 0.15 });
    const amped = createEnvelope({ attack: 1.0, release: 0.15, gain: 2.5 });
    // Same modest RMS input
    plain.update(0.25);
    amped.update(0.25);
    const plainSteady = plain.update(0.25);
    const ampedSteady = amped.update(0.25);
    // With gain 2.5, target = 0.625; plain target = 0.25
    expect(ampedSteady).toBeGreaterThan(plainSteady);
    expect(ampedSteady).toBeCloseTo(0.625, 1);
    expect(plainSteady).toBeCloseTo(0.25, 1);
  });

  it('gain saturates at 1.0 even when product exceeds it', () => {
    const env = createEnvelope({ attack: 1.0, release: 0.15, gain: 4.0 });
    env.update(0.5);   // target = 4.0 * 0.5 = 2.0, clamped to 1.0
    const result = env.update(0.5);
    expect(result).toBeLessThanOrEqual(1.0);
    expect(result).toBeCloseTo(1.0, 1);
  });

  it('reset returns to 0', () => {
    const env = createEnvelope({ attack: 0.4, release: 0.15 });
    env.update(1.0);
    env.update(1.0);
    env.reset();
    expect(env.update(0)).toBe(0);
  });

  it('smoothly transitions down on low input', () => {
    const env = createEnvelope({ attack: 0.4, release: 0.15 });
    env.update(1.0);
    env.update(1.0);
    const high = env.update(1.0);

    // Now drive down
    const mid = env.update(0);
    const low = env.update(0);

    expect(mid).toBeLessThan(high);
    expect(low).toBeLessThan(mid);
  });
});
