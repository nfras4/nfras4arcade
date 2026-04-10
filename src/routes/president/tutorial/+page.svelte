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
          <h1 class="wordmark geo-title">President</h1>
          <span class="diamond-accent" aria-hidden="true"></span>
        </div>
        <p class="tagline">How to play</p>
      </header>

      <div class="panel">
        <div class="panel-border" aria-hidden="true"></div>
        <div class="panel-inner">
          <h3 class="section-title geo-title">The goal</h3>
          <p class="desc">Get rid of all your cards before everyone else. First one out becomes the President, last one is the Scum.</p>

          <h3 class="section-title geo-title">Card ranking</h3>
          <p class="desc">3 is the lowest, Ace is high, and <strong>2 is the highest card</strong> in the game. Playing a 2 clears the pile and lets you lead again.</p>

          <h3 class="section-title geo-title">How a turn works</h3>
          <ol class="tutorial-steps">
            <li>The first player leads by placing one or more cards of the <strong>same rank</strong> (e.g. a pair of 7s).</li>
            <li>Each following player must play the <strong>same number of cards</strong> at a <strong>higher rank</strong>, or <strong>pass</strong>.</li>
            <li>If everyone passes, the pile is cleared and the last player who played leads the next round.</li>
          </ol>

          <h3 class="section-title geo-title">Finishing order</h3>
          <ol class="tutorial-steps">
            <li>First out = <strong>President</strong></li>
            <li>Second out = <strong>Vice President</strong> (4+ players)</li>
            <li>Second last = <strong>Vice Scum</strong> (4+ players)</li>
            <li>Last out = <strong>Scum</strong></li>
          </ol>

          <h3 class="section-title geo-title">Card swap (round 2+)</h3>
          <p class="desc">At the start of each new round, the <strong>Scum gives their 2 best cards</strong> to the President, and the President gives back their <strong>2 worst cards</strong>. This is automatic.</p>

          <h3 class="section-title geo-title">Tips</h3>
          <ul class="tutorial-tips">
            <li>Pairs and triples are powerful — save them for when you need to beat a high play.</li>
            <li>2s clear the pile. Use them strategically to regain control.</li>
            <li>Don't be afraid to pass early if you can't beat the current play cheaply.</li>
          </ul>

          <div class="action-row">
            <button class="btn-primary btn-full" onclick={() => goto('/president')}>
              Back to President
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

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-secondary:hover:not(:disabled) { background: var(--accent-border); color: var(--accent); }
  .gap-4 { gap: 1rem; }
  .gap-6 { gap: 1.5rem; }
</style>
