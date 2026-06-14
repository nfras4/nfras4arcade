<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import type { ExpressionName } from './core/rig.js';
  import { MONKEY_SCALE } from './core/seats.js';
  import { currentUser } from '$lib/auth';

  interface Props {
    furColour: string;
    expression?: ExpressionName;
    talkAmplitude?: number;
    playerName?: string;
  }

  let {
    furColour,
    expression = 'neutral' as ExpressionName,
    talkAmplitude = 0,
    playerName = 'You',
  }: Props = $props();
</script>

<div class="self-portrait-container">
  <Canvas>
    <!-- Camera framing. Confirmed from the rig source: the head MESH is at
         the root's local origin (root.add(headGroup), headGroup at (0,0,0)).
         So the unscaled head centre is at world (0,0,0). Camera at
         [0, 0, 2.4] FOV 38 looking forward (no lookAt drift, no auto-tilt)
         gives a vertical extent of 2 * tan(19 deg) * 2.4 ~= 1.65 units centred
         on the head; with MONKEY_SCALE the head spans ~0.81 vertically (ears
         at top + jaw at bottom) so there's clear margin for head-bob. -->
    <T.PerspectiveCamera position={[0, 0, 2.4]} fov={38} makeDefault />

    <!-- Key light: warm, front-facing -->
    <T.PointLight color={0xffe8c0} intensity={2.0} position={[0.5, 0.7, 1.8]} />

    <!-- Fill light: subtle -->
    <T.PointLight color={0xaa9988} intensity={0.6} position={[-0.5, -0.2, 0.8]} />

    <!-- Monkey scaled to match the table rig; no wrapper offset because the
         rig's head centre is already at the local origin. -->
    <T.Group position={[0, 0, 0]} scale={MONKEY_SCALE}>
      <PlaceholderMonkey
        furColor={furColour}
        expression={expression}
        talkAmplitude={talkAmplitude}
        hat={$currentUser?.hat?.id ?? 'none'}
      />
    </T.Group>
  </Canvas>

  <!-- Name label -->
  <div class="portrait-label">
    <span class="label-text">{playerName}</span>
  </div>
</div>

<style>
  .self-portrait-container {
    display: block;
    width: 180px;
    height: 200px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    background-color: rgba(8, 10, 16, 1);
  }

  .portrait-label {
    position: absolute;
    bottom: 0.4rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    width: 100%;
    pointer-events: none;
  }

  .label-text {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
</style>
