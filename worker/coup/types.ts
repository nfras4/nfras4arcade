/** Coup card types and game state. */

export type Influence = 'duke' | 'assassin' | 'captain' | 'ambassador' | 'contessa';

export interface CoupCard {
  role: Influence;
  /** Whether the card has been revealed (face-up). Once both cards are revealed, the player is eliminated. */
  revealed: boolean;
}

/** A game-internal action (declared by a player, not yet resolved). */
export type CoupActionType =
  | 'income'
  | 'foreign_aid'
  | 'coup'
  | 'tax'
  | 'assassinate'
  | 'steal'
  | 'exchange';

export interface CoupAction {
  type: CoupActionType;
  /** Player taking the action. */
  playerId: string;
  /** Target for actions that need one (coup, assassinate, steal). */
  targetId?: string;
}

/** Pending block info captured during awaiting_block_challenge. */
export interface PendingBlock {
  blockerId: string;
  claimedRole: Influence;
}

/** Within-turn pending state. Each phase has explicit transition rules. */
export type PendingAction =
  | null
  | {
      phase: 'awaiting_challenge';
      action: CoupAction;
      /** Players who have explicitly passed (won't challenge). */
      passedBy: string[];
    }
  | {
      phase: 'awaiting_block';
      action: CoupAction;
      /** Players who have passed (won't block). */
      passedBy: string[];
    }
  | {
      phase: 'awaiting_block_challenge';
      action: CoupAction;
      block: PendingBlock;
      /** Players who have passed (won't challenge the block). */
      passedBy: string[];
    }
  | {
      phase: 'lose_influence';
      targetId: string;
      reason: 'coup' | 'assassinate' | 'failed_challenge' | 'caught_bluff';
      /** Original action being processed (used to resume the turn afterward). */
      originalAction: CoupAction | null;
      /** If reason is 'caught_bluff' or 'failed_challenge', the original action was canceled. */
      cancelAction: boolean;
      /** If true, after this resolves we should advance to next pending phase rather than next turn. */
      resumeWith: 'effect' | 'next_turn';
    }
  | {
      phase: 'exchange_select';
      playerId: string;
      drawnCards: Influence[];
    };

export interface CoupActionLogEntry {
  /** Unix ms timestamp. */
  ts: number;
  /** Human-readable description for the action log. */
  text: string;
}

export type CoupTablePhase =
  | 'idle'
  | 'awaiting_challenge'
  | 'awaiting_block'
  | 'awaiting_block_challenge'
  | 'lose_influence'
  | 'exchange_select';

export interface CoupPlayerState {
  /** Face-down + face-up cards. Length is always 2 unless something is mid-resolution. */
  cards: CoupCard[];
  coins: number;
  eliminated: boolean;
}

export interface CoupTableState {
  /** Influence deck (face-down cards available for draw). */
  deck: Influence[];
  /** Per-player coup state, keyed by playerId. */
  playerStates: Record<string, CoupPlayerState>;
  /** Index into turnOrder of the active player. */
  currentPlayerIdx: number;
  /** Order players take turns; mirrors CardRoom turnOrder. */
  turnOrder: string[];
  /** Pending action being resolved within the current turn. */
  pendingAction: PendingAction;
  /** Action log (most recent last). */
  actionLog: CoupActionLogEntry[];
  /** Buy-in per player. 0 = casual / no chips. */
  buyIn: number;
  /** Total chip pot, awarded to winner. */
  pot: number;
  /** Players who failed to pay buy-in (auto-forfeit). */
  forfeitedAtStart: string[];
  /** Final winner (set when game over). */
  winnerId: string | null;
}

/** Client-facing per-player view (other players' face-down cards hidden). */
export interface CoupClientPlayerView {
  id: string;
  coins: number;
  eliminated: boolean;
  /** Face-up (revealed) cards visible to all. */
  revealedCards: Influence[];
  /** Number of face-down cards (visible card count for anyone). */
  hiddenCardCount: number;
  /** Only set for the viewer themselves. */
  myCards?: Influence[];
}
