import { gainMaterial, gainGold, goldFindMultiplier, player, savePlayer, gainSkillXp } from './player.svelte'
import { prestigeMultiplier, SKILL_TIER_UNLOCKS, type SkillId } from './constants'
import { hasModifier, hasChallenge } from './prestige'

export type Activity = {
  id: string
  name: string
  sprite: string
  durationMs: number
  reward: { material: string; amount: number }
  unlockLevel: number
}

export const ACTIVITIES: Activity[] = [
  { id: 'chop-wood',    name: 'CHOP WOOD',    sprite: '🪵', durationMs: 10_000, reward: { material: 'wood',   amount: 3  }, unlockLevel: 1 },
  { id: 'mine-iron',    name: 'MINE IRON',    sprite: '⛏️', durationMs: 20_000, reward: { material: 'iron',   amount: 2  }, unlockLevel: 3 },
  { id: 'brew-potion',  name: 'BREW POTION',  sprite: '🧪', durationMs: 30_000, reward: { material: 'potion', amount: 1  }, unlockLevel: 5 },
  { id: 'gather-herbs', name: 'GATHER HERBS', sprite: '🌿', durationMs: 45_000, reward: { material: 'herbs',  amount: 1  }, unlockLevel: 7 },
  { id: 'patrol',       name: 'PATROL',       sprite: '🗺️', durationMs: 60_000, reward: { material: 'gold',   amount: 80 }, unlockLevel: 1 },
]

export const BASE_SLOTS = 2

// ── Skill integration ─────────────────────────────────────────────────────

export type ActivityId = 'chop-wood' | 'mine-iron' | 'brew-potion' | 'gather-herbs' | 'patrol'

export const SKILL_MAP: Record<ActivityId, SkillId> = {
  'chop-wood':    'woodcutting',
  'mine-iron':    'mining',
  'brew-potion':  'brewing',
  'gather-herbs': 'herbalism',
  'patrol':       'patrol',
}

const ACTIVITY_BASE_XP: Record<ActivityId, number> = {
  'chop-wood':    15,
  'mine-iron':    25,
  'brew-potion':  35,
  'gather-herbs': 40,
  'patrol':       20,
}

function getSkillXpGain(baseXp: number, skillLevel: number, multiplier: number): number {
  const levelBonus = 1 + (skillLevel * 0.05)  // +5% per level
  return Math.floor(baseXp * levelBonus * multiplier)
}

const BASE_MATERIAL: Record<ActivityId, string> = {
  'chop-wood':    'wood',
  'mine-iron':    'iron',
  'brew-potion':  'potion',
  'gather-herbs': 'herbs',
  'patrol':       'gold',
}

export function getActivityYield(activityId: string, skillLevel: number): number {
  const activity = ACTIVITIES.find(a => a.id === activityId)
  if (!activity) return 1
  return activity.reward.amount + Math.floor(skillLevel / 10)  // +1 per 10 levels
}

export function getActivityMaterial(activityId: string, skillLevel: number): string {
  const skillId = SKILL_MAP[activityId as ActivityId]
  if (!skillId) return BASE_MATERIAL[activityId as ActivityId] ?? 'wood'
  const unlocks = SKILL_TIER_UNLOCKS[skillId]
  const tiers = Object.entries(unlocks)
    .filter(([lvl]) => Number(lvl) <= skillLevel)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
  return tiers[0]?.[1]?.[0] ?? BASE_MATERIAL[activityId as ActivityId] ?? 'wood'
}

export type TimerEntry = {
  activityId: string
  startedAt: number      // Date.now() timestamp
  endsAt: number
  collected: boolean
}

type TimerState = {
  active: Record<string, TimerEntry>   // activityId → entry
}

const TIMER_KEY = 'wolton-dungeon-timers'
const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000  // 8 hours

export type OfflineEarnings = {
  timeAway: number              // ms
  capped: boolean
  completedTimers: string[]     // activity names
  patrolGold: number
  materialRewards: { name: string; amount: number }[]
}

export const timerState: TimerState = $state({ active: {} })

/** Pending offline earnings to show in modal -- consumed by +page.svelte */
const offlineState = $state<{ earnings: OfflineEarnings | null }>({ earnings: null })

export function getOfflineEarnings(): OfflineEarnings | null {
  return offlineState.earnings
}

export function clearOfflineEarnings(): void {
  offlineState.earnings = null
}

export function loadTimers(): void {
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(TIMER_KEY)
  if (!raw) return
  try {
    const saved = JSON.parse(raw) as TimerState
    const now = Date.now()
    const lastSave = player.lastSaveTimestamp || now
    const rawElapsed = now - lastSave
    const elapsed = Math.min(rawElapsed, OFFLINE_CAP_MS)
    const capped = rawElapsed > OFFLINE_CAP_MS

    const completedTimers: string[] = []
    const materialRewards: { name: string; amount: number }[] = []
    let patrolGold = 0

    Object.values(saved.active).forEach(entry => {
      if (entry.collected) return
      const activity = ACTIVITIES.find(a => a.id === entry.activityId)
      if (!activity) return

      if (entry.endsAt <= now) {
        // Timer completed while offline
        if (activity.id === 'patrol') {
          // Calculate full patrol cycles during offline time
          const remainingAtSave = Math.max(0, entry.endsAt - lastSave)
          const timeAfterFirst = elapsed - remainingAtSave
          const extraCycles = timeAfterFirst > 0 ? Math.floor(timeAfterFirst / activity.durationMs) : 0
          const totalCycles = 1 + extraCycles  // 1 for the original completion + extras
          const pMult = prestigeMultiplier(player.prestigeTokens)
          const gMult = goldFindMultiplier()
          const patrolSkillLevel = player.skills?.patrol?.level ?? 0
          const patrolBase = 80 + patrolSkillLevel * 5
          const patrolSkillBonus = patrolSkillLevel * 3
          const gold = Math.floor(totalCycles * (patrolBase + patrolSkillBonus) * pMult * gMult)
          patrolGold += gold
          gainGold(gold)
          player.lifetimeStats.goldEarned += gold
          const patrolXp = getSkillXpGain(ACTIVITY_BASE_XP['patrol'], patrolSkillLevel, player.skillXpMultiplier ?? 1.0)
          gainSkillXp('patrol', patrolXp)
        } else {
          applyReward(activity)
          materialRewards.push({ name: activity.name, amount: activity.reward.amount })
        }
        completedTimers.push(activity.name)
        entry.collected = true
      }
    })

    timerState.active = saved.active

    // Only show modal if there were actual earnings
    const hasEarnings = completedTimers.length > 0 || patrolGold > 0
    if (hasEarnings && rawElapsed > 10_000) {
      offlineState.earnings = {
        timeAway: rawElapsed,
        capped,
        completedTimers,
        patrolGold,
        materialRewards,
      }
    }
  } catch {
    // corrupt save -- ignore
  }
}

export function saveTimers(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TIMER_KEY, JSON.stringify(timerState))
}

export function resetTimers(): void {
  timerState.active = {}
}

function applyReward(activity: Activity): void {
  const skillId = SKILL_MAP[activity.id as ActivityId]
  const skillLevel = player.skills?.[skillId]?.level ?? 0

  // HR Shop modifiers: DESK JOB doubles material yield, SKILL SEMINAR triples skill XP
  const matYieldMult = hasModifier(player, 'modifier:materialYieldMult:2') ? 2 : 1
  const skillXpRunMult = hasModifier(player, 'modifier:skillXpMult:3') ? 3 : 1

  if (activity.id === 'patrol') {
    const patrolSkillBonus = skillLevel * 3  // +3 gold per skill level per cycle
    const patrolBase = 80 + skillLevel * 5
    const gold = Math.floor((patrolBase + patrolSkillBonus) * goldFindMultiplier())
    gainGold(gold)
    player.lifetimeStats.goldEarned += gold
  } else {
    const mat    = getActivityMaterial(activity.id, skillLevel)
    const amount = getActivityYield(activity.id, skillLevel) * matYieldMult
    gainMaterial(mat, amount)
  }

  const baseXp = (ACTIVITY_BASE_XP[activity.id as ActivityId] ?? 0) * skillXpRunMult
  const xpGain = getSkillXpGain(baseXp, skillLevel, player.skillXpMultiplier ?? 1.0)
  if (xpGain > 0 && skillId) gainSkillXp(skillId, xpGain)

  savePlayer()
}

export function activeSlotCount(): number {
  return Object.values(timerState.active).filter(e => !e.collected).length
}

/** Effective slot cap, accounting for HR Shop permanent unlocks and the
 *  Understaffed challenge (which hard-caps slots to 1 regardless of other
 *  unlocks). Prestige tokens still grant +1 each on top. */
export function effectiveSlotCap(): number {
  if (hasChallenge(player, 'challenge:oneActivitySlot')) return 1
  let slots = BASE_SLOTS
  const unlocks = player.permanentUnlocks ?? []
  if (unlocks.includes('structural-redundancy')) slots = Math.max(slots, 5)
  else if (unlocks.includes('extended-shift'))   slots = Math.max(slots, 4)
  else if (unlocks.includes('activity-allowance')) slots = Math.max(slots, 3)
  return slots + player.prestigeTokens
}

export function canStart(activity: Activity): boolean {
  if (player.level < activity.unlockLevel) return false
  if (activeSlotCount() >= effectiveSlotCap()) return false
  const existing = timerState.active[activity.id]
  if (existing && !existing.collected) return false
  return true
}

export function startActivity(activityId: string): void {
  const activity = ACTIVITIES.find(a => a.id === activityId)
  if (!activity || !canStart(activity)) return
  const now = Date.now()
  timerState.active[activityId] = {
    activityId,
    startedAt: now,
    endsAt: now + activity.durationMs,
    collected: false,
  }
  saveTimers()
}

export function collectActivity(activityId: string): void {
  const entry = timerState.active[activityId]
  if (!entry || entry.collected) return
  if (Date.now() < entry.endsAt) return
  const activity = ACTIVITIES.find(a => a.id === activityId)
  if (!activity) return
  applyReward(activity)
  entry.collected = true
  saveTimers()
}

/** Returns 0–1 progress for a running timer, 1 if done. */
export function timerProgress(activityId: string, now: number = Date.now()): number {
  const entry = timerState.active[activityId]
  if (!entry) return 0
  const activity = ACTIVITIES.find(a => a.id === activityId)
  if (!activity) return 0
  if (entry.collected) return 0
  const elapsed = now - entry.startedAt
  return Math.min(1, elapsed / activity.durationMs)
}

export function timerRemaining(activityId: string, now: number = Date.now()): number {
  const entry = timerState.active[activityId]
  if (!entry || entry.collected) return 0
  return Math.max(0, entry.endsAt - now)
}

export function isRunning(activityId: string, now: number = Date.now()): boolean {
  const entry = timerState.active[activityId]
  return !!entry && !entry.collected && now < entry.endsAt
}

export function isReady(activityId: string, now: number = Date.now()): boolean {
  const entry = timerState.active[activityId]
  return !!entry && !entry.collected && now >= entry.endsAt
}

export function formatMs(ms: number): string {
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
