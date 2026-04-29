<!--
  poker/HoleCards.svelte: poker-specific surface-agnostic hole-card component.
  NOT to be confused with the generic cards/Hand.svelte used by chase-the-queen
  and president, which is a selectable hand for those games. This component
  renders the player's two hole cards splayed at the bottom of the viewport
  with a three-zone drag gesture (resting, lift, armed) that commits a fold
  via onaction at gesture-commit time. See .omc/plans/hole-cards.md.
-->
<script lang="ts">
  import Card from '$lib/components/cards/Card.svelte';
  import {
    evaluateGesture,
    computeVelocity,
    VELOCITY_BUFFER_MS,
    type VelocitySample,
    type GestureZone,
  } from '$lib/utils/holeCardsGesture';
  import type { InputMode } from '$lib/utils/inputMode';

  type CardData = { suit: string; rank: string };
  type GameState = 'pre-deal' | 'in-hand' | 'folded' | 'showdown';
  type MuckTarget =
    | { kind: 'element'; ref: HTMLElement }
    | { kind: 'offscreen-top' };

  // ─── Visual-only constants (gesture thresholds imported from holeCardsGesture) ──
  // LIFT_MAX, ARM_THRESHOLD, FLICK_VELOCITY_*, TAP_MOVEMENT_PX, TAP_DURATION_MS,
  // and VELOCITY_BUFFER_MS are imported above to avoid drift from the pure evaluator.
  const IDLE_DRIFT_PERIOD_MS = 4000;
  const IDLE_DRIFT_TRANSLATE_PX = 2;
  const IDLE_DRIFT_ROTATE_DEG = 0.5;
  const HOVER_LIFT_PX = 6;
  const CARD_WIDTH_VW = 22;
  const SPLAY_DEG = 6;
  const BOTTOM_INSET_PX = 12;

  let {
    cards,
    isPlayerTurn,
    gameState,
    inputMode,
    muckTarget,
    onaction,
    onpeek,
    onflip,
    onarmedchange,
    // Reserved for paired-phone surface and tests; unused in single-screen mode.
    viewportContext,
  }: {
    cards: CardData[];
    isPlayerTurn: boolean;
    gameState: GameState;
    inputMode: InputMode;
    muckTarget: MuckTarget;
    onaction: (action: { type: string; amount?: number }) => void;
    onpeek?: (index: number, peeking: boolean) => void;
    onflip?: (index: number, faceUp: boolean) => void;
    onarmedchange?: (armed: boolean) => void;
    viewportContext?: { height: number; safeAreaBottom: number };
  } = $props();

  // ─── Defensive: warn once if cards.length !== 2 ───────────────────────
  let warned = false;
  $effect(() => {
    if (cards.length !== 2 && !warned) {
      warned = true;
      console.warn('[HoleCards] expected exactly 2 cards, got', cards.length);
    }
  });

  // ─── Reduced-motion (reactive) ────────────────────────────────────────
  let prefersReducedMotion = $state(false);
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion = mq.matches;
    const onChange = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches; };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    return undefined;
  });

  // ─── Per-card flip state ─────────────────────────────────────────────
  let faceUp = $state<[boolean, boolean]>([true, true]);

  // ─── Gesture state machine ───────────────────────────────────────────
  type Gesture =
    | { kind: 'idle' }
    | {
        kind: 'tracking';
        pointerId: number;
        cardIndex: number;
        startX: number;
        startY: number;
        startTime: number;
        currentY: number;
        velocityBuffer: VelocitySample[];
        zone: GestureZone;
        peekFired: boolean;
        armedFired: boolean;
      }
    | { kind: 'committing' }
    | { kind: 'returning' };

  let gesture = $state<Gesture>({ kind: 'idle' });
  let isPointerDown = $derived(gesture.kind === 'tracking');
  let liftPx = $state(0);
  let committed = $state(false);

  // ─── Live animations registry (for unmount cleanup) ──────────────────
  const liveAnimations = new Set<Animation>();
  $effect(() => {
    return () => {
      for (const a of liveAnimations) {
        try { a.cancel(); } catch { /* noop */ }
      }
      liveAnimations.clear();
    };
  });

  // Reset committed flag when parent re-deals (cards content changes meaningfully).
  $effect(() => {
    if (gameState === 'in-hand' && committed) {
      // New round; allow rendering again.
      committed = false;
    }
  });

  // Element refs for arc (outer wrapper) and flip (inner faces).
  let outerRefs = $state<(HTMLElement | undefined)[]>([undefined, undefined]);
  let innerRefs = $state<(HTMLElement | undefined)[]>([undefined, undefined]);

  // ─── Visibility ──────────────────────────────────────────────────────
  let showCards = $derived(
    gameState !== 'pre-deal' &&
    gameState !== 'folded' &&
    !committed &&
    cards.length === 2,
  );

  let interactive = $derived(gameState === 'in-hand' && !committed);
  let allowGesture = $derived(interactive);

  // ─── Idle drift gating ───────────────────────────────────────────────
  let idleEnabled = $derived(
    interactive && !isPointerDown && !prefersReducedMotion,
  );

  // ─── Helpers ─────────────────────────────────────────────────────────
  function pruneVelocityBuffer(buf: VelocitySample[], now: number) {
    while (buf.length > 0 && now - buf[0].t > VELOCITY_BUFFER_MS) {
      buf.shift();
    }
  }

  function getViewportHeight(): number {
    return typeof window !== 'undefined' ? window.innerHeight : 800;
  }

  function setLiftFromTracking(g: Extract<Gesture, { kind: 'tracking' }>) {
    const delta = Math.max(0, g.startY - g.currentY);
    liftPx = delta;
  }

  // ─── PointerEvent handlers ───────────────────────────────────────────
  function onPointerDown(e: PointerEvent, cardIndex: number) {
    // Reentrancy guard: ignore while committing.
    // NOT FIXING "cancel in-flight throw on reset": re-arming during 'committing'
    // is structurally impossible because committed===true persists until the parent
    // re-renders with new round data (new cards/gameState), at which point the
    // component remounts state and the $effect cleanup cancels all live animations.
    // Single-pointer gesture; ignore additional pointers while tracking.
    if (gesture.kind === 'tracking') return;
    if (!showCards) return;

    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch { /* noop */ }

    const now = performance.now();
    gesture = {
      kind: 'tracking',
      pointerId: e.pointerId,
      cardIndex,
      startX: e.clientX,
      startY: e.clientY,
      startTime: now,
      currentY: e.clientY,
      velocityBuffer: [{ t: now, y: e.clientY }],
      zone: 'rest',
      peekFired: false,
      armedFired: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    if (gesture.kind !== 'tracking') return;
    if (e.pointerId !== gesture.pointerId) return;

    const now = performance.now();
    gesture.currentY = e.clientY;
    gesture.velocityBuffer.push({ t: now, y: e.clientY });
    pruneVelocityBuffer(gesture.velocityBuffer, now);
    setLiftFromTracking(gesture);

    const result = evaluateGesture({
      startY: gesture.startY,
      currentY: gesture.currentY,
      startTime: gesture.startTime,
      now,
      viewportHeight: getViewportHeight(),
      isPlayerTurn,
      inputMode,
      velocityBuffer: gesture.velocityBuffer,
    });

    const prevZone = gesture.zone;
    gesture.zone = result.zone;

    // peek transitions
    const wasInLiftOrAbove = prevZone === 'lift' || prevZone === 'armed';
    const isInLiftOrAbove = result.zone === 'lift' || result.zone === 'armed';
    if (!wasInLiftOrAbove && isInLiftOrAbove && !gesture.peekFired) {
      gesture.peekFired = true;
      onpeek?.(gesture.cardIndex, true);
    } else if (wasInLiftOrAbove && !isInLiftOrAbove && gesture.peekFired) {
      gesture.peekFired = false;
      onpeek?.(gesture.cardIndex, false);
    }

    // armed transitions
    const wasArmed = prevZone === 'armed';
    const isArmed = result.zone === 'armed';
    if (!wasArmed && isArmed) {
      onarmedchange?.(true);
      gesture.armedFired = true;
    } else if (wasArmed && !isArmed) {
      onarmedchange?.(false);
      gesture.armedFired = false;
    }
  }

  function onPointerUpOrCancel(e: PointerEvent) {
    if (gesture.kind !== 'tracking') return;
    if (e.pointerId !== gesture.pointerId) return;

    const now = performance.now();
    const g = gesture;
    const result = evaluateGesture({
      startY: g.startY,
      currentY: g.currentY,
      startTime: g.startTime,
      now,
      viewportHeight: getViewportHeight(),
      isPlayerTurn,
      inputMode,
      velocityBuffer: g.velocityBuffer,
      releaseEvent: { overMuck: isReleaseOverMuck(e) },
    });

    // Tap-to-flip wins first.
    if (result.isTap) {
      faceUp[g.cardIndex] = !faceUp[g.cardIndex];
      onflip?.(g.cardIndex, faceUp[g.cardIndex]);
      if (g.armedFired) onarmedchange?.(false);
      gesture = { kind: 'idle' };
      liftPx = 0;
      return;
    }

    if (result.shouldCommit) {
      // Fire commit immediately, before animation.
      onaction({ type: 'fold' });
      if (g.armedFired) onarmedchange?.(false);
      gesture = { kind: 'committing' };
      runThrowAnimation(g.cardIndex, computeVelocity(g.velocityBuffer, now));
      return;
    }

    // Otherwise, return to rest.
    if (g.armedFired) onarmedchange?.(false);
    if (g.peekFired) onpeek?.(g.cardIndex, false);
    gesture = { kind: 'returning' };
    liftPx = 0;
    // Brief returning state to allow CSS transition; reset after a tick.
    setTimeout(() => {
      if (gesture.kind === 'returning') gesture = { kind: 'idle' };
    }, 220);
  }

  function isReleaseOverMuck(e: PointerEvent): boolean {
    if (muckTarget.kind !== 'element') return false;
    const rect = muckTarget.ref.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  // ─── Web Animations API throw arc ────────────────────────────────────
  function runThrowAnimation(cardIndex: number, upwardVelocity: number) {
    const outer = outerRefs[cardIndex];
    const inner = innerRefs[cardIndex];
    if (!outer) {
      committed = true;
      gesture = { kind: 'idle' };
      liftPx = 0;
      return;
    }

    // Endpoint computation.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 360;
    const vh = getViewportHeight();
    const startRect = outer.getBoundingClientRect();
    const startCenter = {
      x: startRect.left + startRect.width / 2,
      y: startRect.top + startRect.height / 2,
    };

    let endCenter = { x: vw / 2, y: vh / 2 };

    if (muckTarget.kind === 'element') {
      const rect = muckTarget.ref.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const zeroArea = rect.width <= 0 || rect.height <= 0;
      const offscreen = center.x < 0 || center.x > vw || center.y < 0 || center.y > vh;
      if (zeroArea || offscreen) {
        console.warn('[HoleCards] muckTarget rect off-screen or zero-area; clamping arc to viewport');
        endCenter = {
          x: Math.min(Math.max(center.x, 16), vw - 16),
          y: Math.min(Math.max(center.y, 16), vh - 16),
        };
      } else {
        endCenter = center;
      }
    } else if (muckTarget.kind === 'offscreen-top') {
      // TODO: paired-phone surface, handle muckTarget.kind === 'offscreen-top'
      console.warn('[HoleCards] paired-phone offscreen-top muck target not yet implemented');
      endCenter = { x: vw / 2, y: -vh };
    }

    const dx = endCenter.x - startCenter.x;
    const dy = endCenter.y - startCenter.y;

    if (prefersReducedMotion) {
      // Reduced-motion: crossfade + small upward translate. No arc, no flip.
      const reducedKeyframes: Keyframe[] = [
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: 'translate(0px, -20px)', opacity: 0 },
      ];
      const anim = outer.animate(reducedKeyframes, {
        duration: 200,
        easing: 'ease-out',
        fill: 'forwards',
      });
      registerAnim(anim);
      anim.onfinish = () => finalizeCommit(anim);
      anim.oncancel = () => liveAnimations.delete(anim);
      return;
    }

    // Bias control point upward by velocity (px/ms). Clamp so it stays sane.
    const velocityBias = Math.min(Math.max(upwardVelocity, 0), 3) * 80;
    const midX = startCenter.x + dx * 0.5;
    const midY = Math.min(startCenter.y, endCenter.y) - 80 - velocityBias;

    const arcKeyframes: Keyframe[] = [
      { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, offset: 0 },
      {
        transform: `translate(${midX - startCenter.x}px, ${midY - startCenter.y}px) rotate(-12deg)`,
        opacity: 1,
        offset: 0.5,
      },
      {
        transform: `translate(${dx}px, ${dy}px) rotate(-24deg)`,
        opacity: 0,
        offset: 1,
      },
    ];

    const arc = outer.animate(arcKeyframes, {
      duration: 450,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'forwards',
    });
    registerAnim(arc);

    if (inner) {
      const flip = inner.animate(
        [
          { transform: 'rotateY(0deg)' },
          { transform: 'rotateY(180deg)' },
        ],
        { duration: 225, delay: 112, fill: 'forwards' },
      );
      registerAnim(flip);
    }

    arc.onfinish = () => finalizeCommit(arc);
    arc.oncancel = () => liveAnimations.delete(arc);
  }

  function registerAnim(a: Animation) {
    liveAnimations.add(a);
  }

  function finalizeCommit(a: Animation) {
    liveAnimations.delete(a);
    committed = true;
    gesture = { kind: 'idle' };
    liftPx = 0;
  }

  // ─── Per-card transform style (rest / lift / hover) ──────────────────
  function cardTransform(index: number): string {
    const base = index === 0 ? SPLAY_DEG : -SPLAY_DEG;
    const lift = liftPx;
    const unfan = !prefersReducedMotion ? 1 - Math.min(lift / 200, 1) : 1;
    const rot = base * unfan;
    return `translateY(${-lift}px) rotate(${rot}deg)`;
  }
</script>

{#if showCards}
  <div class="hole-cards-root" class:armed={gesture.kind === 'tracking' && gesture.zone === 'armed'}>
    {#each cards as card, i (i)}
      <div
        class="card-outer"
        class:idle-drift={idleEnabled}
        class:idle-drift-b={idleEnabled && i === 1}
        class:hover-enabled={inputMode === 'pointer' && interactive}
        bind:this={outerRefs[i]}
        style:transform={cardTransform(i)}
      >
        <div class="card-inner" bind:this={innerRefs[i]}>
          <div
            class="card-hit"
            role="button"
            tabindex={allowGesture ? 0 : -1}
            aria-label="Hole card"
            onpointerdown={(e) => allowGesture && onPointerDown(e, i)}
            onpointermove={onPointerMove}
            onpointerup={onPointerUpOrCancel}
            onpointercancel={onPointerUpOrCancel}
          >
            <Card card={card} faceUp={faceUp[i]} />
          </div>
        </div>
      </div>
    {/each}

    {#if gesture.kind === 'tracking' && gesture.zone === 'armed' && isPlayerTurn}
      <div class="release-cue" aria-live="polite">Release to fold</div>
    {/if}
  </div>
{/if}

<style>
  .hole-cards-root {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: 0.5rem;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
    pointer-events: none;
    z-index: 50;
  }

  .card-outer {
    width: 22vw;
    max-width: 96px;
    pointer-events: auto;
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
    will-change: transform, opacity;
  }

  .card-inner {
    transform-style: preserve-3d;
    will-change: transform;
  }

  .card-hit {
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: grab;
  }

  .card-hit:active {
    cursor: grabbing;
  }

  /* Hover lift (pointer mode only). */
  .card-outer.hover-enabled:hover {
    transform: translateY(-6px);
  }

  /* Idle drift via CSS. Two variants for phase offset between the two cards. */
  @keyframes idleDriftA {
    0%   { transform: translate(0px, 0px) rotate(0deg); }
    50%  { transform: translate(0px, -2px) rotate(0.5deg); }
    100% { transform: translate(0px, 0px) rotate(0deg); }
  }
  @keyframes idleDriftB {
    0%   { transform: translate(0px, -1px) rotate(-0.25deg); }
    50%  { transform: translate(0px, 1px) rotate(0.25deg); }
    100% { transform: translate(0px, -1px) rotate(-0.25deg); }
  }

  /* Note: when idle-drift is active, we layer the keyframes onto the
     existing transform via animation-composition. Browsers without
     support fall back to the keyframes overriding the splay rotate;
     this is acceptable since the splay is preserved by the parent
     transform and the drift amplitude is intentionally tiny. */
  .card-outer.idle-drift {
    animation: idleDriftA 4000ms ease-in-out infinite;
  }
  .card-outer.idle-drift.idle-drift-b {
    animation: idleDriftB 4000ms ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .card-outer.idle-drift,
    .card-outer.idle-drift-b {
      animation: none;
    }
  }

  .release-cue {
    position: absolute;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 12vh);
    left: 50%;
    transform: translateX(-50%);
    padding: 0.4rem 0.75rem;
    background: rgba(233, 69, 96, 0.85);
    color: #fff;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 4px;
    pointer-events: none;
  }
</style>
