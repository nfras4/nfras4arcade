/** Coup bot heuristics — simple, deterministic-ish given a real state.
 *
 * Strategy:
 *  - Force coup at >= 7 coins on the strongest opponent.
 *  - If the bot has Duke, prefer tax over income.
 *  - If the bot has Captain, prefer steal on a target with coins.
 *  - If the bot has Assassin and >=3 coins, sometimes assassinate the leader.
 *  - Avoid bluffing: only declare role-actions for roles the bot actually has.
 *  - Always block Assassinate with Contessa when bot has it.
 *  - Block steal with Captain/Ambassador when bot has them.
 *  - Block foreign aid with Duke when bot has it.
 *  - Rarely challenge (only if the bot itself holds 2 of the claimed role,
 *    making the claim provably impossible -- 3 in deck total).
 */

import type { CoupAction, CoupTableState, Influence, PendingAction } from './types';
import { hasRole, alivePlayers, claimedRole, isChallengeable } from './engine';

/** Pick a target — opponent with the most coins, breaking ties by lowest id. */
function pickTarget(state: CoupTableState, botId: string): string | undefined {
  const opponents = alivePlayers(state).filter((id) => id !== botId);
  if (opponents.length === 0) return undefined;
  opponents.sort((a, b) => {
    const ca = state.playerStates[a]?.coins ?? 0;
    const cb = state.playerStates[b]?.coins ?? 0;
    if (ca !== cb) return cb - ca;
    return a < b ? -1 : 1;
  });
  return opponents[0];
}

/** Decide the bot's action when it's their turn (no pendingAction). */
export function coupBotDeclareAction(state: CoupTableState, botId: string): CoupAction {
  const ps = state.playerStates[botId];
  if (!ps) {
    return { type: 'income', playerId: botId };
  }
  // Mandatory coup at 10+ coins
  if (ps.coins >= 10) {
    const target = pickTarget(state, botId);
    return { type: 'coup', playerId: botId, targetId: target };
  }
  // Coup if affordable and it'd kill the strongest threat
  if (ps.coins >= 7) {
    const target = pickTarget(state, botId);
    return { type: 'coup', playerId: botId, targetId: target };
  }
  // Use roles we actually have
  if (hasRole(state, botId, 'duke')) {
    return { type: 'tax', playerId: botId };
  }
  if (hasRole(state, botId, 'assassin') && ps.coins >= 3) {
    const target = pickTarget(state, botId);
    if (target) {
      return { type: 'assassinate', playerId: botId, targetId: target };
    }
  }
  if (hasRole(state, botId, 'captain')) {
    // Pick a target that actually has coins
    const opponents = alivePlayers(state).filter(
      (id) => id !== botId && (state.playerStates[id]?.coins ?? 0) > 0,
    );
    if (opponents.length > 0) {
      opponents.sort(
        (a, b) => (state.playerStates[b].coins) - (state.playerStates[a].coins),
      );
      return { type: 'steal', playerId: botId, targetId: opponents[0] };
    }
  }
  // Fall through: income (always safe)
  return { type: 'income', playerId: botId };
}

/** Decision for an awaiting_challenge phase: challenge the action or pass. */
export function coupBotShouldChallenge(state: CoupTableState, botId: string): boolean {
  const pa = state.pendingAction;
  if (!pa) return false;
  let claim: Influence | null = null;
  if (pa.phase === 'awaiting_challenge') {
    if (!isChallengeable(pa.action)) return false;
    claim = claimedRole(pa.action);
  } else if (pa.phase === 'awaiting_block_challenge') {
    claim = pa.block.claimedRole;
  } else {
    return false;
  }
  if (!claim) return false;
  // Only challenge if the bot itself holds 2 of the claimed role —
  // the deck has 3 total, so the claim can only be true if the third is
  // in the claimer's hand, making it 50/50. Skip even then; bots are timid.
  let owned = 0;
  const ps = state.playerStates[botId];
  if (!ps) return false;
  for (const c of ps.cards) {
    if (!c.revealed && c.role === claim) owned++;
  }
  // If bot owns all 3 of the role, the claim is impossible — challenge.
  return owned >= 3;
}

/** Decision for an awaiting_block phase: block (with which role) or pass. */
export function coupBotShouldBlock(
  state: CoupTableState,
  botId: string,
): { block: true; role: Influence } | { block: false } {
  const pa = state.pendingAction;
  if (!pa || pa.phase !== 'awaiting_block') return { block: false };
  const action = pa.action;
  // Bot can only block actions that target it OR foreign_aid (which anyone can block as Duke)
  if (action.type === 'foreign_aid') {
    if (hasRole(state, botId, 'duke')) return { block: true, role: 'duke' };
    return { block: false };
  }
  if (action.targetId !== botId) return { block: false };
  if (action.type === 'assassinate') {
    if (hasRole(state, botId, 'contessa')) return { block: true, role: 'contessa' };
    return { block: false };
  }
  if (action.type === 'steal') {
    if (hasRole(state, botId, 'captain')) return { block: true, role: 'captain' };
    if (hasRole(state, botId, 'ambassador')) return { block: true, role: 'ambassador' };
    return { block: false };
  }
  return { block: false };
}

/** Decision when the bot must pick which face-down card to lose. */
export function coupBotPickLoseCard(state: CoupTableState, botId: string): number {
  const ps = state.playerStates[botId];
  if (!ps) return 0;
  // Prefer to keep duplicates of strong roles; lose the weakest face-down.
  // Simple heuristic: lose the first non-revealed card.
  for (let i = 0; i < ps.cards.length; i++) {
    if (!ps.cards[i].revealed) return i;
  }
  return 0;
}

/** Decision for exchange: keep the strongest 2 of the available pool.
 *  Pool order = [face-down cards from current hand, then drawn cards]. */
export function coupBotPickExchange(state: CoupTableState, botId: string): number[] {
  const pa = state.pendingAction;
  if (!pa || pa.phase !== 'exchange_select' || pa.playerId !== botId) return [];
  const ps = state.playerStates[botId];
  if (!ps) return [];
  const handFaceDownIdx: number[] = [];
  for (let i = 0; i < ps.cards.length; i++) {
    if (!ps.cards[i].revealed) handFaceDownIdx.push(i);
  }
  const pool: Influence[] = [];
  for (const idx of handFaceDownIdx) pool.push(ps.cards[idx].role);
  for (const role of pa.drawnCards) pool.push(role);

  // Score each role: duke=4, assassin=3, captain=3, contessa=2, ambassador=1
  const score: Record<Influence, number> = {
    duke: 4,
    assassin: 3,
    captain: 3,
    contessa: 2,
    ambassador: 1,
  };
  const indexed = pool.map((role, idx) => ({ idx, role, score: score[role] }));
  indexed.sort((a, b) => b.score - a.score);
  const required = handFaceDownIdx.length;
  return indexed.slice(0, required).map((x) => x.idx);
}

/** Top-level decision used by the room. Returns the message to handle, or null to pass. */
export type CoupBotDecision =
  | { type: 'declare'; action: CoupAction }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'block'; role: Influence }
  | { type: 'lose_card'; cardIdx: number }
  | { type: 'exchange_select'; keepIndices: number[] };

export function coupBotDecision(state: CoupTableState, botId: string): CoupBotDecision {
  const pa: PendingAction = state.pendingAction;
  if (!pa) {
    return { type: 'declare', action: coupBotDeclareAction(state, botId) };
  }
  if (pa.phase === 'awaiting_challenge') {
    if (pa.action.playerId === botId) return { type: 'pass' };
    if (coupBotShouldChallenge(state, botId)) return { type: 'challenge' };
    return { type: 'pass' };
  }
  if (pa.phase === 'awaiting_block') {
    if (pa.action.playerId === botId) return { type: 'pass' };
    const dec = coupBotShouldBlock(state, botId);
    if (dec.block) return { type: 'block', role: dec.role };
    return { type: 'pass' };
  }
  if (pa.phase === 'awaiting_block_challenge') {
    if (pa.block.blockerId === botId) return { type: 'pass' };
    if (coupBotShouldChallenge(state, botId)) return { type: 'challenge' };
    return { type: 'pass' };
  }
  if (pa.phase === 'lose_influence') {
    if (pa.targetId !== botId) return { type: 'pass' };
    return { type: 'lose_card', cardIdx: coupBotPickLoseCard(state, botId) };
  }
  if (pa.phase === 'exchange_select') {
    if (pa.playerId !== botId) return { type: 'pass' };
    return { type: 'exchange_select', keepIndices: coupBotPickExchange(state, botId) };
  }
  return { type: 'pass' };
}
