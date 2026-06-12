<script lang="ts">
  import type { Component } from 'svelte';
  import type { LDStateLike, PlayerViewLike } from '$lib/table3d/core/types.js';
  import { EMOTE_IDS, type EmoteId } from '$lib/table3d/core/emotes.js';
  import type { LayerHandle } from '$lib/table3d/LiarsDiceTableLayer.svelte';

  // ── Lazy scene component (dev only, Three.js stays in its own chunk) ──────────
  type LayerProps = {
    state: LDStateLike;
    reducedMotionOverride?: boolean;
    /** Harness-only: 1 = real-time, 0.2 = 5x slow-mo. See TableDirector.ritualTimescale. */
    ritualTimescale?: number;
    onemote?: (emoteId: EmoteId) => void;
    onready?: (handle: LayerHandle) => void;
  };
  // Use $state.raw so Svelte doesn't try to deep-clone the component constructor
  // (which has internal .subscribe-like properties that trigger snapshot warnings).
  let LayerComp = $state.raw<Component<LayerProps> | null>(null);
  // Populated via onready callback when the layer mounts.
  let layerHandle: LayerHandle | null = null;
  let sceneError = $state<string | null>(null);

  $effect(() => {
    if (!import.meta.env.DEV) return;
    import('$lib/table3d/LiarsDiceTableLayer.svelte')
      .then((mod) => { LayerComp = mod.default as Component<LayerProps>; })
      .catch((err) => { sceneError = String(err); });
  });

  // ── Harness controls ──────────────────────────────────────────────────────────
  let reducedMotionOverride = $state(false);
  /** 1 = real-time, 0.2 = 5x slow-mo for frame-by-frame ritual review. Harness-only. */
  let ritualTimescale = $state(1);

  // ── Scripted walkthrough scenario ────────────────────────────────────────────
  const PLAYERS_BASE: PlayerViewLike[] = [
    { id: 'p1', name: 'Zara',   connected: true,  isBot: false, diceCount: 5, eliminated: false, chips: 1200, nameColour: '#C47C3A' },
    { id: 'p2', name: 'Bongo',  connected: true,  isBot: true,  diceCount: 5, eliminated: false, chips: 1000, nameColour: '#7A7A8A' },
    { id: 'p3', name: 'Mika',   connected: false, isBot: false, diceCount: 4, eliminated: false, chips:  850, nameColour: '#5A8A5A' },
    { id: 'p4', name: 'Rufus',  connected: true,  isBot: false, diceCount: 3, eliminated: false, chips:  650, nameColour: '#A85C52' },
    { id: 'p5', name: 'Ghost',  connected: true,  isBot: false, diceCount: 0, eliminated: true,  chips:    0, nameColour: '#B8A060' },
  ];

  const MY_ID = 'me';

  type ScenarioStep = {
    label: string;
    state: LDStateLike;
  };

  // turnOrder is the stable reveal sequence the director uses.
  const TURN_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5'];

  const STEPS: ScenarioStep[] = [
    {
      label: 'Lobby: players joining',
      state: {
        phase: 'lobby',
        players: [...PLAYERS_BASE.slice(0, 3), { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: null,
        currentBid: null,
        lastRoundResult: null,
        onesWild: false,
        pot: 0,
        turnOrder: TURN_ORDER,
      },
    },
    {
      label: 'Playing: all 5 opponents + me',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p1',
        currentBid: null,
        lastRoundResult: null,
        onesWild: false,
        pot: 200,
        turnOrder: TURN_ORDER,
      },
    },
    {
      label: 'Bid placed: Zara bids 3x4 (jaw chatter + grin)',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p2',
        currentBid: { count: 3, face: 4, bidderId: 'p1' },
        lastRoundResult: null,
        onesWild: false,
        pot: 200,
        turnOrder: TURN_ORDER,
      },
    },
    {
      label: 'Big bid: Bongo jumps to 6x4 (grin + Zara side-eye)',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p3',
        currentBid: { count: 6, face: 4, bidderId: 'p2' },
        lastRoundResult: null,
        onesWild: false,
        pot: 200,
        turnOrder: TURN_ORDER,
      },
    },
    {
      // Step N: playing state with bid active - MUST immediately precede round_over step
      // so the director diffs playing->round_over and fires the full ritual.
      label: 'Liar called: Mika calls liar on Bongo (playing, pre-ritual)',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p3',
        currentBid: { count: 6, face: 4, bidderId: 'p2' },
        lastRoundResult: null,
        onesWild: false,
        pot: 200,
        turnOrder: TURN_ORDER,
      },
    },
    {
      // Step N+1: round_over with lastRoundResult - director diffs from playing above
      // and fires LIAR_CALLED -> REVEAL_STEPs -> VERDICT -> ritual.
      label: 'Round over: verdict (Bongo loses, Mika vindicated) - WATCH RITUAL',
      state: {
        phase: 'round_over',
        players: [
          ...PLAYERS_BASE.map((p) => p.id === 'p2' ? { ...p, diceCount: 4 } : p),
          { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
        ],
        myId: MY_ID,
        currentTurnId: null,
        currentBid: { count: 6, face: 4, bidderId: 'p2' },
        lastRoundResult: {
          bid: { count: 6, face: 4, bidderId: 'p2' },
          actualCount: 4,
          callerId: 'p3',
          loserId: 'p2',
          revealedDice: { p1: [4,2,4,1,3], p2: [4,2,1,3,6], p3: [4,4,2,5,1], p4: [2,3,1,5,4], p5: [] },
        },
        onesWild: false,
        pot: 200,
        turnOrder: TURN_ORDER,
      },
    },
    {
      // Honest bid variant: caller (Rufus) is wrong, bidder (Zara) vindicated.
      label: 'Round over: honest bid (Zara vindicated, Rufus loses)',
      state: {
        phase: 'round_over',
        players: [
          ...PLAYERS_BASE.map((p) => p.id === 'p4' ? { ...p, diceCount: 2 } : p),
          { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
        ],
        myId: MY_ID,
        currentTurnId: null,
        currentBid: { count: 3, face: 4, bidderId: 'p1' },
        lastRoundResult: {
          bid: { count: 3, face: 4, bidderId: 'p1' },
          actualCount: 5,
          callerId: 'p4',
          loserId: 'p4',
          revealedDice: { p1: [4,4,2,1,3], p2: [4,2,1,3,6], p3: [4,4,2,5,1], p4: [2,3,1,5], p5: [] },
        },
        onesWild: false,
        pot: 200,
        turnOrder: TURN_ORDER,
      },
    },
    {
      label: 'Elimination + disconnected: asleep and away poses',
      state: {
        phase: 'playing',
        players: [
          PLAYERS_BASE[4],
          PLAYERS_BASE[2],
          PLAYERS_BASE[0],
          PLAYERS_BASE[1],
          PLAYERS_BASE[3],
          { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
        ],
        myId: MY_ID,
        currentTurnId: 'p4',
        currentBid: null,
        lastRoundResult: null,
        onesWild: false,
        pot: 0,
        turnOrder: TURN_ORDER,
      },
    },
    {
      label: 'Emote: Rufus sweat emote burst',
      state: {
        phase: 'playing',
        players: [
          ...PLAYERS_BASE,
          { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
        ],
        myId: MY_ID,
        currentTurnId: 'p1',
        currentBid: { count: 2, face: 3, bidderId: 'p4' },
        lastRoundResult: null,
        onesWild: false,
        pot: 0,
        turnOrder: TURN_ORDER,
      },
    },
    {
      label: 'Spectator view: 5 opponents, full arc',
      state: {
        phase: 'playing',
        players: PLAYERS_BASE,
        myId: '',
        currentTurnId: 'p1',
        currentBid: null,
        lastRoundResult: null,
        onesWild: false,
        pot: 0,
        turnOrder: TURN_ORDER,
      },
    },
  ];

  // ── Playback controls ─────────────────────────────────────────────────────────
  let stepIndex  = $state(0);
  let autoPlay   = $state(false);
  const STEP_DURATION_MS = 3000;

  // Use a single object ref so the RAF callback always closes over the live handle,
  // not a stale copy. This prevents double-loop bugs when the effect re-runs.
  const autoRef = { rafHandle: 0, lastTime: 0, stepTimer: 0, active: false };

  $effect(() => {
    if (!autoPlay) {
      autoRef.active = false;
      cancelAnimationFrame(autoRef.rafHandle);
      autoRef.lastTime  = 0;
      autoRef.stepTimer = 0;
      return;
    }

    autoRef.active = true;
    autoRef.lastTime  = 0;
    autoRef.stepTimer = 0;

    function tick(now: number) {
      // Guard: if the effect was cleaned up between RAF schedule and fire, stop.
      if (!autoRef.active) return;
      const dt          = autoRef.lastTime === 0 ? 0 : now - autoRef.lastTime;
      autoRef.lastTime  = now;
      autoRef.stepTimer += dt;
      if (autoRef.stepTimer >= STEP_DURATION_MS) {
        autoRef.stepTimer = 0;
        stepIndex = (stepIndex + 1) % STEPS.length;
      }
      autoRef.rafHandle = requestAnimationFrame(tick);
    }

    autoRef.rafHandle = requestAnimationFrame(tick);

    return () => {
      autoRef.active = false;
      cancelAnimationFrame(autoRef.rafHandle);
      autoRef.lastTime  = 0;
      autoRef.stepTimer = 0;
    };
  });

  const currentStep = $derived(STEPS[stepIndex]);

  // ── Replay ritual ─────────────────────────────────────────────────────────────
  // Jump to the playing "Liar called" step so the director sees that state,
  // then after one rAF tick advance to round_over so it diffs playing->round_over
  // and fires the ritual. The timeout token is tracked so stale replays are no-ops.
  const LIAR_STEP_INDEX  = STEPS.findIndex((s) => s.label.startsWith('Liar called'));
  const ROUND_OVER_INDEX = STEPS.findIndex((s) => s.label.startsWith('Round over: verdict'));
  let replayToken = 0;

  function replayRitual() {
    stepIndex = LIAR_STEP_INDEX;
    const token = ++replayToken;
    // Use rAF (not setTimeout) so the director's $effect sees the playing state
    // before we advance. One rAF is enough: the effect runs synchronously before paint.
    requestAnimationFrame(() => {
      if (token !== replayToken) return; // stale replay cancelled by a newer call
      stepIndex = ROUND_OVER_INDEX;
    });
  }

  // ── Emote harness ─────────────────────────────────────────────────────────────
  // Simulate the round-trip: local fire -> local echo -> fake broadcast 80ms later.

  function handleHarnessReady(handle: LayerHandle): void {
    layerHandle = handle;
  }

  function handleHarnessEmote(emoteId: EmoteId): void {
    // The layer fires local echo immediately via handleLocalEmote (called by onemote).
    // 80ms later we simulate a remote broadcast arriving from the server.
    setTimeout(() => {
      layerHandle?.handleRemoteEmote('p2', emoteId); // simulate Bongo echoing the emote
    }, 80);
  }

  function fireRandomRemoteEmote(): void {
    // Simulate a random emote from a random opponent (p1..p4, not myId).
    const remoteIds = ['p1', 'p2', 'p3', 'p4'];
    const pid = remoteIds[Math.floor(Math.random() * remoteIds.length)];
    const eid = EMOTE_IDS[Math.floor(Math.random() * EMOTE_IDS.length)];
    layerHandle?.handleRemoteEmote(pid, eid);
  }
</script>

{#if !import.meta.env.DEV}
  <p class="not-available">Dev harness, not available in production.</p>
{:else}
  <div class="harness">
    <div class="viewport">
      {#if sceneError}
        <p class="error">Failed to load scene: {sceneError}</p>
      {:else if LayerComp}
        <LayerComp
          state={currentStep.state}
          reducedMotionOverride={reducedMotionOverride}
          ritualTimescale={ritualTimescale}
          onemote={handleHarnessEmote}
          onready={handleHarnessReady}
        />
      {:else}
        <p class="loading">Loading 3D scene...</p>
      {/if}
    </div>

    <aside class="controls">
      <h2>Monkey Table: Wave B Harness</h2>

      <!-- Harness overrides -->
      <section>
        <h3>Harness controls</h3>
        <label class="toggle-label">
          <input type="checkbox" bind:checked={reducedMotionOverride} />
          Simulate reduced motion
        </label>
        <div class="speed-row">
          <span class="speed-label">Ritual speed</span>
          <div class="btn-row">
            <button
              class="speed-btn"
              class:active={ritualTimescale === 1}
              onclick={() => { ritualTimescale = 1; }}
            >1x</button>
            <button
              class="speed-btn"
              class:active={ritualTimescale === 0.2}
              onclick={() => { ritualTimescale = 0.2; }}
            >0.2x</button>
          </div>
        </div>
        <button class="action-btn" onclick={replayRitual}>
          Replay ritual
        </button>
        <button class="action-btn" onclick={fireRandomRemoteEmote}>
          Random remote emote
        </button>
      </section>

      <!-- Scenario steps -->
      <section>
        <h3>Scenario step</h3>
        <div class="step-label">{stepIndex + 1}/{STEPS.length}: {currentStep.label}</div>
        <div class="btn-row">
          <button
            class="nav-btn"
            disabled={stepIndex === 0}
            onclick={() => { stepIndex = Math.max(0, stepIndex - 1); }}
          >
            Prev
          </button>
          <button
            class="nav-btn"
            disabled={stepIndex === STEPS.length - 1}
            onclick={() => { stepIndex = Math.min(STEPS.length - 1, stepIndex + 1); }}
          >
            Next
          </button>
        </div>
        <label class="toggle-label">
          <input type="checkbox" bind:checked={autoPlay} />
          Auto-advance ({STEP_DURATION_MS / 1000}s per step)
        </label>
      </section>

      <!-- Step list -->
      <section>
        <h3>All steps</h3>
        <ol class="step-list">
          {#each STEPS as step, i}
            <li>
              <button
                class="step-btn"
                class:active={i === stepIndex}
                onclick={() => { stepIndex = i; }}
              >
                {step.label}
              </button>
            </li>
          {/each}
        </ol>
      </section>

      <!-- Current state summary -->
      <section>
        <h3>State snapshot</h3>
        <pre class="state-dump">{JSON.stringify(
          { phase: currentStep.state.phase, turn: currentStep.state.currentTurnId, bid: currentStep.state.currentBid },
          null, 2
        )}</pre>
      </section>
    </aside>
  </div>
{/if}

<style>
  .not-available {
    padding: 2rem;
    color: var(--text-muted, #a8b8c4);
    font-family: inherit;
  }

  .harness {
    display: grid;
    grid-template-columns: 1fr 300px;
    width: 100%;
    max-width: 100vw;
    height: 100vh;
    background: var(--bg, #0c0e10);
    color: var(--text, #d8dce8);
    font-family: 'Space Grotesk', sans-serif;
    overflow: hidden;
  }

  .viewport {
    position: relative;
    background: #080a0c;
    overflow: hidden;
  }

  .loading,
  .error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted, #a8b8c4);
    font-size: 0.9rem;
  }
  .error { color: var(--red, #e94560); }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    background: var(--bg-card, #12161a);
    border-left: 1px solid rgba(120, 140, 130, 0.12);
    overflow-y: auto;
  }

  h2 {
    margin: 0;
    font-family: 'Rajdhani', sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--accent, #5a8a5a);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h3 {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted, #a8b8c4);
  }

  .step-label {
    font-size: 0.82rem;
    color: var(--text, #d8dce8);
    line-height: 1.4;
    padding: 0.4rem 0.5rem;
    background: rgba(90, 138, 90, 0.08);
    border-left: 2px solid var(--accent, #5a8a5a);
    border-radius: 2px;
  }

  .btn-row {
    display: flex;
    gap: 0.4rem;
  }

  .nav-btn {
    flex: 1;
    padding: 0.35rem 0.5rem;
    background: var(--bg-input, #181e24);
    border: 1px solid rgba(120, 140, 130, 0.15);
    border-radius: 3px;
    color: var(--text, #d8dce8);
    font-family: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--bg-hover, #1e2830);
    border-color: rgba(90, 138, 90, 0.35);
  }

  .nav-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .action-btn {
    padding: 0.35rem 0.75rem;
    background: rgba(90, 138, 90, 0.15);
    border: 1px solid rgba(90, 138, 90, 0.35);
    border-radius: 3px;
    color: var(--accent-hover, #6b9e6b);
    font-family: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s;
    align-self: flex-start;
  }

  .action-btn:hover {
    background: rgba(90, 138, 90, 0.25);
  }

  .speed-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .speed-label {
    font-size: 0.72rem;
    color: var(--text-muted, #a8b8c4);
    letter-spacing: 0.04em;
  }

  .speed-btn {
    flex: 1;
    padding: 0.3rem 0.4rem;
    background: var(--bg-input, #181e24);
    border: 1px solid rgba(120, 140, 130, 0.15);
    border-radius: 3px;
    color: var(--text-muted, #a8b8c4);
    font-family: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .speed-btn:hover {
    background: var(--bg-hover, #1e2830);
    color: var(--text, #d8dce8);
  }

  .speed-btn.active {
    background: rgba(90, 138, 90, 0.18);
    border-color: rgba(90, 138, 90, 0.4);
    color: var(--accent-hover, #6b9e6b);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
    color: var(--text-muted, #a8b8c4);
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    accent-color: var(--accent, #5a8a5a);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .step-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .step-btn {
    width: 100%;
    text-align: left;
    padding: 0.3rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--text-muted, #a8b8c4);
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    line-height: 1.35;
  }

  .step-btn:hover {
    background: rgba(90, 138, 90, 0.07);
    color: var(--text, #d8dce8);
  }

  .step-btn.active {
    background: rgba(90, 138, 90, 0.12);
    border-color: rgba(90, 138, 90, 0.3);
    color: var(--accent-hover, #6b9e6b);
  }

  .state-dump {
    margin: 0;
    font-size: 0.68rem;
    color: var(--text-subtle, #8fa3b5);
    background: rgba(0, 0, 0, 0.25);
    padding: 0.6rem;
    border-radius: 3px;
    overflow-x: auto;
    white-space: pre;
    font-family: 'Fira Code', 'Consolas', monospace;
    line-height: 1.5;
  }
</style>
