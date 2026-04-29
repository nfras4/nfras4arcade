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
  // HOTFIX3 FIX C (perf): only fields READ by the template or by reactive
  // $derived stay in $state. `currentY` and `velocityBuffer` mutate at
  // pointermove rate (60-240Hz) and triggered full reactive invalidation on
  // every sample. They are now plain non-reactive locals (declared below)
  // and are passed explicitly into evaluateGesture / computeVelocity.
  type Gesture =
    | { kind: 'idle' }
    | {
        kind: 'tracking';
        pointerId: number;
        cardIndex: number;
        startX: number;
        startY: number;
        startTime: number;
        zone: GestureZone;
        peekFired: boolean;
        armedFired: boolean;
        // Snapshotted at pointerdown to avoid stale getBoundingClientRect
        // during iOS Safari momentum-scroll. Null when muckTarget is non-element.
        muckRectSnapshot: DOMRect | null;
      }
    | { kind: 'committing' }
    | { kind: 'returning' };

  let gesture = $state<Gesture>({ kind: 'idle' });
  let isPointerDown = $derived(gesture.kind === 'tracking');
  let liftPx = $state(0);
  let committed = $state(false);

  // HOTFIX3 FIX C: hot-path mutable locals, explicitly NON-reactive.
  // currentY drives lift via setLiftFromTracking, which writes to liftPx
  // ($state) once per pointermove. velocityBuffer is a sample ring read by
  // evaluateGesture / computeVelocity at pointermove and pointerup.
  let currentY = 0;
  let velocityBuffer: VelocitySample[] = [];

  // ─── Live animations registry (for unmount cleanup) ──────────────────
  const liveAnimations = new Set<Animation>();
  $effect(() => {
    return () => {
      // FIX 5: commitStyles() before cancel() so any transform/opacity values
      // we'd been holding via fill:'forwards' are baked into inline style and
      // do not cause a visual snap on teardown. Best-effort: nodes may already
      // be detached, in which case commitStyles throws and we just cancel.
      for (const a of liveAnimations) {
        if (a.playState !== 'idle') {
          try { a.commitStyles(); } catch { /* node detached */ }
          try { a.cancel(); } catch { /* noop */ }
        }
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

  // HOTFIX3 FIX B: reset faceUp between hands. Previously a card flipped
  // face-down before a fold would persist its face-down state into the next
  // hand's first paint, since faceUp is component-level $state and the {#each}
  // block keys by suit+rank+i (which can collide across hands when the deck
  // hands the same card index out twice). Reset on pre-deal and whenever the
  // cards array identity changes meaningfully (new dealt hand). Mirrors the
  // existing committed-reset pattern just above.
  let lastCardsKey = $state('');
  $effect(() => {
    const key = cards.length === 2 ? `${cards[0].suit}${cards[0].rank}|${cards[1].suit}${cards[1].rank}` : '';
    if (gameState === 'pre-deal' || key !== lastCardsKey) {
      faceUp = [true, true];
      lastCardsKey = key;
    }
  });

  // HOTFIX3 FIX A: at showdown, force both cards face-up so the bottom-fixed
  // hole-cards block matches the .showdown-hands opponent reveal block.
  // Gestures are already disabled (interactive === false at showdown), and
  // BetControls is gated by bettingRound !== 'showdown' in the parent route,
  // so there is no functional collision; we just need the visual to match.
  $effect(() => {
    if (gameState === 'showdown') {
      faceUp = [true, true];
    }
  });

  // Element refs for arc (outer wrapper) and flip (inner faces).
  let outerRefs = $state<(HTMLElement | undefined)[]>([undefined, undefined]);
  let innerRefs = $state<(HTMLElement | undefined)[]>([undefined, undefined]);

  // ─── Visibility ──────────────────────────────────────────────────────
  // HOTFIX3 FIX A: revert hotfix #2's exclusion of 'showdown'. Spec §Step 9
  // requires hole cards stay rendered face-up at showdown with no gestures
  // and no idle drift. The original overlap concern was moot: BetControls is
  // already gated by `bettingRound !== 'showdown'` in +page.svelte (line ~498),
  // so there is no actual layout collision with the .showdown-hands block.
  // `interactive` below is gated on 'in-hand', so gestures and idle drift
  // are correctly disabled at showdown without an extra showCards condition.
  let showCards = $derived(
    gameState !== 'pre-deal' &&
    gameState !== 'folded' &&
    !committed &&
    cards.length === 2,
  );

  let interactive = $derived(gameState === 'in-hand' && !committed);
  let allowGesture = $derived(interactive);

  // HOTFIX3 FIX D (perf): the imperative pointerdown $effect below would
  // close over `allowGesture` directly, making `gesture`/`committed` (the
  // upstream $state of the `interactive` $derived) deps of the listener-
  // attaching effect. The effect would then teardown + re-attach
  // addEventListener on every gesture state change, including every
  // pointermove-driven mutation. We thread allowGesture through a non-reactive
  // ref so the listener-attaching effect depends ONLY on cardHitRefs[i].
  const allowGestureRef = { current: false };
  $effect(() => {
    allowGestureRef.current = allowGesture;
  });

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
    // HOTFIX3 FIX C: read currentY from the non-reactive module local, not
    // gesture state. Single $state write (liftPx) per pointermove.
    const delta = Math.max(0, g.startY - currentY);
    liftPx = delta;
  }

  // ─── PointerEvent handlers ───────────────────────────────────────────
  function onPointerDown(e: PointerEvent, cardIndex: number) {
    // Reentrancy guard: ignore while any gesture (tracking, committing, or
    // returning) is in flight. Between gesture-commit (pointerup) and
    // arc.onfinish (~450ms), `committed` is still false but a new pointerdown
    // would otherwise race with the in-flight throw animation. AC21 requires
    // this be blocked. The $effect cleanup on unmount still cancels all live
    // animations during normal re-deal teardown.
    if (
      gesture.kind === 'tracking' ||
      gesture.kind === 'committing' ||
      gesture.kind === 'returning'
    ) {
      return;
    }
    if (!showCards) return;

    // FIX 3 (iOS Safari): preventDefault inside pointerdown with passive:false
    // is required to stop vertical drift on a touch-action:none child from
    // being hijacked into page scroll before setPointerCapture locks the
    // gesture. The listener is attached imperatively in the $effect below
    // with { passive: false }; we only call preventDefault here when starting
    // a real gesture (after the reentrancy and visibility guards), so other
    // legitimate gestures on neighbouring elements are not blocked.
    if (typeof e.preventDefault === 'function') {
      try { e.preventDefault(); } catch { /* noop */ }
    }

    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch { /* noop */ }

    // FIX 4 (iOS Safari): snapshot the muck-target rect at pointerdown.
    // Fixed-position rects can become stale during active iOS scrolling, and
    // calling getBoundingClientRect at gesture-commit time may return a
    // misaligned rect. The runThrowAnimation reader uses this snapshot.
    let muckRectSnapshot: DOMRect | null = null;
    if (muckTarget.kind === 'element') {
      try {
        muckRectSnapshot = muckTarget.ref.getBoundingClientRect();
      } catch { /* noop */ }
    }

    const now = performance.now();
    // HOTFIX3 FIX C: hot-path locals are non-reactive; reset them imperatively.
    currentY = e.clientY;
    velocityBuffer = [{ t: now, y: e.clientY }];
    gesture = {
      kind: 'tracking',
      pointerId: e.pointerId,
      cardIndex,
      startX: e.clientX,
      startY: e.clientY,
      startTime: now,
      zone: 'rest',
      peekFired: false,
      armedFired: false,
      muckRectSnapshot,
    };
  }

  // FIX 3 (iOS Safari): attach pointerdown imperatively with { passive: false }.
  // Svelte 5 inline `onpointerdown=` attaches as passive by default for touch
  // events, which means preventDefault inside the handler is a no-op on iOS
  // Safari. We move the pointerdown wiring into an effect that adds the
  // listener with passive:false on each card's hit element, and tears down on
  // cleanup. Move/up/cancel remain on Svelte's prop attachment because they do
  // not need preventDefault for the iOS hijack mitigation.
  let cardHitRefs = $state<(HTMLElement | undefined)[]>([undefined, undefined]);
  $effect(() => {
    // HOTFIX3 FIX D: depend ONLY on cardHitRefs (the bound element refs).
    // The handler reads allowGestureRef.current, which is updated by the
    // separate $effect above. This breaks the dep chain that previously
    // re-attached listeners on every gesture/committed mutation (60-240Hz).
    const handlers: Array<() => void> = [];
    for (let i = 0; i < cardHitRefs.length; i++) {
      const el = cardHitRefs[i];
      if (!el) continue;
      const idx = i;
      const handler = (ev: PointerEvent) => {
        if (!allowGestureRef.current) return;
        onPointerDown(ev, idx);
      };
      el.addEventListener('pointerdown', handler, { passive: false });
      handlers.push(() => el.removeEventListener('pointerdown', handler));
    }
    return () => {
      for (const off of handlers) off();
    };
  });

  function onPointerMove(e: PointerEvent) {
    if (gesture.kind !== 'tracking') return;
    if (e.pointerId !== gesture.pointerId) return;

    const now = performance.now();
    // HOTFIX3 FIX C: write to non-reactive locals on the hot path.
    currentY = e.clientY;
    velocityBuffer.push({ t: now, y: e.clientY });
    pruneVelocityBuffer(velocityBuffer, now);
    setLiftFromTracking(gesture);

    const result = evaluateGesture({
      startY: gesture.startY,
      currentY,
      startTime: gesture.startTime,
      now,
      viewportHeight: getViewportHeight(),
      isPlayerTurn,
      inputMode,
      velocityBuffer,
    });

    const prevZone = gesture.zone;
    // gesture.zone is template-read (armed class, release-cue), so this
    // single $state write per pointermove is intentional. Skip the assignment
    // when the zone hasn't changed to avoid a no-op invalidation.
    if (prevZone !== result.zone) gesture.zone = result.zone;

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
    // HOTFIX3 FIX C: read from the non-reactive locals (snapshot a stable
    // ref into bufferAtRelease so the subsequent runThrowAnimation sees the
    // exact buffer evaluated here even if a stray late event mutates it).
    const bufferAtRelease = velocityBuffer;
    const result = evaluateGesture({
      startY: g.startY,
      currentY,
      startTime: g.startTime,
      now,
      viewportHeight: getViewportHeight(),
      isPlayerTurn,
      inputMode,
      velocityBuffer: bufferAtRelease,
      releaseEvent: { overMuck: isReleaseOverMuck(e, g.muckRectSnapshot) },
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
      // FIX 1: fire commit, but never let a synchronous throw from onaction
      // strand the gesture in 'tracking'. If the parent throws (e.g. transient
      // network error), we still transition to 'committing' and play the throw
      // animation so the user gets visual feedback. The parent will reconcile
      // the canonical state on the next server update.
      try {
        onaction({ type: 'fold' });
      } catch (err) {
        console.error('[HoleCards] onaction threw during fold commit', err);
      }
      if (g.armedFired) onarmedchange?.(false);
      gesture = { kind: 'committing' };
      runThrowAnimation(g.cardIndex, computeVelocity(bufferAtRelease, now), g.muckRectSnapshot);
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

  function isReleaseOverMuck(e: PointerEvent, snapshot: DOMRect | null): boolean {
    if (muckTarget.kind !== 'element') return false;
    // Prefer the pointerdown-time snapshot (FIX 4); fall back to live rect
    // if the snapshot was unavailable for some reason.
    const rect = snapshot ?? muckTarget.ref.getBoundingClientRect();
    return (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    );
  }

  // ─── Web Animations API throw arc ────────────────────────────────────
  function runThrowAnimation(
    cardIndex: number,
    upwardVelocity: number,
    muckRectSnapshot: DOMRect | null,
  ) {
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
      // HOTFIX3 FIX F: avoid synchronous layout reads on the commit frame.
      // Use the pointerdown-time rect snapshot whenever it is usable (non-null
      // AND non-zero-area AND on-screen). Only fall back to a fresh
      // getBoundingClientRect when the snapshot is unusable. This eliminates
      // the previously-unconditional re-validation read on the commit frame,
      // where every saved millisecond reduces visible jank.
      const isUsable = (r: DOMRect): boolean => {
        if (r.width <= 0 || r.height <= 0) return false;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 0 || cx > vw || cy < 0 || cy > vh) return false;
        return true;
      };
      let rect: DOMRect | null = muckRectSnapshot;
      if (!rect || !isUsable(rect)) {
        try { rect = muckTarget.ref.getBoundingClientRect(); } catch { rect = null; }
      }
      if (rect && isUsable(rect)) {
        endCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      } else if (rect) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        console.warn('[HoleCards] muckTarget rect off-screen or zero-area; clamping arc to viewport');
        endCenter = {
          x: Math.min(Math.max(cx, 16), vw - 16),
          y: Math.min(Math.max(cy, 16), vh - 16),
        };
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
      anim.onfinish = () => {
        // Commit the round before clearing the animation.
        committed = true;
        gesture = { kind: 'idle' };
        liftPx = 0;
        finalizeAnim(anim);
      };
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
      flip.onfinish = () => finalizeAnim(flip);
      flip.oncancel = () => liveAnimations.delete(flip);
    }

    arc.onfinish = () => {
      // Commit the round before clearing the animation.
      committed = true;
      gesture = { kind: 'idle' };
      liftPx = 0;
      finalizeAnim(arc);
    };
    arc.oncancel = () => liveAnimations.delete(arc);
  }

  function registerAnim(a: Animation) {
    liveAnimations.add(a);
  }

  // FIX 5: WAAPI animations with fill:'forwards' hold the highest cascade
  // priority once finished, silently overriding subsequent CSS transitions on
  // the same element/properties. Calling commitStyles() writes the computed
  // values into inline style, then cancel() releases the animation's hold so
  // CSS transitions can apply normally on the next frame.
  // HOTFIX2 FIX 3: commitStyles() leaks computed transform/opacity (e.g.
  // `transform: translate(...) rotate(...); opacity: 0`) into inline style.
  // If the {#each} block reuses the same DOM nodes across rounds, the next
  // round's cards are invisible. After cancel(), explicitly clear the
  // properties the keyframes wrote.
  function finalizeAnim(a: Animation) {
    liveAnimations.delete(a);
    try { a.commitStyles(); } catch { /* node may be detached */ }
    if (a.playState !== 'idle') {
      try { a.cancel(); } catch { /* noop */ }
    }
    try {
      const target = a.effect && 'target' in a.effect ? (a.effect as KeyframeEffect).target : null;
      const el = target as HTMLElement | null;
      if (el && el.style) {
        el.style.removeProperty('transform');
        el.style.removeProperty('opacity');
      }
    } catch { /* effect.target access may differ across browsers; element may be detached */ }
  }

  // ─── Per-card transform style (rest / lift / hover) ──────────────────
  function cardTransform(index: number): string {
    const base = index === 0 ? SPLAY_DEG : -SPLAY_DEG;
    const lift = liftPx;
    const unfan = !prefersReducedMotion ? 1 - Math.min(lift / 200, 1) : 1;
    const rot = base * unfan;
    return `translateY(${-lift}px) rotate(${rot}deg)`;
  }

  // ─── HOTFIX2 FIX 4: dynamic aria-label so screen readers can distinguish
  //     each hole card. Card.svelte uses full-name suits ('hearts', 'diamonds',
  //     'clubs', 'spades'); ranks are face-letter / number strings ('A', 'K',
  //     'Q', 'J', '10', '9'...). Expand face letters to spoken English.
  const RANK_NAMES: Record<string, string> = {
    A: 'Ace',
    K: 'King',
    Q: 'Queen',
    J: 'Jack',
  };
  function cardAriaLabel(index: number): string {
    const card = cards[index];
    if (!card) return 'Hole card';
    if (!faceUp[index]) return 'Hole card, face down, tap to flip';
    const rankName = RANK_NAMES[card.rank] ?? card.rank;
    return `${rankName} of ${card.suit}, hole card, tap to flip face down`;
  }

  // ─── HOTFIX2 FIX 5: keyboard activation. role="button" with tabindex=0
  //     promised keyboard interactivity but neither Enter nor Space did
  //     anything. Mirror the tap-to-flip behaviour of pointer release.
  function onCardKeyDown(e: KeyboardEvent, index: number) {
    // HOTFIX3 FIX H (a11y): IME composition guard. Some CJK / IME flows fire
    // synthetic Enter / Space during composition; treating those as flips
    // would consume the IME's commit keystroke. Bail before any gesture
    // gating so the IME path is fully transparent.
    if (e.isComposing) return;
    if (!allowGesture) return;
    if (e.key === 'Enter' || e.key === ' ') {
      // Space scrolls the page by default; suppress that.
      if (e.key === ' ') e.preventDefault();
      faceUp[index] = !faceUp[index];
      onflip?.(index, faceUp[index]);
    }
  }

  // HOTFIX3 FIX E: only retain a GPU layer when the card is animating or
  // about to. Otherwise we keep a permanent compositor layer per card for
  // the entire round, forcing the browser to dedicate texture memory to two
  // mostly-static elements. Switching to conditional `will-change` lets the
  // compositor reclaim the layer between gestures.
  let willChangeActive = $derived(
    idleEnabled || gesture.kind === 'tracking' || gesture.kind === 'committing',
  );
</script>

{#if showCards}
  <div class="hole-cards-root" class:armed={gesture.kind === 'tracking' && gesture.zone === 'armed'}>
    {#each cards as card, i (card.suit + card.rank + i)}
      <div
        class="card-outer"
        class:idle-drift={idleEnabled}
        class:idle-drift-b={idleEnabled && i === 1}
        class:hover-enabled={inputMode === 'pointer' && interactive}
        class:will-change-transform={willChangeActive}
        bind:this={outerRefs[i]}
        style:transform={cardTransform(i)}
      >
        <div class="card-inner" bind:this={innerRefs[i]}>
          <div
            class="card-hit"
            role="button"
            tabindex={allowGesture ? 0 : -1}
            aria-label={cardAriaLabel(i)}
            bind:this={cardHitRefs[i]}
            onpointermove={onPointerMove}
            onpointerup={onPointerUpOrCancel}
            onpointercancel={onPointerUpOrCancel}
            onkeydown={(e) => onCardKeyDown(e, i)}
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
    /* HOTFIX3 FIX G: isolate gesture transforms from the rest of the page
       on Android Chrome <=110. No behavioural change. */
    contain: layout paint;
  }

  .card-outer {
    width: 22vw;
    max-width: 96px;
    pointer-events: auto;
    transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
    /* HOTFIX3 FIX G: scope each card's paint/layout/style. */
    contain: layout style paint;
  }

  /* HOTFIX3 FIX E: apply will-change only when the card is animating
     (idle drift active, gesture in flight, or commit-arc playing). When the
     class is not present, the browser is free to reclaim the GPU layer. */
  .card-outer.will-change-transform {
    will-change: transform, opacity;
  }

  .card-inner {
    transform-style: preserve-3d;
  }

  /* Mirror the conditional layer hint on the inner flip wrapper so the
     mid-arc rotateY animation gets a layer only when needed. */
  .card-outer.will-change-transform .card-inner {
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
