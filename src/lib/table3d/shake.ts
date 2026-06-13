// ── Shake detection: pure TS, no framework imports
// Detects deliberate device motion (shaking) via accelerometer.
// Exports interface ShakeDetectorOpts and createShakeDetector factory.

// ── Numeric thresholds (named constants at top of file) ────────────────────────

/** Acceleration magnitude threshold (m/s²) to trigger a shake event.
 *  Default 18 m/s² is the typical "deliberate shake" range on phones.
 */
const DEFAULT_THRESHOLD_MS2 = 18;

/** Low-pass filter alpha for baseline averaging (~0.1). */
const BASELINE_LERP_ALPHA = 0.1;

/** Cooldown between consecutive shake triggers (ms). */
const DEFAULT_COOLDOWN_MS = 800;

// ── Type definitions ───────────────────────────────────────────────────────────

export interface ShakeDetectorOpts {
  threshold?: number;
  cooldownMs?: number;
  onShake: () => void;
}

export interface ShakeDetector {
  start: () => void;
  stop: () => void;
  requestPermission: () => Promise<
    'granted' | 'denied' | 'unsupported' | 'not-required'
  >;
}

// ── Factory function ──────────────────────────────────────────────────────────

export function createShakeDetector(opts: ShakeDetectorOpts): ShakeDetector {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD_MS2;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const onShake = opts.onShake;

  // ── State ──────────────────────────────────────────────────────────────────

  let baseline = 0; // Running low-pass average of acceleration magnitude
  let lastShakeTime = 0; // Timestamp of last shake trigger
  let isListening = false;

  // ── Handler ────────────────────────────────────────────────────────────────

  function handleDeviceMotion(event: DeviceMotionEvent): void {
    // Extract acceleration with fallback order:
    // 1. accelerationIncludingGravity (preferred, includes Earth's 9.8 m/s²)
    // 2. acceleration (fallback, gravity-compensated)
    // 3. undefined-safe zeros
    const accel =
      event.accelerationIncludingGravity ?? event.acceleration;
    const ax = accel?.x ?? 0;
    const ay = accel?.y ?? 0;
    const az = accel?.z ?? 0;

    // Compute magnitude: sqrt(x² + y² + z²)
    const magnitude = Math.sqrt(ax * ax + ay * ay + az * az);

    // Low-pass filter: baseline = baseline * (1 - alpha) + magnitude * alpha
    baseline = baseline * (1 - BASELINE_LERP_ALPHA) + magnitude * BASELINE_LERP_ALPHA;

    // Check if delta (magnitude - baseline) exceeds threshold
    const delta = magnitude - baseline;
    if (delta >= threshold) {
      // Check cooldown
      const now = Date.now();
      if (now - lastShakeTime >= cooldownMs) {
        lastShakeTime = now;
        onShake();
      }
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function start(): void {
    if (isListening) return;
    if (typeof window === 'undefined') return; // SSR-safe

    // Add listener with passive=true for performance
    window.addEventListener('devicemotion', handleDeviceMotion, {
      passive: true,
    });
    isListening = true;
  }

  function stop(): void {
    if (!isListening) return;
    if (typeof window === 'undefined') return; // SSR-safe

    window.removeEventListener('devicemotion', handleDeviceMotion);
    isListening = false;
  }

  // ── Permission request (iOS) ───────────────────────────────────────────────
  // On iOS 13+, DeviceMotionEvent.requestPermission is required.
  // Android and desktop return 'not-required'.
  // If the global is absent entirely, return 'unsupported'.

  async function requestPermission(): Promise<
    'granted' | 'denied' | 'unsupported' | 'not-required'
  > {
    if (typeof window === 'undefined') return 'unsupported'; // SSR-safe

    const DME = (window as any).DeviceMotionEvent;

    // Check if DeviceMotionEvent.requestPermission exists (iOS 13+)
    if (DME && typeof DME.requestPermission === 'function') {
      try {
        const result = await DME.requestPermission();
        // result is 'granted' or 'denied'
        return result as 'granted' | 'denied';
      } catch (_) {
        // If permission call fails, return 'denied'
        return 'denied';
      }
    }

    // Check if DeviceMotionEvent exists at all
    if (DME) {
      // Android or old browser: no permission request needed
      return 'not-required';
    }

    // DeviceMotionEvent does not exist: unsupported
    return 'unsupported';
  }

  // ── Return API ─────────────────────────────────────────────────────────────

  return {
    start,
    stop,
    requestPermission,
  };
}
