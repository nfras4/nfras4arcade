/**
 * Fairness invariant: union(controllerState, tableState) === bothState.
 * No field may appear non-null in both controller and table payloads with
 * different values; a non-null wins over null in the merge.
 */
import { describe, test, expect, mock, beforeAll } from 'bun:test';

// Stub the cloudflare:workers DurableObject base class before importing PokerRoom.
mock.module('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: any;
    env: any;
    constructor(ctx: any, env: any) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

let PokerRoom: any;
beforeAll(async () => {
  ({ PokerRoom } = await import('../room'));
});

function makeStubCtx(): any {
  return {
    storage: {
      get: async () => undefined,
      put: async () => undefined,
      delete: async () => undefined,
      deleteAll: async () => undefined,
      list: async () => new Map(),
      getAlarm: async () => null,
      setAlarm: async () => undefined,
    },
    getWebSockets: () => [],
    getTags: () => [],
    acceptWebSocket: () => undefined,
  };
}

function makeStubEnv(): any {
  return { DB: { prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => null, all: async () => ({ results: [] }) }) }) } };
}

class TestablePokerRoom {
  private room: any;
  constructor() {
    this.room = new PokerRoom(makeStubCtx(), makeStubEnv());
    // Seed minimal player state for getStateFor.
    this.room.code = 'TEST';
    this.room.phase = 'playing';
    this.room.players = new Map([
      ['p1', { id: 'p1', name: 'Alice', hand: [{ suit: 'hearts', rank: 'A', value: 14 }, { suit: 'spades', rank: 'K', value: 13 }], connected: true, isHost: true, devices: [] }],
      ['p2', { id: 'p2', name: 'Bob', hand: [{ suit: 'clubs', rank: 'Q', value: 12 }, { suit: 'diamonds', rank: 'J', value: 11 }], connected: true, isHost: false, devices: [] }],
    ]);
    this.room.turnOrder = ['p1', 'p2'];
    this.room.tableState = {
      communityCards: [],
      pots: [],
      currentBet: 10,
      bettingRound: 'preflop',
      dealerIndex: 0,
      smallBlindAmount: 5,
      bigBlindAmount: 10,
      deck: [],
      lastAction: null,
      winnersInfo: null,
      handNumber: 1,
      playerChips: { p1: 1000, p2: 1000 },
      playerBets: { p1: 5, p2: 10 },
      playerFolded: { p1: false, p2: false },
      playerAllIn: { p1: false, p2: false },
      isGuestPlayer: { p1: false, p2: false },
      actionOnPlayerId: 'p1',
      lastRaisePlayerId: null,
      bbHasActed: false,
      bbPlayerId: 'p2',
      roundStartPlayerId: 'p1',
      actedThisRound: {},
      gameMode: 'casual',
      casualChipCount: 1000,
    };
  }
  state(role: 'controller' | 'table' | 'both') {
    return this.room.getStateFor('p1', role);
  }
}

/**
 * Treat empty arrays as "stripped" (equivalent to null) for the fairness merge:
 * the table surface uses [] to indicate hole cards have been removed, while
 * controller has the full data. The merge picks the non-empty / non-null side.
 */
function isStripped(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/**
 * Recursively assert that for every field in both payloads:
 *   - if both sides have non-stripped data, they must be deeply equal.
 *   - non-stripped wins over stripped.
 * Returns the merged value.
 */
function assertNoConflict(controller: any, table: any, path = ''): any {
  const cStripped = isStripped(controller);
  const tStripped = isStripped(table);
  if (cStripped && tStripped) return controller ?? table ?? null;
  if (cStripped) return table;
  if (tStripped) return controller;
  // Both have content
  if (typeof controller !== 'object' || typeof table !== 'object') {
    if (controller !== table) {
      throw new Error(`fairness conflict at ${path}: controller=${JSON.stringify(controller)} table=${JSON.stringify(table)}`);
    }
    return controller;
  }
  if (Array.isArray(controller) || Array.isArray(table)) {
    expect(controller).toEqual(table);
    return controller;
  }
  const keys = new Set([...Object.keys(controller), ...Object.keys(table)]);
  const merged: Record<string, any> = {};
  for (const k of keys) {
    merged[k] = assertNoConflict(controller[k] ?? null, table[k] ?? null, `${path}.${k}`);
  }
  return merged;
}

describe('PokerRoom fairness invariant', () => {
  test('union(controller, table) === both', () => {
    const room = new TestablePokerRoom();
    const controller = room.state('controller');
    const table = room.state('table');
    const both = room.state('both');

    const merged = assertNoConflict(controller, table);
    expect(merged).toEqual(both);
  });

  test('table surface receives no hole cards', () => {
    const room = new TestablePokerRoom();
    const table = room.state('table');
    expect((table.tableState as any).myHand).toEqual([]);
    const playerHands = (table.tableState as any).playerHands;
    for (const id of Object.keys(playerHands)) {
      expect(playerHands[id]).toBeNull();
    }
  });

  test('controller surface includes own hole cards', () => {
    const room = new TestablePokerRoom();
    const controller = room.state('controller');
    expect((controller.tableState as any).myHand).toHaveLength(2);
    expect((controller.tableState as any).playerHands.p1).toHaveLength(2);
  });
});
