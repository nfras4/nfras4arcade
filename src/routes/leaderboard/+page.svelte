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

<div class="min-h-screen bg-zinc-950 text-zinc-100">
  <div class="mx-auto max-w-5xl px-4 py-8">
    <header class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Seasonal Leaderboards</h1>
        {#if currentSeason}
          <p class="mt-1 text-sm text-zinc-400">
            {currentSeason.label}
            {#if currentSeason.status === 'active'}
              <span class="ml-2 rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Active</span>
            {:else}
              <span class="ml-2 rounded bg-zinc-700/40 px-2 py-0.5 text-xs text-zinc-300">Archived</span>
            {/if}
          </p>
        {/if}
      </div>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-zinc-400">Season</span>
        <select
          bind:value={selectedSeasonId}
          disabled={loadingSeasons || seasons.length === 0}
          class="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-zinc-600 focus:outline-none"
        >
          {#each seasons as s (s.id)}
            <option value={s.id}>{s.label}{s.status === 'active' ? ' (active)' : ''}</option>
          {/each}
        </select>
      </label>
    </header>

    <nav class="mb-5 -mx-4 overflow-x-auto px-4">
      <div class="flex gap-2 whitespace-nowrap">
        {#each METRICS as m (m.key)}
          <button
            type="button"
            onclick={() => (selectedMetric = m.key)}
            class={`rounded-full border px-3 py-1.5 text-sm transition ${
              selectedMetric === m.key
                ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700 hover:text-zinc-100'
            }`}
          >
            {m.label}
          </button>
        {/each}
      </div>
    </nav>

    <section class="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div class="border-b border-zinc-800 px-4 py-3 text-sm font-medium text-zinc-300">
        Top 10 · {metricLabel(selectedMetric)}
      </div>

      {#if loadingEntries}
        <div class="px-4 py-10 text-center text-sm text-zinc-500">Loading...</div>
      {:else if entries.length === 0}
        <div class="px-4 py-10 text-center text-sm text-zinc-500">{emptyMessage(selectedMetric)}</div>
      {:else}
        <ul class="divide-y divide-zinc-800">
          {#each entries as e (e.player_id)}
            {@const isMe = currentUserId && e.player_id === currentUserId}
            <li
              class={`flex items-center gap-3 px-4 py-3 ${
                isMe ? 'bg-emerald-500/10' : ''
              }`}
            >
              <span class="w-8 text-right text-sm font-semibold text-zinc-400">{e.rank}</span>
              {#if e.avatar}
                <img src={e.avatar} alt="" class="h-8 w-8 rounded-full border border-zinc-700 object-cover" />
              {:else}
                <span class="grid h-8 w-8 place-items-center rounded-full border border-zinc-700 bg-zinc-800 text-xs text-zinc-300">
                  {e.display_name.slice(0, 1).toUpperCase()}
                </span>
              {/if}
              <span class="flex-1 truncate text-sm text-zinc-100">
                {e.display_name}
                {#if isMe}<span class="ml-2 text-xs text-emerald-300">(you)</span>{/if}
              </span>
              <span class="text-sm font-semibold tabular-nums text-zinc-100">
                {formatValue(selectedMetric, e.value)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50">
      <button
        type="button"
        onclick={() => (showWinners = !showWinners)}
        class="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-800/40"
      >
        <span>Past season winners</span>
        <span class="text-zinc-500">{showWinners ? '−' : '+'}</span>
      </button>

      {#if showWinners}
        <div class="border-t border-zinc-800 px-4 py-4">
          {#if loadingWinners}
            <div class="py-6 text-center text-sm text-zinc-500">Loading...</div>
          {:else if winners.length === 0}
            <div class="py-6 text-center text-sm text-zinc-500">No archived winners for this season yet.</div>
          {:else}
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th class="py-2">Metric</th>
                  <th class="py-2">Rank</th>
                  <th class="py-2">Player</th>
                  <th class="py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each winners as w (w.metric + '-' + w.rank)}
                  <tr>
                    <td class="py-2 text-zinc-300">{metricLabel(w.metric)}</td>
                    <td class="py-2 text-zinc-300">#{w.rank}</td>
                    <td class="py-2">
                      <span class="flex items-center gap-2">
                        {#if w.avatar}
                          <img src={w.avatar} alt="" class="h-6 w-6 rounded-full border border-zinc-700 object-cover" />
                        {/if}
                        <span class="text-zinc-100">{w.display_name}</span>
                      </span>
                    </td>
                    <td class="py-2 text-right font-semibold tabular-nums text-zinc-100">
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
