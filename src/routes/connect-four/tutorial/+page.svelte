<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<div class="tutorial-banner">
  This is a rules guide — no game in progress
</div>

<div class="tutorial-page">
  <div class="tutorial-content">

    <div class="phase-panel fade-in">
      <header class="hero">
        <div class="title-frame">
          <span class="diamond-accent" aria-hidden="true"></span>
          <h1 class="wordmark geo-title">Connect 4</h1>
          <span class="diamond-accent" aria-hidden="true"></span>
        </div>
        <p class="tagline">How to play</p>
      </header>

      <div class="panel">
        <div class="panel-border" aria-hidden="true"></div>
        <div class="panel-inner">
          <h3 class="section-title geo-title">The goal</h3>
          <p class="desc">Be the first player to connect <strong>four of your pieces</strong> in a row — horizontally, vertically, or diagonally.</p>

          <h3 class="section-title geo-title">How it works</h3>
          <ol class="tutorial-steps">
            <li>Two players take turns. One plays <strong>red</strong>, the other plays <strong>yellow</strong>.</li>
            <li>On your turn, click a column to <strong>drop your piece</strong>. It falls to the lowest empty space.</li>
            <li>The first player to get <strong>4 in a row</strong> wins the round.</li>
            <li>If the entire board fills up with no winner, it's a <strong>draw</strong>.</li>
          </ol>

          <h3 class="section-title geo-title">The board</h3>
          <p class="desc">The board is a <strong>7-column by 6-row</strong> grid. Pieces stack from the bottom up, so you can't place a piece mid-air.</p>

          <h3 class="section-title geo-title">Tips</h3>
          <ul class="tutorial-tips">
            <li>Control the center column — it gives you the most possible winning lines.</li>
            <li>Try to create a "double threat" where you have two ways to win at once.</li>
            <li>Watch what your opponent is building and block them before they connect four.</li>
            <li>Think ahead — sometimes the best move isn't the most obvious one.</li>
          </ul>

          <div class="action-row">
            <button class="btn-primary btn-full" onclick={() => goto('/connect-four')}>
              Back to Connect 4
            </button>
            <button class="btn-secondary btn-full" onclick={() => goto('/')}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</div>

<style>
  .tutorial-banner {
    position: fixed;
    top: 3.5rem;
    left: 0;
    right: 0;
    z-index: 100;
    text-align: center;
    padding: 0.4rem 1rem;
    background: var(--accent-faint);
    border-bottom: 1px solid var(--accent-border);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .tutorial-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 6rem 1.25rem 4rem;
  }

  .tutorial-content {
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .hero { text-align: center; animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }

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
    color: var(--accent);
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

  .phase-panel {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    animation: fadeUp 0.3s ease both;
  }

  .panel {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    overflow: visible;
    position: relative;
  }

  .panel-border {
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
    pointer-events: none;
  }

  .panel-inner {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.5rem;
  }

  .section-title {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: var(--accent);
    margin-top: 0.5rem;
  }

  .desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .desc strong { color: var(--text); font-weight: 500; }

  .tutorial-steps {
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tutorial-steps li {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .tutorial-steps li strong { color: var(--text); font-weight: 500; }

  .tutorial-tips {
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    list-style: disc;
  }

  .tutorial-tips li {
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .btn-full {
    width: 100%;
    padding: 0.875rem 1.25rem;
    font-size: 0.9375rem;
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  @media (min-width: 480px) {
    .panel-inner { padding: 1.875rem; }
  }
</style>
