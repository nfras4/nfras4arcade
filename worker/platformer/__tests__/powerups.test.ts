import { describe, test, expect } from 'bun:test';
import {
  spawnPowerup, playerHits, applyEffect, decayEffects, hasEffect,
  POWERUP_SIZE, POWERUP_DURATION_MS, MAX_ACTIVE_POWERUPS,
} from '../powerups';
import { newPlayer, defaultMap } from '../physics';
import type { Powerup, MapDef } from '../types';

const map = defaultMap();

function freshPlayer(id = 'p1', x = 300, y = 200) {
  const p = newPlayer(id, id, { x, y }, false);
  p.invulnMs = 0;
  p.respawnMs = 0;
  return p;
}

function makePowerup(x: number, y: number): Powerup {
  return { id: 'pu_test', kind: 'speed', x, y };
}

describe('spawnPowerup', () => {
  test('returns null when existing.length >= MAX_ACTIVE_POWERUPS', () => {
    const existing: Powerup[] = [
      { id: 'a', kind: 'speed', x: 0, y: 0 },
      { id: 'b', kind: 'damage', x: 0, y: 0 },
    ];
    expect(existing.length).toBe(MAX_ACTIVE_POWERUPS);
    const result = spawnPowerup(map, existing, 42);
    expect(result).toBeNull();
  });

  test('returns null when map.platforms is empty', () => {
    const emptyMap: MapDef = { width: 800, height: 480, platforms: [] };
    const result = spawnPowerup(emptyMap, [], 42);
    expect(result).toBeNull();
  });

  test('returns a Powerup positioned above the platform when valid', () => {
    const result = spawnPowerup(map, [], 0);
    expect(result).not.toBeNull();
    const plat = map.platforms[0];
    // x should be centered on the platform
    const expectedX = plat.x + plat.w / 2 - POWERUP_SIZE / 2;
    const expectedY = plat.y - POWERUP_SIZE - 4;
    expect(result!.x).toBe(expectedX);
    expect(result!.y).toBe(expectedY);
    expect(result!.kind).toBeDefined();
    expect(result!.id).toMatch(/^pu_/);
  });
});

describe('playerHits', () => {
  test('true when AABB overlaps', () => {
    const player = freshPlayer('p1', 100, 100);
    const powerup = makePowerup(110, 110);
    expect(playerHits(player, powerup)).toBe(true);
  });

  test('false when player far away', () => {
    const player = freshPlayer('p1', 100, 100);
    const powerup = makePowerup(500, 500);
    expect(playerHits(player, powerup)).toBe(false);
  });
});

describe('applyEffect', () => {
  test('adds effect with correct expiresAt', () => {
    const player = freshPlayer('p1');
    const now = 1000;
    const result = applyEffect(player, 'speed', now);
    expect(result.effects).toBeDefined();
    expect(result.effects!.length).toBe(1);
    expect(result.effects![0].kind).toBe('speed');
    expect(result.effects![0].expiresAt).toBe(now + POWERUP_DURATION_MS);
  });

  test('replaces existing same-kind effect (no duplicates)', () => {
    const player = freshPlayer('p1');
    const now = 1000;
    const withEffect = applyEffect(player, 'speed', now);
    const later = now + 3000;
    const replaced = applyEffect(withEffect, 'speed', later);
    const speedEffects = replaced.effects!.filter(e => e.kind === 'speed');
    expect(speedEffects.length).toBe(1);
    expect(speedEffects[0].expiresAt).toBe(later + POWERUP_DURATION_MS);
  });
});

describe('decayEffects', () => {
  test('removes expired effects, keeps live ones', () => {
    const player = freshPlayer('p1');
    const now = 5000;
    let p = applyEffect(player, 'speed', now - POWERUP_DURATION_MS - 1); // expired
    p = applyEffect(p, 'damage', now + 1000); // still live
    const decayed = decayEffects(p, now);
    expect(decayed.effects!.length).toBe(1);
    expect(decayed.effects![0].kind).toBe('damage');
  });

  test('returns same reference when no effects expired', () => {
    const player = freshPlayer('p1');
    const now = 1000;
    const p = applyEffect(player, 'speed', now);
    const decayed = decayEffects(p, now);
    // all effects still live, same object returned
    expect(decayed).toBe(p);
  });
});

describe('hasEffect', () => {
  test('true when effect of given kind is present', () => {
    const player = freshPlayer('p1');
    const now = 1000;
    const p = applyEffect(player, 'triple_jump', now);
    expect(hasEffect(p, 'triple_jump')).toBe(true);
  });

  test('false when effect not present', () => {
    const player = freshPlayer('p1');
    expect(hasEffect(player, 'speed')).toBe(false);
  });
});
