<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<div class="hub">
  <div class="hub-content">

    <header class="hub-hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">nfras4arcade</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Choose your arena</p>
    </header>

    <nav class="category-grid" aria-label="Game categories">

      <!-- Party Games -->
      <button
        class="category-card"
        onclick={() => goto('/games')}
        aria-label="Party Games – 6 games"
      >
        <div class="cat-glyph party-glyph" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="12" cy="13" r="5"/>
            <circle cx="28" cy="13" r="5"/>
            <circle cx="20" cy="28" r="5"/>
            <line x1="17" y1="13" x2="23" y2="13"/>
            <line x1="14.5" y1="17.5" x2="17" y2="24"/>
            <line x1="25.5" y1="17.5" x2="23" y2="24"/>
          </svg>
        </div>
        <div class="cat-text">
          <h2 class="cat-title geo-title">Party Games</h2>
          <p class="cat-desc">Impostor, Wavelength, Snap & more</p>
          <p class="cat-count geo-title">6 Games</p>
        </div>
        <span class="cat-arrow party-arrow" aria-hidden="true">→</span>
        <div class="card-shine" aria-hidden="true"></div>
      </button>

      <!-- Casino -->
      <button
        class="category-card casino-card"
        onclick={() => goto('/casino')}
        aria-label="Casino – 5 games"
      >
        <div class="cat-glyph casino-glyph" aria-hidden="true">
          <span class="suit-cluster" aria-hidden="true">♠</span>
        </div>
        <div class="cat-text">
          <h2 class="cat-title geo-title">Casino</h2>
          <p class="cat-desc">Poker, Blackjack, Roulette & more</p>
          <p class="cat-count geo-title casino-count">5 Games</p>
        </div>
        <span class="cat-arrow casino-arrow" aria-hidden="true">→</span>
        <div class="card-shine" aria-hidden="true"></div>
      </button>

      <!-- RPG – Coming Soon -->
      <div class="category-card rpg-card" aria-disabled="true">
        <div class="cat-glyph rpg-glyph" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="32" x2="28" y2="12"/>
            <line x1="24" y1="8" x2="32" y2="16"/>
            <line x1="24" y1="8" x2="26" y2="6"/>
            <line x1="32" y1="16" x2="34" y2="14"/>
            <line x1="6" y1="34" x2="10" y2="30"/>
          </svg>
        </div>
        <div class="cat-text">
          <h2 class="cat-title geo-title">RPG</h2>
          <p class="cat-desc">Quests, dungeons, and adventure</p>
          <span class="coming-badge geo-title">Coming Soon</span>
        </div>
      </div>

    </nav>

  </div>
</div>

<style>
  .hub {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5rem 1.25rem 4rem;
  }

  .hub-content {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  /* ── Hero ────────────────────────────────────────────── */
  .hub-hero {
    text-align: center;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .wordmark {
    font-size: clamp(2rem, 8vw, 3.5rem);
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 60%, var(--accent-dim) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline {
    margin-top: 0.875rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  /* ── Category grid ───────────────────────────────────── */
  .category-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  /* ── Base card ───────────────────────────────────────── */
  .category-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.75rem 2rem;
    min-height: 130px;
    width: 100%;
    text-align: left;
    background: var(--bg-card);
    border: none;
    font-family: inherit;
    cursor: pointer;
    clip-path: var(--clip-card);
    transition: background 0.15s ease, transform 0.15s ease;
    overflow: hidden;
  }

  /* Border effect – green accent */
  .category-card::before {
    content: '';
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
  }

  .category-card:hover {
    background: var(--bg-hover);
    transform: translateY(-3px);
  }

  /* Subtle top accent stripe */
  .category-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent) 0%, transparent 70%);
    opacity: 0.6;
  }

  /* ── Casino card overrides ───────────────────────────── */
  .casino-card::before {
    background: linear-gradient(135deg, rgba(243,156,18,0.35), var(--border));
  }

  .casino-card::after {
    background: linear-gradient(90deg, #f39c12 0%, transparent 70%);
  }

  .casino-card:hover {
    box-shadow: 0 0 20px rgba(243,156,18,0.12);
  }

  /* ── RPG card (coming soon) ──────────────────────────── */
  .rpg-card {
    cursor: default;
    opacity: 0.45;
    pointer-events: none;
  }

  .rpg-card::before {
    background: linear-gradient(135deg, var(--border), var(--border));
  }

  .rpg-card::after {
    background: linear-gradient(90deg, var(--text-subtle) 0%, transparent 70%);
  }

  /* ── Glyph / icon area ───────────────────────────────── */
  .cat-glyph {
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .party-glyph {
    color: var(--accent);
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
  }

  .casino-glyph {
    color: #f39c12;
    background: rgba(243,156,18,0.08);
    border: 1px solid rgba(243,156,18,0.25);
  }

  .rpg-glyph {
    color: var(--text-subtle);
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--border);
  }

  .suit-cluster {
    font-size: 2rem;
    line-height: 1;
    display: block;
  }

  /* ── Text block ──────────────────────────────────────── */
  .cat-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .cat-title {
    font-size: 1.5rem;
    letter-spacing: 0.1em;
    color: var(--text);
    line-height: 1;
  }

  .casino-card .cat-title {
    color: var(--text);
  }

  .cat-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .cat-count {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    color: var(--accent);
    margin-top: 0.25rem;
  }

  .casino-count {
    color: #f39c12;
  }

  /* ── Arrow ───────────────────────────────────────────── */
  .cat-arrow {
    flex-shrink: 0;
    font-size: 1.25rem;
    color: var(--accent);
    opacity: 0.6;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .casino-arrow {
    color: #f39c12;
  }

  .category-card:hover .cat-arrow {
    opacity: 1;
    transform: translateX(4px);
  }

  /* ── Coming soon badge ───────────────────────────────── */
  .coming-badge {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
    border: 1px solid var(--border-bright);
    border-radius: 2px;
    padding: 0.15rem 0.5rem;
    width: fit-content;
  }

  /* ── Subtle inner shine overlay ──────────────────────── */
  .card-shine {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%);
    pointer-events: none;
  }

  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  button:active:not(:disabled) { transform: scale(0.99) translateY(-1px); transition: transform 0.1s; }
</style>
