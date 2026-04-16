import type { StatKey } from './constants'
import type { Item, ItemSlot } from './items'

// ── Types ─────────────────────────────────────────────────────────────────

export type StatRoll = {
  stat: StatKey
  percent: number     // percentage bonus against player's base upgrade stat
  label: string       // e.g. "+8% ATK (ROLLED)"
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
  weapon:  ['attack', 'speed', 'luck', 'critDmg', 'lifesteal'],
  armour:  ['defence', 'vitality', 'luck', 'hpRegen', 'lifesteal'],
  helmet:  ['defence', 'luck', 'vitality', 'xpBoost', 'goldFind'],
  ring:    ['luck', 'attack', 'speed', 'goldFind', 'xpBoost'],
  amulet:  ['attack', 'defence', 'luck', 'critDmg', 'hpRegen'],
}

// Roll value ranges per rarity
const ROLL_RANGES: Record<string, [number, number]> = {
  common:   [2, 6],
  uncommon: [4, 10],
  rare:     [6, 16],
  epic:     [10, 25],
}

// ── Core roll function ────────────────────────────────────────────────────

export function craftRoll(item: Item, luckStat: number): CraftResult {
  // Boss unique items have hardcoded rolledBonuses — skip random rolling
  if (!ROLL_RANGES[item.rarity]) {
    return { item, bonusRolls: item.rolledBonuses ?? [], rollQuality: 'normal' }
  }
  const luckBonus = Math.min(luckStat * 0.008, 0.8)  // cap at +80%

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
    const pct = rand(min, max)
    usedStats.add(stat)
    bonusRolls.push({
      stat,
      percent: pct,
      label: `+${pct}% ${stat.toUpperCase()} (ROLLED)`,
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

const BASE_GOLD: Record<string, number> = {
  common: 50, uncommon: 150, rare: 400, epic: 1000, legendary: 2500, boss_unique: 5000,
}

const BASE_MATS: Record<string, Record<string, number>> = {
  common:      { wood: 3 },
  uncommon:    { iron: 3 },
  rare:        { iron: 5, herbs: 2 },
  epic:        { iron: 10, herbs: 5 },
  legendary:   { wolton_alloy: 5, void_essence: 2 },
  boss_unique: { wolton_alloy: 10, void_essence: 5 },
}

// ── Item Modifiers (Terraria model) ───────────────────────────────────────

export type ModifierQuality =
  | 'weak' | 'average' | 'strong' | 'legendary' | 'godroll'

export type ItemModifier = {
  quality: ModifierQuality
  bonuses: StatRoll[]    // 1-3 percent bonuses, replaced entirely on reforge
}

function weightedRandom(weights: Record<string, number>): string {
  const r = Math.random()
  let cumulative = 0
  for (const [key, weight] of Object.entries(weights)) {
    cumulative += weight
    if (r <= cumulative) return key
  }
  return Object.keys(weights).at(-1)!
}

export function rollModifier(
  itemTier: number,
  luckStat: number,
  isBossUnique: boolean,
): ItemModifier {
  const upgraded = itemTier >= 6
  const luckBonus = Math.min(luckStat * 0.005, 0.50)

  const weights = upgraded
    ? {
        weak:      0,
        average:   0.35 - luckBonus,
        strong:    0.35,
        legendary: 0.22 + luckBonus * 0.5,
        godroll:   0.08 + luckBonus * 0.5,
      }
    : {
        weak:      0.40 - luckBonus,
        average:   0.30,
        strong:    0.20 + luckBonus * 0.3,
        legendary: 0.08 + luckBonus * 0.5,
        godroll:   isBossUnique
          ? 0.02 + luckBonus * 0.3
          : 0.02 + luckBonus * 0.2,
      }

  const quality = weightedRandom(weights) as ModifierQuality

  const bonusCounts: Record<ModifierQuality, number> = {
    weak: 1, average: 1, strong: 2, legendary: 2, godroll: 3,
  }
  const ranges: Record<ModifierQuality, [number, number]> = {
    weak:      [2, 5],
    average:   [6, 10],
    strong:    [11, 18],
    legendary: [19, 30],
    godroll:   [25, 40],
  }

  const count = bonusCounts[quality]
  const [min, max] = ranges[quality]
  const eligible: StatKey[] = [
    'attack', 'defence', 'speed', 'luck', 'vitality',
    'critDmg', 'hpRegen', 'goldFind', 'xpBoost', 'lifesteal',
  ]
  const used = new Set<StatKey>()
  const bonuses: StatRoll[] = []

  for (let i = 0; i < count; i++) {
    const available = eligible.filter(s => !used.has(s))
    if (!available.length) break
    const stat = available[Math.floor(Math.random() * available.length)]
    used.add(stat)
    const value = Math.floor(Math.random() * (max - min + 1)) + min
    bonuses.push({ stat, percent: value, label: `+${value}% ${stat.toUpperCase()}` })
  }

  return { quality, bonuses }
}

export function reforgeCost(item: Item): { materials: Record<string, number>; gold: number } {
  const tier = item.tier ?? 1
  const count = item.rerollCount ?? 0
  const multiplier = 1 + count * 0.4

  const baseCosts: Record<number, { mat: string; amount: number; gold: number }> = {
    1: { mat: 'iron',             amount: 3, gold: 50    },
    2: { mat: 'steel',            amount: 3, gold: 150   },
    3: { mat: 'wolton_alloy',     amount: 3, gold: 350   },
    4: { mat: 'refined_alloy',    amount: 3, gold: 700   },
    5: { mat: 'wolton_core',      amount: 3, gold: 1400  },
    6: { mat: 'fractured_steel',  amount: 3, gold: 3000  },
    7: { mat: 'wolton_fragment',  amount: 3, gold: 6000  },
  }

  const base = baseCosts[Math.min(tier, 7)]
  return {
    materials: { [base.mat]: Math.ceil(base.amount * multiplier) },
    gold: Math.floor(base.gold * multiplier),
  }
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
