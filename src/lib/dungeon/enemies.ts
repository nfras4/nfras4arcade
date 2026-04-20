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
      { itemId: 'steel-ring',   chance: 0.06 },
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
      { itemId: 'steel-ring',  chance: 0.06 },
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
      { itemId: 'steel-ring',  chance: 0.06 },
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
      { itemId: 'steel-ring',      chance: 0.06 },
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
    baseHp: 11200, baseDmg: 340,
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
    baseHp: 22400, baseDmg: 540,
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
    baseHp: 44000, baseDmg: 820,
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

  // ── ELLA'S WORLD (SECRET ZONE, unlocks after 10 Hayden defeats) ──────────
  // Hand-tuned stats — zone 50 skips standard scaling formulas.
  'small-thing': {
    id: 'small-thing', name: '*a small thing*', sprite: '🌸',
    baseHp: 400, baseDmg: 120,
    drops: [],
  },
  'crying-one': {
    id: 'crying-one', name: '*the crying one*', sprite: '😢',
    baseHp: 600, baseDmg: 180,
    drops: [],
  },
  'hachiware': {
    id: 'hachiware', name: '*hachiware*', sprite: '🐱',
    baseHp: 1800, baseDmg: 280,
    drops: [], isElite: true,
  },
  'usagi': {
    id: 'usagi', name: '*usagi*', sprite: '🐰',
    baseHp: 2000, baseDmg: 320,
    drops: [], isElite: true,
  },
  'chiikawa-itself': {
    id: 'chiikawa-itself', name: '*chiikawa*', sprite: '🐭',
    baseHp: 6000, baseDmg: 500,
    drops: [], isMiniboss: true,
  },
  'ella': {
    id: 'ella', name: 'ELLA', sprite: '🌸',
    baseHp: 18000, baseDmg: 400,
    drops: [],
    isBoss: true,
  },

  // ── ZONES 9-11: WOLTON DEEP LABS ─────────────────────────────────────────
  'corrupted-slime':    { id: 'corrupted-slime',    name: 'CORRUPTED SLIME',    sprite: '🟢', baseHp: 800,        baseDmg: 180,    drops: [] },
  'rogue-drone':        { id: 'rogue-drone',         name: 'ROGUE DRONE',         sprite: '🤖', baseHp: 1200,       baseDmg: 220,    drops: [] },
  'lab-specimen':       { id: 'lab-specimen',        name: 'LAB SPECIMEN',        sprite: '🧬', baseHp: 1600,       baseDmg: 280,    drops: [] },
  'failed-clone':       { id: 'failed-clone',        name: 'FAILED CLONE',        sprite: '👤', baseHp: 2000,       baseDmg: 340,    drops: [], isElite: true },
  'security-protocol':  { id: 'security-protocol',   name: 'SECURITY PROTOCOL',   sprite: '🔒', baseHp: 2400,       baseDmg: 400,    drops: [], isElite: true },
  'containment-breach': { id: 'containment-breach',  name: 'CONTAINMENT BREACH',  sprite: '⚠️', baseHp: 8000,       baseDmg: 600,    drops: [], isMiniboss: true },
  'dr-01':              { id: 'dr-01',               name: 'DR-01',               sprite: '🔬', baseHp: 100000,     baseDmg: 420,    drops: [], isBoss: true },
  'alpha-specimen':     { id: 'alpha-specimen',      name: 'ALPHA SPECIMEN',      sprite: '🧪', baseHp: 10000,      baseDmg: 800,    drops: [], isMiniboss: true },
  'the-specimen':       { id: 'the-specimen',        name: 'THE SPECIMEN',        sprite: '☣️', baseHp: 160000,     baseDmg: 460,    drops: [], isBoss: true },
  'core-guardian':      { id: 'core-guardian',       name: 'CORE GUARDIAN',       sprite: '💾', baseHp: 14000,      baseDmg: 1000,   drops: [], isMiniboss: true },
  'nexus':              { id: 'nexus',               name: 'NEXUS',               sprite: '🖥️', baseHp: 250000,     baseDmg: 510,    drops: [], isBoss: true },

  // ── ZONES 12-14: WOLTON CORRUPTION ───────────────────────────────────────
  'fractured-guard':    { id: 'fractured-guard',     name: 'FRACTURED GUARD',     sprite: '💔', baseHp: 3500,       baseDmg: 520,    drops: [] },
  'void-intern':        { id: 'void-intern',         name: 'VOID INTERN',         sprite: '👔', baseHp: 4200,       baseDmg: 640,    drops: [] },
  'glitch-entity':      { id: 'glitch-entity',       name: 'GLITCH ENTITY',       sprite: '📺', baseHp: 5000,       baseDmg: 780,    drops: [] },
  'broken-construct':   { id: 'broken-construct',    name: 'BROKEN CONSTRUCT',    sprite: '🔧', baseHp: 6000,       baseDmg: 940,    drops: [], isElite: true },
  'reality-tear':       { id: 'reality-tear',        name: 'REALITY TEAR',        sprite: '🌀', baseHp: 7200,       baseDmg: 1100,   drops: [], isElite: true },
  'the-fracture':       { id: 'the-fracture',        name: 'THE FRACTURE',        sprite: '⚡', baseHp: 22000,      baseDmg: 1600,   drops: [], isMiniboss: true },
  'shard':              { id: 'shard',               name: 'SHARD',               sprite: '💠', baseHp: 400000,     baseDmg: 300,    drops: [], isBoss: true },
  'void-architect':     { id: 'void-architect',      name: 'VOID ARCHITECT',      sprite: '🏗️', baseHp: 30000,      baseDmg: 2200,   drops: [], isMiniboss: true },
  'the-architect':      { id: 'the-architect',       name: 'THE ARCHITECT',       sprite: '🌑', baseHp: 650000,     baseDmg: 340,    drops: [], isBoss: true },
  'mirror-shard':       { id: 'mirror-shard',        name: 'MIRROR SHARD',        sprite: '🪞', baseHp: 40000,      baseDmg: 3000,   drops: [], isMiniboss: true },
  'echo':               { id: 'echo',               name: 'ECHO',               sprite: '👁️', baseHp: 1000000,    baseDmg: 380,    drops: [], isBoss: true },

  // ── ZONES 15-17: VOID DESCENT ────────────────────────────────────────────
  'void-wisp':          { id: 'void-wisp',           name: 'VOID WISP',           sprite: '✨', baseHp: 9000,       baseDmg: 1400,   drops: [] },
  'null-shard':         { id: 'null-shard',          name: 'NULL SHARD',          sprite: '⬛', baseHp: 11000,      baseDmg: 1700,   drops: [] },
  'the-forgotten':      { id: 'the-forgotten',       name: 'THE FORGOTTEN',       sprite: '❓', baseHp: 13500,      baseDmg: 2100,   drops: [] },
  'echo-fragment':      { id: 'echo-fragment',       name: 'ECHO FRAGMENT',       sprite: '🔮', baseHp: 16000,      baseDmg: 2500,   drops: [], isElite: true },
  'silence':            { id: 'silence',             name: 'SILENCE',             sprite: '🔇', baseHp: 19000,      baseDmg: 3000,   drops: [], isElite: true },
  'void-herald':        { id: 'void-herald',         name: 'VOID HERALD',         sprite: '📯', baseHp: 60000,      baseDmg: 4500,   drops: [], isMiniboss: true },
  'vestige':            { id: 'vestige',             name: 'VESTIGE',             sprite: '👻', baseHp: 2500000,    baseDmg: 190,    drops: [], isBoss: true },
  'null-prime':         { id: 'null-prime',          name: 'NULL PRIME',          sprite: '⚫', baseHp: 80000,      baseDmg: 6000,   drops: [], isMiniboss: true },
  'the-weight':         { id: 'the-weight',          name: 'THE WEIGHT',          sprite: '🏋️', baseHp: 4000000,    baseDmg: 220,    drops: [], isBoss: true },
  'unraveller':         { id: 'unraveller',          name: 'UNRAVELLER',          sprite: '🧶', baseHp: 110000,     baseDmg: 8000,   drops: [], isMiniboss: true },
  'collapse':           { id: 'collapse',            name: 'COLLAPSE',            sprite: '💥', baseHp: 6500000,    baseDmg: 255,    drops: [], isBoss: true },

  // ── ZONES 18-20: DEEP VOID ────────────────────────────────────────────────
  'ancient-remnant':    { id: 'ancient-remnant',     name: 'ANCIENT REMNANT',     sprite: '🗿', baseHp: 24000,      baseDmg: 3800,   drops: [] },
  'first-thing':        { id: 'first-thing',         name: 'FIRST THING',         sprite: '🌒', baseHp: 30000,      baseDmg: 4600,   drops: [] },
  'void-prime':         { id: 'void-prime',          name: 'VOID PRIME',          sprite: '🌓', baseHp: 37000,      baseDmg: 5600,   drops: [] },
  'the-nameless':       { id: 'the-nameless',        name: 'THE NAMELESS',        sprite: '🌔', baseHp: 46000,      baseDmg: 6800,   drops: [], isElite: true },
  'origin-shard':       { id: 'origin-shard',        name: 'ORIGIN SHARD',        sprite: '🌕', baseHp: 57000,      baseDmg: 8200,   drops: [], isElite: true },
  'deep-remnant':       { id: 'deep-remnant',        name: 'DEEP REMNANT',        sprite: '🌌', baseHp: 180000,     baseDmg: 13000,  drops: [], isMiniboss: true },
  'origin':             { id: 'origin',              name: 'ORIGIN',              sprite: '🌠', baseHp: 15000000,   baseDmg: 130,    drops: [], isBoss: true },
  'void-sovereign':     { id: 'void-sovereign',      name: 'VOID SOVEREIGN',      sprite: '👑', baseHp: 240000,     baseDmg: 18000,  drops: [], isMiniboss: true },
  'silence-absolute':   { id: 'silence-absolute',    name: 'SILENCE ABSOLUTE',    sprite: '⬜', baseHp: 25000000,   baseDmg: 155,    drops: [], isBoss: true },
  'the-penultimate':    { id: 'the-penultimate',     name: 'THE PENULTIMATE',     sprite: '🔺', baseHp: 320000,     baseDmg: 25000,  drops: [], isMiniboss: true },
  'the-first-slime':    { id: 'the-first-slime',     name: 'THE FIRST SLIME',     sprite: '🟢', baseHp: 40000000,   baseDmg: 175,    drops: [], isBoss: true },

  // ── ZONES 21-23: THE REMNANT ─────────────────────────────────────────────
  'remnant-wisp':       { id: 'remnant-wisp',        name: 'REMNANT WISP',        sprite: '🌫️', baseHp: 70000,      baseDmg: 12000,  drops: [] },
  'fractured-origin':   { id: 'fractured-origin',    name: 'FRACTURED ORIGIN',    sprite: '💫', baseHp: 88000,      baseDmg: 15000,  drops: [] },
  'null-sovereign':     { id: 'null-sovereign',      name: 'NULL SOVEREIGN',      sprite: '🌀', baseHp: 110000,     baseDmg: 18000,  drops: [] },
  'void-colossus':      { id: 'void-colossus',       name: 'VOID COLOSSUS',       sprite: '🗼', baseHp: 138000,     baseDmg: 22000,  drops: [], isElite: true },
  'the-between':        { id: 'the-between',         name: 'THE BETWEEN',         sprite: '🌉', baseHp: 172000,     baseDmg: 27000,  drops: [], isElite: true },
  'remnant-prime':      { id: 'remnant-prime',       name: 'REMNANT PRIME',       sprite: '⚱️', baseHp: 550000,     baseDmg: 40000,  drops: [], isMiniboss: true },
  'the-remnant-boss':   { id: 'the-remnant-boss',    name: 'THE REMNANT',         sprite: '🏚️', baseHp: 80000000,   baseDmg: 80,     drops: [], isBoss: true },
  'null-colossus':      { id: 'null-colossus',       name: 'NULL COLOSSUS',       sprite: '🗻', baseHp: 730000,     baseDmg: 55000,  drops: [], isMiniboss: true },
  'the-null':           { id: 'the-null',            name: 'THE NULL',            sprite: '⭕', baseHp: 130000000,  baseDmg: 86,     drops: [], isBoss: true },
  'final-guardian':     { id: 'final-guardian',      name: 'FINAL GUARDIAN',      sprite: '🛡️', baseHp: 970000,     baseDmg: 75000,  drops: [], isMiniboss: true },
  'the-nothing':        { id: 'the-nothing',         name: 'THE NOTHING',         sprite: '🕳️', baseHp: 210000000,  baseDmg: 93,     drops: [], isBoss: true },

  // ── ZONES 24-26: NULL SPACE ──────────────────────────────────────────────
  'space-remnant':      { id: 'space-remnant',       name: 'SPACE REMNANT',       sprite: '🌑', baseHp: 215000,     baseDmg: 36000,  drops: [] },
  'void-titan':         { id: 'void-titan',          name: 'VOID TITAN',          sprite: '🌒', baseHp: 270000,     baseDmg: 45000,  drops: [] },
  'null-ancient':       { id: 'null-ancient',        name: 'NULL ANCIENT',        sprite: '🌓', baseHp: 338000,     baseDmg: 56000,  drops: [] },
  'the-erased':         { id: 'the-erased',          name: 'THE ERASED',          sprite: '🌔', baseHp: 422000,     baseDmg: 70000,  drops: [], isElite: true },
  'space-sovereign':    { id: 'space-sovereign',     name: 'SPACE SOVEREIGN',     sprite: '🌕', baseHp: 528000,     baseDmg: 87000,  drops: [], isElite: true },
  'space-colossus':     { id: 'space-colossus',      name: 'SPACE COLOSSUS',      sprite: '🪐', baseHp: 1700000,    baseDmg: 130000, drops: [], isMiniboss: true },
  'null-prime-boss':    { id: 'null-prime-boss',     name: 'NULL PRIME',          sprite: '🌌', baseHp: 350000000,  baseDmg: 99,     drops: [], isBoss: true },
  'void-ancient':       { id: 'void-ancient',        name: 'VOID ANCIENT',        sprite: '💫', baseHp: 2200000,    baseDmg: 180000, drops: [], isMiniboss: true },
  'the-vast':           { id: 'the-vast',            name: 'THE VAST',            sprite: '🔭', baseHp: 580000000,  baseDmg: 106,    drops: [], isBoss: true },
  'space-prime':        { id: 'space-prime',         name: 'SPACE PRIME',         sprite: '⭐', baseHp: 2900000,    baseDmg: 250000, drops: [], isMiniboss: true },
  'the-infinite':       { id: 'the-infinite',        name: 'THE INFINITE',        sprite: '♾️', baseHp: 950000000,  baseDmg: 112,    drops: [], isBoss: true },

  // ── ZONES 27-29: THE END ─────────────────────────────────────────────────
  'end-remnant':        { id: 'end-remnant',         name: 'END REMNANT',         sprite: '🌑', baseHp: 660000,     baseDmg: 110000, drops: [] },
  'final-wisp':         { id: 'final-wisp',          name: 'FINAL WISP',          sprite: '✨', baseHp: 825000,     baseDmg: 138000, drops: [] },
  'end-sovereign':      { id: 'end-sovereign',       name: 'END SOVEREIGN',       sprite: '👁️', baseHp: 1030000,    baseDmg: 172000, drops: [] },
  'the-last':           { id: 'the-last',            name: 'THE LAST',            sprite: '🕯️', baseHp: 1290000,    baseDmg: 215000, drops: [], isElite: true },
  'end-ancient':        { id: 'end-ancient',         name: 'END ANCIENT',         sprite: '⚰️', baseHp: 1610000,    baseDmg: 268000, drops: [], isElite: true },
  'end-colossus':       { id: 'end-colossus',        name: 'END COLOSSUS',        sprite: '🏔️', baseHp: 5200000,    baseDmg: 400000, drops: [], isMiniboss: true },
  'the-first':          { id: 'the-first',           name: 'THE FIRST',           sprite: '🌅', baseHp: 1600000000, baseDmg: 119,    drops: [], isBoss: true },
  'the-last-guardian':  { id: 'the-last-guardian',   name: 'THE LAST GUARDIAN',   sprite: '⚔️', baseHp: 6900000,    baseDmg: 560000, drops: [], isMiniboss: true },
  'the-end':            { id: 'the-end',             name: 'THE END',             sprite: '🌌', baseHp: 2500000000, baseDmg: 125,    drops: [], isBoss: true },
}
