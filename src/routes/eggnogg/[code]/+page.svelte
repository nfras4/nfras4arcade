<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { isLoggedIn, fetchUser } from '$lib/auth';
  import { EggnoggSocket } from '$lib/eggnogg/socket';
  import { loadMap } from '$lib/eggnogg/maps';
  import { Renderer } from '$lib/eggnogg/render';
  import { createInitialState, tick, createGameLoop } from '$lib/eggnogg/sim';
  import { createInputHandler } from '$lib/eggnogg/input';
  import type { MapDef, SimState } from '$lib/eggnogg/types';
  import { CANVAS_W, CANVAS_H, HUD_TOP_H, HUD_BOTTOM_H } from '$lib/eggnogg/types';

  const code = $page.params.code!;

  let canvas = $state<HTMLCanvasElement | null>(null);
  let wsConnected = $state(false);
  let wsError = $state<string | null>(null);
  let isMobile = $state(false);
  let map = $state<MapDef | null>(null);
  let canvasScale = $state(1);

  const socket = new EggnoggSocket();

  $effect(() => {
    fetchUser().then(user => {
      if (!user) goto('/login');
    });
    isMobile = window.innerWidth < 768;
  });

  // WebSocket connection (will fail gracefully until phase 6)
  $effect(() => {
    if (!$isLoggedIn) return;

    const unsub = socket.onMessage((msg: unknown) => {
      const m = msg as Record<string, unknown>;
      if (m.type === 'joined') {
        wsConnected = true;
      } else if (m.type === 'error') {
        wsError = typeof m.message === 'string' ? m.message : 'Server error';
      }
    });

    socket.connect(code).catch((err: unknown) => {
      console.error('[eggnogg] WebSocket connection failed (expected until phase 6):', err);
      wsError = 'WebSocket unavailable (server not yet deployed)';
    });

    return () => {
      unsub();
      socket.disconnect();
    };
  });

  // Canvas render + sim loop: load map, attach renderer + input, run game loop at 60fps.
  $effect(() => {
    if (!canvas) return;
    if (isMobile) return;

    let cancelled = false;
    const renderer = new Renderer(canvas);
    const input = createInputHandler();
    let simState: SimState | null = null;
    let mapDef: MapDef | null = null;

    function tickFrame() {
      if (cancelled || !simState || !mapDef) return;
      simState = tick(simState, input.p1, input.p2);
    }

    function renderFrame() {
      if (cancelled || !simState || !mapDef) return;
      renderer.drawMap(simState, mapDef);
    }

    const loop = createGameLoop(tickFrame, renderFrame);

    async function init() {
      const res = await fetch('/eggnogg/maps/level1.map');
      const text = await res.text();
      const loaded = loadMap(text, 'level1');
      if (cancelled) return;
      mapDef = loaded;
      map = loaded;
      simState = createInitialState(loaded, 1);
      await renderer.loadAssets();
      if (cancelled) return;
      input.attach(window);
      loop.start();
    }

    init().catch((err) => {
      console.error('[eggnogg] init failed:', err);
    });

    return () => {
      cancelled = true;
      loop.stop();
      input.detach();
    };
  });

  // Integer-scale canvas to viewport. Recompute on window resize.
  $effect(() => {
    if (isMobile) return;

    function recompute() {
      const w = Math.floor(window.innerWidth / CANVAS_W);
      const h = Math.floor((window.innerHeight - HUD_TOP_H - HUD_BOTTOM_H) / CANVAS_H);
      canvasScale = Math.max(1, Math.min(w, h));
    }

    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  });

  function leave() {
    socket.disconnect();
    goto('/eggnogg');
  }
</script>

{#if isMobile}
  <div class="mobile-gate">
    <div class="mobile-gate-inner">
      <p class="mobile-icon" aria-hidden="true">&#x1F5A5;</p>
      <h1 class="mobile-title geo-title">Desktop Only</h1>
      <p class="mobile-body">Eggnogg+ requires a keyboard. Open this page on a desktop or laptop.</p>
      <button class="btn-secondary" onclick={leave}>Back to Lobby</button>
    </div>
  </div>
{:else}
  <div class="game-shell">
    <!-- Top HUD: score / front-line indicator -->
    <div class="hud-top">
      <div class="hud-score hud-score-p1" aria-label="Player 1 score"></div>
      <div class="hud-room-code geo-title">{code}</div>
      <div class="hud-score hud-score-p2" aria-label="Player 2 score"></div>
    </div>

    <!-- Canvas viewport -->
    <div class="canvas-viewport">
      <canvas
        bind:this={canvas}
        width={CANVAS_W}
        height={CANVAS_H}
        class="game-canvas"
        style="transform: scale({canvasScale});"
        aria-label="Eggnogg+ game canvas"
      ></canvas>
    </div>

    <!-- Bottom HUD: controls hint + status -->
    <div class="hud-bottom">
      <div class="hud-controls">
        <span class="hud-hint">P1: WASD + Q</span>
        <span class="hud-divider" aria-hidden="true">|</span>
        <span class="hud-hint">P2: Arrows + /</span>
      </div>
      <div class="hud-actions">
        {#if wsError}
          <span class="hud-ws-status hud-ws-error" title={wsError}>offline</span>
        {:else if wsConnected}
          <span class="hud-ws-status hud-ws-ok">online</span>
        {:else}
          <span class="hud-ws-status hud-ws-connecting">connecting...</span>
        {/if}
        <button class="btn-secondary leave-btn" onclick={leave}>Leave</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Full-screen game shell */
  .game-shell {
    width: 100vw;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    overflow: hidden;
  }

  /* Top HUD bar */
  .hud-top {
    height: 40px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    border-bottom: 1px solid var(--border);
    gap: 1rem;
  }

  .hud-score {
    flex: 1;
    height: 8px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 1px;
    max-width: 120px;
  }

  .hud-score-p1 { justify-self: flex-start; }
  .hud-score-p2 { justify-self: flex-end; }

  .hud-room-code {
    font-size: 0.65rem;
    letter-spacing: 0.2em;
    color: var(--text-subtle);
    text-transform: uppercase;
    text-align: center;
  }

  /* Canvas viewport: fills remaining space, centers the canvas */
  .canvas-viewport {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }

  .game-canvas {
    /* Native 528x192 resolution; JS computes integer transform: scale(N). */
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    transform-origin: center;
  }

  /* Bottom HUD bar */
  .hud-bottom {
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    border-top: 1px solid var(--border);
    gap: 1rem;
  }

  .hud-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hud-hint {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .hud-divider {
    color: var(--border);
    font-size: 0.65rem;
  }

  .hud-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .hud-ws-status {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .hud-ws-ok {
    background: rgba(46, 204, 113, 0.15);
    color: #2ecc71;
  }

  .hud-ws-error {
    background: rgba(231, 76, 60, 0.15);
    color: #e74c3c;
    cursor: help;
  }

  .hud-ws-connecting {
    background: var(--accent-faint);
    color: var(--text-subtle);
  }

  .leave-btn {
    padding: 0.3rem 0.875rem;
    font-size: 0.75rem;
  }

  /* Mobile gate (shared with lobby pattern) */
  .mobile-gate {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .mobile-gate-inner {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    max-width: 320px;
  }

  .mobile-icon {
    font-size: 3rem;
    line-height: 1;
  }

  .mobile-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
  }

  .mobile-body {
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  button:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
  .btn-secondary:hover:not(:disabled) { background: var(--accent-border); color: var(--accent); }
</style>
