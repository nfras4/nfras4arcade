// 10 fixed paylines. Each array has 5 entries (one per reel).
// Values are row indices: 0 = top, 1 = middle, 2 = bottom.
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1], // 0: straight middle
  [0, 0, 0, 0, 0], // 1: straight top
  [2, 2, 2, 2, 2], // 2: straight bottom
  [0, 1, 2, 1, 0], // 3: V shape
  [2, 1, 0, 1, 2], // 4: inverted V
  [0, 0, 1, 2, 2], // 5: diagonal down
  [2, 2, 1, 0, 0], // 6: diagonal up
  [1, 0, 0, 0, 1], // 7: top dip
  [1, 2, 2, 2, 1], // 8: bottom dip
  [0, 1, 1, 1, 0], // 9: shallow V
];

export const NUM_PAYLINES = PAYLINES.length; // 10
export const NUM_REELS = 5;
export const NUM_ROWS = 3;
