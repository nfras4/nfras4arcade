export interface SlotSymbol {
  id: number;
  name: string;
  label: string;
  color: string;
  payouts: { 3: number; 4: number; 5: number };
}

export const WILD_ID = 5;

export const SYMBOLS: SlotSymbol[] = [
  { id: 0, name: 'cherry',  label: 'CH', color: '#e94560', payouts: { 3: 2,  4: 6,   5: 18 } },
  { id: 1, name: 'lemon',   label: 'LM', color: '#e6c44d', payouts: { 3: 4,  4: 10,  5: 24 } },
  { id: 2, name: 'orange',  label: 'OR', color: '#f39c12', payouts: { 3: 6,  4: 14,  5: 36 } },
  { id: 3, name: 'gem',     label: 'GM', color: '#4da8e6', payouts: { 3: 10, 4: 24,  5: 60 } },
  { id: 4, name: 'star',    label: 'ST', color: '#a855f7', payouts: { 3: 12, 4: 36,  5: 90 } },
  { id: 5, name: 'wild',    label: 'WD', color: '#3dd68c', payouts: { 3: 0,  4: 0,   5: 0  } },
];

// Reel weights per symbol. Index = reel (0-4), value = weight array per symbol ID.
// Wild has 0 weight on reels 0 & 4 (never appears on edges), weight 1 on reels 1-3.
export const REEL_WEIGHTS: number[][] = [
  // Reel 0 (leftmost)  - no wild
  [8, 7, 6, 5, 4, 0],
  // Reel 1             - wild possible
  [8, 7, 6, 5, 4, 1],
  // Reel 2 (center)    - wild possible
  [8, 7, 6, 5, 4, 1],
  // Reel 3             - wild possible
  [8, 7, 6, 5, 4, 1],
  // Reel 4 (rightmost) - no wild
  [8, 7, 6, 5, 4, 0],
];
