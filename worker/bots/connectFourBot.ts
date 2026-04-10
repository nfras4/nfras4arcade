/**
 * Connect Four bot decision (medium difficulty).
 * Uses a simple heuristic: block opponent wins, take own wins,
 * prefer center columns, avoid moves that give opponent a win above.
 */

type Cell = 0 | 1 | 2;
type Board = Cell[][];

const ROWS = 6;
const COLS = 7;

function getDropRow(board: Board, col: number): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 0) return row;
  }
  return -1;
}

function wouldWin(board: Board, col: number, piece: 1 | 2): boolean {
  const row = getDropRow(board, col);
  if (row === -1) return false;
  board[row][col] = piece;
  const won = hasWinAt(board, row, col, piece);
  board[row][col] = 0;
  return won;
}

function hasWinAt(board: Board, row: number, col: number, piece: 1 | 2): boolean {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of directions) {
    let count = 1;
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== piece) break;
      count++;
    }
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== piece) break;
      count++;
    }
    if (count >= 4) return true;
  }
  return false;
}

/**
 * Check if dropping in this column gives the opponent a winning move
 * directly above (i.e. the cell above our drop would complete 4 for them).
 */
function givesOpponentWinAbove(board: Board, col: number, myPiece: 1 | 2): boolean {
  const row = getDropRow(board, col);
  if (row === -1 || row === 0) return false; // column full or top row
  const oppPiece: 1 | 2 = myPiece === 1 ? 2 : 1;
  // Simulate our drop
  board[row][col] = myPiece;
  // Check if opponent wins by dropping above us
  const aboveRow = row - 1;
  board[aboveRow][col] = oppPiece;
  const opWins = hasWinAt(board, aboveRow, col, oppPiece);
  board[aboveRow][col] = 0;
  board[row][col] = 0;
  return opWins;
}

export function connectFourBotDecision(board: Board, myPiece: 1 | 2): number {
  const oppPiece: 1 | 2 = myPiece === 1 ? 2 : 1;
  const validCols = [];
  for (let c = 0; c < COLS; c++) {
    if (getDropRow(board, c) !== -1) validCols.push(c);
  }

  if (validCols.length === 0) return -1; // board full — should never be called

  // 1. Win if possible
  for (const c of validCols) {
    if (wouldWin(board, c, myPiece)) return c;
  }

  // 2. Block opponent win
  for (const c of validCols) {
    if (wouldWin(board, c, oppPiece)) return c;
  }

  // 3. Avoid moves that give opponent a win above
  const safeCols = validCols.filter(c => !givesOpponentWinAbove(board, c, myPiece));
  const pool = safeCols.length > 0 ? safeCols : validCols;

  // 4. Prefer center columns (weighted random)
  const weights = pool.map(c => {
    const dist = Math.abs(c - 3);
    return 4 - dist; // center=4, edges=1
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const rand = (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * totalWeight;

  let cumulative = 0;
  for (let i = 0; i < pool.length; i++) {
    cumulative += weights[i];
    if (rand <= cumulative) return pool[i];
  }

  return pool[pool.length - 1];
}
