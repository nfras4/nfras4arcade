<script lang="ts">
  /**
   * RitualSpotlight: a single SpotLight that properly wires its .target Object3D
   * into the Three.js scene via oncreate, then tracks a target position reactively.
   *
   * Three.js SpotLight.target is a detached Object3D by default. It only works
   * if explicitly added to the scene; the `target-position` Threlte prop shorthand
   * does NOT add it to the scene, so the light always aims at the world origin.
   *
   * This component must live inside <Canvas> so useThrelte() is valid.
   */
  import { T, useThrelte } from '@threlte/core';
  import type { SpotLight } from 'three';

  let {
    color,
    intensity,
    angle,
    penumbra,
    position,
    targetPosition,
  }: {
    color: number;
    intensity: number;
    angle: number;
    penumbra: number;
    position: [number, number, number];
    targetPosition: [number, number, number];
  } = $props();

  const { scene } = useThrelte();
  let spot: SpotLight | null = null;

  function onCreate(s: SpotLight) {
    spot = s;
    // Must add the target to the scene so Three.js can transform it
    scene.add(s.target);
  }

  // Keep target position in sync whenever targetPosition prop changes
  $effect(() => {
    if (!spot) return;
    spot.target.position.set(targetPosition[0], targetPosition[1], targetPosition[2]);
    spot.target.updateMatrixWorld();
  });
</script>

<T.SpotLight
  {color}
  {intensity}
  {angle}
  {penumbra}
  {position}
  oncreate={onCreate}
/>
