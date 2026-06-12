<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import type { ExpressionName, HatId } from './core/rig.js';

  let {
    furColor = '#8B5E3C',
    expression = 'neutral' as ExpressionName,
    talkAmplitude = 0,
    hat = 'none' as HatId,
  }: {
    furColor?: string;
    expression?: ExpressionName;
    talkAmplitude?: number;
    hat?: HatId;
  } = $props();
</script>

<!--
  Phase 0 test scene.
  Art bible: near-black bg, warm key spotlight above, low ambient, cool rim from behind.
  Camera: 37 deg FOV, slightly above eye level, looking at monkey origin.
  No shadows for Phase 0. No OrbitControls.
-->
<div class="scene-wrap">
  <Canvas>
    <!-- Camera: authored position, no player control -->
    <T.PerspectiveCamera
      makeDefault
      fov={37}
      near={0.1}
      far={50}
      position={[0, 1.5, 5.2]}
      oncreate={(camera) => { camera.lookAt(0, 0.3, 0); }}
    />

    <!-- Ambient fill: warmer tint, slightly raised intensity (item 9) -->
    <T.AmbientLight color={0xaa9988} intensity={0.5} />

    <!-- Warm key spotlight: more frontal position, higher intensity (item 9) -->
    <!-- Intensity is candela: physically correct lights decay with distance,
         so a spotlight ~4m out needs a high value to read on the face. -->
    <T.SpotLight
      color={0xffe8c0}
      intensity={40}
      angle={0.45}
      penumbra={0.4}
      position={[0.6, 3.2, 2.8]}
      target-position={[0, 0, 0]}
    />

    <!-- Cool rim light from behind: separates monkey from background -->
    <T.DirectionalLight
      color={0x7ab8d4}
      intensity={0.9}
      position={[-1, 1.5, -3]}
    />

    <!-- Felt disc: CylinderGeometry is Y-up by default, no rotation needed (item 7) -->
    <T.Mesh position={[0, -0.85, 0]}>
      <T.CylinderGeometry args={[2.2, 2.2, 0.05, 32]} />
      <T.MeshStandardMaterial color={0x1a4a2a} roughness={0.95} metalness={0} />
    </T.Mesh>

    <!-- Monkey rig: imperative Three.js, mounts itself to scene via useThrelte -->
    <PlaceholderMonkey
      {furColor}
      {expression}
      {talkAmplitude}
      {hat}
    />
  </Canvas>
</div>

<style>
  .scene-wrap {
    width: 100%;
    height: 100%;
    display: block;
    background: #0a0b0d;
  }
</style>
