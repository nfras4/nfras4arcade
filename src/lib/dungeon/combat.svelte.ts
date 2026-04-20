import { untrack } from 'svelte'
import {
  player, damagePlayer, healPlayer, gainGold, gainXp, gainItemXp, gainMaterial, respawnPlayer, advanceToZone,
  addToLootQueue, setOnLevelUp, setOnItemLevelUp, checkAchievements, savePlayer, submitLeaderboard,
  itemXpToNext,
  type Stats, type PlayerState,
} from './player.svelte'
import { ENEMIES, type Enemy } from './enemies'
import { BOSS_MECHANICS, BOSS_DEATH_TEXTS, headCoachState, type BossMechanic, type CombatEvent, type BossContext } from './bosses'
import { ZONES, ELLA_ZONE, getZone } from './zones'
import { ITEMS, MATERIAL_TIERS, type Item } from './items'
import { ACTIVITIES } from './timers.svelte'
import { dropRoll, rollModifier } from './crafting'
import { hasModifier, hasChallenge, computeChallengeBonus } from './prestige'
import {
  calcEnemyHp, calcEnemyDmg, ELITE_HP_MULT, MINIBOSS_HP_MULT, BOSS_HP_MULT,
  STAGES_PER_ZONE, MAX_LOG_ENTRIES, randInt, prestigeMultiplier,
  calcZoneReward, ELLA_ZONE_INDEX,
  BASE_XP_NORMAL, BASE_XP_ELITE, BASE_XP_MINIBOSS, BASE_XP_BOSS,
  BASE_GOLD_NORMAL, BASE_GOLD_ELITE, BASE_GOLD_MINIBOSS, BASE_GOLD_BOSS,
  type StatKey, SKILL_COMBAT_BONUSES, type SkillId,
} from './constants'

// ── Types ─────────────────────────────────────────────────────────────────

export type HitType = 'normal' | 'boss_special'

export function applyWound(p: PlayerState, damage: number, hitType: HitType, enemy?: Enemy): void {
  const woundRates: Record<HitType, number> = {
    normal:       0.40,
    boss_special: 0.45,
  }
  const baseRate = woundRates[hitType]

  const woundReduction = Math.min(0.20, Math.max(0.02,
    getEffectiveStats(p).defence / (p.maxHp * 3)
  ))

  const isVulnerable = p.maxHp < 500
  const isBossHit = hitType === 'boss_special' || (enemy?.isBoss ?? false)

  let effectiveRate = baseRate - woundReduction
  if (isVulnerable && isBossHit) {
    effectiveRate = effectiveRate * 0.4
  }
  effectiveRate = Math.max(0.05, effectiveRate)

  const woundAmount = Math.floor(damage * effectiveRate)
  p.woundedHp = Math.min(
    p.woundedHp + woundAmount,
    p.maxHp - p.hp
  )
  p.lastHitTimestamp = Date.now()
}

function getBossHitCap(zoneIndex: number, maxHp: number, defence: number): number {
  const baseCap = (() => {
    if (zoneIndex <= 6)  return Math.min(0.50, 0.35 + 0.025 * zoneIndex)
    if (zoneIndex <= 12) return 0.50 + (zoneIndex - 6) * 0.008
    if (zoneIndex <= 18) return 0.55 + (zoneIndex - 12) * 0.012
    return Math.min(0.85, 0.71 + (zoneIndex - 24) * 0.02)
  })()
  const capReduction = Math.min(0.15, Math.max(0.02,
    defence / (maxHp * 2)
  ))
  const effectiveCap = Math.max(0.20, baseCap - capReduction)
  const isVulnerable = maxHp < 500
  const finalCap = isVulnerable
    ? Math.min(effectiveCap, 0.60)
    : effectiveCap
  return Math.floor(maxHp * finalCap)
}

function getBossSpecialCap(zoneIndex: number, maxHp: number, defence: number): number {
  const baseCap = (() => {
    if (zoneIndex < 6)   return 0.45
    if (zoneIndex <= 8)  return 0.50
    if (zoneIndex <= 12) return 0.55
    if (zoneIndex <= 18) return 0.60
    if (zoneIndex <= 24) return 0.65
    return 0.70
  })()
  const capReduction = Math.min(0.15, Math.max(0.02,
    defence / (maxHp * 2)
  ))
  const effectiveCap = Math.max(0.25, baseCap - capReduction)
  const isVulnerable = maxHp < 500
  const finalCap = isVulnerable
    ? Math.min(effectiveCap, 0.40)
    : effectiveCap
  return Math.floor(maxHp * finalCap)
}

export type LogType = 'dmg' | 'crit' | 'heal' | 'gold' | 'sys'

export type LogEntry = {
  type: LogType
  message: string
}

export type DamageFloat = {
  id: number
  text: string
  kind: 'hit' | 'heal' | 'crit' | 'gold'
  side: 'player' | 'enemy'
}

export type CombatState = {
  enemyId: string
  enemyName: string
  enemySprite: string
  enemyHp: number
  enemyMaxHp: number
  log: LogEntry[]
  floaters: DamageFloat[]
  playerDead: boolean
  bossDefeated: boolean   // brief flag, cleared after zone advance
  activeStuns: { until: number }[]
  activeBossBuffs: { id: string; multiplier: number; until: number }[]
  currentPhase: string | null
  bossStatusIcons: string[]
  bossDeathText: string[] | null
  inNickFight: boolean
  nickVictory: boolean
  isVictory: boolean
  dungeonComplete: boolean
  lastSpecialHitAt: number
  runStartTime: number
  runEnded: boolean          // true if a challenge (ironman/full-audit) ends the run on death
}

// ── State ─────────────────────────────────────────────────────────────────

export const combatState: CombatState = $state({
  enemyId: '',
  enemyName: '',
  enemySprite: '',
  enemyHp: 0,
  enemyMaxHp: 0,
  log: [],
  floaters: [],
  playerDead: false,
  bossDefeated: false,
  activeStuns: [],
  activeBossBuffs: [],
  currentPhase: null,
  bossStatusIcons: [],
  bossDeathText: null,
  inNickFight: false,
  nickVictory: false,
  isVictory: false,
  dungeonComplete: false,
  lastSpecialHitAt: 0,
  runStartTime: Date.now(),
  runEnded: false,
})

let floaterSeq = 0

// ── Boss state (module-level, not reactive) ───────────────────────────────
let bossTimerIds: ReturnType<typeof setInterval>[] = []
let bossDelayIds: ReturnType<typeof setTimeout>[] = []
let enteredPhases = new Set<string>()
let enemyStunnedUntil = 0
let enemySkipAttacks = 0
let playerMissChance = 0
let enemyBarrierHits = 0
let enemyBarrierUntil = 0
const ENEMY_BARRIER_REDUCTION = 0.5
let bossDebuffIncomingMultiplier = 1.0
let bossDebuffUntil = 0
let playerDamageBonusMultiplier = 1.0
let playerDamageBonusUntil = 0
let nickMonkeyBarrelSurvived = false
let phaseTimerOverrides: Record<string, number> = {}
let bossBackInjuryChance = 0.4
let bossInvoiceDrainAmount = 80
let fraserVillainActive = false
let fraserDrainDoubled = false
let specialTimerLastFired = new Map<string, number>()
let enemyNextHitMultiplier = 1.0   // consumed on next player attack (ella's hayden-distraction)

// ── Farm mode ─────────────────────────────────────────────────────────────
let farmMode = false

export function setFarmMode(val: boolean): void {
  farmMode = val
}

function getNextStage(currentStage: number): number {
  if (farmMode) {
    const next = currentStage + 1
    if (next >= 10) return 1
    return next
  }
  return currentStage + 1
}

// ── Gear / effective stats ────────────────────────────────────────────────

export function getEffectiveStats(p: PlayerState): Stats {
  const base = { ...p.stats }
  const flatBonus: Partial<Stats> = {}
  const percentBonus: Partial<Stats> = {}

  for (const item of Object.values(p.gear)) {
    if (!item) continue
    const lvlMult = 1 + ((item.itemLevel ?? 1) - 1) * 0.08
    for (const [key, bonus] of Object.entries(item.statBonuses)) {
      const k = key as StatKey
      if (bonus?.flat)    flatBonus[k]    = (flatBonus[k]    ?? 0) + bonus.flat * lvlMult
      if (bonus?.percent) percentBonus[k] = (percentBonus[k] ?? 0) + bonus.percent * lvlMult
    }
    for (const roll of item.rolledBonuses ?? []) {
      percentBonus[roll.stat] = (percentBonus[roll.stat] ?? 0) + roll.percent
    }
    for (const roll of item.modifier?.bonuses ?? []) {
      percentBonus[roll.stat] = (percentBonus[roll.stat] ?? 0) + roll.percent
    }
  }

  // Skill combat bonuses (percent contribution per level)
  if (p.skills) {
    for (const [sid, bonus] of Object.entries(SKILL_COMBAT_BONUSES) as [SkillId, { stat: StatKey; perLevel: number }][]) {
      const level = p.skills[sid]?.level ?? 0
      if (level > 0) {
        percentBonus[bonus.stat] = (percentBonus[bonus.stat] ?? 0) + level * bonus.perLevel
      }
    }
  }

  // Prestige perks (percent contribution — from HR shop purchases)
  if (p.prestigePerks) {
    const perks = p.prestigePerks
    const perkMap: Record<StatKey, number> = {
      attack:    perks.attackBonus,
      defence:   perks.defenceBonus,
      speed:     perks.speedBonus,
      goldFind:  perks.goldBonus,
      vitality:  perks.vitalityBonus,
      critDmg:   perks.critDmgBonus,
      lifesteal: perks.lifeStealBonus,
      hpRegen:   perks.hpRegenBonus,
      xpBoost:   perks.xpBonus,
      luck:      perks.luckBonus,
    }
    for (const [stat, bonus] of Object.entries(perkMap) as [StatKey, number][]) {
      if (bonus > 0) {
        percentBonus[stat] = (percentBonus[stat] ?? 0) + bonus
      }
    }
  }

  const result: Stats = {} as Stats
  for (const key of Object.keys(base) as StatKey[]) {
    const b = Number.isFinite(base[key]) ? base[key]! : 0
    const pct = Number.isFinite(percentBonus[key]) ? percentBonus[key]! : 0
    const flat = Number.isFinite(flatBonus[key]) ? flatBonus[key]! : 0
    result[key] = Math.floor(b * (1 + pct / 100)) + flat
  }
  return result
}

function rollDrops(
  enemy: (typeof ENEMIES)[string],
  luckStat: number,
  zoneIndex: number,
  isBoss: boolean,
  isFirstKill: boolean,
): Item[] {
  if (!enemy.drops || enemy.drops.length === 0) return []

  // Determine base chance by enemy type
  let baseChance: number
  if (isFirstKill) {
    baseChance = 1.0
  } else if (enemy.isBoss) {
    baseChance = 0.50
  } else if (enemy.isMiniboss) {
    baseChance = 0.40
  } else if (enemy.isElite) {
    baseChance = 0.15
  } else {
    baseChance = 0.05
  }

  // Luck adds minor chance bonus (0.1% per luck point, capped at +15%)
  const dropBonus = Math.min(luckStat * 0.001, 0.15)
  // HR Shop: fast-track-loot modifier doubles drop rate (capped at 0.95)
  const dropRateMult = hasModifier(player, 'modifier:dropRateMult:2') ? 2 : 1
  const finalChance = Math.min((baseChance + dropBonus) * dropRateMult, 0.95)

  if (Math.random() > finalChance) return []

  // Pick which item drops (weighted by entry.chance as relative weight)
  const totalWeight = enemy.drops.reduce((s, e) => s + (e.chance ?? 1), 0)
  let r = Math.random() * totalWeight
  let chosen = enemy.drops[0]
  for (const entry of enemy.drops) {
    r -= entry.chance ?? 1
    if (r <= 0) { chosen = entry; break }
  }

  const baseItem = ITEMS[chosen.itemId]
  if (!baseItem) return []

  const result = dropRoll(baseItem, luckStat, zoneIndex, isBoss)
  const isBossUnique = baseItem.rarity === 'boss_unique'
  const item: Item = {
    ...baseItem,
    instanceId: crypto.randomUUID(),
    rolledBonuses: result.bonusRolls,
    rerollCount: 0,
    itemLevel: 1,
    itemXp: 0,
    itemXpToNext: itemXpToNext(1),
    modifier: rollModifier(baseItem.tier ?? 1, luckStat, isBossUnique),
  }
  return [item]
}

// ── Helpers ───────────────────────────────────────────────────────────────

function pickEnemyId(zoneIndex: number, stage: number): string {
  const zone = getZone(zoneIndex)
  if (stage === STAGES_PER_ZONE) return zone.boss
  if (stage === 10) return zone.miniboss
  if (stage === 5 || (stage >= 11 && stage <= 19 && stage % 3 === 0)) {
    return zone.elitePool[Math.floor(Math.random() * zone.elitePool.length)]
  }
  return zone.enemyPool[Math.floor(Math.random() * zone.enemyPool.length)]
}

function hpMultForEnemy(enemyId: string): number {
  const e = ENEMIES[enemyId]
  if (e?.isBoss)     return BOSS_HP_MULT
  if (e?.isMiniboss) return MINIBOSS_HP_MULT
  if (e?.isElite)    return ELITE_HP_MULT
  return 1
}

function addLog(type: LogType, message: string): void {
  combatState.log = [{ type, message }, ...combatState.log].slice(0, MAX_LOG_ENTRIES)
}

function addFloater(text: string, kind: DamageFloat['kind'], side: DamageFloat['side']): void {
  const f: DamageFloat = { id: ++floaterSeq, text, kind, side }
  combatState.floaters = [...combatState.floaters, f]
  setTimeout(() => {
    combatState.floaters = combatState.floaters.filter(x => x.id !== f.id)
  }, 1400)
}

// ── Level-up callback wiring ──────────────────────────────────────────────

setOnLevelUp((level: number) => {
  addLog('sys', `▶ LEVEL UP! Now level ${level}`)
  for (const act of ACTIVITIES) {
    if (act.unlockLevel === level) {
      addLog('sys', `▶ New activity unlocked: ${act.name}`)
    }
  }
  checkAchievements()
})

setOnItemLevelUp((item) => {
  addLog('sys', `▶ ${item.name} reached Lv${item.itemLevel}!`)
})

// ── Boss mechanics ────────────────────────────────────────────────────────

function clearBossState(): void {
  bossTimerIds.forEach(id => clearInterval(id))
  bossTimerIds = []
  bossDelayIds.forEach(id => clearTimeout(id))
  bossDelayIds = []
  enteredPhases.clear()
  enemyStunnedUntil = 0
  enemySkipAttacks = 0
  playerMissChance = 0
  enemyBarrierHits = 0
  enemyBarrierUntil = 0
  bossDebuffIncomingMultiplier = 1.0
  bossDebuffUntil = 0
  playerDamageBonusMultiplier = 1.0
  playerDamageBonusUntil = 0
  nickMonkeyBarrelSurvived = false
  phaseTimerOverrides = {}
  bossBackInjuryChance = 0.4
  bossInvoiceDrainAmount = 80
  fraserVillainActive = false
  fraserDrainDoubled = false
  enemyNextHitMultiplier = 1.0
  specialTimerLastFired.clear()
  combatState.activeStuns = []
  combatState.activeBossBuffs = []
  combatState.currentPhase = null
  combatState.bossStatusIcons = []
  combatState.lastSpecialHitAt = 0
}

function getBossContext(): BossContext {
  return {
    enemyHpPct: combatState.enemyMaxHp > 0 ? combatState.enemyHp / combatState.enemyMaxHp : 0,
    bossBuffs: [...combatState.activeBossBuffs],
    now: Date.now(),
  }
}

function processEvents(events: CombatEvent[]): void {
  const enemy = ENEMIES[combatState.enemyId]
  const zoneIdx = untrack(() => player.currentZone)
  const zone9Mult = (zoneIdx === 8 && combatState.inNickFight === false) ? 1.5 : 1.0
  const now = Date.now()

  for (const ev of events) {
    switch (ev.type) {
      case 'log': {
        if (ev.delayMs && ev.delayMs > 0) {
          const tid = setTimeout(() => addLog(ev.logType ?? 'sys', ev.message), ev.delayMs)
          bossDelayIds.push(tid)
        } else {
          addLog(ev.logType ?? 'sys', ev.message)
        }
        break
      }
      case 'stun-player': {
        const until = now + ev.durationMs
        // Extend existing stun rather than stack: keep only the longer of current or new
        const active = combatState.activeStuns.filter(s => s.until > now)
        const maxExisting = active.reduce((m, s) => Math.max(m, s.until), 0)
        combatState.activeStuns = [{ until: Math.max(maxExisting, until) }]
        break
      }
      case 'stun-enemy': {
        enemyStunnedUntil = Math.max(enemyStunnedUntil, now + ev.durationMs)
        break
      }
      case 'drain-gold': {
        const amt = Math.min(player.gold, ev.amount)
        player.gold = Math.max(0, player.gold - amt)
        break
      }
      case 'damage-player': {
        const def = untrack(() => getEffectiveStats(player).defence)
        const baseDmg = zoneIdx === ELLA_ZONE_INDEX
          ? (enemy?.baseDmg ?? 10)
          : calcEnemyDmg(enemy?.baseDmg ?? 10, zoneIdx, untrack(() => player.currentStage) - 1)
        let dmg: number
        if (ev.ignoreDefence) {
          dmg = Math.floor(baseDmg * ev.multiplier * zone9Mult)
        } else {
          dmg = Math.max(1, Math.floor(baseDmg * ev.multiplier * zone9Mult - def * 0.5))
        }
        // Boss special attack cap — post-game zones scale higher
        if (enemy?.isBoss && ev.multiplier < 9999) {
          const currentMaxHp = untrack(() => player.maxHp)
          const maxSpecialHit = getBossSpecialCap(zoneIdx, currentMaxHp, def)
          dmg = Math.min(dmg, maxSpecialHit)
        }

        // Special: Nick's MONKEY BARREL — deals exactly 9999 damage (not scaled)
        // 3-second delay gives the warning logs time to display before the hit lands
        if (ev.multiplier >= 9999) {
          const literalDmg = 9999
          const tid = setTimeout(() => {
            if (combatState.enemyHp <= 0) return
            if (player.hp > literalDmg) {
              // Rare survival: player has >9999 HP (extreme vitality investment)
              damagePlayer(literalDmg)
              applyWound(player, literalDmg, 'boss_special', enemy)
              addLog('sys', "▶ You actually survived that. Respect.")
              nickMonkeyBarrelSurvived = true
            } else {
              damagePlayer(player.hp)
              addFloater(`MONKEY BARREL`, 'crit', 'player')
              if (player.hp <= 0) handlePlayerDeath()
            }
          }, 3000)
          bossDelayIds.push(tid)
          return
        }
        damagePlayer(dmg)
        combatState.lastSpecialHitAt = now
        applyWound(player, dmg, 'boss_special', enemy)
        addFloater(`-${dmg}`, 'hit', 'player')
        if (player.hp <= 0) handlePlayerDeath()
        break
      }
      case 'player-dmg-bonus': {
        playerDamageBonusMultiplier = ev.multiplier
        playerDamageBonusUntil = now + ev.durationMs
        break
      }
      case 'boss-buff': {
        const existingTotal = combatState.activeBossBuffs
          .filter(b => b.id === ev.id && b.until > now)
          .reduce((s, b) => s + b.multiplier, 0)
        if (ev.capTotal !== undefined && existingTotal >= ev.capTotal) break
        combatState.activeBossBuffs = [
          ...combatState.activeBossBuffs,
          { id: ev.id, multiplier: ev.addMultiplier, until: now + ev.durationMs }
        ]
        break
      }
      case 'clear-boss-buffs': {
        combatState.activeBossBuffs = combatState.activeBossBuffs.filter(b => b.id !== ev.id)
        break
      }
      case 'boss-debuff-incoming': {
        bossDebuffIncomingMultiplier = ev.multiplier
        bossDebuffUntil = now + ev.durationMs
        break
      }
      case 'skip-enemy-attacks': {
        enemySkipAttacks += ev.count
        break
      }
      case 'barrier': {
        enemyBarrierHits = ev.hits
        enemyBarrierUntil = now + ev.durationMs
        const tid = setTimeout(() => { enemyBarrierHits = 0 }, ev.durationMs)
        bossDelayIds.push(tid)
        break
      }
      case 'summon-attack': {
        const summonPool = ev.pool
        const summonId = summonPool[Math.floor(Math.random() * summonPool.length)]
        const summon = ENEMIES[summonId]
        if (summon) {
          const def = untrack(() => getEffectiveStats(player).defence)
          let summonDmg = Math.max(1, Math.floor(summon.baseDmg * 0.5) - def)
          if (enemy?.isBoss) {
            const summonCap = Math.floor(untrack(() => player.maxHp) * 0.25)
            summonDmg = Math.min(summonDmg, summonCap)
          }
          damagePlayer(summonDmg)
          applyWound(player, summonDmg, 'normal', enemy)
          addLog('dmg', `▶ ${summon.name} attacks you for ${summonDmg}!`)
          addFloater(`-${summonDmg}`, 'hit', 'player')
          if (player.hp <= 0) handlePlayerDeath()
        }
        break
      }
      case 'set-player-miss': {
        playerMissChance = ev.chance
        break
      }
      case 'set-status-icon': {
        const icon = ev.icon
        combatState.bossStatusIcons = [...combatState.bossStatusIcons, icon]
        const tid = setTimeout(() => {
          combatState.bossStatusIcons = combatState.bossStatusIcons.filter(i => i !== icon)
        }, ev.durationMs)
        bossDelayIds.push(tid)
        break
      }
      case 'next-enemy-hit-multiplier': {
        enemyNextHitMultiplier = ev.multiplier
        break
      }
    }
  }
}

function startBossTimers(mechanic: BossMechanic): void {
  bossTimerIds.forEach(id => clearInterval(id))
  bossTimerIds = []

  const currentPhaseId = combatState.currentPhase

  for (const timer of mechanic.specialTimers) {
    // Skip timers not active in current phase for Fraser
    if (mechanic.enemyId === 'the-ceo' || mechanic.enemyId === 'fraser' || mechanic.enemyId === 'wolton-prime') {
      if ((currentPhaseId === 'engineering' || currentPhaseId === null) && timer.id !== 'barrier') continue
    }

    // Special-case: back-injury uses bossBackInjuryChance
    if (timer.id === 'back-injury') {
      const interval = phaseTimerOverrides[timer.id] ?? timer.intervalMs
      const id = setInterval(() => {
        if (combatState.enemyHp <= 0 || combatState.playerDead) return
        if (Math.random() < bossBackInjuryChance) {
          const lines = ["Burgo's back gives out.", "Modified duties activated.", "He's fine. He says he's fine. He's not fine."]
          processEvents([
            { type: 'log', message: `▶ ${lines[Math.floor(Math.random() * lines.length)]}`, logType: 'sys' },
            { type: 'stun-enemy', durationMs: 6000 },
            { type: 'set-status-icon', icon: '🩺', durationMs: 6000 },
          ])
        }
      }, interval)
      bossTimerIds.push(id)
      continue
    }

    // Special-case: reads-you uses phase-based miss chance
    if (timer.id === 'reads-you') {
      const interval = phaseTimerOverrides[timer.id] ?? timer.intervalMs
      const id = setInterval(() => {
        if (combatState.enemyHp <= 0) return
        const chance = combatState.currentPhase === 'tilt' ? 0.15 : 0.30
        processEvents([{ type: 'set-player-miss', chance }])
      }, interval)
      bossTimerIds.push(id)
      continue
    }

    const interval = phaseTimerOverrides[timer.id] ?? timer.intervalMs
    const id = setInterval(() => {
      if (combatState.enemyHp <= 0 || combatState.playerDead) return
      if (timer.id === 'big-hit') {
        const now = Date.now()
        const lastFired = specialTimerLastFired.get('big-hit') ?? 0
        if (now - lastFired < 3000) return
        specialTimerLastFired.set('big-hit', now)
      }
      const ctx = getBossContext()
      let events = timer.action(ctx)
      // Override nick invoice drain amount
      if (timer.id === 'invoice') {
        events = [
          { type: 'log', message: "▶ Nick invoices you.", logType: 'gold' },
          { type: 'log', message: "▶ Nick logs this as a Priority 2 ticket.", logType: 'sys' },
          { type: 'drain-gold', amount: bossInvoiceDrainAmount },
          { type: 'set-status-icon', icon: '🧾', durationMs: 2000 },
        ]
      }
      // Override fraser drain amount in villain phase
      if (timer.id === 'drain' && fraserDrainDoubled) {
        events = events.map(e => e.type === 'drain-gold' ? { ...e, amount: e.amount * 2 } : e)
      }
      processEvents(events)
    }, interval)
    bossTimerIds.push(id)
  }
}

function applyPhaseAdjustments(enemyId: string, phaseId: string): void {
  switch (`${enemyId}:${phaseId}`) {
    case 'johno:panic':
      phaseTimerOverrides['mystery-summon'] = 4000
      break
    case 'the-coach:rage':
      phaseTimerOverrides['box-out'] = 10000
      break
    case 'the-examiner:frequent-teleport':
      phaseTimerOverrides['teleport'] = 4000
      break
    case 'edrian:identity-crisis':
      phaseTimerOverrides['reels'] = 5000
      break
    case 'head-coach:focused':
      phaseTimerOverrides['dunk'] = 8000
      headCoachState.clumsyChance = 0.3
      break
    case 'zone-manager:tilted':
      phaseTimerOverrides['bet365'] = 10000
      break
    case 'chief-surgeon:warmed-up':
      phaseTimerOverrides['big-hit'] = 6500
      bossBackInjuryChance = 0.30
      break
    case 'chief-surgeon:pain':
      phaseTimerOverrides['big-hit'] = 8000
      bossBackInjuryChance = 0.60
      break
    case 'the-ceo:ceo-mode':
    case 'fraser:ceo-mode':
    case 'wolton-prime:ceo-mode':
      break
    case 'the-ceo:villain':
    case 'fraser:villain':
    case 'wolton-prime:villain':
      fraserVillainActive = true
      fraserDrainDoubled = true
      phaseTimerOverrides['outsource'] = 4000
      break
    case 'damo:tilt':
      playerMissChance = 0.15
      break
    case 'nick:just-a-chill-guy':
      bossInvoiceDrainAmount = 160
      break
  }
}

function checkBossPhases(): void {
  const mechanic = BOSS_MECHANICS[combatState.enemyId]
  if (!mechanic) return

  const hpPct = combatState.enemyMaxHp > 0 ? combatState.enemyHp / combatState.enemyMaxHp : 0
  const ctx = getBossContext()

  const sorted = [...mechanic.phases].sort((a, b) => b.hpThreshold - a.hpThreshold)

  for (const phase of sorted) {
    if (enteredPhases.has(phase.id)) continue
    // HR Shop: Fraser's final-form phase only activates if FRASER PROTOCOL is unlocked
    if (phase.id === 'final-form' && !player.permanentUnlocks.includes('fraser-protocol')) continue
    const shouldActivate = phase.hpThreshold >= 1.0 ? !enteredPhases.has(phase.id) : hpPct <= phase.hpThreshold

    if (shouldActivate) {
      enteredPhases.add(phase.id)
      combatState.currentPhase = phase.id

      if (phase.onEnter) {
        processEvents(phase.onEnter(ctx))
      }

      applyPhaseAdjustments(mechanic.enemyId, phase.id)
      startBossTimers(mechanic)
      break
    }
  }
}

function initBossMechanics(): void {
  clearBossState()
  const mechanic = BOSS_MECHANICS[combatState.enemyId]
  if (!mechanic) return

  const startPhase = mechanic.phases.find(p => p.hpThreshold >= 1.0)
  if (startPhase) {
    enteredPhases.add(startPhase.id)
    combatState.currentPhase = startPhase.id
    const ctx = getBossContext()
    if (startPhase.onEnter) processEvents(startPhase.onEnter(ctx))
    applyPhaseAdjustments(mechanic.enemyId, startPhase.id)
  }

  startBossTimers(mechanic)
}

// ── Public API ────────────────────────────────────────────────────────────

export function spawnEnemy(): void {
  const zoneIdx = untrack(() => player.currentZone)
  const stage   = untrack(() => player.currentStage)
  const enemyId = pickEnemyId(zoneIdx, stage)
  const enemy   = ENEMIES[enemyId]
  if (!enemy) return

  const mult  = hpMultForEnemy(enemyId)
  const maxHp = zoneIdx === ELLA_ZONE_INDEX
    ? Math.floor(enemy.baseHp * mult)
    : calcEnemyHp(enemy.baseHp, zoneIdx, stage - 1, mult)

  combatState.enemyId    = enemyId
  combatState.enemyName  = enemy.name
  combatState.enemySprite = enemy.sprite
  combatState.enemyHp    = maxHp
  combatState.enemyMaxHp = maxHp
  combatState.playerDead = false
  combatState.activeStuns = []
  combatState.activeBossBuffs = []
  combatState.currentPhase = null
  combatState.bossStatusIcons = []
  combatState.bossDeathText = null
  combatState.inNickFight = false
  combatState.nickVictory = false

  clearBossState()
  // Init boss mechanics if applicable
  const hasMechanic = BOSS_MECHANICS[enemyId]
  if (hasMechanic) {
    const tid = setTimeout(() => initBossMechanics(), 200)
    bossDelayIds.push(tid)
  }

  addLog('sys', `▶ Stage ${stage} — ${enemy.name} appeared!`)
}

export function playerAttack(): void {
  if (combatState.playerDead || combatState.enemyHp <= 0) return

  // Check player stun
  const now = Date.now()
  const stunned = combatState.activeStuns.some(s => s.until > now)
  combatState.activeStuns = combatState.activeStuns.filter(s => s.until > now)
  if (stunned) return

  // Check player miss (Damo reads-you)
  if (playerMissChance > 0 && Math.random() < playerMissChance) {
    addLog('sys', "▶ Your attack missed.")
    return
  }

  const eff        = untrack(() => getEffectiveStats(player))
  const atk        = eff.attack
  const lck        = eff.luck
  const critChance = Math.min(0.80, Math.sqrt(lck) * 0.06)
  const isCrit     = Math.random() < critChance

  let dmg = Math.floor(atk * (1 + Math.random() * 0.3))
  if (isCrit) dmg = Math.floor(dmg * (eff.critDmg / 100))
  dmg = Math.max(1, dmg)

  // Apply player damage bonus window (reels, phone-check)
  if (playerDamageBonusUntil > now) {
    dmg = Math.floor(dmg * playerDamageBonusMultiplier)
  }

  // Consume one-shot next-hit multiplier (ella hayden-distraction)
  if (enemyNextHitMultiplier > 1.0) {
    dmg = Math.floor(dmg * enemyNextHitMultiplier)
    enemyNextHitMultiplier = 1.0
  }

  // Apply boss defence modifier (phase-based)
  const mechanic = BOSS_MECHANICS[combatState.enemyId]
  if (mechanic && combatState.currentPhase) {
    const phase = mechanic.phases.find(p => p.id === combatState.currentPhase)
    if (phase?.defenceModifier) {
      dmg = phase.defenceModifier(dmg, getBossContext())
    }
  }

  // Apply enemy barrier
  if (enemyBarrierHits > 0 && enemyBarrierUntil > now) {
    dmg = Math.floor(dmg * (1 - ENEMY_BARRIER_REDUCTION))
    enemyBarrierHits--
    if (enemyBarrierHits === 0) {
      combatState.bossStatusIcons = combatState.bossStatusIcons.filter(i => i !== '🛡️')
    }
  }

  dmg = Math.max(1, dmg)
  combatState.enemyHp = Math.max(0, combatState.enemyHp - dmg)

  // Lifesteal — capped by woundedHp (wounds block healing)
  // HR Shop: Hazard Pay modifier doubles effective lifesteal this run
  const currentZone = untrack(() => player.currentZone)
  const lifeStealMod = hasModifier(player, 'modifier:lifeStealMult:2') ? 2 : 1
  const baseLifestealCap = 30 * lifeStealMod
  const zonedLifestealCap = Math.max(15 * lifeStealMod, baseLifestealCap - currentZone * 2)
  const lifestealPct = Math.min(eff.lifesteal * lifeStealMod, zonedLifestealCap)
  if (lifestealPct > 0 && dmg > 0) {
    const lifeStealHeal = Math.floor(dmg * lifestealPct / 100)
    if (lifeStealHeal > 0) {
      const healCap = player.maxHp - player.woundedHp - player.hp
      const actualHeal = Math.min(lifeStealHeal, Math.max(0, healCap))
      if (actualHeal > 0) {
        player.hp = Math.min(player.maxHp - player.woundedHp, player.hp + actualHeal)
        if (actualHeal >= 5) addLog('heal', `Lifesteal: +${actualHeal} HP`)
      }
    }
  }

  // wound recovery from attacking — 5% of damage dealt
  const woundRecovery = Math.floor(dmg * 0.05)
  if (woundRecovery > 0 && player.woundedHp > 0) {
    player.woundedHp = Math.max(0, player.woundedHp - woundRecovery)
  }

  if (isCrit) {
    addLog('crit', `▶ CRIT! You hit ${combatState.enemyName} for ${dmg}!`)
    addFloater(`CRIT ${dmg}!`, 'crit', 'enemy')
  } else {
    addLog('dmg', `▶ You attacked ${combatState.enemyName} for ${dmg}.`)
    addFloater(`-${dmg}`, 'hit', 'enemy')
  }

  // Check phase transitions after damage
  checkBossPhases()

  if (combatState.enemyHp <= 0) {
    handleEnemyDeath()
  }
}

export function enemyAttack(): void {
  if (combatState.playerDead || combatState.enemyHp <= 0) return

  const now = Date.now()

  // Check enemy stun
  if (enemyStunnedUntil > now) return

  // Check skip attacks
  if (enemySkipAttacks > 0) {
    enemySkipAttacks--
    return
  }

  // Mutual exclusion: suppress regular hit within 800ms of a special timer hit
  if (now - combatState.lastSpecialHitAt < 800) return

  const zoneIdx  = untrack(() => player.currentZone)
  const stage    = untrack(() => player.currentStage)
  const enemy    = ENEMIES[combatState.enemyId]
  if (!enemy) return

  const def     = untrack(() => getEffectiveStats(player).defence)
  const baseDmg = zoneIdx === ELLA_ZONE_INDEX
    ? enemy.baseDmg
    : calcEnemyDmg(enemy.baseDmg, zoneIdx, stage - 1)

  let dmg = Math.max(1, baseDmg - def + Math.floor(Math.random() * 3))

  // Apply attack modifier from current phase
  const mechanic = BOSS_MECHANICS[combatState.enemyId]
  if (mechanic && combatState.currentPhase) {
    const phase = mechanic.phases.find(p => p.id === combatState.currentPhase)
    if (phase?.attackModifier) {
      dmg = phase.attackModifier(dmg, getBossContext())
    }
  }

  // Apply incoming debuff (Hayden bet loss, Damo tilt)
  if (bossDebuffUntil > now) {
    dmg = Math.floor(dmg * bossDebuffIncomingMultiplier)
  }

  // Nick damage reduction after surviving MONKEY BARREL
  if (combatState.enemyId === 'nick' && nickMonkeyBarrelSurvived) {
    dmg = Math.floor(dmg * 0.8)
  }

  dmg = Math.max(1, dmg)

  // Boss regular hits capped — post-game zones scale higher
  if (enemy.isBoss) {
    const maxBossHit = getBossHitCap(zoneIdx, player.maxHp, def)
    dmg = Math.min(dmg, maxBossHit)
  }

  damagePlayer(dmg)
  applyWound(player, dmg, 'normal', enemy)
  addLog('dmg', `▶ ${combatState.enemyName} hit you for ${dmg}.`)
  addFloater(`-${dmg}`, 'hit', 'player')

  if (player.hp <= 0) {
    handlePlayerDeath()
  }
}

function handleEnemyDeath(): void {
  clearBossState()
  const enemy  = ENEMIES[combatState.enemyId]
  if (!enemy) return

  const pMult = prestigeMultiplier(untrack(() => player.prestigeTokens))
  const zoneIdx = untrack(() => player.currentZone)

  // HR Shop run modifiers / challenges
  const goldMult = hasModifier(player, 'modifier:goldMult:2') ? 2 : 1
  const xpMult   = hasModifier(player, 'modifier:xpMult:2')   ? 2 : 1
  const noCombatGold = hasChallenge(player, 'challenge:noCombatGold')

  // Gold drop — scales by zone tier and enemy type (with prestige multiplier + goldFind)
  const zoneTier = zoneIdx + 1
  const goldBase = enemy.isBoss     ? BASE_GOLD_BOSS
                 : enemy.isMiniboss ? BASE_GOLD_MINIBOSS
                 : enemy.isElite    ? BASE_GOLD_ELITE
                 : BASE_GOLD_NORMAL
  const baseGold = calcZoneReward(goldBase, zoneTier)
  const goldFindMult = 1 + (untrack(() => getEffectiveStats(player).goldFind) / 100)
  const gold = noCombatGold ? 0 : Math.floor(baseGold * pMult * goldFindMult * goldMult)
  if (gold > 0) {
    gainGold(gold)
    player.lifetimeStats.goldEarned += gold
    addLog('gold', `▶ ${combatState.enemyName} dropped ${gold} gold.`)
    addFloater(`+${gold}g`, 'gold', 'enemy')
  }

  // XP — scales by zone tier and enemy type (with prestige multiplier + xpBoost)
  const xpBase = enemy.isBoss     ? BASE_XP_BOSS
               : enemy.isMiniboss ? BASE_XP_MINIBOSS
               : enemy.isElite    ? BASE_XP_ELITE
               : BASE_XP_NORMAL
  const baseXp = calcZoneReward(xpBase, zoneTier)
  const xpBoostMult = 1 + (untrack(() => getEffectiveStats(player).xpBoost) / 100)
  const xp = Math.floor(baseXp * pMult * xpBoostMult * xpMult)
  gainXp(xp)
  gainItemXp(Math.ceil(xp * 0.15))

  // Lifetime stats
  player.lifetimeStats.enemiesKilled++
  if (enemy.isBoss) player.lifetimeStats.bossesDefeated++

  // Secret-zone gates: Hayden kills unlock Ella; Ella kills award the achievement.
  // Hayden (zone-manager) is a miniboss, not a boss — check both flags.
  if ((enemy.isBoss || enemy.isMiniboss) && combatState.enemyId === 'zone-manager') {
    player.lifetimeStats.haydenKills = (player.lifetimeStats.haydenKills ?? 0) + 1
  }
  if (enemy.isBoss && combatState.enemyId === 'ella') {
    player.lifetimeStats.ellaKills = (player.lifetimeStats.ellaKills ?? 0) + 1
  }

  // Zone 9 boss / Fraser tracking + HR Shop prestige-token payout
  if (enemy.isBoss && zoneIdx === 8) {
    player.fraserDefeated = true
    player.lifetimeStats.fraserKills++

    // Challenge bonus tokens (Unpaid Overtime, Understaffed, Ironman, etc.)
    let bonusTokens = computeChallengeBonus(player)

    // Speed Review — only if Fraser killed within the challenge window
    const speedReview = player.activeChallenges.find(c => c.startsWith('challenge:speedRun:'))
    if (speedReview) {
      const windowMs = Number(speedReview.split(':')[2] ?? '0')
      const elapsed = Date.now() - combatState.runStartTime
      if (windowMs > 0 && elapsed <= windowMs) {
        // Already included in computeChallengeBonus; no-op here
      } else {
        // Speed Review failed — subtract its bonus (2 tokens) from the total
        bonusTokens = Math.max(0, bonusTokens - 2)
      }
    }

    // Performance Bonus modifier doubles prestige-token payout from Fraser
    const prestigeMult = hasModifier(player, 'modifier:prestigeMult:2') ? 2 : 1
    const totalTokens = (1 + bonusTokens) * prestigeMult
    // Tokens are awarded when the player prestiges (via +1 in prestige()).
    // Extra challenge tokens are tracked separately and added on prestige.
    player.bonusTokensEarned = (player.bonusTokensEarned ?? 0) + (totalTokens - 1)
    if (bonusTokens > 0 || prestigeMult > 1) {
      addLog('sys', `▶ Bonus tokens earned: +${totalTokens - 1}`)
    }
  }

  // Item drops
  const luck  = untrack(() => getEffectiveStats(player).luck)
  const isFirstKillForDrops = !!enemy.isBoss && !player.firstBossKills.includes(combatState.enemyId)
  const drops = rollDrops(enemy, luck, zoneIdx, !!enemy.isBoss, isFirstKillForDrops)
  for (const item of drops) {
    addToLootQueue(item)
    player.lifetimeStats.itemsLooted++
    addLog('sys', `▶ ${enemy.name} dropped ${item.name}!`)
    addFloater(`${item.sprite}`, 'gold', 'enemy')
  }

  // Boss unique item drops
  const uniqueCandidates = Object.values(ITEMS).filter(
    item => item.rarity === 'boss_unique' && (item.dropSource ?? []).includes(combatState.enemyId)
  )
  if (uniqueCandidates.length > 0) {
    const isFirstKill = !player.firstBossKills.includes(combatState.enemyId)
    for (let uIdx = 0; uIdx < uniqueCandidates.length; uIdx++) {
      const baseItem = uniqueCandidates[uIdx]
      const guaranteed = isFirstKill && uIdx === 0   // guarantee first unique on first boss kill
      if (guaranteed || Math.random() < (baseItem.dropChance ?? 0.25)) {
        const uitem: Item = {
          ...baseItem,
          instanceId: crypto.randomUUID(),
          rolledBonuses: [...(baseItem.rolledBonuses ?? [])],
          rerollCount: 0,
          itemLevel: 1,
          itemXp: 0,
          itemXpToNext: itemXpToNext(1),
          modifier: rollModifier(baseItem.tier ?? 1, luck, true),
        }
        addToLootQueue(uitem)
        player.lifetimeStats.itemsLooted++
        addLog('sys', `★ ${enemy.name} dropped ${uitem.name}! [UNIQUE]`)
        addFloater(`${uitem.sprite}`, 'gold', 'enemy')
      }
    }
    if (isFirstKill) {
      player.firstBossKills = [...player.firstBossKills, combatState.enemyId]
    }
  }

  // Tiered material drops (T2 zones 4-6, T3 zones 7-9)
  if (zoneIdx >= 3 && zoneIdx <= 5) {
    if (enemy.isElite || enemy.isMiniboss) {
      if (Math.random() < 0.20) {
        const mat = Math.random() < 0.5 ? 'hardwood' : 'steel'
        gainMaterial(mat, 1)
        addLog('sys', `▶ Found 1x ${MATERIAL_TIERS[mat].name}!`)
      }
    }
    if (enemy.isBoss) {
      const zMats: Record<number, string> = { 3: 'hardwood', 4: 'steel', 5: 'rare_herbs' }
      const mat = zMats[zoneIdx] ?? 'steel'
      gainMaterial(mat, 2)
      addLog('sys', `▶ Boss dropped 2x ${MATERIAL_TIERS[mat].name}!`)
    }
  }
  if (zoneIdx >= 6) {
    if (enemy.isElite || enemy.isMiniboss) {
      if (Math.random() < 0.15) {
        const mat = Math.random() < 0.5 ? 'darkwood' : 'wolton_alloy'
        gainMaterial(mat, 1)
        addLog('sys', `▶ Found 1x ${MATERIAL_TIERS[mat].name}!`)
      }
    }
    if (enemy.isBoss) {
      const zMats: Record<number, string> = { 6: 'darkwood', 7: 'wolton_alloy', 8: 'void_essence' }
      const mat = zMats[zoneIdx] ?? 'wolton_alloy'
      const amt = 2 + (Math.random() < 0.5 ? 1 : 0)
      gainMaterial(mat, amt)
      addLog('sys', `▶ Boss dropped ${amt}x ${MATERIAL_TIERS[mat].name}!`)
    }
  }
  if (enemy.isBoss) {
    const fraserIds = ['the-ceo', 'fraser']
    if (fraserIds.includes(combatState.enemyId)) {
      if (Math.random() < 0.50) {
        gainMaterial('void_essence', 2)
        addLog('sys', `▶ Found 2x ${MATERIAL_TIERS.void_essence.name}!`)
      }
    } else if (Math.random() < 0.10) {
      gainMaterial('void_essence', 1)
      addLog('sys', `▶ Found 1x ${MATERIAL_TIERS.void_essence.name}!`)
    }
  }

  // Check achievements after kill
  checkAchievements()

  // Fire boss onDeath
  const mechanic = BOSS_MECHANICS[combatState.enemyId]
  if (mechanic?.onDeath) {
    processEvents(mechanic.onDeath())
  }

  // Show boss death overlay text
  const deathText = BOSS_DEATH_TEXTS[combatState.enemyId]
  if (deathText) {
    combatState.bossDeathText = deathText
  }

  // Nick secret boss special case
  if (combatState.enemyId === 'nick') {
    player.nickDefeated = true
    checkAchievements()
    combatState.inNickFight = false
    combatState.nickVictory = true
    player.currentZone = 8
    player.currentStage = 20
    savePlayer()
    return
  }

  // The End final boss special case
  if (combatState.enemyId === 'the-end') {
    checkAchievements()
    combatState.dungeonComplete = true
    savePlayer()
  }

  const stage = untrack(() => player.currentStage)

  if (enemy.isBoss) {
    // Track deepest post-game zone reached
    if (zoneIdx >= 9) {
      const pgZone = zoneIdx - 8  // 1-indexed post-game depth
      if (pgZone > (player.deepestPostGameZone ?? 0)) {
        player.deepestPostGameZone = pgZone
      }
    }
    // Boss defeated -- advance to next zone
    submitLeaderboard(player)
    const nextZone = zoneIdx + 1
    if (nextZone < ZONES.length) {
      combatState.bossDefeated = true
      addLog('sys', `▶ BOSS DEFEATED! Zone ${nextZone + 1} unlocked!`)
      setTimeout(() => {
        advanceToZone(nextZone)
        combatState.bossDefeated = false
        checkAchievements()
        spawnEnemy()
      }, 1500)
    } else if (zoneIdx <= 8) {
      addLog('sys', '▶ ALL ZONES CLEARED! You have beaten The Dungeon!')
      combatState.isVictory = true
    }
    // Post-game zones beyond index 8 handled separately
  } else {
    // Advance stage
    player.currentStage = getNextStage(stage)
    spawnEnemy()
  }
}

function handlePlayerDeath(): void {
  // Chiikawa Plushie death-block: restore to 1 HP instead of dying.
  // 60s cooldown — only proc if equipped in amulet slot and not on cooldown.
  const now = Date.now()
  const amulet = player.gear?.amulet
  const hasPlushie = amulet?.id === 'chiikawa-plushie'
  if (hasPlushie && (player.plushieCooldown ?? 0) <= now) {
    player.hp = 1
    player.plushieCooldown = now + 60_000
    addLog('heal', "▶ 🌸 the plushie took the hit. you feel bad.")
    addFloater('🌸', 'heal', 'player')
    return
  }

  combatState.playerDead = true
  addLog('sys', `▶ You were defeated by ${combatState.enemyName}...`)

  // HR Shop: Ironman Clause / Full Audit — one death ends the run
  const ironman = hasChallenge(player, 'challenge:noRespawn') || hasChallenge(player, 'challenge:fullAudit')
  if (ironman) {
    combatState.runEnded = true
    addLog('sys', '▶ IRONMAN CLAUSE — run terminated. Return to HR to begin again.')
    // Forfeit active challenges (consumed) — modifiers cleared on next prestige
    return
  }

  setTimeout(() => {
    respawnPlayer()
    spawnEnemy()
  }, 2000)
}

/** Reset the run timer — called when a new prestige run begins. */
export function resetRunTimer(): void {
  combatState.runStartTime = Date.now()
  combatState.runEnded = false
}

export function startNickFight(): void {
  if (!player.fraserDefeated || player.currentZone !== 8) return
  clearBossState()
  const nick = ENEMIES['nick']
  if (!nick) return

  const maxHp = nick.baseHp
  combatState.enemyId = 'nick'
  combatState.enemyName = nick.name
  combatState.enemySprite = nick.sprite
  combatState.enemyHp = maxHp
  combatState.enemyMaxHp = maxHp
  combatState.playerDead = false
  combatState.activeStuns = []
  combatState.activeBossBuffs = []
  combatState.currentPhase = null
  combatState.bossStatusIcons = []
  combatState.bossDeathText = null
  combatState.inNickFight = true
  combatState.nickVictory = false
  addLog('sys', "▶ The door opens. There's no going back.")
  const tid = setTimeout(() => initBossMechanics(), 200)
  bossDelayIds.push(tid)
}
