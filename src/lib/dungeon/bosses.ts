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
  castBarName?: string    // max 4 words, ALL CAPS -- shown in the cast bar progress bar
  description?: string   // 1 sentence: what it does, magnitude, duration
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
          { type: 'log', message: "▶ Fraser activates his engineering degree. [FRASER deploys a 3-hit barrier -- each hit reduced by 50% for 8s]", logType: 'sys' },
          { type: 'barrier', hits: 3, durationMs: 8000, reduction: 0.5 },
        ],
      },
      {
        id: 'ceo-mode',
        hpThreshold: 0.66,
        onEnter: () => [
          { type: 'log', message: "▶ Fraser has called an emergency board meeting. [UNLINKED -- this phase has no mechanical change]", logType: 'sys' },
        ],
      },
      {
        id: 'villain',
        hpThreshold: 0.33,
        onEnter: () => [
          { type: 'log', message: "▶ Fraser stops pretending to be reasonable. [FRASER drops all pretense -- attacks now deal 1.5x damage]", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 1.5),
      },
    ],
    specialTimers: [
      {
        id: 'barrier',
        intervalMs: 12000,
        castBarName: 'STRUCTURAL ANALYSIS',
        description: 'Barrier: FRASER constructs a 3-hit damage barrier lasting 8 seconds, reducing each blocked hit by 50%.',
        action: () => [
          { type: 'log', message: "▶ Fraser constructs a structural barrier. Classic. [FRASER deploys a 3-hit barrier -- each hit blocked is reduced by 50% for 8s]", logType: 'sys' },
          { type: 'barrier', hits: 3, durationMs: 8000, reduction: 0.5 },
          { type: 'set-status-icon', icon: '🛡️', durationMs: 8000 },
        ],
      },
      {
        id: 'outsource',
        intervalMs: 8000,
        castBarName: 'DELEGATING TASKS',
        description: 'Outsource: FRASER delegates combat, summoning a corporate drone or executive enforcer to attack you.',
        action: () => [
          { type: 'log', message: "▶ Delegation is a core leadership skill. [FRASER is outsourcing -- a corporate minion joins the fight]", logType: 'sys' },
          { type: 'summon-attack', pool: ['corporate-drone', 'executive-enforcer'] },
        ],
      },
      {
        id: 'drain',
        intervalMs: 5000,
        castBarName: 'INVOICING CLIENT',
        description: 'Corporate Invoice: FRASER deducts 15-30 gold as a Wolton Industries service fee.',
        action: () => {
          const amount = Math.floor(15 + Math.random() * 16)
          return [
            { type: 'log', message: "▶ Wolton Industries invoices you for the inconvenience. [FRASER is draining gold -- 15-30 gold deducted as an invoice]", logType: 'gold' },
            { type: 'drain-gold', amount },
          ]
        },
      },
    ],
    onDeath: () => [],
  }
}

// ── Boss Mechanics ────────────────────────────────────────────────────────

// Mutable state updated by combat when head-coach phase changes
export const headCoachState = { clumsyChance: 0.5 }

export const BOSS_MECHANICS: Record<string, BossMechanic> = {

  'johno': {
    enemyId: 'johno',
    phases: [
      {
        id: 'intro',
        hpThreshold: 1.0,
        onEnter: () => [
          { type: 'log', message: "▶ Let's see what you've got. Watch the bar under my name -- it fills before I do something. [First encounter -- JOHNO's cast bar fills before each ability fires]", logType: 'sys' },
          // TODO: gate on firstBossKills to show only once
        ],
      },
      {
        id: 'confused',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "▶ I can explain the basement. [JOHNO loses focus -- attacks deal 80% damage]", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 0.8),
      },
      {
        id: 'panic',
        hpThreshold: 0.2,
        onEnter: () => [
          { type: 'log', message: "▶ OK I cannot explain the basement. [UNLINKED -- assign a mechanic to this phase or remove]", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'mystery-summon',
        intervalMs: 8000,
        castBarName: 'CALLING THE BASEMENT',
        description: 'Mystery Summon: JOHNO summons a random creature from the basement to join the fight.',
        action: () => [
          { type: 'log', message: "▶ Johno gestures at the corner. Something emerges. [JOHNO is summoning -- a basement creature joins the fight]", logType: 'sys' },
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
          { type: 'log', message: "▶ BIG X IS ANGRY. HE IS VERY ANGRY. [UNLINKED -- this phase has no mechanical change]", logType: 'sys' },
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
        castBarName: 'BOX OUT!!',
        description: 'Box Out: BIG X erupts into a coaching tirade, stunning himself for 4 seconds and clearing all inferno attack stacks.',
        action: () => [
          { type: 'log', message: "▶ BOX OUT!! EVERY TIME!! WHY ARE WE NOT BOXING OUT!! [BIG X stuns himself for 4s -- all inferno stacks cleared]", logType: 'sys' },
          { type: 'stun-enemy', durationMs: 4000 },
          { type: 'clear-boss-buffs', id: 'inferno' },
          { type: 'set-status-icon', icon: '😡', durationMs: 4000 },
        ],
      },
      {
        id: 'inferno-lock',
        intervalMs: 3000,
        castBarName: 'LOCKING IN',
        description: 'Inferno Lock: BIG X adds +0.6 attack multiplier every 3 seconds (max 3.0x total, 30s duration per stack).',
        action: (ctx) => {
          const now = Date.now()
          const currentTotal = ctx.bossBuffs.filter(b => b.id === 'inferno' && b.until > now).reduce((s, b) => s + b.multiplier, 0)
          if (currentTotal >= 3.0) return []
          const events: CombatEvent[] = [
            { type: 'boss-buff', id: 'inferno', addMultiplier: 0.6, durationMs: 30000, capTotal: 3.0 },
          ]
          if (currentTotal === 0) {
            events.push({ type: 'log', message: "▶ Big X locks onto you. [BIG X starts building INFERNO -- +0.6 attack per stack, stacks to 3.0x total]", logType: 'sys' })
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
          { type: 'log', message: "▶ You've used up your reading time. [UNLINKED -- this phase has no mechanical effect on teleport frequency]", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'teleport',
        intervalMs: 6000,
        castBarName: 'LEAVING THE BUILDING',
        description: 'Academic Leave: THE EXAMINER teleports away, skipping 2 attacks and stunning you for 1.5 seconds before returning 3 seconds later.',
        action: () => [
          { type: 'log', message: "▶ Connor has left the building. [THE EXAMINER is teleporting -- you are stunned 1.5s, Connor skips 2 attacks]", logType: 'sys' },
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
          { type: 'log', message: "▶ BOMBARDIRO CROCODILO [UNLINKED -- this phase has no mechanical effect]", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'reels',
        intervalMs: 8000,
        castBarName: 'WATCHING REELS',
        description: 'Distracted: EDRIAN stops to watch a reel, skipping his next attack and granting you +40% damage for 3 seconds.',
        action: () => {
          const lines = ["hang on", "bro watch this", "have you seen this one", "one more then i swear"]
          const msg = lines[Math.floor(Math.random() * lines.length)]
          return [
            { type: 'log', message: `▶ Edrian: "${msg}" [EDRIAN is distracted -- skips next attack, you deal +40% damage for 3s]`, logType: 'sys' },
            { type: 'skip-enemy-attacks', count: 1 },
            { type: 'player-dmg-bonus', multiplier: 1.4, durationMs: 3000 },
            { type: 'set-status-icon', icon: '📱', durationMs: 3000 },
          ]
        },
      },
      {
        id: 'debate',
        intervalMs: 15000,
        castBarName: 'AM I MEXICAN?',
        description: 'Nationality Debate: EDRIAN stops to argue about his heritage, stunning himself for 3 seconds.',
        action: () => [
          { type: 'log', message: "▶ Edrian stops to explain he is Mexican. [EDRIAN is stunned for 3s -- window to deal damage]", logType: 'sys' },
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
          { type: 'log', message: "▶ Seb stops vibing. This is bad. [SEB is focused -- attacks +15%, dunk frequency increased]", logType: 'sys' },
        ],
        attackModifier: (base: number) => Math.floor(base * 1.15),
      },
    ],
    specialTimers: [
      {
        id: 'clumsy',
        intervalMs: 4000,
        castBarName: 'FOOTWORK FAILURE',
        description: 'Clumsy: SEB trips over nothing, skipping his next attack (50% chance every 4 seconds).',
        action: () => {
          if (Math.random() < headCoachState.clumsyChance) {
            const lines = [
              "Seb trips over nothing. [SEB stumbles -- skips his next attack]",
              "Somehow both feet left the ground wrong. [SEB stumbles -- skips his next attack]",
              "A professional athlete just did that. [SEB stumbles -- skips his next attack]",
            ]
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
        intervalMs: 15000,
        castBarName: 'CHARGING DOWN',
        description: 'Charge Down: SEB charges through all defences, dealing 3x damage that ignores your defence stat.',
        action: () => [
          { type: 'log', message: "▶ CHARGE DOWN. [SEB is charging -- 1.8x damage hit incoming]", logType: 'dmg' },
          { type: 'damage-player', multiplier: 1.17, ignoreDefence: false },
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
          { type: 'log', message: "▶ Hayden has opened a second betting app. [UNLINKED -- this phase has no mechanical change]", logType: 'sys' },
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
        castBarName: 'CHECKING PHONE',
        description: 'Phone Check: HAYDEN glances at his betting app, skipping his next attack and granting you +40% damage for 2 seconds (25% chance).',
        action: () => {
          if (Math.random() < 0.25) {
            return [
              { type: 'log', message: "▶ hang on [HAYDEN is distracted -- he skips his next attack and you deal +40% damage for 2s]", logType: 'sys' },
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
        castBarName: 'PLACING A BET',
        description: 'Bet365: HAYDEN places a 50/50 bet -- win gives him 1.5x ATK for 4.5s; loss stuns him 5s and increases his incoming damage by 60%.',
        action: () => {
          if (Math.random() > 0.5) {
            return [
              { type: 'log', message: "▶ knew it [HAYDEN wins -- gains 1.5x attack multiplier for 4.5s]", logType: 'sys' },
              { type: 'boss-buff', id: 'bet-win', addMultiplier: 1.5, durationMs: 4500 },
              { type: 'set-status-icon', icon: '💰', durationMs: 4500 },
            ]
          } else {
            return [
              { type: 'log', message: "▶ that was rigged [HAYDEN loses -- stunned 5s, takes 60% more incoming damage]", logType: 'sys' },
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
          { type: 'log', message: "▶ Burgo says his back is actually fine now. [UNLINKED -- assign a mechanic to this phase or remove]", logType: 'sys' },
        ],
      },
      {
        id: 'pain',
        hpThreshold: 0.2,
        onEnter: () => [
          { type: 'log', message: "▶ It is not fine. [UNLINKED -- assign a mechanic to this phase or remove]", logType: 'sys' },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'back-injury',
        intervalMs: 10000,
        castBarName: 'BACK GIVES OUT',
        description: 'Back Injury: BURGO\'s back gives out, stunning him for 6 seconds (40% chance every 10 seconds).',
        action: () => {
          if (Math.random() < 0.4) {
            const lines = [
              "Burgo's back gives out. [BURGO is incapacitated -- stunned for 6s]",
              "Modified duties activated. [BURGO is incapacitated -- stunned for 6s]",
              "He's fine. He says he's fine. He's not fine. [BURGO is incapacitated -- stunned for 6s]",
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
        castBarName: 'SCALPEL STRIKE',
        description: 'Surgical Strike: BURGO delivers a precise 2.5x damage hit (defence applies).',
        action: () => [
          { type: 'log', message: "▶ When Burgo is healthy, he is genuinely terrifying. [BURGO is striking -- 2.5x damage hit incoming, defence applies]", logType: 'dmg' },
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
          { type: 'log', message: "▶ Damo audibly sighs. [UNLINKED -- this phase has no direct mechanical effect]", logType: 'sys' },
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
        castBarName: 'TILTING HARD',
        description: 'Tilt: DAMO loses composure below 50% HP, permanently removing your 30% miss chance and increasing his incoming damage by 50%.',
        action: (ctx) => {
          if (ctx.enemyHpPct < 0.5) {
            return [
              { type: 'log', message: "▶ Damo is tilting. He's getting reckless. [DAMO loses composure -- your miss chance removed, DAMO takes +50% damage permanently]", logType: 'sys' },
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
          { type: 'log', message: "▶ You charge $80/hr and you're still doing this for free. [UNLINKED -- this phase has no mechanical effect]", logType: 'sys' },
        ],
      },
      {
        id: 'just-a-chill-guy',
        hpThreshold: 0.60,
        onEnter: () => [
          { type: 'log', message: "▶ Nick puts his phone down. [NICK gets serious -- attacks now deal 2x damage]", logType: 'sys' },
        ],
        attackModifier: (base) => base * 2,
      },
      {
        id: 'true-form',
        hpThreshold: 0.30,
        onEnter: () => [
          { type: 'log', message: "▶ .", logType: 'sys' },
          { type: 'log', message: "▶ ..", logType: 'sys', delayMs: 500 },
          { type: 'log', message: "▶ MONKEY BARREL [NICK is unleashing -- unavoidable 9999 damage hit incoming]", logType: 'sys', delayMs: 1000 },
          { type: 'damage-player', multiplier: 9999.0, ignoreDefence: true },
        ],
      },
    ],
    specialTimers: [
      {
        id: 'invoice',
        intervalMs: 6000,
        castBarName: 'RAISING INVOICE',
        description: 'Priority 2 Invoice: NICK drains 80 gold and logs the encounter as a Priority 2 support ticket.',
        action: () => [
          { type: 'log', message: "▶ Nick invoices you. [NICK is billing -- 80 gold will be deducted]", logType: 'gold' },
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

  'the-first-slime': {
    enemyId: 'the-first-slime',
    phases: [
      {
        id: 'just-a-slime',
        hpThreshold: 1.0,
        onEnter: () => [
          { type: 'log', message: "It's just a slime.", logType: 'sys' },
        ],
      },
      {
        id: 'always-was',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: "It was here before Wolton.", logType: 'sys' },
          { type: 'log', message: "It will be here after.", logType: 'sys', delayMs: 800 },
        ],
        attackModifier: (base) => Math.floor(base * 1.5),
      },
      {
        id: 'the-truth',
        hpThreshold: 0.1,
        onEnter: () => [
          { type: 'log', message: ".", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 2.5),
      },
    ],
    specialTimers: [
      {
        id: 'ancient-pulse',
        intervalMs: 8000,
        castBarName: 'ANCIENT PULSE',
        description: 'Ancient Pulse: The First Slime pulses with ancient energy, dealing 45% of your max HP as damage.',
        action: () => [
          { type: 'log', message: "The slime pulses. You feel very old.", logType: 'dmg' },
          { type: 'damage-player', multiplier: 3.5, ignoreDefence: false },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "The first slime is defeated.", logType: 'sys' },
      { type: 'log', message: "Nothing changes.", logType: 'sys', delayMs: 1000 },
      { type: 'log', message: "Everything changes.", logType: 'sys', delayMs: 2000 },
    ],
  },

  'the-end': {
    enemyId: 'the-end',
    phases: [
      {
        id: 'beginning',
        hpThreshold: 1.0,
        onEnter: () => [
          { type: 'log', message: "...", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 1.0),
      },
      {
        id: 'middle',
        hpThreshold: 0.75,
        onEnter: () => [
          { type: 'log', message: "..", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 1.3),
      },
      {
        id: 'end',
        hpThreshold: 0.5,
        onEnter: () => [
          { type: 'log', message: ".", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 1.8),
      },
      {
        id: 'after',
        hpThreshold: 0.25,
        onEnter: () => [
          { type: 'log', message: "", logType: 'sys' },
        ],
        attackModifier: (base) => Math.floor(base * 2.5),
      },
    ],
    specialTimers: [
      {
        id: 'everything',
        intervalMs: 6000,
        castBarName: 'EVERYTHING',
        description: 'Everything: The End deals 55% of your max HP as unavoidable damage.',
        action: () => [
          { type: 'log', message: "", logType: 'dmg' },
          { type: 'damage-player', multiplier: 4.5, ignoreDefence: false },
        ],
      },
    ],
    onDeath: () => [
      { type: 'log', message: "You have reached the end.", logType: 'sys' },
      { type: 'log', message: "Well done.", logType: 'sys', delayMs: 1500 },
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
  'nick':              ['YOU BEAT THE GUY WHO MADE THIS GAME.', "He's not happy about it."],
  'the-first-slime':   ['The first slime is defeated.', 'Nothing changes. Everything changes.'],
  'the-end':           ['You have reached the end.', 'Well done.'],
}
