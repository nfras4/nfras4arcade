/**
 * Audio metering utilities for frequency analysis and envelope smoothing.
 * Framework-pure: no dependencies on svelte, three, window, or AudioContext.
 * See: docs/table-porting.md for the boundary rule.
 */

/**
 * Compute RMS (root mean square) of frequency bin amplitudes.
 * Standard 0-255 byte-frequency-data input; returns RMS normalised to 0..1.
 *
 * @param samples Uint8Array from analyser.getByteFrequencyData()
 * @returns RMS in the range [0, 1]
 */
export function rms(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const val = samples[i] / 255;
    sum += val * val;
  }
  const mean = sum / samples.length;
  return Math.sqrt(mean);
}

/**
 * Compute RMS over a specific frequency band.
 * Selects bins corresponding to [fLow, fHigh] Hz and averages their RMS.
 *
 * @param samples Uint8Array from analyser.getByteFrequencyData()
 * @param sampleRate Audio context sample rate (e.g. 44100 Hz)
 * @param fftSize FFT size used for the analyser (e.g. 512)
 * @param fLow Low frequency bound (Hz, inclusive)
 * @param fHigh High frequency bound (Hz, inclusive)
 * @returns RMS in the range [0, 1]
 */
export function bandpassRms(
  samples: Uint8Array,
  sampleRate: number,
  fftSize: number,
  fLow: number,
  fHigh: number,
): number {
  const binHz = sampleRate / fftSize;
  const lowBin = Math.max(0, Math.floor(fLow / binHz));
  const highBin = Math.min(samples.length - 1, Math.ceil(fHigh / binHz));

  if (lowBin > highBin) return 0;

  let sum = 0;
  let count = 0;
  for (let i = lowBin; i <= highBin; i++) {
    const val = (samples[i] as number) / 255;
    sum += val * val;
    count++;
  }

  const mean = count > 0 ? sum / count : 0;
  return Math.sqrt(mean);
}

/**
 * Envelope with attack and release phases for smooth amplitude response.
 */
export interface Envelope {
  /**
   * Update the envelope with a new RMS value.
   * Non-finite inputs (NaN/Infinity) are sanitised to 0. The returned value is
   * always within [0, 1] (and within [0, 0.6] if reducedMotion).
   */
  update(rms: number): number;

  /** Reset the envelope to 0. */
  reset(): void;
}

/**
 * Create an envelope with configurable attack and release rates.
 *
 * @param opts Configuration options
 * @param opts.attack Lerp factor when rms > current (0..1, e.g. 0.4)
 * @param opts.release Lerp factor when rms < current (0..1, e.g. 0.15)
 * @param opts.reducedMotion When true, clamp output to 0..0.6
 * @returns Envelope object with update() and reset() methods
 */
export function createEnvelope(opts: {
  attack: number;
  release: number;
  reducedMotion?: boolean;
}): Envelope {
  let current = 0;
  // Clamp attack/release to (0, 1] at construction: 0 would freeze the envelope
  // (lerp factor of 0 never moves toward the target) and >1 overshoots
  // (audit fix #34).
  const attack = Math.max(0.001, Math.min(1, opts.attack));
  const release = Math.max(0.001, Math.min(1, opts.release));
  const { reducedMotion = false } = opts;

  return {
    update(rms: number): number {
      // Sanitise non-finite inputs to prevent NaN poisoning of the accumulator.
      // NaN -> 0 (no signal); +/-Infinity -> 0 then clamped by the final output stage.
      // A non-finite accumulator (defensive, should not occur) is reset to 0.
      if (!Number.isFinite(rms)) rms = 0;
      if (!Number.isFinite(current)) current = 0;

      // Cap the target before the lerp so reducedMotion produces a smooth approach to 0.6
      // instead of a kink from post-lerp clipping.
      const target = reducedMotion ? Math.min(rms, 0.6) : rms;

      if (target > current) {
        current = current + (target - current) * attack;
      } else {
        current = current + (target - current) * release;
      }

      // Final clamp to documented [0, 1] range so out-of-range attack/release coefficients
      // cannot leak overshoot/undershoot to callers.
      if (current < 0) current = 0;
      else if (current > 1) current = 1;

      return current;
    },

    reset(): void {
      current = 0;
    },
  };
}
