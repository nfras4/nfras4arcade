import type { PlatformerInput, PlatformerPlayer, MapDef, Powerup, PlatformerSnapshot } from './types';
import {
  stepPlayer, resolveAttack, applyKnockback, isOutOfBounds,
  newPlayer, emptyInput, respawnPosition,
  RESPAWN_MS, MAX_JUMPS,
} from './physics';
import { getMap } from './maps';
import {
  spawnPowerup, playerHits, applyEffect, decayEffects, hasEffect,
  POWERUP_SPAWN_INTERVAL_MS, MAX_ACTIVE_POWERUPS,
  SPEED_MULTIPLIER, DAMAGE_MULTIPLIER, TRIPLE_JUMP_COUNT,
} from './powerups';
import { decidePlatformerInput } from '../bots/platformerBot';

export interface SimMatchOptions {
  mapId?: string;
  numBots: number;       // 2..4
  maxTicks?: number;     // default 5000
  startingLives?: number;// default 3
  tickMs?: number;       // default 66
}

export interface SimMatchResult {
  ticks: number;
  finalSnapshot: PlatformerSnapshot;
  matchWinnerId: string | null;
  invariantsHeld: boolean;
  invariantViolations: string[];
}

export function simulateMatch(opts: SimMatchOptions): SimMatchResult {
  const map = getMap(opts.mapId ?? 'default');
  const numBots = Math.max(2, Math.min(4, opts.numBots));
  const maxTicks = opts.maxTicks ?? 5000;
  const tickMs = opts.tickMs ?? 66;
  const startingLives = opts.startingLives ?? 3;

  const players = new Map<string, PlatformerPlayer>();
  const inputs = new Map<string, PlatformerInput>();
  const prevInputs = new Map<string, PlatformerInput>();
  const scores = new Map<string, number>();

  for (let i = 0; i < numBots; i++) {
    const id = `bot_${i}`;
    const spawn = respawnPosition(map, i);
    const p = newPlayer(id, `Bot ${i + 1}`, spawn, true);
    p.invulnMs = 0;
    p.lives = startingLives;
    players.set(id, p);
    inputs.set(id, emptyInput(0));
    prevInputs.set(id, emptyInput(0));
    scores.set(id, 0);
  }

  let powerups: Powerup[] = [];
  let nextPowerupSpawn = 0;
  let powerupSeed = 1;
  let matchWinnerId: string | null = null;
  let now = 0;
  let tick = 0;
  const invariantViolations: string[] = [];

  function checkInvariants() {
    for (const [, p] of players) {
      if (p.lives < 0) invariantViolations.push(`tick ${tick}: ${p.id} lives < 0 (${p.lives})`);
      // jumpsRemaining can be up to TRIPLE_JUMP_COUNT (3) when triple_jump effect active, otherwise MAX_JUMPS (2)
      const cap = hasEffect(p, 'triple_jump') ? TRIPLE_JUMP_COUNT : MAX_JUMPS;
      if (p.jumpsRemaining > cap) invariantViolations.push(`tick ${tick}: ${p.id} jumpsRemaining ${p.jumpsRemaining} > cap ${cap}`);
      if (p.respawnMs < 0) invariantViolations.push(`tick ${tick}: ${p.id} respawnMs < 0`);
      if (p.invulnMs < 0) invariantViolations.push(`tick ${tick}: ${p.id} invulnMs < 0`);
    }
  }

  while (tick < maxTicks && matchWinnerId === null) {
    tick += 1;
    now += tickMs;

    // Bot inputs
    for (const [id, p] of players) {
      const opp = Array.from(players.values()).filter(x => x.id !== id);
      const next = decidePlatformerInput(p, opp, map, prevInputs.get(id) ?? emptyInput(0));
      inputs.set(id, next);
    }

    // Step
    for (const [id, p] of players) {
      if (p.lives <= 0) continue;
      const input = inputs.get(id) ?? emptyInput(0);
      const prev = prevInputs.get(id) ?? emptyInput(0);
      let next = stepPlayer(p, input, prev, tickMs, map);
      if (hasEffect(next, 'speed') && Math.abs(next.vx) > 0) {
        next = { ...next, x: next.x + next.vx * (tickMs / 1000) * (SPEED_MULTIPLIER - 1) };
      }
      if (hasEffect(next, 'triple_jump') && next.onGround) {
        next = { ...next, jumpsRemaining: TRIPLE_JUMP_COUNT };
      }
      next = decayEffects(next, now);
      players.set(id, next);
      prevInputs.set(id, input);
    }

    // Attacks
    const attackers = Array.from(players.values()).filter(p => p.attackActiveMs > 0 && p.lives > 0);
    for (const att of attackers) {
      const r = resolveAttack(att, Array.from(players.values()));
      const dmgMult = hasEffect(att, 'damage') ? DAMAGE_MULTIPLIER : 1;
      for (const hit of r.hits) {
        const def = players.get(hit.id);
        if (!def) continue;
        players.set(hit.id, applyKnockback(def, hit.knockbackX * dmgMult, hit.knockbackY));
      }
    }

    // OOB / respawn
    for (const [id, p] of players) {
      if (p.lives <= 0) continue;
      if (p.respawnMs > 0) continue;
      if (isOutOfBounds(p, map)) {
        const newLives = p.lives - 1;
        if (newLives <= 0) {
          players.set(id, { ...p, lives: 0, vx: 0, vy: 0, x: -9999, y: -9999, respawnMs: 0 });
        } else {
          const spawn = respawnPosition(map, Array.from(players.keys()).indexOf(id));
          players.set(id, {
            ...p, lives: newLives,
            x: spawn.x, y: spawn.y, vx: 0, vy: 0,
            attackActiveMs: 0, attackCooldownMs: 0,
            respawnMs: RESPAWN_MS, invulnMs: RESPAWN_MS + 800,
            onGround: false, jumpsRemaining: MAX_JUMPS,
          });
        }
      }
    }

    // Powerups
    if (now >= nextPowerupSpawn && powerups.length < MAX_ACTIVE_POWERUPS) {
      const np = spawnPowerup(map, powerups, powerupSeed++);
      if (np) powerups.push(np);
      nextPowerupSpawn = now + POWERUP_SPAWN_INTERVAL_MS;
    }
    for (const [id, p] of players) {
      if (p.lives <= 0 || p.respawnMs > 0) continue;
      for (let i = powerups.length - 1; i >= 0; i--) {
        const pu = powerups[i];
        if (playerHits(p, pu)) {
          players.set(id, applyEffect(p, pu.kind, now));
          powerups.splice(i, 1);
          break;
        }
      }
    }

    checkInvariants();

    // Round-over check (last alive)
    const alive = Array.from(players.values()).filter(p => p.lives > 0);
    if (alive.length <= 1) {
      const winner = alive[0]?.id ?? null;
      if (winner) scores.set(winner, (scores.get(winner) ?? 0) + 1);
      // Check for match winner (>= 2)
      for (const [id, s] of scores) {
        if (s >= 2) { matchWinnerId = id; break; }
      }
      // Reset for next round
      if (!matchWinnerId) {
        let i = 0;
        for (const [id, p] of players) {
          const spawn = respawnPosition(map, i++);
          const fresh = newPlayer(id, p.name, spawn, p.isGuest);
          fresh.lives = startingLives;
          players.set(id, fresh);
          inputs.set(id, emptyInput(0));
          prevInputs.set(id, emptyInput(0));
        }
        powerups = [];
        nextPowerupSpawn = now + POWERUP_SPAWN_INTERVAL_MS;
      }
    }
  }

  const finalSnapshot: PlatformerSnapshot = {
    tick,
    phase: matchWinnerId ? 'game_over' : 'playing',
    players: Array.from(players.values()),
    roundEndsAt: now,
    roundWinnerId: null,
    matchWinnerId,
    hostId: 'bot_0',
    code: 'TEST',
    scores: Object.fromEntries(scores),
    mapId: opts.mapId ?? 'default',
    platforms: map.platforms,
    powerups,
    bots: Array.from(players.keys()),
  };

  return {
    ticks: tick,
    finalSnapshot,
    matchWinnerId,
    invariantsHeld: invariantViolations.length === 0,
    invariantViolations,
  };
}
