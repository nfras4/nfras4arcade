let ctx: AudioContext | null = null
let audioDisabled = false
let muted = true

export function setMuted(b: boolean): void {
  muted = b
}

export function isMuted(): boolean { return muted }

function getCtx(): AudioContext | null {
  if (muted || audioDisabled) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
      ctx.resume()
    } catch {
      audioDisabled = true
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function osc(ac: AudioContext, type: OscillatorType, freq: number, vol: number, start: number, end: number, freqEnd?: number): void {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.connect(g)
  g.connect(ac.destination)
  o.type = type
  o.frequency.setValueAtTime(freq, ac.currentTime + start)
  if (freqEnd !== undefined) o.frequency.linearRampToValueAtTime(freqEnd, ac.currentTime + end)
  g.gain.setValueAtTime(0, ac.currentTime + start)
  g.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.01)
  g.gain.linearRampToValueAtTime(0, ac.currentTime + end)
  o.start(ac.currentTime + start)
  o.stop(ac.currentTime + end)
}

function noise(ac: AudioContext, vol: number, start: number, end: number, cutoff = 4000): void {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * (end - start)), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(cutoff, ac.currentTime + start)
  filter.frequency.linearRampToValueAtTime(200, ac.currentTime + end)
  const g = ac.createGain()
  src.connect(filter)
  filter.connect(g)
  g.connect(ac.destination)
  g.gain.setValueAtTime(0, ac.currentTime + start)
  g.gain.linearRampToValueAtTime(vol, ac.currentTime + start + 0.01)
  g.gain.linearRampToValueAtTime(0, ac.currentTime + end)
  src.start(ac.currentTime + start)
  src.stop(ac.currentTime + end)
}

export function playJump(): void {
  const ac = getCtx()
  if (!ac) return
  osc(ac, 'sine', 220, 0.15, 0, 0.08, 440)
}

export function playDoubleJump(): void {
  const ac = getCtx()
  if (!ac) return
  osc(ac, 'sine', 440, 0.15, 0, 0.06, 550)
  osc(ac, 'sine', 550, 0.15, 0.06, 0.12, 660)
}

export function playHit(): void {
  const ac = getCtx()
  if (!ac) return
  noise(ac, 0.15, 0, 0.15, 800)
  osc(ac, 'square', 120, 0.12, 0, 0.15, 60)
}

export function playDeath(): void {
  const ac = getCtx()
  if (!ac) return
  osc(ac, 'sawtooth', 440, 0.15, 0, 0.40, 80)
}

export function playVictory(): void {
  const ac = getCtx()
  if (!ac) return
  // C major arpeggio: C5 (523 Hz), E5 (659 Hz), G5 (784 Hz)
  osc(ac, 'sine', 523, 0.15, 0,    0.20)
  osc(ac, 'sine', 659, 0.15, 0.20, 0.40)
  osc(ac, 'sine', 784, 0.15, 0.40, 0.60)
}

export function playPowerup(): void {
  const ac = getCtx()
  if (!ac) return
  osc(ac, 'triangle', 600, 0.15, 0, 0.20, 1200)
}
