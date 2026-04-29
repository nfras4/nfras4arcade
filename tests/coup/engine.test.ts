import { describe, it, expect } from 'bun:test';
import {
  initialDeal,
  buildDeck,
  shuffleDeck,
  applyAction,
  applyActionEffect,
  applyExchangeSelect,
  applyLoseInfluence,
  applyChallengeWonByClaimer,
  resolvePending,
  validateAction,
  alivePlayers,
  isChallengeable,
  isBlockable,
  blockerRoles,
  hasRole,
  claimedRole,
  isGameOver,
  makeSeededRng,
} from '../../worker/coup/engine';
import type { CoupAction, CoupTableState, Influence } from '../../worker/coup/types';

const PLAYERS = ['p1', 'p2', 'p3'];

function deal(seed = 1, players = PLAYERS): CoupTableState {
  return initialDeal(players, makeSeededRng(seed));
}

describe('coup deck', () => {
  it('builds a 15-card deck (3 of each role)', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(15);
    const counts: Record<string, number> = {};
    for (const role of deck) counts[role] = (counts[role] ?? 0) + 1;
    expect(counts.duke).toBe(3);
    expect(counts.assassin).toBe(3);
    expect(counts.captain).toBe(3);
    expect(counts.ambassador).toBe(3);
    expect(counts.contessa).toBe(3);
  });

  it('shuffles deterministically with a seeded rng', () => {
    const a = shuffleDeck(buildDeck(), makeSeededRng(42));
    const b = shuffleDeck(buildDeck(), makeSeededRng(42));
    expect(a).toEqual(b);
    const c = shuffleDeck(buildDeck(), makeSeededRng(7));
    expect(a).not.toEqual(c);
  });
});

describe('coup initialDeal', () => {
  it('deals 2 cards and 2 coins to each player', () => {
    const state = deal();
    for (const id of PLAYERS) {
      expect(state.playerStates[id].cards.length).toBe(2);
      expect(state.playerStates[id].cards.every((c) => !c.revealed)).toBe(true);
      expect(state.playerStates[id].coins).toBe(2);
      expect(state.playerStates[id].eliminated).toBe(false);
    }
  });

  it('leaves 15 - 2*N cards in the deck', () => {
    const state = deal();
    expect(state.deck.length).toBe(15 - 2 * PLAYERS.length);
  });

  it('is deterministic given a seed', () => {
    const a = deal(123);
    const b = deal(123);
    expect(a.deck).toEqual(b.deck);
    for (const id of PLAYERS) {
      expect(a.playerStates[id].cards).toEqual(b.playerStates[id].cards);
    }
  });
});

describe('coup validateAction', () => {
  it('rejects coup with insufficient coins', () => {
    const state = deal();
    const err = validateAction(state, { type: 'coup', playerId: 'p1', targetId: 'p2' });
    expect(err).toBeTruthy();
  });

  it('forces coup at 10+ coins', () => {
    const state = deal();
    state.playerStates.p1.coins = 10;
    const incomeErr = validateAction(state, { type: 'income', playerId: 'p1' });
    expect(incomeErr).toBeTruthy();
    const coupErr = validateAction(state, { type: 'coup', playerId: 'p1', targetId: 'p2' });
    expect(coupErr).toBeNull();
  });

  it('rejects assassinate without coins', () => {
    const state = deal();
    state.playerStates.p1.coins = 2;
    const err = validateAction(state, { type: 'assassinate', playerId: 'p1', targetId: 'p2' });
    expect(err).toBeTruthy();
  });

  it('rejects targeting self', () => {
    const state = deal();
    state.playerStates.p1.coins = 7;
    const err = validateAction(state, { type: 'coup', playerId: 'p1', targetId: 'p1' });
    expect(err).toBeTruthy();
  });

  it('accepts income on first turn', () => {
    const state = deal();
    expect(validateAction(state, { type: 'income', playerId: 'p1' })).toBeNull();
  });
});

describe('coup income / foreign aid / coup application', () => {
  it('income gives +1 coin and advances turn', () => {
    const state = deal();
    const next = applyAction(state, { type: 'income', playerId: 'p1' });
    expect(next.playerStates.p1.coins).toBe(3);
    expect(next.pendingAction).toBeNull();
    expect(next.turnOrder[next.currentPlayerIdx]).toBe('p2');
  });

  it('coup charges 7 and queues lose_influence', () => {
    const state = deal();
    state.playerStates.p1.coins = 7;
    const next = applyAction(state, { type: 'coup', playerId: 'p1', targetId: 'p2' });
    expect(next.playerStates.p1.coins).toBe(0);
    expect(next.pendingAction?.phase).toBe('lose_influence');
    if (next.pendingAction?.phase === 'lose_influence') {
      expect(next.pendingAction.targetId).toBe('p2');
      expect(next.pendingAction.reason).toBe('coup');
    }
  });

  it('foreign_aid moves to awaiting_block', () => {
    const state = deal();
    const next = applyAction(state, { type: 'foreign_aid', playerId: 'p1' });
    expect(next.pendingAction?.phase).toBe('awaiting_block');
    expect(next.playerStates.p1.coins).toBe(2); // not yet credited
  });

  it('foreign_aid effect adds 2 coins after no block', () => {
    const state = deal();
    const declared = applyAction(state, { type: 'foreign_aid', playerId: 'p1' });
    const resolved = resolvePending(declared);
    expect(resolved.playerStates.p1.coins).toBe(4);
    expect(resolved.pendingAction).toBeNull();
    expect(resolved.turnOrder[resolved.currentPlayerIdx]).toBe('p2');
  });

  it('tax declares awaiting_challenge then awards 3 coins on resolve', () => {
    const state = deal();
    const declared = applyAction(state, { type: 'tax', playerId: 'p1' });
    expect(declared.pendingAction?.phase).toBe('awaiting_challenge');
    // Tax is unblockable; resolve directly
    const resolved = resolvePending(declared);
    expect(resolved.playerStates.p1.coins).toBe(5);
    expect(resolved.pendingAction).toBeNull();
  });

  it('steal awaiting_challenge -> awaiting_block -> effect', () => {
    const state = deal();
    state.playerStates.p2.coins = 5;
    const declared = applyAction(state, { type: 'steal', playerId: 'p1', targetId: 'p2' });
    expect(declared.pendingAction?.phase).toBe('awaiting_challenge');
    const afterChallenge = resolvePending(declared);
    expect(afterChallenge.pendingAction?.phase).toBe('awaiting_block');
    const afterBlock = resolvePending(afterChallenge);
    expect(afterBlock.playerStates.p1.coins).toBe(4);
    expect(afterBlock.playerStates.p2.coins).toBe(3);
  });
});

describe('coup challenges', () => {
  it('challenger loses if claimer has the role', () => {
    const state = deal();
    // Ensure p1 has a duke
    state.playerStates.p1.cards[0] = { role: 'duke', revealed: false };
    const initialDuke = state.playerStates.p1.cards[0].role;
    const matchingIdx = 0;
    const result = applyChallengeWonByClaimer(state, 'p1', matchingIdx, makeSeededRng(1));
    expect(result.error).toBeNull();
    expect(result.state.playerStates.p1.cards[matchingIdx].revealed).toBe(false);
    // Card was replaced (deck size decremented by 1 net: pop revealed, draw new)
    // Originally 15 - 6 = 9; after replace deck length is still 9
    expect(result.state.deck.length).toBe(state.deck.length);
  });

  it('claimer loses an influence if they did not have the role', () => {
    const state = deal();
    // Force p1 to have NO duke
    state.playerStates.p1.cards = [
      { role: 'assassin', revealed: false },
      { role: 'captain', revealed: false },
    ];
    expect(hasRole(state, 'p1', 'duke')).toBe(false);
    // Manually simulate caught_bluff: lose-influence on p1
    const result = applyLoseInfluence(state, 'p1', 0);
    expect(result.error).toBeNull();
    expect(result.state.playerStates.p1.cards[0].revealed).toBe(true);
    expect(result.state.playerStates.p1.eliminated).toBe(false); // still has 1 face-down
  });

  it('player is eliminated when both cards are revealed', () => {
    const state = deal();
    let next = applyLoseInfluence(state, 'p1', 0).state;
    next = applyLoseInfluence(next, 'p1', 1).state;
    expect(next.playerStates.p1.eliminated).toBe(true);
  });
});

describe('coup blocks', () => {
  it('foreign_aid is blockable by duke', () => {
    expect(isBlockable({ type: 'foreign_aid', playerId: 'p1' })).toBe(true);
    expect(blockerRoles({ type: 'foreign_aid', playerId: 'p1' })).toEqual(['duke']);
  });

  it('assassinate is blockable only by contessa', () => {
    expect(blockerRoles({ type: 'assassinate', playerId: 'p1', targetId: 'p2' })).toEqual(['contessa']);
  });

  it('steal is blockable by captain or ambassador', () => {
    expect(blockerRoles({ type: 'steal', playerId: 'p1', targetId: 'p2' })).toEqual(['captain', 'ambassador']);
  });

  it('tax / income / coup / exchange are not blockable', () => {
    expect(isBlockable({ type: 'tax', playerId: 'p1' })).toBe(false);
    expect(isBlockable({ type: 'income', playerId: 'p1' })).toBe(false);
    expect(isBlockable({ type: 'coup', playerId: 'p1', targetId: 'p2' })).toBe(false);
    expect(isBlockable({ type: 'exchange', playerId: 'p1' })).toBe(false);
  });
});

describe('coup challengeable predicates', () => {
  it('income / foreign_aid / coup are not challengeable', () => {
    expect(isChallengeable({ type: 'income', playerId: 'p1' })).toBe(false);
    expect(isChallengeable({ type: 'foreign_aid', playerId: 'p1' })).toBe(false);
    expect(isChallengeable({ type: 'coup', playerId: 'p1', targetId: 'p2' })).toBe(false);
  });

  it('tax / assassinate / steal / exchange are challengeable', () => {
    expect(isChallengeable({ type: 'tax', playerId: 'p1' })).toBe(true);
    expect(isChallengeable({ type: 'assassinate', playerId: 'p1', targetId: 'p2' })).toBe(true);
    expect(isChallengeable({ type: 'steal', playerId: 'p1', targetId: 'p2' })).toBe(true);
    expect(isChallengeable({ type: 'exchange', playerId: 'p1' })).toBe(true);
  });

  it('claimedRole maps actions to roles', () => {
    expect(claimedRole({ type: 'tax', playerId: 'p1' })).toBe('duke');
    expect(claimedRole({ type: 'assassinate', playerId: 'p1', targetId: 'p2' })).toBe('assassin');
    expect(claimedRole({ type: 'steal', playerId: 'p1', targetId: 'p2' })).toBe('captain');
    expect(claimedRole({ type: 'exchange', playerId: 'p1' })).toBe('ambassador');
    expect(claimedRole({ type: 'income', playerId: 'p1' })).toBeNull();
  });
});

describe('coup exchange', () => {
  it('keeps required number of cards, returns the rest', () => {
    const state = deal();
    // Force draw to put deterministic cards into the exchange
    state.deck = ['duke', 'duke', ...state.deck];
    state.playerStates.p1.cards = [
      { role: 'assassin', revealed: false },
      { role: 'captain', revealed: false },
    ];
    const declared = applyAction(state, { type: 'exchange', playerId: 'p1' });
    // Skip directly to effect (no challenge)
    const effected = applyActionEffect(declared, { type: 'exchange', playerId: 'p1' });
    expect(effected.pendingAction?.phase).toBe('exchange_select');
    if (effected.pendingAction?.phase !== 'exchange_select') return;
    // pool = [assassin, captain, duke, duke]; keep dukes (indices 2,3)
    const result = applyExchangeSelect(effected, 'p1', [2, 3], makeSeededRng(99));
    expect(result.error).toBeNull();
    const ps = result.state.playerStates.p1;
    expect(ps.cards.length).toBe(2);
    expect(ps.cards.map((c) => c.role).sort()).toEqual(['duke', 'duke']);
  });

  it('rejects wrong number of kept cards', () => {
    const state = deal();
    state.playerStates.p1.cards = [
      { role: 'assassin', revealed: false },
      { role: 'captain', revealed: false },
    ];
    state.pendingAction = {
      phase: 'exchange_select',
      playerId: 'p1',
      drawnCards: ['duke', 'duke'],
    };
    const result = applyExchangeSelect(state, 'p1', [0], makeSeededRng(1));
    expect(result.error).toBeTruthy();
  });
});

describe('coup win condition', () => {
  it('isGameOver returns true with one or zero alive', () => {
    const state = deal(1, ['a', 'b']);
    expect(isGameOver(state)).toBe(false);
    state.playerStates.b.eliminated = true;
    expect(isGameOver(state)).toBe(true);
  });

  it('alivePlayers excludes eliminated', () => {
    const state = deal(1, ['a', 'b', 'c']);
    state.playerStates.b.eliminated = true;
    expect(alivePlayers(state)).toEqual(['a', 'c']);
  });
});

describe('coup full sequences', () => {
  it('income three times advances through all players', () => {
    let state = deal();
    state = applyAction(state, { type: 'income', playerId: 'p1' });
    expect(state.turnOrder[state.currentPlayerIdx]).toBe('p2');
    state = applyAction(state, { type: 'income', playerId: 'p2' });
    expect(state.turnOrder[state.currentPlayerIdx]).toBe('p3');
    state = applyAction(state, { type: 'income', playerId: 'p3' });
    expect(state.turnOrder[state.currentPlayerIdx]).toBe('p1');
    expect(state.playerStates.p1.coins).toBe(3);
    expect(state.playerStates.p2.coins).toBe(3);
    expect(state.playerStates.p3.coins).toBe(3);
  });

  it('coup -> lose_influence -> next-turn flow (manually applied)', () => {
    let state = deal();
    state.playerStates.p1.coins = 7;
    state = applyAction(state, { type: 'coup', playerId: 'p1', targetId: 'p2' });
    expect(state.pendingAction?.phase).toBe('lose_influence');
    const result = applyLoseInfluence(state, 'p2', 0);
    expect(result.error).toBeNull();
    expect(result.state.playerStates.p2.cards[0].revealed).toBe(true);
  });
});
