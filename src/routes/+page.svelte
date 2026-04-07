<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn, fetchUser } from '$lib/auth';

  const games = [
    {
      id: 'impostor',
      name: 'Impostor',
      description: "Who doesn't know the word?",
      minPlayers: 3,
      maxPlayers: 8,
      type: 'social deduction',
      route: '/impostor',
    },
    {
      id: 'president',
      name: 'President',
      description: 'Get rid of your cards first',
      minPlayers: 3,
      maxPlayers: 6,
      type: 'card game',
      route: '/president',
    },
    {
      id: 'chase-the-queen',
      name: 'Chase the Queen',
      description: 'Avoid the Queen of Spades',
      minPlayers: 3,
      maxPlayers: 6,
      type: 'card game',
      route: '/chase-the-queen',
    },
  ];

</script>

<div class="hub">
  <div class="hub-content">

    <!-- Hero -->
    <header class="hub-hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">nfras4arcade</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Party games for friends</p>
    </header>

    {#if $isLoggedIn}
      <!-- Game grid -->
      <section class="games-section">
        <h2 class="section-heading geo-title">Games</h2>
        <div class="game-grid">
          {#each games as game}
            <button class="game-card card" onclick={() => goto(game.route)}>
              <div class="game-card-inner">
                <h3 class="game-name geo-title">{game.name}</h3>
                <p class="game-desc">{game.description}</p>
                <div class="game-meta">
                  <span class="game-players">{game.minPlayers}-{game.maxPlayers} players</span>
                  <span class="game-type">{game.type}</span>
                </div>
              </div>
            </button>
          {/each}

          <!-- Coming soon placeholder -->
          <div class="game-card card coming-soon">
            <div class="game-card-inner">
              <h3 class="game-name geo-title">More Games</h3>
              <p class="game-desc">Coming soon...</p>
            </div>
          </div>
        </div>
      </section>

    {:else}
      <!-- Landing for logged out users -->
      <div class="landing-panel">
        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner">
            <p class="landing-text">Play party games with friends online. Create an account to get started.</p>
            <div class="action-row">
              <button class="btn-primary btn-full" onclick={() => goto('/register')}>
                Create Account
              </button>
              <button class="btn-secondary btn-full" onclick={() => goto('/login')}>
                Log In
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

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
    justify-content: flex-start;
    padding: 5rem 1.25rem 4rem;
  }

  .hub-content {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  /* Hero */
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

  /* Games section */
  .section-heading {
    font-size: 0.65rem;
    letter-spacing: 0.16em;
    color: var(--text-subtle);
    margin-bottom: 1rem;
  }

  .games-section {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  .game-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }

  .game-card {
    text-align: left;
    cursor: pointer;
    padding: 0;
    clip-path: var(--clip-card);
    background: var(--bg-card);
    border: none;
    font-family: inherit;
    transition: background 0.15s ease, transform 0.15s ease;
  }

  .game-card:hover:not(.coming-soon) {
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  .game-card-inner {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .game-name {
    font-size: 1.125rem;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  .game-desc {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .game-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.25rem;
  }

  .game-players {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .game-type {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--accent-border);
    border-radius: 2px;
  }

  .coming-soon {
    opacity: 0.4;
    cursor: default;
  }

  /* Landing panel */
  .landing-panel {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
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

  .landing-text {
    font-size: 0.9375rem;
    color: var(--text-muted);
    line-height: 1.6;
    text-align: center;
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-full {
    width: 100%;
    padding: 0.875rem 1.25rem;
    font-size: 0.9375rem;
  }

  @media (min-width: 480px) {
    .panel-inner {
      padding: 1.875rem;
    }
  }
</style>
