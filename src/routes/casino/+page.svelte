<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';

  let displayName = $derived($isLoggedIn ? $currentUser?.displayName : getGuestDisplayName());
  let chipBalance = $state<number | null>(null);
  let tables = $state<any[]>([]);

  $effect(() => {
    if ($isLoggedIn) {
      fetch('/api/chips/status')
        .then(r => r.json())
        .then((data: any) => { chipBalance = data.chips ?? null; })
        .catch(() => {});
    }
    fetch('/api/casino/tables')
      .then(r => r.json())
      .then((data: any) => { tables = data.tables ?? []; })
      .catch(() => {});
  });

  const casinoGames = [
    {
      id: 'poker',
      name: 'Texas Hold\'em',
      description: 'Bet, bluff, and go all-in',
      maxPlayers: 8,
      route: '/poker',
    },
    {
      id: 'blackjack',
      name: 'Blackjack',
      description: 'Beat the dealer to 21',
      maxPlayers: 6,
      route: '/casino/blackjack',
    },
    {
      id: 'roulette',
      name: 'Roulette',
      description: 'Bet on the wheel',
      maxPlayers: 20,
      route: '/casino/roulette',
    },
  ];
</script>

<div class="hub">
  <div class="hub-content">

    <header class="hub-hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">Casino</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Play against the house</p>
    </header>

    <div class="identity-bar">
      <div class="identity">
        <span class="identity-label">Playing as</span>
        <span class="identity-name">{displayName}</span>
      </div>
      {#if chipBalance !== null}
        <div class="chip-balance">
          <svg class="chips-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>
          <span>{chipBalance.toLocaleString()}</span>
        </div>
      {/if}
    </div>

    <section class="games-section">
      <h2 class="section-heading geo-title">Games</h2>
      <div class="game-grid">
        {#each casinoGames as game}
          <div class="game-card card" role="button" tabindex="0" onclick={() => goto(game.route)} onkeydown={(e) => { if (e.key === 'Enter') goto(game.route); }}>
            <div class="game-card-inner">
              <h3 class="game-name geo-title">{game.name}</h3>
              <p class="game-desc">{game.description}</p>
              <div class="game-meta">
                <span class="game-players">1-{game.maxPlayers} players</span>
                <span class="game-type">casino</span>
              </div>
            </div>
            <div class="game-card-footer">
              <button class="solo-btn" onclick={(e) => { e.stopPropagation(); goto(game.route); }}>
                Play
              </button>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="games-section">
      <h2 class="section-heading geo-title">Shop</h2>
      <div class="game-grid">
        <div class="game-card card" role="button" tabindex="0" onclick={() => goto('/shop')} onkeydown={(e) => { if (e.key === 'Enter') goto('/shop'); }}>
          <div class="game-card-inner">
            <h3 class="game-name geo-title">Chip Shop</h3>
            <p class="game-desc">Spend chips on cosmetics & items</p>
          </div>
          <div class="game-card-footer">
            <button class="solo-btn" onclick={(e) => { e.stopPropagation(); goto('/shop'); }}>
              Browse
            </button>
          </div>
        </div>
      </div>
    </section>

    {#if tables.length > 0}
      <section class="games-section">
        <h2 class="section-heading geo-title">Open Tables</h2>
        <div class="table-list">
          {#each tables as table}
            <button class="table-row" onclick={() => goto(`/casino/${table.game_type}/${table.code}`)}>
              <span class="table-game">{table.game_type === 'blackjack' ? 'Blackjack' : 'Roulette'}</span>
              <span class="table-code">{table.code}</span>
              <span class="table-seats">{table.player_count}/{table.max_seats}</span>
              <span class="table-bet">Min: {table.min_bet}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <button class="back-btn" onclick={() => goto('/')}>Back to Arcade</button>
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

  .identity-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.875rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .identity-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .identity-name {
    font-size: 0.9rem;
    color: var(--accent);
    font-weight: 500;
  }

  .chip-balance {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: #f39c12;
  }

  .chips-icon { color: #f39c12; }

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
    border: 1.5px solid #f39c12;
    box-shadow: 0 0 12px rgba(243, 156, 18, 0.2), inset 0 0 8px rgba(243, 156, 18, 0.04);
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.15s ease;
    display: flex;
    flex-direction: column;
  }

  .game-card:hover {
    background: var(--bg-hover);
    transform: translateY(-2px);
    box-shadow: 0 0 18px rgba(243, 156, 18, 0.3), inset 0 0 10px rgba(243, 156, 18, 0.06);
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
    color: #f39c12;
    background: rgba(243, 156, 18, 0.08);
    border: 1px solid rgba(243, 156, 18, 0.3);
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease;
    clip-path: none;
  }

  .solo-btn:hover { background: rgba(243, 156, 18, 0.15); }

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
    color: #f39c12;
    padding: 0.15rem 0.5rem;
    border: 1px solid rgba(243, 156, 18, 0.3);
    border-radius: 2px;
  }

  .table-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .table-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    width: 100%;
    text-align: left;
    transition: background 0.15s ease;
    clip-path: none;
  }

  .table-row:hover {
    background: var(--bg-hover);
    border-color: rgba(243, 156, 18, 0.3);
  }

  .table-game {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
    min-width: 80px;
  }

  .table-code {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: #f39c12;
  }

  .table-seats, .table-bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .table-seats { margin-left: auto; }

  .back-btn {
    width: 100%;
    padding: 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    clip-path: none;
  }

  .back-btn:hover { color: var(--accent); border-color: var(--accent-border); }

  button:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
