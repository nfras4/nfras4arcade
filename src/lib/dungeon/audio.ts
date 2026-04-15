type SoundId =
  | 'hit' | 'crit' | 'player-hit' | 'death'
  | 'level-up' | 'gold' | 'item-drop' | 'boss-spawn'
  | 'stun' | 'prestige' | 'craft' | 'craft-perfect'
  | 'dodge-hit' | 'dodge-perfect'

let ctx: AudioContext | null = null
let audioDisabled = false
let muted = typeof localStorage !== 'undefined' ? localStorage.getItem('wdMuted') === '1' : true

export function initAudio(): void {
  // no-op: AudioContext is created lazily on first playSound() call
}

export function setMuted(m: boolean): void {
  muted = m
  if (typeof localStorage !== 'undefined') localStorage.setItem('wdMuted', m ? '1' : '0')
}

export function isMuted(): boolean { return muted }

export function playSound(id: SoundId, volume = 0.3): void {
  if (muted || audioDisabled) return

  if (!ctx) {
    try {
      ctx = new AudioContext()
      ctx.resume()
    } catch {
      audioDisabled = true
      return
    }
  }

  const ac = ctx
  if (ac.state === 'suspended') ac.resume()

  switch (id) {
    case 'hit':           playHit(ac, volume); break
    case 'crit':          playCrit(ac, volume); break
    case 'player-hit':    playPlayerHit(ac, volume); break
    case 'death':         playDeath(ac, volume); break
    case 'level-up':      playLevelUp(ac, volume); break
    case 'gold':          playGold(ac, volume); break
    case 'item-drop':     playItemDrop(ac, volume); break
    case 'boss-spawn':    playBossSpawn(ac, volume); break
    case 'stun':          playStun(ac, volume); break
    case 'prestige':      playPrestige(ac, volume); break
    case 'craft':         playCraft(ac, volume); break
    case 'craft-perfect': playCraftPerfect(ac, volume); break
    case 'dodge-hit':     playDodgeHit(ac, volume); break
    case 'dodge-perfect': playDodgePerfect(ac, volume); break
  }
}

function osc(ac: AudioContext, type: OscillatorType, freq: number, vol: number, start: number, end: number, freqEnd?: number): void {
  const o = ac.createOscillator()
  const g = ac.createGain()
  o.connect(g)
  g.connect(ac.destination)
  o.type = type
  o.frequency.setValueAtTime(freq, ac.currentTime + start)
  if (freqEnd !== undefined) o.frequency.linearRampToValueAtTime(freqEnd, ac.currentTime + end)
  g.gain.setValueAtTime(vol, ac.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + end)
  o.start(ac.currentTime + start)
  o.stop(ac.currentTime + end)
}

function noise(ac: AudioContext, vol: number, start: number, end: number): void {
  const buf = ac.createBuffer(1, ac.sampleRate * (end - start), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const g = ac.createGain()
  src.connect(g)
  g.connect(ac.destination)
  g.gain.setValueAtTime(vol, ac.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + end)
  src.start(ac.currentTime + start)
  src.stop(ac.currentTime + end)
}

function playHit(ac: AudioContext, v: number): void {
  noise(ac, v * 0.8, 0, 0.06)
  osc(ac, 'square', 180, v * 0.4, 0, 0.08, 100)
}

function playCrit(ac: AudioContext, v: number): void {
  noise(ac, v * 0.9, 0, 0.07)
  osc(ac, 'square', 320, v * 0.5, 0, 0.10, 180)
  osc(ac, 'sine', 640, v * 0.3, 0.05, 0.20)
}

function playPlayerHit(ac: AudioContext, v: number): void {
  noise(ac, v * 0.7, 0, 0.10)
  osc(ac, 'sawtooth', 100, v * 0.5, 0, 0.15, 60)
}

function playDeath(ac: AudioContext, v: number): void {
  osc(ac, 'sawtooth', 220, v, 0, 0.05, 160)
  osc(ac, 'sawtooth', 160, v * 0.8, 0.05, 0.12, 80)
  osc(ac, 'sine', 80, v * 0.6, 0.12, 0.20, 40)
}

function playLevelUp(ac: AudioContext, v: number): void {
  osc(ac, 'sine', 440, v, 0, 0.10)
  osc(ac, 'sine', 550, v, 0.10, 0.20)
  osc(ac, 'sine', 660, v * 1.2, 0.20, 0.35)
}

function playGold(ac: AudioContext, v: number): void {
  osc(ac, 'sine', 880, v * 0.7, 0, 0.12)
}

function playItemDrop(ac: AudioContext, v: number): void {
  osc(ac, 'sine', 660, v * 0.8, 0, 0.10)
  osc(ac, 'sine', 880, v * 0.9, 0.08, 0.22)
}

function playBossSpawn(ac: AudioContext, v: number): void {
  noise(ac, v * 0.6, 0, 0.15)
  osc(ac, 'sawtooth', 55, v, 0, 0.20)
  osc(ac, 'square', 330, v * 0.8, 0.22, 0.32)
}

function playStun(ac: AudioContext, v: number): void {
  osc(ac, 'sine', 120, v, 0, 0.08, 80)
  osc(ac, 'sine', 80, v * 0.7, 0.08, 0.20, 110)
  osc(ac, 'sine', 110, v * 0.5, 0.20, 0.30, 80)
}

function playPrestige(ac: AudioContext, v: number): void {
  const notes = [261, 329, 392, 523, 659, 784]
  notes.forEach((f, i) => osc(ac, 'sine', f, v, i * 0.08, i * 0.08 + 0.18))
}

function playCraft(ac: AudioContext, v: number): void {
  noise(ac, v * 0.4, 0, 0.04)
  osc(ac, 'square', 440, v * 0.6, 0.02, 0.14)
}

function playCraftPerfect(ac: AudioContext, v: number): void {
  playCraft(ac, v)
  osc(ac, 'sine', 880, v * 0.7, 0.12, 0.22)
  osc(ac, 'sine', 1100, v * 0.5, 0.18, 0.30)
  osc(ac, 'sine', 1320, v * 0.4, 0.24, 0.38)
}

function playDodgeHit(ac: AudioContext, v: number): void {
  noise(ac, v * 0.6, 0, 0.04)
  osc(ac, 'sawtooth', 220, v * 0.8, 0, 0.06, 120)
}

function playDodgePerfect(ac: AudioContext, v: number): void {
  osc(ac, 'sine', 440, v * 0.6, 0,    0.12)
  osc(ac, 'sine', 660, v * 0.7, 0.10, 0.22)
  osc(ac, 'sine', 880, v * 0.8, 0.18, 0.32)
  osc(ac, 'sine', 1100, v * 0.6, 0.26, 0.42)
}
