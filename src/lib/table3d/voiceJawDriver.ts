/**
 * VoiceJawDriver: polls remote audio streams and drives jaw-flap animation.
 * Browser-only: instantiates AudioContext and AnalyserNode on demand.
 * Feeds amplitude values into TableDirector.voiceAmplitudes via callback.
 */

import { bandpassRms, createEnvelope, type Envelope } from './core/audioMeter.js';
import { getSharedAudioContext } from './sharedAudioContext.js';

export interface VoiceJawDriverOpts {
  /** Called with (peerId, amplitude) when a new frame is polled. */
  setAmplitude(peerId: string, value: number): void;
  /** When true, clamp jaw-flap amplitude to 0..0.6 for accessibility. */
  reducedMotion?: boolean;
}

interface AnalyserEntry {
  peerId: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  buffer: Uint8Array;
  envelope: Envelope;
}

/**
 * VoiceJawDriver: polls WebRTC audio streams and drives jaw-flap amplitude.
 *
 * Usage:
 *  const driver = new VoiceJawDriver({
 *    setAmplitude: (peerId, value) => director.voiceAmplitudes = {...},
 *    reducedMotion: prefersReducedMotion(),
 *  });
 *  driver.attach(peerId, mediaStream);
 *  // ... later ...
 *  driver.detach(peerId);
 *  driver.dispose();
 */
export class VoiceJawDriver {
  private audioContext: AudioContext | null = null;
  private entries = new Map<string, AnalyserEntry>();
  /**
   * requestAnimationFrame id for the active poll loop. Null when idle.
   * Note: previously a setInterval(10ms) loop ran in the background even when
   * the tab was hidden, burning CPU + amplifying browser AudioContext caps.
   * rAF naturally pauses with the tab and gives us a free ~60Hz tick instead.
   */
  private rafId: number | null = null;
  private setAmplitudeCallback: (peerId: string, value: number) => void;
  private reducedMotion: boolean;

  constructor(opts: VoiceJawDriverOpts) {
    this.setAmplitudeCallback = opts.setAmplitude;
    this.reducedMotion = opts.reducedMotion ?? false;
  }

  /**
   * Attach a remote peer's media stream.
   * Creates AnalyserNode and starts polling if not already active.
   */
  attach(peerId: string, stream: MediaStream): void {
    if (this.entries.has(peerId)) {
      return; // already attached
    }

    // Use the shared singleton AudioContext (lazy-initialised in the module).
    // Avoids stacking multiple devices and lets the visibilitychange listener
    // wake every analyser at once on tab focus.
    if (!this.audioContext) {
      const ctxShared = getSharedAudioContext();
      if (!ctxShared) {
        console.warn('[VoiceJawDriver] AudioContext not available');
        return;
      }
      this.audioContext = ctxShared;
    }

    const ctx = this.audioContext;

    // Create source and analyser
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;

    source.connect(analyser);

    // Create envelope for smooth response
    const envelope = createEnvelope({
      attack: 0.4,
      release: 0.15,
      reducedMotion: this.reducedMotion,
    });

    // Create frequency buffer
    const bufferLen = analyser.frequencyBinCount;
    const buffer = new Uint8Array(bufferLen);

    this.entries.set(peerId, {
      peerId,
      source,
      analyser,
      buffer,
      envelope,
    });

    // Start polling if this is the first entry
    if (this.entries.size === 1) {
      this.startPolling();
    }
  }

  /**
   * Detach a remote peer and clean up its analyser.
   */
  detach(peerId: string): void {
    const entry = this.entries.get(peerId);
    if (!entry) return;

    // Disconnect and clean up
    entry.source.disconnect();
    entry.analyser.disconnect();

    // Signal zero amplitude
    this.setAmplitudeCallback(peerId, 0);

    this.entries.delete(peerId);

    // Stop polling if no entries remain
    if (this.entries.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Dispose the driver: detach all peers and close AudioContext if present.
   */
  dispose(): void {
    // Detach all peers
    const peerIds = Array.from(this.entries.keys());
    for (const peerId of peerIds) {
      this.detach(peerId);
    }

    // Drop our reference; do NOT close the shared singleton, the page (or
    // any other driver) may still need it. The shared context closes on
    // page unload via the browser.
    this.audioContext = null;
  }

  /**
   * Start the rAF poll loop. Was setInterval(10ms); now driven by
   * requestAnimationFrame so it naturally pauses with the tab.
   */
  private startPolling(): void {
    if (this.rafId !== null) return;
    if (typeof window === 'undefined' || !window.requestAnimationFrame) return;

    const loop = () => {
      this.tick();
      // Re-check rafId so a stop mid-tick doesn't leave a stray frame
      // requested after detach() drained the entries map.
      if (this.entries.size > 0) {
        this.rafId = window.requestAnimationFrame(loop);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = window.requestAnimationFrame(loop);
  }

  /**
   * Stop the rAF poll loop.
   */
  private stopPolling(): void {
    if (this.rafId !== null) {
      if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(this.rafId);
      }
      this.rafId = null;
    }
  }

  /**
   * Poll all active analysers and update amplitudes.
   */
  private tick(): void {
    if (!this.audioContext) return;

    for (const entry of this.entries.values()) {
      // Get frequency data
      entry.analyser.getByteFrequencyData(entry.buffer as Uint8Array<ArrayBuffer>);

      // Compute RMS in the speech band (250-3500 Hz)
      const sampleRate = this.audioContext.sampleRate;
      const fftSize = entry.analyser.fftSize;
      const rawRms = bandpassRms(
        entry.buffer as Uint8Array,
        sampleRate,
        fftSize,
        250,  // fLow
        3500  // fHigh
      );

      // Apply envelope smoothing
      const smoothed = entry.envelope.update(rawRms);

      // Update the callback
      this.setAmplitudeCallback(entry.peerId, smoothed);
    }
  }
}
