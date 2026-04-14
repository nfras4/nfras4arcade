// ── Types ─────────────────────────────────────────────────────────────────

export type CombatEvent =
  | { type: 'log'; message: string; logType?: 'dmg' | 'heal' | 'gold' | 'sys'; delayMs?: number }
  | { type: 'stun-player'; durationMs: number }
  | { type: 'stun-enemy'; durationMs: number }
  | { type: 'drain-gold'; amount: number }
  | { type: 'damage-player'; multiplier: number; ignoreDefence?: boolean }
  | { type: 'player-dmg-bonus'; multiplier: number; durationMs: number }
  | { type: 'boss-buff'; id: string; addMultiplier: number; durationMs: number; capTotal?: number }
  | { type: 'clear-boss-buffs'; id: string }
  | { type: 'boss-debuff-incoming'; multiplier: number; durationMs: number }
  | { type: 'skip-enemy-attacks'; count: number }
  | { type: 'barrier'; hits: number; durationMs: number; reduction: number }
  | { type: 'summon-attack'; pool: string[] }
  | { type: 'set-player-miss'; chance: number }
  | { type: 'set-status-icon'; icon: string; durationMs: number }

export type BossContext = {
  enemyHpPct: number
  bossBuffs: Array<{ id: string; multiplier: number; until: number }>
  now: number
}

export type BossPhase = {
  id: string
  hpThreshold: number
  onEnter?: (ctx: BossContext) => CombatEvent[]
  attackModifier?: (baseDmg: number, ctx: BossContext) => number
  defenceModifier?: (baseDmg: number, ctx: BossContext) => number
}

export type SpecialTimer = {
  id: string
  intervalMs: number
  action: (ctx: BossContext) => CombatEvent[]
}

export type BossMechanic = {
  enemyId: string
  phases: BossPhase[]
  specialTimers: SpecialTimer[]
  onDeath?: () => CombatEvent[]
}

// ── Helper ────────────────────────────────────────────────────────────────

function fraserMechanic(enemyId: string): BossMechanic {
  return {
    enemyId,
    phases: [
      {
        id: 'engineering',
        hpThreshold: 1.0,
        onEnter: () => [
          { type: 'log', message: "▶ Fraser activates his engineering degree.", logType: 'sys' },
          { type: 'barrier', hits: 3, durationMs: 8000, reduction: 0.5 },
        ],
      },
      {
        id: 'ceo-mode',
        hpThreshold: 0.66,
        onEnter: () => [
          { type: 'log', message: "▶ Fraser has called an emergency board meeting.", logType: 'sys' },
        ],
      },
      {
        id: 'villain',
        hpThreshold: 0.33,
        onEnter: () => [
          { type: 'log', message: "▶ Fraser stops pretending to be reasonable.", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 1.5),
      },
    ],
    specialTimers: [
      {
        id: 'barrier',
        intervalMs: 12000,
        action: () => [
          { type: 'log', message: "▶ Fraser constructs a structural barrier. Classic.", logType: 'sys' },
          { type: 'barrier', hits: 3, durationMs: 8000, reduction: 0.5 },
          { type: 'set-status-icon', icon: '🛡️', durationMs: 8000 },
        ],
      },
      {
        id: 'outsource',
        intervalMs: 8000,
        action: () => [
          { type: 'log', message: "▶ Delegation is a core leadership skill.", logType: 'sys' },
          { type: 'summon-attack', pool: ['corporate-drone', 'executive-enforcer'] },
        ],
      },
      {
        id: 'drain',
        intervalMs: 5000,
        action: () => {
          const amount = Math.floor(15 + Math.random() * 16)
          return [
            { type: 'log', message: "▶ Wolton Industries invoices you for the inconvenience.", logType: 'gold' },
            { type: 'drain-gold', amount },
          ]
        },
      },
    ],
    onDeath: () => [],
  }
}

// ── Boss Mechanics ────────────────────────────────────────────────────────

export const BOSS_MECHANICS: Record<string, BossMechanic> = {

  'johno': {
    enemyId: 'johno',
    phases: [
      {
        id: 'confused',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "▶ I can explain the basement.", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 0.8),
      },
      {
        id: 'panic',
        hpThreshold: 0.2,
        onEnter: () => [
          { type: 'log', message: "▶ OK I cannot explain the basement.", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'mystery-summon',
        intervalMs: 8000,
        action: () => [
          { type: 'log', message: "▶ Johno gestures at the corner. Something emerges.", logType: 'sys' },
          { type: 'summon-attack', pool: ['mystery-slime', 'basement-rat', 'mystery-creature'] },
          { type: 'set-status-icon', icon: '❓', durationMs: 2000 },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: '▶ "I can explain the basement." He cannot explain the basement.', logType: 'sys' },
    ],
  },

  'the-coach': {
    enemyId: 'the-coach',
    phases: [
      {
        id: 'locked',
        hpThreshold: 1.0,
        onEnter: () => [],
        attackModifier: (base, ctx) => {
          const now = Date.now()
          const inferno = ctx.bossBuffs.filter(b => b.id === 'inferno' && b.until > now)
          const total = Math.min(4.0, 1.0 + inferno.reduce((s, b) => s + b.multiplier, 0))
          return Math.floor(base * total)
        },
      },
      {
        id: 'rage',
        hpThreshold: 0.4,
        onEnter: () => [
          { type: 'log', message: "▶ BIG X IS ANGRY. HE IS VERY ANGRY.", logType: 'sys' },
        ],
        attackModifier: (base, ctx) => {
          const now = Date.now()
          const inferno = ctx.bossBuffs.filter(b => b.id === 'inferno' && b.until > now)
          const total = Math.min(4.0, 1.0 + inferno.reduce((s, b) => s + b.multiplier, 0))
          return Math.floor(base * total)
        },
      },
    ],
    specialTimers: [
      {
        id: 'box-out',
        intervalMs: 20000,
        action: () => [
          { type: 'log', message: "▶ BOX OUT!! EVERY TIME!! WHY ARE WE NOT BOXING OUT!!", logType: 'sys' },
          { type: 'stun-enemy', durationMs: 4000 },
          { type: 'clear-boss-buffs', id: 'inferno' },
          { type: 'set-status-icon', icon: '😡', durationMs: 4000 },
        ],
      },
      {
        id: 'inferno-lock',
        intervalMs: 3000,
        action: (ctx) => {
          const now = Date.now()
          const currentTotal = ctx.bossBuffs.filter(b => b.id === 'inferno' && b.until > now).reduce((s, b) => s + b.multiplier, 0)
          if (currentTotal >= 3.0) return []
          const events: CombatEvent[] = [
            { type: 'boss-buff', id: 'inferno', addMultiplier: 0.6, durationMs: 30000, capTotal: 3.0 },
          ]
          if (currentTotal === 0) {
            events.push({ type: 'log', message: "▶ Big X locks onto you.", logType: 'sys' })
          }
          return events
        },
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ Nobody boxed out. He's still angry about it.", logType: 'sys' },
    ],
  },

  'the-examiner': {
    enemyId: 'the-examiner',
    phases: [
      {
        id: 'frequent-teleport',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "▶ He's not even meant to be here today.", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'teleport',
        intervalMs: 6000,
        action: () => [
          { type: 'log', message: "▶ Connor has left the building.", logType: 'sys' },
          { type: 'skip-enemy-attacks', count: 2 },
          { type: 'stun-player', durationMs: 1500 },
          { type: 'set-status-icon', icon: '🌀', durationMs: 1500 },
          { type: 'log', message: "▶ Connor has returned. Somehow.", logType: 'sys', delayMs: 3000 },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ He was here the whole time. He was not here the whole time.", logType: 'sys' },
    ],
  },

  'edrian': {
    enemyId: 'edrian',
    phases: [
      {
        id: 'identity-crisis',
        hpThreshold: 0.3,
        onEnter: () => [
          { type: 'log', message: "▶ BOMBARDIRO CROCODILO", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'reels',
        intervalMs: 8000,
        action: () => {
          const lines = ["hang on", "bro watch this", "have you seen this one", "one more then i swear"]
          const msg = lines[Math.floor(Math.random() * lines.length)]
          return [
            { type: 'log', message: `▶ Edrian: "${msg}"`, logType: 'sys' },
            { type: 'skip-enemy-attacks', count: 1 },
            { type: 'player-dmg-bonus', multiplier: 1.4, durationMs: 3000 },
            { type: 'set-status-icon', icon: '📱', durationMs: 3000 },
          ]
        },
      },
      {
        id: 'debate',
        intervalMs: 15000,
        action: () => [
          { type: 'log', message: "▶ Edrian stops to explain he is Mexican.", logType: 'sys' },
          { type: 'stun-enemy', durationMs: 3000 },
          { type: 'set-status-icon', icon: '🌮', durationMs: 3000 },
          { type: 'log', message: "▶ He is not Mexican.", logType: 'sys', delayMs: 3100 },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ He dropped his phone mid-fight. The screen cracked. He looked more upset about that than losing.", logType: 'sys' },
    ],
  },

  'head-coach': {
    enemyId: 'head-coach',
    phases: [
      {
        id: 'focused',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "▶ Seb stops vibing. This is bad.", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'clumsy',
        intervalMs: 4000,
        action: () => {
          if (Math.random() < 0.5) {
            const lines = ["Seb trips over nothing.", "Somehow both feet left the ground wrong.", "A professional athlete just did that."]
            const msg = lines[Math.floor(Math.random() * lines.length)]
            return [
              { type: 'log', message: `▶ ${msg}`, logType: 'sys' },
              { type: 'skip-enemy-attacks', count: 1 },
            ]
          }
          return []
        },
      },
      {
        id: 'dunk',
        intervalMs: 12000,
        action: () => [
          { type: 'log', message: "▶ DUNK.", logType: 'dmg' },
          { type: 'damage-player', multiplier: 3.0, ignoreDefence: true },
          { type: 'set-status-icon', icon: '🏆', durationMs: 1000 },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ That last one was on purpose. It was not on purpose.", logType: 'sys' },
    ],
  },

  'zone-manager': {
    enemyId: 'zone-manager',
    phases: [
      {
        id: 'scouting',
        hpThreshold: 1.0,
        onEnter: () => [],
        attackModifier: (base, ctx) => {
          const now = Date.now()
          const winBuffs = ctx.bossBuffs.filter(b => b.id === 'bet-win' && b.until > now)
          if (winBuffs.length === 0) return base
          // bet-win: 2.5x for next 3 attacks, tracked by remaining buff duration
          return Math.floor(base * 2.5)
        },
      },
      {
        id: 'tilted',
        hpThreshold: 0.4,
        onEnter: () => [
          { type: 'log', message: "▶ Hayden has opened a second betting app.", logType: 'sys' },
        ],
        attackModifier: (base, ctx) => {
          const now = Date.now()
          const winBuffs = ctx.bossBuffs.filter(b => b.id === 'bet-win' && b.until > now)
          if (winBuffs.length === 0) return base
          return Math.floor(base * 2.5)
        },
      },
    ],
    specialTimers: [
      {
        id: 'phone-check',
        intervalMs: 8000,
        action: () => {
          if (Math.random() < 0.25) {
            return [
              { type: 'log', message: "▶ hang on", logType: 'sys' },
              { type: 'skip-enemy-attacks', count: 1 },
              { type: 'player-dmg-bonus', multiplier: 1.4, durationMs: 2000 },
              { type: 'set-status-icon', icon: '📱', durationMs: 2000 },
            ]
          }
          return []
        },
      },
      {
        id: 'bet365',
        intervalMs: 15000,
        action: () => {
          if (Math.random() > 0.5) {
            return [
              { type: 'log', message: "▶ knew it", logType: 'sys' },
              { type: 'boss-buff', id: 'bet-win', addMultiplier: 1.5, durationMs: 4500 },
              { type: 'set-status-icon', icon: '💰', durationMs: 4500 },
            ]
          } else {
            return [
              { type: 'log', message: "▶ that was rigged", logType: 'sys' },
              { type: 'stun-enemy', durationMs: 5000 },
              { type: 'boss-debuff-incoming', multiplier: 1.6, durationMs: 5000 },
              { type: 'set-status-icon', icon: '😤', durationMs: 5000 },
            ]
          }
        },
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ He bet on himself to win this fight. He lost that one too.", logType: 'sys' },
    ],
  },

  'chief-surgeon': {
    enemyId: 'chief-surgeon',
    phases: [
      {
        id: 'warmed-up',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "▶ Burgo says his back is actually fine now.", logType: 'sys' },
        ],
      },
      {
        id: 'pain',
        hpThreshold: 0.2,
        onEnter: () => [
          { type: 'log', message: "▶ It is not fine.", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'back-injury',
        intervalMs: 10000,
        action: () => {
          if (Math.random() < 0.4) {
            const lines = [
              "Burgo's back gives out.",
              "Modified duties activated.",
              "He's fine. He says he's fine. He's not fine.",
            ]
            const msg = lines[Math.floor(Math.random() * lines.length)]
            return [
              { type: 'log', message: `▶ ${msg}`, logType: 'sys' },
              { type: 'stun-enemy', durationMs: 6000 },
              { type: 'set-status-icon', icon: '🩺', durationMs: 6000 },
            ]
          }
          return []
        },
      },
      {
        id: 'big-hit',
        intervalMs: 7000,
        action: () => [
          { type: 'log', message: "▶ When Burgo is healthy, he is genuinely terrifying.", logType: 'dmg' },
          { type: 'damage-player', multiplier: 2.5, ignoreDefence: false },
          { type: 'set-status-icon', icon: '💥', durationMs: 1000 },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ He's already booked a physio appointment for tomorrow.", logType: 'sys' },
    ],
  },

  'the-ceo': fraserMechanic('the-ceo'),
  'fraser': fraserMechanic('fraser'),
  'wolton-prime': fraserMechanic('wolton-prime'),

  'damo': {
    enemyId: 'damo',
    phases: [
      {
        id: 'tilt',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "▶ Damo audibly sighs.", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'reads-you',
        intervalMs: 1000,
        action: () => [
          { type: 'set-player-miss', chance: 0.30 },
        ],
      },
      {
        id: 'tilt-check',
        intervalMs: 18000,
        action: (ctx) => {
          if (ctx.enemyHpPct < 0.5) {
            return [
              { type: 'log', message: "▶ Damo is tilting. He's getting reckless.", logType: 'sys' },
              { type: 'set-player-miss', chance: 0 },
              { type: 'boss-debuff-incoming', multiplier: 1.5, durationMs: 999999 },
            ]
          }
          return []
        },
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ GG.", logType: 'sys' },
    ],
  },

  'nick': {
    enemyId: 'nick',
    phases: [
      {
        id: 'it-consultant',
        hpThreshold: 1.0,
        onEnter: () => [
          { type: 'log', message: "▶ You charge $80/hr and you're still doing this for free.", logType: 'sys' },
        ],
      },
      {
        id: 'just-a-chill-guy',
        hpThreshold: 0.60,
        onEnter: () => [
          { type: 'log', message: "▶ Nick puts his phone down.", logType: 'sys' },
        ],
        attackModifier: (base) => base * 2,
      },
      {
        id: 'true-form',
        hpThreshold: 0.30,
        onEnter: () => [
          { type: 'log', message: "▶ .", logType: 'sys' },
          { type: 'log', message: "▶ ..", logType: 'sys', delayMs: 500 },
          { type: 'log', message: "▶ MONKEY BARREL", logType: 'sys', delayMs: 1000 },
          { type: 'damage-player', multiplier: 9999.0, ignoreDefence: true },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'invoice',
        intervalMs: 6000,
        action: () => [
          { type: 'log', message: "▶ Nick invoices you.", logType: 'gold' },
          { type: 'log', message: "▶ Nick logs this as a Priority 2 ticket.", logType: 'sys' },
          { type: 'drain-gold', amount: 80 },
          { type: 'set-status-icon', icon: '🧾', durationMs: 2000 },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "▶ Nick closes the ticket.", logType: 'sys' },
      { type: 'log', message: "▶ He bills you anyway.", logType: 'sys' },
    ],
  },
}

// ── Boss Death Texts ──────────────────────────────────────────────────────

export const BOSS_DEATH_TEXTS: Record<string, string[]> = {
  'johno':          ['"I can explain the basement."', 'He cannot explain the basement.'],
  'the-coach':      ['Nobody boxed out.', "He's still angry about it."],
  'the-examiner':   ['He was here the whole time.', 'He was not here the whole time.'],
  'edrian':         ['He dropped his phone mid-fight.', 'The screen cracked.'],
  'head-coach':     ['That last one was on purpose.', 'It was not on purpose.'],
  'zone-manager':   ['He bet on himself to win this fight.', 'He lost that one too.'],
  'chief-surgeon':  ["He's already booked a physio appointment.", 'For tomorrow.'],
  'the-ceo':        ['The Wolton Industries board meeting is cancelled.', 'Fraser is escorted out by slimes.'],
  'wolton-prime':   ['Fraser closes his laptop for the last time.', 'Wolton Industries stock price: $0.00'],
  'fraser':         ['Fraser closes his laptop for the last time.', 'Wolton Industries stock price: $0.00'],
  'nick':           ['YOU BEAT THE GUY WHO MADE THIS GAME.', "He's not happy about it."],
}
