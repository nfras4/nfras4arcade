import type { PlayerState } from './player.svelte'

// ── Types ─────────────────────────────────────────────────────────────────

export type ShopSection =
  | 'benefits'
  | 'metrics'
  | 'configuration'
  | 'review'
  | 'classified'
  | 'noticeboard'

export type ShopItem = {
  id: string
  name: string
  description: string
  flavour: string
  section: ShopSection
  baseCost: number
  effect: string
  repeatable?: boolean
  maxPurchases?: number
  isChallengeModifier?: boolean
  challengeBonus?: number
  hidden?: boolean
  unlockCondition?: (player: PlayerState) => boolean
}

// ── Shop Items Registry ───────────────────────────────────────────────────

export const SHOP_ITEMS: ShopItem[] = [
  // ── BENEFITS SECTION ─────────────────────────────────────────────────────
  {
    id: 'early-checkout',
    name: 'EARLY CHECKOUT',
    description: 'Start future runs at Zone 2.',
    flavour: 'HR has approved your request for an early departure.',
    section: 'benefits',
    baseCost: 1,
    effect: 'startZone:2',
  },
  {
    id: 'fast-track',
    name: 'FAST TRACK',
    description: 'Start future runs at Zone 4.',
    flavour: 'Promoted out of the basement. Conditions apply.',
    section: 'benefits',
    baseCost: 2,
    effect: 'startZone:4',
  },
  {
    id: 'executive-access',
    name: 'EXECUTIVE ACCESS',
    description: 'Start future runs at Zone 6.',
    flavour: 'Corner office key card. Non-transferable.',
    section: 'benefits',
    baseCost: 4,
    effect: 'startZone:6',
  },
  {
    id: 'activity-allowance',
    name: 'ACTIVITY ALLOWANCE',
    description: 'Activity slots increased to 3.',
    flavour: 'Approved overtime allocation.',
    section: 'benefits',
    baseCost: 1,
    effect: 'activitySlots:3',
  },
  {
    id: 'extended-shift',
    name: 'EXTENDED SHIFT',
    description: 'Activity slots increased to 4.',
    flavour: 'Stay back. Finish the job.',
    section: 'benefits',
    baseCost: 2,
    effect: 'activitySlots:4',
  },
  {
    id: 'loot-retention',
    name: 'LOOT RETENTION',
    description: 'Keep your equipped gear across prestige.',
    flavour: 'Company policy: you may retain your tools.',
    section: 'benefits',
    baseCost: 1,
    effect: 'retainGear',
  },
  {
    id: 'material-carry',
    name: 'MATERIAL CARRY',
    description: 'Retain 25% of your materials across prestige.',
    flavour: 'A small portion of supplies comes with you.',
    section: 'benefits',
    baseCost: 2,
    effect: 'carryMaterials:0.25',
  },
  {
    id: 'induction-skip',
    name: 'INDUCTION SKIP',
    description: 'First kill of each boss guarantees a drop.',
    flavour: 'Pre-approved by the hiring committee.',
    section: 'benefits',
    baseCost: 1,
    effect: 'guaranteedFirstKillDrops',
  },
  {
    id: 'priority-processing',
    name: 'PRIORITY PROCESSING',
    description: '20% off all crafting costs.',
    flavour: 'Your tickets skip the queue.',
    section: 'benefits',
    baseCost: 3,
    effect: 'craftingDiscount:0.20',
  },
  {
    id: 'wolton-pension',
    name: 'WOLTON PENSION',
    description: '+10% of lifetime gold earned applied on prestige.',
    flavour: 'Defined benefit scheme. Vesting terms unclear.',
    section: 'benefits',
    baseCost: 2,
    effect: 'pensionGold:0.10',
  },

  // ── METRICS SECTION ──────────────────────────────────────────────────────
  {
    id: 'productivity-review',
    name: 'PRODUCTIVITY REVIEW',
    description: '+5% ATK per purchase.',
    flavour: 'Quarterly KPI review scored favourably.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:attackBonus:5',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'operational-efficiency',
    name: 'OPERATIONAL EFFICIENCY',
    description: '+5% DEF per purchase.',
    flavour: 'Risk mitigation strategies approved.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:defenceBonus:5',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'workflow-optimisation',
    name: 'WORKFLOW OPTIMISATION',
    description: '+3% SPD per purchase.',
    flavour: 'Process improvements identified.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:speedBonus:3',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'budget-allocation',
    name: 'BUDGET ALLOCATION',
    description: '+5% GOLD FIND per purchase.',
    flavour: 'Approved for additional discretionary spending.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:goldBonus:5',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'wellness-program',
    name: 'WELLNESS PROGRAM',
    description: '+5% VIT per purchase.',
    flavour: 'Free fruit in the break room.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:vitalityBonus:5',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'incentive-structure',
    name: 'INCENTIVE STRUCTURE',
    description: '+3% CRIT DMG per purchase.',
    flavour: 'Performance bonuses tied to outcomes.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:critDmgBonus:3',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'blood-drive',
    name: 'BLOOD DRIVE',
    description: '+3% LIFESTEAL per purchase.',
    flavour: 'Mandatory charitable donation.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:lifeStealBonus:3',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'overtime-regen',
    name: 'OVERTIME REGEN',
    description: '+3% HP REGEN per purchase.',
    flavour: 'Catch your breath between tasks.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:hpRegenBonus:3',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'training-budget',
    name: 'TRAINING BUDGET',
    description: '+5% XP per purchase.',
    flavour: 'Approved for continuing education.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:xpBonus:5',
    repeatable: true,
    maxPurchases: 20,
  },
  {
    id: 'luck-of-the-draw',
    name: 'LUCK OF THE DRAW',
    description: '+3% LUCK per purchase.',
    flavour: 'Statistical anomalies tend to favour you now.',
    section: 'metrics',
    baseCost: 1,
    effect: 'perk:luckBonus:3',
    repeatable: true,
    maxPurchases: 20,
  },

  // ── CONFIGURATION SECTION ────────────────────────────────────────────────
  {
    id: 'overtime-pay',
    name: 'OVERTIME PAY',
    description: '2x gold from all kills this run.',
    flavour: 'Approved timesheet. Minor paperwork required.',
    section: 'configuration',
    baseCost: 1,
    effect: 'modifier:goldMult:2',
  },
  {
    id: 'study-leave',
    name: 'STUDY LEAVE',
    description: '2x XP from all kills this run.',
    flavour: 'Approved absence for training purposes.',
    section: 'configuration',
    baseCost: 1,
    effect: 'modifier:xpMult:2',
  },
  {
    id: 'equipment-upgrade',
    name: 'EQUIPMENT UPGRADE',
    description: 'Start this run with a T2 gear set.',
    flavour: 'Supply chain approval pending.',
    section: 'configuration',
    baseCost: 1,
    effect: 'modifier:startGear:t2',
  },
  {
    id: 'corporate-card',
    name: 'CORPORATE CARD',
    description: 'Start this run with +2000 gold.',
    flavour: 'Expense account. Do not misuse.',
    section: 'configuration',
    baseCost: 2,
    effect: 'modifier:startGold:2000',
  },
  {
    id: 'skill-seminar',
    name: 'SKILL SEMINAR',
    description: '3x skill XP this run.',
    flavour: 'All-day learning event. Coffee provided.',
    section: 'configuration',
    baseCost: 1,
    effect: 'modifier:skillXpMult:3',
  },
  {
    id: 'fast-track-loot',
    name: 'FAST TRACK LOOT',
    description: '2x drop rate this run.',
    flavour: 'Accelerated procurement pipeline.',
    section: 'configuration',
    baseCost: 2,
    effect: 'modifier:dropRateMult:2',
  },
  {
    id: 'emergency-supplies',
    name: 'EMERGENCY SUPPLIES',
    description: 'Start this run with 5 potions.',
    flavour: 'First aid kit pre-approved.',
    section: 'configuration',
    baseCost: 1,
    effect: 'modifier:startPotions:5',
  },
  {
    id: 'hazard-pay',
    name: 'HAZARD PAY',
    description: '2x lifesteal this run.',
    flavour: 'Danger allowance approved.',
    section: 'configuration',
    baseCost: 2,
    effect: 'modifier:lifeStealMult:2',
  },
  {
    id: 'desk-job',
    name: 'DESK JOB',
    description: '2x material yield from activities this run.',
    flavour: 'Administrative productivity initiative.',
    section: 'configuration',
    baseCost: 1,
    effect: 'modifier:materialYieldMult:2',
  },
  {
    id: 'performance-bonus',
    name: 'PERFORMANCE BONUS',
    description: '2x prestige tokens earned from Fraser this run.',
    flavour: 'Annual bonus contingent on outcomes.',
    section: 'configuration',
    baseCost: 2,
    effect: 'modifier:prestigeMult:2',
  },

  // ── PERFORMANCE REVIEW SECTION (challenges) ──────────────────────────────
  {
    id: 'unpaid-overtime',
    name: 'UNPAID OVERTIME',
    description: 'No gold from combat this run. +1 token on Fraser kill.',
    flavour: 'Volunteering builds character.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:noCombatGold',
    isChallengeModifier: true,
    challengeBonus: 1,
  },
  {
    id: 'understaffed',
    name: 'UNDERSTAFFED',
    description: 'Limited to one activity slot this run. +1 token.',
    flavour: 'Do more with less.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:oneActivitySlot',
    isChallengeModifier: true,
    challengeBonus: 1,
  },
  {
    id: 'no-equipment-policy',
    name: 'NO EQUIPMENT POLICY',
    description: 'Cannot equip gear this run. +2 tokens.',
    flavour: 'Company policy: bring your own enthusiasm.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:noGear',
    isChallengeModifier: true,
    challengeBonus: 2,
  },
  {
    id: 'ironman-clause',
    name: 'IRONMAN CLAUSE',
    description: 'No respawns. One death ends the run. +2 tokens.',
    flavour: 'Signed off on the waiver.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:noRespawn',
    isChallengeModifier: true,
    challengeBonus: 2,
  },
  {
    id: 'slow-processing',
    name: 'SLOW PROCESSING',
    description: 'Attack interval capped at 750ms. +1 token.',
    flavour: 'All actions require triplicate forms.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:slowAttack:750',
    isChallengeModifier: true,
    challengeBonus: 1,
  },
  {
    id: 'full-audit',
    name: 'FULL AUDIT',
    description: 'No gear and no respawns. +3 tokens.',
    flavour: 'Everything is under review.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:fullAudit',
    isChallengeModifier: true,
    challengeBonus: 3,
  },
  {
    id: 'speed-review',
    name: 'SPEED REVIEW',
    description: 'Defeat Fraser within 45 minutes. +2 tokens.',
    flavour: 'The board expects results by EOD.',
    section: 'review',
    baseCost: 0,
    effect: 'challenge:speedRun:2700000',
    isChallengeModifier: true,
    challengeBonus: 2,
  },

  // ── CLASSIFIED SECTION ───────────────────────────────────────────────────
  {
    id: 'structural-redundancy',
    name: 'STRUCTURAL REDUNDANCY',
    description: 'Activity slots increased to 5.',
    flavour: 'Cleared for high-workload operations.',
    section: 'classified',
    baseCost: 5,
    effect: 'activitySlots:5',
    hidden: true,
    unlockCondition: (p) => p.prestigeTokens >= 5,
  },
  {
    id: 'fraser-protocol',
    name: 'FRASER PROTOCOL',
    description: 'Unlock Fraser\'s Phase 4. He has been training.',
    flavour: '[REDACTED — Level 7 clearance]',
    section: 'classified',
    baseCost: 8,
    effect: 'unlock:fraser-protocol',
    hidden: true,
    unlockCondition: (p) => p.lifetimeStats.fraserKills >= 3,
  },
  {
    id: 'internal-memo',
    name: 'INTERNAL MEMO',
    description: 'Unlock the LORE tab. What really happened here.',
    flavour: 'Distributed in error. Please delete.',
    section: 'classified',
    baseCost: 10,
    effect: 'unlock:internal-memo',
    hidden: true,
    unlockCondition: (p) => p.deepestPostGameZone >= 15,
  },

  // ── NOTICE BOARD SECTION ─────────────────────────────────────────────────
  {
    id: 'resignation-letter',
    name: 'RESIGNATION LETTER',
    description: 'Submit it to Nick. You will not regret this.',
    flavour: 'Signed. Dated. Delivered.',
    section: 'noticeboard',
    baseCost: 0,
    effect: 'unlock:resignation-letter',
    hidden: true,
    unlockCondition: (p) => p.permanentUnlocks.includes('full-audit'),
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────

export function getItemCost(item: ShopItem, timesPurchased: number): number {
  if (!item.repeatable) return item.baseCost
  return Math.max(1, Math.floor(item.baseCost * Math.pow(1.8, timesPurchased)))
}

export function getTimesPurchased(item: ShopItem, player: PlayerState): number {
  if (item.repeatable) return player.prestigePerkLevels[item.id] ?? 0
  return player.permanentUnlocks.includes(item.id) ? 1 : 0
}

export function canAfford(item: ShopItem, player: PlayerState): boolean {
  const times = getTimesPurchased(item, player)
  const cost = getItemCost(item, times)
  if (player.prestigeTokens < cost) return false
  if (item.maxPurchases !== undefined && times >= item.maxPurchases) return false
  if (!item.repeatable && !item.isChallengeModifier && item.section !== 'configuration' && times >= 1) return false
  return true
}

export function isUnlocked(item: ShopItem, player: PlayerState): boolean {
  if (!item.hidden) return true
  if (item.unlockCondition) return item.unlockCondition(player)
  return false
}

export function getVisibleItems(player: PlayerState, section: ShopSection): ShopItem[] {
  return SHOP_ITEMS.filter(item => {
    if (item.section !== section) return false
    if (item.hidden && !isUnlocked(item, player)) return false
    return true
  })
}

export function isMaxedOut(item: ShopItem, player: PlayerState): boolean {
  const times = getTimesPurchased(item, player)
  if (item.maxPurchases !== undefined) return times >= item.maxPurchases
  if (!item.repeatable && !item.isChallengeModifier && item.section !== 'configuration') return times >= 1
  return false
}

/** True if this item is currently active in the player's state. */
export function isItemActive(item: ShopItem, player: PlayerState): boolean {
  if (item.isChallengeModifier) return player.activeChallenges.includes(item.effect)
  if (item.section === 'configuration') return player.activeModifiers.includes(item.effect)
  return player.permanentUnlocks.includes(item.id)
}

/** Attempt to purchase an item. Returns true on success. */
export function purchaseShopItem(item: ShopItem, player: PlayerState): boolean {
  const times = getTimesPurchased(item, player)
  const cost = getItemCost(item, times)
  if (player.prestigeTokens < cost) return false
  if (item.maxPurchases !== undefined && times >= item.maxPurchases) return false
  if (!item.repeatable && !item.isChallengeModifier && item.section !== 'configuration' && times >= 1) return false

  player.prestigeTokens -= cost

  // Handle perk effects
  if (item.effect.startsWith('perk:')) {
    const parts = item.effect.split(':')
    const key = parts[1] as keyof PlayerState['prestigePerks']
    const value = Number(parts[2])
    if (player.prestigePerks[key] !== undefined && !Number.isNaN(value)) {
      player.prestigePerks[key] = (player.prestigePerks[key] ?? 0) + value
    }
    player.prestigePerkLevels[item.id] = (player.prestigePerkLevels[item.id] ?? 0) + 1
    return true
  }

  // Challenge modifier — add to activeChallenges
  if (item.isChallengeModifier) {
    if (!player.activeChallenges.includes(item.effect)) {
      player.activeChallenges = [...player.activeChallenges, item.effect]
    }
    return true
  }

  // Configuration modifier — add to activeModifiers
  if (item.section === 'configuration') {
    if (!player.activeModifiers.includes(item.effect)) {
      player.activeModifiers = [...player.activeModifiers, item.effect]
    }
    return true
  }

  // Otherwise: permanent unlock
  if (!player.permanentUnlocks.includes(item.id)) {
    player.permanentUnlocks = [...player.permanentUnlocks, item.id]
  }
  return true
}

/** Compute total bonus tokens from active challenges. */
export function computeChallengeBonus(player: PlayerState): number {
  let total = 0
  for (const eff of player.activeChallenges) {
    const item = SHOP_ITEMS.find(i => i.effect === eff && i.isChallengeModifier)
    if (item?.challengeBonus) total += item.challengeBonus
  }
  return total
}

/** Returns true if the player has an active modifier whose effect starts with the prefix. */
export function hasModifier(player: PlayerState, prefix: string): boolean {
  return player.activeModifiers.some(m => m === prefix || m.startsWith(prefix + ':') || m.startsWith(prefix))
}

/** Returns true if the player has an active challenge whose effect matches the prefix or exact value. */
export function hasChallenge(player: PlayerState, prefix: string): boolean {
  return player.activeChallenges.some(c => c === prefix || c.startsWith(prefix + ':') || c.startsWith(prefix))
}
