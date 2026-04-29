import type {
  PlatformerInput,
  PlatformerPlayer,
  MapDef,
  AttackHit,
  ResolveAttackResult,
} from './types';

export const TICK_MS = 33;
export const GRAVITY = 1800;
export const MOVE_SPEED = 260;
export const JUMP_VEL = -620;
export const DOUBLE_JUMP_VEL = -540;
export const MAX_JUMPS = 2;
export const ATTACK_RANGE = 72;
export const ATTACK_HEIGHT = 44;
export const ATTACK_COOLDOWN_MS = 450;
export const ATTACK_ACTIVE_MS = 120;
export const KNOCKBACK_X = 620;
export const KNOCKBACK_Y = -520;
export const HITSTUN_MS = 320;
export const KNOCKBACK_PER_HIT = 0.12;
export const INVULN_MS = 600;
export const RESPAWN_MS = 1500;
export const RESPAWN_INVULN_MS = 1200;
export const PLAYER_W = 36;
export const PLAYER_H = 56;
export const OOB_MARGIN = 80;

const SPAWN_POSITIONS: { x: number; y: number }[] = [
  { x: 200, y: 200 },
  { x: 600, y: 200 },
  { x: 360, y: 120 },
  { x: 440, y: 120 },
];

export function defaultMap(): MapDef {
  return {
    width: 800,
    height: 480,
    platforms: [
      { x: 80, y: 400, w: 640, h: 24 },
      { x: 200, y: 300, w: 160, h: 16 },
      { x: 440, y: 300, w: 160, h: 16 },
      { x: 320, y: 220, w: 160, h: 16 },
    ],
  };
}

export function respawnPosition(map: MapDef, index: number): { x: number; y: number } {
  const pos = SPAWN_POSITIONS[index % SPAWN_POSITIONS.length];
  return { x: pos.x, y: pos.y };
}

function clampDt(dtMs: number): number {
  if (dtMs <= 0) return 0;
  if (dtMs > 100) return 100;
  return dtMs;
}

function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function stepPlayer(
  player: PlatformerPlayer,
  input: PlatformerInput,
  prevInput: PlatformerInput,
  dtMs: number,
  map: MapDef,
): PlatformerPlayer {
  const dt = clampDt(dtMs) / 1000;
  let { x, y, vx, vy, facing, onGround, jumpsRemaining,
        attackCooldownMs, attackActiveMs, invulnMs, lives, respawnMs } = player;
  let hitstunMs = player.hitstunMs;

  attackCooldownMs = Math.max(0, attackCooldownMs - dtMs);
  attackActiveMs = Math.max(0, attackActiveMs - dtMs);
  invulnMs = Math.max(0, invulnMs - dtMs);
  respawnMs = Math.max(0, respawnMs - dtMs);
  hitstunMs = Math.max(0, hitstunMs - dtMs);

  if (player.respawnMs > 0) {
    return {
      ...player,
      attackCooldownMs, attackActiveMs, invulnMs, respawnMs, hitstunMs,
      vx: 0, vy: 0,
    };
  }

  if (hitstunMs <= 0) {
    const wantLeft = input.left && !input.right;
    const wantRight = input.right && !input.left;
    if (wantLeft) { vx = -MOVE_SPEED; facing = -1; }
    else if (wantRight) { vx = MOVE_SPEED; facing = 1; }
    else { vx = 0; }

    const jumpEdge = input.jump && !prevInput.jump;
    if (jumpEdge && jumpsRemaining > 0) {
      vy = onGround ? JUMP_VEL : DOUBLE_JUMP_VEL;
      jumpsRemaining -= 1;
      onGround = false;
    }

    const attackEdge = input.attack && !prevInput.attack;
    if (attackEdge && attackCooldownMs <= 0) {
      attackCooldownMs = ATTACK_COOLDOWN_MS;
      attackActiveMs = ATTACK_ACTIVE_MS;
    }
  }

  vy += GRAVITY * dt;
  x += vx * dt;
  y += vy * dt;

  if (x < 0) x = 0;
  if (x + PLAYER_W > map.width) x = map.width - PLAYER_W;

  onGround = false;
  if (vy >= 0) {
    for (const plat of map.platforms) {
      const prevBottom = (player.y) + PLAYER_H;
      const newBottom = y + PLAYER_H;
      const horizontallyOverlapping =
        x + PLAYER_W > plat.x && x < plat.x + plat.w;
      const wasAbove = prevBottom <= plat.y + 0.5;
      const nowBelowOrOn = newBottom >= plat.y;
      if (horizontallyOverlapping && wasAbove && nowBelowOrOn) {
        y = plat.y - PLAYER_H;
        vy = 0;
        onGround = true;
        jumpsRemaining = MAX_JUMPS;
        break;
      }
    }
  }

  return {
    ...player,
    x, y, vx, vy, facing, onGround, jumpsRemaining,
    attackCooldownMs, attackActiveMs, invulnMs, respawnMs, hitstunMs,
  };
}

export function resolveAttack(
  attacker: PlatformerPlayer,
  defenders: PlatformerPlayer[],
): ResolveAttackResult {
  const hits: AttackHit[] = [];
  if (attacker.attackActiveMs <= 0 || attacker.respawnMs > 0) {
    return { hits };
  }
  const hbY = attacker.y + (PLAYER_H - ATTACK_HEIGHT) / 2;
  const hbX = attacker.facing === 1
    ? attacker.x + PLAYER_W
    : attacker.x - ATTACK_RANGE;

  for (const d of defenders) {
    if (d.id === attacker.id) continue;
    if (d.invulnMs > 0) continue;
    if (d.respawnMs > 0) continue;
    if (d.lives <= 0) continue;

    const overlap = rectsOverlap(
      hbX, hbY, ATTACK_RANGE, ATTACK_HEIGHT,
      d.x, d.y, PLAYER_W, PLAYER_H,
    );
    if (!overlap) continue;

    hits.push({
      id: d.id,
      knockbackX: KNOCKBACK_X * attacker.facing,
      knockbackY: KNOCKBACK_Y,
    });
  }

  return { hits };
}

export function applyKnockback(
  player: PlatformerPlayer,
  kx: number,
  ky: number,
  invulnMs: number = INVULN_MS,
): PlatformerPlayer {
  return {
    ...player,
    vx: kx,
    vy: ky,
    invulnMs,
    hitstunMs: HITSTUN_MS,
    onGround: false,
  };
}

export function isOutOfBounds(p: PlatformerPlayer, map: MapDef): boolean {
  return (
    p.y > map.height + OOB_MARGIN ||
    p.x + PLAYER_W < -OOB_MARGIN ||
    p.x > map.width + OOB_MARGIN
  );
}

export function newPlayer(
  id: string,
  name: string,
  spawn: { x: number; y: number },
  isGuest: boolean,
): PlatformerPlayer {
  return {
    id, name,
    x: spawn.x, y: spawn.y,
    vx: 0, vy: 0,
    facing: 1,
    onGround: false,
    jumpsRemaining: MAX_JUMPS,
    attackCooldownMs: 0,
    attackActiveMs: 0,
    invulnMs: RESPAWN_INVULN_MS,
    hitstunMs: 0,
    hitsTaken: 0,
    lives: 3,
    respawnMs: 0,
    connected: true,
    isGuest,
  };
}

export function emptyInput(seq = 0): PlatformerInput {
  return { left: false, right: false, jump: false, attack: false, seq };
}
