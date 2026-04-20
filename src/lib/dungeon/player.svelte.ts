import { statValue, calcMaxHp, upgradeCost, xpToNextLevel, skillXpToNext, type StatKey, type SkillId, type SkillState, ACHIEVEMENTS, ZONE_LEVEL_REQUIREMENTS, ELLA_ZONE_INDEX } from './constants'
import { ITEMS, type ItemSlot, type Item } from './items'

export function itemXpToNext(level: number): number {
  return Math.round(50 * Math.pow(level, 1.4))
}

export type Stats = Record<StatKey, number>

export type LifetimeStats = {
  enemiesKilled: number
  goldEarned: number
  bossesDefeated: number
  itemsLooted: number
  timesPrestiged: number
  totalPlaytime: number    // ms, increment on save
  fraserKills: number
  haydenKills: number
  ellaKills: number
}

export type PrestigePerk = {
  attackBonus: number
  defenceBonus: number
  speedBonus: number
  goldBonus: number
  vitalityBonus: number
  critDmgBonus: number
  lifeStealBonus: number
  hpRegenBonus: number
  xpBonus: number
  luckBonus: number
}

export type PlayerState = {
  name: string
  level: number
  xp: number
  xpToNext: number
  hp: number
  maxHp: number
  woundedHp: number
  lastHitTimestamp: number
  gold: number
  stats: Stats
  statLevels: Stats
  gear: Record<ItemSlot, Item | null>
  currentZone: number
  currentStage: number
  materials: Record<string, number>
  prestigeTokens: number
  unlockedZones: number   // highest zone index unlocked
  lootQueue: Item[]       // items waiting to be reviewed
  fraserDefeated: boolean
  firstVisit: string[]
  nickDefeated: boolean
  deepestPostGameZone: number  // 0 = none, 1 = first post-game zone cleared, etc.
  achievements: string[]
  firstBossKills: string[]
  lifetimeStats: LifetimeStats
  lastSaveTimestamp: number
  saveVersion: number     // increments on each cloud save for conflict resolution
  skills: Record<SkillId, SkillState>
  skillXpMultiplier: number
  prestigePerks: PrestigePerk
  prestigePerkLevels: Record<string, number>
  activeModifiers: string[]
  permanentUnlocks: string[]
  activeChallenges: string[]
  bonusTokensEarned: number
  plushieCooldown: number   // timestamp of last chiikawa-plushie death-block activation
}

const SAVE_KEY = 'wolton-dungeon-player'

function freshState(): PlayerState {
  return {
    name: 'PLAYER',
    level: 1,
    xp: 0,
    xpToNext: 100,
    hp: 100,
    maxHp: 100,
    woundedHp: 0,
    lastHitTimestamp: 0,
    gold: 3500,
    stats:      { attack: 5, defence: 3, speed: 0, luck: 2, vitality: 10, critDmg: 200, hpRegen: 0, goldFind: 0, xpBoost: 0, lifesteal: 0 },
    statLevels: { attack: 0, defence: 0, speed: 0, luck: 0, vitality: 0, critDmg: 0, hpRegen: 0, goldFind: 0, xpBoost: 0, lifesteal: 0 },
    gear: { weapon: null, armour: null, helmet: null, ring: null, amulet: null },
    currentZone: 0,
    currentStage: 1,
    materials: { wood: 0, iron: 0, potion: 0, herbs: 0, hardwood: 0, steel: 0, rare_herbs: 0, darkwood: 0, wolton_alloy: 0, void_essence: 0 },
    prestigeTokens: 0,
    unlockedZones: 0,
    lootQueue: [],
    fraserDefeated: false,
    firstVisit: [],
    nickDefeated: false,
    deepestPostGameZone: 0,
    achievements: [],
    firstBossKills: [],
    lifetimeStats: {
      enemiesKilled: 0,
      goldEarned: 0,
      bossesDefeated: 0,
      itemsLooted: 0,
      timesPrestiged: 0,
      totalPlaytime: 0,
      fraserKills: 0,
      haydenKills: 0,
      ellaKills: 0,
    },
    lastSaveTimestamp: Date.now(),
    saveVersion: 0,
    skills: {
      woodcutting: { level: 0, xp: 0, xpToNext: skillXpToNext(0) },
      mining:      { level: 0, xp: 0, xpToNext: skillXpToNext(0) },
      herbalism:   { level: 0, xp: 0, xpToNext: skillXpToNext(0) },
      brewing:     { level: 0, xp: 0, xpToNext: skillXpToNext(0) },
      patrol:      { level: 0, xp: 0, xpToNext: skillXpToNext(0) },
    },
    skillXpMultiplier: 1.0,
    prestigePerks: {
      attackBonus: 0, defenceBonus: 0, speedBonus: 0,
      goldBonus: 0, vitalityBonus: 0, critDmgBonus: 0,
      lifeStealBonus: 0, hpRegenBonus: 0,
      xpBonus: 0, luckBonus: 0,
    },
    prestigePerkLevels: {},
    activeModifiers: [],
    permanentUnlocks: [],
    activeChallenges: [],
    bonusTokensEarned: 0,
    plushieCooldown: 0,
  }
}

export const player: PlayerState = $state(freshState())

export function savePlayer(): void {
  if (typeof localStorage === 'undefined') return
  const now = Date.now()
  if (player.lastSaveTimestamp > 0) {
    player.lifetimeStats.totalPlaytime += now - player.lastSaveTimestamp
  }
  player.lastSaveTimestamp = now
  localStorage.setItem(SAVE_KEY, JSON.stringify(player))
}

export function applyPlayerData(saved: Partial<PlayerState>): void {
  const defaults = freshState()
  Object.assign(player, defaults, saved)
  player.lifetimeStats = { ...defaults.lifetimeStats, ...(saved.lifetimeStats ?? {}) }
  player.stats      = { ...defaults.stats,      ...(saved.stats      ?? {}) }
  player.statLevels = { ...defaults.statLevels, ...(saved.statLevels ?? {}) }
  player.materials  = { ...defaults.materials,  ...(saved.materials  ?? {}) }
  // Recalculate stats from statLevels so existing saves use the current formula
  for (const key of Object.keys(player.statLevels) as StatKey[]) {
    player.stats[key] = statValue(key, player.statLevels[key])
  }
  if (player.statLevels.vitality > 0) {
    const levelBonus = (player.level - 1) * 10
    player.maxHp = calcMaxHp(player.statLevels.vitality) + levelBonus
    player.hp = Math.min(player.hp, player.maxHp)
  }
  if (!player.achievements) player.achievements = []
  if (player.fraserDefeated === undefined) player.fraserDefeated = false
  if (!player.firstVisit) player.firstVisit = []
  if (!player.firstBossKills) player.firstBossKills = []
  if (player.nickDefeated === undefined) player.nickDefeated = false
  if (player.deepestPostGameZone === undefined) player.deepestPostGameZone = 0
  if (!player.lastSaveTimestamp) player.lastSaveTimestamp = Date.now()
  // Merge skills individually so new skill IDs get defaults when loading old saves
  const skillDefaults = defaults.skills
  const savedSkills = (saved.skills ?? {}) as Partial<Record<SkillId, Partial<SkillState>>>
  player.skills = Object.fromEntries(
    (Object.keys(skillDefaults) as SkillId[]).map(id => [
      id,
      { ...skillDefaults[id], ...(savedSkills[id] ?? {}) },
    ])
  ) as Record<SkillId, SkillState>
  if (!player.skillXpMultiplier) player.skillXpMultiplier = 1.0
  player.prestigePerks = { ...defaults.prestigePerks, ...(saved.prestigePerks ?? {}) }
  player.prestigePerkLevels = { ...(saved.prestigePerkLevels ?? {}) }
  player.activeModifiers = Array.isArray(saved.activeModifiers) ? [...saved.activeModifiers] : []
  player.permanentUnlocks = Array.isArray(saved.permanentUnlocks) ? [...saved.permanentUnlocks] : []
  player.activeChallenges = Array.isArray(saved.activeChallenges) ? [...saved.activeChallenges] : []
  player.bonusTokensEarned = saved.bonusTokensEarned ?? 0
  player.plushieCooldown = saved.plushieCooldown ?? 0
}

function mergeWithDefaults(saved: Partial<PlayerState>): PlayerState {
  const d = freshState()
  const savedSkillsData = (saved.skills ?? {}) as Partial<Record<SkillId, Partial<SkillState>>>
  const skills = Object.fromEntries(
    (Object.keys(d.skills) as SkillId[]).map(id => [
      id,
      { ...d.skills[id], ...(savedSkillsData[id] ?? {}) },
    ])
  ) as Record<SkillId, SkillState>
  return {
    ...d, ...saved,
    lifetimeStats: { ...d.lifetimeStats, ...(saved.lifetimeStats ?? {}) },
    stats:         { ...d.stats,         ...(saved.stats         ?? {}) },
    statLevels:    { ...d.statLevels,    ...(saved.statLevels    ?? {}) },
    materials:     { ...d.materials,     ...(saved.materials     ?? {}) },
    skills,
    skillXpMultiplier: saved.skillXpMultiplier ?? 1.0,
    prestigePerks:     { ...d.prestigePerks, ...(saved.prestigePerks ?? {}) },
    prestigePerkLevels: { ...(saved.prestigePerkLevels ?? {}) },
    activeModifiers:   Array.isArray(saved.activeModifiers) ? [...saved.activeModifiers] : [],
    permanentUnlocks:  Array.isArray(saved.permanentUnlocks) ? [...saved.permanentUnlocks] : [],
    activeChallenges:  Array.isArray(saved.activeChallenges) ? [...saved.activeChallenges] : [],
    bonusTokensEarned: saved.bonusTokensEarned ?? 0,
    plushieCooldown:   saved.plushieCooldown ?? 0,
  } as PlayerState
}

export function loadPlayer(): void {
  if (typeof localStorage === 'undefined') return
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return
  try {
    applyPlayerData(JSON.parse(raw) as Partial<PlayerState>)
  } catch {
    // corrupt save -- start fresh
  }
}

export function upgradeStats(stat: StatKey): boolean {
  const cost = upgradeCost(stat, player.statLevels[stat])
  if (player.gold < cost) return false
  player.gold -= cost
  player.statLevels[stat]++
  player.stats[stat] = statValue(stat, player.statLevels[stat])
  if (stat === 'vitality') {
    // Preserve level-up HP bonus (each level above 1 grants +10 maxHp)
    const levelBonus = (player.level - 1) * 10
    const newMax = calcMaxHp(player.statLevels.vitality) + levelBonus
    player.maxHp = newMax
    player.hp = Math.min(player.hp, newMax)
  }
  savePlayer()
  return true
}

/** Level-up callback — set from combat.svelte.ts to inject log entries */
export let onLevelUp: ((level: number) => void) | null = null
export function setOnLevelUp(cb: ((level: number) => void) | null): void { onLevelUp = cb }

/** Skill level-up callback — set from +page.svelte */
export let onSkillLevelUp: ((skillId: SkillId, level: number) => void) | null = null
export function setOnSkillLevelUp(cb: ((skillId: SkillId, level: number) => void) | null): void { onSkillLevelUp = cb }

export function gainXp(amount: number): void {
  player.xp += amount
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext
    player.level++
    player.xpToNext = xpToNextLevel(player.level)
    player.maxHp += 10
    player.hp = player.maxHp
    if (onLevelUp) onLevelUp(player.level)
  }
}

/** Item level-up callback -- set from combat.svelte.ts to inject log entries */
export let onItemLevelUp: ((item: Item) => void) | null = null
export function setOnItemLevelUp(cb: ((item: Item) => void) | null): void { onItemLevelUp = cb }

export function gainItemXp(amount: number): void {
  for (const item of Object.values(player.gear)) {
    if (!item) continue
    const level = item.itemLevel ?? 1
    if (level >= 10) continue
    item.itemXp = (item.itemXp ?? 0) + amount
    const toNext = itemXpToNext(level)
    if (item.itemXp >= toNext) {
      item.itemXp -= toNext
      item.itemLevel = level + 1
      item.itemXpToNext = itemXpToNext(level + 1)
      if (onItemLevelUp) onItemLevelUp(item)
    }
  }
}

export function gainGold(amount: number): void {
  player.gold += amount
}

export function gainMaterial(material: string, amount: number): void {
  player.materials[material] = (player.materials[material] ?? 0) + amount
}

export function gainSkillXp(skillId: SkillId, amount: number): void {
  if (!player.skills?.[skillId]) return
  const skill = player.skills[skillId]
  skill.xp += amount
  while (skill.xp >= skill.xpToNext && skill.level < 60) {
    skill.xp -= skill.xpToNext
    skill.level++
    skill.xpToNext = skillXpToNext(skill.level)
    if (onSkillLevelUp) onSkillLevelUp(skillId, skill.level)
  }
}

export function healPlayer(amount: number): void {
  player.hp = Math.min(
    player.maxHp - player.woundedHp,
    player.hp + amount
  )
}

export function damagePlayer(amount: number): void {
  player.hp = Math.max(0, player.hp - amount)
}

export function respawnPlayer(): void {
  player.hp = player.maxHp
  player.woundedHp = 0
  player.lastHitTimestamp = 0
  player.currentStage = 1
}

export function advanceToZone(zoneIndex: number): void {
  player.currentZone = zoneIndex
  player.currentStage = 1
  if (zoneIndex > player.unlockedZones) {
    player.unlockedZones = zoneIndex
  }
  savePlayer()
}

export function travelToZone(zoneIndex: number): void {
  // ella zone bypasses normal unlock gate (unlocked separately via haydenKills)
  if (zoneIndex === ELLA_ZONE_INDEX) {
    player.currentZone = ELLA_ZONE_INDEX
    player.currentStage = 1
    savePlayer()
    return
  }
  if (zoneIndex > player.unlockedZones) return
  player.currentZone = zoneIndex
  player.currentStage = 1
  savePlayer()
}

/** Compute effective goldFind multiplier including all gear bonuses. Exported for timers. */
export function goldFindMultiplier(): number {
  const base = player.stats.goldFind
  let pct = 0, flat = 0
  for (const item of Object.values(player.gear)) {
    if (!item) continue
    const lvlMult = 1 + ((item.itemLevel ?? 1) - 1) * 0.08
    if (item.statBonuses.goldFind?.flat)    flat += item.statBonuses.goldFind.flat * lvlMult
    if (item.statBonuses.goldFind?.percent) pct  += item.statBonuses.goldFind.percent * lvlMult
    pct += (item.rolledBonuses ?? []).filter(r => r.stat === 'goldFind').reduce((s, r) => s + r.percent, 0)
    pct += (item.modifier?.bonuses ?? []).filter(r => r.stat === 'goldFind').reduce((s, r) => s + r.percent, 0)
  }
  const eff = Math.floor(base * (1 + pct / 100)) + flat
  return 1 + eff / 100
}

export function addToLootQueue(item: Item): void {
  player.lootQueue = [...player.lootQueue, item]
}

export function equipFromLootQueue(item: Item): void {
  // HR Shop: NO EQUIPMENT POLICY / FULL AUDIT — block gear changes this run
  const challenges = player.activeChallenges ?? []
  if (challenges.includes('challenge:noGear') || challenges.includes('challenge:fullAudit')) return
  const slot = item.slot
  const current = player.gear[slot]
  const idx = player.lootQueue.indexOf(item)
  if (idx === -1) return
  const newQueue = [...player.lootQueue]
  newQueue.splice(idx, 1)
  if (current) newQueue.push(current)
  player.lootQueue = newQueue
  player.gear[slot] = item
  checkAchievements()
  savePlayer()
}

export function discardFromLootQueue(item: Item): void {
  const goldRefund: Record<string, number> = { common: 15, uncommon: 60, rare: 200, epic: 600 }
  const idx = player.lootQueue.indexOf(item)
  if (idx === -1) return
  const newQueue = [...player.lootQueue]
  newQueue.splice(idx, 1)
  player.lootQueue = newQueue
  player.gold += goldRefund[item.rarity] ?? 10
  savePlayer()
}

export function canPrestige(): boolean {
  return player.fraserDefeated
}

/** Apply permanent benefits purchased in the HR shop to a freshly-prestiged player.
 *  preGear and preMaterials are pre-prestige snapshots for carry-over benefits. */
function applyPermanentBenefits(
  p: PlayerState,
  preGear: Record<ItemSlot, Item | null>,
  preMaterials: Record<string, number>,
): void {
  // Starting zone — highest wins
  let startZone = 0
  if (p.permanentUnlocks.includes('executive-access'))      startZone = 6
  else if (p.permanentUnlocks.includes('fast-track'))       startZone = 4
  else if (p.permanentUnlocks.includes('early-checkout'))   startZone = 2
  if (startZone > 0) {
    p.currentZone = startZone
    p.unlockedZones = startZone
  }
  // Wolton pension: +10% lifetime gold earned (one-time on prestige)
  if (p.permanentUnlocks.includes('wolton-pension')) {
    p.gold += Math.floor(p.lifetimeStats.goldEarned * 0.10)
  }
  // Loot retention: keep previous gear
  if (p.permanentUnlocks.includes('loot-retention')) {
    p.gear = { ...preGear }
  }
  // Material carry: copy 25% of each material (floored)
  if (p.permanentUnlocks.includes('material-carry')) {
    for (const [mat, amt] of Object.entries(preMaterials)) {
      const carry = Math.floor(amt * 0.25)
      if (carry > 0) p.materials[mat] = (p.materials[mat] ?? 0) + carry
    }
  }
}

/** Apply active run modifiers from the HR shop. */
function applyRunModifiers(p: PlayerState): void {
  const mods = p.activeModifiers
  if (mods.includes('modifier:startGear:t2')) {
    // Starter T2 gear set — equip baseline T2 items from items registry
    const starter = getStarterGearSet('t2')
    for (const item of starter) {
      if (item) p.gear[item.slot] = item
    }
  }
  if (mods.includes('modifier:startGold:2000')) {
    p.gold += 2000
  }
  if (mods.includes('modifier:startPotions:5')) {
    p.materials.potion = (p.materials.potion ?? 0) + 5
  }
}

/** Build a T2 starter gear set by instancing baseline items. */
function getStarterGearSet(tier: 't2'): Item[] {
  if (tier !== 't2') return []
  const ids = ['iron-sword', 'leather-vest', 'iron-helm', 'steel-ring', 'rat-tooth']
  const out: Item[] = []
  for (const id of ids) {
    const base = ITEMS[id]
    if (!base) continue
    out.push({
      ...base,
      instanceId: crypto.randomUUID(),
      rolledBonuses: [...(base.rolledBonuses ?? [])],
      rerollCount: 0,
      itemLevel: 1,
      itemXp: 0,
      itemXpToNext: itemXpToNext(1),
    })
  }
  return out
}

export function prestige(): void {
  if (!canPrestige()) return
  // Base +1 token + any bonus tokens earned during the run (HR shop challenges/modifiers)
  const bonusTokens = Math.max(0, player.bonusTokensEarned ?? 0)
  const tokens = player.prestigeTokens + 1 + bonusTokens
  const name = player.name
  const achievements = [...player.achievements]
  const lifetimeStats = { ...player.lifetimeStats, timesPrestiged: player.lifetimeStats.timesPrestiged + 1 }
  const savedSkills = { ...player.skills } as Record<SkillId, SkillState>
  // Preserved through prestige: perks, perk levels, permanent unlocks
  const savedPrestigePerks = { ...player.prestigePerks }
  const savedPrestigePerkLevels = { ...player.prestigePerkLevels }
  const savedPermanentUnlocks = [...player.permanentUnlocks]
  const savedActiveModifiers = [...player.activeModifiers]
  const savedActiveChallenges = [...player.activeChallenges]
  // Pre-prestige snapshots for permanent-benefit handling
  const preGear = { ...player.gear }
  const preMaterials = { ...player.materials }
  const fresh = freshState()
  Object.assign(player, fresh)
  player.name = name
  player.prestigeTokens = tokens
  player.fraserDefeated = false
  player.unlockedZones = 0
  player.achievements = achievements
  player.lifetimeStats = lifetimeStats
  player.skills = savedSkills
  player.prestigePerks = savedPrestigePerks
  player.prestigePerkLevels = savedPrestigePerkLevels
  player.permanentUnlocks = savedPermanentUnlocks
  // Carry forward the chosen modifiers/challenges into the new run; they clear on next prestige
  player.activeModifiers = savedActiveModifiers
  player.activeChallenges = savedActiveChallenges
  player.bonusTokensEarned = 0
  const multiplierTable = [1.0, 1.2, 1.3, 1.4, 1.5, 1.7, 2.0, 2.3, 2.6, 3.0, 3.5, 4.0, 4.5, 5.0]
  player.skillXpMultiplier = multiplierTable[Math.min(tokens, multiplierTable.length - 1)]
  player.lastSaveTimestamp = Date.now()
  // Apply permanent benefits and run modifiers from shop purchases
  applyPermanentBenefits(player, preGear, preMaterials)
  applyRunModifiers(player)
  // Recompute max HP if perks changed vitality (perks are applied in getEffectiveStats, so maxHp stays base)
  savePlayer()
}

/** Called by combat on the first enemy of a new prestige run — resets active
 *  modifiers/challenges that were consumed for the previous run. The current
 *  activeModifiers/activeChallenges remain through the run; this is invoked
 *  after the run ends (on the next prestige call) via prestige() itself.
 *  Kept as a named helper for potential future explicit reset calls. */
export function clearRunConfigAfterUse(): void {
  player.activeModifiers = []
  player.activeChallenges = []
  player.bonusTokensEarned = 0
}

// ── CLOUD SAVE ───────────────────────────────────────────────────────────────

export async function loadFromCloud(): Promise<{ save: PlayerState | null; loggedIn: boolean; displayName: string | null }> {
  try {
    const res = await fetch('/api/dungeon/save')
    if (res.status === 401) return { save: null, loggedIn: false, displayName: null }
    if (!res.ok) return { save: null, loggedIn: false, displayName: null }
    const data = await res.json() as { save: { saveData: string } | null; displayName?: string }
    const displayName = data.displayName ?? null
    if (!data.save) return { save: null, loggedIn: true, displayName }
    return { save: mergeWithDefaults(JSON.parse(data.save.saveData) as Partial<PlayerState>), loggedIn: true, displayName }
  } catch {
    return { save: null, loggedIn: false, displayName: null }
  }
}

export async function deleteCloudSave(): Promise<void> {
  try {
    await fetch('/api/dungeon/save', { method: 'DELETE' })
  } catch { /* silent fail */ }
}

export async function submitLeaderboard(p: PlayerState): Promise<void> {
  const payload = {
    playerName:           p.name,
    highestZone:          p.currentZone,
    highestStage:         p.currentStage,
    playerLevel:          p.level,
    prestigeTokens:       p.prestigeTokens,
    fraserKills:          p.lifetimeStats.fraserKills,
    nickDefeated:         p.nickDefeated,
    totalPlaytime:        p.lifetimeStats.totalPlaytime,
    deepestPostGameZone:  p.deepestPostGameZone,
    ellaKills:            p.lifetimeStats.ellaKills ?? 0,
  }
  try {
    await fetch('/api/dungeon/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch { /* silent fail — leaderboard is not critical */ }
}

/** Achievement toast callback -- set from +page.svelte */
export let onAchievement: ((id: string) => void) | null = null
export function setOnAchievement(cb: ((id: string) => void) | null): void { onAchievement = cb }

export function checkAchievements(): void {
  const checks: [string, boolean][] = [
    ['first-blood',  player.lifetimeStats.enemiesKilled >= 1],
    ['zone-2',       player.unlockedZones >= 1],
    ['loot-drop',    player.lifetimeStats.itemsLooted >= 1],
    ['level-10',     player.level >= 10],
    ['level-25',     player.level >= 25],
    ['level-50',     player.level >= 50],
    ['full-gear',    Object.values(player.gear).every(g => g !== null)],
    ['prestige-1',   player.lifetimeStats.timesPrestiged >= 1],
    ['prestige-3',   player.lifetimeStats.timesPrestiged >= 3],
    ['fraser-1',     player.lifetimeStats.fraserKills >= 1],
    ['fraser-3',     player.lifetimeStats.fraserKills >= 3],
    ['zone-9',       player.unlockedZones >= 8],
    ['secret',       player.nickDefeated],
    ['the-end',      player.deepestPostGameZone >= 20],
    ['resigned',     player.permanentUnlocks.includes('resignation-letter')],
    ['ella-defeated', (player.lifetimeStats.ellaKills ?? 0) >= 1],
  ]
  for (const [id, met] of checks) {
    if (met && !player.achievements.includes(id)) {
      player.achievements = [...player.achievements, id]
      if (onAchievement) onAchievement(id)
    }
  }
}
