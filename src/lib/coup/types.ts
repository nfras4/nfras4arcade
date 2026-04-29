/**
 * Client-facing Coup types. Mirrors what `worker/coup/room.ts` `getGameStateForPlayer`
 * broadcasts. Kept independent from `worker/coup/types.ts` for clean client/server split.
 */

export type Influence = 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa';

export type CoupActionType =
  | 'income'
  | 'foreign_aid'
  | 'coup'
  | 'tax'
  | 'assassinate'
  | 'steal'
  | 'exchange';

export interface CoupActionView {
  type: CoupActionType;
  playerId: string;
  targetId?: string;
}

export interface CoupBlockView {
  blockerId: string;
  claimedRole: Influence;
}

export type PendingActionView =
  | null
  | {
      phase: 'awaiting_challenge';
      action: CoupActionView;
      passedBy: string[];
    }
  | {
      phase: 'awaiting_block';
      action: CoupActionView;
      passedBy: string[];
    }
  | {
      phase: 'awaiting_block_challenge';
      action: CoupActionView;
      block: CoupBlockView;
      passedBy: string[];
    }
  | {
      phase: 'lose_influence';
      targetId: string;
      reason: 'coup' | 'assassinate' | 'failed_challenge' | 'caught_bluff';
      originalAction: CoupActionView | null;
      cancelAction: boolean;
      resumeWith: 'effect' | 'next_turn';
    }
  | {
      phase: 'exchange_select';
      playerId: string;
      /** Only present for the actor themselves. */
      drawnCards?: Influence[];
      /** For other viewers, just the count. */
      drawnCardCount?: number;
    };

export interface CoupPlayerView {
  id: string;
  coins: number;
  eliminated: boolean;
  revealedCards: Influence[];
  hiddenCardCount: number;
  /** Only set for the viewing player themselves. */
  myCards?: Influence[];
}

export interface CoupLogEntry {
  ts: number;
  text: string;
}

export interface CoupTableView {
  playerStates: Record<string, CoupPlayerView>;
  currentPlayerId: string | null;
  pendingAction: PendingActionView;
  actionLog: CoupLogEntry[];
  buyIn: number;
  pot: number;
  deckCount: number;
  winnerId: string | null;
}

export interface CoupPlayerSummary {
  id: string;
  name: string;
  cardCount: number;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  frameSvg: string | null;
  emblemSvg: string | null;
  nameColour: string | null;
  titleBadgeId: string | null;
}

export type CoupPhase = 'lobby' | 'playing' | 'round_over' | 'game_over';

export interface CoupGameState {
  code: string;
  phase: CoupPhase;
  players: CoupPlayerSummary[];
  turnOrder: string[];
  currentTurn: string | null;
  roundNumber: number;
  scores: Record<string, number>;
  tableState: CoupTableView | null;
}

export const ROLE_GLYPH: Record<Influence, string> = {
  duke: '◆',
  assassin: '▲',
  captain: '◼',
  ambassador: '●',
  contessa: '★',
};

export const ROLE_LABEL: Record<Influence, string> = {
  duke: 'Duke',
  assassin: 'Assassin',
  captain: 'Captain',
  ambassador: 'Ambassador',
  contessa: 'Contessa',
};
