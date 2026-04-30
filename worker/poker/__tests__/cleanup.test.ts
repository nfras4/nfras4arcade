/**
 * P5-6: paired-device close + cleanup. When the last device of a paired
 * player drops mid-game, handleDisconnect must fire. The 30s timeout in
 * scheduleDisconnectCheck then triggers handlePlayerTimeout.
 */
import { describe, test, expect, mock, beforeAll } from 'bun:test';
import { hasRemainingDevices, removeDevice, makeDevice } from '../../shared/deviceManager';

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

function makeStubCtx() {
  let currentAlarm: number | null = null;
  const sentMessages: any[] = [];
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
    sentMessages,
  };
}

describe('paired-device cleanup', () => {
  test('removeDevice + hasRemainingDevices: closing both devices leaves no remaining devices', () => {
    const player: any = {
      id: 'p1',
      name: 'Alice',
      hand: [],
      connected: true,
      isHost: false,
      devices: [
        makeDevice('sock-pc', 'table', Date.now()),
        makeDevice('sock-phone', 'controller', Date.now()),
      ],
    };
    expect(hasRemainingDevices(player)).toBe(true);
    removeDevice(player, 'sock-pc');
    expect(hasRemainingDevices(player)).toBe(true);
    removeDevice(player, 'sock-phone');
    expect(hasRemainingDevices(player)).toBe(false);
  });

  test('handlePlayerTimeout auto-folds disconnected player on their turn', async () => {
    const ctx = makeStubCtx();
    const room: any = new PokerRoom(ctx, { DB: {} });
    room.code = 'TEST';
    room.phase = 'playing';
    room.bots = new Map();
    room.players = new Map([
      ['p1', { id: 'p1', name: 'Alice', hand: [], connected: false, isHost: true, devices: [] }],
      ['p2', { id: 'p2', name: 'Bob', hand: [], connected: true, isHost: false, devices: [makeDevice('s2', 'both', Date.now())] }],
    ]);
    room.turnOrder = ['p1', 'p2'];
    room.tableState = {
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
    // Stub broadcast / saveState side effects.
    room.broadcast = () => undefined;
    room.broadcastState = () => undefined;
    room.sendTo = () => undefined;
    room.saveState = async () => undefined;

    await room.handlePlayerTimeout('p1');

    expect(room.tableState.playerFolded.p1).toBe(true);
    // Pot awarded to last remaining player when only one non-folded remains.
    expect(room.tableState.bettingRound).toBe('showdown');
  });
});
