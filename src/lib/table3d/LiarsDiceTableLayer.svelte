<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import BarrelTable from './BarrelTable.svelte';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import TableProjector from './TableProjector.svelte';
  import { assignSeats } from './core/seats.js';
  import type { SeatAssignment } from './core/seats.js';
  import type { LDStateLike } from './core/types.js';
  import type { ExpressionName } from './core/rig.js';

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    state: ldState,
    /**
     * Per-player expression overrides keyed by playerId.
     * Wave B feeds this; Wave A leaves it empty so all monkeys default to 'neutral'.
     */
    expressions = {} as Record<string, ExpressionName>,
    /**
     * Per-player talk amplitude overrides (0..1) keyed by playerId.
     * Wave B feeds this from the jaw-chatter pulse on bid events.
     */
    talkAmplitudes = {} as Record<string, number>,
  }: {
    state: LDStateLike;
    expressions?: Record<string, ExpressionName>;
    talkAmplitudes?: Record<string, number>;
  } = $props();

  // ── Stable seat assignment ────────────────────────────────────────────────────
  // prevSeatMap is deliberately NOT reactive: it is memoization between
  // recomputes (players in prev keep their slot, see core/seats.ts). Holding it
  // in $state and syncing via $effect creates an infinite read-write loop
  // (effect_update_depth_exceeded); a plain variable written inside the
  // $derived is the correct shape.
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
  // TableProjector writes projected screen positions each frame via callback.
  // HEAD_OFFSET_Y: monkey root is at SEAT_Y=0.35 in world space; head crown is
  // ~0.5 above the root (HEAD_SIZE[1]=1.0), so crown world-Y ~ 0.85. Offset 0.95
  // above the ROOT puts the nameplate anchor ~0.3 clear of the crown in scene units.
  const HEAD_OFFSET_Y = 0.95;

  type PlatePos = { left: string; top: string; visible: boolean };
  let platePosMap = $state<Record<string, PlatePos>>({});

  function handleProjectorUpdate(map: Record<string, PlatePos>) {
    platePosMap = map;
  }
</script>

<!--
  LiarsDiceTableLayer: full 3D scene for liars dice.
  Nameplates are CSS overlays projected from 3D head positions each frame via
  TableProjector (a renderless Canvas child). No @threlte/extras, no WebAssembly.
  Camera: 42 deg FOV, slightly above table level, authored framing.
-->
<div class="stage-container">
  <Canvas>
    <!-- Camera: authored film-set framing, no player control -->
    <!-- Camera sits at seat 0 (the local player's chair): just above their
         eye line, looking across the felt at the opponents' faces. -->
    <T.PerspectiveCamera
      makeDefault
      fov={42}
      near={0.1}
      far={50}
      position={[0, 1.5, 3.6]}
      oncreate={(camera) => { camera.lookAt(0, 0.2, -0.6); }}
    />

    <!-- Ambient fill: warm, low intensity -->
    <T.AmbientLight color={0xaa9988} intensity={0.4} />

    <!-- Warm key spot: above table centre, broad angle for even felt coverage -->
    <T.SpotLight
      color={0xffe8c0}
      intensity={55}
      angle={0.55}
      penumbra={0.35}
      position={[0, 4.2, 1.4]}
      target-position={[0, 0, 0]}
    />

    <!-- Cool rim: from behind the far seats, separates monkeys from background -->
    <T.DirectionalLight
      color={0x7ab8d4}
      intensity={0.8}
      position={[-1.5, 2.0, -4]}
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
            expression={expressions[player.id] ?? 'neutral'}
            talkAmplitude={talkAmplitudes[player.id] ?? 0}
            hat="none"
          />
        </T.Group>
      {/if}
    {/each}

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
