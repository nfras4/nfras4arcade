<script lang="ts">
  /**
   * TableProjector: renderless component that must live inside a Threlte <Canvas>.
   * Each frame it projects 3D head positions to CSS percentage coords and calls
   * onupdate with the result map. The parent layer reads this to position nameplate
   * divs on a sibling overlay.
   *
   * No visible geometry. No framework deps beyond @threlte/core (already required).
   */
  import { useTask, useThrelte } from '@threlte/core';
  import * as THREE from 'three';
  import type { SeatAssignment } from './core/seats.js';

  let {
    /** Current seat assignment map, keyed by playerId. */
    seatMap,
    /** All opponent players (to know which ids to project). */
    opponentIds,
    /** Y offset above seat root to use as the nameplate anchor (head top). */
    headOffsetY,
    /** Called each frame with updated position map (only when values change). */
    onupdate,
  }: {
    seatMap: ReadonlyMap<string, SeatAssignment>;
    opponentIds: string[];
    headOffsetY: number;
    onupdate: (map: Record<string, { left: string; top: string; visible: boolean }>) => void;
  } = $props();

  const { camera, size } = useThrelte();

  // Reusable vector to avoid per-frame allocation.
  const worldPos = new THREE.Vector3();

  // Track previous values to avoid writing state on frames with no movement.
  // Threshold: 0.1 percentage point movement triggers an update.
  const MOVE_THRESHOLD = 0.1;
  let prevMap: Record<string, { left: string; top: string; visible: boolean }> = {};

  useTask(() => {
    const cam = camera.current;
    const { width, height } = size.current;
    if (!cam || width === 0 || height === 0) return;

    const next: Record<string, { left: string; top: string; visible: boolean }> = {};
    let changed = false;

    for (const id of opponentIds) {
      const seat = seatMap.get(id);
      if (!seat) continue;

      const [sx, sy, sz] = seat.transform.position;
      worldPos.set(sx, sy + headOffsetY, sz);
      worldPos.project(cam);

      // NDC z > 1 means the point is behind the camera; skip it.
      const visible = worldPos.z <= 1.0;

      // Raw projected percentage coordinates.
      const rawLeft = (( worldPos.x + 1) / 2) * 100;
      const rawTop  = ((-worldPos.y + 1) / 2) * 100;

      // Clamp left to [6, 94] so outer-seat nameplates (which use
      // transform: translate(-50%, -100%)) never clip past the stage edges.
      const leftPct = Math.max(6, Math.min(94, rawLeft));
      const topPct  = rawTop;

      const leftStr = `${leftPct.toFixed(2)}%`;
      const topStr  = `${topPct.toFixed(2)}%`;

      next[id] = { left: leftStr, top: topStr, visible };

      const prev = prevMap[id];
      if (
        !prev ||
        prev.visible !== visible ||
        Math.abs(parseFloat(prev.left) - leftPct) > MOVE_THRESHOLD ||
        Math.abs(parseFloat(prev.top)  - topPct)  > MOVE_THRESHOLD
      ) {
        changed = true;
      }
    }

    // Also flag changed if a player left (fewer keys in next than prev).
    if (!changed && Object.keys(next).length !== Object.keys(prevMap).length) {
      changed = true;
    }

    if (changed) {
      prevMap = next;
      onupdate(next);
    }
  });
</script>
