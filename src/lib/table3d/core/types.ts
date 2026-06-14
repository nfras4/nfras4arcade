/**
 * Engine-agnostic type definitions for the table 3D layer.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 * These types mirror the LiarsDice ClientState/ClientMessage shapes
 * without directly importing from worker code.
 * See docs/table-porting.md for the boundary rule.
 */

// ─── State snapshot types ─────────────────────────────────────────────────────

/** Minimal per-player view the table layer needs. Mirrors ClientState.players[n]. */
export interface PlayerViewLike {
  id: string;
  name: string;
  connected: boolean;
  isBot: boolean;
  diceCount: number;
  eliminated: boolean;
  chips: number;
  nameColour?: string | null;
  hat?: string | null;
  titleText?: string | null;
  emblemSvg?: string | null;
  frameSvg?: string | null;
}

/** Minimal bid shape. Mirrors the Bid interface in liarsDice/room.ts. */
export interface BidLike {
  count: number;
  face: number;
  bidderId: string;
}

/** Minimal round result. Mirrors RoundResult in liarsDice/room.ts. */
export interface RoundResultLike {
  bid: BidLike;
  actualCount: number;
  callerId: string;
  loserId: string;
  revealedDice: Record<string, number[]>;
}

/**
 * Engine-agnostic snapshot of the liars-dice game state consumed by the table layer.
 * Mirrors the ClientState shape without importing from worker code.
 * Only fields needed by the presentation layer are included.
 */
export interface LDStateLike {
  phase: 'lobby' | 'playing' | 'round_over' | 'game_over';
  players: PlayerViewLike[];
  /** The local player's id. Used to determine which seat is the camera. */
  myId: string;
  currentTurnId: string | null;
  currentBid: BidLike | null;
  lastRoundResult: RoundResultLike | null;
  onesWild: boolean;
  /** Current pot size in chips. Used for POT_CHANGED events. */
  pot?: number;
  /**
   * Stable turn order (player ids). Used by REVEAL_STEP to iterate
   * revealedDice in a consistent order across clients.
   */
  turnOrder?: string[];
}

// ─── Semantic table events ────────────────────────────────────────────────────
// Derived by core/events.ts from consecutive LDStateLike snapshots.
// Components and the ritual timeline player consume events, not raw state diffs.

export type TableEvent =
  | { type: 'BID_PLACED';       bidderId: string; bid: BidLike; prevBid: BidLike | null }
  | { type: 'BIG_BID';          bidderId: string; bid: BidLike; prevBid: BidLike; prevBidderId: string }
  | { type: 'TURN_CHANGED';     newTurnId: string; prevTurnId: string | null }
  | { type: 'LIAR_CALLED';      callerId: string; accusedId: string; bid: BidLike }
  | { type: 'REVEAL_STEP';      playerId: string; stepIndex: number; totalSteps: number }
  | { type: 'VERDICT';          loserId: string; vindicatedId: string; result: RoundResultLike }
  | { type: 'PLAYER_ELIMINATED';playerId: string }
  | { type: 'PHASE_CHANGED';    newPhase: LDStateLike['phase']; prevPhase: LDStateLike['phase'] }
  | { type: 'POT_CHANGED';      pot: number; prevPot: number }
  | { type: 'EMOTE';            playerId: string; emoteId: string };
