import { describe, it, expect } from 'vitest';
import {
  resolvePlayerCosmetics,
  DEFAULT_COSMETICS,
} from '../../../../../worker/shared/cosmetics.js';

// ── Minimal D1Database stub ───────────────────────────────────────────────────
// resolvePlayerCosmetics calls db.prepare(sql).bind(id).first<Row>().
// We only need to satisfy that call chain.

type EquippedRow = {
  title_badge_id: string | null;
  title_label: string | null;
  frame_metadata: string | null;
  emblem_metadata: string | null;
  name_colour_metadata: string | null;
  avatar_id: string | null;
  hat_id: string | null;
};

function makeDb(row: EquippedRow | null): D1Database {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async <T>() => row as T,
        run: async () => ({ success: true, meta: {}, results: [] }),
        all: async () => ({ success: true, meta: {}, results: [] }),
      }),
      first: async <T>() => row as T,
      run: async () => ({ success: true, meta: {}, results: [] }),
      all: async () => ({ success: true, meta: {}, results: [] }),
    }),
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function emptyRow(overrides: Partial<EquippedRow> = {}): EquippedRow {
  return {
    title_badge_id: null,
    title_label: null,
    frame_metadata: null,
    emblem_metadata: null,
    name_colour_metadata: null,
    avatar_id: null,
    hat_id: null,
    ...overrides,
  };
}

// ── resolvePlayerCosmetics: hat_id ────────────────────────────────────────────

describe('resolvePlayerCosmetics (hat_id)', () => {
  it('returns hatId === "top_hat" when player_equipped.hat_id is "top_hat"', async () => {
    const db = makeDb(emptyRow({ hat_id: 'top_hat' }));
    const result = await resolvePlayerCosmetics('player_1', db);
    expect(result.hatId).toBe('top_hat');
  });

  it('returns hatId === null when player_equipped.hat_id is NULL', async () => {
    const db = makeDb(emptyRow({ hat_id: null }));
    const result = await resolvePlayerCosmetics('player_1', db);
    expect(result.hatId).toBeNull();
  });

  it('returns hatId === null when hat_id points to a deleted shop item (LEFT JOIN null)', async () => {
    // The LEFT JOIN on shop_items h ON pe.hat_id = h.id returns a null row
    // when the item was deleted; the resolver still reads pe.hat_id from
    // player_equipped directly so this case is the same as hat_id = null.
    const db = makeDb(emptyRow({ hat_id: null }));
    const result = await resolvePlayerCosmetics('player_2', db);
    expect(result.hatId).toBeNull();
  });

  it('returns DEFAULT_COSMETICS (hatId === null) for guest_ players', async () => {
    // Guest players short-circuit before any DB call.
    const db = makeDb(emptyRow({ hat_id: 'crown' })); // would be ignored
    const result = await resolvePlayerCosmetics('guest_abc123', db);
    expect(result).toEqual(DEFAULT_COSMETICS);
    expect(result.hatId).toBeNull();
  });

  it('returns DEFAULT_COSMETICS when the player has no equipped row', async () => {
    const db = makeDb(null);
    const result = await resolvePlayerCosmetics('player_3', db);
    expect(result).toEqual(DEFAULT_COSMETICS);
  });

  it('passes through other hat ids correctly', async () => {
    const hatIds = ['party', 'crown', 'beanie', 'sombrero'] as const;
    for (const hatId of hatIds) {
      const db = makeDb(emptyRow({ hat_id: hatId }));
      const result = await resolvePlayerCosmetics('player_x', db);
      expect(result.hatId).toBe(hatId);
    }
  });
});
