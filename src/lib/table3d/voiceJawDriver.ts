/**
 * VoiceJawDriver: polls remote audio streams and drives jaw-flap animation.
 * Browser-only: instantiates AudioContext and AnalyserNode on demand.
 * Feeds amplitude values into TableDirector.talkAmplitudes via callback.
 */

import { bandpassRms, createEnvelope, type Envelope } from './core/audioMeter.js';

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
 *    setAmplitude: (peerId, value) => director.talkAmplitudes = {...},
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
  private pollInterval: ReturnType<typeof setInterval> | null = null;
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

    // Lazy-create the AudioContext
    if (!this.audioContext) {
      if (typeof window === 'undefined' || !window.AudioContext) {
        console.warn('[VoiceJawDriver] AudioContext not available');
        return;
      }
      this.audioContext = new window.AudioContext();
    }

    const ctx = this.audioContext;

    // Create source and analyser
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;

    source.connect(analyser);

    // Create envelope for smooth response. gain=2.5 lifts typical speech
    // RMS (0.15-0.35) into a visible jaw-opening amplitude (0.38-0.88);
    // the envelope post-clamp keeps things capped at 1.0 (or 0.6 under
    // reduced motion).
    const envelope = createEnvelope({
      attack: 0.4,
      release: 0.15,
      gain: 2.5,
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

    // Close the AudioContext if it exists and no peers remain
    if (this.audioContext && this.entries.size === 0) {
      this.audioContext.close().catch(() => {
        // Ignore close errors (some contexts may already be closed)
      });
      this.audioContext = null;
    }
  }

  /**
   * Start the polling interval (100Hz, 10ms per frame).
   */
  private startPolling(): void {
    if (this.pollInterval !== null) return;

    this.pollInterval = setInterval(() => {
      this.tick();
    }, 10);
  }

  /**
   * Stop the polling interval.
   */
  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
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
