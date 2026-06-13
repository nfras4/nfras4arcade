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
 * @param opts.gain Multiplier applied to the rms input before clamping
 *                  (default 1.0). Voice paths typically pass 2.5 so a
 *                  normal speech RMS of 0.15-0.35 maps to a jaw-opening
 *                  amplitude of 0.38-0.88 instead of barely flickering.
 * @param opts.reducedMotion When true, clamp output to 0..0.6
 * @returns Envelope object with update() and reset() methods
 */
export function createEnvelope(opts: {
  attack: number;
  release: number;
  gain?: number;
  reducedMotion?: boolean;
}): Envelope {
  let current = 0;
  const { attack, release, gain = 1, reducedMotion = false } = opts;

  return {
    update(rms: number): number {
      // Sanitise non-finite inputs first so gain + reducedMotion maths cannot
      // be poisoned by NaN/Infinity (NaN propagates through every arithmetic
      // op below; a non-finite accumulator is reset defensively).
      if (!Number.isFinite(rms)) rms = 0;
      if (!Number.isFinite(current)) current = 0;

      // Apply gain BEFORE the lerp so the envelope smooths the already-amplified
      // target. The ceiling is 0.6 under reducedMotion (smooth approach with no
      // post-lerp kink), 1.0 otherwise. Anything above the ceiling saturates.
      const ceiling = reducedMotion ? 0.6 : 1;
      let target = rms * gain;
      if (target < 0) target = 0;
      else if (target > ceiling) target = ceiling;

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
