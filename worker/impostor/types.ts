import type { GamePhase, GameMode, Player, HintEntry, RoundResult } from '../../src/lib/types';
import type { Device } from '../cards/types';

export interface ConnectedPlayerData {
  player: Player;
  role?: 'impostor' | 'player';
  word?: string;
  impostorHint?: string;
  hasVoted?: boolean;
  votedFor?: string;
  hintGiven?: boolean;
  devices?: Device[];
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
  spectators?: [string, string][];
  devices?: [string, Device[]][];
}
