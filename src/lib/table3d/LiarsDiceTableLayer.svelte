<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import BarrelTable from './BarrelTable.svelte';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import TableProjector from './TableProjector.svelte';
  import TableDirectorTick from './TableDirectorTick.svelte';
  import RitualSpotlight from './RitualSpotlight.svelte';
  import KeySpotlight from './KeySpotlight.svelte';
  import { TableDirector } from './TableDirector.svelte.js';
  import { assignSeats } from './core/seats.js';
  import type { SeatAssignment } from './core/seats.js';
  import type { LDStateLike } from './core/types.js';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    state: ldState,
    /**
     * Override reduced-motion preference for harness testing.
     * When undefined the director reads window.matchMedia at mount time.
     */
    reducedMotionOverride = undefined as boolean | undefined,
    /**
     * Ritual playback speed multiplier. 1 = real-time, 0.2 = 5x slow-mo.
     * Harness-only: production should not pass this prop.
     */
    ritualTimescale = 1,
  }: {
    state: LDStateLike;
    reducedMotionOverride?: boolean;
    ritualTimescale?: number;
  } = $props();

  // ── Director ─────────────────────────────────────────────────────────────────
  // Instantiate once; update on every ldState change via $effect.
  const director = new TableDirector();

  $effect(() => {
    // Sync reducedMotionOverride into the director whenever it changes.
    if (reducedMotionOverride !== undefined) {
      director.setReducedMotion(reducedMotionOverride);
    }
  });

  $effect(() => {
    director.update(ldState);
  });

  $effect(() => {
    director.ritualTimescale = ritualTimescale;
  });

  // ── Reduced-motion via matchMedia (runtime, not prop) ─────────────────────
  $effect(() => {
    if (reducedMotionOverride !== undefined) return; // prop wins

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    director.setReducedMotion(mq.matches);

    const handler = (e: MediaQueryListEvent) => director.setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  // ── Stable seat assignment ────────────────────────────────────────────────────
  // prevSeatMap is deliberately NOT reactive: memoization between recomputes.
  // Holding it in $state and syncing via $effect creates an infinite read-write
  // loop (effect_update_depth_exceeded); plain variable inside $derived is correct.
  let prevSeatMap: Map<string, SeatAssignment> = new Map();

  const seatMap = $derived.by(() => {
    const next = assignSeats(ldState.players, ldState.myId, prevSeatMap);
    prevSeatMap = next;
    return next;
  });

  // ── Opponent list ─────────────────────────────────────────────────────────────
  const opponents = $derived(ldState.players.filter((p) => p.id !== ldState.myId));
  const opponentIds = $derived(opponents.map((p) => p.id));

  // ── Nameplate overlay state ───────────────────────────────────────────────────
  const HEAD_OFFSET_Y = 0.95;

  type PlatePos = { left: string; top: string; visible: boolean };
  let platePosMap = $state<Record<string, PlatePos>>({});

  function handleProjectorUpdate(map: Record<string, PlatePos>) {
    platePosMap = map;
  }

  // ── Spotlight position helpers ────────────────────────────────────────────────
  // spotPos: above the seat (light source position), off-scene default when no target.
  function spotPos(targetId: string | null): [number, number, number] {
    if (!targetId) return [0, 20, 0]; // far above scene, invisible
    const seat = seatMap.get(targetId);
    if (!seat) return [0, 20, 0];
    return [seat.transform.position[0], 4.0, seat.transform.position[2]];
  }

  // spotTargetPos: the point on the monkey the spotlight aims at (head level).
  function spotTargetPos(targetId: string | null): [number, number, number] {
    if (!targetId) return [0, 0, 0];
    const seat = seatMap.get(targetId);
    if (!seat) return [0, 0, 0];
    // Head centre is at seat Y + ~0.5 (HEAD_SIZE[1]=1.0, root at SEAT_Y=0.35)
    return [seat.transform.position[0], 0.85, seat.transform.position[2]];
  }

  // ── Baseline light values ─────────────────────────────────────────────────────
  const AMBIENT_BASELINE   = 0.4;
  const KEY_BASELINE       = 55;
</script>

<!--
  LiarsDiceTableLayer: full 3D scene for liars dice.
  Wave B: director wires reactions + ritual lighting. Two reactive spotlights
  (callerSpot, accusedSpot) are positioned over seat world coords each frame.
  Nameplates are CSS overlays projected from 3D head positions via TableProjector.
  Camera: 42 deg FOV, slightly above table level, authored framing.
-->
<div class="stage-container">
  <Canvas>
    <!-- Camera: authored film-set framing, no player control -->
    <T.PerspectiveCamera
      makeDefault
      fov={42}
      near={0.1}
      far={50}
      position={[0, 1.5, 3.6]}
      oncreate={(camera) => { camera.lookAt(0, 0.2, -0.6); }}
    />

    <!-- Ambient fill: warm, intensity driven by director during ritual -->
    <T.AmbientLight
      color={0xaa9988}
      intensity={AMBIENT_BASELINE * director.lights.ambientFactor}
    />

    <!-- Warm key spot: above table centre, intensity driven by director during ritual.
         KeySpotlight adds .target to scene via useThrelte() so the light aims correctly. -->
    <KeySpotlight
      color={0xffe8c0}
      intensity={KEY_BASELINE * director.lights.keyFactor}
      angle={0.55}
      penumbra={0.35}
      position={[0, 4.2, 1.4]}
    />

    <!-- Cool rim: constant, not affected by ritual -->
    <T.DirectionalLight
      color={0x7ab8d4}
      intensity={0.8}
      position={[-1.5, 2.0, -4]}
    />

    <!-- Caller spotlight: RitualSpotlight properly adds .target to scene.
         angle=0.22 rad gives a pool ~0.65 unit radius at 3m distance (one-monkey width). -->
    <RitualSpotlight
      color={0xffd080}
      intensity={director.lights.callerSpotIntensity}
      angle={0.22}
      penumbra={0.45}
      position={spotPos(director.lights.callerSpotTarget)}
      targetPosition={spotTargetPos(director.lights.callerSpotTarget)}
    />

    <!-- Accused spotlight: warm orange pool, same cone size as caller spot -->
    <RitualSpotlight
      color={0xff9060}
      intensity={director.lights.accusedSpotIntensity}
      angle={0.22}
      penumbra={0.45}
      position={spotPos(director.lights.accusedSpotTarget)}
      targetPosition={spotTargetPos(director.lights.accusedSpotTarget)}
    />

    <!-- Barrel table geometry -->
    <BarrelTable />

    <!-- Opponent monkeys seated around the arc -->
    {#each opponents as player (player.id)}
      {@const seat = seatMap.get(player.id)}
      {#if seat}
        <T.Group
          position={seat.transform.position}
          rotation={[0, seat.transform.rotationY, 0]}
        >
          <PlaceholderMonkey
            furColor={seat.furColour}
            expression={director.expressions[player.id] ?? 'neutral'}
            talkAmplitude={director.talkAmplitudes[player.id] ?? 0}
            hat="none"
          />
        </T.Group>
      {/if}
    {/each}

    <!-- Director tick: advances ritual + chatter each frame (must be inside Canvas) -->
    <TableDirectorTick {director} />

    <!-- Renderless projector: runs inside Canvas so useThrelte() context is valid -->
    <TableProjector
      {seatMap}
      {opponentIds}
      headOffsetY={HEAD_OFFSET_Y}
      onupdate={handleProjectorUpdate}
    />
  </Canvas>

  <!-- Nameplate overlay: absolutely positioned on top of the Canvas, pointer-events none -->
  <div class="nameplate-layer" aria-hidden="true">
    {#each opponents as player (player.id)}
      {@const pos = platePosMap[player.id]}
      {#if pos?.visible}
        <div
          class="nameplate"
          class:eliminated={player.eliminated}
          class:disconnected={!player.connected}
          style="left: {pos.left}; top: {pos.top}; color: {player.nameColour ?? 'var(--text, #d8dce8)'};"
        >
          <span class="name">{player.name}</span>
          {#if player.diceCount > 0 && !player.eliminated}
            <span class="dice-count">{player.diceCount}</span>
          {/if}
          {#if player.eliminated}
            <span class="badge out">OUT</span>
          {:else if !player.connected}
            <span class="badge away">AWAY</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .stage-container {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #080a0c;
  }

  /* Canvas fills the container */
  .stage-container :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }

  /* Nameplate overlay sits on top of canvas, no pointer interaction */
  .nameplate-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .nameplate {
    position: absolute;
    transform: translate(-50%, -100%);
    display: flex;
    align-items: center;
    gap: 0.3em;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.76rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.92);
    pointer-events: none;
    user-select: none;
    padding-bottom: 4px;
  }

  .nameplate.eliminated {
    opacity: 0.40;
  }

  .nameplate.disconnected {
    opacity: 0.55;
  }

  .name {
    /* inherit color from inline style on parent */
  }

  .dice-count {
    font-size: 0.65rem;
    background: rgba(0, 0, 0, 0.50);
    border-radius: 2px;
    padding: 0.05em 0.28em;
    color: var(--text-muted, #a8b8c4);
    font-variant-numeric: tabular-nums;
  }

  .badge {
    font-size: 0.60rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 0.08em 0.28em;
    border-radius: 2px;
  }

  .badge.out {
    background: rgba(180, 40, 40, 0.60);
    color: #ffaaaa;
  }

  .badge.away {
    background: rgba(70, 70, 70, 0.60);
    color: #aaaaaa;
  }
</style>
