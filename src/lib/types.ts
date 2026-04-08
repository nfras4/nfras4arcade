export type GamePhase = 'lobby' | 'hints' | 'discussion' | 'voting' | 'reveal' | 'game_over';
export type GameMode = 'text' | 'voice';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  connected: boolean;
  connectionStatus: ConnectionStatus;
}

export interface HintEntry {
  playerId: string;
  playerName: string;
  text: string;
  hintRound: number;
}

export interface VoteResult {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
}

export interface RoundResult {
  impostorId: string;
  impostorName: string;
  word: string;
  category: string;
  impostorHint: string;
  votes: VoteResult[];
  impostorCaught: boolean;
}

export interface GameState {
  code: string;
  phase: GamePhase;
  mode: GameMode;
  players: Player[];
  hostId: string;
  // Hint rounds (1, 2, or 3) within a single game
  hintRound: number;
  totalHintRounds: number; // default 2
  canExtraRound: boolean;  // true if < 3 and >= totalHintRounds
  category: string | null;
  // Only sent to the specific player
  role?: 'impostor' | 'player';
  word?: string;
  impostorHint?: string;
  // Turn-based hints
  turnOrder: string[];
  currentTurnIndex: number;
  hints: HintEntry[];       // current round hints
  allHints: HintEntry[][];  // all rounds' hints grouped
  // Voting
  hasVoted: boolean;
  // Results
  roundResult?: RoundResult;
}

// Client → Server messages
export type ClientMessage =
  | { type: 'join'; code: string; name?: string }
  | { type: 'select_category'; category: string }
  | { type: 'select_mode'; mode: GameMode }
  | { type: 'start_game' }
  | { type: 'give_hint'; text: string }
  | { type: 'mark_done' }
  | { type: 'chat'; text: string }
  | { type: 'next_hint_round' }
  | { type: 'start_voting' }
  | { type: 'vote'; targetId: string }
  | { type: 'play_again' }
  | { type: 'end_game' }
  | { type: 'leave_game' }
  | { type: 'ping' };

// Server → Client messages
export type ServerMessage =
  | { type: 'joined'; playerId: string; state: GameState }
  | { type: 'state_update'; state: GameState }
  | { type: 'hint_given'; hint: HintEntry }
  | { type: 'player_done'; playerId: string }
  | { type: 'chat_message'; playerId: string; name: string; text: string; timestamp: number }
  | { type: 'vote_cast'; voterId: string }
  | { type: 'round_result'; result: RoundResult }
  | { type: 'error'; message: string }
  | { type: 'lobby_dissolved'; message: string }
  | { type: 'pong' };
