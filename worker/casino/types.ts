export type CasinoPhase = 'lobby' | 'betting' | 'playing' | 'resolving' | 'round_over';

export interface CasinoPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  chips: number;
  isGuest: boolean;
  frameSvg?: string | null;
  emblemSvg?: string | null;
  nameColour?: string | null;
  titleBadgeId?: string | null;
}

export interface CasinoGameState {
  code: string;
  phase: CasinoPhase;
  players: {
    id: string;
    name: string;
    chips: number;
    connected: boolean;
    isHost: boolean;
    frameSvg?: string | null;
    emblemSvg?: string | null;
    nameColour?: string | null;
    titleBadgeId?: string | null;
  }[];
  roundNumber: number;
  minBet: number;
  maxBet: number;
  tableState: unknown;
  spectators?: { id: string; name: string }[];
}

export interface CasinoAction {
  type: string;
}

export interface CasinoStoredState {
  code: string;
  phase: CasinoPhase;
  players: [string, CasinoPlayer][];
  hostId: string;
  roundNumber: number;
  tableState: unknown;
  lastActivity: number;
  minBet: number;
  maxBet: number;
  disconnectTimestamps?: [string, number][];
  spectators?: [string, string][];
  gameSessionId?: string | null;
}
