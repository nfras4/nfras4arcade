<script lang="ts">
  /**
   * CameraRig: seated-parallax camera that owns the PerspectiveCamera.
   * The camera leans subtly toward the pointer: ~6 deg yaw, ~2.5 deg pitch,
   * eased at ~0.08/frame. Feels like turning your head at a table, not a tool.
   *
   * Rules:
   *  - Must live inside <Canvas> (uses useThrelte, useTask).
   *  - Disabled entirely under prefers-reduced-motion (prop or media query).
   *  - Disabled on touch devices (no pointer:fine = static).
   *  - Eases to centre while a ritual is active (authored framing wins).
   *  - listens to pointermove on the stage element passed as prop; no window listeners.
   */
  import { T, useTask, useThrelte } from '@threlte/core';
  import * as THREE from 'three';
  import {
    CAM_POSITION, CAM_LOOK_AT, CAM_FOV,
    PARALLAX_YAW_DEG, PARALLAX_PITCH_DEG,
    PARALLAX_LERP, PARALLAX_RETURN_LERP,
  } from './core/camera.js';

  let {
    stageEl,
    reducedMotion = false,
    ritualActive  = false,
  }: {
    /** The stage container element – pointermove is bound here, not window. */
    stageEl: HTMLElement | null;
    /** True when prefers-reduced-motion applies (passed from layer). */
    reducedMotion?: boolean;
    /** True while a ritual is playing; rig eases back to centre. */
    ritualActive?: boolean;
  } = $props();

  // ─── Fine-pointer detection ───────────────────────────────────────────────────
  // Touch / TV devices: no-op. Only engage when the OS reports a fine pointer.
  const hasFinePointer =
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: fine)').matches
      : false;

  // ─── Camera authored framing ──────────────────────────────────────────────────
  // Compute the authored heading so we can offset around it.
  const authored = (() => {
    const pos = new THREE.Vector3(...CAM_POSITION);
    const look = new THREE.Vector3(...CAM_LOOK_AT);
    const dir  = new THREE.Vector3().subVectors(look, pos).normalize();
    // Authored yaw (Y-rotation) and pitch (X-rotation) from the direction vector.
    const yaw   = Math.atan2(dir.x, dir.z);   // radians, around Y
    const pitch = Math.asin(-dir.y);           // radians, around X (negative: down)
    return { yaw, pitch, pos };
  })();

  const YAW_MAX   = (PARALLAX_YAW_DEG   * Math.PI) / 180;
  const PITCH_MAX = (PARALLAX_PITCH_DEG * Math.PI) / 180;

  // ─── Reactive pointer tracking ────────────────────────────────────────────────
  // Normalised pointer: -1..+1 in X (left→right), -1..+1 in Y (top→bottom).
  let ptrX = 0;
  let ptrY = 0;
  let ptrInside = false;

  // Current lerped offsets (radians).
  let curYaw   = 0;
  let curPitch = 0;

  // ─── Pointermove listener (bound via $effect, cleaned up on unmount) ─────────
  $effect(() => {
    if (!stageEl || !hasFinePointer) return;

    function onPointerMove(e: PointerEvent) {
      const rect = stageEl!.getBoundingClientRect();
      ptrX = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      ptrY = ((e.clientY - rect.top)  / rect.height) * 2 - 1;
      ptrInside = true;
    }
    function onPointerLeave() {
      ptrInside = false;
    }

    stageEl.addEventListener('pointermove', onPointerMove);
    stageEl.addEventListener('pointerleave', onPointerLeave);
    return () => {
      stageEl!.removeEventListener('pointermove', onPointerMove);
      stageEl!.removeEventListener('pointerleave', onPointerLeave);
    };
  });

  // ─── Camera object (imperative) ──────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.1, 50);
  camera.position.set(...CAM_POSITION);
  camera.lookAt(...CAM_LOOK_AT);

  const { renderer, size } = useThrelte();

  // Keep aspect ratio in sync with canvas size.
  $effect(() => {
    camera.aspect = $state.snapshot(size).width / $state.snapshot(size).height;
    camera.updateProjectionMatrix();
  });

  // ─── Frame loop: ease parallax offsets ───────────────────────────────────────
  useTask(() => {
    // Parallax completely off: reduced-motion or no fine pointer.
    if (reducedMotion || !hasFinePointer) {
      curYaw   = 0;
      curPitch = 0;
    } else {
      // Target: 0 when ritual active or pointer left stage; pointer offset otherwise.
      const targetYaw   = (!ptrInside || ritualActive) ? 0 : ptrX *  YAW_MAX;
      const targetPitch = (!ptrInside || ritualActive) ? 0 : ptrY * -PITCH_MAX; // Y up = negative ptr

      const lerpFactor = (!ptrInside || ritualActive) ? PARALLAX_RETURN_LERP : PARALLAX_LERP;
      curYaw   += (targetYaw   - curYaw)   * lerpFactor;
      curPitch += (targetPitch - curPitch) * lerpFactor;
    }

    // Apply: authored yaw/pitch + parallax offset.
    const finalYaw   = authored.yaw   + curYaw;
    const finalPitch = authored.pitch + curPitch;

    // Reconstruct lookAt from yaw + pitch.
    const LOOK_DIST = 1;
    const dx = Math.sin(finalYaw)   * Math.cos(finalPitch) * LOOK_DIST;
    const dy = -Math.sin(finalPitch) * LOOK_DIST;
    const dz = Math.cos(finalYaw)   * Math.cos(finalPitch) * LOOK_DIST;

    camera.position.set(...CAM_POSITION);
    camera.lookAt(
      CAM_POSITION[0] + dx,
      CAM_POSITION[1] + dy,
      CAM_POSITION[2] + dz,
    );
  });
</script>

<!-- Attach the imperative camera into Threlte's scene so it becomes makeDefault. -->
<T is={camera} makeDefault />
