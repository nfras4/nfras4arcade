<script lang="ts">
  import { goto } from '$app/navigation';

  const EXAMPLES = [
    { count: 3, face: 4, text: 'three 4s' },
    { count: 4, face: 4, text: 'four 4s (raised count)' },
    { count: 3, face: 5, text: 'three 5s (same count, higher face)' },
  ];

  function dieFace(n: number): string {
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return faces[n] ?? String(n);
  }
</script>

<div class="wrap">
  <div class="content">
    <header class="hero">
      <a href="/liars-dice" class="back-link geo-title">← Lobby</a>
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">How to Play</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Liar's Dice / 2-6 players</p>
    </header>

    <section class="section">
      <h2 class="section-title">The setup</h2>
      <p>Everyone starts with <strong>5 dice</strong>. At the start of each round, all players roll their dice <strong>in secret</strong> — only you see your own dice.</p>
    </section>

    <section class="section">
      <h2 class="section-title">The bid</h2>
      <p>On your turn, make a bid like <strong>"three 4s"</strong>. You are claiming that across <strong>every die at the table</strong> (yours plus everyone else's), there are at least that many dice showing that face.</p>
      <div class="example-row">
        {#each EXAMPLES as e}
          <div class="example">
            <span class="ex-count">{e.count}</span>
            <span class="ex-x">×</span>
            <span class="ex-face">{dieFace(e.face)}</span>
            <span class="ex-text">{e.text}</span>
          </div>
        {/each}
      </div>
      <p class="note">Each raise must be <strong>strictly higher</strong>: more dice of the same face, or the same count with a higher face.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Call liar</h2>
      <p>Instead of raising, you can call <strong>liar</strong> on the previous bid. All dice are revealed and counted. If the claim is <strong>met or exceeded</strong>, the caller loses a die. If the claim <strong>fell short</strong>, the bidder loses a die.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Win the pot</h2>
      <p>Lose all your dice and you're out. The <strong>last player with dice remaining</strong> takes the entire pot. In competitive mode the pot is real chips; in casual mode it's just for fun.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Ones wild</h2>
      <p>The host can enable the <strong>wilds variant</strong> in the lobby. When wilds are on, any die showing <strong>1</strong> counts as the bid face (for example, a bid of four 3s is satisfied by any combination of 3s and 1s). If the bid is on the face <strong>1</strong> itself, only actual 1s count.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Bots</h2>
      <p>The host can <strong>add bots</strong> from the lobby to fill seats. Bots roll, bid, and call liar on their own. They ante into the pot and can win like any other player.</p>
    </section>

    <div class="cta">
      <button class="btn-primary btn-full" onclick={() => goto('/liars-dice')}>Back to Lobby</button>
    </div>
  </div>
</div>

<style>
  .wrap {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4rem 1.25rem 3rem;
  }

  .content {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 1.75rem;
  }

  .hero { text-align: center; }

  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--text-subtle);
    text-decoration: none;
  }

  .back-link:hover { color: var(--accent); }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .wordmark {
    font-size: clamp(1.8rem, 6vw, 2.5rem);
    font-weight: 700;
    letter-spacing: 0.16em;
    line-height: 1;
    color: var(--accent);
  }

  .tagline {
    margin-top: 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .section {
    background: var(--bg-card);
    border: 1px solid var(--border);
    padding: 1rem 1.1rem;
    clip-path: var(--clip-card);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .section-title {
    margin: 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .section p {
    margin: 0;
    font-size: 0.925rem;
    color: var(--text-muted);
    line-height: 1.55;
  }

  .section p strong { color: var(--text); font-weight: 500; }

  .note {
    font-size: 0.85rem !important;
    color: var(--text-subtle) !important;
    font-style: italic;
  }

  .example-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem 0;
  }

  .example {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    font-family: 'Rajdhani', system-ui, sans-serif;
  }

  .ex-count {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--accent);
    min-width: 1.2rem;
  }

  .ex-x { color: var(--text-subtle); }
  .ex-face { font-size: 1.4rem; color: var(--accent); }

  .ex-text {
    flex: 1;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-left: 0.4rem;
  }

  .cta { display: flex; justify-content: center; margin-top: 0.5rem; }
  .btn-full { width: 100%; padding: 0.85rem 1rem; font-size: 0.95rem; }
</style>
