import { describe, it, expect } from 'vitest';
import {
  CosmeticsCache,
  DEFAULT_COSMETICS,
} from '../../../../../worker/shared/cosmetics.js';

// CosmeticsCache.get makes TWO db calls per cache-miss:
//   1. resolvePlayerCosmetics -> SELECT ... FROM player_equipped (the equipped row)
//   2. the crown override     -> SELECT crown_active_until FROM player_profiles
// This stub branches on the SQL so each query gets its own response, and can be
// told to throw on the crown lookup to exercise the fail-safe path.

type EquippedRow = {
  title_badge_id: string | null;
  title_label: string | null;
  frame_metadata: string | null;
  emblem_metadata: string | null;
  name_colour_metadata: string | null;
  avatar_id: string | null;
  hat_id: string | null;
};

function emptyEquipped(overrides: Partial<EquippedRow> = {}): EquippedRow {
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

function makeDb(opts: {
  equipped: EquippedRow | null;
  crownActiveUntil: number | null;
  throwOnCrown?: boolean;
  throwOnEquipped?: boolean;
}): D1Database {
  const stmt = (sql: string) => {
    const isCrown = sql.includes('crown_active_until');
    const first = async <T>() => {
      if (isCrown) {
        if (opts.throwOnCrown) throw new Error('simulated D1 failure');
        return (opts.crownActiveUntil === null
          ? null
          : { crown_active_until: opts.crownActiveUntil }) as T;
      }
      if (opts.throwOnEquipped) throw new Error('simulated D1 failure');
      return opts.equipped as T;
    };
    return {
      bind: (..._args: unknown[]) => ({
        first,
        run: async () => ({ success: true, meta: {}, results: [] }),
        all: async () => ({ success: true, meta: {}, results: [] }),
      }),
      first,
      run: async () => ({ success: true, meta: {}, results: [] }),
      all: async () => ({ success: true, meta: {}, results: [] }),
    };
  };
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async () => [],
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

const FAR_FUTURE = 9_999_999_999; // year 2286, always > now in seconds

describe('CosmeticsCache crown override', () => {
  it('overrides hatId to crown when crown_active_until > now', async () => {
    const cache = new CosmeticsCache();
    const db = makeDb({ equipped: emptyEquipped({ hat_id: 'party' }), crownActiveUntil: FAR_FUTURE });
    const result = await cache.get('player-1', db);
    expect(result.hatId).toBe('crown');
  });

  it('preserves the equipped hat when crown window is expired (0)', async () => {
    const cache = new CosmeticsCache();
    const db = makeDb({ equipped: emptyEquipped({ hat_id: 'party' }), crownActiveUntil: 0 });
    const result = await cache.get('player-2', db);
    expect(result.hatId).toBe('party');
  });

  it('preserves the equipped hat when there is no profile row', async () => {
    const cache = new CosmeticsCache();
    const db = makeDb({ equipped: emptyEquipped({ hat_id: 'top_hat' }), crownActiveUntil: null });
    const result = await cache.get('player-3', db);
    expect(result.hatId).toBe('top_hat');
  });

  it('FAIL-SAFE: a D1 error on the crown lookup returns the resolved payload, NOT DEFAULT', async () => {
    const cache = new CosmeticsCache();
    const db = makeDb({ equipped: emptyEquipped({ hat_id: 'beanie' }), crownActiveUntil: null, throwOnCrown: true });
    const result = await cache.get('player-4', db);
    // The equipped hat survives; cosmetics are NOT stripped to DEFAULT.
    expect(result.hatId).toBe('beanie');
  });

  it('does not mutate the shared DEFAULT_COSMETICS singleton when crown is active', async () => {
    const cache = new CosmeticsCache();
    // Force resolvePlayerCosmetics down its error path (returns DEFAULT_COSMETICS)
    // while the crown window is active, so the override must clone rather than mutate.
    const db = makeDb({ equipped: null, crownActiveUntil: FAR_FUTURE, throwOnEquipped: true });
    const result = await cache.get('player-5', db);
    expect(result.hatId).toBe('crown');
    // The module-level singleton must stay pristine for every other caller.
    expect(DEFAULT_COSMETICS.hatId).toBeNull();
  });
});
