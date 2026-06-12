/**
 * Pure event derivation for the Monkey Table.
 * Compares two consecutive LDStateLike snapshots and returns the semantic
 * TableEvents that occurred between them.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 * See docs/table-porting.md for the boundary rule.
 */

import type { LDStateLike, TableEvent, BidLike } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stable string key for a bid; null bid returns null. */
function bidKey(bid: BidLike | null): string | null {
  if (!bid) return null;
  return `${bid.bidderId}:${bid.count}:${bid.face}`;
}

// ─── Main derivation ──────────────────────────────────────────────────────────

/**
 * Derive semantic table events from a state transition.
 *
 * @param prev  The previous snapshot, or null on first render.
 * @param next  The current snapshot.
 * @returns     Ordered list of events that occurred in this transition.
 */
export function deriveTableEvents(
  prev: LDStateLike | null,
  next: LDStateLike,
): TableEvent[] {
  const events: TableEvent[] = [];

  // ── BID_PLACED / BIG_BID ─────────────────────────────────────────────────
  const prevBidKey = bidKey(prev?.currentBid ?? null);
  const nextBidKey = bidKey(next.currentBid);

  if (next.currentBid !== null && nextBidKey !== prevBidKey) {
    const prevBid = prev?.currentBid ?? null;
    events.push({
      type: 'BID_PLACED',
      bidderId: next.currentBid.bidderId,
      bid: next.currentBid,
      prevBid,
    });

    // BIG_BID: count jumps >= 2 over previous bid's count AND there was a prev bid
    if (prevBid !== null && next.currentBid.count - prevBid.count >= 2) {
      events.push({
        type: 'BIG_BID',
        bidderId: next.currentBid.bidderId,
        bid: next.currentBid,
        prevBid,
        prevBidderId: prevBid.bidderId,
      });
    }
  }

  // ── TURN_CHANGED ─────────────────────────────────────────────────────────
  if (
    next.currentTurnId !== null &&
    next.currentTurnId !== prev?.currentTurnId
  ) {
    events.push({
      type: 'TURN_CHANGED',
      newTurnId: next.currentTurnId,
      prevTurnId: prev?.currentTurnId ?? null,
    });
  }

  // ── playing -> round_over transition ─────────────────────────────────────
  if (prev?.phase === 'playing' && next.phase === 'round_over' && next.lastRoundResult) {
    const result = next.lastRoundResult;

    // LIAR_CALLED
    events.push({
      type: 'LIAR_CALLED',
      callerId: result.callerId,
      accusedId: result.bid.bidderId,
      bid: result.bid,
    });

    // REVEAL_STEP: one per player, in turnOrder order (stable across clients).
    // Fall back to revealedDice key order if turnOrder is absent.
    const revealKeys = Object.keys(result.revealedDice);
    const orderedPlayers: string[] = next.turnOrder
      ? next.turnOrder.filter((id) => id in result.revealedDice)
      : revealKeys;

    // Include any players in revealedDice not present in turnOrder
    for (const id of revealKeys) {
      if (!orderedPlayers.includes(id)) orderedPlayers.push(id);
    }

    const totalSteps = orderedPlayers.length;
    orderedPlayers.forEach((playerId, stepIndex) => {
      events.push({
        type: 'REVEAL_STEP',
        playerId,
        stepIndex,
        totalSteps,
      });
    });

    // VERDICT: vindicatedId logic from spec:
    // if loserId === callerId -> accused bidder was honest -> vindicated = bid.bidderId
    // else -> caller was right -> vindicated = callerId
    const vindicatedId =
      result.loserId === result.callerId
        ? result.bid.bidderId
        : result.callerId;

    events.push({
      type: 'VERDICT',
      loserId: result.loserId,
      vindicatedId,
      result,
    });
  }

  // ── PLAYER_ELIMINATED ────────────────────────────────────────────────────
  if (prev) {
    const prevPlayerMap = new Map(prev.players.map((p) => [p.id, p]));
    for (const player of next.players) {
      const prevPlayer = prevPlayerMap.get(player.id);
      if (prevPlayer && !prevPlayer.eliminated && player.eliminated) {
        events.push({ type: 'PLAYER_ELIMINATED', playerId: player.id });
      }
    }
  }

  // ── POT_CHANGED ──────────────────────────────────────────────────────────
  const prevPot = prev?.pot ?? 0;
  const nextPot = next.pot ?? 0;
  if (nextPot !== prevPot && prev !== null) {
    events.push({ type: 'POT_CHANGED', pot: nextPot, prevPot });
  }

  return events;
}
