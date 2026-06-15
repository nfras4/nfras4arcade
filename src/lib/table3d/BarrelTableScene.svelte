<script lang="ts">
  /**
   * Generic seated-monkeys barrel table scene.
   *
   * This is the reusable visual core of the Liar's Dice 3D table (BarrelTable +
   * CameraRig + seated PlaceholderMonkeys) with all the dice/bid/ritual logic
   * stripped out. Any game that seats players around a table can drop this in as
   * an ambient 3D backdrop without depending on game-specific state.
   *
   * Pass a plain player list; seats and fur colours are assigned deterministically
   * via assignSeats (FULL_TABLE_ARC, local player included). The component owns
   * nothing game-specific: highlight the active player with `activePlayerId` and
   * talk amplitudes via `amplitudes` if the host has them, otherwise it just sits
   * there looking like a table full of monkeys.
   *
   * Must run client-side only (WebGL). Callers gate on probeWebGL() + browser.
   */
  import { Canvas, T } from '@threlte/core';
  import BarrelTable from './BarrelTable.svelte';
  import CameraRig from './CameraRig.svelte';
  import KeySpotlight from './KeySpotlight.svelte';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import {
    assignSeats,
    MONKEY_SCALE,
    FULL_TABLE_ARC,
    type SeatAssignment,
  } from './core/seats.js';
  import type { HatId, ExpressionName, GlassesId } from './core/rig.js';

  interface ScenePlayer {
    id: string;
    name: string;
    isBot: boolean;
    hat?: string | null;
    glasses?: string | null;
  }

  let {
    players,
    myId = null,
    activePlayerId = null,
    amplitudes = {},
  }: {
    players: ScenePlayer[];
    /** The local player's id (seated like everyone else; pass null for spectators). */
    myId?: string | null;
    /** Optional: id of the player whose turn it is, rendered with a grin. */
    activePlayerId?: string | null;
    /** Optional per-player talk amplitude (0..1) for jaw flap, keyed by id. */
    amplitudes?: Record<string, number>;
  } = $props();

  // The stage element CameraRig binds pointermove to (no window listeners).
  let stageEl = $state<HTMLElement | null>(null);

  // Reduced-motion: parallax leans off when the user prefers reduced motion.
  let reducedMotion = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = q.matches;
    const handler = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    q.addEventListener('change', handler);
    return () => q.removeEventListener('change', handler);
  });

  // Stable seat assignment. prevSeatMap is deliberately NOT reactive: holding it
  // in $state and syncing via $effect creates an infinite read-write loop
  // (effect_update_depth_exceeded). A plain variable memoized inside $derived.by
  // is the correct pattern (mirrors LiarsDiceTableLayer).
  let prevSeatMap: Map<string, SeatAssignment> = new Map();
  const seatMap = $derived.by(() => {
    const next = assignSeats(players, myId, prevSeatMap, {
      layout: FULL_TABLE_ARC,
      includeLocal: true,
    });
    prevSeatMap = next;
    return next;
  });

  // Lobby camera framing. CameraRig internally pins the camera to its own
  // CAM_POSITION ([0, 1.5, 3.6]) every frame and uses these props only for the
  // look direction + FOV. So we match that position, aim up at the seated row,
  // and narrow the FOV so the monkeys fill the frame instead of empty felt.
  const LOBBY_CAM_POS: [number, number, number] = [0, 1.5, 3.6];
  const LOBBY_CAM_LOOK: [number, number, number] = [0, 0.6, -2.0];
  const LOBBY_CAM_FOV = 33;

  function expressionFor(id: string): ExpressionName {
    return id === activePlayerId ? 'grin' : 'neutral';
  }
</script>

<div class="barrel-scene" bind:this={stageEl}>
  <Canvas>
    <CameraRig
      {stageEl}
      {reducedMotion}
      cameraPosition={LOBBY_CAM_POS}
      cameraLookAt={LOBBY_CAM_LOOK}
      cameraFov={LOBBY_CAM_FOV}
    />

    <!-- Warm ambient fill -->
    <T.AmbientLight color={0xaa9988} intensity={0.5} />

    <!-- Warm key spot above table centre -->
    <KeySpotlight
      color={0xffe8c0}
      intensity={55}
      angle={0.6}
      penumbra={0.4}
      position={[0, 4.4, 1.4]}
    />

    <!-- Cool rim from behind to separate monkeys from the background -->
    <T.DirectionalLight color={0x7ab8d4} intensity={0.8} position={[-1.5, 2.0, -4]} />

    <BarrelTable />

    {#each players as player (player.id)}
      {@const seat = seatMap.get(player.id)}
      {#if seat}
        <T.Group
          position={seat.transform.position}
          rotation={[0, seat.transform.rotationY, 0]}
          scale={MONKEY_SCALE}
        >
          <PlaceholderMonkey
            furColor={seat.furColour}
            expression={expressionFor(player.id)}
            talkAmplitude={amplitudes[player.id] ?? 0}
            hat={(player.hat ?? 'none') as HatId}
            glasses={(player.glasses ?? 'none') as GlassesId}
          />
        </T.Group>
      {/if}
    {/each}
  </Canvas>
</div>

<style>
  .barrel-scene {
    width: 100%;
    height: 100%;
    display: block;
    background: #0a0b0d;
  }
</style>
