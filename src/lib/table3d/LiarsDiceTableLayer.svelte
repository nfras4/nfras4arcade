<script lang="ts">
  import { Canvas, T } from '@threlte/core';
  import BarrelTable from './BarrelTable.svelte';
  import CameraRig from './CameraRig.svelte';
  import PlaceholderMonkey from './PlaceholderMonkey.svelte';
  import TableProjector from './TableProjector.svelte';
  import TableDirectorTick from './TableDirectorTick.svelte';
  import RitualSpotlight from './RitualSpotlight.svelte';
  import KeySpotlight from './KeySpotlight.svelte';
  import RitualOverlay from './RitualOverlay.svelte';
  import ChatBubble from './ChatBubble.svelte';
  import ChatStageLog from './ChatStageLog.svelte';
  import { TableDirector } from './TableDirector.svelte.js';
  import { assignSeats, MONKEY_SCALE, FULL_TABLE_ARC } from './core/seats.js';
  import type { SeatAssignment } from './core/seats.js';
  import type { LDStateLike } from './core/types.js';
  import { EMOTE_LIST, EMOTE_REGISTRY, type EmoteId } from './core/emotes.js';
  import { playSting, isMuted, setMuted } from './audio.js';
  import { TV_CAMERA_POSITION, TV_CAMERA_LOOK_AT, TV_CAMERA_FOV } from './core/camera.js';
  import type { VoiceParams } from './core/chatVoice.js';

  /** Handle returned via onready so the parent can route WS emote messages in. */
  export interface LayerHandle {
    handleRemoteEmote(playerId: string, emoteId: string): void;
    setRemoteAmplitude(peerId: string, value: number): void;
    /**
     * Audit fixes #36 + #39: direct director reference so the route can read
     * `director.expressions[pid]` and `director.ritualInProgress` reactively
     * inside its own $derived blocks (TableDirector exposes them as $state).
     */
    director: TableDirector;
  }

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
    /**
     * Called when the local player fires an emote via the strip.
     * The parent (game page or harness) is responsible for sending the
     * WS message to the server. The layer itself handles local echo.
     */
    onemote = undefined as ((emoteId: EmoteId) => void) | undefined,
    /**
     * Called once on mount with a handle object so the parent can route
     * incoming player_emote WS messages into the layer without bind:this.
     */
    onready = undefined as ((handle: LayerHandle) => void) | undefined,
    /**
     * When true, use FULL_TABLE_ARC layout (6 seats, including local).
     * When false (default), use DESKTOP_ARC (5 opponents, local excluded).
     */
    fullTable = false,
    /**
     * When false, hide the emote button strip (but emote bubbles still render).
     * Default true for backward compatibility.
     */
    showEmoteStrip = true,
    /**
     * Active chat bubbles to render above speaker nameplates.
     * Each entry is positioned via platePosMap[playerId].
     */
    chatBubbles = [] as Array<{ id: number; playerId: string; text: string; voice: VoiceParams; ts: number }>,
    /**
     * Called when a chat bubble's dwell timer expires so the parent can
     * remove the entry from its chatBubbles array.
     */
    onchatbubbledone = undefined as ((id: number) => void) | undefined,
    /**
     * Chat log entries for the stage-anchored overlay (ChatStageLog).
     * Same shape as chatBubbles but represents the full history to display.
     */
    chatLogEntries = [] as Array<{ id: number; playerId: string; text: string; voice: VoiceParams; ts: number }>,
    /**
     * Player name map for the chat log overlay.
     */
    chatLogNames = {} as Record<string, string>,
    /**
     * When true, use TV-variant styling (larger font, larger max-width).
     */
    chatLogTv = false,
  }: {
    state: LDStateLike;
    reducedMotionOverride?: boolean;
    ritualTimescale?: number;
    onemote?: (emoteId: EmoteId) => void;
    onready?: (handle: LayerHandle) => void;
    fullTable?: boolean;
    showEmoteStrip?: boolean;
    chatBubbles?: Array<{ id: number; playerId: string; text: string; voice: VoiceParams; ts: number }>;
    onchatbubbledone?: (id: number) => void;
    chatLogEntries?: Array<{ id: number; playerId: string; text: string; voice: VoiceParams; ts: number }>;
    chatLogNames?: Record<string, string>;
    chatLogTv?: boolean;
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

  $effect(() => {
    director.onesWild = ldState.onesWild;
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
    const next = assignSeats(ldState.players, ldState.myId, prevSeatMap, {
      layout: fullTable ? FULL_TABLE_ARC : undefined,
      includeLocal: fullTable,
    });
    prevSeatMap = next;
    if (import.meta.env.DEV) {
      console.log(`[table3d] seatMap: players=${ldState.players.length}, myId=${ldState.myId}, fullTable=${fullTable}, seated=${next.size}`);
      if (ldState.players.length > 0 && next.size === 0) {
        console.warn(`[table3d] SMOKING GUN: players present but seatMap empty!`);
      }
    }
    return next;
  });

  // ── Opponent list ─────────────────────────────────────────────────────────────
  // In fullTable mode, render all players (including local).
  // Otherwise exclude the local player (they control the camera).
  const opponents = $derived(
    fullTable
      ? ldState.players
      : ldState.players.filter((p) => p.id !== ldState.myId)
  );
  const opponentIds = $derived(opponents.map((p) => p.id));

  // ── Player name map for ritual overlay ──────────────────────────────────────────
  const playerNames = $derived.by(() => {
    const names: Record<string, string> = {};
    for (const player of ldState.players) {
      names[player.id] = player.name;
    }
    return names;
  });

  // ── Nameplate overlay state ───────────────────────────────────────────────────
  const HEAD_OFFSET_Y = 0.95 * MONKEY_SCALE;

  type PlatePos = { left: string; top: string; visible: boolean };
  let platePosMap = $state<Record<string, PlatePos>>({});

  function handleProjectorUpdate(map: Record<string, PlatePos>) {
    platePosMap = map;
  }

  // ── Spotlight position helpers ────────────────────────────────────────────────
  // spotPos: FRONT-ABOVE the seat, pulled toward the camera side. A source
  // directly overhead lights the scalp and a felt patch, not the face; the
  // cone must arrive at roughly 45 degrees from the front for the face to
  // catch it (stage-lighting basics).
  function spotPos(targetId: string | null): [number, number, number] {
    if (!targetId) return [0, 20, 0]; // far above scene, invisible
    const seat = seatMap.get(targetId);
    if (!seat) return [0, 20, 0];
    const [sx, , sz] = seat.transform.position;
    return [sx * 0.5, 3.0, sz * 0.5 + 2.2];
  }

  // spotTargetPos: the point on the monkey the spotlight aims at (head level).
  function spotTargetPos(targetId: string | null): [number, number, number] {
    if (!targetId) return [0, 0, 0];
    const seat = seatMap.get(targetId);
    if (!seat) return [0, 0, 0];
    // Head centre is at seat Y + ~0.5 (HEAD_SIZE[1]=1.0, root at SEAT_Y=0.35)
    return [seat.transform.position[0], 0.85, seat.transform.position[2]];
  }

  // ── Parallax pointer tracking ────────────────────────────────────────────────
  // Only tracks when the OS reports a fine pointer (mouse). Touch/TV: static.
  const hasFinePointer =
    typeof window !== 'undefined'
      ? window.matchMedia('(pointer: fine)').matches
      : false;

  // The stage container element; CameraRig binds pointermove here.
  let stageEl = $state<HTMLElement | null>(null);

  // Reduced-motion state for CameraRig (mirrors the director's own detection).
  // Also disable parallax when fullTable is true (TV is not a head you lean).
  let parallaxReducedMotion = $state(reducedMotionOverride ?? false);

  $effect(() => {
    if (fullTable) {
      parallaxReducedMotion = true;
      return;
    }
    if (reducedMotionOverride !== undefined) {
      parallaxReducedMotion = reducedMotionOverride;
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    parallaxReducedMotion = mq.matches;
    const handler = (e: MediaQueryListEvent) => { parallaxReducedMotion = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  // ── Mute toggle state ────────────────────────────────────────────────────────
  let tableMuted = $state(isMuted());

  function toggleMute(): void {
    const next = !tableMuted;
    tableMuted = next;
    setMuted(next);
  }

  // ── Emote strip: local echo + dedup ──────────────────────────────────────────
  // When the local player fires an emote, apply it immediately (don't wait for
  // the server echo). When the broadcast comes back for myId within 1s, ignore it.
  let lastLocalEmoteAt = 0;
  const LOCAL_ECHO_DEDUP_MS = 1000;

  function handleLocalEmote(emoteId: EmoteId): void {
    // Apply locally at once
    lastLocalEmoteAt = Date.now();
    director.applyEmote(ldState.myId || 'me', emoteId);
    // Play the sting on user gesture
    if (!tableMuted) {
      playSting(EMOTE_REGISTRY[emoteId].sting);
    }
    // Notify parent so it can send the WS message
    onemote?.(emoteId);
  }

  /**
   * Route an incoming player_emote WS message into the director.
   * Dedupes same-player echoes within 1s of a local fire.
   * Called externally via the handle returned by onready.
   */
  function handleRemoteEmote(playerId: string, emoteId: string): void {
    const isLocal = playerId === ldState.myId;
    if (isLocal && Date.now() - lastLocalEmoteAt < LOCAL_ECHO_DEDUP_MS) {
      return; // suppress echo of our own local action
    }
    director.applyEmote(playerId, emoteId);
    if (!tableMuted) {
      const entry = EMOTE_REGISTRY[emoteId as EmoteId];
      if (entry) playSting(entry.sting);
    }
  }

  /**
   * Set the talk amplitude for a remote peer (audio-driven jaw flap).
   * Called by VoiceJawDriver when polling audio streams.
   */
  function setRemoteAmplitude(peerId: string, value: number): void {
    director.voiceAmplitudes = {
      ...director.voiceAmplitudes,
      [peerId]: value,
    };
  }

  // Publish the handle once on mount so the parent can route WS messages in.
  $effect(() => {
    onready?.({
      handleRemoteEmote,
      setRemoteAmplitude,
      director,
    });
  });

  // Mount/unmount logging for diagnostics
  $effect(() => {
    if (import.meta.env.DEV) {
      console.log('[table3d] Layer mounted');
      return () => console.log('[table3d] Layer unmounted');
    }
  });

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
<div class="stage-container" bind:this={stageEl}>
  <Canvas>
    <!-- Camera: owned by CameraRig which adds seated-parallax lean.
         In fullTable mode use TV camera constants instead of desktop. -->
    <CameraRig
      {stageEl}
      reducedMotion={parallaxReducedMotion || !hasFinePointer}
      ritualActive={director.ritualInProgress}
      cameraPosition={fullTable ? TV_CAMERA_POSITION : undefined}
      cameraLookAt={fullTable ? TV_CAMERA_LOOK_AT : undefined}
      cameraFov={fullTable ? TV_CAMERA_FOV : undefined}
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
          scale={MONKEY_SCALE}
        >
          <PlaceholderMonkey
            furColor={seat.furColour}
            expression={director.expressions[player.id] ?? 'neutral'}
            talkAmplitude={Math.max(
              director.chatterAmplitudes[player.id] ?? 0,
              director.voiceAmplitudes[player.id] ?? 0,
            )}
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

  <!-- Chat stage log: overlaid on the stage, bottom-left, behind nameplates -->
  <ChatStageLog
    entries={chatLogEntries}
    names={chatLogNames}
    tv={chatLogTv}
  />

  <!-- Nameplate overlay: absolutely positioned on top of the Canvas, pointer-events none -->
  <div class="nameplate-layer" aria-hidden="true">
    <!-- Ritual overlay: displays banners during round-over ceremony -->
    <RitualOverlay banner={director.banner} names={playerNames} scale={fullTable ? 1.6 : 1} />

    <!-- Chat bubbles: each positioned 4rem above its speaker's nameplate.
         Render UNCONDITIONALLY (do not gate the <ChatBubble> on pos.visible)
         so the bubble's internal dwell timer always runs to completion and
         onDone fires. If the speaker is offscreen/missing we hide the
         positioner via display:none instead of unmounting; that keeps the
         bubble component alive and the route's chatBubbles state in sync. -->
    {#each chatBubbles as bubble (bubble.id)}
      {@const pos = platePosMap[bubble.playerId]}
      {@const visible = pos?.visible === true}
      <div
        class="chat-bubble-positioner"
        class:dim-during-ritual={director.ritualInProgress}
        style={visible
          ? `position: absolute; left: ${pos!.left}; top: calc(${pos!.top} - 4rem);`
          : 'position: absolute; display: none;'}
      >
        <ChatBubble
          text={bubble.text}
          voice={bubble.voice}
          startTs={bubble.ts}
          onDone={() => onchatbubbledone?.(bubble.id)}
          reducedMotion={window.matchMedia('(prefers-reduced-motion: reduce)').matches}
        />
      </div>
    {/each}

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

        <!-- Emote bubble: sits above the nameplate, pop-in/fade-out via CSS -->
        {#if director.emoteBubbles[player.id]}
          {@const bubble = director.emoteBubbles[player.id]}
          {#key bubble.firedAt}
            <div
              class="emote-bubble"
              style="left: {pos.left}; top: {pos.top};"
              aria-hidden="true"
            >
              {EMOTE_REGISTRY[bubble.emoteId]?.glyph ?? bubble.emoteId}
            </div>
          {/key}
        {/if}
      {/if}
    {/each}

    <!-- Local player emote bubble: bottom-centre of stage as confirmation -->
    {#if ldState.myId && director.emoteBubbles[ldState.myId]}
      {@const bubble = director.emoteBubbles[ldState.myId]}
      {#key bubble.firedAt}
        <div class="emote-bubble emote-bubble--local" aria-hidden="true">
          {EMOTE_REGISTRY[bubble.emoteId]?.glyph ?? bubble.emoteId}
        </div>
      {/key}
    {/if}
  </div>

  <!-- Emote strip: six emote buttons + mute toggle, sits below the 3D viewport -->
  {#if showEmoteStrip}
  <div class="emote-strip" role="toolbar" aria-label="Emote buttons">
    {#each EMOTE_LIST as entry (entry.id)}
      <button
        class="emote-btn"
        title={entry.label}
        aria-label={entry.label}
        onclick={() => handleLocalEmote(entry.id)}
      >
        <span class="emote-glyph">{entry.glyph}</span>
        <span class="emote-label">{entry.label}</span>
      </button>
    {/each}
    <button
      class="emote-btn emote-btn--mute"
      title={tableMuted ? 'Unmute sounds' : 'Mute sounds'}
      aria-label={tableMuted ? 'Unmute sounds' : 'Mute sounds'}
      aria-pressed={tableMuted}
      onclick={toggleMute}
    >
      <span class="emote-glyph">{tableMuted ? '🔇' : '🔊'}</span>
      <span class="emote-label">{tableMuted ? 'Sound off' : 'Sound on'}</span>
    </button>
  </div>
  {/if}
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

  /* ── Chat bubble positioner ─────────────────────────────────────────────
     Audit fix #36: during a ritual (LIAR/SHOWDOWN/VERDICT), fade existing
     chat bubbles to ~0.25 so the ceremony owns the stage. RitualOverlay
     already sits at z-index 50; the positioner is left implicit so the
     overlay stacks above. */
  .chat-bubble-positioner {
    transition: opacity 0.25s ease-out;
    opacity: 1;
  }
  .chat-bubble-positioner.dim-during-ritual {
    opacity: 0.25;
  }

  /* ── Emote bubbles ────────────────────────────────────────────────────── */

  .emote-bubble {
    position: absolute;
    /* Sit 2.2em above the nameplate (which itself is transform: translate(-50%, -100%)) */
    transform: translate(-50%, calc(-100% - 2.2em));
    background: rgba(10, 14, 18, 0.88);
    border: 1px solid rgba(90, 138, 90, 0.45);
    border-radius: 4px;
    padding: 0.18em 0.45em;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--accent-hover, #6b9e6b);
    white-space: nowrap;
    pointer-events: none;
    animation: emote-pop 2s ease-out forwards;
  }

  /* Local player bubble: fixed at bottom-centre of stage */
  .emote-bubble--local {
    position: absolute;
    bottom: 5.5rem; /* above the emote strip */
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.9rem;
  }

  @keyframes emote-pop {
    0%   { opacity: 0; transform: translate(-50%, calc(-100% - 1.5em)) scale(0.7); }
    12%  { opacity: 1; transform: translate(-50%, calc(-100% - 2.2em)) scale(1.08); }
    20%  { transform: translate(-50%, calc(-100% - 2.2em)) scale(1.0); }
    70%  { opacity: 1; }
    100% { opacity: 0; transform: translate(-50%, calc(-100% - 2.8em)) scale(0.9); }
  }

  /* ── Emote strip ──────────────────────────────────────────────────────── */

  .emote-strip {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: stretch;
    gap: 0;
    background: rgba(8, 10, 12, 0.82);
    border-top: 1px solid rgba(90, 138, 90, 0.14);
    z-index: 10;
    /* Strip height auto from buttons; ~44px min tap target */
  }

  .emote-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.15em;
    min-height: 44px;
    padding: 0.3rem 0.2rem;
    background: transparent;
    border: none;
    border-right: 1px solid rgba(90, 138, 90, 0.10);
    color: var(--text-muted, #a8b8c4);
    font-family: 'Space Grotesk', sans-serif;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    user-select: none;
  }

  .emote-btn:last-child {
    border-right: none;
  }

  .emote-btn:hover {
    background: rgba(90, 138, 90, 0.12);
    color: var(--accent-hover, #6b9e6b);
  }

  .emote-btn:active {
    background: rgba(90, 138, 90, 0.22);
  }

  .emote-btn--mute {
    flex: 0 0 auto;
    min-width: 52px;
    border-left: 1px solid rgba(90, 138, 90, 0.18);
    color: var(--text-subtle, #6a7a8a);
  }

  .emote-btn--mute[aria-pressed="true"] {
    color: rgba(180, 60, 60, 0.85);
  }

  .emote-glyph {
    font-size: 0.80rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.02em;
  }

  .emote-label {
    font-size: 0.52rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.7;
    line-height: 1;
  }
</style>
