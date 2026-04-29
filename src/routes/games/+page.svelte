<script lang="ts">
  import { goto } from '$app/navigation';
  import { isLoggedIn } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';
  import { fade } from 'svelte/transition';

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
      description: "Read the psychic's mind",
      minPlayers: 2,
      maxPlayers: 16,
      type: 'party',
      route: '/wavelength',
      soloAction: 'tutorial' as const,
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
      id: 'liars-dice',
      name: "Liar's Dice",
      description: 'Bid, bluff, call the liar',
      minPlayers: 2,
      maxPlayers: 6,
      type: 'social deduction',
      route: '/liars-dice',
      soloAction: 'tutorial' as const,
    },
    {
      id: 'platformer',
      name: 'Platformer',
      description: 'Knock rivals off the stage',
      minPlayers: 2,
      maxPlayers: 4,
      type: 'experimental',
      route: '/platformer',
      soloAction: 'tutorial' as const,
    },
  ];

  let creatingSolo: string | null = $state(null);

  const typeColors: Record<string, string> = {
    'social deduction': 'var(--blue)',
    'card game': 'var(--yellow)',
    'strategy': 'var(--blue)',
    'party': 'var(--green)',
    'experimental': '#f0c030',
  };

  function getTypeColor(type: string): string {
    return typeColors[type] ?? 'var(--accent)';
  }

  function formatPlayers(min: number, max: number): string {
    if (min === max) return max === 2 ? '1v1' : `${min} players`;
    return `${min}–${max} players`;
  }

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

    <header class="hub-hero">
      <a href="/" class="back-link geo-title">← Hub</a>
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="section-title geo-title">Party Games</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Gather your friends</p>
    </header>

    {#if !$isLoggedIn}
      <div class="guest-banner" transition:fade={{ duration: 200 }}>
        <div class="panel">
          <div class="panel-border" aria-hidden="true"></div>
          <div class="panel-inner">
            <p class="guest-identity">Playing as <strong>{getGuestDisplayName()}</strong></p>
            <p class="guest-hint">Login is optional, but signing in lets us save your stats and helps us improve the game during development.</p>
            <div class="action-row">
              <button class="btn-secondary btn-full btn-small-text" onclick={() => goto('/login')}>Log In</button>
              <button class="btn-secondary btn-full btn-small-text" onclick={() => goto('/register')}>Create Account</button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <section class="games-section">
      <div class="game-grid">
        {#each games as game}
          <div class="game-card card">
            <a href={game.route} class="game-card-link" aria-label={game.name}>
              <div class="game-card-inner">
                <h3 class="game-name geo-title">{game.name}</h3>
                <p class="game-desc">{game.description}</p>
                <div class="game-meta">
                  <span class="game-players">{formatPlayers(game.minPlayers, game.maxPlayers)}</span>
                  {#if game.minPlayers >= 3}
                    <span class="game-tag multiplayer-tag">Multiplayer</span>
                  {/if}
                  <span class="game-type" style="color: {getTypeColor(game.type)}; border-color: {getTypeColor(game.type)}50;">{game.type}</span>
                </div>
              </div>
            </a>
            <div class="game-card-footer">
              <button
                class="solo-btn"
                onclick={() => playSolo(game)}
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
    padding: 5rem 1.25rem 4rem;
  }

  .hub-content {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .hub-hero {
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

  .back-link:hover {
    color: var(--accent);
  }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .section-title {
    font-size: clamp(1.75rem, 7vw, 3rem);
    font-weight: 700;
    letter-spacing: 0.12em;
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

  .games-section {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  .game-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }

  .game-card {
    position: relative;
    text-align: left;
    background: var(--bg-card);
    border: none;
    font-family: inherit;
    transition: background 0.15s ease, transform 0.15s ease;
    display: flex;
    flex-direction: column;
  }

  .game-card:hover:not(.coming-soon),
  .game-card:focus-within:not(.coming-soon) {
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  .game-card-link {
    display: block;
    color: inherit;
    text-decoration: none;
    position: relative;
    flex: 1;
  }

  .game-card-link::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .game-card-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .game-card-footer {
    position: relative;
    z-index: 1;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }

  .game-card-inner {
    padding: 0 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .solo-btn {
    width: 100%;
    padding: 0.5rem 0.75rem;
    min-height: 44px;
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

  .solo-btn:hover:not(:disabled) { background: var(--accent-border); }
  .solo-btn:disabled { opacity: 0.5; cursor: default; }

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
    flex-wrap: wrap;
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
    padding: 0.15rem 0.5rem;
    border: 1px solid;
    border-radius: 2px;
  }

  .game-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
  }

  .multiplayer-tag {
    color: var(--text-subtle);
    border: 1px solid var(--border-bright);
  }

  .coming-soon {
    opacity: 0.4;
    cursor: default;
  }

  .panel {
    background: var(--bg-card);
    clip-path: var(--clip-card);
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

  .btn-full { width: 100%; padding: 0.875rem 1.25rem; }
  .btn-small-text { font-size: 0.8rem; padding: 0.6rem 1rem; }

  .guest-banner {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both;
  }

  .guest-identity {
    font-size: 0.9rem;
    color: var(--text);
    text-align: center;
  }

  .guest-identity strong { color: var(--accent); }

  .guest-hint {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.6;
    text-align: center;
  }

  @media (min-width: 480px) {
    .panel-inner { padding: 1.875rem; }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
