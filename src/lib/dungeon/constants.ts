export type StatKey =
  | 'attack' | 'defence' | 'speed' | 'luck' | 'vitality'
  | 'critDmg' | 'hpRegen' | 'goldFind' | 'xpBoost' | 'lifesteal'

export const STAT_BASE_COSTS: Record<StatKey, number> = {
  attack: 50, defence: 50, speed: 70, luck: 50, vitality: 50,
  critDmg: 90, hpRegen: 60, goldFind: 70, xpBoost: 65, lifesteal: 85,
}

/** Stat values at upgrade level 0 (no upgrades purchased).
 *  speed = 0 means no attack-speed bonus; calcAttackInterval uses (1 + speed). */
export const STAT_BASE_VALUES: Record<StatKey, number> = {
  attack: 5, defence: 3, speed: 0, luck: 2, vitality: 10,
  critDmg: 200, hpRegen: 0, goldFind: 0, xpBoost: 0, lifesteal: 0,
}

/**
 * Gain per level at LVL 1. Actual per-level gain tapers via calcUpgradeGain.
 * speed: whole-number scale, 4 per level with 0.12 diminishing rate (see STAT_DIMINISHING_RATES).
 * vitality: gain * 10 = HP gained (8 * 10 = 80 HP at LVL 1).
 * critDmg: stored as percentage points (25 = +0.25x multiplier).
 * goldFind/xpBoost/lifesteal: percentage points (12 = +12%).
 */
export const STAT_BASE_GAINS: Record<StatKey, number> = {
  attack: 12, defence: 6, speed: 4, luck: 8, vitality: 8,
  critDmg: 25, hpRegen: 3, goldFind: 12, xpBoost: 12, lifesteal: 6,
}

/** Per-stat diminishing-returns rate. Stats not listed use the default 0.15. */
const STAT_DIMINISHING_RATES: Partial<Record<StatKey, number>> = {
  speed: 0.12,
}

/** Base XP per kill by enemy tier at zone tier 1. Scales via calcZoneReward. */
export const BASE_XP_NORMAL   = 18
export const BASE_XP_ELITE    = 35
export const BASE_XP_MINIBOSS = 80
export const BASE_XP_BOSS     = 200

/** Base gold per kill by enemy tier at zone tier 1. Scales via calcZoneReward. */
export const BASE_GOLD_NORMAL   = 10
export const BASE_GOLD_ELITE    = 22
export const BASE_GOLD_MINIBOSS = 45
export const BASE_GOLD_BOSS     = 120
export const ATTACK_BASE_INTERVAL = 1500
export const ENEMY_ATTACK_INTERVAL = 2000
export const ENEMY_HP_ZONE_SCALE = 1.18
export const ENEMY_DMG_ZONE_SCALE = 1.15
export const ENEMY_HP_STAGE_SCALE = 1.05
export const ENEMY_DMG_STAGE_SCALE = 1.04
export const ELITE_HP_MULT = 3
export const MINIBOSS_HP_MULT = 8
export const BOSS_HP_MULT = 25
export const STAGES_PER_ZONE = 20
export const MAX_LOG_ENTRIES = 6
export const AUTOSAVE_INTERVAL_MS = 30_000
export const XP_PER_KILL = 50
export const XP_BONUS_WIN = 50

/** Zone reward scaling: base * 1.35^(tier-1). tier = zoneIndex + 1. */
export function calcZoneReward(base: number, tier: number): number {
  return Math.round(base * Math.pow(1.35, tier - 1))
}

/** Per-level stat gain with diminishing returns. level is 1-indexed (level being purchased). */
export function calcUpgradeGain(stat: StatKey, level: number): number {
  const rate = STAT_DIMINISHING_RATES[stat] ?? 0.15
  return STAT_BASE_GAINS[stat] * (1 / (1 + rate * (level - 1)))
}

/** Upgrade cost: baseCost * 1.18^currentLevel, rounded to nearest 5. */
export function calcUpgradeCost(stat: StatKey, currentLevel: number): number {
  return Math.round(STAT_BASE_COSTS[stat] * Math.pow(1.18, currentLevel) / 5) * 5
}

/** Alias kept for UI imports — delegates to calcUpgradeCost. */
export function upgradeCost(stat: StatKey, currentLevel: number): number {
  return calcUpgradeCost(stat, currentLevel)
}

/** Hard caps to guard against runaway stat inflation. */
const STAT_SANITY_CAPS: Partial<Record<StatKey, number>> = {
  attack:   2000,
  defence:   800,
  vitality: 50000,
  critDmg:  1500,
  speed:     150,
}

/** Cumulative stat value at a given upgrade level, derived fresh from base each call. */
export function statValue(stat: StatKey, level: number): number {
  let value = STAT_BASE_VALUES[stat]
  for (let i = 1; i <= level; i++) {
    value += calcUpgradeGain(stat, i)
  }
  const cap = STAT_SANITY_CAPS[stat]
  if (cap !== undefined && value > cap) {
    console.warn(`[dungeon] ${stat} hit sanity cap (${value.toFixed(2)} > ${cap})`)
    return cap
  }
  return value
}

export function calcMaxHp(vitalityLevel: number): number {
  return statValue('vitality', vitalityLevel) * 10
}

/** Exponential XP scaling: 100 * 1.12^level */
export function xpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.12, level))
}

/** Prestige multiplier applied to gold and XP earnings */
export function prestigeMultiplier(tokens: number): number {
  return 1 + tokens * 0.10
}

/** Level requirement per zone index — both boss kill AND level needed */
export const ZONE_LEVEL_REQUIREMENTS = [0, 5, 10, 15, 20, 25, 30, 35, 40]

/** Attack interval in ms. Exponential decay: 1500 * 0.978^speed, floor 250ms (200ms with 2x toggle). */
export function calcAttackInterval(speed: number): number {
  return Math.max(250, Math.floor(ATTACK_BASE_INTERVAL * Math.pow(0.978, speed)))
}

export function calcEnemyHp(baseHp: number, zoneIndex: number, stageNumber: number, mult = 1): number {
  return Math.floor(baseHp * Math.pow(ENEMY_HP_ZONE_SCALE, zoneIndex) * Math.pow(ENEMY_HP_STAGE_SCALE, stageNumber) * mult)
}

export function calcEnemyDmg(baseDmg: number, zoneIndex: number, stageNumber: number): number {
  return Math.floor(baseDmg * Math.pow(ENEMY_DMG_ZONE_SCALE, zoneIndex) * Math.pow(ENEMY_DMG_STAGE_SCALE, stageNumber))
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ── Skills ────────────────────────────────────────────────────────────────

export type SkillId =
  | 'woodcutting'
  | 'mining'
  | 'herbalism'
  | 'brewing'
  | 'patrol'

export type SkillState = {
  level: number       // 0-60
  xp: number
  xpToNext: number
}

/** Skill XP needed to go from `level` to `level+1`. */
export function skillXpToNext(level: number): number {
  return Math.floor(200 * Math.pow(1.3, level))
}

/** Maps skill id → level thresholds → material keys unlocked at that level */
export const SKILL_TIER_UNLOCKS: Record<SkillId, Record<number, string[]>> = {
  woodcutting: {
     1: ['wood'],           10: ['hardwood'],       20: ['darkwood'],
    30: ['shadowwood'],     40: ['abysswood'],       50: ['voidwood'],
    60: ['etherwood'],
  },
  mining: {
     1: ['iron'],           10: ['steel'],           20: ['wolton_alloy'],
    30: ['refined_alloy'],  40: ['wolton_core'],     50: ['fractured_steel'],
    60: ['wolton_fragment'],
  },
  herbalism: {
     1: ['herbs'],          10: ['rare_herbs'],      20: ['void_essence'],
    30: ['cursed_herbs'],   40: ['ancient_essence'], 50: ['primordial_dust'],
    60: ['ascendant_shard'],
  },
  brewing: {
     1: ['potion'],         10: ['strong_potion'],   20: ['mega_potion'],
  },
  patrol: {},
}

/** Passive combat bonus each skill grants per level */
export const SKILL_COMBAT_BONUSES: Record<SkillId, { stat: StatKey; perLevel: number }> = {
  woodcutting: { stat: 'defence',  perLevel: 0.25  },  // max +15% at 60
  mining:      { stat: 'attack',   perLevel: 0.25  },  // max +15% at 60
  herbalism:   { stat: 'hpRegen',  perLevel: 0.167 },  // max +10/s at 60
  brewing:     { stat: 'vitality', perLevel: 0.083 },  // max +5% at 60
  patrol:      { stat: 'goldFind', perLevel: 0 },      // direct patrol gold bonus in timers.svelte.ts instead
}

// ── Achievements ──────────────────────────────────────────────────────────

export type Achievement = {
  id: string
  name: string
  desc: string
  sprite: string
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-blood',    name: 'FIRST BLOOD',           sprite: '⚔️',  desc: 'Kill your first enemy' },
  { id: 'zone-2',         name: 'OUT OF THE BASEMENT',   sprite: '🚪',  desc: 'Reach zone 2' },
  { id: 'loot-drop',      name: 'LOOTER',                sprite: '🎁',  desc: 'Pick up your first item' },
  { id: 'level-10',       name: 'GETTING THERE',         sprite: '📈',  desc: 'Reach level 10' },
  { id: 'level-25',       name: 'GRINDER',               sprite: '💪',  desc: 'Reach level 25' },
  { id: 'level-50',       name: 'NO LIFE',               sprite: '💀',  desc: 'Reach level 50' },
  { id: 'full-gear',      name: 'SUITED UP',             sprite: '🦺',  desc: 'Fill all 5 gear slots' },
  { id: 'prestige-1',     name: 'ASCENDED',              sprite: '⚡',  desc: 'Prestige for the first time' },
  { id: 'prestige-3',     name: 'KEEP GRINDING',         sprite: '🔁',  desc: 'Prestige 3 times' },
  { id: 'fraser-1',       name: 'GOT HIM',               sprite: '👔',  desc: 'Defeat Fraser' },
  { id: 'fraser-3',       name: 'HE KEEPS COMING BACK',  sprite: '😤',  desc: 'Defeat Fraser 3 times' },
  { id: 'zone-9',         name: 'TOP FLOOR',             sprite: '🏢',  desc: 'Reach the 32nd floor' },
  { id: 'secret',         name: '???',                   sprite: '❓',  desc: '???' },
]
