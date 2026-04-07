export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  /** Numeric value for comparison. Game-specific ranking can override this. */
  value: number;
}

export type CardGamePhase = 'lobby' | 'playing' | 'round_over' | 'game_over';

export interface CardPlayer {
  id: string;
  name: string;
  hand: Card[];
  connected: boolean;
  isHost: boolean;
}

export interface CardGameState {
  code: string;
  phase: CardGamePhase;
  players: { id: string; name: string; cardCount: number; connected: boolean; isHost: boolean }[];
  turnOrder: string[];
  currentTurn: string | null;
  roundNumber: number;
  scores: Record<string, number>;
  /** Game-specific table state -- each subclass defines shape */
  tableState: unknown;
}

/** Base action type -- each game extends this union */
export interface CardAction {
  type: string;
  playerId?: string;
}

export interface CardRoomStoredState {
  code: string;
  phase: CardGamePhase;
  players: [string, CardPlayer][];
  turnOrder: string[];
  currentTurn: string | null;
  roundNumber: number;
  scores: [string, number][];
  tableState: unknown;
  hostId: string;
  lastActivity: number;
}
