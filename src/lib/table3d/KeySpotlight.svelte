<script lang="ts">
  /**
   * KeySpotlight: the main table key light.
   * Properly wires SpotLight.target into the Three.js scene via useThrelte().
   * Target is fixed at the table centre [0, 0, 0].
   * Must live inside <Canvas>.
   */
  import { T, useThrelte } from '@threlte/core';
  import type { SpotLight } from 'three';

  let {
    color,
    intensity,
    angle,
    penumbra,
    position,
  }: {
    color: number;
    intensity: number;
    angle: number;
    penumbra: number;
    position: [number, number, number];
  } = $props();

  const { scene } = useThrelte();
  let spot: SpotLight | null = null;

  function onCreate(s: SpotLight) {
    spot = s;
    scene.add(s.target);
    s.target.position.set(0, 0, 0);
    s.target.updateMatrixWorld();
  }
</script>

<T.SpotLight
  {color}
  {intensity}
  {angle}
  {penumbra}
  {position}
  oncreate={onCreate}
/>
