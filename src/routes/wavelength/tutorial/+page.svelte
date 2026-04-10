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
          <h1 class="wordmark geo-title">Wavelength</h1>
          <span class="diamond-accent" aria-hidden="true"></span>
        </div>
        <p class="tagline">How to play</p>
      </header>

      <div class="panel">
        <div class="panel-border" aria-hidden="true"></div>
        <div class="panel-inner">

          <h3 class="section-title geo-title">What is Wavelength?</h3>
          <p class="desc">A party game where one player — the <strong>Psychic</strong> — gives clues to help others guess a hidden target on a spectrum. Can you get everyone on the same wavelength?</p>

          <h3 class="section-title geo-title">The Spectrum</h3>
          <p class="desc">Each round shows two opposing concepts — for example, <strong>Hot ↔ Cold</strong>. A hidden target sits somewhere on the dial between the two extremes. Only the Psychic can see where the target is.</p>

          <h3 class="section-title geo-title">The Psychic's Job</h3>
          <ol class="tutorial-steps">
            <li>Give <strong>clues</strong> — any words, sentences, or descriptions — to hint at where the target sits on the spectrum.</li>
            <li>You can give <strong>as many clues as you want</strong> before time runs out.</li>
            <li>The better your clues, the <strong>more points everyone earns</strong>.</li>
          </ol>

          <h3 class="section-title geo-title">Guessing</h3>
          <ol class="tutorial-steps">
            <li>Each guesser independently positions their <strong>needle on the semicircle dial</strong>.</li>
            <li>You can see where <strong>other guessers are placing their needles</strong> in real time.</li>
            <li><strong>Lock in your guess</strong> before time runs out.</li>
          </ol>

          <h3 class="section-title geo-title">Scoring</h3>
          <ul class="tutorial-tips scoring-list">
            <li><strong>Bullseye (±5°): 4 points</strong> — you nailed it!</li>
            <li><strong>Close (±15°): 3 points</strong> — nearly there</li>
            <li><strong>Edge (±25°): 2 points</strong> — on the right track</li>
            <li><strong>Miss: 0 points</strong> — better luck next round</li>
          </ul>
          <p class="desc">The <strong>Psychic earns the average</strong> of all guesser scores that round.</p>

          <h3 class="section-title geo-title">Awards</h3>
          <ul class="tutorial-tips">
            <li><strong>Best Clue</strong> — given to the Psychic whose round had the highest average guesser score.</li>
            <li><strong>Mind Meld</strong> — given for the round where all guessers were closest together.</li>
          </ul>

          <div class="action-row">
            <button class="btn-primary btn-full" onclick={() => goto('/wavelength')}>
              Back to Wavelength
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

  .tutorial-tips li strong { color: var(--text); font-weight: 500; }

  .scoring-list li strong { color: var(--text); }

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

  button:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-secondary:hover:not(:disabled) { background: var(--accent-border); color: var(--accent); }
</style>
