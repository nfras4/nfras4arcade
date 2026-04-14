<script lang="ts">
  // ─── Types ────────────────────────────────────────────────────────────────
  interface OtherNeedle {
    playerId: string;
    angle: number;
    name: string;
    color: string;
  }

  interface RevealScore {
    playerId: string;
    score: number;
    angle: number;
  }

  // ─── Props ────────────────────────────────────────────────────────────────
  let {
    leftLabel = '',
    rightLabel = '',
    targetAngle = 0,
    showTarget = false,
    myNeedleAngle = $bindable(90),
    otherNeedles = [] as OtherNeedle[],
    disabled = false,
    showMyNeedle = true,
    revealScores = [] as RevealScore[],
  } = $props();

  // ─── SVG geometry constants ───────────────────────────────────────────────
  // viewBox: "0 0 400 220"
  // Semicircle center at (200, 200) — bottom center of viewBox
  // Arc radius 165, inner radius 60 (for wedge/target zone)
  const CX = 200;
  const CY = 200;
  const R_OUTER = 165;   // arc outer edge
  const R_INNER = 60;    // arc inner edge (hub)
  const R_NEEDLE = 158;  // needle length
  const R_HANDLE = 148;  // draggable handle position
  const HANDLE_R = 8;    // handle circle radius

  // ─── Drag state ───────────────────────────────────────────────────────────
  let dragging = $state(false);
  let svgEl: SVGSVGElement | null = $state(null);

  // ─── Angle math helpers ───────────────────────────────────────────────────
  // Game angle: 0 = left end, 180 = right end
  // SVG angle: game 0 → SVG 180°, game 180 → SVG 0°
  // Formula: svgDeg = 180 - gameAngle
  // In radians for trig: svgRad = (180 - gameAngle) * π/180

  function gameAngleToRad(gameAngle: number): number {
    return (180 - gameAngle) * (Math.PI / 180);
  }

  function pointOnArc(gameAngle: number, radius: number): { x: number; y: number } {
    const rad = gameAngleToRad(gameAngle);
    return {
      x: CX + radius * Math.cos(rad),
      y: CY - radius * Math.sin(rad),
    };
  }

  // SVG arc path for a band: inner radius to outer radius, from startAngle to endAngle (game degrees)
  function arcPath(startGame: number, endGame: number, rInner: number, rOuter: number): string {
    const clampedStart = Math.max(0, Math.min(180, startGame));
    const clampedEnd   = Math.max(0, Math.min(180, endGame));

    const p1 = pointOnArc(clampedStart, rOuter);
    const p2 = pointOnArc(clampedEnd,   rOuter);
    const p3 = pointOnArc(clampedEnd,   rInner);
    const p4 = pointOnArc(clampedStart, rInner);

    const largeArc = Math.abs(clampedEnd - clampedStart) > 180 ? 1 : 0;
    // Outer arc goes from start→end in the direction of increasing game angle
    // Game angle increases → SVG angle decreases → clockwise sweep (sweep=0 going left, sweep=1 going right)
    // startGame < endGame means we go from left toward right (SVG: right toward left),
    // which in SVG terms is counter-clockwise (sweep-flag=0) on the top half
    return [
      `M ${p1.x} ${p1.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${p2.x} ${p2.y}`,
      `L ${p3.x} ${p3.y}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 1 ${p4.x} ${p4.y}`,
      `Z`,
    ].join(' ');
  }

  // Full semicircle background arc path
  function fullArcPath(rInner: number, rOuter: number): string {
    // From game angle 0 (left) to 180 (right)
    const leftOuter  = pointOnArc(0,   rOuter);
    const rightOuter = pointOnArc(180, rOuter);
    const rightInner = pointOnArc(180, rInner);
    const leftInner  = pointOnArc(0,   rInner);
    return [
      `M ${leftOuter.x} ${leftOuter.y}`,
      `A ${rOuter} ${rOuter} 0 0 0 ${rightOuter.x} ${rightOuter.y}`,
      `L ${rightInner.x} ${rightInner.y}`,
      `A ${rInner} ${rInner} 0 0 1 ${leftInner.x} ${leftInner.y}`,
      `Z`,
    ].join(' ');
  }

  // Needle line endpoints
  let myNeedleTip = $derived(pointOnArc(myNeedleAngle, R_NEEDLE));
  let myHandlePos = $derived(pointOnArc(myNeedleAngle, R_HANDLE));

  // Static arc border points (derived to avoid top-level {@const})
  let arcBorderOuter = $derived({
    left:  pointOnArc(0,   R_OUTER),
    right: pointOnArc(180, R_OUTER),
  });
  let arcBorderInner = $derived({
    left:  pointOnArc(0,   R_INNER + 8),
    right: pointOnArc(180, R_INNER + 8),
  });

  // Score badge positions — slightly beyond needle tip
  function scoreBadgePos(angle: number) {
    return pointOnArc(angle, R_OUTER + 16);
  }

  // ─── Drag interaction ─────────────────────────────────────────────────────
  function getAngleFromPointer(clientX: number, clientY: number): number {
    if (!svgEl) return myNeedleAngle;
    const rect = svgEl.getBoundingClientRect();
    const scaleX = 400 / rect.width;
    const scaleY = 220 / rect.height;
    const svgX = (clientX - rect.left) * scaleX;
    const svgY = (clientY - rect.top)  * scaleY;

    // Angle from center in SVG space
    const dx = svgX - CX;
    const dy = CY - svgY; // flip Y so up is positive
    let rad = Math.atan2(dy, dx); // 0=right, π=left, in standard math orientation

    // Convert to game angle: game 0 = left (rad=π), game 180 = right (rad=0)
    const game = 180 - (Math.atan2(dy, dx) * 180) / Math.PI;
    return Math.max(0, Math.min(180, game));
  }

  function onPointerDown(e: PointerEvent) {
    if (disabled) return;
    dragging = true;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    myNeedleAngle = getAngleFromPointer(e.clientX, e.clientY);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    myNeedleAngle = getAngleFromPointer(e.clientX, e.clientY);
  }

  function onPointerUp() {
    dragging = false;
  }

  // ─── Tick marks every 30°  ────────────────────────────────────────────────
  const TICK_ANGLES = [0, 30, 60, 90, 120, 150, 180];

  function tickLine(gameAngle: number): { x1: number; y1: number; x2: number; y2: number } {
    const inner = pointOnArc(gameAngle, R_OUTER - 12);
    const outer = pointOnArc(gameAngle, R_OUTER + 2);
    return { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y };
  }

  // ─── Score color helper ───────────────────────────────────────────────────
  function scoreColor(score: number): string {
    if (score === 4) return '#f5c842';
    if (score === 3) return '#b0bec5';
    if (score === 2) return '#cd7f32';
    return '#4a5568';
  }

  function scoreLabel(score: number): string {
    if (score === 0) return '+0';
    return `+${score}`;
  }

  // ─── Reveal score lookup ──────────────────────────────────────────────────
  function findRevealScore(playerId: string): RevealScore | undefined {
    return revealScores.find(s => s.playerId === playerId);
  }

  // Score for my needle (playerId = 'me' sentinel — parent passes matching entry)
  let myRevealScore = $derived(revealScores.find(s => s.playerId === 'me'));
</script>

<!-- ─── Markup ────────────────────────────────────────────────────────── -->
<div class="dial-wrapper" class:disabled>
  <svg
    bind:this={svgEl}
    class="dial-svg"
    viewBox="0 0 400 220"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Wavelength dial"
  >
    <defs>
      <!-- Spectral gradient: cool left → warm right along the arc -->
      <linearGradient id="spectrumGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stop-color="#2563eb" />
        <stop offset="30%"  stop-color="#7c3aed" />
        <stop offset="60%"  stop-color="#db2777" />
        <stop offset="85%"  stop-color="#ea580c" />
        <stop offset="100%" stop-color="#dc2626" />
      </linearGradient>

      <!-- Glow filter for needles -->
      <filter id="needleGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <!-- Subtle drop shadow for score badges -->
      <filter id="badgeShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.7)"/>
      </filter>

      <!-- Target zone clip (only top half) -->
      <clipPath id="topHalfClip">
        <rect x="0" y="0" width="400" height="200" />
      </clipPath>
    </defs>

    <!-- ── Outer decorative ring (full semicircle background) ── -->
    <path
      d={fullArcPath(R_INNER, R_OUTER)}
      fill="url(#spectrumGrad)"
      opacity="0.18"
    />

    <!-- ── Main spectrum arc ── -->
    <path
      d={fullArcPath(R_INNER + 8, R_OUTER - 4)}
      fill="url(#spectrumGrad)"
      opacity="0.55"
    />

    <!-- ── Inner hub fill ── -->
    <path
      d="M {pointOnArc(0, R_INNER + 8).x} {pointOnArc(0, R_INNER + 8).y}
         A {R_INNER + 8} {R_INNER + 8} 0 0 0 {pointOnArc(180, R_INNER + 8).x} {pointOnArc(180, R_INNER + 8).y}
         L {CX} {CY} Z"
      fill="var(--bg)"
      opacity="0.7"
    />

    <!-- ── Tick marks ── -->
    {#each TICK_ANGLES as tickAngle}
      {@const t = tickLine(tickAngle)}
      <line
        x1={t.x1} y1={t.y1}
        x2={t.x2} y2={t.y2}
        stroke="rgba(255,255,255,0.25)"
        stroke-width={tickAngle === 90 ? 2 : 1}
        stroke-linecap="round"
      />
    {/each}

    <!-- ── Outer arc border ── -->
    <path
      d="M {arcBorderOuter.left.x} {arcBorderOuter.left.y} A {R_OUTER} {R_OUTER} 0 0 0 {arcBorderOuter.right.x} {arcBorderOuter.right.y}"
      fill="none"
      stroke="rgba(255,255,255,0.12)"
      stroke-width="1"
    />

    <!-- ── Inner arc border ── -->
    <path
      d="M {arcBorderInner.left.x} {arcBorderInner.left.y} A {R_INNER + 8} {R_INNER + 8} 0 0 0 {arcBorderInner.right.x} {arcBorderInner.right.y}"
      fill="none"
      stroke="rgba(255,255,255,0.08)"
      stroke-width="1"
    />

    <!-- ── Target scoring bands (only when showTarget) ── -->
    {#if showTarget}
      <!-- Edge band ±25° -->
      <path
        d={arcPath(targetAngle - 25, targetAngle + 25, R_INNER + 8, R_OUTER - 4)}
        fill="rgba(251, 191, 36, 0.14)"
        class="target-band target-edge"
      />
      <!-- Close band ±15° -->
      <path
        d={arcPath(targetAngle - 15, targetAngle + 15, R_INNER + 8, R_OUTER - 4)}
        fill="rgba(251, 191, 36, 0.28)"
        class="target-band target-close"
      />
      <!-- Bullseye band ±5° -->
      <path
        d={arcPath(targetAngle - 5, targetAngle + 5, R_INNER + 8, R_OUTER - 4)}
        fill="rgba(251, 191, 36, 0.60)"
        class="target-band target-bullseye"
      />

      <!-- Target center line -->
      {@const targetTip = pointOnArc(targetAngle, R_OUTER - 4)}
      {@const targetBase = pointOnArc(targetAngle, R_INNER + 8)}
      <line
        x1={targetBase.x} y1={targetBase.y}
        x2={targetTip.x}  y2={targetTip.y}
        stroke="rgba(251, 191, 36, 0.9)"
        stroke-width="2"
        stroke-linecap="round"
        class="target-center-line"
      />
    {/if}

    <!-- ── Other players' needles ── -->
    {#each otherNeedles as needle (needle.playerId)}
      {@const tip = pointOnArc(needle.angle, R_NEEDLE - 10)}
      {@const base = { x: CX, y: CY }}
      {@const labelPos = pointOnArc(needle.angle, R_OUTER + 18)}
      {@const rs = findRevealScore(needle.playerId)}
      <g class="other-needle" style="--needle-color: {needle.color}">
        <!-- Needle line -->
        <line
          x1={base.x} y1={base.y}
          x2={tip.x}  y2={tip.y}
          stroke={needle.color}
          stroke-width="1.5"
          stroke-linecap="round"
          opacity="0.75"
        />
        <!-- Tip dot -->
        <circle cx={tip.x} cy={tip.y} r="4" fill={needle.color} opacity="0.85" />

        <!-- Player name label -->
        <text
          x={labelPos.x}
          y={labelPos.y}
          text-anchor="middle"
          dominant-baseline="middle"
          fill={needle.color}
          font-family="'Rajdhani', system-ui, sans-serif"
          font-size="9"
          font-weight="700"
          letter-spacing="0.05em"
          opacity="0.9"
        >{needle.name.slice(0, 8)}</text>

        <!-- Score badge during reveal -->
        {#if rs}
          {@const badgePos = scoreBadgePos(needle.angle)}
          <g class="score-badge" style="--badge-delay: {otherNeedles.indexOf(needle) * 100}ms">
            <rect
              x={badgePos.x - 14}
              y={badgePos.y - 10}
              width="28"
              height="20"
              rx="3"
              fill={scoreColor(rs.score)}
              filter="url(#badgeShadow)"
            />
            <text
              x={badgePos.x}
              y={badgePos.y}
              text-anchor="middle"
              dominant-baseline="middle"
              fill={rs.score === 0 ? '#9ca3af' : '#0c0e10'}
              font-family="'Rajdhani', system-ui, sans-serif"
              font-size="11"
              font-weight="700"
              letter-spacing="0.04em"
            >{scoreLabel(rs.score)}</text>
          </g>
        {/if}
      </g>
    {/each}

    <!-- ── My needle (draggable) ── -->
    {#if showMyNeedle}
      <!-- Invisible drag-capture overlay on the entire semicircle area -->
      {#if !disabled}
        <path
          d={fullArcPath(0, R_OUTER + 10)}
          fill="transparent"
          role="slider"
          aria-label="Dial drag area"
          aria-valuenow={Math.round(myNeedleAngle)}
          aria-valuemin={0}
          aria-valuemax={180}
          tabindex="0"
          style="cursor: {dragging ? 'grabbing' : 'crosshair'}"
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        />
      {/if}

      <!-- Glow line behind needle -->
      <line
        x1={CX} y1={CY}
        x2={myNeedleTip.x} y2={myNeedleTip.y}
        stroke="rgba(0, 230, 255, 0.15)"
        stroke-width="8"
        stroke-linecap="round"
        filter="url(#needleGlow)"
        class="my-needle-line"
      />
      <!-- Main needle line -->
      <line
        x1={CX} y1={CY}
        x2={myNeedleTip.x} y2={myNeedleTip.y}
        stroke="#00e6ff"
        stroke-width="2"
        stroke-linecap="round"
        filter="url(#needleGlow)"
        class="my-needle-line"
      />
      <!-- Handle circle at tip -->
      <circle
        cx={myHandlePos.x}
        cy={myHandlePos.y}
        r={HANDLE_R}
        fill="#00e6ff"
        stroke="var(--bg)"
        stroke-width="2"
        role="slider"
        aria-label="Needle handle"
        aria-valuenow={Math.round(myNeedleAngle)}
        aria-valuemin={0}
        aria-valuemax={180}
        tabindex={disabled ? -1 : 0}
        style="cursor: {disabled ? 'default' : dragging ? 'grabbing' : 'grab'}"
        class="my-handle"
        onpointerdown={disabled ? undefined : onPointerDown}
        onpointermove={disabled ? undefined : onPointerMove}
        onpointerup={disabled ? undefined : onPointerUp}
        onpointercancel={disabled ? undefined : onPointerUp}
      />

      <!-- My score badge during reveal -->
      {#if myRevealScore}
        {@const badgePos = scoreBadgePos(myNeedleAngle)}
        <g class="score-badge" style="--badge-delay: 0ms">
          <rect
            x={badgePos.x - 14}
            y={badgePos.y - 10}
            width="28"
            height="20"
            rx="3"
            fill={scoreColor(myRevealScore.score)}
            filter="url(#badgeShadow)"
          />
          <text
            x={badgePos.x}
            y={badgePos.y}
            text-anchor="middle"
            dominant-baseline="middle"
            fill={myRevealScore.score === 0 ? '#9ca3af' : '#0c0e10'}
            font-family="'Rajdhani', system-ui, sans-serif"
            font-size="11"
            font-weight="700"
            letter-spacing="0.04em"
          >{scoreLabel(myRevealScore.score)}</text>
        </g>
      {/if}
    {/if}

    <!-- ── Center hub dot ── -->
    <circle cx={CX} cy={CY} r="6" fill="var(--bg-card)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
    <circle cx={CX} cy={CY} r="3" fill="rgba(255,255,255,0.3)" />

    <!-- ── Left label ── -->
    <text
      x={pointOnArc(0, R_OUTER + 14).x - 4}
      y={pointOnArc(0, R_OUTER + 14).y + 2}
      text-anchor="end"
      dominant-baseline="middle"
      fill="var(--text-muted)"
      font-family="'Rajdhani', system-ui, sans-serif"
      font-size="11"
      font-weight="700"
      letter-spacing="0.08em"
    >{leftLabel.toUpperCase()}</text>

    <!-- ── Right label ── -->
    <text
      x={pointOnArc(180, R_OUTER + 14).x + 4}
      y={pointOnArc(180, R_OUTER + 14).y + 2}
      text-anchor="start"
      dominant-baseline="middle"
      fill="var(--text-muted)"
      font-family="'Rajdhani', system-ui, sans-serif"
      font-size="11"
      font-weight="700"
      letter-spacing="0.08em"
    >{rightLabel.toUpperCase()}</text>

    <!-- ── Baseline (flat edge of semicircle) ── -->
    <line
      x1={pointOnArc(0, R_OUTER).x}
      y1={CY}
      x2={pointOnArc(180, R_OUTER).x}
      y2={CY}
      stroke="rgba(255,255,255,0.06)"
      stroke-width="1"
    />
  </svg>
</div>

<!-- ─── Styles ────────────────────────────────────────────────────────── -->
<style>
  .dial-wrapper {
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    padding-bottom: 3.5rem;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .dial-wrapper.disabled {
    opacity: 0.75;
  }

  .dial-svg {
    width: 100%;
    height: auto;
    display: block;
    overflow: visible;
  }

  /* ── My needle transition ─────────────────────────────────────────── */
  .my-needle-line {
    transition: x2 0.12s cubic-bezier(0.22, 1, 0.36, 1),
                y2 0.12s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .my-handle {
    transition: cx 0.12s cubic-bezier(0.22, 1, 0.36, 1),
                cy 0.12s cubic-bezier(0.22, 1, 0.36, 1);
    filter: drop-shadow(0 0 4px rgba(0, 230, 255, 0.7));
  }

  /* ── Other needles transition ─────────────────────────────────────── */
  .other-needle line,
  .other-needle circle {
    transition: x2 0.2s ease, y2 0.2s ease, cx 0.2s ease, cy 0.2s ease;
  }

  /* ── Target reveal animation ──────────────────────────────────────── */
  .target-band {
    animation: targetReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    transform-origin: 200px 200px;
  }

  .target-edge     { animation-delay: 0ms; }
  .target-close    { animation-delay: 60ms; }
  .target-bullseye { animation-delay: 120ms; }

  .target-center-line {
    animation: targetReveal 0.4s 0.18s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    opacity: 0;
    transform-origin: 200px 200px;
  }

  @keyframes targetReveal {
    from {
      opacity: 0;
      transform: scale(0.88);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Score badge pop-in ───────────────────────────────────────────── */
  .score-badge {
    animation: badgePop 0.3s var(--badge-delay, 0ms) cubic-bezier(0.34, 1.56, 0.64, 1) both;
    transform-origin: center;
  }

  @keyframes badgePop {
    from {
      opacity: 0;
      transform: scale(0);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ── Responsive: ensure touch targets work on mobile ─────────────── */
  @media (max-width: 400px) {
    .dial-wrapper {
      max-width: 100%;
    }
  }
</style>
