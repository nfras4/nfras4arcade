import { describe, test, expect, mock, beforeAll } from 'bun:test';
import type { CardPlayer } from '../types';

// cardRoom.ts imports DurableObject from 'cloudflare:workers', which bun can't
// resolve outside the Workers runtime. Mock it (mirrors poker/__tests__).
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

let shouldJoinAsSpectator: typeof import('../cardRoom').shouldJoinAsSpectator;
let pickSpectatorToPromote: typeof import('../cardRoom').pickSpectatorToPromote;
let CardRoom: typeof import('../cardRoom').CardRoom;
beforeAll(async () => {
  ({ shouldJoinAsSpectator, pickSpectatorToPromote, CardRoom } = await import('../cardRoom'));
});

// ---------------------------------------------------------------------------
// Pure helper: shouldJoinAsSpectator
// ---------------------------------------------------------------------------
describe('shouldJoinAsSpectator', () => {
  test('explicit spectate intent always spectates, even in an open lobby', () => {
    expect(shouldJoinAsSpectator('lobby', 0, 6, true)).toBe(true);
  });

  test('Finding 1: mid-game join with a free seat becomes a spectator (not a player)', () => {
    // president/chase-the-queen: maxPlayers 6, started with fewer, seat free.
    expect(shouldJoinAsSpectator('playing', 3, 6, false)).toBe(true);
    expect(shouldJoinAsSpectator('round_over', 3, 6, false)).toBe(true);
    expect(shouldJoinAsSpectator('game_over', 3, 6, false)).toBe(true);
  });

  test('Finding 2: full in-progress non-spectate join becomes a spectator', () => {
    expect(shouldJoinAsSpectator('playing', 6, 6, false)).toBe(true);
  });

  test('full lobby (no spectate intent) auto-spectates rather than bouncing', () => {
    expect(shouldJoinAsSpectator('lobby', 6, 6, false)).toBe(true);
  });

  test('open lobby with a free seat seats the player (does NOT spectate)', () => {
    expect(shouldJoinAsSpectator('lobby', 2, 6, false)).toBe(false);
    expect(shouldJoinAsSpectator('lobby', 0, 2, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pure helper: pickSpectatorToPromote
// ---------------------------------------------------------------------------
describe('pickSpectatorToPromote', () => {
  test('picks the longest-waiting (first, insertion-ordered) spectator', () => {
    expect(pickSpectatorToPromote(['alice', 'bob', 'carol'], 1, 2)).toBe('alice');
  });

  test('returns null when there is no free seat', () => {
    expect(pickSpectatorToPromote(['alice'], 2, 2)).toBeNull();
    expect(pickSpectatorToPromote(['alice'], 6, 6)).toBeNull();
  });

  test('returns null when no spectators are waiting', () => {
    expect(pickSpectatorToPromote([], 1, 2)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// promoteSpectators: exercised on a minimal stub of the protected method.
// promoteSpectators only touches this.players / this.spectators / this.maxPlayers
// / this.canPromoteSpectator, so we can drive it via Function.prototype.call on
// a hand-rolled context without standing up a real Durable Object.
// ---------------------------------------------------------------------------
interface PromoteCtx {
  players: Map<string, CardPlayer>;
  spectators: Map<string, string>;
  maxPlayers: number;
  canPromoteSpectator: (id: string) => Promise<boolean>;
  promoteSpectators: () => Promise<string[]>;
}

function makeCtx(opts: {
  players: Array<[string, Partial<CardPlayer>]>;
  spectators: Array<[string, string]>;
  maxPlayers: number;
  gate?: (id: string) => Promise<boolean>;
}): PromoteCtx {
  const players = new Map<string, CardPlayer>();
  for (const [id, p] of opts.players) {
    players.set(id, { id, name: id, hand: [], connected: true, isHost: false, devices: [], ...p });
  }
  return {
    players,
    spectators: new Map(opts.spectators),
    maxPlayers: opts.maxPlayers,
    canPromoteSpectator: opts.gate ?? (async () => true),
    // Borrow the real method off the prototype.
    promoteSpectators: (CardRoom.prototype as unknown as PromoteCtx).promoteSpectators,
  };
}

describe('promoteSpectators (promote-on-vacancy core)', () => {
  test('promotes the waiting spectator into a single freed seat', async () => {
    const ctx = makeCtx({
      players: [['p1', {}]],
      spectators: [['spec1', 'Spec One']],
      maxPlayers: 2,
    });
    const promoted = await ctx.promoteSpectators.call(ctx);
    expect(promoted).toEqual(['spec1']);
    expect(ctx.players.has('spec1')).toBe(true);
    expect(ctx.players.get('spec1')!.name).toBe('Spec One');
    expect(ctx.spectators.has('spec1')).toBe(false);
    expect(ctx.players.size).toBe(2);
  });

  test('2-seat game: after one of two players leaves, a spectator fills the seat', async () => {
    // Simulate connect-four post-leave: one seat already freed (p2 removed),
    // one spectator waiting. This is the Finding 3 scenario.
    const ctx = makeCtx({
      players: [['p1', {}]],
      spectators: [['watcher', 'Watcher']],
      maxPlayers: 2,
    });
    const promoted = await ctx.promoteSpectators.call(ctx);
    expect(promoted).toEqual(['watcher']);
    expect(ctx.players.size).toBe(2);
    expect(ctx.players.has('watcher')).toBe(true);
  });

  test('stops at maxPlayers and leaves remaining spectators waiting', async () => {
    const ctx = makeCtx({
      players: [['p1', {}]],
      spectators: [['s1', 'S1'], ['s2', 'S2']],
      maxPlayers: 2,
    });
    const promoted = await ctx.promoteSpectators.call(ctx);
    expect(promoted).toEqual(['s1']); // only one free seat
    expect(ctx.players.size).toBe(2);
    expect(ctx.spectators.has('s2')).toBe(true);
    expect(ctx.spectators.has('s1')).toBe(false);
  });

  test('does nothing when the room is already full', async () => {
    const ctx = makeCtx({
      players: [['p1', {}], ['p2', {}]],
      spectators: [['s1', 'S1']],
      maxPlayers: 2,
    });
    const promoted = await ctx.promoteSpectators.call(ctx);
    expect(promoted).toEqual([]);
    expect(ctx.spectators.has('s1')).toBe(true);
    expect(ctx.players.size).toBe(2);
  });

  test('a gated reject skips that spectator but still promotes the next (no starvation)', async () => {
    const ctx = makeCtx({
      players: [['p1', {}]],
      spectators: [['broke', 'Broke'], ['rich', 'Rich']],
      maxPlayers: 2,
      gate: async (id) => id !== 'broke', // PokerRoom-style buy-in reject
    });
    const promoted = await ctx.promoteSpectators.call(ctx);
    expect(promoted).toEqual(['rich']);
    expect(ctx.players.has('rich')).toBe(true);
    expect(ctx.players.has('broke')).toBe(false);
    expect(ctx.spectators.has('broke')).toBe(true); // left waiting, not consumed
  });

  test('promotes longest-waiting first across multiple free seats', async () => {
    const ctx = makeCtx({
      players: [['p1', {}]],
      spectators: [['first', 'First'], ['second', 'Second'], ['third', 'Third']],
      maxPlayers: 6,
    });
    const promoted = await ctx.promoteSpectators.call(ctx);
    expect(promoted).toEqual(['first', 'second', 'third']);
    expect(ctx.players.size).toBe(4);
    expect(ctx.spectators.size).toBe(0);
  });
});
