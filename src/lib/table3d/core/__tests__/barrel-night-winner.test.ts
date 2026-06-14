import { describe, it, expect } from 'vitest';
import { pickBarrelNightWinner } from '../../../../../worker/barrelNight/crown.js';

describe('pickBarrelNightWinner', () => {
  it('crowns the game winner when they are an eligible human', () => {
    const r = pickBarrelNightWinner({
      winnerId: 'alice',
      eligible: new Set(['alice', 'bob']),
      humanElimOrder: ['bob'],
    });
    expect(r).toBe('alice');
  });

  it('crowns the last human eliminated when a bot wins', () => {
    const r = pickBarrelNightWinner({
      winnerId: 'bot_1',
      eligible: new Set(['alice', 'bob']),
      humanElimOrder: ['alice', 'bob'], // bob lasted longer
    });
    expect(r).toBe('bob');
  });

  it('returns null when no eligible human played (bot/zero-human week)', () => {
    const r = pickBarrelNightWinner({
      winnerId: 'bot_2',
      eligible: new Set(),
      humanElimOrder: [],
    });
    expect(r).toBeNull();
  });

  it('ignores guests/bots that leaked into the elim order', () => {
    const r = pickBarrelNightWinner({
      winnerId: 'bot_1',
      eligible: new Set(['alice']), // only alice is eligible
      humanElimOrder: ['alice', 'guest_xyz'], // guest eliminated after alice
    });
    expect(r).toBe('alice');
  });

  it('handles a lone human who wins outright', () => {
    const r = pickBarrelNightWinner({
      winnerId: 'alice',
      eligible: new Set(['alice']),
      humanElimOrder: [],
    });
    expect(r).toBe('alice');
  });

  it('handles a lone human who loses to bots (still gets the crown)', () => {
    const r = pickBarrelNightWinner({
      winnerId: 'bot_3',
      eligible: new Set(['alice']),
      humanElimOrder: ['alice'],
    });
    expect(r).toBe('alice');
  });
});
