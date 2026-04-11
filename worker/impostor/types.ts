import type { GamePhase, GameMode, Player, HintEntry, RoundResult } from '../../src/lib/types';

export interface ConnectedPlayerData {
  player: Player;
  role?: 'impostor' | 'player';
  word?: string;
  impostorHint?: string;
  hasVoted?: boolean;
  votedFor?: string;
  hintGiven?: boolean;
}

export interface RoomState {
  code: string;
  phase: GamePhase;
  mode: GameMode;
  players: [string, ConnectedPlayerData][]; // Map serialized as entries
  hostId: string;
  hintRound: number;
  totalHintRounds: number;
  category: string | null;
  currentWord: string | null;
  impostorId: string | null;
  turnOrder: string[];
  currentTurnIndex: number;
  hints: HintEntry[];
  allHintsHistory: HintEntry[][];
  roundResult: RoundResult | null;
  lastActivity: number;
  gameSessionId: string | null;
  disconnectTimestamps: [string, number][];
}
