import { describe, test, expect } from 'bun:test';
import {
  defaultMap, stepPlayer, resolveAttack, applyKnockback, isOutOfBounds,
  newPlayer, emptyInput,
  TICK_MS, GRAVITY, JUMP_VEL, MAX_JUMPS,
  ATTACK_COOLDOWN_MS, INVULN_MS, PLAYER_W, PLAYER_H, OOB_MARGIN, HITSTUN_MS, MOVE_SPEED,
} from '../physics';

const map = defaultMap();

function freshPlayer(id = 'p1', x = 300, y = 200) {
  const p = newPlayer(id, id, { x, y }, false);
  p.invulnMs = 0;
  p.respawnMs = 0;
  return p;
}

describe('stepPlayer', () => {
  test('gravity pulls a midair player down', () => {
    const p = freshPlayer('p1', 300, 50);
    p.onGround = false;
    const next = stepPlayer(p, emptyInput(1), emptyInput(0), TICK_MS, map);
    expect(next.vy).toBeGreaterThan(0);
    expect(next.y).toBeGreaterThan(p.y);
  });

  test('ground collision zeros vy and sets onGround', () => {
    const ground = map.platforms[0];
    const p = freshPlayer('p1', ground.x + 20, ground.y - PLAYER_H - 20);
    p.vy = 800;
    p.onGround = false;
    const next = stepPlayer(p, emptyInput(1), emptyInput(0), TICK_MS, map);
    expect(next.onGround).toBe(true);
    expect(next.vy).toBe(0);
    expect(next.y).toBe(ground.y - PLAYER_H);
    expect(next.jumpsRemaining).toBe(MAX_JUMPS);
  });

  test('jump rising-edge fires once and consumes a jump', () => {
    const ground = map.platforms[0];
    let p = freshPlayer('p1', ground.x + 20, ground.y - PLAYER_H);
    p.onGround = true;
    p.jumpsRemaining = MAX_JUMPS;
    const input = { ...emptyInput(1), jump: true };
    p = stepPlayer(p, input, emptyInput(0), TICK_MS, map);
    expect(p.vy).toBe(JUMP_VEL + (GRAVITY * TICK_MS) / 1000);
    expect(p.jumpsRemaining).toBe(MAX_JUMPS - 1);
    const p2 = stepPlayer(p, input, input, TICK_MS, map);
    expect(p2.jumpsRemaining).toBe(p.jumpsRemaining);
  });

  test('double-jump fires from midair when jumpsRemaining > 0', () => {
    let p = freshPlayer('p1', 300, 100);
    p.onGround = false;
    p.jumpsRemaining = 1;
    p.vy = 200;
    const input = { ...emptyInput(2), jump: true };
    p = stepPlayer(p, input, emptyInput(1), TICK_MS, map);
    expect(p.jumpsRemaining).toBe(0);
    expect(p.vy).toBeLessThan(0);
  });

  test('stepPlayer ignores left/right input during hitstun', () => {
    let p = freshPlayer('p1', 300, 200);
    p.hitstunMs = 200;
    p.vx = 400; // simulate knockback velocity
    const input = { left: true, right: false, jump: false, attack: false, seq: 1 };
    const next = stepPlayer(p, input, emptyInput(0), TICK_MS, map);
    // vx should NOT be -MOVE_SPEED; should keep knockback value
    expect(next.vx).toBe(400);
    expect(next.hitstunMs).toBeLessThan(200);
  });

  test('attack press starts cooldown + active window; second press blocked', () => {
    let p = freshPlayer('p1', 300, 200);
    p.attackCooldownMs = 0;
    const press = { ...emptyInput(1), attack: true };
    p = stepPlayer(p, press, emptyInput(0), TICK_MS, map);
    expect(p.attackActiveMs).toBeGreaterThan(0);
    expect(p.attackCooldownMs).toBeGreaterThan(0);
    const beforeCd = p.attackCooldownMs;
    p = stepPlayer(p, press, press, TICK_MS, map);
    expect(p.attackCooldownMs).toBeLessThan(beforeCd);
    const release = emptyInput(2);
    const press2 = { ...emptyInput(3), attack: true };
    p = stepPlayer(p, release, press, TICK_MS, map);
    p = stepPlayer(p, press2, release, TICK_MS, map);
    expect(p.attackCooldownMs).toBeGreaterThan(0);
    expect(p.attackCooldownMs).toBeLessThan(ATTACK_COOLDOWN_MS);
  });
});

describe('resolveAttack', () => {
  test('reports a hit on defender in front of attacker', () => {
    const a = freshPlayer('a', 200, 200);
    a.facing = 1;
    a.attackActiveMs = 100;
    const d = freshPlayer('d', 200 + PLAYER_W + 10, 200);
    const r = resolveAttack(a, [d]);
    expect(r.hits.length).toBe(1);
    expect(r.hits[0].id).toBe('d');
    expect(r.hits[0].knockbackX).toBeGreaterThan(0);
  });

  test('ignores defender behind attacker', () => {
    const a = freshPlayer('a', 200, 200);
    a.facing = 1;
    a.attackActiveMs = 100;
    const d = freshPlayer('d', 100, 200);
    const r = resolveAttack(a, [d]);
    expect(r.hits.length).toBe(0);
  });

  test('skips invuln defenders', () => {
    const a = freshPlayer('a', 200, 200);
    a.facing = 1;
    a.attackActiveMs = 100;
    const d = freshPlayer('d', 200 + PLAYER_W + 10, 200);
    d.invulnMs = 200;
    const r = resolveAttack(a, [d]);
    expect(r.hits.length).toBe(0);
  });

  test('returns no hits when attackActiveMs is 0', () => {
    const a = freshPlayer('a', 200, 200);
    a.attackActiveMs = 0;
    const d = freshPlayer('d', 200 + PLAYER_W + 10, 200);
    const r = resolveAttack(a, [d]);
    expect(r.hits.length).toBe(0);
  });
});

describe('applyKnockback', () => {
  test('flips vx/vy and sets invulnMs', () => {
    const p = freshPlayer('p', 200, 200);
    const k = applyKnockback(p, -300, -400);
    expect(k.vx).toBe(-300);
    expect(k.vy).toBe(-400);
    expect(k.invulnMs).toBe(INVULN_MS);
    expect(k.hitstunMs).toBe(HITSTUN_MS);
    expect(k.onGround).toBe(false);
  });
});

describe('isOutOfBounds', () => {
  test('true when y > map.height + margin', () => {
    const p = freshPlayer('p', 100, map.height + OOB_MARGIN + 10);
    expect(isOutOfBounds(p, map)).toBe(true);
  });

  test('false when on the main platform', () => {
    const ground = map.platforms[0];
    const p = freshPlayer('p', ground.x + 20, ground.y - PLAYER_H);
    expect(isOutOfBounds(p, map)).toBe(false);
  });
});
