import type { MapDef, Powerup, PowerupKind, PlayerEffect, PlatformerPlayer } from './types';
import { PLAYER_W, PLAYER_H } from './physics';

export const POWERUP_SIZE = 24;
export const POWERUP_DURATION_MS = 8000;
export const POWERUP_SPAWN_INTERVAL_MS = 10000;
export const MAX_ACTIVE_POWERUPS = 2;
export const SPEED_MULTIPLIER = 1.5;
export const DAMAGE_MULTIPLIER = 1.6;
export const TRIPLE_JUMP_COUNT = 3;

const KINDS: PowerupKind[] = ['speed', 'damage', 'triple_jump'];

// Pure: deterministic spawn given a seed (uses simple hash)
export function spawnPowerup(map: MapDef, existing: Powerup[], seed: number): Powerup | null {
  if (existing.length >= MAX_ACTIVE_POWERUPS) return null;
  if (map.platforms.length === 0) return null;
  const platIdx = Math.abs(seed) % map.platforms.length;
  const plat = map.platforms[platIdx];
  const kind = KINDS[Math.abs(seed >> 8) % KINDS.length];
  const x = plat.x + plat.w / 2 - POWERUP_SIZE / 2;
  const y = plat.y - POWERUP_SIZE - 4;
  const id = `pu_${seed}`;
  return { id, kind, x, y };
}

export function playerHits(player: PlatformerPlayer, p: Powerup): boolean {
  return (
    player.x < p.x + POWERUP_SIZE &&
    player.x + PLAYER_W > p.x &&
    player.y < p.y + POWERUP_SIZE &&
    player.y + PLAYER_H > p.y
  );
}

export function applyEffect(player: PlatformerPlayer, kind: PowerupKind, now: number): PlatformerPlayer {
  const effects = (player.effects ?? []).filter(e => e.kind !== kind);
  effects.push({ kind, expiresAt: now + POWERUP_DURATION_MS });
  return { ...player, effects };
}

export function decayEffects(player: PlatformerPlayer, now: number): PlatformerPlayer {
  if (!player.effects || player.effects.length === 0) return player;
  const live = player.effects.filter(e => e.expiresAt > now);
  if (live.length === player.effects.length) return player;
  return { ...player, effects: live };
}

export function hasEffect(player: PlatformerPlayer, kind: PowerupKind): boolean {
  return !!player.effects?.some(e => e.kind === kind);
}
