import { describe, it, expect } from 'vitest';
import { deriveTableEvents } from '../events.js';
import type { LDStateLike, RoundResultLike } from '../types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PLAYER = (id: string) => ({
  id,
  name: id,
  connected: true,
  isBot: false,
  diceCount: 5,
  eliminated: false,
  chips: 1000,
});

const PLAYERS = ['p1', 'p2', 'p3', 'p4'].map(BASE_PLAYER);

function base(overrides: Partial<LDStateLike> = {}): LDStateLike {
  return {
    phase: 'playing',
    players: PLAYERS,
    myId: 'p1',
    currentTurnId: 'p1',
    currentBid: null,
    lastRoundResult: null,
    onesWild: false,
    pot: 0,
    turnOrder: ['p1', 'p2', 'p3', 'p4'],
    ...overrides,
  };
}

// ─── BID_PLACED ───────────────────────────────────────────────────────────────

describe('BID_PLACED', () => {
  it('fires when currentBid changes from null to a bid', () => {
    const prev = base({ currentBid: null });
    const next = base({ currentBid: { count: 3, face: 4, bidderId: 'p1' } });
    const events = deriveTableEvents(prev, next);
    expect(events).toContainEqual({
      type: 'BID_PLACED',
      bidderId: 'p1',
      bid: { count: 3, face: 4, bidderId: 'p1' },
      prevBid: null,
    });
  });

  it('fires when bid changes to a different bid', () => {
    const prevBid = { count: 3, face: 4, bidderId: 'p1' };
    const nextBid = { count: 4, face: 4, bidderId: 'p2' };
    const prev = base({ currentBid: prevBid });
    const next = base({ currentBid: nextBid });
    const events = deriveTableEvents(prev, next);
    expect(events).toContainEqual({
      type: 'BID_PLACED',
      bidderId: 'p2',
      bid: nextBid,
      prevBid,
    });
  });

  it('does not fire when bid is null and stays null', () => {
    const prev = base({ currentBid: null });
    const next = base({ currentBid: null });
    const events = deriveTableEvents(prev, next);
    expect(events.filter((e) => e.type === 'BID_PLACED')).toHaveLength(0);
  });

  it('does not fire on first render with null prev when bid is also null', () => {
    const next = base({ currentBid: null });
    const events = deriveTableEvents(null, next);
    expect(events.filter((e) => e.type === 'BID_PLACED')).toHaveLength(0);
  });

  it('fires on first render with null prev when next has a bid', () => {
    const next = base({ currentBid: { count: 2, face: 3, bidderId: 'p2' } });
    const events = deriveTableEvents(null, next);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'BID_PLACED', bidderId: 'p2' }),
    );
  });
});

// ─── BIG_BID ─────────────────────────────────────────────────────────────────

describe('BIG_BID', () => {
  it('fires when count jumps by exactly 2', () => {
    const prevBid = { count: 3, face: 4, bidderId: 'p1' };
    const nextBid = { count: 5, face: 4, bidderId: 'p2' };
    const events = deriveTableEvents(
      base({ currentBid: prevBid }),
      base({ currentBid: nextBid }),
    );
    expect(events).toContainEqual({
      type: 'BIG_BID',
      bidderId: 'p2',
      bid: nextBid,
      prevBid,
      prevBidderId: 'p1',
    });
  });

  it('fires when count jumps by more than 2', () => {
    const prevBid = { count: 2, face: 3, bidderId: 'p1' };
    const nextBid = { count: 7, face: 3, bidderId: 'p3' };
    const events = deriveTableEvents(
      base({ currentBid: prevBid }),
      base({ currentBid: nextBid }),
    );
    expect(events.some((e) => e.type === 'BIG_BID')).toBe(true);
    const bigBid = events.find((e) => e.type === 'BIG_BID')!;
    expect(bigBid).toMatchObject({ type: 'BIG_BID', prevBidderId: 'p1' });
  });

  it('does not fire when count jumps by only 1', () => {
    const prevBid = { count: 3, face: 4, bidderId: 'p1' };
    const nextBid = { count: 4, face: 4, bidderId: 'p2' };
    const events = deriveTableEvents(
      base({ currentBid: prevBid }),
      base({ currentBid: nextBid }),
    );
    expect(events.filter((e) => e.type === 'BIG_BID')).toHaveLength(0);
  });

  it('does not fire when there was no previous bid', () => {
    const nextBid = { count: 5, face: 4, bidderId: 'p1' };
    const events = deriveTableEvents(
      base({ currentBid: null }),
      base({ currentBid: nextBid }),
    );
    expect(events.filter((e) => e.type === 'BIG_BID')).toHaveLength(0);
  });

  it('includes both BID_PLACED and BIG_BID when big bid fires', () => {
    const prevBid = { count: 2, face: 2, bidderId: 'p1' };
    const nextBid = { count: 6, face: 4, bidderId: 'p2' };
    const events = deriveTableEvents(
      base({ currentBid: prevBid }),
      base({ currentBid: nextBid }),
    );
    const types = events.map((e) => e.type);
    expect(types).toContain('BID_PLACED');
    expect(types).toContain('BIG_BID');
    // BID_PLACED comes before BIG_BID
    expect(types.indexOf('BID_PLACED')).toBeLessThan(types.indexOf('BIG_BID'));
  });
});

// ─── TURN_CHANGED ─────────────────────────────────────────────────────────────

describe('TURN_CHANGED', () => {
  it('fires when turn changes to a non-null value', () => {
    const prev = base({ currentTurnId: 'p1' });
    const next = base({ currentTurnId: 'p2' });
    const events = deriveTableEvents(prev, next);
    expect(events).toContainEqual({
      type: 'TURN_CHANGED',
      newTurnId: 'p2',
      prevTurnId: 'p1',
    });
  });

  it('does not fire when turn is null', () => {
    const prev = base({ currentTurnId: 'p1' });
    const next = base({ currentTurnId: null });
    const events = deriveTableEvents(prev, next);
    expect(events.filter((e) => e.type === 'TURN_CHANGED')).toHaveLength(0);
  });

  it('does not fire when turn is unchanged', () => {
    const prev = base({ currentTurnId: 'p2' });
    const next = base({ currentTurnId: 'p2' });
    const events = deriveTableEvents(prev, next);
    expect(events.filter((e) => e.type === 'TURN_CHANGED')).toHaveLength(0);
  });
});

// ─── Full round_over sequence ─────────────────────────────────────────────────

const ROUND_RESULT: RoundResultLike = {
  bid: { count: 6, face: 4, bidderId: 'p2' },
  actualCount: 3,
  callerId: 'p3',
  loserId: 'p2',
  revealedDice: {
    p1: [4, 2, 4, 1],
    p2: [4, 2, 1, 3],
    p3: [4, 4, 2, 5],
    p4: [2, 3, 1, 5],
  },
};

function playingState(): LDStateLike {
  return base({
    phase: 'playing',
    currentBid: { count: 6, face: 4, bidderId: 'p2' },
    lastRoundResult: null,
  });
}

function roundOverState(result = ROUND_RESULT): LDStateLike {
  return base({
    phase: 'round_over',
    currentBid: { count: 6, face: 4, bidderId: 'p2' },
    lastRoundResult: result,
    currentTurnId: null,
  });
}

describe('round_over sequence: caller loses (caller was wrong)', () => {
  // loserId = 'p2' (bidder), callerId = 'p3'
  // loserId !== callerId -> caller was right -> vindicatedId = callerId = 'p3'
  it('derives LIAR_CALLED, REVEAL_STEP x4, VERDICT in order', () => {
    const events = deriveTableEvents(playingState(), roundOverState());
    const types = events.map((e) => e.type);

    expect(types).toContain('LIAR_CALLED');
    expect(types.filter((t) => t === 'REVEAL_STEP')).toHaveLength(4);
    expect(types).toContain('VERDICT');

    const liarIdx = types.indexOf('LIAR_CALLED');
    const firstRevealIdx = types.indexOf('REVEAL_STEP');
    const verdictIdx = types.indexOf('VERDICT');
    expect(liarIdx).toBeLessThan(firstRevealIdx);
    expect(firstRevealIdx).toBeLessThan(verdictIdx);
  });

  it('LIAR_CALLED has correct callerId and accusedId', () => {
    const events = deriveTableEvents(playingState(), roundOverState());
    const lc = events.find((e) => e.type === 'LIAR_CALLED');
    expect(lc).toMatchObject({ type: 'LIAR_CALLED', callerId: 'p3', accusedId: 'p2' });
  });

  it('REVEAL_STEPs have correct totalSteps and sequential stepIndex', () => {
    const events = deriveTableEvents(playingState(), roundOverState());
    const reveals = events.filter((e) => e.type === 'REVEAL_STEP');
    expect(reveals).toHaveLength(4);
    reveals.forEach((e, i) => {
      expect(e).toMatchObject({ type: 'REVEAL_STEP', stepIndex: i, totalSteps: 4 });
    });
  });

  it('REVEAL_STEPs follow turnOrder', () => {
    const events = deriveTableEvents(playingState(), roundOverState());
    const reveals = events.filter((e) => e.type === 'REVEAL_STEP');
    const playerIds = reveals.map((e) => (e as { type: 'REVEAL_STEP'; playerId: string }).playerId);
    expect(playerIds).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('VERDICT: bidder loses, caller vindicated', () => {
    const events = deriveTableEvents(playingState(), roundOverState());
    const verdict = events.find((e) => e.type === 'VERDICT');
    // loserId='p2' (bidder), callerId='p3'; loserId !== callerId -> vindicatedId=callerId
    expect(verdict).toMatchObject({
      type: 'VERDICT',
      loserId: 'p2',
      vindicatedId: 'p3',
    });
  });
});

describe('round_over sequence: caller loses (bidder was honest)', () => {
  // loserId = callerId -> bidder was honest -> vindicatedId = bid.bidderId
  const HONEST_RESULT: RoundResultLike = {
    bid: { count: 3, face: 4, bidderId: 'p1' },
    actualCount: 5,
    callerId: 'p3',
    loserId: 'p3',   // caller loses
    revealedDice: {
      p1: [4, 4, 2],
      p2: [4, 1, 3],
      p3: [2, 3, 1],
      p4: [1, 2, 3],
    },
  };

  it('VERDICT: caller loses, bidder vindicated', () => {
    const prev = base({
      phase: 'playing',
      currentBid: { count: 3, face: 4, bidderId: 'p1' },
      lastRoundResult: null,
    });
    const next = base({
      phase: 'round_over',
      currentBid: { count: 3, face: 4, bidderId: 'p1' },
      lastRoundResult: HONEST_RESULT,
      currentTurnId: null,
    });
    const events = deriveTableEvents(prev, next);
    const verdict = events.find((e) => e.type === 'VERDICT');
    // loserId='p3' === callerId='p3' -> vindicatedId = bid.bidderId = 'p1'
    expect(verdict).toMatchObject({
      type: 'VERDICT',
      loserId: 'p3',
      vindicatedId: 'p1',
    });
  });
});

// ─── PLAYER_ELIMINATED ────────────────────────────────────────────────────────

describe('PLAYER_ELIMINATED', () => {
  it('fires when a player flips eliminated=false to eliminated=true', () => {
    const prev = base();
    const next = base({
      players: PLAYERS.map((p) =>
        p.id === 'p2' ? { ...p, eliminated: true, diceCount: 0 } : p,
      ),
    });
    const events = deriveTableEvents(prev, next);
    expect(events).toContainEqual({ type: 'PLAYER_ELIMINATED', playerId: 'p2' });
  });

  it('does not fire when player was already eliminated', () => {
    const eliminated = PLAYERS.map((p) =>
      p.id === 'p2' ? { ...p, eliminated: true, diceCount: 0 } : p,
    );
    const prev = base({ players: eliminated });
    const next = base({ players: eliminated });
    const events = deriveTableEvents(prev, next);
    expect(events.filter((e) => e.type === 'PLAYER_ELIMINATED')).toHaveLength(0);
  });

  it('does not fire on first render (prev=null)', () => {
    const next = base({
      players: PLAYERS.map((p) =>
        p.id === 'p3' ? { ...p, eliminated: true } : p,
      ),
    });
    const events = deriveTableEvents(null, next);
    expect(events.filter((e) => e.type === 'PLAYER_ELIMINATED')).toHaveLength(0);
  });
});

// ─── POT_CHANGED ──────────────────────────────────────────────────────────────

describe('POT_CHANGED', () => {
  it('fires when pot increases', () => {
    const prev = base({ pot: 100 });
    const next = base({ pot: 200 });
    const events = deriveTableEvents(prev, next);
    expect(events).toContainEqual({ type: 'POT_CHANGED', pot: 200, prevPot: 100 });
  });

  it('does not fire on first render (prev=null)', () => {
    const next = base({ pot: 500 });
    const events = deriveTableEvents(null, next);
    expect(events.filter((e) => e.type === 'POT_CHANGED')).toHaveLength(0);
  });

  it('does not fire when pot is unchanged', () => {
    const prev = base({ pot: 200 });
    const next = base({ pot: 200 });
    const events = deriveTableEvents(prev, next);
    expect(events.filter((e) => e.type === 'POT_CHANGED')).toHaveLength(0);
  });
});
