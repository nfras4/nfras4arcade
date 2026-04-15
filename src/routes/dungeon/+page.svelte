<script lang="ts">
  import { untrack } from 'svelte'
  import {
    player, loadPlayer, savePlayer, upgradeStats, applyPlayerData, loadFromCloud, deleteCloudSave,
    travelToZone, equipFromLootQueue, discardFromLootQueue,
    prestige, canPrestige, setOnAchievement, checkAchievements,
    submitLeaderboard,
  } from '$lib/dungeon/player.svelte'
  import { combatState, spawnEnemy, playerAttack, enemyAttack, startNickFight, getEffectiveStats } from '$lib/dungeon/combat.svelte'
  import { ENEMIES } from '$lib/dungeon/enemies'
  import {
    loadTimers, saveTimers, startActivity, collectActivity,
    timerProgress, timerRemaining, isRunning, isReady, formatMs, formatDuration,
    canStart, ACTIVITIES, getOfflineEarnings, clearOfflineEarnings,
  } from '$lib/dungeon/timers.svelte'
  import { ZONES } from '$lib/dungeon/zones'
  import {
    upgradeCost, statValue, calcAttackInterval,
    ENEMY_ATTACK_INTERVAL, AUTOSAVE_INTERVAL_MS, STAGES_PER_ZONE,
    ZONE_LEVEL_REQUIREMENTS, ACHIEVEMENTS, prestigeMultiplier,
    type StatKey,
  } from '$lib/dungeon/constants'
  import { type ItemSlot, type Item, type CraftEntry, ITEMS, CRAFT_RECIPES, MATERIAL_TIERS } from '$lib/dungeon/items'
  import { craftRoll, rerollCost, type CraftResult } from '$lib/dungeon/crafting'
  import { playSound, setMuted, isMuted, initAudio } from '$lib/dungeon/audio'

  // ── DOM refs ──────────────────────────────────────────────────────────────
  let canvasEl = $state<HTMLCanvasElement | undefined>()

  // ── UI state ──────────────────────────────────────────────────────────────
  let showUpgradeModal    = $state(false)
  let showStoryModal     = $state(false)
  let showPrestigeModal  = $state(false)
  let showAchModal       = $state(false)
  let showStatsModal     = $state(false)
  let showOfflineModal   = $state(false)
  let showCraftResult    = $state(false)
  let craftResult        = $state<CraftResult | null>(null)
  let playerLoaded       = $state(false)   // set true by onMount after loadPlayer()
  let showLeaderboard    = $state(false)
  let storyText          = $state<string[]>([])
  let activeTab          = $state<'upgrades' | 'gear' | 'items'>('upgrades')
  let gearSubTab         = $state<'loadout' | 'loot' | 'crafting' | 'reroll'>('loot')
  let now                = $state(Date.now())
  let equipModalSlot     = $state<ItemSlot | null>(null)
  let showBossDeathOverlay = $state(false)
  let showVictoryScreen    = $state(false)
  let showNickVictory      = $state(false)

  // Cloud save sync
  type SyncStatus = 'synced' | 'saving' | 'offline' | 'guest'
  let syncStatus      = $state<SyncStatus>('guest')
  let showGuestBanner = $state(false)

  // Reset save flow
  let resetConfirmText = $state('')
  let showResetConfirm = $state(false)

  // Mobile layout
  let mobileTab = $state<'player' | 'shop' | 'timers'>('shop')

  // Combat speed
  let combatSpeed = $state<1 | 2>(typeof localStorage !== 'undefined' && localStorage.getItem('wdSpeed') === '2' ? 2 : 1)

  // Auto-collect
  let autoCollect = $state<boolean>(typeof localStorage !== 'undefined' ? localStorage.getItem('wdAutoCollect') === '1' : false)

  // Sound
  let soundMuted = $state(typeof localStorage !== 'undefined' ? localStorage.getItem('wdMuted') === '1' : true)

  // Transition / animation state
  let zoneTransitioning  = $state(false)
  let bossJustSpawned    = $state(false)
  let levelUpFlash       = $state(false)
  let levelUpTextVisible = $state(false)
  let prestigeFlash      = $state(false)
  let killSessionCounts  = $state<Record<string, number>>({})

  // Reroll confirmation
  let rerollConfirmItem: Item | null = $state(null)
  let rerollConfirmTimeout: ReturnType<typeof setTimeout> | null = null

  // Zone lock feedback
  let zoneLockMsg = $state('')
  let zoneLockTimeout: ReturnType<typeof setTimeout> | null = null

  // Discard confirmation
  let discardConfirmItem: Item | null = $state(null)
  let discardConfirmTimeout: ReturnType<typeof setTimeout> | null = null

  // Tutorial
  let showTutorial   = $state(false)
  let tutorialSlide  = $state(0)

  // Achievement toasts
  type AchToast = { id: string; name: string; sprite: string; ts: number }
  let achToasts = $state<AchToast[]>([])

  setOnAchievement((id: string) => {
    const ach = ACHIEVEMENTS.find(a => a.id === id)
    if (!ach) return
    const toast: AchToast = { id, name: ach.name, sprite: ach.sprite, ts: Date.now() }
    achToasts = [...achToasts, toast]
    setTimeout(() => {
      achToasts = achToasts.filter(t => t.ts !== toast.ts)
    }, 3000)
  })

  // Number formatting helpers
  function fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'm'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
    return n.toLocaleString()
  }

  // ── Item / loot helpers ───────────────────────────────────────────────────
  function rarityColor(rarity: string): string {
    const c: Record<string, string> = { common: '#808080', uncommon: '#40a040', rare: '#4080ff', epic: '#c040ff', boss_unique: '#ff9000' }
    return c[rarity] ?? '#808080'
  }

  function formatStatBonuses(item: Item): string {
    return Object.entries(item.statBonuses)
      .filter(([, v]) => v?.flat)
      .map(([k, v]) => `+${v!.flat} ${k.slice(0, 3).toUpperCase()}`)
      .join(' ')
  }

  function gearFlatBonus(stat: StatKey): number {
    return Object.values(player.gear).reduce((sum, item) => {
      if (!item) return sum
      return sum + (item.statBonuses[stat]?.flat ?? 0)
    }, 0)
  }

  function gearPercentBonus(stat: StatKey): number {
    return Object.values(player.gear).reduce((sum, item) => {
      if (!item) return sum
      return sum + (item.rolledBonuses ?? []).filter(r => r.stat === stat).reduce((s, r) => s + r.percent, 0)
    }, 0)
  }

  const DISCARD_GOLD: Record<string, number> = { common: 15, uncommon: 60, rare: 200, epic: 600 }

  function itemPower(item: Item): number {
    const base = Object.values(item.statBonuses).reduce((s, v) => s + (v?.flat ?? 0), 0)
    const rolled = (item.rolledBonuses ?? []).reduce((s, r) => s + r.percent, 0)
    return base + rolled
  }

  function matLabel(mat: string): string {
    return MATERIAL_TIERS[mat]?.name ?? (mat[0].toUpperCase() + mat.slice(1).replace('_', ' '))
  }

  const sortedLootQueue = $derived([...player.lootQueue].sort((a, b) => itemPower(b) - itemPower(a)))

  function canAffordCraft(recipe: CraftEntry): boolean {
    for (const [mat, amt] of Object.entries(recipe.materials)) {
      if ((player.materials[mat] ?? 0) < amt) return false
    }
    return player.gold >= recipe.gold
  }

  function doCraft(recipe: CraftEntry): void {
    if (!canAffordCraft(recipe)) return
    for (const [mat, amt] of Object.entries(recipe.materials)) {
      player.materials[mat] = (player.materials[mat] ?? 0) - amt
    }
    player.gold -= recipe.gold
    const baseItem = ITEMS[recipe.itemId]
    if (baseItem) {
      const luck = getEffectiveStats(player).luck
      const result = craftRoll(baseItem, luck)
      const item: Item = {
        ...baseItem,
        instanceId: crypto.randomUUID(),
        rolledBonuses: result.bonusRolls,
        rerollCount: 0,
      }
      player.lootQueue = [...player.lootQueue, item]
      craftResult = { ...result, item }
      showCraftResult = true
      activeTab = 'gear'
      playSound(result.rollQuality === 'perfect' ? 'craft-perfect' : 'craft')
    }
    savePlayer()
  }

  function canAffordReroll(item: Item): boolean {
    const cost = rerollCost(item)
    if (player.gold < cost.gold) return false
    for (const [mat, amt] of Object.entries(cost.materials)) {
      if ((player.materials[mat] ?? 0) < amt) return false
    }
    return true
  }

  function doReroll(item: Item): void {
    if (!canAffordReroll(item)) return
    const cost = rerollCost(item)
    player.gold -= cost.gold
    for (const [mat, amt] of Object.entries(cost.materials)) {
      player.materials[mat] = (player.materials[mat] ?? 0) - amt
    }
    const luck = getEffectiveStats(player).luck
    const result = craftRoll(item, luck)
    item.rolledBonuses = result.bonusRolls
    item.rerollCount = (item.rerollCount ?? 0) + 1
    craftResult = { ...result, item }
    showCraftResult = true
    savePlayer()
  }

  function dismissCraftOverlay(): void {
    if (pendingDropResults.length > 0) {
      craftResult = pendingDropResults[0]
      pendingDropResults = pendingDropResults.slice(1)
    } else {
      showCraftResult = false
      craftResult = null
    }
  }

  function formatRolledBonuses(item: Item): string {
    if (!item.rolledBonuses || item.rolledBonuses.length === 0) return ''
    return item.rolledBonuses.map(r => r.label).join(' ')
  }

  function luckBonusPct(): number {
    const luck = getEffectiveStats(player).luck
    return Math.round(Math.min(luck * 0.008, 0.4) * 100)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (showOfflineModal) { showOfflineModal = false; clearOfflineEarnings(); playSound('gold') }
    else if (showPrestigeModal) showPrestigeModal = false
    else if (showUpgradeModal) showUpgradeModal = false
    else if (equipModalSlot) equipModalSlot = null
    else if (showCraftResult) dismissCraftOverlay()
    else if (showAchModal) showAchModal = false
    else if (showStatsModal) showStatsModal = false
    else if (showLeaderboard) showLeaderboard = false
    else if (showStoryModal) showStoryModal = false
  }

  const QUALITY_COLOR: Record<string, string> = {
    normal: '#888', good: '#40a040', great: '#4080ff', perfect: '#f0c030'
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  type LbEntry = {
    rank: number; playerName: string; highestZone: number; highestStage: number
    playerLevel: number; prestigeTokens: number; fraserKills: number
    nickDefeated: number; updatedAt: number
  }
  type LbTab = 'zone' | 'prestige' | 'level' | 'fraser'
  const LB_TABS: { id: LbTab; label: string }[] = [
    { id: 'zone',    label: 'DEEPEST ZONE'   },
    { id: 'prestige',label: 'MOST PRESTIGE'  },
    { id: 'level',   label: 'HIGHEST LEVEL'  },
    { id: 'fraser',  label: 'FRASER KILLS'   },
  ]
  let lbTab       = $state<LbTab>('zone')
  let lbData      = $state<Record<LbTab, LbEntry[]>>({ zone: [], prestige: [], level: [], fraser: [] })
  let lbLoading   = $state(false)
  let lbError     = $state(false)
  let lbMyRank    = $state<Record<LbTab, number | null>>({ zone: null, prestige: null, level: null, fraser: null })
  let lbRefreshId: ReturnType<typeof setInterval> | null = null

  async function fetchLeaderboard(): Promise<void> {
    lbLoading = true; lbError = false
    try {
      const [zone, prestige, level, fraser, rank] = await Promise.all([
        fetch('/api/dungeon/leaderboard?sort=zone&limit=20').then(r => r.json()),
        fetch('/api/dungeon/leaderboard?sort=prestige&limit=20').then(r => r.json()),
        fetch('/api/dungeon/leaderboard?sort=level&limit=20').then(r => r.json()),
        fetch('/api/dungeon/leaderboard?sort=fraser&limit=20').then(r => r.json()),
        fetch(`/api/dungeon/leaderboard/rank?name=${encodeURIComponent(player.name)}`).then(r => r.json()),
      ])
      lbData = {
        zone:    zone.entries    ?? [],
        prestige: prestige.entries ?? [],
        level:   level.entries   ?? [],
        fraser:  fraser.entries  ?? [],
      }
      if (rank.found && rank.ranks) {
        lbMyRank = rank.ranks
      }
    } catch {
      lbError = true
    } finally {
      lbLoading = false
    }
  }

  $effect(() => {
    if (showLeaderboard) {
      fetchLeaderboard()
      lbRefreshId = setInterval(fetchLeaderboard, 60_000)
    } else {
      if (lbRefreshId) { clearInterval(lbRefreshId); lbRefreshId = null }
    }
    return () => { if (lbRefreshId) clearInterval(lbRefreshId) }
  })

  function lbStatLabel(entry: LbEntry, tab: LbTab): string {
    if (tab === 'zone')    return `Z${entry.highestZone + 1} S${entry.highestStage}`
    if (tab === 'prestige') return `⚡${entry.prestigeTokens}`
    if (tab === 'level')   return `LV${entry.playerLevel}`
    if (tab === 'fraser')  return `${entry.fraserKills}x`
    return ''
  }

  function lbTimeAgo(epochSeconds: number): string {
    const mins = Math.floor((Date.now() / 1000 - epochSeconds) / 60)
    if (mins < 2) return 'just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  function rankClass(r: number): string {
    if (r === 1) return 'gold'; if (r === 2) return 'silver'; if (r === 3) return 'bronze'; return ''
  }

  function zoneAccessible(i: number): boolean {
    if (i > player.unlockedZones) return false
    const lvlReq = ZONE_LEVEL_REQUIREMENTS[i] ?? 0
    return player.level >= lvlReq
  }

  function doTravelToZone(i: number): void {
    if (!zoneAccessible(i)) {
      if (zoneLockTimeout) clearTimeout(zoneLockTimeout)
      const lvlReq = ZONE_LEVEL_REQUIREMENTS[i] ?? 0
      zoneLockMsg = player.level < lvlReq ? `Requires Level ${lvlReq}` : 'Defeat the boss first'
      zoneLockTimeout = setTimeout(() => { zoneLockMsg = '' }, 2000)
      return
    }
    zoneLockMsg = ''
    if (zoneLockTimeout) { clearTimeout(zoneLockTimeout); zoneLockTimeout = null }
    travelToZone(i)
    spawnEnemy()
  }

  async function doPrestige(): Promise<void> {
    submitLeaderboard(player)
    playSound('prestige')
    prestigeFlash = true
    // Snapshot the pre-prestige state to cloud before wiping
    if (syncStatus !== 'guest') {
      try {
        player.saveVersion++
        await fetch('/api/dungeon/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saveData: JSON.stringify(player),
            saveVersion: player.saveVersion,
            savedAt: Date.now(),
          }),
        })
      } catch { /* local save still safe */ }
    }
    setTimeout(async () => {
      prestige()              // resets player (including saveVersion → 0) and calls savePlayer()
      showPrestigeModal = false
      spawnEnemy()
      checkAchievements()
      if (syncStatus !== 'guest') {
        await deleteCloudSave() // wipe old record so version 0 won't be rejected as stale
        scheduleCloudSave()   // upload fresh prestige state
      }
    }, 200)
    setTimeout(() => { prestigeFlash = false }, 600)
  }

  // ── Particles ────────────────────────────────────────────────────────────
  type Particle = { color:string; size:number; left:number; bottom:number; dy:number; dx:number; duration:number; delay:number }
  let particles = $state<Particle[]>([])

  function genParticles(zi: number): Particle[] {
    const out: Particle[] = []
    ZONES[zi].particles.forEach(cfg => {
      for (let i = 0; i < cfg.count; i++) {
        out.push({
          color: cfg.color, size: cfg.size + Math.random() * cfg.size,
          left: Math.random() * 100, bottom: 20 + Math.random() * 60,
          dy: -(30 + Math.random() * 60), dx: (Math.random() - 0.5) * 40,
          duration: cfg.life * (0.8 + Math.random() * 0.4), delay: Math.random() * cfg.life,
        })
      }
    })
    return out
  }

  // ── Stat rows ────────────────────────────────────────────────────────────
  const STAT_ROWS: { key: StatKey; icon: string; name: string; desc: string; short: string; unit: string; group: 'combat' | 'passive' }[] = [
    { key: 'attack',    icon: '⚔️',  name: 'ATTACK',     desc: '+3 atk dmg',                  short: 'ATK',   unit: '',   group: 'combat'  },
    { key: 'defence',   icon: '🛡️',  name: 'DEFENCE',    desc: '+2 dmg reduction',             short: 'DEF',   unit: '',   group: 'combat'  },
    { key: 'speed',     icon: '⚡',   name: 'SPEED',      desc: 'faster attacks',               short: 'SPD',   unit: '',   group: 'combat'  },
    { key: 'vitality',  icon: '❤️',  name: 'VITALITY',   desc: '+200 max HP',                  short: 'VIT',   unit: '',   group: 'combat'  },
    { key: 'critDmg',   icon: '💥',  name: 'CRIT DMG',   desc: 'crit multiplier +0.1x',        short: 'CRIT',  unit: '%',  group: 'combat'  },
    { key: 'luck',      icon: '🍀',  name: 'LUCK',       desc: '+2% crit chance',              short: 'LCK',   unit: '',   group: 'passive' },
    { key: 'hpRegen',   icon: '💚',  name: 'HP REGEN',   desc: '+1 HP/sec passively',          short: 'REGEN', unit: '/s', group: 'passive' },
    { key: 'goldFind',  icon: '🪙',  name: 'GOLD FIND',  desc: '+3% gold from all sources',    short: 'GFND',  unit: '%',  group: 'passive' },
    { key: 'xpBoost',   icon: '📈',  name: 'XP BOOST',   desc: '+3% XP from all kills',        short: 'XP',    unit: '%',  group: 'passive' },
    { key: 'lifesteal', icon: '🩸',  name: 'LIFESTEAL',  desc: '+1% dmg as HP (cap 30%)',      short: 'LS',    unit: '%',  group: 'passive' },
  ]

  // ── Derived ───────────────────────────────────────────────────────────────
  const hpPct      = $derived(player.maxHp > 0 ? (player.hp / player.maxHp) * 100 : 0)
  const xpPct      = $derived(player.xpToNext > 0 ? (player.xp / player.xpToNext) * 100 : 0)
  const stagePct   = $derived(((player.currentStage - 1) / STAGES_PER_ZONE) * 100)
  const enmHpPct   = $derived(combatState.enemyMaxHp > 0 ? (combatState.enemyHp / combatState.enemyMaxHp) * 100 : 0)
  const zone       = $derived(ZONES[player.currentZone])
  const currentEnemy  = $derived(ENEMIES[combatState.enemyId])
  const isBossFight   = $derived(!!currentEnemy?.isBoss)
  const isMinibosFight = $derived(!!currentEnemy?.isMiniboss)
  const isAnyBoss     = $derived(isBossFight || isMinibosFight)
  const isPlayerStunned = $derived(combatState.activeStuns.some(s => s.until > now))

  // ── Helpers ───────────────────────────────────────────────────────────────
  function td(id: string, tick: number) {
    return { prog: timerProgress(id, tick)*100, rem: timerRemaining(id, tick), run: isRunning(id, tick), rdy: isReady(id, tick) }
  }
  function onTimerClick(id: string) {
    const act = ACTIVITIES.find(a => a.id === id)
    if (!act) return
    const t = Date.now()
    if (isReady(id, t)) collectActivity(id)
    else if (!isRunning(id, t) && canStart(act)) startActivity(id)
  }

  function drawCanvas(zi: number) {
    const canvas = untrack(() => canvasEl)
    if (!canvas) return
    canvas.width  = canvas.offsetWidth  || 500
    canvas.height = canvas.offsetHeight || 300
    const ctx = canvas.getContext('2d')
    if (ctx) ZONES[zi].drawBg(ctx, canvas.width, canvas.height)
  }

  // ── Cloud save helpers ────────────────────────────────────────────────────
  let _cloudSaveTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleCloudSave(): void {
    if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer)
    syncStatus = 'saving'
    _cloudSaveTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/dungeon/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            saveData: JSON.stringify(player),
            saveVersion: player.saveVersion,
            savedAt: Date.now(),
          }),
        })
        if (!res.ok) { syncStatus = 'offline'; return }
        const result = await res.json() as { ok: boolean; reason?: string }
        if (result.ok) {
          syncStatus = 'synced'
        } else if (result.reason === 'stale') {
          // Server has a newer save — pull it down
          const { save } = await loadFromCloud()
          if (save && save.saveVersion > player.saveVersion) {
            untrack(() => { applyPlayerData(save); savePlayer() })
          }
          syncStatus = 'synced'
        } else {
          syncStatus = 'offline'
        }
      } catch {
        syncStatus = 'offline'
      }
    }, 5000)
  }

  async function syncFromCloud(): Promise<void> {
    const localVersion = player.saveVersion ?? -1
    const { save, loggedIn } = await loadFromCloud()
    if (!loggedIn) {
      syncStatus = 'guest'
      if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem('dungeon-guest-dismissed')) {
        showGuestBanner = true
      }
      return
    }
    syncStatus = 'synced'
    if (save && save.saveVersion > localVersion) {
      untrack(() => { applyPlayerData(save); savePlayer() })
    }
  }

  // ── Effects ───────────────────────────────────────────────────────────────
  // Init: onMount so it runs AFTER the first Svelte flush. This prevents the
  // massive player.$state write-storm from firing inside the effect queue and
  // inflating the update-depth counter. playerLoaded gates the zone-story effect
  // so it won't show stale firstVisit data before loadPlayer() has run.
  let _initDone = false
  $effect(() => {
    if (_initDone) return
    _initDone = true
    const isFirstTime = typeof localStorage !== 'undefined' && !localStorage.getItem('wolton-dungeon-player')
    untrack(() => {
      loadPlayer(); loadTimers(); spawnEnemy()
      soundMuted = isMuted()
      if (getOfflineEarnings()) showOfflineModal = true
      if (isFirstTime) showTutorial = true
      playerLoaded = true
    })
    syncFromCloud()
  })

  $effect(() => {
    const zi = player.currentZone
    const z  = ZONES[zi]
    const r  = document.documentElement
    r.style.setProperty('--z-bg',            z.palette.bg)
    r.style.setProperty('--z-panel',         z.palette.panel)
    r.style.setProperty('--z-panel2',        z.palette.panel2)
    r.style.setProperty('--z-border',        z.palette.border)
    r.style.setProperty('--z-border-hi',     z.palette.borderHi)
    r.style.setProperty('--z-accent',        z.palette.accent)
    r.style.setProperty('--z-accent2',       z.palette.accent2)
    r.style.setProperty('--z-ground-pattern',z.groundPattern)
    untrack(() => { particles = genParticles(zi) })
  })

  $effect(() => {
    const zi = player.currentZone
    const canvas = canvasEl
    if (!canvas) return
    canvas.width  = canvas.offsetWidth  || 500
    canvas.height = canvas.offsetHeight || 300
    const ctx = canvas.getContext('2d')
    if (ctx) ZONES[zi].drawBg(ctx, canvas.width, canvas.height)
  })

  $effect(() => {
    const onResize = () => drawCanvas(untrack(() => player.currentZone))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  // Combat tick: interval rate uses speed but must not create a reactive dep on player.stats
  // so that kills (which write player state) don't re-trigger this effect and recreate intervals.
  // combatSpeed is the only tracked dep (user-toggled UI state).
  $effect(() => {
    const spd = combatSpeed
    const speed = untrack(() => player.stats.speed)
    const ms = Math.max(200, Math.floor(calcAttackInterval(speed) / spd))
    const id = setInterval(playerAttack, ms)
    return () => clearInterval(id)
  })

  $effect(() => {
    const spd = combatSpeed
    const id = setInterval(enemyAttack, Math.floor(ENEMY_ATTACK_INTERVAL / spd))
    return () => clearInterval(id)
  })

  $effect(() => {
    const id = setInterval(() => {
      const regen = untrack(() => getEffectiveStats(player).hpRegen)
      if (regen > 0 && player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + regen)
      }
    }, 1000)
    return () => clearInterval(id)
  })

  $effect(() => {
    const id = setInterval(() => { now = Date.now() }, 500)
    return () => clearInterval(id)
  })

  $effect(() => {
    const save = () => {
      savePlayer()
      saveTimers()
      submitLeaderboard(player)
    }
    const cloudSave = () => {
      player.saveVersion++
      savePlayer()
      scheduleCloudSave()
    }
    const id = setInterval(() => { save(); cloudSave() }, AUTOSAVE_INTERVAL_MS)
    const onUnload = () => {
      save()
      if (syncStatus !== 'guest') {
        const blob = new Blob([JSON.stringify({
          saveData: JSON.stringify(player),
          saveVersion: player.saveVersion,
          savedAt: Date.now(),
        })], { type: 'application/json' })
        navigator.sendBeacon('/api/dungeon/save', blob)
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => { clearInterval(id); window.removeEventListener('beforeunload', onUnload) }
  })

  $effect(() => {
    // Gate on playerLoaded: don't evaluate before loadPlayer() has run,
    // otherwise firstVisit is empty and every zone shows its story on load.
    if (!playerLoaded) return
    const zi = player.currentZone
    const zoneKey = `zone-${zi}`
    if (untrack(() => player.firstVisit.includes(zoneKey))) return
    const lines = ZONES[zi].storyText
    if (lines && lines.length > 0) {
      untrack(() => {
        player.firstVisit = [...player.firstVisit, zoneKey]
        storyText = lines
        showStoryModal = true
      })
    }
  })

  // Watch for boss death overlay
  $effect(() => {
    const hasBossText = !!combatState.bossDeathText
    untrack(() => { if (hasBossText) showBossDeathOverlay = true })
  })

  // Show craft result overlay for notable loot drops (skip normal-quality 0-roll drops)
  let seenDropIds = new Set<string>()
  let pendingDropResults = $state<CraftResult[]>([])
  $effect(() => {
    const queue = player.lootQueue
    untrack(() => {
      for (const item of queue) {
        if (!item.instanceId || seenDropIds.has(item.instanceId)) continue
        seenDropIds.add(item.instanceId)
        if (item.rolledBonuses && item.rolledBonuses.length >= 2) {
          pendingDropResults = [...pendingDropResults, {
            item,
            bonusRolls: item.rolledBonuses,
            rollQuality: item.rolledBonuses.length >= 3 ? 'great' : 'good',
          }]
        }
      }
      // Show first pending if no overlay active
      if (!showCraftResult && pendingDropResults.length > 0) {
        craftResult = pendingDropResults[0]
        pendingDropResults = pendingDropResults.slice(1)
        showCraftResult = true
      }
    })
  })

  // Watch for victory states
  $effect(() => { const v = combatState.isVictory;    untrack(() => { if (v) showVictoryScreen = true }) })
  $effect(() => { const v = combatState.nickVictory;  untrack(() => { if (v) showNickVictory  = true }) })

  // Save combatSpeed to localStorage
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('wdSpeed', String(combatSpeed))
    }
  })

  // Save autoCollect to localStorage
  $effect(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('wdAutoCollect', autoCollect ? '1' : '0')
    }
  })

  // Auto-collect effect
  $effect(() => {
    if (!autoCollect) return
    const id = setInterval(() => {
      const t = Date.now()
      for (const act of ACTIVITIES) {
        if (isReady(act.id, t)) collectActivity(act.id)
        if (!isReady(act.id, t) && !isRunning(act.id, t) && canStart(act)) {
          startActivity(act.id)
        }
      }
    }, 1000)
    return () => clearInterval(id)
  })

  // Zone transition fade
  $effect(() => {
    const zi = player.currentZone
    void zi
    untrack(() => { zoneTransitioning = true })
    const t = setTimeout(() => { zoneTransitioning = false }, 600)
    return () => clearTimeout(t)
  })

  // Boss spawn animation + sound
  $effect(() => {
    const eid = combatState.enemyId
    const enemy = ENEMIES[eid]
    if (enemy?.isBoss || enemy?.isMiniboss) {
      untrack(() => {
        bossJustSpawned = true
        playSound('boss-spawn')
        setTimeout(() => { bossJustSpawned = false }, 600)
      })
    }
  })

  // Level-up flash + sound
  let prevLevel = player.level
  $effect(() => {
    const lvl = player.level
    if (lvl > untrack(() => prevLevel)) {
      untrack(() => {
        prevLevel = lvl
        levelUpFlash = true
        levelUpTextVisible = true
        playSound('level-up')
        setTimeout(() => { levelUpFlash = false }, 200)
        setTimeout(() => { levelUpTextVisible = false }, 1000)
      })
    }
  })

  // Guard: don't play sounds during initial load
  let soundsReady = false
  $effect(() => {
    const t = setTimeout(() => { soundsReady = true }, 800)
    return () => clearTimeout(t)
  })

  // Kill session counter + death sound
  let prevEnemyHp = combatState.enemyHp
  $effect(() => {
    const hp = combatState.enemyHp
    const eid = combatState.enemyId
    if (hp === 0 && prevEnemyHp > 0) {
      untrack(() => {
        if (soundsReady) playSound('death')
        if (eid) killSessionCounts[eid] = (killSessionCounts[eid] ?? 0) + 1
      })
    }
    prevEnemyHp = hp
  })

  // Floater sounds (hit/crit/player-hit)
  let prevFloaterCount = 0
  $effect(() => {
    const floaters = combatState.floaters
    if (floaters.length > prevFloaterCount) {
      const newOnes = floaters.slice(prevFloaterCount)
      untrack(() => {
        prevFloaterCount = floaters.length
        if (soundsReady) {
          for (const f of newOnes) {
            if (f.side === 'enemy') {
              playSound(f.kind === 'crit' ? 'crit' : 'hit')
            } else if (f.side === 'player' && f.kind === 'hit') {
              playSound('player-hit')
            }
          }
        }
      })
    } else {
      prevFloaterCount = Math.min(prevFloaterCount, floaters.length)
    }
  })

  // Stun sound
  let prevStunCount = 0
  $effect(() => {
    const stunCount = combatState.activeStuns.length
    if (stunCount > prevStunCount && soundsReady) {
      untrack(() => playSound('stun'))
    }
    prevStunCount = stunCount
  })

  // Item drop sound — only for new items added after init
  let prevLootLen = player.lootQueue.length
  $effect(() => {
    const len = player.lootQueue.length
    if (len > prevLootLen && soundsReady) {
      untrack(() => playSound('item-drop'))
    }
    prevLootLen = len
  })

  // First-click audio context init
  $effect(() => {
    const handler = () => { initAudio(); document.removeEventListener('click', handler) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  })
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
  <title>{zone ? zone.label + ' — Wolton Dungeon' : 'Wolton Dungeon — Monkey Barrel'}</title>
  <meta property="og:title" content="Wolton Dungeon">
  <meta property="og:description" content="A pixel art idle RPG. Fight through Brisbane. Take down Fraser. Ascend.">
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="droot">

  <!-- TOP BAR -->
  <div class="topbar">
    <a href="/" class="back-btn" title="Back to Arcade">← HUB</a>
    <div class="logo">⚔ WOLTON <span>DUNGEON</span></div>
    <div class="res-bar">
      <div class="res"><span>🪙</span><span class="res-label">GLD</span><span class="rv">{fmtNum(player.gold)}</span></div>
      <div class="res"><span>🪵</span><span class="res-label">WOOD</span><span class="rv">{player.materials.wood ?? 0}</span></div>
      <div class="res"><span>⛏️</span><span class="res-label">IRON</span><span class="rv">{player.materials.iron ?? 0}</span></div>
      <div class="res"><span>🧪</span><span class="res-label">POT</span><span class="rv">{player.materials.potion ?? 0}</span></div>
      <div class="res"><span>🌿</span><span class="res-label">HERB</span><span class="rv">{player.materials.herbs ?? 0}</span></div>
    </div>
    <div class="zone-tag">ZONE {player.currentZone + 1} -- {zone.label}</div>
    {#if player.prestigeTokens > 0}
      <div class="res prestige-tag"><span style="color:var(--z-accent)">⚡ {player.prestigeTokens}x</span></div>
      <div class="res prestige-mult"><span style="color:#f0c030">x{prestigeMultiplier(player.prestigeTokens).toFixed(1)}</span></div>
    {/if}
    <button class="mute-btn" onclick={() => {
      soundMuted = !soundMuted
      setMuted(soundMuted)
      initAudio()
    }} title={soundMuted ? 'Unmute' : 'Mute'}>
      {soundMuted ? '🔇' : '🔊'}
    </button>
    {#if syncStatus !== 'guest'}
      <div class="sync-indicator sync-{syncStatus}" title={
        syncStatus === 'synced'  ? 'Save synced to cloud' :
        syncStatus === 'saving'  ? 'Saving to cloud...' :
        'Cloud save unavailable — saved locally'
      }>
        {syncStatus === 'offline' ? '☁✕' : '☁'}
      </div>
    {/if}
  </div>

  <!-- GUEST BANNER -->
  {#if showGuestBanner}
    <div class="guest-banner">
      <span>LOG IN TO SAVE YOUR PROGRESS ACROSS DEVICES —</span>
      <a href="/login" class="guest-login-link">LOG IN</a>
      <button class="guest-dismiss" onclick={() => {
        showGuestBanner = false
        sessionStorage.setItem('dungeon-guest-dismissed', '1')
      }}>✕</button>
    </div>
  {/if}

  <!-- MAIN GRID -->
  <div class="mgrid">

    <!-- LEFT: PLAYER PANEL -->
    <div class="panel ppanel" class:mobile-hidden={mobileTab !== 'player'}>
      <div class="ptitle">▶ PLAYER</div>

      <div class="sprite-wrap">
        <div class="bigsprite">{combatState.playerDead ? '💀' : '🧙'}</div>
      </div>
      <div class="pname">{player.name}</div>
      <div class="pclass">CONSULTANT LVL {player.level}</div>

      <div class="bgrp">
        <div class="blbl"><span>HP</span><span style="color:#40c060">{player.hp}/{player.maxHp}</span></div>
        <div class="btrack"><div class="bfill hpf" style="width:{hpPct}%"></div></div>
      </div>
      <div class="bgrp">
        <div class="blbl"><span>XP</span><span style="color:var(--z-accent2)">{player.xp}/{player.xpToNext}</span></div>
        <div class="btrack"><div class="bfill xpf" style="width:{xpPct}%"></div></div>
      </div>

      <div class="ptitle">▶ GEAR</div>
      <div class="gear-row">
        {#each (['weapon','armour','helmet','ring','amulet'] as ItemSlot[]) as slot}
          {@const equipped = player.gear[slot]}
          <div class="gslot {equipped ? 'filled' : ''}" title={slot.toUpperCase()} onclick={() => equipModalSlot = slot}>
            {#if equipped}
              {equipped.sprite}
            {:else}
              <span class="gem">○</span>
            {/if}
          </div>
        {/each}
      </div>

      <div class="ptitle">▶ STATS</div>
      <div class="sgrp-lbl">▶ COMBAT</div>
      <div class="sgrid">
        {#each STAT_ROWS.filter(r => r.group === 'combat') as row}
          {@const flat = gearFlatBonus(row.key)}
          {@const pct = gearPercentBonus(row.key)}
          {@const eff = getEffectiveStats(player)[row.key]}
          <div class="sbox" title={row.desc}>
            <span class="si">{row.icon}</span>
            <span class="sn">{row.short}</span>
            <span class="sv">
              {row.key === 'critDmg' ? `${eff}%` : `${eff}${row.unit}`}
              {#if flat > 0}<span class="sgear"> +{flat}</span>{/if}
              {#if pct > 0}<span class="sgear-pct"> +{pct}%</span>{/if}
            </span>
          </div>
        {/each}
      </div>
      <div class="sgrp-lbl">▶ PASSIVE</div>
      <div class="sgrid">
        {#each STAT_ROWS.filter(r => r.group === 'passive') as row}
          {@const flat = gearFlatBonus(row.key)}
          {@const pct = gearPercentBonus(row.key)}
          {@const eff = getEffectiveStats(player)[row.key]}
          <div class="sbox" title={row.desc}>
            <span class="si">{row.icon}</span>
            <span class="sn">{row.short}</span>
            <span class="sv">
              {eff}{row.unit}
              {#if flat > 0}<span class="sgear"> +{flat}</span>{/if}
              {#if pct > 0}<span class="sgear-pct"> +{pct}%</span>{/if}
            </span>
          </div>
        {/each}
      </div>

      <button class="upbtn" onclick={() => showUpgradeModal = true}>⬆ UPGRADE STATS</button>

      {#if canPrestige()}
        <button class="upbtn prestige-btn active" onclick={() => showPrestigeModal = true}>⚡ ASCEND (+10% PERMANENT)</button>
      {:else}
        <button class="upbtn prestige-btn locked" disabled title="Defeat Fraser to unlock">⚡ ASCEND (LOCKED)</button>
      {/if}

      <div class="icon-btns">
        <button class="icon-btn" onclick={() => showAchModal = true} title="Achievements">🎖️</button>
        <button class="icon-btn" onclick={() => showStatsModal = true} title="Stats">📊</button>
        <button class="icon-btn" onclick={() => showLeaderboard = true} title="Leaderboard">🏆</button>
      </div>
    </div>

    <!-- CENTER: COMBAT PANEL -->
    <div class="panel cpanel">
      <div class="scene" class:boss-border={isAnyBoss} class:nick-void={combatState.inNickFight} class:zone-transitioning={zoneTransitioning}>
        <canvas bind:this={canvasEl} class="scene-bg"></canvas>
        {#if combatState.inNickFight}
          <div class="nick-stars"></div>
          <div class="nick-watermark">MONKEY BARREL</div>
        {/if}

        <div class="particles">
          {#each particles as p (p.left + p.bottom)}
            <div class="particle" style="width:{p.size}px;height:{p.size}px;background:{p.color};left:{p.left}%;bottom:{p.bottom}%;--dy:{p.dy}px;--dx:{p.dx}px;animation-duration:{p.duration}ms;animation-delay:{p.delay}ms;opacity:0;"></div>
          {/each}
        </div>

        <div class="ground-plane"></div>

        <!-- Player fighter -->
        <div class="fighter pl">
          <div class="finfo">
            <div class="fname">{player.name}</div>
            <div class="hpmini"><div class="hpmf p" style="width:{hpPct}%"></div></div>
          </div>
          <div class="fsprite" class:stunned-sprite={isPlayerStunned}>
            {combatState.playerDead ? '💀' : '🧙'}
            {#if isPlayerStunned}<div class="stun-overlay">STUNNED</div>{/if}
          </div>
        </div>

        <div class="slash"></div>

        <!-- Damage floaters -->
        {#each combatState.floaters as f (f.id)}
          <span class="dfloat df-{f.kind} df-{f.side}">{f.text}</span>
        {/each}

        <!-- Enemy fighter -->
        <div class="fighter en">
          {#if combatState.bossStatusIcons.length > 0}
            <div class="boss-icons">{combatState.bossStatusIcons.join(' ')}</div>
          {/if}
          {#if isBossFight}
            <div class="boss-tag">BOSS</div>
          {:else if isMinibosFight}
            <div class="boss-tag miniboss-tag">MINIBOSS</div>
          {/if}
          <div class="finfo">
            <div class="fname enemy">{combatState.enemyName}</div>
            {#if killSessionCounts[combatState.enemyId]}
              <div class="kill-count">Killed: {killSessionCounts[combatState.enemyId]}</div>
            {/if}
            <div class="hpmini"><div class="hpmf e {isAnyBoss ? 'boss-hp' : ''}" style="width:{enmHpPct}%"></div></div>
          </div>
          <div class="fsprite en-spr" class:boss-spawning={bossJustSpawned}>{combatState.enemySprite}</div>
        </div>

        <div class="zlabel" class:boss-label={isAnyBoss}>{isAnyBoss ? combatState.enemyName : zone.label}</div>

        <!-- Hidden door -- appears after zone 9 boss defeated -->
        {#if player.fraserDefeated && player.currentZone === 8 && combatState.enemyHp <= 0 && !combatState.inNickFight && !combatState.nickVictory}
          <button class="nick-door" onclick={() => startNickFight()} title="...">🚪</button>
        {/if}

        <!-- Speed toggle -->
        <button class="speed-btn" onclick={() => combatSpeed = combatSpeed === 1 ? 2 : 1}>
          {combatSpeed === 1 ? '▶ 1x' : '▶▶ 2x'}
        </button>
      </div>

      <!-- Combat log -->
      <div class="clog">
        {#each combatState.log as entry}
          <div class="ll {entry.type}">{entry.message}</div>
        {/each}
      </div>

      <!-- Stage bar -->
      <div class="stagebar">
        <div class="stagebar-top">
          <span class="slbl">ZONE PROGRESS</span>
          <div class="strack"><div class="sfill" style="width:{stagePct}%"></div></div>
          <span class="scnt">{player.currentStage} / {STAGES_PER_ZONE}</span>
        </div>
        <div class="zone-dots">
          {#each ZONES as _z, i}
            {#if i <= player.unlockedZones + 1}
              <div class="zdot {player.currentZone === i ? 'zd-active' : (i < player.currentZone ? 'zd-done' : 'zd-locked')}" title="Z{i+1}: {ZONES[i].label}"></div>
            {/if}
          {/each}
        </div>
      </div>

      <!-- Zone navigator -->
      <div class="znav">
        <span class="znlbl">ZONES</span>
        <div class="zn-scroll">
          {#each ZONES as z, i}
            {#if i <= player.unlockedZones + 1}
              {@const bossLocked = i > player.unlockedZones}
              {@const lvlReq = ZONE_LEVEL_REQUIREMENTS[i] ?? 0}
              {@const lvlLocked = player.level < lvlReq}
              {@const locked = bossLocked || lvlLocked}
              {@const active = player.currentZone === i}
              <button
                class="zn-btn {active ? 'active' : ''} {locked ? 'locked' : ''}"
                onclick={() => doTravelToZone(i)}
                title={locked ? (lvlLocked ? `LV${lvlReq} required` : '🔒 LOCKED') : z.label}
              >{#if locked}{#if lvlLocked && !bossLocked}LV{lvlReq}{:else}🔒{/if}{:else}{i + 1}{/if}</button>
            {/if}
          {/each}
        </div>
        {#if zoneLockMsg}
          <div class="zone-lock-msg">{zoneLockMsg}</div>
        {/if}
      </div>
    </div>

    <!-- MOBILE TAB BAR -->
    <div class="mobile-tabs">
      <button class="mob-tab {mobileTab === 'player' ? 'active' : ''}" onclick={() => mobileTab = 'player'}>PLAYER</button>
      <button class="mob-tab {mobileTab === 'shop' ? 'active' : ''}" onclick={() => mobileTab = 'shop'}>
        SHOP{#if player.lootQueue.length > 0}<span class="tab-badge">{player.lootQueue.length}</span>{/if}
      </button>
      <button class="mob-tab {mobileTab === 'timers' ? 'active' : ''}" onclick={() => mobileTab = 'timers'}>TIMERS</button>
    </div>

    <!-- RIGHT: SHOP PANEL -->
    <div class="panel rpanel" class:mobile-hidden={mobileTab !== 'shop'}>
      <div class="ptitle">▶ SHOP</div>
      <div class="tabs">
        <button class="tab {activeTab === 'upgrades' ? 'active' : ''}" onclick={() => activeTab = 'upgrades'}>UPGRADES</button>
        <button class="tab {activeTab === 'gear' ? 'active' : ''}" onclick={() => activeTab = 'gear'}>
          GEAR{#if player.lootQueue.length > 0}<span class="tab-badge">{player.lootQueue.length}</span>{/if}
        </button>
        <button class="tab {activeTab === 'items' ? 'active' : ''}" onclick={() => activeTab = 'items'}>ITEMS</button>
      </div>

      {#if activeTab === 'upgrades'}
        {#each STAT_ROWS as row}
          {@const cost = upgradeCost(row.key, player.statLevels[row.key])}
          {@const can  = player.gold >= cost}
          <div class="shopitem">
            <div class="sit">
              <span class="sii">{row.icon}</span>
              <div class="sinf"><div class="sn">{row.name}</div><div class="sd">{row.desc}</div></div>
              <span class="slv">LV{player.statLevels[row.key]}</span>
            </div>
            <div class="sic">
              <span class="sprice">🪙 {cost.toLocaleString()}</span>
              <button class="sbuy {can ? '' : 'cant'}" onclick={() => upgradeStats(row.key)}>BUY</button>
            </div>
          </div>
        {/each}

      {:else if activeTab === 'gear'}
        <!-- Sub-tab bar -->
        <div class="gear-subtabs">
          <button class="gsub {gearSubTab === 'loadout' ? 'active' : ''}" onclick={() => gearSubTab = 'loadout'}>LOADOUT</button>
          <button class="gsub {gearSubTab === 'loot' ? 'active' : ''}" onclick={() => gearSubTab = 'loot'}>LOOT{#if player.lootQueue.length > 0} [{player.lootQueue.length}]{/if}</button>
          <button class="gsub {gearSubTab === 'crafting' ? 'active' : ''}" onclick={() => gearSubTab = 'crafting'}>CRAFT</button>
          <button class="gsub {gearSubTab === 'reroll' ? 'active' : ''}" onclick={() => gearSubTab = 'reroll'}>REROLL</button>
        </div>

        {#if gearSubTab === 'loadout'}
          <!-- Gear slots row -->
          <div class="gs-row">
            {#each (['weapon','armour','helmet','ring','amulet'] as ItemSlot[]) as slot}
              {@const eq = player.gear[slot]}
              <div class="gs-slot {eq ? 'filled' : ''}" onclick={() => equipModalSlot = slot} title={slot.toUpperCase()}>
                {#if eq}
                  <span class="gs-spr">{eq.sprite}</span>
                  <div class="gs-rar" style="background:{rarityColor(eq.rarity)}"></div>
                {:else}
                  <span class="gs-empty">○</span>
                {/if}
                <div class="gs-lbl">{slot.slice(0, 3).toUpperCase()}</div>
              </div>
            {/each}
          </div>
          {#each (['weapon','armour','helmet','ring','amulet'] as ItemSlot[]) as slot}
            {@const eq = player.gear[slot]}
            {#if eq}
              <div class="lq-card">
                <div class="lq-top">
                  <span class="lq-spr">{eq.sprite}</span>
                  <div class="lq-inf">
                    <div class="lq-nm" style="color:{rarityColor(eq.rarity)}">{eq.name}{#if eq.rarity === 'boss_unique'}<span class="unique-badge"> ★UNIQUE</span>{/if}</div>
                    <div class="lq-st">{formatStatBonuses(eq)}</div>
                    {#if eq.rolledBonuses && eq.rolledBonuses.length > 0}
                      <div class="lq-rolls">{eq.rolledBonuses.map(r => r.label).join(' ')}</div>
                    {/if}
                    {#if eq.lore}<div class="item-lore">{eq.lore}</div>{/if}
                  </div>
                </div>
              </div>
            {:else}
              <div class="stub">{slot.toUpperCase()} — EMPTY</div>
            {/if}
          {/each}

        {:else if gearSubTab === 'loot'}
          {#if player.lootQueue.length === 0}
            <div class="stub">NO PENDING LOOT</div>
          {:else}
            {#each sortedLootQueue as item, idx (item.instanceId ?? idx)}
              <div class="lq-card">
                <div class="lq-top">
                  <span class="lq-spr">{item.sprite}</span>
                  <div class="lq-inf">
                    <div class="lq-nm" style="color:{rarityColor(item.rarity)}">{item.name}{#if item.rarity === 'boss_unique'}<span class="unique-badge"> ★UNIQUE</span>{/if}</div>
                    <div class="lq-st">{formatStatBonuses(item)}</div>
                    {#if item.rolledBonuses && item.rolledBonuses.length > 0}
                      <div class="lq-rolls">{item.rolledBonuses.map(r => r.label).join(' ')}</div>
                    {/if}
                    {#if item.lore}<div class="item-lore">{item.lore}</div>{/if}
                  </div>
                </div>
                <div class="lq-btns">
                  <button class="lq-btn eq" onclick={() => equipFromLootQueue(item)}>EQUIP</button>
                  {#if item.discardable !== false}
                    {#if ['rare', 'epic'].includes(item.rarity) && discardConfirmItem === item}
                      <button class="lq-btn dc confirm" onclick={() => { discardFromLootQueue(item); discardConfirmItem = null }}>CONFIRM?</button>
                    {:else if ['rare', 'epic'].includes(item.rarity)}
                      <button class="lq-btn dc" onclick={() => {
                        discardConfirmItem = item
                        if (discardConfirmTimeout) clearTimeout(discardConfirmTimeout)
                        discardConfirmTimeout = setTimeout(() => { discardConfirmItem = null }, 2000)
                      }}>+{DISCARD_GOLD[item.rarity] ?? 10}g</button>
                    {:else}
                      <button class="lq-btn dc" onclick={() => discardFromLootQueue(item)}>+{DISCARD_GOLD[item.rarity] ?? 10}g</button>
                    {/if}
                  {:else}
                    <span class="keep-badge">🔒 KEEP</span>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}

        {:else if gearSubTab === 'crafting'}
          <!-- Materials sidebar -->
          <div class="mat-sidebar">
            {#each Object.entries(MATERIAL_TIERS) as [mat, info]}
              {@const qty = player.materials[mat] ?? 0}
              <div class="mat-chip {qty === 0 ? 'zero' : ''}">
                <span>{info.sprite}</span>
                <span>{info.name}</span>
                <span class="mat-qty">×{qty}</span>
              </div>
            {/each}
          </div>
          <div class="craft-luck-hint">🍀 LUCK BONUS: +{luckBonusPct()}% — CHANCE OF BONUS ROLLS</div>
          {#each CRAFT_RECIPES.filter(r => player.level >= r.unlockLevel) as recipe}
            {@const item = ITEMS[recipe.itemId]}
            {@const affordable = canAffordCraft(recipe)}
            {#if item}
              <div class="craft-card {affordable ? '' : 'ca'}">
                <div class="cc-top">
                  <span class="cc-spr">{item.sprite}</span>
                  <div class="cc-inf">
                    <div class="cc-nm" style="color:{rarityColor(item.rarity)}">{item.name}</div>
                    <div class="cc-st">{formatStatBonuses(item)}</div>
                  </div>
                </div>
                <div class="cc-cost">
                  {#each Object.entries(recipe.materials) as [mat, amt]}
                    <span class="cc-mat {(player.materials[mat] ?? 0) >= amt ? '' : 'miss'}">{matLabel(mat)}:{amt}</span>
                  {/each}
                  <span class="cc-mat {player.gold >= recipe.gold ? '' : 'miss'}">🪙{recipe.gold}</span>
                </div>
                <button class="cc-btn {affordable ? '' : 'cant'}" onclick={() => doCraft(recipe)}>CRAFT</button>
              </div>
            {/if}
          {:else}
            <div class="stub">REACH LVL 1 TO UNLOCK</div>
          {/each}

        {:else if gearSubTab === 'reroll'}
          {#each (['weapon','armour','helmet','ring','amulet'] as ItemSlot[]) as slot}
            {@const eq = player.gear[slot]}
            {#if eq}
              <div class="lq-card">
                <div class="lq-top">
                  <span class="lq-spr">{eq.sprite}</span>
                  <div class="lq-inf">
                    <div class="lq-nm" style="color:{rarityColor(eq.rarity)}">{eq.name}{#if (eq.rerollCount ?? 0) > 0}<span class="reroll-badge"> REROLLED x{eq.rerollCount}</span>{/if}</div>
                    <div class="lq-st">{formatStatBonuses(eq)}</div>
                    {#if eq.rolledBonuses && eq.rolledBonuses.length > 0}
                      <div class="lq-rolls">{eq.rolledBonuses.map(r => r.label).join(' ')}</div>
                    {/if}
                  </div>
                </div>
                {#if eq.rarity !== 'boss_unique'}
                  {@const cost = rerollCost(eq)}
                  {@const canRR = canAffordReroll(eq)}
                  <div class="reroll-cost">
                    <span>REROLL: 🪙{cost.gold}</span>
                    {#each Object.entries(cost.materials) as [mat, amt]}
                      <span class="{(player.materials[mat] ?? 0) >= amt ? '' : 'miss'}">{matLabel(mat)}:{amt}</span>
                    {/each}
                  </div>
                  {#if rerollConfirmItem === eq}
                    <button class="cc-btn confirm-reroll {canRR ? '' : 'cant'}" onclick={() => { doReroll(eq); rerollConfirmItem = null }}>CONFIRM?</button>
                  {:else}
                    <button class="cc-btn {canRR ? '' : 'cant'}" onclick={() => {
                      rerollConfirmItem = eq
                      if (rerollConfirmTimeout) clearTimeout(rerollConfirmTimeout)
                      rerollConfirmTimeout = setTimeout(() => { rerollConfirmItem = null }, 2000)
                    }}>REROLL</button>
                  {/if}
                {:else}
                  <div class="reroll-cost"><span class="keep-badge">🔒 BOSS UNIQUE — CANNOT REROLL</span></div>
                {/if}
              </div>
            {/if}
          {/each}
          {#if !Object.values(player.gear).some(Boolean)}
            <div class="stub">NO GEAR EQUIPPED</div>
          {/if}
        {/if}

      {:else}
        <div class="stub">COMING SOON</div>
        <div class="stub" style="margin-top:2px;font-size:5px;color:#222">CONSUMABLES — PROMPT 3</div>
      {/if}
    </div>

    <!-- TIMER BAR -->
    <div class="panel tbar" class:mobile-hidden={mobileTab !== 'timers'}>
      <span class="tlbl">ACTIVITIES ▶</span>
      <button
        class="auto-btn {autoCollect ? 'on' : ''}"
        onclick={() => autoCollect = !autoCollect}
        title="Auto-collect timers"
      >AUTO: {autoCollect ? 'ON' : 'OFF'}</button>
      {#each ACTIVITIES as act}
        {@const d = td(act.id, now)}
        {@const locked = player.level < act.unlockLevel}
        <div
          class="tcard {d.run ? 'run' : ''} {d.rdy ? 'rdy' : ''} {locked ? 'lck' : ''}"
          onclick={() => onTimerClick(act.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && onTimerClick(act.id)}
        >
          {#if d.rdy}<span class="cbadge">!</span>{/if}
          <div class="ttop">
            <span class="tic">{act.sprite}</span>
            <span class="tn">{act.name}</span>
            <span class="tr">+{act.reward.amount} {act.reward.material}</span>
          </div>
          <div class="ttrack"><div class="tfill {d.rdy ? 'done' : ''}" style="width:{d.prog}%"></div></div>
          <div class="ttime {d.rdy ? 'd' : ''}">
            {#if locked}LVL {act.unlockLevel}
            {:else if d.rdy}COLLECT!
            {:else if d.run}{formatMs(d.rem)} · {Math.round(d.prog)}%
            {:else}START
            {/if}
          </div>
        </div>
      {/each}
    </div>

  </div><!-- /mgrid -->
</div><!-- /droot -->

<!-- UPGRADE MODAL -->
{#if showUpgradeModal}
  <div class="moverlay" onclick={() => showUpgradeModal = false} role="dialog" aria-modal="true">
    <div class="mbox" onclick={(e) => e.stopPropagation()}>
      <div class="mhdr">
        <span class="mtitle">⬆ UPGRADE STATS</span>
        <span class="mgold">🪙 {fmtNum(player.gold)}</span>
        <button class="mclose" onclick={() => showUpgradeModal = false}>✕</button>
      </div>
      <div class="mgrp-lbl">▶ COMBAT</div>
      {#each STAT_ROWS.filter(r => r.group === 'combat') as row}
        {@const lvl  = player.statLevels[row.key]}
        {@const cur  = player.stats[row.key]}
        {@const nxt  = statValue(row.key, lvl + 1)}
        {@const cost = upgradeCost(row.key, lvl)}
        {@const can  = player.gold >= cost}
        <div class="mrow">
          <span class="micon">{row.icon}</span>
          <div class="minfo">
            <div class="mn">{row.name}</div>
            <div class="mv">
              {#if row.key === 'critDmg'}
                {(cur/100).toFixed(2)}x <span>→</span> <span class="mnxt">{(nxt/100).toFixed(2)}x</span>
              {:else}
                {cur}{row.unit} <span>→</span> <span class="mnxt">{nxt}{row.unit}</span>
              {/if}
            </div>
          </div>
          <span class="mcost">🪙 {cost.toLocaleString()}</span>
          <button class="mbtn {can ? '' : 'cant'}" onclick={() => upgradeStats(row.key)}>UP</button>
        </div>
      {/each}
      <div class="mgrp-lbl">▶ PASSIVE</div>
      {#each STAT_ROWS.filter(r => r.group === 'passive') as row}
        {@const lvl  = player.statLevels[row.key]}
        {@const cur  = player.stats[row.key]}
        {@const nxt  = statValue(row.key, lvl + 1)}
        {@const cost = upgradeCost(row.key, lvl)}
        {@const can  = player.gold >= cost}
        {@const isUnlock = lvl === 0 && cur === 0}
        <div class="mrow">
          <span class="micon">{row.icon}</span>
          <div class="minfo">
            <div class="mn">{row.name}</div>
            <div class="mv">{cur}{row.unit} <span>→</span> <span class="mnxt">{nxt}{row.unit}</span></div>
          </div>
          <span class="mcost">🪙 {cost.toLocaleString()}</span>
          <button class="mbtn {can ? '' : 'cant'}" onclick={() => upgradeStats(row.key)}>{isUnlock ? 'UNLOCK' : 'UP'}</button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<!-- EQUIP MODAL -->
{#if equipModalSlot}
  <div class="moverlay" onclick={() => equipModalSlot = null} role="dialog" aria-modal="true">
    <div class="mbox ebox" onclick={(e) => e.stopPropagation()}>
      <div class="mhdr">
        <span class="mtitle">{equipModalSlot.toUpperCase()} SLOT</span>
        <button class="mclose" onclick={() => equipModalSlot = null}>✕</button>
      </div>

      <div class="eslbl">EQUIPPED</div>
      {#if player.gear[equipModalSlot]}
        {@const equipped = player.gear[equipModalSlot]!}
        <div class="eloot-item">
          <span class="lq-spr">{equipped.sprite}</span>
          <div class="lq-inf">
            <div class="lq-nm" style="color:{rarityColor(equipped.rarity)}">{equipped.name}</div>
            <div class="lq-st">{formatStatBonuses(equipped)}</div>
          </div>
        </div>
      {:else}
        <div class="eempty">EMPTY SLOT</div>
      {/if}

      <div class="eslbl" style="margin-top:8px">FROM LOOT QUEUE</div>
      {#each sortedLootQueue.filter(i => i.slot === equipModalSlot) as item, idx (idx)}
        <div class="eloot-item clickable" onclick={() => { equipFromLootQueue(item); equipModalSlot = null }}>
          <span class="lq-spr">{item.sprite}</span>
          <div class="lq-inf">
            <div class="lq-nm" style="color:{rarityColor(item.rarity)}">{item.name}</div>
            <div class="lq-st">{formatStatBonuses(item)}</div>
          </div>
          <span class="eequip-hint">EQUIP</span>
        </div>
      {:else}
        <div class="eempty">NO ITEMS IN LOOT QUEUE</div>
      {/each}
    </div>
  </div>
{/if}

<!-- STORY MODAL -->
{#if showStoryModal}
  <div class="soverlay" onclick={() => showStoryModal = false} role="dialog" aria-modal="true">
    <div class="sbox">
      <div class="szone">ZONE {player.currentZone + 1} -- {zone.label}</div>
      {#each storyText as line}
        <div class="stxt">{line}</div>
      {/each}
      <div class="shint">[ CLICK TO CONTINUE ]</div>
    </div>
  </div>
{/if}

<!-- PRESTIGE MODAL -->
{#if showPrestigeModal}
  <div class="moverlay" onclick={() => showPrestigeModal = false} role="dialog" aria-modal="true">
    <div class="mbox" onclick={(e) => e.stopPropagation()}>
      <div class="mhdr">
        <span class="mtitle">⚡ ASCEND?</span>
        <button class="mclose" onclick={() => showPrestigeModal = false}>✕</button>
      </div>
      <div class="prestige-body">
        <p>All progress resets. Stats, gear, zones and gold are lost forever.</p>
        <p>You keep: <span style="color:var(--z-accent)">Prestige Tokens</span>. Next run is 10% faster.</p>
        <div class="prestige-info">
          <div class="pi-row"><span>Current tokens:</span><span style="color:var(--z-accent)">⚡ {player.prestigeTokens}</span></div>
          <div class="pi-row"><span>After ascend:</span><span style="color:var(--z-accent)">⚡ {player.prestigeTokens + 1}</span></div>
          <div class="pi-row"><span>New multiplier:</span><span style="color:#f0c030">x{prestigeMultiplier(player.prestigeTokens + 1).toFixed(1)}</span></div>
        </div>
      </div>
      <div class="prestige-btns">
        <button class="mbtn prestige-confirm" onclick={doPrestige}>ASCEND</button>
        <button class="mbtn" onclick={() => showPrestigeModal = false}>CANCEL</button>
      </div>
    </div>
  </div>
{/if}

<!-- ACHIEVEMENT MODAL -->
{#if showAchModal}
  <div class="moverlay" onclick={() => showAchModal = false} role="dialog" aria-modal="true">
    <div class="mbox ach-box" onclick={(e) => e.stopPropagation()}>
      <div class="mhdr">
        <span class="mtitle">🏆 ACHIEVEMENTS</span>
        <span class="mgold">{player.achievements.length} / {ACHIEVEMENTS.length}</span>
        <button class="mclose" onclick={() => showAchModal = false}>✕</button>
      </div>
      <div class="ach-grid">
        {#each ACHIEVEMENTS as ach}
          {@const unlocked = player.achievements.includes(ach.id)}
          <div class="ach-card {unlocked ? 'unlocked' : 'locked'}">
            <span class="ach-spr">{unlocked ? ach.sprite : '❓'}</span>
            <div class="ach-info">
              <div class="ach-name">{unlocked ? ach.name : '???'}</div>
              <div class="ach-desc">{unlocked ? ach.desc : '???'}</div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- STATS MODAL -->
{#if showStatsModal}
  <div class="moverlay" onclick={() => showStatsModal = false} role="dialog" aria-modal="true">
    <div class="mbox" onclick={(e) => e.stopPropagation()}>
      <div class="mhdr">
        <span class="mtitle">📊 LIFETIME STATS</span>
        <button class="mclose" onclick={() => showStatsModal = false}>✕</button>
      </div>
      <div class="stats-grid">
        <div class="stat-row"><span>Enemies killed</span><span>{fmtNum(player.lifetimeStats.enemiesKilled)}</span></div>
        <div class="stat-row"><span>Gold earned</span><span>{fmtNum(player.lifetimeStats.goldEarned)}</span></div>
        <div class="stat-row"><span>Bosses defeated</span><span>{fmtNum(player.lifetimeStats.bossesDefeated)}</span></div>
        <div class="stat-row"><span>Items looted</span><span>{fmtNum(player.lifetimeStats.itemsLooted)}</span></div>
        <div class="stat-row"><span>Times prestige'd</span><span>{player.lifetimeStats.timesPrestiged}</span></div>
        <div class="stat-row"><span>Total playtime</span><span>{formatDuration(player.lifetimeStats.totalPlaytime)}</span></div>
        <div class="stat-row snarky"><span>Times Fraser has been embarrassed</span><span>{player.lifetimeStats.fraserKills}</span></div>
      </div>

      <!-- RESET SAVE -->
      <div class="reset-section">
        {#if !showResetConfirm}
          <button class="reset-btn" onclick={() => { showResetConfirm = true; resetConfirmText = '' }}>
            RESET SAVE
          </button>
        {:else}
          <div class="reset-confirm">
            <div class="reset-warn">Type RESET to confirm — this cannot be undone.</div>
            <input
              class="reset-input"
              type="text"
              placeholder="RESET"
              bind:value={resetConfirmText}
            />
            <div class="reset-actions">
              <button class="reset-cancel" onclick={() => { showResetConfirm = false; resetConfirmText = '' }}>CANCEL</button>
              <button
                class="reset-confirm-btn"
                disabled={resetConfirmText !== 'RESET'}
                onclick={async () => {
                  if (resetConfirmText !== 'RESET') return
                  await deleteCloudSave()
                  localStorage.removeItem('wolton-dungeon-player')
                  localStorage.removeItem('wolton-dungeon-timers')
                  location.reload()
                }}
              >CONFIRM RESET</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- OFFLINE EARNINGS MODAL -->
{#if showOfflineModal}
  {@const offEarn = getOfflineEarnings()}
  {#if offEarn}
    <div class="moverlay" onclick={() => { showOfflineModal = false; clearOfflineEarnings(); playSound('gold') }} role="dialog" aria-modal="true">
      <div class="mbox" onclick={(e) => e.stopPropagation()}>
        <div class="mhdr">
          <span class="mtitle">WELCOME BACK</span>
        </div>
        <div class="offline-body">
          <div class="offline-time">Away for {formatDuration(offEarn.timeAway)}</div>
          {#if offEarn.capped}
            <div class="offline-cap">Offline cap reached (8h). Upgrade to extend.</div>
          {/if}
          {#each offEarn.completedTimers as name}
            <div class="offline-item">Completed: {name}</div>
          {/each}
          {#each offEarn.materialRewards as r}
            <div class="offline-item">+{r.amount} {r.name}</div>
          {/each}
          {#if offEarn.patrolGold > 0}
            <div class="offline-item gold">+{offEarn.patrolGold} gold from patrol</div>
          {/if}
        </div>
        <button class="mbtn collect-btn" onclick={() => { showOfflineModal = false; clearOfflineEarnings(); playSound('gold') }}>COLLECT</button>
      </div>
    </div>
  {/if}
{/if}

<!-- ACHIEVEMENT TOASTS -->
<div class="toast-container">
  {#each achToasts as toast (toast.ts)}
    <div class="ach-toast">
      <span class="toast-spr">{toast.sprite}</span>
      <div class="toast-info">
        <div class="toast-label">Achievement Unlocked</div>
        <div class="toast-name">{toast.name}</div>
      </div>
    </div>
  {/each}
</div>

<!-- LEADERBOARD MODAL -->
{#if showLeaderboard}
  <div class="moverlay" onclick={() => showLeaderboard = false} role="dialog" aria-modal="true">
    <div class="mbox lb-modal" onclick={(e) => e.stopPropagation()}>
      <div class="mhdr">
        <span class="mtitle">🏆 LEADERBOARD</span>
        <button class="mclose" onclick={() => showLeaderboard = false}>✕</button>
      </div>
      <div class="lb-tabs">
        {#each LB_TABS as t}
          <button class="lb-tab {lbTab === t.id ? 'active' : ''}" onclick={() => lbTab = t.id}>{t.label}</button>
        {/each}
      </div>

      {#if lbLoading && lbData[lbTab].length === 0}
        <div class="lb-loading">FETCHING DATA...</div>
      {:else if lbError}
        <div class="lb-error">COULD NOT REACH SERVER</div>
      {:else}
        <div class="lb-list">
          {#each lbData[lbTab] as entry}
            <div class="lb-row">
              <span class="lb-rank {rankClass(entry.rank)}">{entry.rank}</span>
              <span class="lb-name">{entry.playerName}</span>
              <span class="lb-icons">{entry.prestigeTokens > 0 ? '⚡' : ''}{entry.nickDefeated ? '💀' : ''}</span>
              <span class="lb-stat">{lbStatLabel(entry, lbTab)}</span>
              <span class="lb-time">{lbTimeAgo(entry.updatedAt)}</span>
            </div>
          {:else}
            <div class="lb-loading">NO ENTRIES YET</div>
          {/each}
        </div>
        {#if lbMyRank[lbTab] !== null}
          <div class="lb-my-rank">YOUR RANK: #{lbMyRank[lbTab]}</div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<!-- CRAFT RESULT OVERLAY -->
{#if showCraftResult && craftResult}
  {@const cr = craftResult}
  <div
    class="craft-overlay {cr.rollQuality === 'perfect' ? 'perfect-flash' : ''}"
    onclick={dismissCraftOverlay}
    role="dialog"
    aria-modal="true"
  >
    <div class="craft-result-box" onclick={(e) => e.stopPropagation()}>
      <div class="cr-sprite">{cr.item.sprite}</div>
      <div class="cr-name" style="color:{rarityColor(cr.item.rarity)}">{cr.item.name}</div>
      <div class="cr-quality-badge" style="color:{QUALITY_COLOR[cr.rollQuality]}">{cr.rollQuality.toUpperCase()}</div>
      <div class="cr-base">
        {#each Object.entries(cr.item.statBonuses).filter(([, v]) => v?.flat) as [stat, bonus]}
          <div class="cr-stat-row base-stat">+{bonus!.flat} {stat.toUpperCase()}</div>
        {/each}
      </div>
      {#if cr.bonusRolls.length > 0}
        <div class="cr-rolls-label">BONUS ROLLS</div>
        {#each cr.bonusRolls as roll}
          <div class="cr-stat-row rolled-stat">{roll.label}</div>
        {/each}
      {:else}
        <div class="cr-no-rolls">No bonus rolls this time.</div>
      {/if}
      {#if pendingDropResults.length > 0}
        <div class="cr-queue-hint">{pendingDropResults.length} more pending</div>
      {/if}
      <button class="cr-collect-btn" onclick={dismissCraftOverlay}>COLLECT</button>
    </div>
  </div>
{/if}

<!-- BOSS DEATH OVERLAY -->
{#if showBossDeathOverlay && combatState.bossDeathText}
  <div class="boss-death-overlay" onclick={() => { showBossDeathOverlay = false; combatState.bossDeathText = null }}>
    <div class="bdo-box">
      {#each combatState.bossDeathText as line, i}
        <div class="bdo-line" class:bdo-sub={i > 0}>{line}</div>
      {/each}
      <div class="bdo-hint">[ CLICK TO CONTINUE ]</div>
    </div>
  </div>
{/if}

<!-- VICTORY SCREEN -->
{#if showVictoryScreen}
  <div class="victory-overlay" onclick={() => showVictoryScreen = false}>
    <div class="vic-box">
      <div class="vic-title">WOLTON DUNGEON</div>
      <div class="vic-sub">COMPLETE</div>
      <div class="vic-line">Fraser closes his laptop for the last time.</div>
      <div class="vic-line">Wolton Industries stock price: $0.00</div>
      <div class="vic-line" style="margin-top:8px;color:#f0c030">You charge $80/hr.</div>
      <div class="vic-line" style="color:#f0c030">You did this for free.</div>
      <div class="vic-hint">[ CLICK TO CONTINUE ]</div>
    </div>
  </div>
{/if}

<!-- NICK VICTORY OVERLAY -->
{#if showNickVictory}
  <div class="victory-overlay nick-victory" onclick={() => { showNickVictory = false; combatState.nickVictory = false }}>
    <div class="vic-box">
      <div class="vic-title" style="color:#fff">YOU BEAT THE GUY</div>
      <div class="vic-title" style="color:#fff">WHO MADE THIS GAME.</div>
      <div class="vic-sub" style="color:#888">He's not happy about it.</div>
      <div class="vic-hint">[ CLICK TO CONTINUE ]</div>
    </div>
  </div>
{/if}

<!-- LEVEL UP FLASH -->
{#if levelUpFlash}
  <div class="levelup-flash"></div>
{/if}
{#if levelUpTextVisible}
  <div class="levelup-text">LEVEL UP!</div>
{/if}

<!-- PRESTIGE FLASH -->
{#if prestigeFlash}
  <div class="prestige-flash"></div>
{/if}

<!-- TUTORIAL OVERLAY -->
{#if showTutorial}
  <div class="moverlay tutorial-overlay" role="dialog" aria-modal="true">
    <div class="mbox tutorial-box" onclick={(e) => e.stopPropagation()}>
      {#if tutorialSlide === 0}
        <div class="tut-title">WOLTON DUNGEON</div>
        <div class="tut-body">Fraser has gone full villain.<br>Fight your way through Brisbane to take him down.</div>
        <button class="mbtn tut-btn" onclick={() => tutorialSlide = 1}>NEXT ▶</button>
      {:else if tutorialSlide === 1}
        <div class="tut-title">COMBAT</div>
        <div class="tut-body">Your character fights automatically.<br>Spend gold on stat upgrades to get stronger.</div>
        <div class="tut-diagram">👹 ←⚔️→ 🧙 → 🪙 → ⬆️</div>
        <button class="mbtn tut-btn" onclick={() => tutorialSlide = 2}>NEXT ▶</button>
      {:else if tutorialSlide === 2}
        <div class="tut-title">LOOT AND GEAR</div>
        <div class="tut-body">Enemies drop gear. Craft items from materials.<br>Lucky crafts get bonus stat rolls.</div>
        <button class="mbtn tut-btn" onclick={() => tutorialSlide = 3}>NEXT ▶</button>
      {:else}
        <div class="tut-title">PRESTIGE</div>
        <div class="tut-body">Beat Fraser to unlock Ascension.<br>Reset your progress for a permanent bonus.<br>Each run is faster.</div>
        <button class="mbtn tut-btn" onclick={() => { showTutorial = false; initAudio() }}>LET'S GO ▶</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ── BASE ─────────────────────────────────────────────────────────── */
  .droot {
    position: fixed; top: 3.25rem; left: 0; right: 0; bottom: 0; overflow: hidden;
    background: var(--z-bg, #060a06);
    color: #d0d0d0;
    font-family: 'Press Start 2P', monospace;
    font-size: 10px;
    display: flex; flex-direction: column;
    transition: background 0.4s;
  }

  /* ── TOP BAR ──────────────────────────────────────────────────────── */
  .topbar {
    flex-shrink: 0;
    background: var(--z-panel); border-bottom: 2px solid var(--z-border);
    padding: 9px 14px; display: flex; align-items: center; justify-content: space-between;
    gap: 11px; transition: background 0.4s, border-color 0.4s;
  }
  .back-btn {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #555; font-family: 'Press Start 2P', monospace; font-size: 9px;
    padding: 7px 12px; text-decoration: none; white-space: nowrap; flex-shrink: 0;
  }
  .back-btn:hover { color: #fff; border-color: var(--z-border-hi); }
  .logo { color: var(--z-accent); font-size: 12px; text-shadow: 2px 2px 0 #000; white-space: nowrap; }
  .logo span { color: #fff; }
  .res-bar { display: flex; gap: 9px; }
  .res { display: flex; align-items: center; gap: 6px; background: var(--z-panel2); padding: 5px 10px; border: 1px solid var(--z-border); }
  .rv { color: var(--z-accent); }
  .zone-tag { background: var(--z-panel2); border: 1px solid var(--z-accent2); padding: 5px 10px; color: var(--z-accent2); font-size: 9px; white-space: nowrap; }

  /* ── MAIN GRID ────────────────────────────────────────────────────── */
  .mgrid {
    flex: 1; min-height: 0;
    display: grid;
    grid-template-columns: 250px 1fr 260px;
    grid-template-rows: 1fr auto;
    gap: 11px; padding: 11px;
  }

  /* ── PANEL BASE ───────────────────────────────────────────────────── */
  .panel {
    background: var(--z-panel); border: 2px solid var(--z-border);
    box-shadow: 2px 2px 0 #000; overflow: hidden;
    transition: background 0.4s, border-color 0.4s;
  }
  .ptitle {
    color: var(--z-accent); font-size: 10px;
    border-bottom: 1px solid var(--z-border); padding-bottom: 8px; margin-bottom: 8px;
    letter-spacing: 1px;
  }

  /* ── PLAYER PANEL ─────────────────────────────────────────────────── */
  .ppanel { padding: 14px; display: flex; flex-direction: column; gap: 9px; overflow-y: auto; }
  .ppanel::-webkit-scrollbar { width: 5px; }
  .ppanel::-webkit-scrollbar-thumb { background: var(--z-border-hi); }

  .sprite-wrap {
    background: var(--z-panel2); border: 2px solid var(--z-border); height: 95px;
    display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;
  }
  .sprite-wrap::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 80%, color-mix(in srgb, var(--z-accent2) 15%, transparent), transparent 70%);
  }
  .bigsprite { font-size: 42px; animation: float 2s ease-in-out infinite; filter: drop-shadow(0 4px 0 #000); }
  .pname  { text-align: center; font-size: 11px; color: #fff; }
  .pclass { text-align: center; font-size: 9px; color: var(--z-accent2); }
  .bgrp { display: flex; flex-direction: column; gap: 4px; }
  .blbl { display: flex; justify-content: space-between; font-size: 10px; color: #999; }
  .btrack { height: 13px; background: #050508; border: 1px solid var(--z-border); overflow: hidden; }
  .bfill  { height: 100%; transition: width 0.3s; }
  .bfill::after { content: ''; display: block; height: 3px; background: rgba(255,255,255,0.15); }
  .hpf { background: #40c060; }
  .xpf { background: var(--z-accent2); }
  .gear-row { display: flex; gap: 5px; }
  .gslot {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    flex: 1; height: 34px; min-width: 0; display: flex; align-items: center; justify-content: center;
    font-size: 18px; cursor: pointer;
  }
  .gslot:hover { border-color: var(--z-accent); }
  .gem { color: #333; font-size: 13px; }
  .sgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .sgrp-lbl { font-size: 8px; color: #777; padding: 7px 0 4px; letter-spacing: 1px; border-bottom: 1px solid var(--z-border); margin-bottom: 1px; }
  .sbox {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    padding: 8px 7px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .si { font-size: 15px; }
  .sn { font-size: 8px; color: #555; }
  .sv { font-size: 11px; color: var(--z-accent); }
  .upbtn {
    background: color-mix(in srgb, var(--z-accent) 25%, #000);
    border: none; color: var(--z-accent);
    font-family: 'Press Start 2P', monospace; font-size: 9px;
    padding: 10px; width: 100%; cursor: pointer; border-bottom: 2px solid #000; margin-top: auto;
  }
  .upbtn:hover { background: color-mix(in srgb, var(--z-accent) 45%, #000); }

  /* ── COMBAT PANEL ─────────────────────────────────────────────────── */
  .cpanel { display: flex; flex-direction: column; }
  .scene  { flex: 1; position: relative; overflow: hidden; min-height: 0; max-height: 250px; }
  canvas.scene-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .particles { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }
  .particle  { position: absolute; border-radius: 50%; animation: drift linear infinite; }

  .ground-plane {
    position: absolute; bottom: 0; left: 0; right: 0; height: 36px;
  }
  .ground-plane::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: color-mix(in srgb, var(--z-accent) 40%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--z-accent) 25%, transparent);
  }
  .ground-plane::after {
    content: ''; position: absolute; top: 3px; left: 0; right: 0; bottom: 0;
    background: var(--z-ground-pattern);
  }

  .fighter {
    position: absolute; bottom: 36px;
    display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 10;
  }
  .fighter.pl { left: 13%; }
  .fighter.en { right: 13%; }
  .fighter::after {
    content: ''; position: absolute; bottom: -6px; width: 42px; height: 6px;
    background: radial-gradient(ellipse, rgba(0,0,0,0.7) 0%, transparent 70%);
    border-radius: 50%;
  }
  .fsprite { font-size: 52px; filter: drop-shadow(2px 4px 0 #000); line-height: 1; }
  .fighter.pl .fsprite { animation: p-idle 0.7s steps(1) infinite; }
  .en-spr { animation: e-idle 1.4s ease-in-out infinite; transform: scaleX(-1); display: block; }

  .finfo { position: absolute; top: -28px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .fname { font-size: 8px; background: rgba(0,0,0,0.75); padding: 4px 8px; white-space: nowrap; color: #ccc; }
  .fname.enemy { color: #e04040; }
  .hpmini { width: 110px; height: 11px; background: #000; border: 1px solid #333; overflow: hidden; }
  .hpmf   { height: 100%; transition: width 0.2s; }
  .hpmf.p { background: #40c060; }
  .hpmf.e { background: #c04040; }

  .slash {
    position: absolute; top: 42%; left: 34%; width: 32%; height: 2px;
    background: linear-gradient(90deg, transparent, var(--z-accent), transparent);
    transform: rotate(-18deg); opacity: 0;
    animation: slash 2.5s ease-in-out infinite;
    box-shadow: 0 0 6px var(--z-accent); z-index: 15;
    transition: background 0.4s, box-shadow 0.4s;
  }

  .dfloat {
    position: absolute; pointer-events: none; z-index: 20;
    font-size: 12px; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000;
    animation: rise 1.4s ease-out forwards;
  }
  .df-hit  { color: #e04040; }
  .df-heal { color: #40c060; }
  .df-crit { color: var(--z-accent); font-size: 15px; }
  .df-gold { color: #f0c030; }
  .df-enemy  { right: 20%; top: 22%; }
  .df-player { left: 15%; top: 30%; }

  .zlabel {
    position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
    font-size: 9px; letter-spacing: 3px; color: rgba(100,100,120,0.45);
    z-index: 4; white-space: nowrap;
  }

  .clog {
    flex-shrink: 0; background: rgba(0,0,0,0.85); border-top: 2px solid var(--z-border);
    padding: 8px 14px; height: 85px; overflow: hidden; display: flex; flex-direction: column; gap: 5px;
  }
  .ll       { font-size: 9px; color: #686878; line-height: 1.7; }
  .ll.dmg   { color: #d04040; }
  .ll.crit  { color: var(--z-accent2); }
  .ll.heal  { color: #40c060; }
  .ll.gold  { color: var(--z-accent); }
  .ll.sys   { color: #5090d0; }

  .stagebar {
    flex-shrink: 0; background: var(--z-panel); border-top: 2px solid var(--z-border);
    padding: 8px 14px; display: flex; flex-direction: column; gap: 6px;
  }
  .stagebar-top { display: flex; align-items: center; gap: 11px; }
  .zone-dots { display: flex; gap: 6px; align-items: center; padding: 0 4px; }
  .zdot { width: 11px; height: 11px; border-radius: 50%; border: 1px solid var(--z-border); flex-shrink: 0; transition: background 0.3s, border-color 0.3s, box-shadow 0.3s; }
  .zdot.zd-active { background: var(--z-accent); border-color: var(--z-accent); box-shadow: 0 0 5px var(--z-accent); }
  .zdot.zd-done { background: color-mix(in srgb, var(--z-accent2) 50%, #000); border-color: var(--z-accent2); }
  .zdot.zd-locked { background: transparent; opacity: 0.3; }
  .slbl  { font-size: 9px; color: #666; white-space: nowrap; }
  .strack{ flex: 1; height: 14px; background: #050508; border: 1px solid var(--z-border); overflow: hidden; }
  .sfill {
    height: 100%;
    background: repeating-linear-gradient(90deg, var(--z-accent2) 0, var(--z-accent2) 10px, color-mix(in srgb, var(--z-accent2) 55%, #000) 10px, color-mix(in srgb, var(--z-accent2) 55%, #000) 20px);
    background-size: 20px 100%; animation: march 0.8s linear infinite; transition: width 0.3s;
  }
  .scnt  { font-size: 9px; color: var(--z-accent2); white-space: nowrap; }

  /* ── SHOP PANEL ───────────────────────────────────────────────────── */
  .rpanel { padding: 14px; display: flex; flex-direction: column; gap: 9px; overflow-y: auto; }
  .rpanel::-webkit-scrollbar { width: 5px; }
  .rpanel::-webkit-scrollbar-thumb { background: var(--z-border-hi); }
  .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--z-border); padding-bottom: 8px; margin-bottom: 4px; }
  .tab {
    flex: 1; background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #999; font-family: 'Press Start 2P', monospace; font-size: 8px;
    padding: 7px 4px; cursor: pointer; text-align: center;
  }
  .tab.active { background: var(--z-border-hi); color: var(--z-accent); border-color: var(--z-accent); }
  .shopitem {
    background: var(--z-panel2); border: 1px solid var(--z-border); padding: 9px 8px;
    display: flex; flex-direction: row; align-items: center; gap: 9px;
  }
  .shopitem:hover { border-color: var(--z-accent); }
  .sit  { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  .sii  { font-size: 17px; flex-shrink: 0; }
  .sinf { flex: 1; min-width: 0; }
  .sn   { font-size: 9px; color: #ccc; }
  .sd   { font-size: 8px; color: #666; margin-top: 2px; }
  .slv  { font-size: 8px; color: #555; background: #1a1a1a; padding: 4px 5px; flex-shrink: 0; }
  .sic  { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; flex-shrink: 0; }
  .sprice { font-size: 9px; color: var(--z-accent); }
  .sbuy {
    background: color-mix(in srgb, var(--z-accent) 15%, #000);
    border: 1px solid color-mix(in srgb, var(--z-accent) 40%, #000);
    color: var(--z-accent); font-family: 'Press Start 2P', monospace;
    font-size: 8px; padding: 5px 9px; cursor: pointer;
  }
  .sbuy:hover { background: color-mix(in srgb, var(--z-accent) 28%, #000); }
  .sbuy.cant, .mbtn.cant { background: #111; border-color: #222; color: #333; cursor: not-allowed; }
  .stub { font-size: 9px; color: #333; text-align: center; padding: 16px 7px; border: 1px solid #1a1a1a; background: #0a0a0a; }

  /* ── TIMER BAR ────────────────────────────────────────────────────── */
  .tbar {
    grid-column: 1 / -1; padding: 10px 14px; display: flex; gap: 11px; align-items: center;
  }
  .tlbl { font-size: 9px; color: #444; white-space: nowrap; margin-right: 4px; }
  .tcard {
    flex: 1; background: var(--z-panel2); border: 1px solid var(--z-border);
    padding: 8px 12px; display: flex; flex-direction: column; gap: 5px;
    cursor: pointer; position: relative; min-width: 0;
  }
  .tcard:hover { border-color: var(--z-border-hi); }
  .tcard.run { border-color: #40c060; }
  .tcard.rdy { border-color: var(--z-accent); }
  .tcard.lck { opacity: 0.4; cursor: not-allowed; }
  .ttop { display: flex; align-items: center; gap: 6px; }
  .tic  { font-size: 15px; }
  .tn   { font-size: 8px; color: #ccc; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tr   { font-size: 8px; color: var(--z-accent); white-space: nowrap; }
  .ttrack { height: 10px; background: #050508; border: 1px solid #1a1a1a; overflow: hidden; border-radius: 1px; }
  .tfill  { height: 100%; background: color-mix(in srgb, var(--z-accent2) 80%, #000); }
  .tfill.done { background: var(--z-accent); animation: glow 0.5s ease-in-out infinite alternate; }
  .ttime   { font-size: 8px; color: #444; text-align: right; }
  .ttime.d { color: var(--z-accent); }
  .cbadge {
    position: absolute; top: -5px; right: -5px;
    background: var(--z-accent); color: #000; font-size: 8px; padding: 4px 5px;
    animation: bb 0.4s ease-in-out infinite alternate;
  }

  /* ── UPGRADE MODAL ────────────────────────────────────────────────── */
  .moverlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.87);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .mbox {
    background: var(--z-panel); border: 2px solid var(--z-accent); box-shadow: 4px 4px 0 #000;
    padding: 20px; min-width: 360px; max-height: 80vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 10px;
  }
  .mhdr   { display: flex; align-items: center; gap: 11px; padding-bottom: 11px; border-bottom: 1px solid var(--z-border); }
  .mtitle { font-size: 11px; color: var(--z-accent); flex: 1; }
  .mgold  { font-size: 10px; color: #f0c030; }
  .mclose { background: none; border: 1px solid var(--z-border); color: #555; font-family: 'Press Start 2P', monospace; font-size: 10px; padding: 5px 9px; cursor: pointer; }
  .mclose:hover { color: #fff; border-color: #fff; }
  .mgrp-lbl { font-size: 9px; color: #555; padding: 9px 0 4px; letter-spacing: 1px; }
  .mrow   { display: flex; align-items: center; gap: 11px; background: var(--z-panel2); border: 1px solid var(--z-border); padding: 10px; }
  .micon  { font-size: 20px; }
  .minfo  { flex: 1; display: flex; flex-direction: column; gap: 5px; }
  .mn     { font-size: 9px; color: #ccc; }
  .mv     { font-size: 8px; color: #555; }
  .mnxt   { color: var(--z-accent2); }
  .mcost  { font-size: 9px; color: var(--z-accent); white-space: nowrap; }
  .mbtn {
    background: color-mix(in srgb, var(--z-accent) 18%, #000);
    border: 1px solid color-mix(in srgb, var(--z-accent) 45%, #000);
    color: var(--z-accent); font-family: 'Press Start 2P', monospace;
    font-size: 9px; padding: 8px 12px; cursor: pointer;
  }
  .mbtn:hover { background: color-mix(in srgb, var(--z-accent) 32%, #000); }

  /* ── STORY MODAL ──────────────────────────────────────────────────── */
  .soverlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.92);
    display: flex; align-items: center; justify-content: center; z-index: 90; cursor: pointer;
  }
  .sbox  {
    border: 2px solid var(--z-accent); background: var(--z-panel); box-shadow: 4px 4px 0 #000;
    padding: 28px 36px; max-width: 460px; text-align: center;
    display: flex; flex-direction: column; gap: 20px;
  }
  .szone { font-size: 10px; color: var(--z-accent2); letter-spacing: 2px; }
  .stxt  { font-size: 11px; color: #ccc; line-height: 2; }
  .shint { font-size: 9px; color: #444; animation: blink 1s step-end infinite; }

  /* ── PRESTIGE BUTTON ──────────────────────────────────────────────── */
  .prestige-btn {
    margin-top: 4px; font-size: 8px;
  }
  .prestige-btn.locked {
    background: #111; color: #333; cursor: not-allowed; border-color: #222;
  }
  .prestige-btn.active {
    background: color-mix(in srgb, var(--z-accent) 25%, #000);
    color: var(--z-accent); animation: glow 1s ease-in-out infinite alternate;
  }

  /* ── ICON BUTTONS ────────────────────────────────────────────────── */
  .icon-btns { display: flex; gap: 5px; }
  .icon-btn {
    flex: 1; background: var(--z-panel2); border: 1px solid var(--z-border);
    font-size: 16px; padding: 7px; cursor: pointer; text-align: center;
  }
  .icon-btn:hover { border-color: var(--z-accent); }

  /* ── PRESTIGE MODAL ──────────────────────────────────────────────── */
  .prestige-body { font-size: 10px; color: #aaa; line-height: 2.2; }
  .prestige-body p { margin: 0; }
  .prestige-info {
    margin-top: 11px; background: var(--z-panel2); border: 1px solid var(--z-border);
    padding: 12px; display: flex; flex-direction: column; gap: 6px;
  }
  .pi-row { display: flex; justify-content: space-between; font-size: 10px; }
  .prestige-btns { display: flex; gap: 9px; margin-top: 6px; }
  .prestige-confirm {
    background: color-mix(in srgb, #c04040 30%, #000) !important;
    border-color: #c04040 !important; color: #ff6060 !important; flex: 1;
  }
  .prestige-confirm:hover { background: color-mix(in srgb, #c04040 50%, #000) !important; }

  /* ── ACHIEVEMENT MODAL ───────────────────────────────────────────── */
  .ach-box { max-width: 420px; }
  .ach-grid { display: flex; flex-direction: column; gap: 6px; }
  .ach-card {
    display: flex; align-items: center; gap: 11px;
    background: var(--z-panel2); border: 1px solid var(--z-border); padding: 9px;
  }
  .ach-card.unlocked { border-color: var(--z-accent2); }
  .ach-card.locked { opacity: 0.4; }
  .ach-spr { font-size: 20px; width: 28px; text-align: center; }
  .ach-info { flex: 1; }
  .ach-name { font-size: 9px; color: var(--z-accent); }
  .ach-desc { font-size: 8px; color: #555; margin-top: 4px; }

  /* ── STATS MODAL ─────────────────────────────────────────────────── */
  .stats-grid { display: flex; flex-direction: column; gap: 6px; }
  .stat-row {
    display: flex; justify-content: space-between; font-size: 10px; color: #aaa;
    background: var(--z-panel2); border: 1px solid var(--z-border); padding: 9px;
  }
  .stat-row.snarky { color: var(--z-accent2); }

  /* ── OFFLINE MODAL ───────────────────────────────────────────────── */
  .offline-body { display: flex; flex-direction: column; gap: 6px; }
  .offline-time { font-size: 11px; color: var(--z-accent); text-align: center; margin-bottom: 6px; }
  .offline-cap { font-size: 9px; color: #c04040; text-align: center; margin-bottom: 6px; }
  .offline-item { font-size: 10px; color: #aaa; background: var(--z-panel2); border: 1px solid var(--z-border); padding: 8px; }
  .offline-item.gold { color: #f0c030; }
  .collect-btn { width: 100%; margin-top: 9px; text-align: center; }

  /* ── ACHIEVEMENT TOASTS ──────────────────────────────────────────── */
  .toast-container {
    position: fixed; bottom: 20px; right: 20px; z-index: 200;
    display: flex; flex-direction: column; gap: 9px; pointer-events: none;
  }
  .ach-toast {
    display: flex; align-items: center; gap: 11px;
    background: var(--z-panel, #0a0a0f); border: 2px solid var(--z-accent, #40c060);
    box-shadow: 4px 4px 0 #000; padding: 12px 16px;
    animation: toast-in 0.3s ease-out, toast-out 0.5s ease-in 2.5s forwards;
    font-family: 'Press Start 2P', monospace;
  }
  .toast-spr { font-size: 22px; }
  .toast-info { display: flex; flex-direction: column; gap: 4px; }
  .toast-label { font-size: 8px; color: #555; }
  .toast-name { font-size: 10px; color: var(--z-accent, #40c060); }

  /* ── KEYFRAMES ────────────────────────────────────────────────────── */
  @keyframes toast-in  { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  @keyframes toast-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes float  { 0%,100% { transform:translateY(0); }    50%       { transform:translateY(-4px); } }
  @keyframes drift  { from { transform:translateY(0) translateX(0); opacity:0.7; } to { transform:translateY(var(--dy)) translateX(var(--dx)); opacity:0; } }
  @keyframes slash  { 0%,65%,100% { opacity:0; transform:rotate(-18deg) scaleX(0); } 68% { opacity:1; transform:rotate(-18deg) scaleX(1.1); } 74% { opacity:0; transform:rotate(-18deg) scaleX(0.6); } }
  @keyframes rise   { 0% { opacity:1; transform:translateY(0); } 80% { opacity:1; transform:translateY(-22px); } 100% { opacity:0; transform:translateY(-30px); } }
  @keyframes march  { from { background-position:0 0; } to { background-position:20px 0; } }
  @keyframes p-idle { 0%,100% { transform:translateY(0); }    40%       { transform:translateY(-2px); } }
  @keyframes e-idle { 0%,100% { transform:scaleX(-1) translateY(0); }   50% { transform:scaleX(-1) translateY(-4px); } }
  @keyframes bb     { from { transform:scale(1); } to { transform:scale(1.15); } }
  @keyframes glow   { from { box-shadow:none; } to { box-shadow:0 0 6px var(--z-accent); } }
  @keyframes blink  { 0%,100% { opacity:1; } 50% { opacity:0; } }

  /* ── GEAR STAT BONUS ──────────────────────────────────────────────── */
  .sgear { font-size: 8px; color: #c040ff; }
  .gslot.filled { border-color: var(--z-accent2); }

  /* ── ZONE NAVIGATOR ───────────────────────────────────────────────── */
  .znav {
    flex-shrink: 0; background: var(--z-panel); border-top: 2px solid var(--z-border);
    padding: 7px 14px; display: flex; align-items: center; gap: 11px;
  }
  .znlbl { font-size: 8px; color: #444; white-space: nowrap; }
  .zn-scroll { display: flex; gap: 5px; overflow-x: auto; }
  .zn-scroll::-webkit-scrollbar { height: 4px; }
  .zn-scroll::-webkit-scrollbar-thumb { background: var(--z-border-hi); }
  .zn-btn {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #555; font-family: 'Press Start 2P', monospace; font-size: 8px;
    padding: 5px 8px; cursor: pointer; white-space: nowrap; min-width: 24px; text-align: center;
  }
  .zn-btn.active { background: var(--z-border-hi); color: var(--z-accent); border-color: var(--z-accent); }
  .zn-btn.locked { opacity: 0.4; cursor: not-allowed; }
  .zn-btn:not(.locked):hover { border-color: var(--z-border-hi); color: #ccc; }

  /* ── TAB BADGE ────────────────────────────────────────────────────── */
  .tab-badge {
    background: var(--z-accent); color: #000; font-size: 7px;
    padding: 2px 5px; margin-left: 4px; display: inline-block;
    animation: bb 0.4s ease-in-out infinite alternate;
  }

  /* ── GEAR TAB ─────────────────────────────────────────────────────── */
  .gs-row { display: flex; gap: 5px; margin-bottom: 4px; }
  .gs-slot {
    flex: 1; background: var(--z-panel2); border: 1px solid var(--z-border);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px; padding: 7px 4px; cursor: pointer; position: relative; min-height: 52px;
  }
  .gs-slot:hover  { border-color: var(--z-accent); }
  .gs-slot.filled { border-color: var(--z-accent2); }
  .gs-spr   { font-size: 20px; }
  .gs-empty { font-size: 13px; color: #333; }
  .gs-lbl   { font-size: 7px; color: #444; }
  .gs-rar   { position: absolute; bottom: 0; left: 0; right: 0; height: 2px; }

  /* ── LOOT QUEUE CARDS ─────────────────────────────────────────────── */
  .lq-card {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    padding: 8px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px;
  }
  .lq-top  { display: flex; align-items: center; gap: 8px; }
  .lq-spr  { font-size: 20px; flex-shrink: 0; }
  .lq-inf  { flex: 1; min-width: 0; }
  .lq-nm   { font-size: 8px; }
  .lq-st   { font-size: 8px; color: #555; margin-top: 1px; }
  .lq-btns { display: flex; gap: 5px; }
  .lq-btn  {
    flex: 1; font-family: 'Press Start 2P', monospace; font-size: 8px;
    border: 1px solid var(--z-border); cursor: pointer; padding: 5px 0; text-align: center;
  }
  .lq-btn.eq { background: color-mix(in srgb, var(--z-accent) 15%, #000); color: var(--z-accent); border-color: color-mix(in srgb, var(--z-accent) 40%, #000); }
  .lq-btn.eq:hover { background: color-mix(in srgb, var(--z-accent) 28%, #000); }
  .lq-btn.dc { background: #1a0a00; color: #f0c030; border-color: #3a2a00; }
  .lq-btn.dc:hover { background: #2a1800; }

  /* ── CRAFT CARDS ──────────────────────────────────────────────────── */
  .craft-card {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    padding: 8px; display: flex; flex-direction: column; gap: 5px; margin-bottom: 4px;
  }
  .craft-card:hover { border-color: var(--z-accent); }
  .craft-card.ca    { opacity: 0.7; }
  .cc-top  { display: flex; align-items: center; gap: 8px; }
  .cc-spr  { font-size: 18px; }
  .cc-inf  { flex: 1; min-width: 0; }
  .cc-nm   { font-size: 8px; }
  .cc-st   { font-size: 8px; color: #555; }
  .cc-cost { display: flex; flex-wrap: wrap; gap: 5px; }
  .cc-mat  { font-size: 8px; color: #40a040; background: #0a1a0a; padding: 2px 5px; }
  .cc-mat.miss { color: #c04040; background: #1a0a0a; }
  .cc-btn  {
    width: 100%; font-family: 'Press Start 2P', monospace; font-size: 8px;
    background: color-mix(in srgb, var(--z-accent) 15%, #000);
    border: 1px solid color-mix(in srgb, var(--z-accent) 40%, #000);
    color: var(--z-accent); cursor: pointer; padding: 7px;
  }
  .cc-btn:hover  { background: color-mix(in srgb, var(--z-accent) 28%, #000); }
  .cc-btn.cant   { background: #111; border-color: #222; color: #333; cursor: not-allowed; }

  /* ── EQUIP MODAL ──────────────────────────────────────────────────── */
  .ebox  { min-width: 300px; max-width: 380px; }
  .eslbl { font-size: 9px; color: var(--z-accent2); margin: 6px 0 4px; }
  .eloot-item {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    padding: 9px; display: flex; align-items: center; gap: 9px; margin-bottom: 5px;
  }
  .eloot-item.clickable { cursor: pointer; }
  .eloot-item.clickable:hover { border-color: var(--z-accent); }
  .eequip-hint { font-size: 8px; color: var(--z-accent); white-space: nowrap; margin-left: auto; }
  .eempty { font-size: 8px; color: #333; padding: 9px; text-align: center; border: 1px solid #1a1a1a; }

  /* ── BOSS INDICATORS ──────────────────────────────────────────────── */
  .boss-tag {
    font-size: 8px; background: #c00; color: #fff;
    padding: 4px 8px; margin-bottom: 4px; text-align: center;
    letter-spacing: 1px; border: 1px solid #ff4444;
  }
  .miniboss-tag { background: #804000; border-color: #ff8800; }

  .hpmf.e.boss-hp {
    background: #e03030;
    animation: boss-pulse 1.2s ease-in-out infinite;
  }
  @keyframes boss-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .boss-border {
    box-shadow: 0 0 0 2px var(--z-accent2), 0 0 18px var(--z-accent2) !important;
    animation: border-glow 2s ease-in-out infinite;
  }
  @keyframes border-glow {
    0%, 100% { box-shadow: 0 0 0 2px var(--z-accent2), 0 0 10px var(--z-accent2); }
    50%       { box-shadow: 0 0 0 2px var(--z-accent2), 0 0 28px var(--z-accent2); }
  }

  .boss-label { color: var(--z-accent) !important; animation: boss-pulse 1.2s ease-in-out infinite; }

  .boss-icons {
    position: absolute; top: -20px; right: 0;
    font-size: 18px; display: flex; gap: 5px;
  }

  /* ── STUN OVERLAY ─────────────────────────────────────────────────── */
  .stunned-sprite { position: relative; }
  .stun-overlay {
    position: absolute; top: -16px; left: 50%; transform: translateX(-50%);
    background: #6600cc; color: #fff; font-size: 8px;
    padding: 4px 8px; white-space: nowrap; border: 1px solid #aa44ff;
    animation: boss-pulse 0.5s ease-in-out infinite;
  }

  /* ── NICK VOID ────────────────────────────────────────────────────── */
  .nick-void .scene-bg { display: none; }
  .nick-void { background: #000 !important; }
  .nick-stars {
    position: absolute; inset: 0; pointer-events: none;
    background-image: radial-gradient(1px 1px at 10% 15%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 25% 60%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 40% 30%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 55% 70%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 70% 20%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 80% 50%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 90% 80%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 15% 85%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 60% 45%, #fff 0%, transparent 100%),
                      radial-gradient(1px 1px at 35% 90%, #fff 0%, transparent 100%);
    opacity: 0.6;
  }
  .nick-watermark {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 22px; color: rgba(255,255,255,0.04); pointer-events: none;
    letter-spacing: 8px; user-select: none;
  }

  /* ── HIDDEN DOOR ──────────────────────────────────────────────────── */
  .nick-door {
    position: absolute; bottom: 14px; right: 14px;
    background: none; border: none; cursor: pointer;
    font-size: 24px; opacity: 0.4; transition: opacity 0.3s;
    animation: door-flicker 3s ease-in-out infinite;
  }
  .nick-door:hover { opacity: 1; }
  @keyframes door-flicker {
    0%, 100% { opacity: 0.2; }
    50% { opacity: 0.5; }
  }

  /* ── BOSS DEATH OVERLAY ───────────────────────────────────────────── */
  .boss-death-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; cursor: pointer;
  }
  .bdo-box {
    background: #0a0a0a; border: 2px solid #444; padding: 28px 36px;
    max-width: 400px; text-align: center;
  }
  .bdo-line {
    color: #fff; font-size: 12px; line-height: 1.8; margin-bottom: 6px;
  }
  .bdo-sub { color: #888; font-size: 10px; }
  .bdo-hint { color: #444; font-size: 8px; margin-top: 18px; }

  /* ── VICTORY SCREENS ──────────────────────────────────────────────── */
  .victory-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.92);
    display: flex; align-items: center; justify-content: center;
    z-index: 300; cursor: pointer;
  }
  .nick-victory { background: #000; }
  .vic-box { text-align: center; padding: 36px; }
  .vic-title { color: var(--z-accent); font-size: 18px; margin-bottom: 9px; text-shadow: 0 0 20px var(--z-accent); }
  .vic-sub   { color: #888; font-size: 11px; margin-bottom: 20px; }
  .vic-line  { color: #ccc; font-size: 10px; margin-bottom: 6px; }
  .vic-hint  { color: #333; font-size: 8px; margin-top: 24px; }

  /* ── CRAFT RESULT OVERLAY ─────────────────────────────────────────── */
  .craft-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 400; cursor: pointer;
  }
  .craft-result-box {
    background: #1a1a1a; border: 2px solid var(--z-border-hi);
    padding: 28px 32px; text-align: center; min-width: 260px;
    cursor: default;
  }
  .cr-sprite { font-size: 42px; margin-bottom: 11px; }
  .cr-name   { font-size: 12px; margin-bottom: 6px; }
  .cr-quality-badge { font-size: 11px; margin-bottom: 14px; }
  .cr-base   { margin-bottom: 11px; }
  .cr-stat-row { font-size: 10px; margin: 4px 0; }
  .base-stat  { color: #ccc; }
  .rolled-stat { color: #f0c030; }
  .cr-rolls-label { font-size: 9px; color: #888; margin: 9px 0 4px; }
  .cr-no-rolls { font-size: 9px; color: #555; margin: 9px 0; }
  .cr-queue-hint { font-size: 8px; color: #666; margin-top: 14px; }
  .cr-collect-btn {
    display: block; width: 100%; margin-top: 14px;
    background: #1a3a1a; border: 2px solid var(--z-accent, #40a040);
    color: var(--z-accent, #40a040); font-family: inherit; font-size: 11px;
    letter-spacing: 2px; padding: 10px 0; cursor: pointer;
  }
  .cr-collect-btn:hover { background: #243a24; }
  @keyframes perfect-flash { 0%,100%{opacity:1} 50%{opacity:0.7;background:rgba(240,192,48,0.12)} }
  .perfect-flash { animation: perfect-flash 0.6s ease 2; }

  /* ── REROLL / CRAFT LUCK ──────────────────────────────────────────── */
  .craft-luck-hint { font-size: 8px; color: #40a040; margin: 4px 0 9px; }
  .reroll-cost { font-size: 8px; color: #888; display: flex; gap: 6px; flex-wrap: wrap; margin: 5px 0; }
  .reroll-badge { font-size: 8px; color: #555; }
  .lq-rolls { font-size: 8px; color: #f0c030; margin-top: 1px; }

  /* ── LEADERBOARD MODAL ────────────────────────────────────────────── */
  .lb-modal { max-width: 420px; width: 95vw; }
  .lb-tabs  { display: flex; gap: 6px; margin-bottom: 11px; }
  .lb-tab   { flex: 1; background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #888; font-size: 8px; padding: 7px 4px; cursor: pointer; }
  .lb-tab.active { border-color: var(--z-border-hi); color: var(--z-accent); }
  .lb-list  { max-height: 300px; overflow-y: auto; }
  .lb-row   { display: flex; align-items: center; gap: 9px; padding: 6px 0;
    border-bottom: 1px solid #1a1a1a; font-size: 9px; }
  .lb-rank  { width: 26px; text-align: right; color: #555; }
  .lb-rank.gold   { color: #f0c030; }
  .lb-rank.silver { color: #aaa; }
  .lb-rank.bronze { color: #c87432; }
  .lb-name  { flex: 1; color: #ccc; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb-stat  { color: var(--z-accent); min-width: 52px; text-align: right; }
  .lb-icons { font-size: 11px; }
  .lb-time  { font-size: 7px; color: #444; }
  .lb-my-rank { margin-top: 11px; padding: 6px; border-top: 1px solid #333;
    font-size: 9px; color: #888; text-align: center; }
  .lb-loading { font-size: 9px; color: #555; text-align: center; padding: 20px; }
  .lb-error  { font-size: 9px; color: #a04040; text-align: center; padding: 20px; }

  /* ── MOBILE RESPONSIVE ────────────────────────────────────────────── */
  .mobile-tabs {
    display: none;
    grid-column: 1;
    background: var(--z-panel);
    border: 2px solid var(--z-border);
    overflow: hidden;
  }
  .mob-tab {
    flex: 1; background: var(--z-panel2); border: none;
    color: #999; font-family: 'Press Start 2P', monospace; font-size: 9px;
    padding: 12px 7px; cursor: pointer; text-align: center;
    border-right: 1px solid var(--z-border);
  }
  .mob-tab:last-child { border-right: none; }
  .mob-tab.active { background: var(--z-border-hi); color: var(--z-accent); }

  @media (max-width: 900px) {
    .mgrid {
      grid-template-columns: 1fr;
      grid-template-rows: 220px auto auto;
      overflow-y: auto;
    }
    .ppanel, .rpanel { grid-column: 1; }
    .tbar { grid-column: 1; flex-wrap: wrap; }
    .scene { height: 220px; }
    .mobile-tabs { display: flex; }
    .mobile-hidden { display: none !important; }
    .znav { flex-wrap: wrap; }
    .tcard { min-width: 160px; }
    .topbar { flex-wrap: wrap; gap: 6px; }
    .droot { font-size: 9px; }
  }

  @media (max-width: 600px) {
    .sgrid { grid-template-columns: 1fr 1fr 1fr; }
    .tcard { width: 100%; flex-basis: 100%; min-width: 160px; }
    .res .res-label { display: none; }
  }

  .res-label { font-size: 8px; color: #555; }

  /* ── ANIMATIONS ───────────────────────────────────────────────────── */
  @keyframes zone-fadein { from { opacity: 0; } to { opacity: 1; } }
  @keyframes boss-shake { 0%,100%{transform:scaleX(-1) translateX(0)} 25%{transform:scaleX(-1) translateX(-4px)} 75%{transform:scaleX(-1) translateX(4px)} }
  @keyframes levelup-flash { 0%{opacity:0.15} 100%{opacity:0} }
  @keyframes levelup-text { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-40px)} }
  @keyframes prestige-whitein { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
  @keyframes boss-tag-slide { from{transform:translateY(-100%) translateX(-50%);opacity:0} to{transform:translateY(0) translateX(-50%);opacity:1} }
  @keyframes badge-bounce { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }

  .zone-transitioning .scene-bg { animation: zone-fadein 0.6s ease; }
  .boss-spawning { animation: boss-shake 0.15s ease-in-out 3 !important; }
  .boss-tag { animation: boss-tag-slide 0.15s ease-out; transform-origin: top center; }

  .levelup-flash {
    position: fixed; inset: 0; background: rgba(255,255,255,0.15);
    pointer-events: none; z-index: 500;
    animation: levelup-flash 0.2s ease forwards;
  }
  .levelup-text {
    position: fixed; bottom: 40%; left: 50%; transform: translateX(-50%);
    color: #f0c030; font-size: 13px; pointer-events: none; z-index: 501;
    text-shadow: 0 0 10px #f0c030;
    animation: levelup-text 1s ease-out forwards;
    font-family: 'Press Start 2P', monospace;
  }
  .prestige-flash {
    position: fixed; inset: 0; background: #fff;
    pointer-events: none; z-index: 600;
    animation: prestige-whitein 0.4s ease forwards;
  }

  /* ── KILL COUNT ───────────────────────────────────────────────────── */
  .kill-count { font-size: 7px; color: #555; }

  /* ── SPEED BUTTON ─────────────────────────────────────────────────── */
  .speed-btn {
    position: absolute; bottom: 9px; right: 11px; z-index: 20;
    background: rgba(0,0,0,0.7); border: 1px solid var(--z-border);
    color: var(--z-accent); font-family: 'Press Start 2P', monospace; font-size: 8px;
    padding: 5px 9px; cursor: pointer;
  }
  .speed-btn:hover { border-color: var(--z-accent); }

  /* ── AUTO BUTTON ──────────────────────────────────────────────────── */
  .auto-btn {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #444; font-family: 'Press Start 2P', monospace; font-size: 8px;
    padding: 7px 9px; cursor: pointer; white-space: nowrap;
  }
  .auto-btn.on { color: var(--z-accent); border-color: var(--z-accent); }

  /* ── MUTE BUTTON ──────────────────────────────────────────────────── */
  .mute-btn {
    background: var(--z-panel2); border: 1px solid var(--z-border);
    font-size: 16px; padding: 5px 9px; cursor: pointer; line-height: 1;
  }
  .mute-btn:hover { border-color: var(--z-accent); }

  /* ── CLOUD SYNC INDICATOR ─────────────────────────────────────────────── */
  .sync-indicator {
    font-size: 9px; padding: 4px 8px; cursor: default;
    border: 1px solid transparent; white-space: nowrap;
  }
  .sync-synced  { color: #555; }
  .sync-saving  { color: var(--z-accent2); animation: sync-pulse 1.2s ease-in-out infinite; }
  .sync-offline { color: #c04040; border-color: #602020; }
  @keyframes sync-pulse { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }

  /* ── GUEST BANNER ─────────────────────────────────────────────────────── */
  .guest-banner {
    background: var(--z-panel); border-bottom: 1px solid var(--z-accent);
    padding: 8px 16px; display: flex; align-items: center; gap: 11px;
    font-size: 9px; color: var(--z-accent); letter-spacing: 1px;
  }
  .guest-login-link {
    color: #fff; text-decoration: underline; font-size: 9px; cursor: pointer;
  }
  .guest-dismiss {
    margin-left: auto; background: none; border: none; color: #555;
    font-size: 11px; cursor: pointer; padding: 0 7px; line-height: 1;
  }
  .guest-dismiss:hover { color: #ccc; }

  /* ── RESET SAVE ───────────────────────────────────────────────────────── */
  .reset-section {
    margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--z-border);
  }
  .reset-btn {
    font-family: 'Press Start 2P', monospace; font-size: 8px;
    background: transparent; border: 1px solid #603030; color: #804040;
    padding: 8px 14px; cursor: pointer; width: 100%;
  }
  .reset-btn:hover { border-color: #c04040; color: #e04040; }
  .reset-confirm { display: flex; flex-direction: column; gap: 9px; }
  .reset-warn { font-size: 8px; color: #c04040; }
  .reset-input {
    font-family: 'Press Start 2P', monospace; font-size: 9px;
    background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #fff; padding: 8px 12px; width: 100%; outline: none;
  }
  .reset-input:focus { border-color: #c04040; }
  .reset-actions { display: flex; gap: 9px; }
  .reset-cancel {
    font-family: 'Press Start 2P', monospace; font-size: 8px;
    background: var(--z-panel2); border: 1px solid var(--z-border);
    color: #999; padding: 8px 14px; cursor: pointer; flex: 1;
  }
  .reset-cancel:hover { border-color: var(--z-border-hi); color: #fff; }
  .reset-confirm-btn {
    font-family: 'Press Start 2P', monospace; font-size: 8px;
    background: color-mix(in srgb, #e04040 15%, #000);
    border: 1px solid #e04040; color: #e04040;
    padding: 8px 14px; cursor: pointer; flex: 1;
  }
  .reset-confirm-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .reset-confirm-btn:not(:disabled):hover { background: color-mix(in srgb, #e04040 28%, #000); }

  /* zone lock feedback */
  .zone-lock-msg {
    font-size: 8px; color: #c04040; text-align: center;
    padding: 4px 0; margin-top: 4px;
  }

  /* discard confirm flash */
  .lq-btn.dc.confirm { border-color: #c04040; color: #c04040; animation: bb 0.4s ease-in-out infinite alternate; }

  /* ── REROLL CONFIRM ───────────────────────────────────────────────── */
  .confirm-reroll { color: #f0c030 !important; border-color: #f0c030 !important; animation: boss-pulse 0.3s ease-in-out infinite; }

  /* ── TUTORIAL ─────────────────────────────────────────────────────── */
  .tutorial-overlay { z-index: 700; }
  .tutorial-box { max-width: 380px; text-align: center; gap: 16px; }
  .tut-title { font-size: 13px; color: var(--z-accent); letter-spacing: 2px; margin-bottom: 11px; }
  .tut-body { font-size: 10px; color: #aaa; line-height: 2.2; }
  .tut-diagram { font-size: 18px; margin: 11px 0; letter-spacing: 2px; }
  .tut-btn { width: 100%; margin-top: 11px; }

  /* ── HYBRID STATS ─────────────────────────────────────────────────── */
  .sgear-pct { color: #f0c030; font-size: 9px; }
  .seff { color: #ffffff; font-size: 10px; font-weight: bold; }

  /* ── GEAR SUB-TABS ────────────────────────────────────────────────── */
  .gear-subtabs { display:flex; gap:4px; margin-bottom:6px; }
  .gsub { flex:1; padding:5px 0; font-size:9px; font-family:inherit; background:#111; color:#555; border:1px solid #222; cursor:pointer; text-transform:uppercase; letter-spacing:1px; }
  .gsub.active { background:#1a1a1a; color:#f0c030; border-color:#f0c030; }
  .unique-badge { color:#ff9000; font-size:8px; }
  .item-lore { color:#555; font-size:8px; font-style:italic; margin-top:4px; }

  /* ── MATERIALS ────────────────────────────────────────────────────── */
  .mat-sidebar { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:9px; padding:7px; background:#0a0a0a; border:1px solid #1a1a1a; }
  .mat-chip { display:flex; align-items:center; gap:4px; padding:4px 7px; background:#111; border:1px solid #222; font-size:9px; color:#ccc; }
  .mat-chip.zero { opacity:0.35; }
  .mat-qty { color:#f0c030; font-weight:bold; }
</style>
