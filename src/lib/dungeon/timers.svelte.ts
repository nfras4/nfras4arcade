import { gainMaterial, gainGold, goldFindMultiplier, player, savePlayer } from './player.svelte'
import { prestigeMultiplier } from './constants'

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
          const gold = Math.floor(totalCycles * activity.reward.amount * pMult * gMult)
          patrolGold += gold
          gainGold(gold)
          player.lifetimeStats.goldEarned += gold
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
  if (activity.reward.material === 'gold') {
    const gold = Math.floor(activity.reward.amount * goldFindMultiplier())
    gainGold(gold)
  } else {
    gainMaterial(activity.reward.material, activity.reward.amount)
  }
  savePlayer()
}

export function activeSlotCount(): number {
  return Object.values(timerState.active).filter(e => !e.collected).length
}

export function canStart(activity: Activity): boolean {
  if (player.level < activity.unlockLevel) return false
  if (activeSlotCount() >= BASE_SLOTS + player.prestigeTokens) return false
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
