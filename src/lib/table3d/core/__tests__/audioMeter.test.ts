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

  it('returns 0 for empty input (no NaN from divide-by-zero)', () => {
    const samples = new Uint8Array(0);
    const result = rms(samples);
    expect(result).toBe(0);
    expect(Number.isNaN(result)).toBe(false);
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

  it('NaN input is sanitised to 0 and recovers on next valid input', () => {
    const env = createEnvelope({ attack: 0.4, release: 0.15 });
    // Build up some current first
    env.update(0.5);
    env.update(0.5);
    const before = env.update(0.5);
    expect(before).toBeGreaterThan(0);

    // NaN must not poison the accumulator
    const onNaN = env.update(NaN);
    expect(Number.isFinite(onNaN)).toBe(true);
    expect(Number.isNaN(onNaN)).toBe(false);
    expect(onNaN).toBeGreaterThanOrEqual(0);
    expect(onNaN).toBeLessThanOrEqual(1);

    // Next valid input recovers normally (envelope is still tracking)
    const recovered = env.update(0.5);
    expect(Number.isFinite(recovered)).toBe(true);
    expect(recovered).toBeGreaterThan(onNaN);
  });

  it('Infinity input is sanitised and output stays clamped in [0, 1]', () => {
    const env = createEnvelope({ attack: 1.0, release: 0.15 });
    const result = env.update(Infinity);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('reducedMotion approaches 0.6 smoothly with no kink', () => {
    // With reducedMotion, the cap is applied to the TARGET (before the lerp),
    // so the envelope should approach 0.6 asymptotically rather than overshoot
    // and then get clipped (which would produce a kink in the trajectory).
    const env = createEnvelope({ attack: 0.4, release: 0.15, reducedMotion: true });
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      samples.push(env.update(1.0));
    }

    // Every sample must respect the cap
    for (const v of samples) {
      expect(v).toBeLessThanOrEqual(0.6 + 1e-9);
    }

    // Trajectory must be monotonically non-decreasing (no kink/dip)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]! - 1e-9);
    }

    // Should converge close to 0.6
    expect(samples[samples.length - 1]).toBeCloseTo(0.6, 2);
  });

  it('final output never exceeds 1.0 even with attack > 1', () => {
    // Out-of-range attack coefficient could overshoot without the final clamp.
    const env = createEnvelope({ attack: 2.5, release: 0.15 });
    for (let i = 0; i < 20; i++) {
      const v = env.update(1.0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
