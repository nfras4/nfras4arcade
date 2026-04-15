export type DropEntry = {
  itemId: string
  chance: number   // 0-1
}

export type MaterialDropEntry = {
  materialId: string
  chance: number         // 0-1
  amount: [number, number]  // [min, max]
}

export type Enemy = {
  id: string
  name: string
  sprite: string
  baseHp: number
  baseDmg: number
  goldDrop?: [number, number]  // unused — gold derives from calcZoneReward
  drops: DropEntry[]
  materialDrops?: MaterialDropEntry[]
  isElite?: boolean
  isMiniboss?: boolean
  isBoss?: boolean
}

export const ENEMIES: Record<string, Enemy> = {

  // ── ZONE 1: JOHNO'S BASEMENT ─────────────────────────────────────────────
  'mystery-slime': {
    id: 'mystery-slime', name: "MYSTERY SLIME", sprite: '🟢',
    baseHp: 20, baseDmg: 4,
    drops: [
      { itemId: 'wooden-stick', chance: 0.12 },
      { itemId: 'cap',          chance: 0.05 },
    ],
  },
  'basement-rat': {
    id: 'basement-rat', name: "BASEMENT RAT", sprite: '🐀',
    baseHp: 12, baseDmg: 3,
    drops: [
      { itemId: 'wooden-stick', chance: 0.08 },
      { itemId: 'rat-tooth',    chance: 0.10 },
      { itemId: 'cloth-robe',   chance: 0.06 },
      { itemId: 'cap',          chance: 0.05 },
      { itemId: 'copper-ring',  chance: 0.05 },
    ],
  },
  'mystery-creature': {
    id: 'mystery-creature', name: "MYSTERY CREATURE", sprite: '❓',
    baseHp: 35, baseDmg: 7,
    drops: [
      { itemId: 'cloth-robe',   chance: 0.08 },
      { itemId: 'wooden-stick', chance: 0.06 },
    ],
  },
  'forgotten-thing': {
    id: 'forgotten-thing', name: "FORGOTTEN THING", sprite: '👁️',
    baseHp: 28, baseDmg: 6,
    drops: [
      { itemId: 'iron-sword',  chance: 0.06 },
      { itemId: 'copper-ring', chance: 0.08 },
    ],
    isElite: true,
  },
  'rat-king': {
    id: 'rat-king', name: "RAT KING", sprite: '👑',
    baseHp: 80, baseDmg: 12,
    drops: [
      { itemId: 'iron-sword', chance: 0.20 },
      { itemId: 'rat-tooth',  chance: 0.35 },
      { itemId: 'cap',        chance: 0.15 },
    ],
    isMiniboss: true,
    // TODO Prompt 4: summons 2 basement-rats on hit
  },
  'johno': {
    id: 'johno', name: "JOHNO", sprite: '🚪',
    baseHp: 200, baseDmg: 18,
    drops: [
      { itemId: 'iron-sword',   chance: 0.40 },
      { itemId: 'leather-vest', chance: 0.30 },
      { itemId: 'rat-tooth',    chance: 0.50 },
    ],
    isBoss: true,
    // TODO Prompt 4: summons random mystery creatures phase mechanic
  },

  // ── ZONE 2: BBI COURT — AUCHENFLOWER ─────────────────────────────────────
  'court-slime': {
    id: 'court-slime', name: "COURT SLIME", sprite: '🟠',
    baseHp: 30, baseDmg: 6,
    drops: [
      { itemId: 'cap',       chance: 0.08 },
      { itemId: 'iron-sword', chance: 0.04 },
    ],
  },
  'overtime-ghost': {
    id: 'overtime-ghost', name: "OVERTIME GHOST", sprite: '👻',
    baseHp: 24, baseDmg: 5,
    drops: [
      { itemId: 'iron-helm',   chance: 0.08 },
      { itemId: 'copper-ring', chance: 0.06 },
    ],
  },
  'aggressive-ref': {
    id: 'aggressive-ref', name: "AGGRESSIVE REF", sprite: '🏀',
    baseHp: 52, baseDmg: 10,
    drops: [
      { itemId: 'leather-vest', chance: 0.08 },
      { itemId: 'iron-sword',   chance: 0.06 },
    ],
    isElite: true,
  },
  'half-time-beast': {
    id: 'half-time-beast', name: "HALF-TIME BEAST", sprite: '🦁',
    baseHp: 140, baseDmg: 22,
    drops: [
      { itemId: 'iron-helm',  chance: 0.15 },
      { itemId: 'iron-sword', chance: 0.12 },
    ],
    isMiniboss: true,
  },
  'the-coach': {
    id: 'the-coach', name: "THE COACH", sprite: '📋',
    baseHp: 450, baseDmg: 30,
    drops: [
      { itemId: 'lucky-charm',  chance: 0.25 },
      { itemId: 'leather-vest', chance: 0.35 },
      { itemId: 'iron-sword',   chance: 0.40 },
    ],
    isBoss: true,
  },

  // ── ZONE 3: UQ ST LUCIA ───────────────────────────────────────────────────
  'stressed-postgrad': {
    id: 'stressed-postgrad', name: "STRESSED POSTGRAD", sprite: '🎓',
    baseHp: 40, baseDmg: 8,
    drops: [
      { itemId: 'copper-ring', chance: 0.10 },
      { itemId: 'iron-helm',   chance: 0.06 },
    ],
  },
  'late-assignment': {
    id: 'late-assignment', name: "LATE ASSIGNMENT", sprite: '📄',
    baseHp: 32, baseDmg: 7,
    drops: [
      { itemId: 'iron-helm',  chance: 0.08 },
      { itemId: 'iron-sword', chance: 0.05 },
    ],
  },
  'thesis-demon': {
    id: 'thesis-demon', name: "THESIS DEMON", sprite: '📚',
    baseHp: 72, baseDmg: 14,
    drops: [
      { itemId: 'steel-blade',    chance: 0.04 },
      { itemId: 'enchanted-hood', chance: 0.03 },
    ],
    isElite: true,
  },
  'grad-overseer': {
    id: 'grad-overseer', name: "GRAD OVERSEER", sprite: '🧑‍🏫',
    baseHp: 195, baseDmg: 30,
    drops: [
      { itemId: 'chain-mail',  chance: 0.08 },
      { itemId: 'steel-blade', chance: 0.05 },
    ],
    isMiniboss: true,
  },
  'the-examiner': {
    id: 'the-examiner', name: "THE EXAMINER", sprite: '🏛️',
    baseHp: 950, baseDmg: 50,
    drops: [
      { itemId: 'lucky-charm', chance: 0.30 },
      { itemId: 'chain-mail',  chance: 0.25 },
      { itemId: 'steel-blade', chance: 0.20 },
    ],
    isBoss: true,
  },

  // ── ZONE 4: FORTITUDE VALLEY — EDRIAN'S ZONE ─────────────────────────────
  'neon-goblin': {
    id: 'neon-goblin', name: "NEON GOBLIN", sprite: '🟣',
    baseHp: 55, baseDmg: 11,
    drops: [
      { itemId: 'leather-vest', chance: 0.08 },
      { itemId: 'speed-ring',   chance: 0.04 },
    ],
  },
  'brainrot-specter': {
    id: 'brainrot-specter', name: "BRAINROT SPECTER", sprite: '📱',
    baseHp: 44, baseDmg: 9,
    drops: [
      { itemId: 'steel-blade', chance: 0.05 },
      { itemId: 'speed-ring',  chance: 0.03 },
    ],
  },
  'the-bouncer': {
    id: 'the-bouncer', name: "THE BOUNCER", sprite: '🚷',
    baseHp: 100, baseDmg: 20,
    drops: [
      { itemId: 'chain-mail',  chance: 0.06 },
      { itemId: 'steel-blade', chance: 0.04 },
    ],
    isElite: true,
  },
  'taco-van-guardian': {
    id: 'taco-van-guardian', name: "TACO VAN GUARDIAN", sprite: '🌮',
    baseHp: 270, baseDmg: 42,
    drops: [
      { itemId: 'enchanted-hood', chance: 0.08 },
      { itemId: 'chain-mail',     chance: 0.10 },
    ],
    isMiniboss: true,
  },
  'edrian': {
    id: 'edrian', name: "EDRIAN", sprite: '📵',
    baseHp: 1800, baseDmg: 85,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.15 },
      { itemId: 'plate-armour',    chance: 0.12 },
      { itemId: 'speed-ring',      chance: 0.20 },
    ],
    isBoss: true,
  },

  // ── ZONE 5: SUNCORP STADIUM ───────────────────────────────────────────────
  'overconfident-forward': {
    id: 'overconfident-forward', name: "OVERCONFIDENT FORWARD", sprite: '🏉',
    baseHp: 72, baseDmg: 14,
    drops: [
      { itemId: 'chain-mail',  chance: 0.08 },
      { itemId: 'speed-ring',  chance: 0.04 },
    ],
  },
  'penalty-wraith': {
    id: 'penalty-wraith', name: "PENALTY WRAITH", sprite: '🟡',
    baseHp: 60, baseDmg: 12,
    drops: [
      { itemId: 'speed-ring',     chance: 0.06 },
      { itemId: 'enchanted-hood', chance: 0.04 },
    ],
  },
  'rowdy-fan': {
    id: 'rowdy-fan', name: "ROWDY FAN", sprite: '📣',
    baseHp: 135, baseDmg: 27,
    drops: [
      { itemId: 'chain-mail',      chance: 0.08 },
      { itemId: 'enchanted-sword', chance: 0.03 },
    ],
    isElite: true,
  },
  'the-referee': {
    id: 'the-referee', name: "THE REFEREE", sprite: '🚩',
    baseHp: 370, baseDmg: 58,
    drops: [
      { itemId: 'plate-armour',    chance: 0.08 },
      { itemId: 'enchanted-sword', chance: 0.05 },
    ],
    isMiniboss: true,
  },
  'head-coach': {
    id: 'head-coach', name: "HEAD COACH", sprite: '🏆',
    baseHp: 3500, baseDmg: 130,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.20 },
      { itemId: 'plate-armour',    chance: 0.15 },
      { itemId: 'power-ring',      chance: 0.10 },
    ],
    isBoss: true,
  },

  // ── ZONE 6: CHERMSIDE WESTFIELD ───────────────────────────────────────────
  'retail-worker': {
    id: 'retail-worker', name: "RETAIL WORKER", sprite: '🛍️',
    baseHp: 95, baseDmg: 18,
    drops: [
      { itemId: 'plate-armour',    chance: 0.06 },
      { itemId: 'enchanted-sword', chance: 0.04 },
    ],
  },
  'frenzied-shopper': {
    id: 'frenzied-shopper', name: "FRENZIED SHOPPER", sprite: '🛒',
    baseHp: 78, baseDmg: 15,
    drops: [
      { itemId: 'speed-ring', chance: 0.08 },
      { itemId: 'power-ring', chance: 0.03 },
    ],
  },
  'store-manager': {
    id: 'store-manager', name: "STORE MANAGER", sprite: '🏷️',
    baseHp: 178, baseDmg: 36,
    drops: [
      { itemId: 'plate-armour', chance: 0.06 },
      { itemId: 'power-ring',   chance: 0.04 },
    ],
    isElite: true,
    materialDrops: [
      { materialId: 'shadowwood',    chance: 0.12, amount: [1, 2] },
      { materialId: 'refined_alloy', chance: 0.12, amount: [1, 2] },
    ],
  },
  'zone-manager': {
    id: 'zone-manager', name: "ZONE MANAGER", sprite: '🔑',
    baseHp: 500, baseDmg: 78,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.08 },
      { itemId: 'plate-armour',    chance: 0.10 },
      { itemId: 'power-ring',      chance: 0.05 },
    ],
    isMiniboss: true,
  },
  'mall-security': {
    id: 'mall-security', name: "MALL SECURITY", sprite: '🔒',
    baseHp: 7000, baseDmg: 210,
    drops: [
      { itemId: 'wolton-visor',    chance: 0.005 },
      { itemId: 'enchanted-sword', chance: 0.20  },
      { itemId: 'power-ring',      chance: 0.15  },
    ],
    isBoss: true,
  },

  // ── ZONE 7: PA HOSPITAL — PHYSIO WARD ────────────────────────────────────
  'physio-foam-roller': {
    id: 'physio-foam-roller', name: "PHYSIO W/ FOAM ROLLER", sprite: '🏥',
    baseHp: 120, baseDmg: 24,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.06 },
      { itemId: 'power-ring',      chance: 0.04 },
    ],
  },
  'confused-intern': {
    id: 'confused-intern', name: "CONFUSED INTERN", sprite: '🩺',
    baseHp: 100, baseDmg: 20,
    drops: [
      { itemId: 'enchanted-hood', chance: 0.06 },
      { itemId: 'power-ring',     chance: 0.03 },
    ],
  },
  'ward-sentinel': {
    id: 'ward-sentinel', name: "WARD SENTINEL", sprite: '🩻',
    baseHp: 228, baseDmg: 46,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.06 },
      { itemId: 'plate-armour',    chance: 0.04 },
    ],
    isElite: true,
    materialDrops: [
      { materialId: 'cursed_herbs', chance: 0.12, amount: [1, 2] },
      { materialId: 'abysswood',    chance: 0.08, amount: [1, 2] },
    ],
  },
  'head-nurse': {
    id: 'head-nurse', name: "HEAD NURSE", sprite: '💉',
    baseHp: 680, baseDmg: 105,
    drops: [
      { itemId: 'wolton-suit', chance: 0.03 },
      { itemId: 'power-ring',  chance: 0.08 },
    ],
    isMiniboss: true,
  },
  'chief-surgeon': {
    id: 'chief-surgeon', name: "CHIEF SURGEON", sprite: '🔬',
    baseHp: 14000, baseDmg: 340,
    drops: [
      { itemId: 'power-ring',   chance: 0.20 },
      { itemId: 'plate-armour', chance: 0.25 },
      { itemId: 'wolton-suit',  chance: 0.10 },
    ],
    isBoss: true,
    materialDrops: [
      { materialId: 'abysswood',   chance: 0.30, amount: [1, 3] },
      { materialId: 'wolton_core', chance: 0.30, amount: [1, 3] },
    ],
  },

  // ── ZONE 8: WOLTON INDUSTRIES LOBBY ──────────────────────────────────────
  'corporate-drone': {
    id: 'corporate-drone', name: "CORPORATE DRONE", sprite: '💼',
    baseHp: 155, baseDmg: 30,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.08 },
      { itemId: 'plate-armour',    chance: 0.05 },
    ],
  },
  'damo': {
    id: 'damo', name: "DAMO", sprite: '🎮',
    baseHp: 130, baseDmg: 26,
    drops: [
      { itemId: 'wolton-visor', chance: 0.04 },
      { itemId: 'wolton-badge', chance: 0.03 },
    ],
  },
  'security-golem': {
    id: 'security-golem', name: "SECURITY GOLEM", sprite: '🤖',
    baseHp: 300, baseDmg: 60,
    drops: [
      { itemId: 'plate-armour',    chance: 0.08 },
      { itemId: 'enchanted-sword', chance: 0.06 },
    ],
    isElite: true,
    materialDrops: [
      { materialId: 'wolton_core',     chance: 0.08, amount: [1, 2] },
      { materialId: 'ancient_essence', chance: 0.08, amount: [1, 2] },
      { materialId: 'voidwood',        chance: 0.05, amount: [1, 1] },
    ],
  },
  'hr-director': {
    id: 'hr-director', name: "HR DIRECTOR", sprite: '📊',
    baseHp: 920, baseDmg: 142,
    drops: [
      { itemId: 'plate-armour', chance: 0.12 },
      { itemId: 'power-ring',   chance: 0.08 },
    ],
    isMiniboss: true,
  },
  'the-ceo': {
    id: 'the-ceo', name: "THE CEO", sprite: '🏢',
    baseHp: 28000, baseDmg: 540,
    drops: [
      { itemId: 'wolton-suit',  chance: 0.10  },
      { itemId: 'wolton-visor', chance: 0.08  },
      { itemId: 'wolton-badge', chance: 0.005 },
    ],
    isBoss: true,
    materialDrops: [
      { materialId: 'ancient_essence', chance: 0.30, amount: [1, 3] },
      { materialId: 'voidwood',        chance: 0.15, amount: [1, 2] },
    ],
  },

  // ── ZONE 9: WOLTON HQ 32ND FLOOR ─────────────────────────────────────────
  'fraser': {
    id: 'fraser', name: "FRASER", sprite: '👔',
    baseHp: 200, baseDmg: 40,
    drops: [
      { itemId: 'wolton-suit',  chance: 0.06 },
      { itemId: 'wolton-badge', chance: 0.04 },
    ],
    materialDrops: [
      { materialId: 'etherwood',       chance: 0.10, amount: [1, 2] },
      { materialId: 'wolton_fragment', chance: 0.10, amount: [1, 2] },
    ],
  },
  'red-tape-wraith': {
    id: 'red-tape-wraith', name: "RED TAPE WRAITH", sprite: '📑',
    baseHp: 170, baseDmg: 34,
    drops: [
      { itemId: 'wolton-visor',   chance: 0.05 },
      { itemId: 'wolton-breaker', chance: 0.03 },
    ],
  },
  'final-boss-drone': {
    id: 'final-boss-drone', name: "FINAL BOSS DRONE", sprite: '🔴',
    baseHp: 390, baseDmg: 78,
    drops: [
      { itemId: 'wolton-breaker', chance: 0.05 },
      { itemId: 'wolton-suit',    chance: 0.04 },
    ],
    isElite: true,
    materialDrops: [
      { materialId: 'fractured_steel', chance: 0.05, amount: [1, 2] },
      { materialId: 'primordial_dust', chance: 0.05, amount: [1, 2] },
    ],
  },
  'executive-enforcer': {
    id: 'executive-enforcer', name: "EXECUTIVE ENFORCER", sprite: '⚙️',
    baseHp: 1250, baseDmg: 190,
    drops: [
      { itemId: 'enchanted-sword', chance: 0.12 },
      { itemId: 'wolton-visor',    chance: 0.06 },
      { itemId: 'wolton-breaker',  chance: 0.04 },
    ],
    isMiniboss: true,
  },
  'wolton-prime': {
    id: 'wolton-prime', name: "WOLTON PRIME", sprite: '⚡',
    baseHp: 55000, baseDmg: 820,
    drops: [
      { itemId: 'wolton-breaker', chance: 0.35 },
      { itemId: 'wolton-suit',    chance: 0.30 },
      { itemId: 'wolton-badge',   chance: 0.25 },
      { itemId: 'wolton-visor',   chance: 0.20 },
    ],
    isBoss: true,
    materialDrops: [
      { materialId: 'fractured_steel', chance: 0.15, amount: [1, 3] },
      { materialId: 'primordial_dust', chance: 0.15, amount: [1, 3] },
    ],
    // TODO Prompt 4: final boss phase mechanic
  },

  // ── SECRET BOSS ──────────────────────────────────────────────────────────────
  'nick': {
    id: 'nick',
    name: "NICK",
    sprite: '😎',
    baseHp: 55000,
    baseDmg: 50,
    drops: [
      { itemId: 'wolton-breaker', chance: 1.0 },
      { itemId: 'wolton-suit',    chance: 1.0 },
      { itemId: 'wolton-visor',   chance: 1.0 },
      { itemId: 'wolton-badge',   chance: 1.0 },
    ],
    materialDrops: [
      { materialId: 'etherwood',       chance: 0.10, amount: [1, 2] },
      { materialId: 'wolton_fragment', chance: 0.10, amount: [1, 2] },
      { materialId: 'ascendant_shard', chance: 0.10, amount: [1, 2] },
    ],
  },
}
