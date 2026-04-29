/** Pure Coup engine functions. Deterministic given a seeded RNG.
 *
 * The engine accepts a `Rng` callable for shuffling/drawing so it stays
 * pure and testable. The room layer wraps `crypto.getRandomValues` into
 * an Rng; tests use a seeded Mulberry32.
 */

import type {
  CoupAction,
  CoupCard,
  CoupTableState,
  Influence,
  PendingAction,
} from './types';

export type Rng = () => number; // returns float in [0, 1)

/** Mulberry32 — small deterministic RNG seeded by a 32-bit integer. */
export function makeSeededRng(seed: number): Rng {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_INFLUENCES: Influence[] = [
  'duke', 'assassin', 'captain', 'ambassador', 'contessa',
];

/** Build a fresh 15-card deck (3 of each role). */
export function buildDeck(): Influence[] {
  const deck: Influence[] = [];
  for (const role of ALL_INFLUENCES) {
    deck.push(role, role, role);
  }
  return deck;
}

/** In-place Fisher-Yates shuffle using a seeded Rng. */
export function shuffleDeck<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deal initial state: 2 cards each, 2 coins each. */
export function initialDeal(playerIds: string[], rng: Rng): CoupTableState {
  const deck = shuffleDeck(buildDeck(), rng);
  const playerStates: Record<string, { cards: CoupCard[]; coins: number; eliminated: boolean }> = {};
  for (const id of playerIds) {
    const c1 = deck.shift();
    const c2 = deck.shift();
    if (!c1 || !c2) {
      throw new Error('coup: deck exhausted during initial deal');
    }
    playerStates[id] = {
      cards: [
        { role: c1, revealed: false },
        { role: c2, revealed: false },
      ],
      coins: 2,
      eliminated: false,
    };
  }
  return {
    deck,
    playerStates,
    currentPlayerIdx: 0,
    turnOrder: playerIds.slice(),
    pendingAction: null,
    actionLog: [],
    buyIn: 0,
    pot: 0,
    forfeitedAtStart: [],
    winnerId: null,
  };
}

/** Returns true if exactly one non-eliminated player remains. */
export function isGameOver(state: CoupTableState): boolean {
  return alivePlayers(state).length <= 1;
}

/** IDs of non-eliminated players, in turn order. */
export function alivePlayers(state: CoupTableState): string[] {
  return state.turnOrder.filter((id) => !state.playerStates[id]?.eliminated);
}

/** Required role for the action's claim, or null if none. */
export function claimedRole(action: CoupAction): Influence | null {
  switch (action.type) {
    case 'tax':
      return 'duke';
    case 'assassinate':
      return 'assassin';
    case 'steal':
      return 'captain';
    case 'exchange':
      return 'ambassador';
    default:
      return null;
  }
}

/** Whether an action can be challenged (it makes a role claim). */
export function isChallengeable(action: CoupAction): boolean {
  return claimedRole(action) !== null;
}

/** Roles that can block this action (empty if unblockable). */
export function blockerRoles(action: CoupAction): Influence[] {
  switch (action.type) {
    case 'foreign_aid':
      return ['duke'];
    case 'assassinate':
      return ['contessa'];
    case 'steal':
      return ['captain', 'ambassador'];
    default:
      return [];
  }
}

export function isBlockable(action: CoupAction): boolean {
  return blockerRoles(action).length > 0;
}

/** Whether the player has the given role face-down. */
export function hasRole(state: CoupTableState, playerId: string, role: Influence): boolean {
  const ps = state.playerStates[playerId];
  if (!ps) return false;
  return ps.cards.some((c) => !c.revealed && c.role === role);
}

/** Coin cost charged when the action is initially declared. */
function actionCost(action: CoupAction): number {
  switch (action.type) {
    case 'coup':
      return 7;
    case 'assassinate':
      return 3;
    default:
      return 0;
  }
}

/** Validate that a declared action is legal for the current player. */
export function validateAction(state: CoupTableState, action: CoupAction): string | null {
  const ps = state.playerStates[action.playerId];
  if (!ps) return 'unknown player';
  if (ps.eliminated) return 'player is eliminated';

  const alive = alivePlayers(state);
  if (alive[state.currentPlayerIdx % alive.length] !== action.playerId
      && state.turnOrder[state.currentPlayerIdx] !== action.playerId) {
    return 'not your turn';
  }
  if (state.pendingAction !== null) return 'cannot declare while another action is pending';

  // Must coup at 10+ coins
  if (ps.coins >= 10 && action.type !== 'coup') {
    return 'must coup with 10+ coins';
  }

  switch (action.type) {
    case 'income':
    case 'foreign_aid':
    case 'tax':
    case 'exchange':
      if (action.targetId) return 'this action takes no target';
      return null;
    case 'coup':
      if (ps.coins < 7) return 'need 7 coins to coup';
      if (!action.targetId) return 'coup needs a target';
      if (action.targetId === action.playerId) return 'cannot coup yourself';
      if (!state.playerStates[action.targetId] || state.playerStates[action.targetId].eliminated) {
        return 'invalid coup target';
      }
      return null;
    case 'assassinate':
      if (ps.coins < 3) return 'need 3 coins to assassinate';
      if (!action.targetId) return 'assassinate needs a target';
      if (action.targetId === action.playerId) return 'cannot assassinate yourself';
      if (!state.playerStates[action.targetId] || state.playerStates[action.targetId].eliminated) {
        return 'invalid assassinate target';
      }
      return null;
    case 'steal':
      if (!action.targetId) return 'steal needs a target';
      if (action.targetId === action.playerId) return 'cannot steal from yourself';
      if (!state.playerStates[action.targetId] || state.playerStates[action.targetId].eliminated) {
        return 'invalid steal target';
      }
      return null;
    default:
      return 'unknown action';
  }
}

/** Apply a freshly declared action: charge cost and set the appropriate pending phase.
 *  Caller must call validateAction first. Mutates a copy of state. */
export function applyAction(state: CoupTableState, action: CoupAction): CoupTableState {
  const next = cloneState(state);
  const ps = next.playerStates[action.playerId];

  // Charge cost up-front (assassinate cost is paid even if blocked or challenged)
  const cost = actionCost(action);
  if (cost > 0) {
    ps.coins -= cost;
  }

  switch (action.type) {
    case 'income': {
      ps.coins += 1;
      next.actionLog.push(logEntry(`${action.playerId} took income (+1 coin)`));
      advanceTurn(next);
      return next;
    }
    case 'coup': {
      // Coup cannot be blocked or challenged: target must lose influence
      next.pendingAction = {
        phase: 'lose_influence',
        targetId: action.targetId!,
        reason: 'coup',
        originalAction: action,
        cancelAction: false,
        resumeWith: 'next_turn',
      };
      next.actionLog.push(logEntry(`${action.playerId} couped ${action.targetId}`));
      return next;
    }
    case 'foreign_aid': {
      // Not challengeable, but blockable by Duke
      next.pendingAction = {
        phase: 'awaiting_block',
        action,
        passedBy: [],
      };
      next.actionLog.push(logEntry(`${action.playerId} declared foreign aid`));
      return next;
    }
    case 'tax':
    case 'assassinate':
    case 'steal':
    case 'exchange': {
      next.pendingAction = {
        phase: 'awaiting_challenge',
        action,
        passedBy: [],
      };
      const claim = claimedRole(action);
      next.actionLog.push(
        logEntry(`${action.playerId} declared ${action.type}${action.targetId ? ` on ${action.targetId}` : ''} (claims ${claim})`),
      );
      return next;
    }
  }
}

/** Apply the action's effect (after challenges/blocks resolve in its favor). */
export function applyActionEffect(state: CoupTableState, action: CoupAction): CoupTableState {
  const next = cloneState(state);
  switch (action.type) {
    case 'foreign_aid': {
      next.playerStates[action.playerId].coins += 2;
      next.actionLog.push(logEntry(`${action.playerId} took foreign aid (+2 coins)`));
      advanceTurn(next);
      return next;
    }
    case 'tax': {
      next.playerStates[action.playerId].coins += 3;
      next.actionLog.push(logEntry(`${action.playerId} taxed (+3 coins)`));
      advanceTurn(next);
      return next;
    }
    case 'assassinate': {
      const target = action.targetId!;
      // If target is already eliminated (rare race), skip
      if (next.playerStates[target] && !next.playerStates[target].eliminated) {
        next.pendingAction = {
          phase: 'lose_influence',
          targetId: target,
          reason: 'assassinate',
          originalAction: action,
          cancelAction: false,
          resumeWith: 'next_turn',
        };
        next.actionLog.push(logEntry(`${action.playerId}'s assassination on ${target} succeeds`));
      } else {
        advanceTurn(next);
      }
      return next;
    }
    case 'steal': {
      const target = action.targetId!;
      const stolen = Math.min(2, next.playerStates[target].coins);
      next.playerStates[target].coins -= stolen;
      next.playerStates[action.playerId].coins += stolen;
      next.actionLog.push(logEntry(`${action.playerId} stole ${stolen} from ${target}`));
      advanceTurn(next);
      return next;
    }
    case 'exchange': {
      // Draw 2 cards; player picks 2 to keep
      const drawn: Influence[] = [];
      for (let i = 0; i < 2; i++) {
        const c = next.deck.shift();
        if (c) drawn.push(c);
      }
      next.pendingAction = {
        phase: 'exchange_select',
        playerId: action.playerId,
        drawnCards: drawn,
      };
      next.actionLog.push(logEntry(`${action.playerId} drew exchange cards`));
      return next;
    }
    default:
      return next;
  }
}

/** Resolve a successful block (action canceled). */
export function applySuccessfulBlock(state: CoupTableState, action: CoupAction): CoupTableState {
  const next = cloneState(state);
  // For assassinate: cost was already paid. For steal/foreign_aid: no cost.
  next.actionLog.push(logEntry(`${action.type} was blocked`));
  next.pendingAction = null;
  advanceTurn(next);
  return next;
}

/** Resolve an exchange selection: keep `keepIndices` from drawnCards+currentHand. */
export function applyExchangeSelect(
  state: CoupTableState,
  playerId: string,
  keepIndices: number[],
  rng: Rng,
): { state: CoupTableState; error: string | null } {
  if (state.pendingAction?.phase !== 'exchange_select') {
    return { state, error: 'not in exchange phase' };
  }
  if (state.pendingAction.playerId !== playerId) {
    return { state, error: 'not your exchange' };
  }
  const next = cloneState(state);
  const ps = next.playerStates[playerId];
  // Build the candidate pool: current face-down cards + drawn cards
  const handFaceDownIdx: number[] = [];
  for (let i = 0; i < ps.cards.length; i++) {
    if (!ps.cards[i].revealed) handFaceDownIdx.push(i);
  }
  const pa = next.pendingAction as Extract<PendingAction, { phase: 'exchange_select' }>;
  const drawn = pa.drawnCards;
  const pool: Influence[] = [];
  for (const idx of handFaceDownIdx) pool.push(ps.cards[idx].role);
  for (const role of drawn) pool.push(role);

  // Player must keep exactly `handFaceDownIdx.length` cards
  const required = handFaceDownIdx.length;
  if (keepIndices.length !== required) {
    return { state, error: `must keep exactly ${required} cards` };
  }
  if (new Set(keepIndices).size !== keepIndices.length) {
    return { state, error: 'duplicate keep indices' };
  }
  for (const idx of keepIndices) {
    if (idx < 0 || idx >= pool.length) return { state, error: 'invalid keep index' };
  }

  const keptRoles = keepIndices.map((i) => pool[i]);
  const returnedRoles: Influence[] = [];
  for (let i = 0; i < pool.length; i++) {
    if (!keepIndices.includes(i)) returnedRoles.push(pool[i]);
  }

  // Replace face-down cards with kept roles
  let kIdx = 0;
  for (const idx of handFaceDownIdx) {
    ps.cards[idx] = { role: keptRoles[kIdx++], revealed: false };
  }
  // Return the rest to the deck and shuffle
  next.deck.push(...returnedRoles);
  next.deck = shuffleDeck(next.deck, rng);

  next.pendingAction = null;
  next.actionLog.push(logEntry(`${playerId} exchanged cards`));
  advanceTurn(next);
  return { state: next, error: null };
}

/** Reveal a face-down card (player loses an influence). */
export function applyLoseInfluence(
  state: CoupTableState,
  playerId: string,
  cardIdx: number,
): { state: CoupTableState; error: string | null } {
  const next = cloneState(state);
  const ps = next.playerStates[playerId];
  if (!ps) return { state, error: 'unknown player' };
  if (cardIdx < 0 || cardIdx >= ps.cards.length) return { state, error: 'invalid card index' };
  if (ps.cards[cardIdx].revealed) return { state, error: 'card already revealed' };
  ps.cards[cardIdx].revealed = true;
  // Eliminated if both cards face-up
  if (ps.cards.every((c) => c.revealed)) {
    ps.eliminated = true;
  }
  next.actionLog.push(logEntry(`${playerId} lost an influence (${ps.cards[cardIdx].role})`));
  return { state: next, error: null };
}

/** After a successful challenge against the claimer (claimer had the role): challenger loses a card,
 *  claimer reveals the card and draws a replacement (reveal-and-replace).
 *  Caller must specify which card the claimer reveals (the one matching the claim). */
export function applyChallengeWonByClaimer(
  state: CoupTableState,
  claimerId: string,
  revealedCardIdx: number,
  rng: Rng,
): { state: CoupTableState; error: string | null } {
  const next = cloneState(state);
  const ps = next.playerStates[claimerId];
  if (!ps) return { state, error: 'unknown player' };
  if (revealedCardIdx < 0 || revealedCardIdx >= ps.cards.length) {
    return { state, error: 'invalid card index' };
  }
  if (ps.cards[revealedCardIdx].revealed) return { state, error: 'card already revealed' };
  // Put revealed card back into deck, shuffle, draw replacement
  const revealedRole = ps.cards[revealedCardIdx].role;
  next.deck.push(revealedRole);
  next.deck = shuffleDeck(next.deck, rng);
  const newCard = next.deck.shift();
  if (!newCard) return { state, error: 'deck empty during replace' };
  ps.cards[revealedCardIdx] = { role: newCard, revealed: false };
  next.actionLog.push(logEntry(`${claimerId} revealed ${revealedRole} and drew a replacement`));
  return { state: next, error: null };
}

/** Replace a player's card by index (used after a successful challenge by claimer). */
export function replaceCard(
  state: CoupTableState,
  playerId: string,
  cardIdx: number,
  rng: Rng,
): { state: CoupTableState; error: string | null } {
  return applyChallengeWonByClaimer(state, playerId, cardIdx, rng);
}

/** Advance to the next non-eliminated player. */
export function advanceTurn(state: CoupTableState): void {
  if (state.turnOrder.length === 0) return;
  state.pendingAction = null;
  for (let i = 0; i < state.turnOrder.length; i++) {
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.turnOrder.length;
    const id = state.turnOrder[state.currentPlayerIdx];
    if (!state.playerStates[id]?.eliminated) return;
  }
}

/** Set winnerId if exactly one player remains. */
export function checkWinner(state: CoupTableState): string | null {
  const alive = alivePlayers(state);
  if (alive.length === 1) {
    state.winnerId = alive[0];
    return alive[0];
  }
  return null;
}

/** Resolve any pending state by applying the action effect (used after all challenges/blocks pass). */
export function resolvePending(state: CoupTableState): CoupTableState {
  const pa = state.pendingAction;
  if (!pa) return state;
  if (pa.phase === 'awaiting_challenge') {
    // No challenges came; if blockable, move to awaiting_block; else apply effect
    if (isBlockable(pa.action)) {
      const next = cloneState(state);
      next.pendingAction = { phase: 'awaiting_block', action: pa.action, passedBy: [] };
      return next;
    }
    return applyActionEffect(state, pa.action);
  }
  if (pa.phase === 'awaiting_block') {
    // No blocks; apply effect
    return applyActionEffect(state, pa.action);
  }
  if (pa.phase === 'awaiting_block_challenge') {
    // No one challenged the block; block stands; action canceled
    return applySuccessfulBlock(state, pa.action);
  }
  return state;
}

// --- Helpers ---

function logEntry(text: string) {
  return { ts: 0, text }; // ts filled in by room layer
}

function cloneState(state: CoupTableState): CoupTableState {
  return {
    deck: state.deck.slice(),
    playerStates: Object.fromEntries(
      Object.entries(state.playerStates).map(([id, ps]) => [
        id,
        {
          cards: ps.cards.map((c) => ({ ...c })),
          coins: ps.coins,
          eliminated: ps.eliminated,
        },
      ]),
    ),
    currentPlayerIdx: state.currentPlayerIdx,
    turnOrder: state.turnOrder.slice(),
    pendingAction: state.pendingAction
      ? JSON.parse(JSON.stringify(state.pendingAction))
      : null,
    actionLog: state.actionLog.slice(),
    buyIn: state.buyIn,
    pot: state.pot,
    forfeitedAtStart: state.forfeitedAtStart.slice(),
    winnerId: state.winnerId,
  };
}
