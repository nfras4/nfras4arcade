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
          <h1 class="wordmark geo-title">Chase the Queen</h1>
          <span class="diamond-accent" aria-hidden="true"></span>
        </div>
        <p class="tagline">How to play</p>
      </header>

      <div class="panel">
        <div class="panel-border" aria-hidden="true"></div>
        <div class="panel-inner">
          <h3 class="section-title geo-title">The goal</h3>
          <p class="desc">Avoid penalty cards. The player with the <strong>lowest score</strong> when someone hits 500 points wins.</p>

          <h3 class="section-title geo-title">Penalty cards</h3>
          <ul class="tutorial-tips">
            <li><strong>Queen of Spades</strong> = 50 points (the big one)</li>
            <li><strong>All Hearts</strong> = face value (Ace = 11, face cards = 10)</li>
            <li>Every other card = 0 points</li>
          </ul>
          <p class="desc">Total penalty points per round: 145.</p>

          <h3 class="section-title geo-title">How a round works</h3>
          <ol class="tutorial-steps">
            <li>All 52 cards are dealt evenly. Extras go out of play.</li>
            <li>The player left of the dealer <strong>leads the first trick</strong> by playing any card.</li>
            <li>Each player must <strong>follow suit</strong> if they can. If you can't follow suit, play any card.</li>
            <li>The <strong>highest card of the led suit</strong> wins the trick and takes all the cards.</li>
            <li>The trick winner leads the next trick.</li>
            <li>Once all cards are played, penalty points are tallied and added to running scores.</li>
          </ol>

          <h3 class="section-title geo-title">Shoot the moon</h3>
          <p class="desc">If one player takes <strong>every single penalty card</strong> in a round, they "shot the moon" and get to choose: <strong>double everyone else's score</strong> or <strong>halve their own</strong>.</p>

          <h3 class="section-title geo-title">Game end</h3>
          <p class="desc">The game ends when any player's score reaches <strong>500 or more</strong>. The player with the lowest score at that point wins.</p>

          <h3 class="section-title geo-title">Tips</h3>
          <ul class="tutorial-tips">
            <li>Dump the Queen of Spades early if you can — 50 points hurts.</li>
            <li>If you can't follow suit, use it as a chance to offload hearts or the Queen.</li>
            <li>Watch what's been played. If all high cards of a suit are gone, your low cards in that suit are safe to lead.</li>
            <li>Shooting the moon is risky but game-changing if you're behind.</li>
          </ul>

          <div class="action-row">
            <button class="btn-primary btn-full" onclick={() => goto('/chase-the-queen')}>
              Back to Chase the Queen
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
</style>
