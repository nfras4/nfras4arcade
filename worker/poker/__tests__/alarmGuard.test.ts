/**
 * P5-10: scheduleBotTurn must not overwrite a sooner alarm (e.g. a pending
 * disconnect-grace timeout). Mirrors scheduleDisconnectCheck's guard pattern.
 */
import { describe, test, expect, mock, beforeAll } from 'bun:test';

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

function makeStubCtx(initialAlarm: number | null = null) {
  let currentAlarm: number | null = initialAlarm;
  return {
    storage: {
      get: async () => undefined,
      put: async () => undefined,
      delete: async () => undefined,
      deleteAll: async () => undefined,
      list: async () => new Map(),
      getAlarm: async () => currentAlarm,
      setAlarm: async (when: number) => { currentAlarm = when; },
    },
    getCurrentAlarm: () => currentAlarm,
    getWebSockets: () => [],
    getTags: () => [],
    acceptWebSocket: () => undefined,
  };
}

describe('scheduleBotTurn alarm guard', () => {
  test('keeps the sooner alarm when bot delay would land later', async () => {
    const soonerAlarm = Date.now() + 200; // 200ms grace
    const ctx = makeStubCtx(soonerAlarm);
    const room: any = new PokerRoom(ctx, { DB: {} });
    room.code = 'TEST';
    room.phase = 'playing';
    room.bots = new Map([['bot1', { id: 'bot1', name: 'Bot', isBot: true, difficulty: 'easy' }]]);
    room.players = new Map([['bot1', { id: 'bot1', name: 'Bot', hand: [], connected: true, isHost: false, isBot: true, devices: [] }]]);
    room.tableState = { actionOnPlayerId: 'bot1' };

    await room.scheduleBotTurn();
    expect(ctx.getCurrentAlarm()).toBe(soonerAlarm);
  });

  test('writes alarm when none exists', async () => {
    const ctx = makeStubCtx(null);
    const room: any = new PokerRoom(ctx, { DB: {} });
    room.code = 'TEST';
    room.phase = 'playing';
    room.bots = new Map([['bot1', { id: 'bot1', name: 'Bot', isBot: true, difficulty: 'easy' }]]);
    room.players = new Map([['bot1', { id: 'bot1', name: 'Bot', hand: [], connected: true, isHost: false, isBot: true, devices: [] }]]);
    room.tableState = { actionOnPlayerId: 'bot1' };

    await room.scheduleBotTurn();
    expect(ctx.getCurrentAlarm()).not.toBeNull();
    expect(ctx.getCurrentAlarm()).toBeGreaterThan(Date.now());
  });

  test('overwrites a later alarm', async () => {
    const farAlarm = Date.now() + 60_000; // 60s out
    const ctx = makeStubCtx(farAlarm);
    const room: any = new PokerRoom(ctx, { DB: {} });
    room.code = 'TEST';
    room.phase = 'playing';
    room.bots = new Map([['bot1', { id: 'bot1', name: 'Bot', isBot: true, difficulty: 'easy' }]]);
    room.players = new Map([['bot1', { id: 'bot1', name: 'Bot', hand: [], connected: true, isHost: false, isBot: true, devices: [] }]]);
    room.tableState = { actionOnPlayerId: 'bot1' };

    await room.scheduleBotTurn();
    expect(ctx.getCurrentAlarm()).toBeLessThan(farAlarm);
  });
});
