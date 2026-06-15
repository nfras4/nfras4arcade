import { describe, test, expect } from 'bun:test';
import {
  shouldReconnect,
  reconnectDelay,
  RECONNECT_CEILING,
  RECONNECT_MAX_MS,
} from '../reconnect';

describe('shouldReconnect', () => {
  test('never reconnects on normal closure (1000)', () => {
    expect(shouldReconnect(1000, 0)).toBe(false);
    expect(shouldReconnect(1000, 5)).toBe(false);
  });

  test('never reconnects on deliberate eviction (4001)', () => {
    expect(shouldReconnect(4001, 0)).toBe(false);
  });

  test('reconnects on abnormal closure (1006) below the ceiling', () => {
    expect(shouldReconnect(1006, 0)).toBe(true);
    expect(shouldReconnect(1006, RECONNECT_CEILING - 1)).toBe(true);
  });

  test('gives up once the attempt ceiling is reached', () => {
    expect(shouldReconnect(1006, RECONNECT_CEILING)).toBe(false);
    expect(shouldReconnect(1006, RECONNECT_CEILING + 3)).toBe(false);
  });
});

describe('reconnectDelay', () => {
  test('is capped exponential backoff: 2s, 4s, 8s, 16s', () => {
    expect(reconnectDelay(0)).toBe(2000);
    expect(reconnectDelay(1)).toBe(4000);
    expect(reconnectDelay(2)).toBe(8000);
    expect(reconnectDelay(3)).toBe(16000);
  });

  test('caps at the max delay for large attempt counts', () => {
    expect(reconnectDelay(4)).toBe(RECONNECT_MAX_MS); // 32s -> capped 30s
    expect(reconnectDelay(20)).toBe(RECONNECT_MAX_MS);
  });

  test('is monotonic non-decreasing', () => {
    let prev = 0;
    for (let i = 0; i < 12; i++) {
      const d = reconnectDelay(i);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
