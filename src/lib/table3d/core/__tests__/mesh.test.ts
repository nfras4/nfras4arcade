import { describe, it, expect } from 'vitest';
import { derivePeerSet, diffPeerSet } from '../mesh.js';
import type { LDStateLike } from '../types.js';

// ─── derivePeerSet ───────────────────────────────────────────────────────────

describe('derivePeerSet', () => {
  it('excludes self', () => {
    const players: LDStateLike['players'] = [
      { id: 'a', name: 'Alice', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
      { id: 'b', name: 'Bob', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
    ];
    const peers = derivePeerSet(players, 'a');
    expect(peers).toEqual(new Set(['b']));
  });

  it('excludes eliminated players', () => {
    const players: LDStateLike['players'] = [
      { id: 'a', name: 'Alice', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
      { id: 'b', name: 'Bob', connected: true, isBot: false, diceCount: 0, eliminated: true, chips: 0 },
      { id: 'c', name: 'Charlie', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
    ];
    const peers = derivePeerSet(players, 'a');
    expect(peers).toEqual(new Set(['c']));
  });

  it('includes all other seated non-eliminated players regardless of connection', () => {
    const players: LDStateLike['players'] = [
      { id: 'a', name: 'Alice', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
      { id: 'b', name: 'Bob', connected: false, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
      { id: 'c', name: 'Charlie', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
    ];
    const peers = derivePeerSet(players, 'a');
    expect(peers).toEqual(new Set(['b', 'c']));
  });

  it('returns empty set for single player', () => {
    const players: LDStateLike['players'] = [
      { id: 'a', name: 'Alice', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
    ];
    const peers = derivePeerSet(players, 'a');
    expect(peers).toEqual(new Set([]));
  });

  it('returns empty set when all others are eliminated', () => {
    const players: LDStateLike['players'] = [
      { id: 'a', name: 'Alice', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
      { id: 'b', name: 'Bob', connected: true, isBot: false, diceCount: 0, eliminated: true, chips: 0 },
    ];
    const peers = derivePeerSet(players, 'a');
    expect(peers).toEqual(new Set([]));
  });
});

// ─── diffPeerSet ──────────────────────────────────────────────────────────────

describe('diffPeerSet', () => {
  it('detects added peers', () => {
    const prev = new Set(['a', 'b']);
    const next = new Set(['a', 'b', 'c']);
    const diff = diffPeerSet(prev, next);
    expect(diff.added).toEqual(['c']);
    expect(diff.removed).toEqual([]);
  });

  it('detects removed peers', () => {
    const prev = new Set(['a', 'b', 'c']);
    const next = new Set(['a', 'b']);
    const diff = diffPeerSet(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual(['c']);
  });

  it('detects both added and removed in same diff', () => {
    const prev = new Set(['a', 'b', 'c']);
    const next = new Set(['b', 'c', 'd', 'e']);
    const diff = diffPeerSet(prev, next);
    expect(new Set(diff.added)).toEqual(new Set(['d', 'e']));
    expect(diff.removed).toEqual(['a']);
  });

  it('returns empty diff when sets are identical', () => {
    const prev = new Set(['a', 'b', 'c']);
    const next = new Set(['a', 'b', 'c']);
    const diff = diffPeerSet(prev, next);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('handles empty sets', () => {
    const prev = new Set<string>();
    const next = new Set(['a', 'b']);
    const diff = diffPeerSet(prev, next);
    expect(new Set(diff.added)).toEqual(new Set(['a', 'b']));
    expect(diff.removed).toEqual([]);
  });

  it('handles transition from non-empty to empty', () => {
    const prev = new Set(['a', 'b']);
    const next = new Set<string>();
    const diff = diffPeerSet(prev, next);
    expect(diff.added).toEqual([]);
    expect(new Set(diff.removed)).toEqual(new Set(['a', 'b']));
  });

  it('is idempotent: diff(A, B) then diff(B, B) is no-op', () => {
    const a = new Set(['x', 'y']);
    const b = new Set(['x', 'y', 'z']);
    const diff1 = diffPeerSet(a, b);
    const diff2 = diffPeerSet(b, b);
    expect(diff1.added).toEqual(['z']);
    expect(diff1.removed).toEqual([]);
    expect(diff2.added).toEqual([]);
    expect(diff2.removed).toEqual([]);
  });
});
