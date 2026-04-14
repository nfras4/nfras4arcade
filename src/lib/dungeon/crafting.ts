import type { StatKey } from './constants'
import type { Item, ItemSlot } from './items'

// ── Types ─────────────────────────────────────────────────────────────────

export type StatRoll = {
  stat: StatKey
  value: number
  label: string    // e.g. "+3 ATK (ROLLED)"
}

export type RollQuality = 'normal' | 'good' | 'great' | 'perfect'

export type CraftResult = {
  item: Item
  bonusRolls: StatRoll[]    // 0-3 bonus stat rolls on top of base
  rollQuality: RollQuality
}

export type RerollCost = {
  gold: number
  materials: Record<string, number>
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Which stats can roll per slot
const ROLLABLE_STATS: Record<ItemSlot, StatKey[]> = {
  weapon:  ['attack', 'speed', 'luck'],
  armour:  ['defence', 'vitality', 'luck'],
  helmet:  ['defence', 'luck', 'vitality'],
  ring:    ['luck', 'attack', 'speed'],
  amulet:  ['attack', 'defence', 'luck'],
}

// Roll value ranges per rarity
const ROLL_RANGES: Record<Item['rarity'], [number, number]> = {
  common:   [1, 3],
  uncommon: [2, 5],
  rare:     [3, 8],
  epic:     [5, 15],
}

// ── Core roll function ────────────────────────────────────────────────────

export function craftRoll(item: Item, luckStat: number): CraftResult {
  const luckBonus = Math.min(luckStat * 0.008, 0.4)  // cap at +40%

  // Determine quality
  const r = Math.random()
  let quality: RollQuality
  if      (r < 0.50 + luckBonus) quality = 'normal'
  else if (r < 0.78 + luckBonus) quality = 'good'
  else if (r < 0.93 + luckBonus) quality = 'great'
  else                            quality = 'perfect'

  // Number of bonus rolls per quality
  const rollCounts: Record<RollQuality, number> = {
    normal:  rand(0, 1),
    good:    rand(1, 2),
    great:   rand(2, 3),
    perfect: 3,
  }
  const count = rollCounts[quality]

  const eligible = ROLLABLE_STATS[item.slot]
  const [min, max] = ROLL_RANGES[item.rarity]
  const bonusRolls: StatRoll[] = []
  const usedStats = new Set<StatKey>()

  for (let i = 0; i < count; i++) {
    const available = eligible.filter(s => !usedStats.has(s))
    if (!available.length) break
    const stat = available[Math.floor(Math.random() * available.length)]
    const value = rand(min, max)
    usedStats.add(stat)
    bonusRolls.push({
      stat,
      value,
      label: `+${value} ${stat.toUpperCase()} (ROLLED)`,
    })
  }

  return { item, bonusRolls, rollQuality: quality }
}

// ── Zone-biased drop roll ─────────────────────────────────────────────────

/** Apply craftRoll with quality floor based on zone index */
export function dropRoll(item: Item, luckStat: number, zoneIndex: number, isBossKill: boolean): CraftResult {
  // For drops, bias quality based on zone and boss
  const zoneBias = zoneIndex >= 6 ? 0.15 : zoneIndex >= 3 ? 0.08 : 0

  if (isBossKill) {
    // Boss kills: always at least 'good' — re-roll until good+
    let result: CraftResult
    do {
      result = craftRoll(item, luckStat)
    } while (result.rollQuality === 'normal' && result.bonusRolls.length === 0)
    return result
  }

  // Zones 7-9: great/perfect possible (add extra luck bias)
  if (zoneIndex >= 6) {
    return craftRoll(item, luckStat + zoneBias * 125)  // translate bias to luck equiv
  }
  // Zones 4-6: good/great possible
  if (zoneIndex >= 3) {
    return craftRoll(item, luckStat + zoneBias * 125)
  }
  // Zones 1-3: normal/good only — clamp quality
  return craftRoll(item, luckStat)
}

// ── Reroll cost ────────────────────────────────────────────────────────────

const BASE_GOLD: Record<Item['rarity'], number> = {
  common: 50, uncommon: 150, rare: 400, epic: 1000,
}

const BASE_MATS: Record<Item['rarity'], Record<string, number>> = {
  common:   { wood: 3 },
  uncommon: { iron: 3 },
  rare:     { iron: 5, herbs: 2 },
  epic:     { iron: 10, herbs: 5 },
}

export function rerollCost(item: Item): RerollCost {
  const rerolls = item.rerollCount ?? 0
  const multiplier = 1 + rerolls * 0.5   // each reroll costs 50% more

  return {
    gold: Math.floor(BASE_GOLD[item.rarity] * multiplier),
    materials: Object.fromEntries(
      Object.entries(BASE_MATS[item.rarity]).map(([k, v]) =>
        [k, Math.ceil(v * multiplier)]
      )
    ),
  }
}
