export type CasinoPhase = 'lobby' | 'betting' | 'playing' | 'resolving' | 'round_over';

import type { Device } from '../cards/types';

export interface CasinoPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  chips: number;
  /**
   * The value of `chips` at the moment we last successfully persisted to D1
   * (or freshly seeded from D1 / X-Player-Chips). Used to compute the delta
   * we write at the next persist so two simultaneous DOs (e.g. blackjack + roulette
   * at the same player) cannot double-spend or wipe winnings. Optional because
   * legacy stored state predates this field; loadState() backfills it to `chips`.
   */
  chipsAtLoad?: number;
  isGuest: boolean;
  devices?: Device[];
  frameSvg?: string | null;
  emblemSvg?: string | null;
  nameColour?: string | null;
  titleBadgeId?: string | null;
  titleText?: string | null;
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
    titleText?: string | null;
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
  devices?: [string, Device[]][];
}
