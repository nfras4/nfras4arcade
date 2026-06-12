<script lang="ts">
  import { T } from '@threlte/core';
</script>

<!--
  Barrel table geometry.
  Art bible: deep casino-green felt top, warm walnut barrel sides.
  Flat shading throughout. No PBR textures, no normal maps.
  Dimensions chosen so PlaceholderMonkey roots (Y=0) sit at the felt surface
  and the barrel visually reads as a poker-table drum at the 37-deg FOV.

  Felt disc:   r=2.2, h=0.06, Y=0.03  (surface at Y=0.06, roots at Y=0)
  Barrel body: r=2.0, h=0.80, Y=-0.40 (drum from Y=0 down to Y=-0.80)
  Base ring:   r=2.1, h=0.10, Y=-0.85 (foot flare at the bottom)
-->

<!-- Felt top disc. Radius must stay INSIDE core/seats.ts ARC_RADIUS (1.6)
     so monkeys sit just outside the rim, not embedded in the felt. -->
<T.Mesh position={[0, 0.03, 0]} receiveShadow={false}>
  <T.CylinderGeometry args={[2.0, 2.0, 0.06, 40]} />
  <T.MeshStandardMaterial color={0x1a4a2a} roughness={0.95} metalness={0} flatShading={true} />
</T.Mesh>

<!-- Barrel body: warm walnut -->
<T.Mesh position={[0, -0.40, 0]}>
  <T.CylinderGeometry args={[1.85, 1.85, 0.80, 40]} />
  <T.MeshStandardMaterial color={0x6b3d1e} roughness={0.85} metalness={0} flatShading={true} />
</T.Mesh>

<!-- Base flare ring -->
<T.Mesh position={[0, -0.85, 0]}>
  <T.CylinderGeometry args={[1.90, 2.10, 0.10, 40]} />
  <T.MeshStandardMaterial color={0x5a3218} roughness={0.90} metalness={0} flatShading={true} />
</T.Mesh>
