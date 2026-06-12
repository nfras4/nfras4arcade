<script lang="ts">
  import type { Component } from 'svelte';
  import type { LDStateLike, PlayerViewLike } from '$lib/table3d/core/types.js';
  import type { ExpressionName } from '$lib/table3d/core/rig.js';

  // ── Lazy scene component (dev only, Three.js stays in its own chunk) ──────────
  type LayerProps = {
    state: LDStateLike;
    expressions?: Record<string, ExpressionName>;
    talkAmplitudes?: Record<string, number>;
  };
  let LayerComp = $state<Component<LayerProps> | null>(null);
  let sceneError = $state<string | null>(null);

  $effect(() => {
    if (!import.meta.env.DEV) return;
    import('$lib/table3d/LiarsDiceTableLayer.svelte')
      .then((mod) => { LayerComp = mod.default as Component<LayerProps>; })
      .catch((err) => { sceneError = String(err); });
  });

  // ── Scripted walkthrough scenario ────────────────────────────────────────────
  // Fake player roster covering all player states: active, disconnected, eliminated, bot.
  const PLAYERS_BASE: PlayerViewLike[] = [
    { id: 'p1', name: 'Zara',   connected: true,  isBot: false, diceCount: 5, eliminated: false, chips: 1200, nameColour: '#C47C3A' },
    { id: 'p2', name: 'Bongo',  connected: true,  isBot: true,  diceCount: 5, eliminated: false, chips: 1000, nameColour: '#7A7A8A' },
    { id: 'p3', name: 'Mika',   connected: false, isBot: false, diceCount: 4, eliminated: false, chips:  850, nameColour: '#5A8A5A' },
    { id: 'p4', name: 'Rufus',  connected: true,  isBot: false, diceCount: 3, eliminated: false, chips:  650, nameColour: '#A85C52' },
    { id: 'p5', name: 'Ghost',  connected: true,  isBot: false, diceCount: 0, eliminated: true,  chips:    0, nameColour: '#B8A060' },
  ];

  // Local player is 'me'; not rendered as a monkey (camera seat).
  const MY_ID = 'me';

  // ── Scripted scenario steps ───────────────────────────────────────────────────

  type ScenarioStep = {
    label: string;
    state: LDStateLike;
    expressions: Record<string, ExpressionName>;
    talkAmplitudes: Record<string, number>;
  };

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
      },
      expressions: {},
      talkAmplitudes: {},
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
      },
      expressions: {},
      talkAmplitudes: {},
    },
    {
      label: 'Bid placed: Zara bids 3x4 (jaw chatter)',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p2',
        currentBid: { count: 3, face: 4, bidderId: 'p1' },
        lastRoundResult: null,
        onesWild: false,
      },
      expressions: { p1: 'grin' },
      talkAmplitudes: { p1: 0.6 },
    },
    {
      label: 'Big bid: Bongo jumps to 6x4 (grin + side-eye)',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p3',
        currentBid: { count: 6, face: 4, bidderId: 'p2' },
        lastRoundResult: null,
        onesWild: false,
      },
      expressions: { p2: 'grin', p1: 'sweat' },
      talkAmplitudes: { p2: 0.5 },
    },
    {
      label: 'Liar called: Mika calls liar (sweat vs grin)',
      state: {
        phase: 'playing',
        players: [...PLAYERS_BASE, { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 }],
        myId: MY_ID,
        currentTurnId: 'p3',
        currentBid: { count: 6, face: 4, bidderId: 'p2' },
        lastRoundResult: null,
        onesWild: false,
      },
      expressions: { p3: 'grin', p2: 'sweat' },
      talkAmplitudes: {},
    },
    {
      label: 'Round over: verdict (Bongo loses, shock)',
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
      },
      expressions: { p2: 'shock', p3: 'grin', p1: 'grin' },
      talkAmplitudes: { p3: 0.4 },
    },
    {
      // Ghost (eliminated) is listed first so assignSeats gives them the centre
      // slot (slot 2, SLOT_PRIORITY[0]) for maximum readability of the asleep pose.
      // Mika is disconnected (AWAY badge). Both states must read at camera distance.
      label: 'Elimination + disconnected: asleep and away poses',
      state: {
        phase: 'playing',
        players: [
          PLAYERS_BASE[4],  // Ghost first -> slot 2 (centre)
          PLAYERS_BASE[2],  // Mika disconnected -> slot 1
          PLAYERS_BASE[0],  // Zara
          PLAYERS_BASE[1],  // Bongo
          PLAYERS_BASE[3],  // Rufus
          { id: MY_ID, name: 'You', connected: true, isBot: false, diceCount: 5, eliminated: false, chips: 1000 },
        ],
        myId: MY_ID,
        currentTurnId: 'p4',
        currentBid: null,
        lastRoundResult: null,
        onesWild: false,
      },
      expressions: { p5: 'asleep' },
      talkAmplitudes: {},
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
      },
      expressions: { p4: 'sweat' },
      talkAmplitudes: {},
    },
    {
      // Spectator view: 5 players, no local player excluded (myId = '').
      // Only 5 arc slots exist; a 6th-player spectator view is parked for a later wave.
      label: 'Spectator view: 5 opponents, full arc',
      state: {
        phase: 'playing',
        players: PLAYERS_BASE,      // exactly 5 players, all become opponents
        myId: '',                   // '' matches no player id so all 5 are seated
        currentTurnId: 'p1',
        currentBid: null,
        lastRoundResult: null,
        onesWild: false,
      },
      expressions: {},
      talkAmplitudes: {},
    },
  ];

  // ── Playback controls ─────────────────────────────────────────────────────────
  let stepIndex  = $state(0);
  let autoPlay   = $state(false);
  let rafHandle  = 0;
  let lastTime   = 0;
  let stepTimer  = 0;
  const STEP_DURATION_MS = 3000;

  $effect(() => {
    if (!autoPlay) {
      cancelAnimationFrame(rafHandle);
      lastTime  = 0;
      stepTimer = 0;
      return;
    }

    function tick(now: number) {
      const dt   = lastTime === 0 ? 0 : now - lastTime;
      lastTime   = now;
      stepTimer += dt;
      if (stepTimer >= STEP_DURATION_MS) {
        stepTimer  = 0;
        stepIndex  = (stepIndex + 1) % STEPS.length;
      }
      rafHandle = requestAnimationFrame(tick);
    }

    lastTime  = 0;
    stepTimer = 0;
    rafHandle = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafHandle);
      lastTime  = 0;
      stepTimer = 0;
    };
  });

  const currentStep = $derived(STEPS[stepIndex]);
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
          expressions={currentStep.expressions}
          talkAmplitudes={currentStep.talkAmplitudes}
        />
      {:else}
        <p class="loading">Loading 3D scene...</p>
      {/if}
    </div>

    <aside class="controls">
      <h2>Monkey Table: Wave A Harness</h2>

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
