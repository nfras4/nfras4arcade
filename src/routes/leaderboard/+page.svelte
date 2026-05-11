<script lang="ts">
  type Season = {
    id: string;
    label: string;
    started_at: number;
    ends_at: number;
    status: string;
  };

  type Entry = {
    rank: number;
    player_id: string;
    display_name: string;
    avatar: string | null;
    value: number;
  };

  type Winner = {
    metric: string;
    rank: number;
    player_id: string;
    display_name: string;
    avatar: string | null;
    value: number;
  };

  const METRICS: Array<{ key: string; label: string }> = [
    { key: 'games_won', label: 'Games Won' },
    { key: 'poker_wins', label: 'Poker' },
    { key: 'snap_wins', label: 'Snap' },
    { key: 'wavelength_wins', label: 'Wavelength' },
    { key: 'liars_dice_wins', label: "Liar's Dice" },
    { key: 'connect_four_wins', label: 'Connect Four' },
    { key: 'president_wins', label: 'President' },
    { key: 'chase_the_queen_wins', label: 'Chase the Queen' },
    { key: 'impostor_wins', label: 'Impostor' },
    { key: 'chips_earned', label: 'Chips Earned' },
    { key: 'dungeon_zone', label: 'Dungeon Zone' },
  ];

  let seasons = $state<Season[]>([]);
  let selectedSeasonId = $state<string>('');
  let selectedMetric = $state<string>('games_won');
  let entries = $state<Entry[]>([]);
  let currentSeason = $state<Season | null>(null);
  let loadingEntries = $state<boolean>(false);
  let loadingSeasons = $state<boolean>(true);
  let currentUserId = $state<string | null>(null);

  let showWinners = $state<boolean>(false);
  let winners = $state<Winner[]>([]);
  let loadingWinners = $state<boolean>(false);

  async function loadSeasons() {
    loadingSeasons = true;
    try {
      const res = await fetch('/api/leaderboard/seasons');
      const data = (await res.json()) as { seasons?: Season[] };
      seasons = data.seasons ?? [];
    } catch {
      seasons = [];
    } finally {
      loadingSeasons = false;
    }
  }

  async function loadMe() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) return;
      const data = (await res.json()) as { user?: { id?: string } | null };
      currentUserId = data.user?.id ?? null;
    } catch {
      currentUserId = null;
    }
  }

  async function loadEntries() {
    loadingEntries = true;
    try {
      const params = new URLSearchParams({ metric: selectedMetric });
      if (selectedSeasonId) params.set('season', selectedSeasonId);
      const res = await fetch(`/api/leaderboard/seasonal?${params.toString()}`);
      if (!res.ok) {
        entries = [];
        currentSeason = null;
        return;
      }
      const data = (await res.json()) as { entries?: Entry[]; season?: Season | null };
      entries = data.entries ?? [];
      currentSeason = data.season ?? null;
      if (!selectedSeasonId && currentSeason) {
        selectedSeasonId = currentSeason.id;
      }
    } catch {
      entries = [];
    } finally {
      loadingEntries = false;
    }
  }

  async function loadWinners() {
    if (!selectedSeasonId) return;
    loadingWinners = true;
    try {
      const res = await fetch(`/api/leaderboard/winners?seasonId=${encodeURIComponent(selectedSeasonId)}`);
      if (!res.ok) {
        winners = [];
        return;
      }
      const data = (await res.json()) as { winners?: Winner[] };
      winners = data.winners ?? [];
    } catch {
      winners = [];
    } finally {
      loadingWinners = false;
    }
  }

  function metricLabel(key: string): string {
    return METRICS.find((m) => m.key === key)?.label ?? key;
  }

  function formatValue(metric: string, value: number): string {
    if (metric === 'chips_earned') return `${value.toLocaleString()} chips`;
    if (metric === 'dungeon_zone') return `Zone ${value}`;
    return value.toLocaleString();
  }

  function emptyMessage(metric: string): string {
    return `No scores recorded yet for ${metricLabel(metric).toLowerCase()} this season.`;
  }

  $effect(() => {
    loadSeasons();
    loadMe();
  });

  $effect(() => {
    // Re-fetch when metric or season changes
    selectedMetric;
    selectedSeasonId;
    loadEntries();
  });

  $effect(() => {
    if (showWinners) loadWinners();
  });
</script>

<svelte:head>
  <title>Seasonal Leaderboards · Monkey Barrel</title>
</svelte:head>

<div class="lb-page">
  <div class="lb-content">

    <header class="lb-hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">Seasonal Leaderboards</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      {#if currentSeason}
        <div class="season-meta">
          <span class="season-label">{currentSeason.label}</span>
          {#if currentSeason.status === 'active'}
            <span class="status-badge status-active">Active</span>
          {:else}
            <span class="status-badge status-archived">Archived</span>
          {/if}
        </div>
      {/if}
    </header>

    <div class="season-row">
      <label class="season-select-wrap">
        <span class="season-select-label">Season</span>
        <select
          bind:value={selectedSeasonId}
          disabled={loadingSeasons || seasons.length === 0}
          class="season-select"
        >
          {#each seasons as s (s.id)}
            <option value={s.id}>{s.label}{s.status === 'active' ? ' (active)' : ''}</option>
          {/each}
        </select>
      </label>
    </div>

    <nav class="metric-bar" aria-label="Leaderboard metric">
      {#each METRICS as m (m.key)}
        <button
          type="button"
          class="metric-btn"
          class:active={selectedMetric === m.key}
          aria-pressed={selectedMetric === m.key}
          onclick={() => (selectedMetric = m.key)}
        >
          {m.label}
        </button>
      {/each}
    </nav>

    <section class="lb-card card">
      <div class="lb-card-header">
        <span class="lb-card-title geo-title">Top 10</span>
        <span class="lb-metric-name">{metricLabel(selectedMetric)}</span>
      </div>

      {#if loadingEntries}
        <div class="lb-state">
          <p class="lb-state-text">Loading...</p>
        </div>
      {:else if entries.length === 0}
        <div class="lb-state">
          <p class="lb-state-text">{emptyMessage(selectedMetric)}</p>
        </div>
      {:else}
        <ul class="entry-list" role="list">
          {#each entries as e (e.player_id)}
            {@const isMe = currentUserId != null && e.player_id === currentUserId}
            <li class="entry-row" class:entry-me={isMe}>
              <span class="entry-rank" aria-label="Rank {e.rank}">{e.rank}</span>
              {#if e.avatar}
                <img src={e.avatar} alt="" class="entry-avatar entry-avatar-img" />
              {:else}
                <span class="entry-avatar entry-avatar-initial" aria-hidden="true">
                  {e.display_name.slice(0, 1).toUpperCase()}
                </span>
              {/if}
              <span class="entry-name">
                {e.display_name}
                {#if isMe}<span class="entry-you">you</span>{/if}
              </span>
              <span class="entry-score">{formatValue(selectedMetric, e.value)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="winners-card card">
      <button
        type="button"
        class="winners-toggle"
        aria-expanded={showWinners}
        onclick={() => (showWinners = !showWinners)}
      >
        <span class="geo-title winners-toggle-label">Past Season Winners</span>
        <span class="winners-chevron" aria-hidden="true">{showWinners ? '−' : '+'}</span>
      </button>

      {#if showWinners}
        <div class="winners-body">
          {#if loadingWinners}
            <div class="lb-state">
              <p class="lb-state-text">Loading...</p>
            </div>
          {:else if winners.length === 0}
            <div class="lb-state">
              <p class="lb-state-text">No archived winners for this season yet.</p>
            </div>
          {:else}
            <table class="winners-table">
              <thead>
                <tr>
                  <th class="winners-th">Metric</th>
                  <th class="winners-th">Rank</th>
                  <th class="winners-th">Player</th>
                  <th class="winners-th winners-th-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {#each winners as w (w.metric + '-' + w.rank)}
                  <tr class="winners-row">
                    <td class="winners-td">{metricLabel(w.metric)}</td>
                    <td class="winners-td winners-td-rank">#{w.rank}</td>
                    <td class="winners-td">
                      <span class="winners-player">
                        {#if w.avatar}
                          <img src={w.avatar} alt="" class="winners-avatar" />
                        {/if}
                        {w.display_name}
                      </span>
                    </td>
                    <td class="winners-td winners-td-right winners-td-score">
                      {formatValue(w.metric, w.value)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {/if}
    </section>

  </div>
</div>

<style>
  /* ── Layout ──────────────────────────────────────────── */
  .lb-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5rem 1.25rem 4rem;
  }

  .lb-content {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ── Header ──────────────────────────────────────────── */
  .lb-hero {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .wordmark {
    font-size: clamp(1.5rem, 6vw, 2.5rem);
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    background: linear-gradient(180deg, var(--casino-hover, #f5ad3a) 0%, var(--casino, #f39c12) 60%, rgba(243,156,18,0.7) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .diamond-accent {
    width: 8px;
    height: 8px;
    background: var(--casino, #f39c12);
    transform: rotate(45deg);
    display: inline-block;
    flex-shrink: 0;
  }

  .season-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .season-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .status-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .status-active {
    color: var(--green, #3dd68c);
    background: rgba(61, 214, 140, 0.08);
    border: 1px solid rgba(61, 214, 140, 0.3);
  }

  .status-archived {
    color: var(--text-muted);
    background: var(--bg-hover, #1e2830);
    border: 1px solid var(--border);
  }

  /* ── Season selector row ─────────────────────────────── */
  .season-row {
    display: flex;
    justify-content: flex-end;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both;
  }

  .season-select-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .season-select-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .season-select {
    padding: 0.4rem 0.65rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    background: var(--bg-card);
    color: var(--text);
    border: 1px solid var(--casino-border, rgba(243,156,18,0.3));
    border-radius: 2px;
    cursor: pointer;
    outline: none;
    width: auto;
    transition: border-color 0.15s ease;
  }

  .season-select:focus {
    border-color: var(--casino, #f39c12);
    box-shadow: 0 0 0 2px var(--casino-faint, rgba(243,156,18,0.08));
  }

  .season-select:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Metric tab bar ──────────────────────────────────── */
  .metric-bar {
    display: flex;
    gap: 0.375rem;
    overflow-x: auto;
    padding-bottom: 0.125rem;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both;
  }

  .metric-bar::-webkit-scrollbar {
    display: none;
  }

  .metric-btn {
    flex: 0 0 auto;
    padding: 0.35rem 0.65rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    clip-path: none;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .metric-btn.active {
    color: var(--casino, #f39c12);
    border-color: rgba(243, 156, 18, 0.4);
    background: rgba(243, 156, 18, 0.06);
  }

  .metric-btn:hover:not(.active) {
    color: var(--text);
    background: var(--bg-hover);
  }

  /* ── Leaderboard card ────────────────────────────────── */
  .lb-card {
    padding: 0;
    overflow: hidden;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  .lb-card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .lb-card-title {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
  }

  .lb-metric-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--casino, #f39c12);
  }

  /* ── Entry list ──────────────────────────────────────── */
  .entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .entry-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--border);
    transition: background 0.12s ease;
  }

  .entry-row:last-child {
    border-bottom: none;
  }

  .entry-row:hover {
    background: var(--bg-hover);
  }

  .entry-row.entry-me {
    background: rgba(243, 156, 18, 0.06);
    border-left: 2px solid rgba(243, 156, 18, 0.4);
  }

  .entry-row.entry-me:hover {
    background: rgba(243, 156, 18, 0.09);
  }

  .entry-rank {
    width: 1.75rem;
    text-align: right;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .entry-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .entry-avatar-img {
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .entry-avatar-initial {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--casino, #f39c12);
    background: rgba(243, 156, 18, 0.08);
    border: 1px solid rgba(243, 156, 18, 0.25);
  }

  .entry-name {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry-you {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--casino, #f39c12);
    padding: 0.1rem 0.35rem;
    border: 1px solid rgba(243, 156, 18, 0.35);
    border-radius: 2px;
    background: rgba(243, 156, 18, 0.06);
    flex-shrink: 0;
  }

  .entry-score {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  /* ── Empty / loading states ──────────────────────────── */
  .lb-state {
    padding: 2.5rem 1rem;
    text-align: center;
  }

  .lb-state-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  /* ── Winners collapsible ─────────────────────────────── */
  .winners-card {
    padding: 0;
    overflow: hidden;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
  }

  .winners-toggle {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-radius: 0;
    clip-path: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  .winners-toggle:hover {
    background: var(--bg-hover);
  }

  .winners-toggle:active:not(:disabled) {
    transform: none;
    opacity: 1;
  }

  .winners-toggle-label {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--text-subtle);
  }

  .winners-chevron {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-muted);
    line-height: 1;
  }

  .winners-body {
    border-top: 1px solid var(--border);
    padding: 0.75rem 1rem 1rem;
    animation: fadeUp 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* ── Winners table ───────────────────────────────────── */
  .winners-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .winners-th {
    padding: 0.375rem 0.5rem 0.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-subtle);
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .winners-th-right {
    text-align: right;
  }

  .winners-row {
    border-bottom: 1px solid var(--border);
    transition: background 0.12s ease;
  }

  .winners-row:last-child {
    border-bottom: none;
  }

  .winners-row:hover {
    background: var(--bg-hover);
  }

  .winners-td {
    padding: 0.5rem 0.5rem;
    color: var(--text-muted);
    font-size: 0.8rem;
  }

  .winners-td-rank {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    color: var(--casino, #f39c12);
  }

  .winners-td-right {
    text-align: right;
  }

  .winners-td-score {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .winners-player {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    color: var(--text);
    font-weight: 600;
  }

  .winners-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 1px solid var(--border);
    object-fit: cover;
    flex-shrink: 0;
  }

  /* ── Focus / interaction ─────────────────────────────── */
  button:focus-visible {
    outline: 2px solid var(--casino, #f39c12);
    outline-offset: 2px;
  }
</style>
