export type DodgeResult =
  | 'perfect'   // no hits taken
  | 'partial'   // 1-2 hits taken
  | 'failed'    // 3+ hits taken or time expired

export type ProjectileShape =
  | 'bullet'    // small fast circle
  | 'wave'      // horizontal sweep with gap
  | 'spiral'    // rotating projectiles
  | 'rain'      // falling from top
  | 'wall'      // vertical wall with gap
  | 'cross'     // plus-shaped sweep
  | 'chaos'     // random bouncing

export type DodgePattern = {
  id: string
  duration: number        // ms
  projectiles: ProjectileConfig[]
  bossSprite: string      // emoji shown in background
  palette: {
    bg: string
    heartColour: string
    projectileColour: string
    accentColour: string
  }
}

export type ProjectileConfig = {
  shape: ProjectileShape
  spawnAt: number         // ms into the sequence
  speed: number           // pixels per second
  size: number            // radius in px
  count: number           // how many projectiles
  colour: string
  gapSize?: number        // for wave/wall shapes
}

export type DodgeState = {
  active: boolean
  pattern: DodgePattern | null
  heartX: number          // 0-100 percent of arena width
  heartY: number          // 0-100 percent of arena height
  hitsThisSequence: number
  result: DodgeResult | null
  elapsedMs: number
  triggerType: 'special' | 'phase'
  pendingDamage: number   // damage to apply after dodge ends
  pendingHitType: 'boss_special' | 'dodge_partial' | 'dodge_failed' | 'dodge_perfect'
  bossName: string        // "SEB ATTACKS!" shown on entry
  flavourText: string     // boss quote shown on entry
}

export const DODGE_TRIGGER_TEXT: Record<string, string> = {
  'johno':         'Something came out of the basement.',
  'the-coach':     'BOX OUT!!',
  'the-examiner':  'Connor has left the building.',
  'edrian':        'bro watch this',
  'head-coach':    'DUNK.',
  'zone-manager':  'knew it',
  'chief-surgeon': 'He says his back is fine.',
  'damo':          '',
  'the-ceo':       'Wolton Industries invoices you.',
  'nick':          'MONKEY BARREL',
}

export const BOSS_DODGE_PATTERNS: Record<string, DodgePattern[]> = {

  // ZONE 1 — JOHNO (simplest)
  'johno': [{
    id: 'mystery-rain',
    duration: 6000,
    bossSprite: '🚪',
    palette: { bg: '#0a140a', heartColour: '#ff4040', projectileColour: '#40c060', accentColour: '#2a5a2a' },
    projectiles: [
      { shape: 'rain', spawnAt: 0,    speed: 120, size: 8, count: 6,  colour: '#40c06088' },
      { shape: 'rain', spawnAt: 2000, speed: 140, size: 6, count: 8,  colour: '#40ff4088' },
    ],
  }],

  // ZONE 2 — BIG X (slow walls, clear gaps)
  'the-coach': [{
    id: 'basketball-wall',
    duration: 7000,
    bossSprite: '🏀',
    palette: { bg: '#140e00', heartColour: '#ff4040', projectileColour: '#c07010', accentColour: '#c07010' },
    projectiles: [
      { shape: 'wave', spawnAt: 0,    speed: 100, size: 16, count: 1, colour: '#c0701088', gapSize: 80 },
      { shape: 'wave', spawnAt: 2500, speed: 120, size: 16, count: 1, colour: '#c0701088', gapSize: 70 },
      { shape: 'wave', spawnAt: 5000, speed: 140, size: 14, count: 1, colour: '#e0801088', gapSize: 60 },
    ],
  }],

  // ZONE 3 — CONNOR (teleporting bullets)
  'the-examiner': [{
    id: 'teleport-shots',
    duration: 7000,
    bossSprite: '🎓',
    palette: { bg: '#120e04', heartColour: '#ff4040', projectileColour: '#a07828', accentColour: '#a07828' },
    projectiles: [
      { shape: 'bullet', spawnAt: 0,    speed: 160, size: 8, count: 4, colour: '#a0782888' },
      { shape: 'bullet', spawnAt: 1500, speed: 180, size: 8, count: 4, colour: '#c09030aa' },
      { shape: 'bullet', spawnAt: 3000, speed: 200, size: 6, count: 6, colour: '#c09030aa' },
      { shape: 'bullet', spawnAt: 5000, speed: 220, size: 6, count: 8, colour: '#ffaa4488' },
    ],
  }],

  // ZONE 4 — EDRIAN (taco rain, pauses mid-pattern)
  'edrian': [{
    id: 'taco-rain',
    duration: 8000,
    bossSprite: '🌮',
    palette: { bg: '#120618', heartColour: '#ff4040', projectileColour: '#e020ff', accentColour: '#ff6020' },
    projectiles: [
      { shape: 'rain',   spawnAt: 0,    speed: 130, size: 10, count: 7,  colour: '#ff602088' },
      { shape: 'rain',   spawnAt: 4500, speed: 150, size: 10, count: 9,  colour: '#e020ff88' },
      { shape: 'bullet', spawnAt: 6500, speed: 170, size: 8,  count: 5,  colour: '#ff802088' },
    ],
  }],

  // ZONE 5 — SEB (mostly misses, one massive dunk)
  'head-coach': [{
    id: 'clumsy-dunk',
    duration: 8000,
    bossSprite: '⛹️',
    palette: { bg: '#060e18', heartColour: '#ff4040', projectileColour: '#1860a0', accentColour: '#20a0ff' },
    projectiles: [
      { shape: 'bullet', spawnAt: 0,    speed: 80, size: 12, count: 3, colour: '#1860a044' },
      { shape: 'bullet', spawnAt: 2000, speed: 90, size: 12, count: 4, colour: '#1860a044' },
      { shape: 'wall',   spawnAt: 5000, speed: 60, size: 40, count: 1, colour: '#20a0ffcc', gapSize: 50 },
    ],
  }],

  // ZONE 6 — HAYDEN (phone rain + gambling chip)
  'zone-manager': [{
    id: 'phone-gamble',
    duration: 9000,
    bossSprite: '📱',
    palette: { bg: '#141208', heartColour: '#ff4040', projectileColour: '#a08010', accentColour: '#ffe040' },
    projectiles: [
      { shape: 'rain',   spawnAt: 0,    speed: 140, size: 9,  count: 8,  colour: '#a0801088' },
      { shape: 'rain',   spawnAt: 2000, speed: 150, size: 9,  count: 10, colour: '#c0a01088' },
      { shape: 'spiral', spawnAt: 4000, speed: 130, size: 14, count: 6,  colour: '#ffe040cc' },
      { shape: 'rain',   spawnAt: 7000, speed: 170, size: 8,  count: 12, colour: '#a0801088' },
    ],
  }],

  // ZONE 7 — BURGO (slow huge + random stops)
  'chief-surgeon': [{
    id: 'physio-assault',
    duration: 10000,
    bossSprite: '🩹',
    palette: { bg: '#06140c', heartColour: '#ff4040', projectileColour: '#207050', accentColour: '#40e0a0' },
    projectiles: [
      { shape: 'wave',   spawnAt: 0,    speed: 80,  size: 22, count: 1, colour: '#20705088', gapSize: 65 },
      { shape: 'bullet', spawnAt: 2000, speed: 160, size: 10, count: 6, colour: '#40e0a0aa' },
      { shape: 'wave',   spawnAt: 6000, speed: 90,  size: 24, count: 1, colour: '#20705088', gapSize: 60 },
      { shape: 'cross',  spawnAt: 8000, speed: 120, size: 12, count: 4, colour: '#40e0a0cc' },
    ],
  }],

  // ZONE 8 — DAMO (fast precise, slows when tilting)
  'damo': [{
    id: 'cracked-aim',
    duration: 10000,
    bossSprite: '🎮',
    palette: { bg: '#060c16', heartColour: '#ff4040', projectileColour: '#204080', accentColour: '#c0d0ff' },
    projectiles: [
      { shape: 'bullet', spawnAt: 0,    speed: 240, size: 7,  count: 5,  colour: '#c0d0ffcc' },
      { shape: 'spiral', spawnAt: 1500, speed: 220, size: 7,  count: 8,  colour: '#4080ffcc' },
      { shape: 'bullet', spawnAt: 3000, speed: 260, size: 6,  count: 10, colour: '#c0d0ffcc' },
      { shape: 'bullet', spawnAt: 5500, speed: 140, size: 9,  count: 8,  colour: '#4080ff88' },
      { shape: 'chaos',  spawnAt: 7500, speed: 120, size: 10, count: 6,  colour: '#c0d0ff88' },
    ],
  }],

  // ZONE 9 — FRASER (phase escalation, fills arena)
  'the-ceo': [
    {
      id: 'engineering-phase1',
      duration: 10000,
      bossSprite: '👔',
      palette: { bg: '#060c16', heartColour: '#ff4040', projectileColour: '#c0d0ff', accentColour: '#ff4040' },
      projectiles: [
        { shape: 'wave',   spawnAt: 0,    speed: 110, size: 16, count: 1,  colour: '#c0d0ff88', gapSize: 70 },
        { shape: 'bullet', spawnAt: 2500, speed: 180, size: 9,  count: 8,  colour: '#c0d0ffcc' },
        { shape: 'spiral', spawnAt: 5000, speed: 160, size: 10, count: 10, colour: '#4060c0cc' },
        { shape: 'cross',  spawnAt: 7500, speed: 140, size: 12, count: 6,  colour: '#c0d0ffcc' },
      ],
    },
    {
      id: 'ceo-phase2',
      duration: 12000,
      bossSprite: '👔',
      palette: { bg: '#060408', heartColour: '#ff4040', projectileColour: '#ff4040', accentColour: '#c02020' },
      projectiles: [
        { shape: 'wave',   spawnAt: 0,     speed: 130, size: 18, count: 2,  colour: '#ff404088', gapSize: 55 },
        { shape: 'spiral', spawnAt: 2000,  speed: 190, size: 10, count: 12, colour: '#ff4040cc' },
        { shape: 'bullet', spawnAt: 5000,  speed: 220, size: 8,  count: 15, colour: '#ff4040cc' },
        { shape: 'cross',  spawnAt: 8000,  speed: 170, size: 14, count: 8,  colour: '#ff4040cc' },
        { shape: 'chaos',  spawnAt: 10000, speed: 150, size: 12, count: 10, colour: '#c02020cc' },
      ],
    },
  ],

  // NICK — MONKEY BARREL (fills entire arena)
  'nick': [{
    id: 'monkey-barrel-qte',
    duration: 15000,
    bossSprite: '😎',
    palette: { bg: '#000000', heartColour: '#ff4040', projectileColour: '#f0c040', accentColour: '#ffffff' },
    projectiles: [
      { shape: 'rain',   spawnAt: 0,     speed: 160, size: 12, count: 10, colour: '#f0c04088' },
      { shape: 'spiral', spawnAt: 2000,  speed: 200, size: 10, count: 15, colour: '#f0c040cc' },
      { shape: 'wave',   spawnAt: 5000,  speed: 150, size: 20, count: 2,  colour: '#ffffffcc', gapSize: 40 },
      { shape: 'chaos',  spawnAt: 8000,  speed: 180, size: 10, count: 20, colour: '#f0c040cc' },
      { shape: 'cross',  spawnAt: 12000, speed: 200, size: 16, count: 12, colour: '#ffffffcc' },
      { shape: 'spiral', spawnAt: 13000, speed: 220, size: 12, count: 20, colour: '#f0c040ff' },
    ],
  }],
}
