import type { StatKey } from './constants'
import type { StatRoll } from './crafting'

export type ItemSlot = 'weapon' | 'armour' | 'helmet' | 'ring' | 'amulet'

export type Item = {
  id: string
  name: string
  slot: ItemSlot
  sprite: string
  statBonuses: Partial<Record<StatKey, number>>
  craftCost?: { materials: Record<string, number>; gold: number }
  dropSource?: string[]   // enemy ids that can drop this
  rarity: 'common' | 'uncommon' | 'rare' | 'epic'
  // Per-instance fields populated when item enters the game (crafted or dropped)
  instanceId?: string
  rolledBonuses?: StatRoll[]
  rerollCount?: number
}

export const ITEMS: Record<string, Item> = {

  // ── WEAPONS ───────────────────────────────────────────────────────────────
  'wooden-stick': {
    id: 'wooden-stick', name: 'WOODEN STICK', slot: 'weapon', sprite: '🪵',
    statBonuses: { attack: 2 }, rarity: 'common',
    dropSource: ['mystery-slime', 'basement-rat'],
  },
  'iron-sword': {
    id: 'iron-sword', name: 'IRON SWORD', slot: 'weapon', sprite: '🗡️',
    statBonuses: { attack: 6 }, rarity: 'common',
    dropSource: ['forgotten-thing', 'court-slime'],
    craftCost: { materials: { iron: 10 }, gold: 50 },
  },
  'steel-blade': {
    id: 'steel-blade', name: 'STEEL BLADE', slot: 'weapon', sprite: '⚔️',
    statBonuses: { attack: 12 }, rarity: 'uncommon',
    dropSource: ['thesis-demon', 'brainrot-specter'],
    craftCost: { materials: { iron: 20 }, gold: 150 },
  },
  'enchanted-sword': {
    id: 'enchanted-sword', name: 'ENCHANTED SWORD', slot: 'weapon', sprite: '🌟',
    statBonuses: { attack: 20 }, rarity: 'rare',
    dropSource: ['ward-sentinel', 'corporate-drone'],
    craftCost: { materials: { iron: 30, herbs: 5 }, gold: 400 },
  },
  'wolton-breaker': {
    id: 'wolton-breaker', name: 'WOLTON BREAKER', slot: 'weapon', sprite: '💥',
    statBonuses: { attack: 35 }, rarity: 'epic',
    dropSource: ['executive-enforcer', 'wolton-prime'],
    craftCost: { materials: { iron: 50, herbs: 15 }, gold: 1200 },
  },

  // ── ARMOUR ────────────────────────────────────────────────────────────────
  'cloth-robe': {
    id: 'cloth-robe', name: 'CLOTH ROBE', slot: 'armour', sprite: '👘',
    statBonuses: { defence: 2 }, rarity: 'common',
    dropSource: ['basement-rat', 'mystery-creature'],
    craftCost: { materials: { wood: 5 }, gold: 30 },
  },
  'leather-vest': {
    id: 'leather-vest', name: 'LEATHER VEST', slot: 'armour', sprite: '🧥',
    statBonuses: { defence: 5 }, rarity: 'common',
    dropSource: ['aggressive-ref', 'the-bouncer'],
    craftCost: { materials: { wood: 15 }, gold: 100 },
  },
  'chain-mail': {
    id: 'chain-mail', name: 'CHAIN MAIL', slot: 'armour', sprite: '🛡️',
    statBonuses: { defence: 10 }, rarity: 'uncommon',
    dropSource: ['grad-overseer', 'rowdy-fan'],
    craftCost: { materials: { iron: 15 }, gold: 250 },
  },
  'plate-armour': {
    id: 'plate-armour', name: 'PLATE ARMOUR', slot: 'armour', sprite: '🦺',
    statBonuses: { defence: 18 }, rarity: 'rare',
    dropSource: ['hr-director', 'security-golem'],
    craftCost: { materials: { iron: 35 }, gold: 600 },
  },
  'wolton-suit': {
    id: 'wolton-suit', name: 'WOLTON SUIT', slot: 'armour', sprite: '💼',
    statBonuses: { defence: 28 }, rarity: 'epic',
    dropSource: ['fraser', 'wolton-prime'],
    craftCost: { materials: { iron: 60, herbs: 10 }, gold: 2000 },
  },

  // ── HELMETS ───────────────────────────────────────────────────────────────
  'cap': {
    id: 'cap', name: 'CAP', slot: 'helmet', sprite: '🧢',
    statBonuses: { defence: 1, luck: 1 }, rarity: 'common',
    dropSource: ['mystery-slime', 'court-slime'],
    craftCost: { materials: { wood: 3 }, gold: 20 },
  },
  'iron-helm': {
    id: 'iron-helm', name: 'IRON HELM', slot: 'helmet', sprite: '⛑️',
    statBonuses: { defence: 4, luck: 2 }, rarity: 'common',
    dropSource: ['overtime-ghost', 'late-assignment'],
    craftCost: { materials: { iron: 8 }, gold: 80 },
  },
  'enchanted-hood': {
    id: 'enchanted-hood', name: 'ENCHANTED HOOD', slot: 'helmet', sprite: '🪄',
    statBonuses: { defence: 8, luck: 5 }, rarity: 'uncommon',
    dropSource: ['thesis-demon', 'taco-van-guardian'],
    craftCost: { materials: { herbs: 8 }, gold: 200 },
  },
  'wolton-visor': {
    id: 'wolton-visor', name: 'WOLTON VISOR', slot: 'helmet', sprite: '🥽',
    statBonuses: { defence: 15, luck: 8 }, rarity: 'epic',
    dropSource: ['damo', 'executive-enforcer'],
    craftCost: { materials: { iron: 25, herbs: 12 }, gold: 800 },
  },

  // ── RINGS ─────────────────────────────────────────────────────────────────
  'copper-ring': {
    id: 'copper-ring', name: 'COPPER RING', slot: 'ring', sprite: '💍',
    statBonuses: { luck: 3 }, rarity: 'common',
    dropSource: ['basement-rat', 'stressed-postgrad'],
    craftCost: { materials: {}, gold: 40 },
  },
  'speed-ring': {
    id: 'speed-ring', name: 'SPEED RING', slot: 'ring', sprite: '💫',
    statBonuses: { speed: 2 }, rarity: 'uncommon',
    dropSource: ['penalty-wraith', 'frenzied-shopper'],
    craftCost: { materials: { iron: 5 }, gold: 180 },
  },
  'power-ring': {
    id: 'power-ring', name: 'POWER RING', slot: 'ring', sprite: '🔮',
    statBonuses: { attack: 5 }, rarity: 'rare',
    dropSource: ['chief-surgeon', 'hr-director'],
    craftCost: { materials: { herbs: 10 }, gold: 500 },
  },

  // ── AMULETS ───────────────────────────────────────────────────────────────
  'rat-tooth': {
    id: 'rat-tooth', name: 'RAT TOOTH', slot: 'amulet', sprite: '🦷',
    statBonuses: { attack: 2, luck: 1 }, rarity: 'common',
    dropSource: ['basement-rat', 'rat-king'],
  },
  'lucky-charm': {
    id: 'lucky-charm', name: 'LUCKY CHARM', slot: 'amulet', sprite: '🍀',
    statBonuses: { luck: 5 }, rarity: 'uncommon',
    dropSource: ['the-coach', 'the-examiner'],
    craftCost: { materials: { herbs: 5 }, gold: 150 },
  },
  'wolton-badge': {
    id: 'wolton-badge', name: 'WOLTON BADGE', slot: 'amulet', sprite: '📛',
    statBonuses: { attack: 8, defence: 5 }, rarity: 'epic',
    dropSource: ['damo', 'fraser'],
    craftCost: { materials: { iron: 20, herbs: 8 }, gold: 700 },
  },
}

export type CraftEntry = {
  itemId: string
  materials: Record<string, number>
  gold: number
  unlockLevel: number
}

export const CRAFT_RECIPES: CraftEntry[] = [
  // Weapons
  { itemId: 'iron-sword',      materials: { iron: 10 },            gold: 50,   unlockLevel: 3  },
  { itemId: 'steel-blade',     materials: { iron: 20 },            gold: 150,  unlockLevel: 6  },
  { itemId: 'enchanted-sword', materials: { iron: 30, herbs: 5 },  gold: 400,  unlockLevel: 10 },
  { itemId: 'wolton-breaker',  materials: { iron: 50, herbs: 15 }, gold: 1200, unlockLevel: 15 },
  // Armour
  { itemId: 'cloth-robe',   materials: { wood: 5 },             gold: 30,   unlockLevel: 1  },
  { itemId: 'leather-vest', materials: { wood: 15 },            gold: 100,  unlockLevel: 4  },
  { itemId: 'chain-mail',   materials: { iron: 15 },            gold: 250,  unlockLevel: 7  },
  { itemId: 'plate-armour', materials: { iron: 35 },            gold: 600,  unlockLevel: 11 },
  { itemId: 'wolton-suit',  materials: { iron: 60, herbs: 10 }, gold: 2000, unlockLevel: 16 },
  // Helmets
  { itemId: 'cap',            materials: { wood: 3 },             gold: 20,  unlockLevel: 1  },
  { itemId: 'iron-helm',      materials: { iron: 8 },             gold: 80,  unlockLevel: 4  },
  { itemId: 'enchanted-hood', materials: { herbs: 8 },            gold: 200, unlockLevel: 8  },
  { itemId: 'wolton-visor',   materials: { iron: 25, herbs: 12 }, gold: 800, unlockLevel: 13 },
  // Rings
  { itemId: 'copper-ring', materials: {},            gold: 40,  unlockLevel: 2  },
  { itemId: 'speed-ring',  materials: { iron: 5 },   gold: 180, unlockLevel: 6  },
  { itemId: 'power-ring',  materials: { herbs: 10 }, gold: 500, unlockLevel: 10 },
  // Amulets
  { itemId: 'lucky-charm',  materials: { herbs: 5 },           gold: 150, unlockLevel: 5  },
  { itemId: 'wolton-badge', materials: { iron: 20, herbs: 8 }, gold: 700, unlockLevel: 14 },
]
