/**
 * Shared lazy-singleton AudioContext for table3d voice/chat analysers.
 *
 * Why a singleton:
 *   - Each `new AudioContext()` allocates an audio device thread, and browsers
 *     impose hard caps (~6 contexts on Chrome) before they start refusing.
 *   - The route previously created a fresh context on every voice-join /
 *     mute-toggle. Combined with `VoiceJawDriver`'s own context that was two
 *     contexts per session and growing on every re-effect run.
 *   - One process-wide context is plenty: each analyser/source is its own node
 *     attached to the shared context; closing peers just disconnects nodes.
 *
 * SSR-safety: `window` and `AudioContext` are gated; returns null off-browser.
 */

let shared: AudioContext | null = null;
let creationFailed = false;

/**
 * Returns the shared AudioContext, lazy-creating on first call.
 * Returns null in SSR or when the browser does not expose AudioContext.
 * After a failed creation we do not retry (creationFailed sticks).
 */
export function getSharedAudioContext(): AudioContext | null {
  if (shared) return shared;
  if (creationFailed) return null;
  if (typeof window === 'undefined') return null;
  const Ctor = (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctor) {
    creationFailed = true;
    return null;
  }
  try {
    shared = new Ctor();
    return shared;
  } catch (err) {
    creationFailed = true;
    if (typeof console !== 'undefined') {
      console.warn('[sharedAudioContext] construction failed', err);
    }
    return null;
  }
}

/**
 * Resume the shared AudioContext if it exists and is suspended.
 * Safe to call from user-gesture handlers, visibilitychange listeners, or
 * anywhere a "wake the audio device" hint is appropriate. No-op if no context.
 */
export async function resumeSharedAudioContext(): Promise<void> {
  const ctx = shared;
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore - some contexts refuse without a fresh user gesture */
    }
  }
}

/**
 * Test-only: reset the singleton. Not exported via barrel.
 */
export function __resetSharedAudioContextForTests(): void {
  shared = null;
  creationFailed = false;
}
