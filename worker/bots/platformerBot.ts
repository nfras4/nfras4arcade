import type { PlatformerInput, PlatformerPlayer, MapDef } from '../platformer/types';
import { ATTACK_RANGE, PLAYER_W, PLAYER_H } from '../platformer/physics';

function platformBelow(map: MapDef, x: number, y: number): boolean {
  for (const p of map.platforms) {
    if (x >= p.x && x <= p.x + p.w && y < p.y && y + 200 > p.y) return true;
  }
  return false;
}

export function decidePlatformerInput(
  self: PlatformerPlayer,
  opponents: PlatformerPlayer[],
  map: MapDef,
  prevInput: PlatformerInput,
): PlatformerInput {
  const seq = prevInput.seq + 1;

  const alive = opponents.filter(o => o.lives > 0 && o.respawnMs === 0);
  if (alive.length === 0) {
    return { left: false, right: false, jump: false, attack: false, seq };
  }

  // Pick nearest opponent by horizontal distance
  const target = alive.reduce((best, opp) =>
    Math.abs(self.x - opp.x) < Math.abs(self.x - best.x) ? opp : best,
  );

  const deltaX = target.x - self.x;
  const deltaY = target.y - self.y;

  const attack =
    Math.abs(deltaX) <= ATTACK_RANGE + PLAYER_W &&
    Math.abs(deltaY) <= PLAYER_H &&
    self.attackCooldownMs <= 0;

  const left = !attack && deltaX < -8;
  const right = !attack && deltaX > 8;

  // Jump: fresh-press only (rising edge via prevInput.jump)
  let jump = false;
  if (!prevInput.jump) {
    if (deltaY < -40 && self.jumpsRemaining > 0) {
      jump = true;
    } else if (self.onGround) {
      // Jump if about to walk off the edge of a platform
      const nextX = self.x + (right ? PLAYER_W : left ? -PLAYER_W : 0);
      if ((left || right) && !platformBelow(map, nextX, self.y + PLAYER_H)) {
        jump = true;
      }
    }
  }

  return { left, right, jump, attack, seq };
}
