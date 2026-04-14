export type StatKey = 'attack' | 'defence' | 'speed' | 'luck' | 'vitality'

export const STAT_BASE_COSTS: Record<StatKey, number> = {
  attack: 50, defence: 40, speed: 80, luck: 30, vitality: 35,
}
export const STAT_BASE_VALUES: Record<StatKey, number> = {
  attack: 5, defence: 3, speed: 3, luck: 2, vitality: 10,
}
export const STAT_INCREMENTS: Record<StatKey, number> = {
  attack: 3, defence: 2, speed: 1, luck: 1, vitality: 20,
}

export const UPGRADE_COST_SCALE = 1.14
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

export function upgradeCost(stat: StatKey, currentLevel: number): number {
  return Math.floor(STAT_BASE_COSTS[stat] * Math.pow(UPGRADE_COST_SCALE, currentLevel))
}

export function statValue(stat: StatKey, level: number): number {
  return STAT_BASE_VALUES[stat] + level * STAT_INCREMENTS[stat]
}

export function calcMaxHp(vitalityLevel: number): number {
  return statValue('vitality', vitalityLevel) * 10
}

/** Exponential XP scaling: 100 * 1.12^level */
export function xpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.12, level))
}

/** XP earned per kill based on enemy base HP and zone */
export function xpPerKill(enemyBaseHp: number, zoneIndex: number): number {
  return Math.floor(enemyBaseHp * 0.8 * (1 + 0.15 * zoneIndex))
}

/** Prestige multiplier applied to gold and XP earnings */
export function prestigeMultiplier(tokens: number): number {
  return 1 + tokens * 0.10
}

/** Level requirement per zone index — both boss kill AND level needed */
export const ZONE_LEVEL_REQUIREMENTS = [0, 5, 10, 15, 20, 25, 30, 35, 40]

export function calcAttackInterval(speed: number): number {
  return Math.max(200, Math.floor(ATTACK_BASE_INTERVAL / (speed * 0.15)))
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
