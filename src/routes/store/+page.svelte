<script lang="ts">
  let toastMsg = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function buyItem(label: string) {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastMsg = 'Checkout opens soon. The games are free to play for now!';
    toastTimer = setTimeout(() => {
      toastMsg = '';
      toastTimer = null;
    }, 2500);
  }

  const allGames = [
    { name: 'Impostor',        type: 'social deduction', players: '3-8 players' },
    { name: 'President',       type: 'card game',        players: '3-6 players' },
    { name: 'Chase the Queen', type: 'card game',        players: '3-6 players' },
    { name: 'Connect 4',       type: 'strategy',         players: '1v1'         },
    { name: 'Wavelength',      type: 'party',            players: '2-16 players' },
    { name: 'Snap',            type: 'party',            players: '2-6 players' },
    { name: "Liar's Dice",     type: 'social deduction', players: '2-6 players' },
    { name: 'Coup',            type: 'social deduction', players: '2-6 players' },
  ];

  const typeColors: Record<string, string> = {
    'social deduction': 'var(--blue)',
    'card game':        'var(--yellow)',
    'strategy':         'var(--blue)',
    'party':            'var(--green)',
  };

  function typeColor(t: string): string {
    return typeColors[t] ?? 'var(--accent)';
  }
</script>

{#if toastMsg}
  <div class="store-toast" role="status" aria-live="polite">{toastMsg}</div>
{/if}

<div class="store-page">
  <div class="store-wrap">

    <!-- ── Page header ──────────────────────────────────── -->
    <header class="store-hero" aria-label="Arcade Store header">
      <a href="/" class="back-link geo-title" aria-label="Back to Hub">← Hub</a>
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="store-title geo-title">Arcade Store</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="store-tagline">Take the party home. Bundle up and save.</p>
    </header>

    <!-- ── Bento grid ───────────────────────────────────── -->
    <section class="bento-grid" aria-label="Store bundles">

      <!-- 1. HERO TILE: Full Party Pack (col 1-2, row 1-2) -->
      <article
        class="bento-tile tile-hero"
        style="--tile-accent: var(--green); --tile-faint: rgba(61,214,140,0.08); --tile-border: rgba(61,214,140,0.22);"
        aria-label="The Full Party Pack bundle"
        style:animation-delay="0s"
      >
        <!-- ::before gradient border, ::after shine sweep handled in CSS -->
        <div class="ribbon geo-title" aria-hidden="true">BEST VALUE</div>
        <div class="tile-body">
          <p class="tile-eyebrow geo-title">EVERYTHING. ONE PRICE.</p>
          <h2 class="tile-name geo-title">The Full Party Pack</h2>
          <p class="tile-pitch">All eight party games. Every future update. One link to rally the group chat.</p>

          <ul class="game-mini-list" aria-label="Games included">
            {#each allGames as g}
              <li class="mini-game-item">
                <span class="mini-dot" style="background: {typeColor(g.type)};" aria-hidden="true"></span>
                <span class="mini-name">{g.name}</span>
              </li>
            {/each}
          </ul>

          <div class="price-row">
            <span class="price-struck" aria-label="Regular price $31.92">$31.92</span>
            <span class="price-big" aria-label="Sale price $12.99">$12.99</span>
            <span class="save-badge geo-title" aria-label="Save 59 percent">SAVE 59%</span>
          </div>

          <button
            class="btn-primary cta-btn"
            onclick={() => buyItem('Full Party Pack')}
            aria-label="Buy The Full Party Pack for $12.99"
          >
            GET THE FULL PACK
          </button>
        </div>
      </article>

      <!-- 2. BLUFFER'S BUNDLE (col 3-4, row 1) -->
      <article
        class="bento-tile tile-bundle"
        style="--tile-accent: var(--blue); --tile-faint: rgba(77,168,230,0.08); --tile-border: rgba(77,168,230,0.22);"
        aria-label="Bluffer's Bundle"
        style:animation-delay="0.05s"
      >
        <div class="tile-body">
          <p class="tile-eyebrow geo-title">BLUFFER'S BUNDLE</p>
          <h2 class="tile-name geo-title">Trust No One</h2>
          <p class="tile-pitch">Lie to your friends. Professionally.</p>
          <p class="tile-games-list">Impostor, Liar's Dice, Coup</p>
          <div class="price-row">
            <span class="price-struck" aria-label="Value $11.97">$11.97</span>
            <span class="price-mid" aria-label="Sale price $8.99">$8.99</span>
          </div>
          <button
            class="btn-secondary cta-btn-sm"
            onclick={() => buyItem("Bluffer's Bundle")}
            aria-label="Buy Bluffer's Bundle for $8.99"
          >
            BUY BUNDLE
          </button>
        </div>
      </article>

      <!-- 3. CARD NIGHT (col 3, row 2) -->
      <article
        class="bento-tile tile-sm"
        style="--tile-accent: var(--yellow); --tile-faint: rgba(230,196,77,0.08); --tile-border: rgba(230,196,77,0.22);"
        aria-label="Card Night bundle"
        style:animation-delay="0.10s"
      >
        <div class="tile-body">
          <p class="tile-eyebrow geo-title">CARD NIGHT</p>
          <h2 class="tile-name-sm geo-title">Three Decks of Chaos</h2>
          <p class="tile-games-list">President, Chase the Queen, Snap</p>
          <div class="price-row">
            <span class="price-struck" aria-label="Value $11.97">$11.97</span>
            <span class="price-mid" aria-label="Sale price $8.99">$8.99</span>
          </div>
          <button
            class="btn-secondary cta-btn-sm"
            onclick={() => buyItem('Card Night')}
            aria-label="Buy Card Night for $8.99"
          >
            BUY BUNDLE
          </button>
        </div>
      </article>

      <!-- 4. HEAD-TO-HEAD (col 4, row 2) -->
      <article
        class="bento-tile tile-sm"
        style="--tile-accent: var(--casino); --tile-faint: var(--casino-faint); --tile-border: var(--casino-border);"
        aria-label="Head-to-Head bundle"
        style:animation-delay="0.15s"
      >
        <div class="tile-body">
          <p class="tile-eyebrow geo-title">HEAD-TO-HEAD</p>
          <h2 class="tile-name-sm geo-title">Settle It, 1v1</h2>
          <p class="tile-games-list">Connect 4, Wavelength</p>
          <div class="price-row">
            <span class="price-struck" aria-label="Value $7.98">$7.98</span>
            <span class="price-mid" aria-label="Sale price $5.99">$5.99</span>
          </div>
          <button
            class="btn-secondary cta-btn-sm"
            onclick={() => buyItem('Head-to-Head')}
            aria-label="Buy Head-to-Head for $5.99"
          >
            BUY BUNDLE
          </button>
        </div>
      </article>

      <!-- 5. SAVINGS METER (col 1, row 3) -->
      <article
        class="bento-tile tile-sm"
        aria-label="Savings comparison meter"
        style:animation-delay="0.20s"
      >
        <div class="tile-body">
          <p class="tile-eyebrow geo-title">BUY SMART</p>
          <div class="meter-wrap" aria-label="Price comparison: $31.92 vs $12.99">
            <div class="meter-row">
              <span class="meter-label geo-title">8 SINGLES</span>
              <span class="meter-val geo-title">$31.92</span>
            </div>
            <div class="meter-bar-bg" aria-hidden="true">
              <div class="meter-bar-fill meter-full"></div>
            </div>
            <div class="meter-row">
              <span class="meter-label geo-title accent-label">FULL PACK</span>
              <span class="meter-val geo-title accent-label">$12.99</span>
            </div>
            <div class="meter-bar-bg" aria-hidden="true">
              <div class="meter-bar-fill meter-reduced"></div>
            </div>
          </div>
          <p class="meter-caption">The full pack pays for itself by game three.</p>
        </div>
      </article>

      <!-- 6. STATS TILE (col 2, row 3) -->
      <article
        class="bento-tile tile-sm"
        aria-label="Platform stats"
        style:animation-delay="0.25s"
      >
        <div class="tile-body tile-stats">
          <div class="stat-row">
            <span class="stat-num geo-title">8</span>
            <div class="stat-text">
              <span class="stat-name geo-title">GAMES</span>
              <span class="stat-sub">in the vault</span>
            </div>
          </div>
          <div class="stat-row">
            <span class="stat-num geo-title">2-16</span>
            <div class="stat-text">
              <span class="stat-name geo-title">PLAYERS</span>
              <span class="stat-sub">couch or remote</span>
            </div>
          </div>
          <div class="stat-row">
            <span class="stat-num geo-title">0</span>
            <div class="stat-text">
              <span class="stat-name geo-title">INSTALLS</span>
              <span class="stat-sub">runs in the browser</span>
            </div>
          </div>
        </div>
      </article>

      <!-- 7. PROMISE TILE (col 3-4, row 3) -->
      <article
        class="bento-tile tile-promise"
        aria-label="Platform promises"
        style:animation-delay="0.30s"
      >
        <div class="tile-body promises-body">
          <div class="promise-item">
            <span class="promise-glyph" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <polygon points="8,1 15,5 15,11 8,15 1,11 1,5" stroke="currentColor" stroke-width="1.2" fill="none"/>
                <polyline points="5,8 7,10 11,6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div class="promise-text">
              <span class="promise-head geo-title">Play instantly</span>
              <span class="promise-sub">No installs, no accounts needed for guests</span>
            </div>
          </div>
          <div class="promise-item">
            <span class="promise-glyph" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.2"/>
                <polyline points="8,4 8,8 11,10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <div class="promise-text">
              <span class="promise-head geo-title">Free updates</span>
              <span class="promise-sub">New modes land in your pack automatically</span>
            </div>
          </div>
          <div class="promise-item">
            <span class="promise-glyph" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="2" y="4" width="12" height="9" rx="1" stroke="currentColor" stroke-width="1.2"/>
                <path d="M5 4 V3 a3 3 0 0 1 6 0 V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              </svg>
            </span>
            <div class="promise-text">
              <span class="promise-head geo-title">Host anywhere</span>
              <span class="promise-sub">One room code rallies up to 16 players</span>
            </div>
          </div>
        </div>
      </article>

      <!-- 8. SOLO STRIP (full width, row 4) -->
      <section
        class="bento-tile tile-strip"
        aria-label="Individual game purchases"
        style:animation-delay="0.35s"
      >
        <div class="tile-body">
          <p class="strip-label geo-title">PREFER SINGLES? $3.99 EACH</p>
          <ul class="chips-wrap">
            {#each allGames as g}
              <li class="chip-item">
                <button
                  class="game-chip"
                  style="--chip-color: {typeColor(g.type)};"
                  onclick={() => buyItem(g.name)}
                  aria-label="Buy {g.name} for $3.99"
                >
                  <span class="chip-dot" style="background: {typeColor(g.type)};" aria-hidden="true"></span>
                  <span class="chip-name">{g.name}</span>
                  <span class="chip-price">$3.99</span>
                </button>
              </li>
            {/each}
          </ul>
        </div>
      </section>

    </section>

    <!-- ── Footer ────────────────────────────────────────── -->
    <footer class="store-footer" aria-label="Store footer">
      <p class="footer-text">
        Prices in AUD. This is a draft storefront, checkout is not wired up yet.
      </p>
      <div class="footer-links">
        <a href="/privacy" class="footer-link">Privacy</a>
        <span class="footer-sep" aria-hidden="true">·</span>
        <a href="/" class="footer-link">Back to the arcade</a>
      </div>
    </footer>

  </div>
</div>

<style>
  /* ── Page shell ─────────────────────────────────────── */
  .store-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    padding: 4rem 1.25rem 3rem;
  }

  .store-wrap {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  /* ── Toast (accent/green override of .error-toast) ──── */
  .store-toast {
    position: fixed;
    top: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    color: var(--green);
    border: 1px solid rgba(61, 214, 140, 0.3);
    padding: 0.6rem 1.25rem;
    border-radius: 2px;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 600;
    font-size: 0.875rem;
    z-index: 100;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    animation: toastSlide 0.25s cubic-bezier(0.22, 1, 0.36, 1);
    white-space: nowrap;
    max-width: calc(100vw - 2rem);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Hero header ────────────────────────────────────── */
  .store-hero {
    text-align: center;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--text-subtle);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .back-link:hover { color: var(--accent); }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .store-title {
    font-size: clamp(2rem, 7vw, 3.25rem);
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 60%, var(--accent-dim) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .store-tagline {
    margin-top: 0.875rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* ── Bento grid ─────────────────────────────────────── */
  .bento-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: auto auto auto auto;
    gap: 1rem;
  }

  /* ── Shared tile base ───────────────────────────────── */
  .bento-tile {
    position: relative;
    background: var(--bg-card);
    clip-path: var(--clip-card);
    overflow: hidden;
    animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    transition: transform 0.18s ease, filter 0.18s ease;
  }

  /* Gradient border via ::before inset */
  .bento-tile::before {
    content: '';
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--tile-border, var(--accent-border)), var(--border));
    z-index: 0;
    pointer-events: none;
  }

  .bento-tile:hover {
    transform: translateY(-3px);
    filter: drop-shadow(0 0 12px var(--tile-border, var(--accent-border)));
  }

  /* Top accent stripe */
  .bento-tile::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--tile-accent, var(--accent)) 0%, transparent 70%);
    opacity: 0.65;
    z-index: 1;
    pointer-events: none;
  }

  .tile-body {
    position: relative;
    z-index: 1;
    padding: 1.5rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ── Hero tile ──────────────────────────────────────── */
  .tile-hero {
    grid-column: span 2;
    grid-row: span 2;
  }

  /* Diagonal shine sweep on hero tile */
  .tile-hero .tile-body::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      115deg,
      transparent 20%,
      rgba(255, 255, 255, 0.04) 45%,
      rgba(255, 255, 255, 0.07) 50%,
      rgba(255, 255, 255, 0.04) 55%,
      transparent 80%
    );
    background-size: 200% 200%;
    animation: shineSweep 6s ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
  }

  @keyframes shineSweep {
    0%   { background-position: -100% 0; }
    50%  { background-position: 200% 0; }
    100% { background-position: -100% 0; }
  }

  /* BEST VALUE ribbon */
  .ribbon {
    position: absolute;
    top: 12px;
    right: -20px;
    background: var(--green);
    color: var(--bg);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.25rem 2rem;
    transform: rotate(35deg);
    clip-path: polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%);
    z-index: 2;
  }

  /* ── Bundle tile (wide, 1 row) ──────────────────────── */
  .tile-bundle {
    grid-column: span 2;
  }

  /* ── Small tile (1x1) ───────────────────────────────── */
  .tile-sm {
    grid-column: span 1;
  }

  /* ── Promise tile (wide, 1 row) ─────────────────────── */
  .tile-promise {
    grid-column: span 2;
  }

  /* ── Solo strip (full width) ────────────────────────── */
  .tile-strip {
    grid-column: 1 / -1;
  }

  /* ── Eyebrow / headings ─────────────────────────────── */
  .tile-eyebrow {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    color: var(--tile-accent, var(--accent));
    margin-bottom: -0.25rem;
  }

  .tile-name {
    font-size: 1.6rem;
    letter-spacing: 0.1em;
    line-height: 1.1;
    color: var(--text);
  }

  .tile-name-sm {
    font-size: 1.1rem;
    letter-spacing: 0.1em;
    line-height: 1.1;
    color: var(--text);
  }

  .tile-pitch {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
    flex: 1;
  }

  .tile-games-list {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text-subtle);
    text-transform: uppercase;
  }

  /* ── Game mini-list (hero tile) ─────────────────────── */
  .game-mini-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem 1rem;
    flex: 1;
  }

  .mini-game-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .mini-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .mini-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* ── Price row ──────────────────────────────────────── */
  .price-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: auto;
  }

  .price-struck {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-subtle);
    text-decoration: line-through;
    font-variant-numeric: tabular-nums;
  }

  .price-big {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .price-mid {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.35rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .save-badge {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.2rem 0.5rem;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    color: var(--green);
    clip-path: var(--clip-btn);
  }

  /* ── CTA buttons ────────────────────────────────────── */
  .cta-btn {
    margin-top: 0.25rem;
    width: 100%;
    font-size: 0.875rem;
  }

  .cta-btn-sm {
    width: 100%;
    font-size: 0.75rem;
    padding: 0.45rem 0.875rem;
    background: transparent;
    color: var(--tile-accent, var(--accent));
    border: 1px solid var(--tile-border, var(--accent-border));
    clip-path: var(--clip-btn);
    transition: background 0.15s ease;
  }

  .cta-btn-sm:hover {
    background: var(--tile-faint, var(--accent-faint));
  }

  /* ── Savings meter ──────────────────────────────────── */
  .meter-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
  }

  .meter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .meter-label {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: var(--text-subtle);
  }

  .meter-val {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: var(--text-subtle);
    font-variant-numeric: tabular-nums;
  }

  .accent-label {
    color: var(--accent) !important;
  }

  .meter-bar-bg {
    height: 8px;
    background: var(--bg-hover);
    border-radius: 2px;
    overflow: hidden;
  }

  .meter-bar-fill {
    height: 100%;
    border-radius: 2px;
    transform-origin: left center;
  }

  .meter-full {
    width: 100%;
    background: var(--border-bright);
    animation: barGrow 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
  }

  .meter-reduced {
    width: 41%;
    background: var(--accent);
    animation: barGrow 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.55s both;
  }

  @keyframes barGrow {
    from { transform: scaleX(0); }
    to   { transform: scaleX(1); }
  }

  .meter-caption {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
    margin-top: auto;
  }

  /* ── Stats tile ─────────────────────────────────────── */
  .tile-stats {
    gap: 0;
    justify-content: center;
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }

  .stat-row:last-child {
    border-bottom: none;
  }

  .stat-num {
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    min-width: 3ch;
  }

  .stat-text {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .stat-name {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: var(--text);
  }

  .stat-sub {
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    color: var(--text-subtle);
    font-family: 'Space Grotesk', system-ui, sans-serif;
    text-transform: none;
    font-weight: 400;
  }

  /* ── Promise tile ───────────────────────────────────── */
  .promises-body {
    flex-direction: row;
    gap: 1.25rem;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .promise-item {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    flex: 1;
    min-width: 130px;
  }

  .promise-glyph {
    flex-shrink: 0;
    color: var(--accent);
    margin-top: 0.1rem;
    opacity: 0.85;
  }

  .promise-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .promise-head {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: var(--text);
  }

  .promise-sub {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.4;
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  /* ── Solo strip ─────────────────────────────────────── */
  .tile-strip .tile-body {
    display: block;
    padding: 1.25rem 1.5rem;
  }

  .strip-label {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: var(--text-muted);
    margin-bottom: 0.875rem;
  }

  .chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .chip-item {
    display: contents;
  }

  .game-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.875rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    clip-path: var(--clip-btn);
    transition: border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }

  .game-chip:hover {
    border-color: var(--chip-color);
    color: var(--text);
    transform: translateY(-2px);
    filter: drop-shadow(0 0 6px var(--chip-color));
  }

  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chip-name {
    color: var(--text);
  }

  .chip-price {
    color: var(--text-subtle);
    font-size: 0.7rem;
  }

  /* ── Footer ─────────────────────────────────────────── */
  .store-footer {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    padding-bottom: 1rem;
  }

  .footer-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: var(--text-subtle);
    text-transform: uppercase;
  }

  .footer-links {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .footer-link {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .footer-link:hover { color: var(--accent); }

  .footer-sep {
    color: var(--border-bright);
    font-size: 0.75rem;
  }

  /* ── Responsive: tablet (2 cols) ────────────────────── */
  @media (max-width: 900px) {
    .bento-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .tile-hero {
      grid-column: span 2;
      grid-row: span 1;
    }

    .tile-bundle {
      grid-column: span 2;
    }

    .tile-promise {
      grid-column: span 2;
    }

    .tile-strip {
      grid-column: 1 / -1;
    }
  }

  /* ── Responsive: mobile (1 col) ─────────────────────── */
  @media (max-width: 560px) {
    .bento-grid {
      grid-template-columns: 1fr;
    }

    .tile-hero,
    .tile-bundle,
    .tile-sm,
    .tile-promise,
    .tile-strip {
      grid-column: span 1;
      grid-row: span 1;
    }

    .promises-body {
      flex-direction: column;
      gap: 0.875rem;
    }

    .tile-hero .tile-body::after {
      display: none;
    }
  }
</style>
