<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn, fetchUser } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';
  import { fade, fly } from 'svelte/transition';

  const games = [
    {
      id: 'impostor',
      name: 'Impostor',
      description: "Who doesn't know the word?",
      minPlayers: 3,
      maxPlayers: 8,
      type: 'social deduction',
      route: '/impostor',
      soloAction: 'tutorial' as const,
    },
    {
      id: 'president',
      name: 'President',
      description: 'Get rid of your cards first',
      minPlayers: 3,
      maxPlayers: 6,
      type: 'card game',
      route: '/president',
      soloAction: 'solo' as const,
    },
    {
      id: 'chase-the-queen',
      name: 'Chase the Queen',
      description: 'Avoid the Queen of Spades',
      minPlayers: 3,
      maxPlayers: 6,
      type: 'card game',
      route: '/chase-the-queen',
      soloAction: 'solo' as const,
    },
    {
      id: 'connect-four',
      name: 'Connect 4',
      description: 'Get four in a row to win',
      minPlayers: 2,
      maxPlayers: 2,
      type: 'strategy',
      route: '/connect-four',
      soloAction: 'solo' as const,
    },
    {
      id: 'wavelength',
      name: 'Wavelength',
      description: 'Read the psychic\'s mind',
      minPlayers: 2,
      maxPlayers: 16,
      type: 'party',
      route: '/wavelength',
      soloAction: 'tutorial' as const,
    },
    {
      id: 'poker',
      name: 'Texas Hold\'em',
      description: 'Bet, bluff, and go all-in',
      minPlayers: 2,
      maxPlayers: 8,
      type: 'card game',
      route: '/poker',
      soloAction: 'solo' as const,
    },
    {
      id: 'snap',
      name: 'Snap',
      description: 'Race to slap matching cards',
      minPlayers: 2,
      maxPlayers: 6,
      type: 'party',
      route: '/snap',
      soloAction: 'tutorial' as const,
    },
    {
      id: 'casino',
      name: 'Casino',
      description: 'Blackjack, Roulette & more',
      minPlayers: 1,
      maxPlayers: 20,
      type: 'casino',
      route: '/casino',
      soloAction: 'tutorial' as const,
    },
  ];

  let creatingSolo = $state<string | null>(null);

  async function playSolo(game: typeof games[0]) {
    if (game.soloAction === 'tutorial') {
      goto(`${game.route}/tutorial`);
      return;
    }
    creatingSolo = game.id;
    try {
      const res = await fetch(`/api/create-solo?game=${game.id}`, { method: 'POST' });
      const data: { code?: string; error?: string } = await res.json();
      if (data.error || !data.code) {
        creatingSolo = null;
        return;
      }
      goto(`${game.route}/${data.code}`);
    } catch {
      creatingSolo = null;
    }
  }

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

    {#if !$isLoggedIn}
      <!-- Soft login encouragement for guests -->
      <div class="guest-banner" transition:fade={{ duration: 200 }}>
        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner">
            <p class="guest-identity">Playing as <strong>{getGuestDisplayName()}</strong></p>
            <p class="guest-hint">Login is optional, but signing in lets us save your stats and helps us improve the game during development.</p>
            <div class="action-row gap-2">
              <button class="btn-secondary btn-full btn-small-text" onclick={() => goto('/login')}>
                Log In
              </button>
              <button class="btn-secondary btn-full btn-small-text" onclick={() => goto('/register')}>
                Create Account
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Game grid (visible to all users) -->
    <section class="games-section">
      <h2 class="section-heading geo-title">Games</h2>
      <div class="game-grid gap-4">
        {#each games as game}
          <div class="game-card card" class:poker-featured={game.id === 'poker'} class:casino-featured={game.id === 'casino'} role="button" tabindex="0" onclick={() => goto(game.route)} onkeydown={(e) => { if (e.key === 'Enter') goto(game.route); }}>
            <div class="game-card-inner">
              <h3 class="game-name geo-title">
                {game.name}
                {#if game.id === 'poker'}<svg class="chips-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="2"/><line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2"/><line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/></svg>{/if}
              </h3>
              <p class="game-desc">{game.description}</p>
              <div class="game-meta">
                <span class="game-players">{game.minPlayers}-{game.maxPlayers} players</span>
                <span class="game-type">{game.type}</span>
              </div>
            </div>
            <div class="game-card-footer">
              <button
                class="solo-btn"
                onclick={(e) => { e.stopPropagation(); playSolo(game); }}
                disabled={creatingSolo === game.id}
              >
                {#if game.soloAction === 'tutorial'}
                  How to Play
                {:else}
                  {creatingSolo === game.id ? 'Starting...' : 'Play Solo'}
                {/if}
              </button>
            </div>
          </div>
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

  .gap-2 { gap: 0.5rem; }
  .gap-4 { gap: 1rem; }
  .gap-6 { gap: 1.5rem; }

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
    background: var(--bg-card);
    border: none;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
    display: flex;
    flex-direction: column;
  }

  .game-card:hover:not(.coming-soon) {
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  .game-card-inner {
    padding: 0 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .game-card-footer {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .solo-btn {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease;
    clip-path: none;
  }

  .solo-btn:hover:not(:disabled) {
    background: var(--accent-border);
  }

  .solo-btn:disabled {
    opacity: 0.5;
    cursor: default;
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

  /* Guest banner */
  .guest-banner {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both;
  }

  .guest-identity {
    font-size: 0.9rem;
    color: var(--text);
    text-align: center;
  }

  .guest-identity strong {
    color: var(--accent);
  }

  .guest-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.6;
    text-align: center;
  }

  .btn-small-text {
    font-size: 0.8rem;
    padding: 0.6rem 1rem;
  }

  @media (min-width: 480px) {
    .panel-inner {
      padding: 1.875rem;
    }
  }

  /* Poker featured card */
  .poker-featured {
    border: 1.5px solid #f39c12 !important;
    box-shadow: 0 0 12px rgba(243, 156, 18, 0.25), inset 0 0 8px rgba(243, 156, 18, 0.05);
  }

  .poker-featured:hover, .casino-featured:hover {
    box-shadow: 0 0 18px rgba(243, 156, 18, 0.35), inset 0 0 10px rgba(243, 156, 18, 0.08);
  }

  .casino-featured {
    border: 1.5px solid #f39c12 !important;
    box-shadow: 0 0 12px rgba(243, 156, 18, 0.25), inset 0 0 8px rgba(243, 156, 18, 0.05);
  }

  .chips-icon {
    display: inline-block;
    vertical-align: middle;
    margin-left: 0.35rem;
    color: #f39c12;
    filter: drop-shadow(0 0 3px rgba(243, 156, 18, 0.5));
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
