import { CardRoom } from '../cards/cardRoom';
import type { CardAction, CardGameState } from '../cards/types';
import { connectFourBotDecision } from '../bots/connectFourBot';

const ROWS = 6;
const COLS = 7;

/** 0 = empty, 1 = player 1, 2 = player 2 */
type Cell = 0 | 1 | 2;
type Board = Cell[][];

interface ConnectFourTableState {
  board: Board;
  /** Map player ID -> piece number (1 or 2) */
  pieces: Record<string, 1 | 2>;
  lastMove: { row: number; col: number } | null;
  winnerId: string | null;
  winCells: [number, number][] | null;
  isDraw: boolean;
}

type ConnectFourAction = CardAction & (
  | { type: 'drop_piece'; column: number }
  | { type: 'next_round' }
);

function createEmptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function dropPiece(board: Board, col: number, piece: 1 | 2): number {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 0) {
      board[row][col] = piece;
      return row;
    }
  }
  return -1; // column full
}

function checkWin(board: Board, row: number, col: number, piece: 1 | 2): [number, number][] | null {
  const directions = [
    [0, 1],  // horizontal
    [1, 0],  // vertical
    [1, 1],  // diagonal down-right
    [1, -1], // diagonal down-left
  ];

  for (const [dr, dc] of directions) {
    const cells: [number, number][] = [[row, col]];

    // Check forward
    for (let i = 1; i < 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== piece) break;
      cells.push([r, c]);
    }

    // Check backward
    for (let i = 1; i < 4; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r][c] !== piece) break;
      cells.push([r, c]);
    }

    if (cells.length >= 4) return cells;
  }

  return null;
}

function isBoardFull(board: Board): boolean {
  return board[0].every(cell => cell !== 0);
}

export class ConnectFourRoom extends CardRoom {
  protected get minPlayers(): number { return 2; }
  protected get maxPlayers(): number { return 2; }
  protected get gameType(): string { return 'connect_four'; }

  private getTable(): ConnectFourTableState {
    const stored = this.tableState as ConnectFourTableState | null;
    if (!stored) {
      return {
        board: createEmptyBoard(),
        pieces: {},
        lastMove: null,
        winnerId: null,
        winCells: null,
        isDraw: false,
      };
    }
    return stored;
  }

  private setTable(table: ConnectFourTableState): void {
    this.tableState = table;
  }

  protected initRound(): void {
    const playerIds = Array.from(this.players.keys());
    this.turnOrder = playerIds;
    const pieces: Record<string, 1 | 2> = {};

    // Alternate who goes first each round
    if (this.roundNumber % 2 === 1) {
      pieces[playerIds[0]] = 1;
      pieces[playerIds[1]] = 2;
    } else {
      pieces[playerIds[0]] = 2;
      pieces[playerIds[1]] = 1;
    }

    // Player 1 always goes first
    this.currentTurn = Object.entries(pieces).find(([, p]) => p === 1)?.[0] ?? playerIds[0];

    this.setTable({
      board: createEmptyBoard(),
      pieces,
      lastMove: null,
      winnerId: null,
      winCells: null,
      isDraw: false,
    });
  }

  protected async handleAction(playerId: string, action: ConnectFourAction): Promise<void> {
    if (action.type === 'next_round' && playerId === this.hostId) {
      if (this.phase !== 'round_over') return;
      this.roundNumber++;
      this.phase = 'playing';
      this.initRound();
      this.broadcastState();
      // Bot scheduling handled by base class after handleAction returns
      return;
    }

    if (action.type !== 'drop_piece') return;
    if (this.phase !== 'playing') return;
    if (this.currentTurn !== playerId) {
      this.sendTo(playerId, { type: 'error', message: 'Not your turn' });
      return;
    }

    const table = this.getTable();
    if (table.winnerId || table.isDraw) return;

    const col = action.column;
    if (col < 0 || col >= COLS) {
      this.sendTo(playerId, { type: 'error', message: 'Invalid column' });
      return;
    }

    const piece = table.pieces[playerId];
    if (!piece) return;

    const row = dropPiece(table.board, col, piece);
    if (row === -1) {
      this.sendTo(playerId, { type: 'error', message: 'Column is full' });
      return;
    }

    table.lastMove = { row, col };

    // Check for win
    const winCells = checkWin(table.board, row, col, piece);
    if (winCells) {
      table.winnerId = playerId;
      table.winCells = winCells;
      this.setTable(table);
      this.phase = 'round_over';

      // Update scores
      const current = this.scores.get(playerId) ?? 0;
      this.scores.set(playerId, current + 1);

      this.broadcastState();
      this.recordGameEnd(playerId).then(() => this.awardConnectFourBadges(playerId, false)).catch(() => {});
      return;
    }

    // Check for draw
    if (isBoardFull(table.board)) {
      table.isDraw = true;
      this.setTable(table);
      this.phase = 'round_over';
      this.broadcastState();
      this.recordGameEnd(null).then(() => this.awardConnectFourBadges(null, true)).catch(() => {});
      return;
    }

    // Advance turn to the other player
    const otherPlayer = this.turnOrder.find(id => id !== playerId)!;
    this.currentTurn = otherPlayer;

    this.setTable(table);
    this.broadcastState();
  }

  protected checkRoundEnd(): string | null {
    const table = this.getTable();
    return table.winnerId;
  }

  protected async processBotTurn(): Promise<void> {
    if (!this.currentTurn || !this.bots.has(this.currentTurn)) return;
    if (this.phase !== 'playing') return;

    const botId = this.currentTurn;
    const table = this.getTable();
    const piece = table.pieces[botId];
    if (!piece) return;

    const col = connectFourBotDecision(table.board, piece);
    await this.handleAction(botId, { type: 'drop_piece', column: col });

    if (this.isBotTurn() && this.phase === 'playing') {
      await this.scheduleBotTurn();
    }
  }

  /** Award Connect 4-specific badges. */
  private async awardConnectFourBadges(winnerId: string | null, isDraw: boolean): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const db = this.env.DB;
      const stmts: D1PreparedStatement[] = [];

      // Connect Four Win badge
      if (winnerId && !this.bots.has(winnerId) && !winnerId.startsWith('guest_')) {
        stmts.push(
          db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
            .bind(winnerId, 'b_connect_four_win', now)
        );
      }

      // Stalemate badge (easter egg) — awarded to both players on draw
      if (isDraw) {
        for (const [id] of this.players) {
          if (this.bots.has(id) || id.startsWith('guest_')) continue;
          stmts.push(
            db.prepare('INSERT OR IGNORE INTO player_badges (player_id, badge_id, awarded_at) VALUES (?, ?, ?)')
              .bind(id, 'b_stalemate', now)
          );
        }
      }

      if (stmts.length > 0) await db.batch(stmts);
    } catch {}
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    await super.webSocketClose(ws, code, reason);
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    await super.webSocketError(ws, error);
  }

  protected getGameStateForPlayer(playerId: string): CardGameState {
    const table = this.getTable();

    const players = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      cardCount: 0,
      connected: p.connected,
      isHost: p.isHost,
      isBot: p.isBot,
    }));

    return {
      code: this.code,
      phase: this.phase,
      players,
      turnOrder: this.turnOrder,
      currentTurn: this.currentTurn,
      roundNumber: this.roundNumber,
      scores: Object.fromEntries(this.scores),
      tableState: {
        board: table.board,
        pieces: table.pieces,
        lastMove: table.lastMove,
        winnerId: table.winnerId,
        winCells: table.winCells,
        isDraw: table.isDraw,
        myPiece: table.pieces[playerId] ?? null,
      },
    };
  }
}
