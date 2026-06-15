import { describe, test, expect } from 'bun:test';
import { earlierAlarm } from '../alarmHelpers';

describe('earlierAlarm', () => {
  test('returns true when no existing alarm', () => {
    expect(earlierAlarm(null, 1000)).toBe(true);
  });

  test('returns true when target fires before existing alarm', () => {
    expect(earlierAlarm(5000, 4999)).toBe(true);
  });

  test('returns false when target fires after existing alarm', () => {
    expect(earlierAlarm(5000, 5001)).toBe(false);
  });

  test('returns false when target equals existing alarm', () => {
    expect(earlierAlarm(5000, 5000)).toBe(false);
  });
});

describe('scheduleBotTurnIfNeeded alarm guard', () => {
  // Verifies the contract: a bot-turn alarm (short ~1-2 s delay) must NOT
  // displace a pending reconnect deadline that fires sooner.
  //
  // We simulate this with a minimal stub of ctx.storage so we can observe
  // exactly which setAlarm calls happen.

  function makeStorageStub(existingAlarm: number | null) {
    let current = existingAlarm;
    const setCalls: number[] = [];
    return {
      storage: {
        getAlarm: async () => current,
        setAlarm: async (t: number) => {
          setCalls.push(t);
          current = t;
        },
      },
      setCalls,
      current: () => current,
    };
  }

  test('bot-turn scheduling does not overwrite an earlier reconnect deadline', async () => {
    // A reconnect check was already armed 1 s from now (fires very soon).
    // A bot-turn wants to schedule itself 5 s from now — it must NOT displace
    // the earlier reconnect alarm.
    const now = Date.now();
    const reconnectDeadline = now + 1_000;  // earlier
    const stub = makeStorageStub(reconnectDeadline);

    const target = now + 5_000; // bot turn fires later
    const existing = await stub.storage.getAlarm();
    if (earlierAlarm(existing, target)) {
      await stub.storage.setAlarm(target);
    }

    // setAlarm must NOT have been called — the reconnect deadline is earlier
    expect(stub.setCalls.length).toBe(0);
    // The stored alarm must still be the original reconnect deadline
    expect(stub.current()).toBe(reconnectDeadline);
  });

  test('bot-turn scheduling does set alarm when no existing alarm', async () => {
    const stub = makeStorageStub(null);

    const target = Date.now() + 1500;
    const existing = await stub.storage.getAlarm();
    if (earlierAlarm(existing, target)) {
      await stub.storage.setAlarm(target);
    }

    expect(stub.setCalls.length).toBe(1);
    expect(stub.setCalls[0]).toBe(target);
  });

  test('bot-turn scheduling does set alarm when bot turn is earlier than existing', async () => {
    // Existing alarm is 30-min room-expiry; bot turn fires much sooner
    const existingExpiry = Date.now() + 29 * 60_000;
    const stub = makeStorageStub(existingExpiry);

    const target = Date.now() + 1500;
    const existing = await stub.storage.getAlarm();
    if (earlierAlarm(existing, target)) {
      await stub.storage.setAlarm(target);
    }

    expect(stub.setCalls.length).toBe(1);
    expect(stub.setCalls[0]).toBe(target);
  });
});
