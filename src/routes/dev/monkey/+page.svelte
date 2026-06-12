<script lang="ts">
  import { FUR_COLOURS, type ExpressionName, type HatId } from '$lib/table3d/rig.js';
  import type { Component } from 'svelte';

  // ─── State ───────────────────────────────────────────────────────────────────
  let expression   = $state<ExpressionName>('neutral');
  let hat          = $state<HatId>('none');
  let furColor     = $state(FUR_COLOURS[0]);
  let talkAmp      = $state(0);
  let autoTalk     = $state(false);
  let autoElapsed  = 0;
  let sceneError   = $state<string | null>(null);

  // The dynamically imported scene component class, stored as $state so the
  // template re-renders when it resolves. Svelte 5 supports <SceneComp .../> syntax
  // when SceneComp is a variable holding a component class, with no deprecation warning.
  type SceneProps = { furColor: string; expression: ExpressionName; talkAmplitude: number; hat: HatId };
  let SceneComp = $state<Component<SceneProps> | null>(null);

  // Reduced-motion indicator (read-only display).
  // Listener registered in $effect so it is removed on component destroy (fix #3).
  const rmQuery =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let reducedMotion = $state(rmQuery?.matches ?? false);

  $effect(() => {
    if (!rmQuery) return;
    const handler = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    rmQuery.addEventListener('change', handler);
    return () => rmQuery.removeEventListener('change', handler);
  });

  // ── Lazy-load Three.js scene (dev only) ──────────────────────────────────────
  // import.meta.env.DEV is statically replaced by Vite in both dev serve and build,
  // so the dynamic import is dead-code-eliminated in production bundles (fix #1).
  $effect(() => {
    if (!import.meta.env.DEV) return;
    import('$lib/table3d/MonkeyTestScene.svelte')
      .then((mod) => { SceneComp = mod.default as Component<SceneProps>; })
      .catch((err) => { sceneError = String(err); });
  });

  // ─── Auto-talk oscillator ────────────────────────────────────────────────────
  // Two layered sines at different frequencies produce irregular speech-like
  // bursts rather than a pure repetitive sine. Runs via rAF only when enabled.
  let rafHandle = 0;
  let lastTime  = 0;

  $effect(() => {
    if (!autoTalk) {
      cancelAnimationFrame(rafHandle);
      talkAmp = 0;
      return;
    }

    function tick(now: number) {
      const dt = lastTime === 0 ? 0 : (now - lastTime) / 1000;
      lastTime = now;
      autoElapsed += dt;

      // Slow ~1.8 Hz envelope modulated by faster ~5.5 Hz chatter
      const envelope = (Math.sin(autoElapsed * 1.8 * Math.PI * 2) + 1) / 2;
      const chatter  = (Math.sin(autoElapsed * 5.5 * Math.PI * 2) + 1) / 2;
      talkAmp = Math.max(0, Math.min(1, envelope * chatter * 1.4));
      rafHandle = requestAnimationFrame(tick);
    }

    lastTime = 0;
    rafHandle = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafHandle);
      lastTime = 0;
    };
  });

  const EXPRESSIONS: ExpressionName[] = ['neutral', 'grin', 'shock', 'sweat'];
  const HATS: HatId[] = ['none', 'party', 'crown'];
</script>

{#if !import.meta.env.DEV}
  <p class="not-available">Dev harness, not available in production.</p>
{:else}
  <div class="harness">
    <div class="viewport">
      {#if sceneError}
        <p class="error">Failed to load scene: {sceneError}</p>
      {:else if SceneComp}
        <SceneComp
          {furColor}
          {expression}
          talkAmplitude={talkAmp}
          {hat}
        />
      {:else}
        <p class="loading">Loading 3D scene...</p>
      {/if}
    </div>

    <aside class="controls">
      <h2>Monkey Table: Phase 0 Rig Test</h2>

      <!-- Expressions -->
      <section>
        <h3>Expression</h3>
        <div class="btn-row">
          {#each EXPRESSIONS as expr}
            <button
              class="expr-btn"
              class:active={expression === expr}
              onclick={() => { expression = expr; }}
            >
              {expr}
            </button>
          {/each}
        </div>
      </section>

      <!-- Hat -->
      <section>
        <h3>Hat</h3>
        <div class="btn-row">
          {#each HATS as h}
            <button
              class="hat-btn"
              class:active={hat === h}
              onclick={() => { hat = h; }}
            >
              {h}
            </button>
          {/each}
        </div>
      </section>

      <!-- Talk amplitude -->
      <section>
        <h3>Talk amplitude</h3>
        <div class="talk-row">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            disabled={autoTalk}
            bind:value={talkAmp}
            aria-label="Talk amplitude"
          />
          <span class="amp-value">{talkAmp.toFixed(2)}</span>
        </div>
        <label class="toggle-label">
          <input type="checkbox" bind:checked={autoTalk} />
          Auto-talk
        </label>
      </section>

      <!-- Fur colour swatches -->
      <section>
        <h3>Fur colour</h3>
        <div class="swatches">
          {#each FUR_COLOURS as colour}
            <button
              class="swatch"
              class:active={furColor === colour}
              style="background: {colour};"
              onclick={() => { furColor = colour; }}
              aria-label="Fur colour {colour}"
            ></button>
          {/each}
        </div>
      </section>

      <!-- Reduced-motion indicator -->
      <section>
        <p class="rm-note">
          prefers-reduced-motion: <strong>{reducedMotion ? 'active' : 'inactive'}</strong>
          {#if reducedMotion}
            Expressions snap instantly, tremor and bob disabled.
          {/if}
        </p>
      </section>
    </aside>
  </div>
{/if}

<style>
  .not-available {
    padding: 2rem;
    color: var(--text-muted);
    font-family: inherit;
  }

  .harness {
    display: grid;
    grid-template-columns: 1fr 320px;
    height: 100vh;
    background: var(--bg, #0c0e10);
    color: var(--text, #d8dce8);
    font-family: 'Space Grotesk', sans-serif;
    overflow: hidden;
  }

  /* ── Viewport ── */
  .viewport {
    position: relative;
    background: #0a0b0d;
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

  /* ── Controls panel ── */
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
    font-size: 1rem;
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

  /* ── Button rows ── */
  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .expr-btn,
  .hat-btn {
    padding: 0.35rem 0.75rem;
    background: var(--bg-input, #181e24);
    border: 1px solid rgba(120, 140, 130, 0.15);
    border-radius: 3px;
    color: var(--text, #d8dce8);
    font-family: inherit;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    text-transform: capitalize;
  }

  .expr-btn:hover,
  .hat-btn:hover {
    background: var(--bg-hover, #1e2830);
    border-color: var(--accent-border, rgba(90, 138, 90, 0.35));
  }

  .expr-btn.active,
  .hat-btn.active {
    background: var(--accent-faint, rgba(90, 138, 90, 0.12));
    border-color: var(--accent, #5a8a5a);
    color: var(--accent-hover, #6b9e6b);
  }

  /* ── Talk row ── */
  .talk-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .talk-row input[type="range"] {
    flex: 1;
    accent-color: var(--accent, #5a8a5a);
    cursor: pointer;
  }

  .talk-row input[type="range"]:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .amp-value {
    font-size: 0.78rem;
    color: var(--text-muted, #a8b8c4);
    width: 2.8rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
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

  /* ── Fur colour swatches ── */
  .swatches {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .swatch {
    width: 32px;
    height: 32px;
    border-radius: 3px;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: border-color 0.15s, transform 0.1s;
  }

  .swatch:hover {
    transform: scale(1.1);
  }

  .swatch.active {
    border-color: var(--text, #d8dce8);
    outline: 1px solid rgba(255, 255, 255, 0.2);
    outline-offset: 1px;
  }

  /* ── Reduced-motion note ── */
  .rm-note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-subtle, #8fa3b5);
    line-height: 1.5;
  }

  .rm-note strong {
    color: var(--text-muted, #a8b8c4);
  }
</style>
