import type { StatKey } from './constants'
import type { StatRoll, ItemModifier } from './crafting'

export type ItemSlot = 'weapon' | 'armour' | 'helmet' | 'ring' | 'amulet'

export type StatBonus = {
  flat?: number
  percent?: number
}

export type StatBonuses = Partial<Record<StatKey, StatBonus>>

export type Item = {
  id: string
  name: string
  slot: ItemSlot
  sprite: string
  statBonuses: StatBonuses
  craftCost?: { materials: Record<string, number>; gold: number }
  dropSource?: string[]
  dropChance?: number
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'boss_unique'
  lore?: string
  discardable?: boolean
  instanceId?: string
  rolledBonuses?: StatRoll[]
  rerollCount?: number
  tier?: number        // 1-7, undefined for boss uniques
  tierIndex?: number   // same as tier, used for forge chain lookups
  itemLevel?: number
  itemXp?: number
  itemXpToNext?: number
  forgeCount?: number
  modifier?: ItemModifier
}

export const MATERIAL_TIERS: Record<string, { tier: number; sprite: string; name: string }> = {
  wood:         { tier: 1, sprite: '🪵', name: 'Wood'         },
  iron:         { tier: 1, sprite: '⚙️', name: 'Iron'         },
  potion:       { tier: 1, sprite: '🧪', name: 'Potion'       },
  herbs:        { tier: 1, sprite: '🌿', name: 'Herbs'        },
  hardwood:     { tier: 2, sprite: '🌲', name: 'Hardwood'     },
  steel:        { tier: 2, sprite: '🔩', name: 'Steel'        },
  rare_herbs:   { tier: 2, sprite: '🍄', name: 'Rare Herbs'   },
  darkwood:     { tier: 3, sprite: '🌑', name: 'Darkwood'     },
  wolton_alloy: { tier: 3, sprite: '⚡', name: 'Wolton Alloy' },
  void_essence: { tier: 3, sprite: '💜', name: 'Void Essence' },

  // T4
  shadowwood:      { tier: 4, sprite: '🌿', name: 'Shadowwood'     },
  refined_alloy:   { tier: 4, sprite: '🔱', name: 'Refined Alloy'  },
  cursed_herbs:    { tier: 4, sprite: '☠️',  name: 'Cursed Herbs'   },

  // T5
  abysswood:       { tier: 5, sprite: '🌑', name: 'Abysswood'      },
  wolton_core:     { tier: 5, sprite: '💠', name: 'Wolton Core'    },
  ancient_essence: { tier: 5, sprite: '✨', name: 'Ancient Essence' },

  // T6
  voidwood:        { tier: 6, sprite: '🕳️', name: 'Voidwood'       },
  fractured_steel: { tier: 6, sprite: '⚡', name: 'Fractured Steel' },
  primordial_dust: { tier: 6, sprite: '🌀', name: 'Primordial Dust' },

  // T7
  etherwood:       { tier: 7, sprite: '🔮', name: 'Etherwood'      },
  wolton_fragment: { tier: 7, sprite: '💎', name: 'Wolton Fragment' },
  ascendant_shard: { tier: 7, sprite: '⭐', name: 'Ascendant Shard' },
}

export const ITEMS: Record<string, Item> = {

  // ── WEAPONS ───────────────────────────────────────────────────────────────
  'wooden-stick': {
    id: 'wooden-stick', name: 'WOODEN STICK', slot: 'weapon', sprite: '🪵',
    statBonuses: { attack: { flat: 2 } }, rarity: 'common', tier: 1, tierIndex: 1,
    dropSource: ['mystery-slime', 'basement-rat'],
  },
  'iron-sword': {
    id: 'iron-sword', name: 'IRON SWORD', slot: 'weapon', sprite: '🗡️',
    statBonuses: { attack: { flat: 6 } }, rarity: 'common', tier: 2, tierIndex: 2,
    dropSource: ['forgotten-thing', 'court-slime'],
    craftCost: { materials: { iron: 10 }, gold: 50 },
  },
  'steel-blade': {
    id: 'steel-blade', name: 'STEEL BLADE', slot: 'weapon', sprite: '⚔️',
    statBonuses: { attack: { flat: 12 } }, rarity: 'uncommon', tier: 3, tierIndex: 3,
    dropSource: ['thesis-demon', 'brainrot-specter'],
    craftCost: { materials: { steel: 20 }, gold: 150 },
  },
  'enchanted-sword': {
    id: 'enchanted-sword', name: 'ENCHANTED SWORD', slot: 'weapon', sprite: '🌟',
    statBonuses: { attack: { flat: 20 } }, rarity: 'rare', tier: 4, tierIndex: 4,
    dropSource: ['ward-sentinel', 'corporate-drone'],
    craftCost: { materials: { wolton_alloy: 20, rare_herbs: 8 }, gold: 500 },
  },
  'wolton-breaker': {
    id: 'wolton-breaker', name: 'WOLTON BREAKER', slot: 'weapon', sprite: '💥',
    statBonuses: { attack: { flat: 35 } }, rarity: 'epic', tier: 5, tierIndex: 5,
    dropSource: ['executive-enforcer', 'wolton-prime'],
    craftCost: { materials: { wolton_alloy: 40, void_essence: 8 }, gold: 1200 },
  },

  // ── ARMOUR ────────────────────────────────────────────────────────────────
  'cloth-robe': {
    id: 'cloth-robe', name: 'CLOTH ROBE', slot: 'armour', sprite: '👘',
    statBonuses: { defence: { flat: 2 } }, rarity: 'common', tier: 1, tierIndex: 1,
    dropSource: ['basement-rat', 'mystery-creature'],
    craftCost: { materials: { wood: 5 }, gold: 30 },
  },
  'leather-vest': {
    id: 'leather-vest', name: 'LEATHER VEST', slot: 'armour', sprite: '🧥',
    statBonuses: { defence: { flat: 5 } }, rarity: 'common', tier: 2, tierIndex: 2,
    dropSource: ['aggressive-ref', 'the-bouncer'],
    craftCost: { materials: { wood: 15 }, gold: 100 },
  },
  'chain-mail': {
    id: 'chain-mail', name: 'CHAIN MAIL', slot: 'armour', sprite: '🛡️',
    statBonuses: { defence: { flat: 10 } }, rarity: 'uncommon', tier: 3, tierIndex: 3,
    dropSource: ['grad-overseer', 'rowdy-fan'],
    craftCost: { materials: { steel: 15 }, gold: 200 },
  },
  'plate-armour': {
    id: 'plate-armour', name: 'PLATE ARMOUR', slot: 'armour', sprite: '🦺',
    statBonuses: { defence: { flat: 18 } }, rarity: 'rare', tier: 4, tierIndex: 4,
    dropSource: ['hr-director', 'security-golem'],
    craftCost: { materials: { steel: 30, wolton_alloy: 10 }, gold: 600 },
  },
  'wolton-suit': {
    id: 'wolton-suit', name: 'WOLTON SUIT', slot: 'armour', sprite: '💼',
    statBonuses: { defence: { flat: 28 } }, rarity: 'epic', tier: 5, tierIndex: 5,
    dropSource: ['fraser', 'wolton-prime'],
    craftCost: { materials: { wolton_alloy: 50, void_essence: 10 }, gold: 2000 },
  },

  // ── HELMETS ───────────────────────────────────────────────────────────────
  'cap': {
    id: 'cap', name: 'CAP', slot: 'helmet', sprite: '🧢',
    statBonuses: { defence: { flat: 1 }, luck: { flat: 1 } }, rarity: 'common', tier: 1, tierIndex: 1,
    dropSource: ['mystery-slime', 'court-slime'],
    craftCost: { materials: { wood: 3 }, gold: 20 },
  },
  'iron-helm': {
    id: 'iron-helm', name: 'IRON HELM', slot: 'helmet', sprite: '⛑️',
    statBonuses: { defence: { flat: 4 }, luck: { flat: 2 } }, rarity: 'common', tier: 2, tierIndex: 2,
    dropSource: ['overtime-ghost', 'late-assignment'],
    craftCost: { materials: { iron: 8 }, gold: 80 },
  },
  'enchanted-hood': {
    id: 'enchanted-hood', name: 'ENCHANTED HOOD', slot: 'helmet', sprite: '🪄',
    statBonuses: { defence: { flat: 8 }, luck: { flat: 5 } }, rarity: 'uncommon', tier: 3, tierIndex: 3,
    dropSource: ['thesis-demon', 'taco-van-guardian'],
    craftCost: { materials: { rare_herbs: 8 }, gold: 200 },
  },
  'wolton-visor': {
    id: 'wolton-visor', name: 'WOLTON VISOR', slot: 'helmet', sprite: '🥽',
    statBonuses: { defence: { flat: 15 }, luck: { flat: 8 } }, rarity: 'epic', tier: 4, tierIndex: 4,
    dropSource: ['damo', 'executive-enforcer'],
    craftCost: { materials: { wolton_alloy: 20, rare_herbs: 12 }, gold: 900 },
  },

  // ── RINGS ─────────────────────────────────────────────────────────────────
  'copper-ring': {
    id: 'copper-ring', name: 'COPPER RING', slot: 'ring', sprite: '💍',
    statBonuses: { luck: { flat: 3 } }, rarity: 'common', tier: 1, tierIndex: 1,
    dropSource: ['basement-rat', 'stressed-postgrad'],
    craftCost: { materials: {}, gold: 40 },
  },
  'steel-ring': {
    id: 'steel-ring', name: 'STEEL RING', slot: 'ring', sprite: '🔩',
    statBonuses: { speed: { flat: 4 }, luck: { flat: 4 } }, rarity: 'uncommon', tier: 2, tierIndex: 2,
    craftCost: { materials: { steel: 5 }, gold: 120 },
    dropSource: ['aggressive-ref', 'the-bouncer', 'grad-overseer', 'rowdy-fan'],
    dropChance: 0.06,
    discardable: true,
  },
  'speed-ring': {
    id: 'speed-ring', name: 'SPEED RING', slot: 'ring', sprite: '💫',
    statBonuses: { speed: { flat: 2 } }, rarity: 'uncommon', tier: 3, tierIndex: 3,
    dropSource: ['penalty-wraith', 'frenzied-shopper'],
    craftCost: { materials: { iron: 5 }, gold: 180 },
  },
  'power-ring': {
    id: 'power-ring', name: 'POWER RING', slot: 'ring', sprite: '🔮',
    statBonuses: { attack: { flat: 5 } }, rarity: 'rare', tier: 4, tierIndex: 4,
    dropSource: ['chief-surgeon', 'hr-director'],
    craftCost: { materials: { rare_herbs: 10 }, gold: 300 },
  },

  // ── AMULETS ───────────────────────────────────────────────────────────────
  'rat-tooth': {
    id: 'rat-tooth', name: 'RAT TOOTH', slot: 'amulet', sprite: '🦷',
    statBonuses: { attack: { flat: 2 }, luck: { flat: 1 } }, rarity: 'common', tier: 1, tierIndex: 1,
    dropSource: ['basement-rat', 'rat-king'],
  },
  'lucky-charm': {
    id: 'lucky-charm', name: 'LUCKY CHARM', slot: 'amulet', sprite: '🍀',
    statBonuses: { luck: { flat: 5 } }, rarity: 'uncommon', tier: 3, tierIndex: 3,
    dropSource: ['the-coach', 'the-examiner'],
    craftCost: { materials: { rare_herbs: 5 }, gold: 150 },
  },
  'wolton-badge': {
    id: 'wolton-badge', name: 'WOLTON BADGE', slot: 'amulet', sprite: '📛',
    statBonuses: { attack: { flat: 8 }, defence: { flat: 5 } }, rarity: 'epic', tier: 4, tierIndex: 4,
    dropSource: ['damo', 'fraser'],
    craftCost: { materials: { wolton_alloy: 20, void_essence: 5 }, gold: 800 },
  },

  // ── T5 ITEMS (forge-only) ─────────────────────────────────────────────────
  't5-void-blade': {
    id: 't5-void-blade', name: 'VOID BLADE', slot: 'weapon', sprite: '🌑',
    statBonuses: { attack: { flat: 42 } }, rarity: 'epic', tier: 5, tierIndex: 5,
  },
  't5-void-plate': {
    id: 't5-void-plate', name: 'VOID PLATE', slot: 'armour', sprite: '🌑',
    statBonuses: { defence: { flat: 42 } }, rarity: 'epic', tier: 5, tierIndex: 5,
  },
  't5-void-crown': {
    id: 't5-void-crown', name: 'VOID CROWN', slot: 'helmet', sprite: '🌑',
    statBonuses: { defence: { flat: 26 }, luck: { flat: 14 } }, rarity: 'epic', tier: 5, tierIndex: 5,
  },
  't5-void-ring': {
    id: 't5-void-ring', name: 'VOID RING', slot: 'ring', sprite: '🌑',
    statBonuses: { speed: { flat: 12 }, luck: { flat: 12 } }, rarity: 'epic', tier: 5, tierIndex: 5,
  },
  't5-void-amulet': {
    id: 't5-void-amulet', name: 'VOID AMULET', slot: 'amulet', sprite: '🌑',
    statBonuses: { attack: { flat: 20 }, defence: { flat: 20 } }, rarity: 'epic', tier: 5, tierIndex: 5,
  },

  // ── T6 ITEMS (forge-only) ─────────────────────────────────────────────────
  't6-fractured-edge': {
    id: 't6-fractured-edge', name: 'FRACTURED EDGE', slot: 'weapon', sprite: '⚡',
    statBonuses: { attack: { flat: 20, percent: 8 } }, rarity: 'legendary', tier: 6, tierIndex: 6,
  },
  't6-fractured-mail': {
    id: 't6-fractured-mail', name: 'FRACTURED MAIL', slot: 'armour', sprite: '⚡',
    statBonuses: { defence: { flat: 20, percent: 8 } }, rarity: 'legendary', tier: 6, tierIndex: 6,
  },
  't6-fractured-visor': {
    id: 't6-fractured-visor', name: 'FRACTURED VISOR', slot: 'helmet', sprite: '⚡',
    statBonuses: { defence: { flat: 12, percent: 6 }, luck: { flat: 8, percent: 6 } }, rarity: 'legendary', tier: 6, tierIndex: 6,
  },
  't6-fractured-band': {
    id: 't6-fractured-band', name: 'FRACTURED BAND', slot: 'ring', sprite: '⚡',
    statBonuses: { speed: { flat: 10, percent: 8 }, luck: { flat: 8, percent: 6 } }, rarity: 'legendary', tier: 6, tierIndex: 6,
  },
  't6-fractured-charm': {
    id: 't6-fractured-charm', name: 'FRACTURED CHARM', slot: 'amulet', sprite: '⚡',
    statBonuses: { attack: { flat: 12, percent: 7 }, defence: { flat: 12, percent: 7 } }, rarity: 'legendary', tier: 6, tierIndex: 6,
  },

  // ── T7 ITEMS (forge-only) ─────────────────────────────────────────────────
  't7-ascendant-reaper': {
    id: 't7-ascendant-reaper', name: 'ASCENDANT REAPER', slot: 'weapon', sprite: '🌟',
    statBonuses: { attack: { flat: 35, percent: 18 } }, rarity: 'legendary', tier: 7, tierIndex: 7,
  },
  't7-ascendant-robes': {
    id: 't7-ascendant-robes', name: 'ASCENDANT ROBES', slot: 'armour', sprite: '🌟',
    statBonuses: { defence: { flat: 35, percent: 18 } }, rarity: 'legendary', tier: 7, tierIndex: 7,
  },
  't7-ascendant-crown': {
    id: 't7-ascendant-crown', name: 'ASCENDANT CROWN', slot: 'helmet', sprite: '🌟',
    statBonuses: { defence: { flat: 20, percent: 14 }, luck: { flat: 15, percent: 12 } }, rarity: 'legendary', tier: 7, tierIndex: 7,
  },
  't7-ascendant-ring': {
    id: 't7-ascendant-ring', name: 'ASCENDANT RING', slot: 'ring', sprite: '🌟',
    statBonuses: { speed: { flat: 18, percent: 16 }, luck: { flat: 14, percent: 14 } }, rarity: 'legendary', tier: 7, tierIndex: 7,
  },
  't7-ascendant-totem': {
    id: 't7-ascendant-totem', name: 'ASCENDANT TOTEM', slot: 'amulet', sprite: '🌟',
    statBonuses: { attack: { flat: 22, percent: 16 }, defence: { flat: 22, percent: 16 } }, rarity: 'legendary', tier: 7, tierIndex: 7,
  },

  // ── BOSS UNIQUES ──────────────────────────────────────────────────────────
  'johno-key': {
    id: 'johno-key', name: "JOHNO'S KEY", slot: 'amulet', sprite: '🗝️', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'luck',   percent: 20, label: '+20% LCK' },
      { stat: 'attack', percent: 10, label: '+10% ATK' },
    ],
    dropSource: ['johno'], dropChance: 0.25,
    lore: "Something was down there. This opens it.", discardable: false,
  },
  'court-crown': {
    id: 'court-crown', name: 'COURT CROWN', slot: 'helmet', sprite: '👑', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'attack', percent: 15, label: '+15% ATK' },
      { stat: 'speed',  percent: 15, label: '+15% SPD' },
    ],
    dropSource: ['the-coach'], dropChance: 0.25,
    lore: "He dunked on you to give you this.", discardable: false,
  },
  'absent-pass': {
    id: 'absent-pass', name: 'ABSENT PASS', slot: 'ring', sprite: '🎓', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'speed', percent: 20, label: '+20% SPD' },
      { stat: 'luck',  percent: 10, label: '+10% LCK' },
    ],
    dropSource: ['the-examiner'], dropChance: 0.25,
    lore: "Valid for unlimited absences. Connor signed it.", discardable: false,
  },
  'taco-van-keys': {
    id: 'taco-van-keys', name: 'TACO VAN KEYS', slot: 'amulet', sprite: '🌮', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'luck',    percent: 25, label: '+25% LCK' },
      { stat: 'defence', percent: 10, label: '+10% DEF' },
    ],
    dropSource: ['edrian'], dropChance: 0.25,
    lore: "He is not Mexican. The van is still his.", discardable: false,
  },
  'dunk-band': {
    id: 'dunk-band', name: 'DUNK BAND', slot: 'ring', sprite: '🏀', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'attack', percent: 20, label: '+20% ATK' },
      { stat: 'speed',  percent: 10, label: '+10% SPD' },
    ],
    dropSource: ['head-coach'], dropChance: 0.25,
    lore: "Occasionally activates on its own. Nobody knows why.", discardable: false,
  },
  'busted-screen': {
    id: 'busted-screen', name: 'BUSTED SCREEN', slot: 'weapon', sprite: '📱', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'luck',   percent: 30, label: '+30% LCK' },
      { stat: 'attack', percent: 10, label: '+10% ATK' },
    ],
    dropSource: ['mall-security'], dropChance: 0.25,
    lore: "Cracked mid-fight. Still gets better odds than you.", discardable: false,
  },
  'physio-tape': {
    id: 'physio-tape', name: 'PHYSIO TAPE', slot: 'armour', sprite: '🩹', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'defence',  percent: 25, label: '+25% DEF' },
      { stat: 'vitality', percent: 15, label: '+15% VIT' },
    ],
    dropSource: ['chief-surgeon'], dropChance: 0.25,
    lore: "Holds everything together. Somehow.", discardable: false,
  },
  'gaming-chair': {
    id: 'gaming-chair', name: 'GAMING CHAIR', slot: 'armour', sprite: '🎮', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'speed',   percent: 20, label: '+20% SPD' },
      { stat: 'defence', percent: 15, label: '+15% DEF' },
      { stat: 'luck',    percent: 10, label: '+10% LCK' },
    ],
    dropSource: ['damo'], dropChance: 0.30,
    lore: "GG.", discardable: false,
  },
  'wolton-lanyard': {
    id: 'wolton-lanyard', name: 'WOLTON LANYARD', slot: 'amulet', sprite: '🪪', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'attack',  percent: 20, label: '+20% ATK' },
      { stat: 'defence', percent: 20, label: '+20% DEF' },
      { stat: 'luck',    percent: 15, label: '+15% LCK' },
    ],
    dropSource: ['the-ceo', 'fraser'], dropChance: 0.20,
    lore: "Access all areas. He won't be needing it.", discardable: false,
  },
  'fraser-badge': {
    id: 'fraser-badge', name: "FRASER'S BADGE", slot: 'amulet', sprite: '🏷️', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'attack',  percent: 30, label: '+30% ATK' },
      { stat: 'defence', percent: 25, label: '+25% DEF' },
      { stat: 'speed',   percent: 20, label: '+20% SPD' },
      { stat: 'luck',    percent: 15, label: '+15% LCK' },
    ],
    dropSource: ['fraser'], dropChance: 0.15,
    lore: "The real dungeon was the budget approvals along the way.", discardable: false,
  },
  'prime-core': {
    id: 'prime-core', name: 'PRIME CORE', slot: 'weapon', sprite: '⚡', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'attack',   percent: 35, label: '+35% ATK' },
      { stat: 'critDmg',  percent: 30, label: '+30% CRIT' },
      { stat: 'xpBoost',  percent: 20, label: '+20% XP' },
      { stat: 'goldFind', percent: 20, label: '+20% GFND' },
    ],
    dropSource: ['wolton-prime'], dropChance: 0.30,
    lore: "Wolton Industries stock price: $0.00.", discardable: false,
  },
  'monkey-barrel-token': {
    id: 'monkey-barrel-token', name: 'MONKEY BARREL TOKEN', slot: 'amulet', sprite: '🎮', rarity: 'boss_unique',
    statBonuses: {},
    rolledBonuses: [
      { stat: 'attack',    percent: 40, label: '+40% ATK' },
      { stat: 'critDmg',   percent: 25, label: '+25% CRIT' },
      { stat: 'lifesteal', percent: 15, label: '+15% LS' },
    ],
    dropSource: ['nick'], dropChance: 1.0,
    lore: "You beat the guy who made this game. He wasn't happy about it.", discardable: false,
  },
}

export type CraftEntry = {
  itemId: string
  materials: Record<string, number>
  gold: number
  unlockLevel: number
}

export const CRAFT_RECIPES: CraftEntry[] = [
  { itemId: 'iron-sword',      materials: { iron: 10 },                          gold: 50,   unlockLevel: 3  },
  { itemId: 'steel-blade',     materials: { steel: 20 },                         gold: 150,  unlockLevel: 6  },
  { itemId: 'enchanted-sword', materials: { wolton_alloy: 20, rare_herbs: 8 },   gold: 500,  unlockLevel: 10 },
  { itemId: 'wolton-breaker',  materials: { wolton_alloy: 40, void_essence: 8 }, gold: 1200, unlockLevel: 15 },
  { itemId: 'cloth-robe',      materials: { wood: 5 },                           gold: 30,   unlockLevel: 1  },
  { itemId: 'leather-vest',    materials: { wood: 15 },                          gold: 100,  unlockLevel: 4  },
  { itemId: 'chain-mail',      materials: { steel: 15 },                         gold: 200,  unlockLevel: 7  },
  { itemId: 'plate-armour',    materials: { steel: 30, wolton_alloy: 10 },       gold: 600,  unlockLevel: 11 },
  { itemId: 'wolton-suit',     materials: { wolton_alloy: 50, void_essence: 10 },gold: 2000, unlockLevel: 16 },
  { itemId: 'cap',             materials: { wood: 3 },                           gold: 20,   unlockLevel: 1  },
  { itemId: 'iron-helm',       materials: { iron: 8 },                           gold: 80,   unlockLevel: 4  },
  { itemId: 'enchanted-hood',  materials: { rare_herbs: 8 },                     gold: 200,  unlockLevel: 8  },
  { itemId: 'wolton-visor',    materials: { wolton_alloy: 20, rare_herbs: 12 },  gold: 900,  unlockLevel: 13 },
  { itemId: 'copper-ring',     materials: {},                                    gold: 40,   unlockLevel: 2  },
  { itemId: 'speed-ring',      materials: { iron: 5 },                           gold: 180,  unlockLevel: 6  },
  { itemId: 'power-ring',      materials: { rare_herbs: 10 },                    gold: 300,  unlockLevel: 10 },
  { itemId: 'lucky-charm',     materials: { rare_herbs: 5 },                     gold: 150,  unlockLevel: 5  },
  { itemId: 'wolton-badge',    materials: { wolton_alloy: 20, void_essence: 5 }, gold: 800,  unlockLevel: 14 },
]

// ── Forge chains — maps each item id to its next-tier item id ─────────────
export const FORGE_CHAINS: Record<string, string> = {
  // weapons
  'wooden-stick':       'iron-sword',
  'iron-sword':         'steel-blade',
  'steel-blade':        'enchanted-sword',
  'enchanted-sword':    'wolton-breaker',
  'wolton-breaker':     't5-void-blade',
  't5-void-blade':      't6-fractured-edge',
  't6-fractured-edge':  't7-ascendant-reaper',
  // armour
  'cloth-robe':         'leather-vest',
  'leather-vest':       'chain-mail',
  'chain-mail':         'plate-armour',
  'plate-armour':       'wolton-suit',
  'wolton-suit':        't5-void-plate',
  't5-void-plate':      't6-fractured-mail',
  't6-fractured-mail':  't7-ascendant-robes',
  // helmets
  'cap':                'iron-helm',
  'iron-helm':          'enchanted-hood',
  'enchanted-hood':     'wolton-visor',
  'wolton-visor':       't5-void-crown',
  't5-void-crown':      't6-fractured-visor',
  't6-fractured-visor': 't7-ascendant-crown',
  // rings
  'copper-ring':        'steel-ring',
  'steel-ring':         'speed-ring',
  'speed-ring':         'power-ring',
  'power-ring':         't5-void-ring',
  't5-void-ring':       't6-fractured-band',
  't6-fractured-band':  't7-ascendant-ring',
  // amulets
  'rat-tooth':          'lucky-charm',
  'lucky-charm':        'wolton-badge',
  'wolton-badge':       't5-void-amulet',
  't5-void-amulet':     't6-fractured-charm',
  't6-fractured-charm': 't7-ascendant-totem',
}
