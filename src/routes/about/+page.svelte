<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  let stats = $derived(data.stats)

  const liveUrl = 'https://arcade.nickwfraser.dev'
  const githubUrl = 'https://github.com/nickwfraser' // TODO: replace with real repo URL
  const emailHref = 'mailto:nickwfraser@gmail.com'

  const featuredGames = [
    {
      title: 'Impostor',
      glyph: '?',
      pitch: 'Social deduction. One player gets the word, one gets a vague hint. Hints, votes, and a reveal in under five minutes.',
      tags: ['Durable Object', 'WebSocket', 'D1'],
      href: '/impostor',
    },
    {
      title: "Texas Hold'em",
      glyph: '♠',
      pitch: 'Real-money-feeling poker without the money. Side pots, all-ins, persistent chip balances, and bots good enough to bluff.',
      tags: ['Pure functions', 'Hand eval', 'Side pots'],
      href: '/poker',
    },
    {
      title: 'Wolton Dungeon',
      glyph: '⚔',
      pitch: 'A 9-zone idle RPG bolted onto the platform. ~6,400 lines of game logic, offline patrols, prestige loops, procedural audio.',
      tags: ['Idle systems', 'Crafting', 'Web Audio'],
      href: '/dungeon',
    },
    {
      title: "Liar's Dice",
      glyph: '⚂',
      pitch: 'Bluffing dice for 2 to 6 players, with bots and a strict rules engine that mirrors the wikiHow common-hand variant.',
      tags: ['Bots', 'Rules engine', 'Tested'],
      href: '/liars-dice',
    },
  ]

  const highlights = [
    {
      title: 'Real-time at the edge',
      body: 'Each room is a Durable Object using the WebSocket Hibernation API. Idle lobbies cost nothing to keep alive, and single-writer semantics remove whole categories of race bugs.',
      file: 'worker/cards/cardRoom.ts',
    },
    {
      title: 'Snap race resolution',
      body: 'Two phones tap "snap" at the same instant. The winner is decided server-side inside the SnapRoom DO so client clock skew never matters.',
      file: 'worker/snap/room.ts',
    },
    {
      title: 'Poker side pots',
      body: 'Hand evaluator and pot calculator are pure, unit-tested functions kept separate from DO state. Royal flush down to high card, with correct side-pot splits for all-in scenarios.',
      file: 'worker/poker/handEvaluator.ts',
    },
    {
      title: 'Reconnection without lost turns',
      body: 'Players get 45 seconds to reconnect via session or guest ID. Host migration promotes the next connected player automatically. The lobby only dissolves when no one is left.',
      file: 'worker/impostor/room.ts',
    },
    {
      title: 'Custom worker patching',
      body: 'A post-build script rewrites the adapter-cloudflare worker to add DO exports, the WebSocket upgrade handler, guest auth, and a 301 from the legacy workers.dev hostname. It survives every rebuild.',
      file: 'scripts/patch-worker.ts',
    },
    {
      title: 'Two-tier cosmetic rewards',
      body: '7 hero milestones and 18 minor levels with idempotent grants via ON CONFLICT DO NOTHING. Frames, emblems, name colours, and titles render across all 7 game DOs.',
      file: 'src/lib/cosmetics/tintSpec.ts',
    },
  ]

  const stack = [
    { label: 'SvelteKit 5', note: 'runes mode' },
    { label: 'TypeScript', note: 'strict' },
    { label: 'Cloudflare Workers', note: 'edge runtime' },
    { label: 'Durable Objects', note: 'Hibernation API' },
    { label: 'D1', note: 'SQLite at the edge' },
    { label: 'Web Crypto', note: 'PBKDF2 auth' },
    { label: 'Bun', note: 'package + tests' },
    { label: 'Vite', note: 'build' },
  ]

  const milestones = [
    { date: 'Apr 2026', title: 'Cosmetic loadouts and reward ladder', body: 'Two-tier hero + minor cosmetics, name colours, frame tints, idempotent grants.' },
    { date: 'Apr 2026', title: "Liar's Dice + casino games", body: 'Liar’s Dice, Blackjack, Baccarat, and Roulette added under a shared casino lane.' },
    { date: 'Apr 2026', title: 'Wolton Dungeon', body: 'Full idle RPG on a /dungeon route. 9 zones, prestige loop, leaderboard, procedural Web Audio.' },
    { date: 'Apr 2026', title: 'Chip economy + XP progression', body: 'Persistent chips, daily and hourly claims, XP curve, level badges, profile stats.' },
    { date: 'Mar 2026', title: 'Multi-game platform pivot', body: 'Refactored from a single Impostor app into a hub with 7+ games sharing one auth, lobby flow, and DO base class.' },
    { date: '2026', title: 'First playable Impostor build', body: 'SvelteKit + Cloudflare DOs, 4-letter rooms, guest mode, voice and text hints.' },
  ]

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
    return String(n)
  }

  function fmtSince(t: number | null): string {
    if (!t) return '—'
    const d = new Date(t * 1000)
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }

  let liveStats = $derived([
    { value: fmt(stats.users),            label: 'Registered players' },
    { value: fmt(stats.gamesPlayed),      label: 'Games played' },
    { value: fmt(stats.badgesEarned),     label: 'Badges earned' },
    { value: fmt(stats.chipsCirculating), label: 'Chips in circulation' },
  ])
</script>

<svelte:head>
  <title>About / Case Study | nfras4arcade</title>
  <meta name="description" content="Case study for nfras4arcade, a real-time multiplayer party platform built on SvelteKit and Cloudflare's edge stack." />
</svelte:head>

<div class="page">
  <div class="content">

    <!-- Hero -->
    <header class="hero">
      <p class="eyebrow">Case study</p>
      <h1 class="title geo-title">nfras4arcade</h1>
      <p class="lede">
        I'm Nick. I built a real-time multiplayer party platform with 12+ games,
        a chip economy, cosmetic loadouts, and a full idle RPG. It runs on
        Cloudflare's edge with no servers to babysit. Friends play it weekly.
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="/">
          Play it
          <span aria-hidden="true">→</span>
        </a>
        <a class="btn" href={githubUrl} target="_blank" rel="noopener">
          Source
          <span aria-hidden="true">↗</span>
        </a>
        <a class="btn btn-ghost" href={emailHref}>
          Hire me
        </a>
      </div>
      {#if stats.runningSince}
        <p class="hero-meta">
          Live at <a class="hero-meta-link" href={liveUrl}>arcade.nickwfraser.dev</a>
          <span class="dot" aria-hidden="true">•</span>
          Running since {fmtSince(stats.runningSince)}
        </p>
      {/if}
    </header>

    <!-- Live stats from D1 -->
    <section class="stats" aria-label="Live platform stats">
      {#each liveStats as s}
        <div class="stat">
          <div class="stat-value geo-title">{s.value}</div>
          <div class="stat-label">{s.label}</div>
        </div>
      {/each}
    </section>

    <!-- Featured games (Derek-style project grid) -->
    <section class="block">
      <h2 class="h2 geo-title">Featured games</h2>
      <div class="game-grid">
        {#each featuredGames as g}
          <a class="game-card" href={g.href}>
            <div class="game-glyph geo-title" aria-hidden="true">{g.glyph}</div>
            <div class="game-body">
              <h3 class="game-title">{g.title}</h3>
              <p class="game-pitch">{g.pitch}</p>
              <div class="game-tags">
                {#each g.tags as t}
                  <span class="game-tag">{t}</span>
                {/each}
              </div>
            </div>
            <span class="game-arrow" aria-hidden="true">→</span>
          </a>
        {/each}
      </div>
    </section>

    <!-- The build (engineering highlights) -->
    <section class="block">
      <h2 class="h2 geo-title">The build</h2>
      <p class="body">
        A few of the engineering problems I actually had to solve. Each one
        links to the file in the repo.
      </p>
      <div class="highlight-grid">
        {#each highlights as h}
          <article class="highlight">
            <h3 class="highlight-title">{h.title}</h3>
            <p class="highlight-body">{h.body}</p>
            <code class="highlight-file">{h.file}</code>
          </article>
        {/each}
      </div>
    </section>

    <!-- Stack -->
    <section class="block">
      <h2 class="h2 geo-title">Stack</h2>
      <div class="stack-grid">
        {#each stack as s}
          <div class="chip">
            <span class="chip-label">{s.label}</span>
            <span class="chip-note">{s.note}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- Timeline -->
    <section class="block">
      <h2 class="h2 geo-title">Timeline</h2>
      <ol class="timeline">
        {#each milestones as m}
          <li class="t-item">
            <div class="t-date">{m.date}</div>
            <div class="t-body">
              <div class="t-title">{m.title}</div>
              <div class="t-text">{m.body}</div>
            </div>
          </li>
        {/each}
      </ol>
    </section>

    <!-- About me -->
    <section class="block">
      <h2 class="h2 geo-title">About me</h2>
      <p class="body">
        Nick Fraser. I designed, built, and ship this whole thing solo:
        product, design, frontend, backend, infra, ops. If you're hiring for
        full-stack or platform roles, the codebase is the most honest signal
        of how I work.
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href={emailHref}>Email me</a>
        <a class="btn" href={githubUrl} target="_blank" rel="noopener">
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>

  </div>
</div>

<style>
  .page {
    min-height: 100dvh;
    padding: 5rem 1.25rem 5rem;
    display: flex;
    justify-content: center;
  }

  .content {
    width: 100%;
    max-width: 760px;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  /* ── Hero ─────────────────────────────────────────────── */
  .hero {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .eyebrow {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0;
  }

  .title {
    font-size: clamp(2.25rem, 8vw, 3.75rem);
    font-weight: 700;
    letter-spacing: 0.1em;
    line-height: 1;
    margin: 0;
    background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 60%, var(--accent-dim) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .lede {
    font-size: 1.05rem;
    line-height: 1.6;
    color: var(--text);
    max-width: 60ch;
    margin: 0.25rem 0 0.5rem;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin-top: 0.5rem;
  }

  .hero-meta {
    margin: 0.75rem 0 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .hero-meta-link {
    color: var(--accent);
    text-decoration: none;
  }

  .hero-meta-link:hover { color: var(--accent-hover); }

  .dot { margin: 0 0.5rem; opacity: 0.5; }

  .btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.7rem 1rem;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 2px;
    text-decoration: none;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s, transform 0.1s;
  }

  .btn:hover {
    color: var(--accent);
    border-color: var(--accent-border);
    transform: translateY(-1px);
  }

  .btn-primary {
    background: var(--accent);
    color: var(--bg);
    border-color: var(--accent);
  }

  .btn-primary:hover {
    color: var(--bg);
    opacity: 0.9;
  }

  .btn-ghost { color: var(--text-muted); }

  /* ── Stats strip ──────────────────────────────────────── */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
  }

  .stat {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent);
    padding: 1rem 0.85rem;
    text-align: center;
  }

  .stat-value {
    font-size: 1.7rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.04em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    margin-top: 0.45rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  @media (max-width: 540px) {
    .stats { grid-template-columns: repeat(2, 1fr); }
  }

  /* ── Block / sections ─────────────────────────────────── */
  .block {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .h2 {
    font-size: 1rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .body {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--text);
    max-width: 65ch;
    margin: 0;
  }

  /* ── Featured games ──────────────────────────────────── */
  .game-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.85rem;
  }

  .game-card {
    position: relative;
    display: flex;
    gap: 1rem;
    padding: 1rem 1.1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s, transform 0.15s, background 0.15s;
    overflow: hidden;
  }

  .game-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent) 0%, transparent 70%);
    opacity: 0.6;
  }

  .game-card:hover {
    border-color: var(--accent-border);
    background: var(--bg-hover);
    transform: translateY(-2px);
  }

  .game-glyph {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    color: var(--accent);
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
  }

  .game-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .game-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
    margin: 0;
  }

  .game-pitch {
    font-size: 0.82rem;
    line-height: 1.5;
    color: var(--text-muted);
    margin: 0;
  }

  .game-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    margin-top: 0.2rem;
  }

  .game-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--accent-border);
    background: var(--accent-faint);
    border-radius: 2px;
  }

  .game-arrow {
    align-self: flex-start;
    color: var(--accent);
    opacity: 0.5;
    font-size: 1rem;
    transition: opacity 0.15s, transform 0.15s;
  }

  .game-card:hover .game-arrow {
    opacity: 1;
    transform: translateX(3px);
  }

  @media (max-width: 540px) {
    .game-grid { grid-template-columns: 1fr; }
  }

  /* ── Highlights ──────────────────────────────────────── */
  .highlight-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0.85rem;
  }

  .highlight {
    background: var(--bg-card);
    border: 1px solid var(--border);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .highlight:hover { border-color: var(--accent-border); }

  .highlight-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--accent);
    margin: 0;
  }

  .highlight-body {
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--text);
    margin: 0;
  }

  .highlight-file {
    font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, Menlo, monospace;
    font-size: 0.72rem;
    color: var(--text-muted);
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 0.2rem 0.45rem;
    border-radius: 2px;
    align-self: flex-start;
  }

  /* ── Stack chips ──────────────────────────────────────── */
  .stack-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 0.6rem;
  }

  .chip {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.6rem 0.85rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent);
  }

  .chip-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
  }

  .chip-note {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  /* ── Timeline ────────────────────────────────────────── */
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    border-left: 1px solid var(--border);
    padding-left: 1.1rem;
  }

  .t-item {
    position: relative;
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 1rem;
    align-items: baseline;
  }

  .t-item::before {
    content: '';
    position: absolute;
    left: -1.45rem;
    top: 0.55rem;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--bg);
  }

  .t-date {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .t-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.2rem;
  }

  .t-text {
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  @media (max-width: 540px) {
    .t-item {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
