/**
 * Web Audio sting player for the Monkey Table emote soundboard.
 *
 * - Lazy singleton AudioContext created on first playSting() call (respects
 *   browser autoplay policy: context is created in response to a user gesture).
 * - Executes StingRecipe voice arrays using the same osc/noise helpers as
 *   src/lib/dungeon/audio.ts.
 * - Mute state persisted to localStorage key 'tableMuted'.
 * - Master gain ~0.5 so stings sit under future voice audio.
 * - No audio files; all sounds are pure synthesis.
 */

import type { StingRecipe, StingVoice } from './core/emotes.js';

// ─── Module-level singleton ───────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let audioDisabled = false;

const MUTE_KEY = 'tableMuted';
const MASTER_GAIN = 0.5;

// Initialise mute from localStorage on module load (client-side only).
let muted = typeof localStorage !== 'undefined'
  ? localStorage.getItem(MUTE_KEY) === '1'
  : false;

// ─── Public API ───────────────────────────────────────────────────────────────

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  }
}

/**
 * Play a sting recipe. Call this inside a user-gesture handler so the
 * AudioContext is allowed to start. Silently no-ops when muted or if
 * Web Audio is unavailable.
 */
export function playSting(recipe: StingRecipe): void {
  if (muted || audioDisabled) return;

  if (!ctx) {
    try {
      ctx = new AudioContext();
      ctx.resume();
    } catch {
      audioDisabled = true;
      return;
    }
  }

  const ac = ctx;
  if (ac.state === 'suspended') ac.resume();

  for (const voice of recipe.voices) {
    playVoice(ac, voice);
  }
}

// ─── Voice execution ──────────────────────────────────────────────────────────

function playVoice(ac: AudioContext, v: StingVoice): void {
  const startSec = ac.currentTime + v.startMs / 1000;
  const endSec   = startSec + v.durationMs / 1000;
  const gain     = v.gain * MASTER_GAIN;

  if (v.wave === 'noise') {
    playNoise(ac, gain, startSec, endSec);
    return;
  }

  const o = ac.createOscillator();
  const g = ac.createGain();
  o.connect(g);
  g.connect(ac.destination);

  o.type = v.wave as OscillatorType;
  o.frequency.setValueAtTime(v.freqStartHz, startSec);

  if (v.freqEndHz !== v.freqStartHz) {
    if (v.glide === 'expo') {
      // exponentialRamp requires a non-zero positive target
      const safeEnd = Math.max(v.freqEndHz, 1);
      o.frequency.exponentialRampToValueAtTime(safeEnd, endSec);
    } else {
      o.frequency.linearRampToValueAtTime(v.freqEndHz, endSec);
    }
  }

  g.gain.setValueAtTime(gain, startSec);
  g.gain.exponentialRampToValueAtTime(0.001, endSec);

  o.start(startSec);
  o.stop(endSec);
}

function playNoise(ac: AudioContext, gain: number, startSec: number, endSec: number): void {
  const duration = endSec - startSec;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * duration), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  src.connect(g);
  g.connect(ac.destination);

  g.gain.setValueAtTime(gain, startSec);
  g.gain.exponentialRampToValueAtTime(0.001, endSec);

  src.start(startSec);
  src.stop(endSec);
}
