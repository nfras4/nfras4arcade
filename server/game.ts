import type { GamePhase, GameMode, Player, HintEntry, VoteResult, RoundResult, GameState, ServerMessage } from '../src/lib/types';
import { getRandomWord, getRandomCategory, getCategories } from './words';

interface ConnectedPlayer {
  player: Player;
  ws: any; // Bun WebSocket
  role?: 'impostor' | 'player';
  word?: string;
  impostorHint?: string;
  hasVoted?: boolean;
  votedFor?: string;
  hintGiven?: boolean;
}

export class GameRoom {
  code: string;
  phase: GamePhase = 'lobby';
  mode: GameMode = 'text';
  players: Map<string, ConnectedPlayer> = new Map();
  hostId: string = '';
  hintRound: number = 0;
  totalHintRounds: number = 2; // standard: 2 hint rounds before voting
  category: string | null = null;
  currentWord: string | null = null;
  impostorId: string | null = null;
  turnOrder: string[] = [];
  currentTurnIndex: number = 0;
  hints: HintEntry[] = [];           // current round's hints
  allHintsHistory: HintEntry[][] = []; // all previous rounds' hints
  roundResult: RoundResult | null = null;
  lastActivity: number = Date.now();

  constructor(code: string) {
    this.code = code;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  addPlayer(id: string, name: string, ws: any): { success: boolean; error?: string } {
    if (this.phase !== 'lobby') {
      return { success: false, error: 'Game already in progress' };
    }
    if (this.players.size >= 8) {
      return { success: false, error: 'Room is full (max 8 players)' };
    }
    const isHost = this.players.size === 0;
    const player: Player = { id, name, isHost, connected: true };
    this.players.set(id, { player, ws });

    if (isHost) {
      this.hostId = id;
    }

    return { success: true };
  }

  removePlayer(id: string): boolean {
    const cp = this.players.get(id);
    if (!cp) return false;

    if (this.phase === 'lobby') {
      this.players.delete(id);
      if (id === this.hostId && this.players.size > 0) {
        const newHost = this.players.values().next().value!;
        newHost.player.isHost = true;
        this.hostId = newHost.player.id;
      }
    } else {
      cp.player.connected = false;
      cp.ws = null;
    }

    return this.players.size === 0;
  }

  reconnectPlayer(id: string, ws: any): boolean {
    const cp = this.players.get(id);
    if (!cp) return false;
    cp.player.connected = true;
    cp.ws = ws;
    return true;
  }

  selectCategory(category: string): void {
    this.category = category;
  }

  selectMode(mode: GameMode): void {
    this.mode = mode;
  }

  startGame(): { success: boolean; error?: string } {
    if (this.players.size < 3) {
      return { success: false, error: 'Need at least 3 players to start' };
    }

    if (!this.category) {
      this.category = getRandomCategory();
    }

    // Pick a word
    const wordData = getRandomWord(this.category!);
    if (!wordData) {
      return { success: false, error: 'No words available for this category' };
    }

    this.currentWord = wordData.word;

    // Pick impostor
    const playerIds = Array.from(this.players.keys()).filter(
      id => this.players.get(id)!.player.connected
    );
    this.impostorId = playerIds[Math.floor(Math.random() * playerIds.length)];

    // Assign roles
    for (const [id, cp] of this.players) {
      if (id === this.impostorId) {
        cp.role = 'impostor';
        cp.word = undefined;
        cp.impostorHint = wordData.hint;
      } else {
        cp.role = 'player';
        cp.word = wordData.word;
        cp.impostorHint = undefined;
      }
      cp.hasVoted = false;
      cp.votedFor = undefined;
      cp.hintGiven = false;
    }

    // Start hint round 1
    this.hintRound = 1;
    this.allHintsHistory = [];
    this.hints = [];
    this.roundResult = null;
    this.turnOrder = this.shuffleArray([...playerIds]);
    this.currentTurnIndex = 0;
    this.phase = 'hints';

    return { success: true };
  }

  giveHint(playerId: string, text: string): { success: boolean; error?: string } {
    if (this.phase !== 'hints') {
      return { success: false, error: 'Not in hints phase' };
    }

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (playerId !== currentPlayerId) {
      return { success: false, error: 'Not your turn' };
    }

    const cp = this.players.get(playerId);
    if (!cp) return { success: false, error: 'Player not found' };

    const hint: HintEntry = {
      playerId,
      playerName: cp.player.name,
      text: text.trim(),
      hintRound: this.hintRound
    };

    this.hints.push(hint);
    cp.hintGiven = true;
    this.currentTurnIndex++;

    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.phase = 'discussion';
    }

    return { success: true };
  }

  markDone(playerId: string): { success: boolean; error?: string } {
    if (this.phase !== 'hints' || this.mode !== 'voice') {
      return { success: false, error: 'Cannot mark done' };
    }

    const currentPlayerId = this.turnOrder[this.currentTurnIndex];
    if (playerId !== currentPlayerId) {
      return { success: false, error: 'Not your turn' };
    }

    const cp = this.players.get(playerId);
    if (!cp) return { success: false, error: 'Player not found' };

    cp.hintGiven = true;
    this.hints.push({
      playerId,
      playerName: cp.player.name,
      text: '(spoke in voice chat)',
      hintRound: this.hintRound
    });
    this.currentTurnIndex++;

    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.phase = 'discussion';
    }

    return { success: true };
  }

  nextHintRound(): { success: boolean; error?: string } {
    if (this.phase !== 'discussion') {
      return { success: false, error: 'Not in discussion phase' };
    }
    if (this.hintRound >= 3) {
      return { success: false, error: 'Maximum 3 hint rounds reached' };
    }

    // Store current hints in history
    this.allHintsHistory.push([...this.hints]);

    // Start next hint round — same word, same impostor
    this.hintRound++;
    this.hints = [];
    this.currentTurnIndex = 0;

    // Reshuffle turn order
    const playerIds = Array.from(this.players.keys()).filter(
      id => this.players.get(id)!.player.connected
    );
    this.turnOrder = this.shuffleArray([...playerIds]);

    // Reset hint flags
    for (const cp of this.players.values()) {
      cp.hintGiven = false;
    }

    this.phase = 'hints';
    return { success: true };
  }

  startVoting(): { success: boolean; error?: string } {
    if (this.phase !== 'discussion') {
      return { success: false, error: 'Not in discussion phase' };
    }

    // Store current hints in history before voting
    this.allHintsHistory.push([...this.hints]);

    this.phase = 'voting';
    for (const cp of this.players.values()) {
      cp.hasVoted = false;
      cp.votedFor = undefined;
    }
    return { success: true };
  }

  vote(voterId: string, targetId: string): { success: boolean; allVoted?: boolean; error?: string } {
    if (this.phase !== 'voting') {
      return { success: false, error: 'Not in voting phase' };
    }

    const voter = this.players.get(voterId);
    if (!voter) return { success: false, error: 'Voter not found' };
    if (voter.hasVoted) return { success: false, error: 'Already voted' };
    if (voterId === targetId) return { success: false, error: 'Cannot vote for yourself' };
    if (!this.players.has(targetId)) return { success: false, error: 'Invalid target' };

    voter.hasVoted = true;
    voter.votedFor = targetId;

    const allVoted = Array.from(this.players.values())
      .filter(cp => cp.player.connected)
      .every(cp => cp.hasVoted);

    if (allVoted) {
      return { success: true, allVoted: true };
    }

    return { success: true, allVoted: false };
  }

  resolveVotes(): RoundResult {
    const votes: VoteResult[] = [];
    const voteCounts = new Map<string, number>();

    for (const [id, cp] of this.players) {
      if (cp.votedFor) {
        votes.push({
          voterId: id,
          voterName: cp.player.name,
          targetId: cp.votedFor,
          targetName: this.players.get(cp.votedFor)?.player.name || 'Unknown'
        });
        voteCounts.set(cp.votedFor, (voteCounts.get(cp.votedFor) || 0) + 1);
      }
    }

    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) maxVotes = count;
    }
    // Randomly select among tied players
    const tied = [...voteCounts.entries()].filter(([, c]) => c === maxVotes).map(([id]) => id);
    const accusedId = tied[Math.floor(Math.random() * tied.length)];

    const impostorCaught = accusedId === this.impostorId;
    const impostorCp = this.players.get(this.impostorId!)!;

    const result: RoundResult = {
      impostorId: this.impostorId!,
      impostorName: impostorCp.player.name,
      word: this.currentWord!,
      category: this.category!,
      impostorHint: impostorCp.impostorHint!,
      votes,
      impostorCaught
    };

    this.roundResult = result;
    this.phase = 'reveal';

    return result;
  }

  endGame(): void {
    this.phase = 'game_over';
  }

  playAgain(): { success: boolean; error?: string } {
    this.resetToLobby();
    return { success: true };
  }

  resetToLobby(): void {
    this.phase = 'lobby';
    this.hintRound = 0;
    this.currentWord = null;
    this.impostorId = null;
    this.turnOrder = [];
    this.currentTurnIndex = 0;
    this.hints = [];
    this.allHintsHistory = [];
    this.roundResult = null;

    for (const cp of this.players.values()) {
      cp.role = undefined;
      cp.word = undefined;
      cp.impostorHint = undefined;
      cp.hasVoted = false;
      cp.votedFor = undefined;
      cp.hintGiven = false;
    }
  }

  getStateForPlayer(playerId: string): GameState {
    const cp = this.players.get(playerId);
    const players: Player[] = Array.from(this.players.values()).map(p => p.player);

    return {
      code: this.code,
      phase: this.phase,
      mode: this.mode,
      players,
      hostId: this.hostId,
      hintRound: this.hintRound,
      totalHintRounds: this.totalHintRounds,
      canExtraRound: this.hintRound >= this.totalHintRounds && this.hintRound < 3,
      category: this.category,
      role: cp?.role,
      word: cp?.role === 'player' ? cp.word : undefined,
      impostorHint: cp?.role === 'impostor' ? cp.impostorHint : undefined,
      turnOrder: this.turnOrder,
      currentTurnIndex: this.currentTurnIndex,
      hints: this.hints,
      allHints: [...this.allHintsHistory, ...(this.hints.length > 0 ? [this.hints] : [])],
      hasVoted: cp?.hasVoted ?? false,
      roundResult: this.phase === 'reveal' || this.phase === 'game_over'
        ? this.roundResult ?? undefined
        : undefined
    };
  }

  broadcast(msg: ServerMessage, exclude?: string): void {
    for (const [id, cp] of this.players) {
      if (id === exclude || !cp.ws) continue;
      try {
        cp.ws.send(JSON.stringify(msg));
      } catch {}
    }
  }

  broadcastState(): void {
    for (const [id, cp] of this.players) {
      if (!cp.ws) continue;
      try {
        cp.ws.send(JSON.stringify({
          type: 'state_update',
          state: this.getStateForPlayer(id)
        } satisfies ServerMessage));
      } catch {}
    }
  }

  sendTo(playerId: string, msg: ServerMessage): void {
    const cp = this.players.get(playerId);
    if (!cp?.ws) return;
    try {
      cp.ws.send(JSON.stringify(msg));
    } catch {}
  }

  getAvailableCategories(): string[] {
    return getCategories();
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Room manager
const rooms = new Map<string, GameRoom>();

export function createRoom(): GameRoom {
  let code: string;
  do {
    code = generateCode();
  } while (rooms.has(code));

  const room = new GameRoom(code);
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code.toUpperCase());
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Room expiry: clean up rooms inactive for 30 minutes
const ROOM_EXPIRY_MS = 30 * 60 * 1000;

export function cleanupExpiredRooms(): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > ROOM_EXPIRY_MS) {
      // Close all player connections before removing
      for (const cp of room.players.values()) {
        if (cp.ws) {
          try {
            cp.ws.send(JSON.stringify({ type: 'error', message: 'Room expired due to inactivity' }));
            cp.ws.close();
          } catch {}
        }
      }
      rooms.delete(code);
      cleaned++;
    }
  }
  return cleaned;
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredRooms, 5 * 60 * 1000);
