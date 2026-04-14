import { SYMBOLS, WILD_ID, REEL_WEIGHTS } from './symbols';
import { PAYLINES, NUM_REELS, NUM_ROWS } from './paylines';

export interface WinResult {
  paylineIndex: number;
  symbolId: number;
  count: number; // 3, 4, or 5
  payout: number; // betPerLine * multiplier
}

export interface RespinStep {
  grid: number[][];
  expandedReels: number[];
  wins: WinResult[];
  totalWin: number;
}

export interface SpinOutcome {
  baseGrid: number[][];
  grid: number[][];
  wins: WinResult[];
  totalWin: number;
  expandedReels: number[];
  respinHistory: RespinStep[];
}

/** Pick a random symbol for a given reel using weighted selection. */
function pickSymbol(reelIndex: number): number {
  const weights = REEL_WEIGHTS[reelIndex];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * totalWeight;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/** Generate a 5x3 grid. grid[reel][row] = symbolId. Optionally lock certain reels. */
function generateGrid(lockedReels?: Map<number, number[]>): number[][] {
  const grid: number[][] = [];
  for (let reel = 0; reel < NUM_REELS; reel++) {
    if (lockedReels && lockedReels.has(reel)) {
      grid.push(lockedReels.get(reel)!);
    } else {
      const col: number[] = [];
      for (let row = 0; row < NUM_ROWS; row++) {
        col.push(pickSymbol(reel));
      }
      grid.push(col);
    }
  }
  return grid;
}

/** Find which of reels 1-3 contain at least one wild. */
function findExpandingWilds(grid: number[][]): Set<number> {
  const expanding = new Set<number>();
  for (let reel = 1; reel <= 3; reel++) {
    for (let row = 0; row < NUM_ROWS; row++) {
      if (grid[reel][row] === WILD_ID) {
        expanding.add(reel);
        break;
      }
    }
  }
  return expanding;
}

/** Expand wilds: fill entire reel column with WILD_ID. Returns new grid. */
function applyWildExpansion(grid: number[][], expandReels: Set<number>): number[][] {
  const newGrid = grid.map(col => [...col]);
  for (const reel of expandReels) {
    for (let row = 0; row < NUM_ROWS; row++) {
      newGrid[reel][row] = WILD_ID;
    }
  }
  return newGrid;
}

/** Evaluate a single payline. Returns win result or null. */
function evaluatePayline(grid: number[][], payline: number[], paylineIndex: number, betPerLine: number): WinResult | null {
  // Read symbols along this payline
  const symbols: number[] = [];
  for (let reel = 0; reel < NUM_REELS; reel++) {
    symbols.push(grid[reel][payline[reel]]);
  }

  // Find the winning symbol (first non-wild from left)
  let winSymbolId = -1;
  for (const s of symbols) {
    if (s !== WILD_ID) {
      winSymbolId = s;
      break;
    }
  }
  // All wilds - use highest paying symbol (Star, id 4)
  if (winSymbolId === -1) winSymbolId = 4;

  // Count consecutive matching from left (wilds match anything)
  let count = 0;
  for (let reel = 0; reel < NUM_REELS; reel++) {
    if (symbols[reel] === winSymbolId || symbols[reel] === WILD_ID) {
      count++;
    } else {
      break;
    }
  }

  if (count < 3) return null;

  const key = count as 3 | 4 | 5;
  const multiplier = SYMBOLS[winSymbolId].payouts[key];
  return {
    paylineIndex,
    symbolId: winSymbolId,
    count,
    payout: betPerLine * multiplier,
  };
}

/** Evaluate all 10 paylines. */
function evaluateAllPaylines(grid: number[][], betPerLine: number): WinResult[] {
  const wins: WinResult[] = [];
  for (let i = 0; i < PAYLINES.length; i++) {
    const result = evaluatePayline(grid, PAYLINES[i], i, betPerLine);
    if (result) wins.push(result);
  }
  return wins;
}

/** Execute a full spin with wild expansion and respins. */
export function executeSpin(betPerLine: number): SpinOutcome {
  const baseGrid = generateGrid();
  const allExpandedReels = new Set<number>();
  const respinHistory: RespinStep[] = [];

  let currentGrid = baseGrid.map(col => [...col]);
  let respinsLeft = 3;

  // Check for expanding wilds and respin loop
  while (respinsLeft > 0) {
    const newWilds = findExpandingWilds(currentGrid);
    // Only expand wilds that haven't been expanded yet
    const freshWilds = new Set<number>();
    for (const r of newWilds) {
      if (!allExpandedReels.has(r)) freshWilds.add(r);
    }

    if (freshWilds.size === 0) break;

    // Expand the wilds
    for (const r of freshWilds) allExpandedReels.add(r);
    currentGrid = applyWildExpansion(currentGrid, allExpandedReels);

    // Respin non-locked reels (only middle reels that aren't wild-expanded)
    const locked = new Map<number, number[]>();
    // Reels 0 and 4 always keep their values
    locked.set(0, currentGrid[0]);
    locked.set(4, currentGrid[4]);
    // Expanded reels stay locked as all-wild
    for (const r of allExpandedReels) {
      locked.set(r, currentGrid[r]);
    }

    currentGrid = generateGrid(locked);
    respinsLeft--;

    // Evaluate after this respin
    const stepWins = evaluateAllPaylines(currentGrid, betPerLine);
    respinHistory.push({
      grid: currentGrid.map(col => [...col]),
      expandedReels: [...allExpandedReels],
      wins: stepWins,
      totalWin: stepWins.reduce((sum, w) => sum + w.payout, 0),
    });
  }

  // Final evaluation on the final grid state
  const finalGrid = currentGrid;
  const wins = evaluateAllPaylines(finalGrid, betPerLine);
  const totalWin = wins.reduce((sum, w) => sum + w.payout, 0);

  return {
    baseGrid: baseGrid.map(col => [...col]),
    grid: finalGrid,
    wins,
    totalWin,
    expandedReels: [...allExpandedReels],
    respinHistory,
  };
}

/** Monte Carlo RTP simulation. Returns RTP as a decimal (e.g. 0.96 = 96%). */
export function simulateRTP(iterations: number = 1_000_000): number {
  const betPerLine = 1;
  const totalBet = betPerLine * PAYLINES.length;
  let totalWagered = 0;
  let totalReturned = 0;

  for (let i = 0; i < iterations; i++) {
    totalWagered += totalBet;
    const outcome = executeSpin(betPerLine);
    totalReturned += outcome.totalWin;
  }

  return totalReturned / totalWagered;
}
