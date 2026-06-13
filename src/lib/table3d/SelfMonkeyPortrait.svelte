<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import type { ExpressionName } from './core/rig.js';

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
    <!-- Camera: positioned to show head and shoulders -->
    <T.PerspectiveCamera position={[0, 0.5, 2.0]} fov={36} makeDefault />

    <!-- Key light: warm, front-facing -->
    <T.PointLight color={0xffe8c0} intensity={2.0} position={[0.5, 1.2, 1.8]} />

    <!-- Fill light: subtle -->
    <T.PointLight color={0xaa9988} intensity={0.6} position={[-0.5, 0.3, 1.0]} />

    <!-- The monkey itself -->
    <T.Group position={[0, 0, 0]}>
      <PlaceholderMonkey
        furColor={furColour}
        expression={expression}
        talkAmplitude={talkAmplitude}
        hat="none"
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
