<script lang="ts">
  import { goto } from '$app/navigation'

  type Props = { data: {
    leaderboard: null | {
      zone:    { player_name: string; highest_zone: number; highest_stage: number }[]
      prestige: { player_name: string; prestige_tokens: number }[]
      level:   { player_name: string; player_level: number }[]
    }
    chipLeaderboard: null | {
      chips: { display_name: string; chips: number }[]
      wins:  { display_name: string; biggest_win: number; biggest_win_game: string | null }[]
    }
  }}

  let { data }: Props = $props()

  let lbData = $state(data.leaderboard)
  let chipLb = $state(data.chipLeaderboard)

  // Refresh leaderboards every 2 minutes
  $effect(() => {
    const id = setInterval(async () => {
      try {
        const [zone, prestige, level, chips, wins] = await Promise.all([
          fetch('/api/dungeon/leaderboard?sort=zone&limit=5').then(r => r.json()),
          fetch('/api/dungeon/leaderboard?sort=prestige&limit=5').then(r => r.json()),
          fetch('/api/dungeon/leaderboard?sort=level&limit=5').then(r => r.json()),
          fetch('/api/leaderboard/chips?sort=chips&limit=5').then(r => r.json()),
          fetch('/api/leaderboard/chips?sort=biggest_win&limit=5').then(r => r.json()),
        ])
        lbData = {
          zone:    zone.entries?.slice(0, 5).map((e: any) => ({
            player_name: e.playerName, highest_zone: e.highestZone, highest_stage: e.highestStage,
          })) ?? [],
          prestige: prestige.entries?.slice(0, 5).map((e: any) => ({
            player_name: e.playerName, prestige_tokens: e.prestigeTokens,
          })) ?? [],
          level:   level.entries?.slice(0, 5).map((e: any) => ({
            player_name: e.playerName, player_level: e.playerLevel,
          })) ?? [],
        }
        chipLb = {
          chips: chips.entries?.slice(0, 5).map((e: any) => ({
            display_name: e.playerName, chips: e.chips,
          })) ?? [],
          wins:  wins.entries?.slice(0, 5).map((e: any) => ({
            display_name: e.playerName, biggest_win: e.biggestWin, biggest_win_game: e.game,
          })) ?? [],
        }
      } catch { /* keep showing existing data */ }
    }, 120_000)
    return () => clearInterval(id)
  })

  function fmtChips(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
    return String(n)
  }
</script>

<div class="hub">
  <div class="hub-content">

    <header class="hub-hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">nfras4arcade</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Choose your arena</p>
    </header>

    <nav class="category-grid" aria-label="Game categories">

      <!-- Party Games -->
      <button
        class="category-card"
        onclick={() => goto('/games')}
        aria-label="Party Games – 6 games"
      >
        <div class="cat-glyph party-glyph" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="12" cy="13" r="5"/>
            <circle cx="28" cy="13" r="5"/>
            <circle cx="20" cy="28" r="5"/>
            <line x1="17" y1="13" x2="23" y2="13"/>
            <line x1="14.5" y1="17.5" x2="17" y2="24"/>
            <line x1="25.5" y1="17.5" x2="23" y2="24"/>
          </svg>
        </div>
        <div class="cat-text">
          <h2 class="cat-title geo-title">Party Games</h2>
          <p class="cat-desc">Impostor, Wavelength, Snap & more</p>
          <p class="cat-count geo-title">6 Games</p>
        </div>
        <span class="cat-arrow party-arrow" aria-hidden="true">→</span>
        <div class="card-shine" aria-hidden="true"></div>
      </button>

      <!-- Casino -->
      <button
        class="category-card casino-card"
        onclick={() => goto('/casino')}
        aria-label="Casino – 5 games"
      >
        <div class="cat-glyph casino-glyph" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="28" height="28" fill="currentColor" aria-hidden="true">
            <path d="M20 6c-3.2 4.4-9 9-9 14.4 0 3.3 2.5 5.8 5.5 5.8 1.6 0 2.9-.7 3.5-1.8L18 32h4l-2-7.6c.6 1.1 1.9 1.8 3.5 1.8 3 0 5.5-2.5 5.5-5.8 0-5.4-5.8-10-9-14.4z"/>
          </svg>
        </div>
        <div class="cat-text">
          <h2 class="cat-title geo-title">Casino</h2>
          <p class="cat-desc">Poker, Blackjack, Roulette & more</p>
          <p class="cat-count geo-title casino-count">5 Games</p>
        </div>
        <span class="cat-arrow casino-arrow" aria-hidden="true">→</span>
        <div class="card-shine" aria-hidden="true"></div>
      </button>

      <!-- RPG – Wolton Dungeon -->
      <button
        class="category-card rpg-card"
        onclick={() => goto('/dungeon')}
        aria-label="RPG – The Dungeon"
      >
        <div class="cat-glyph rpg-glyph" aria-hidden="true">
          <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="8" y1="32" x2="28" y2="12"/>
            <line x1="24" y1="8" x2="32" y2="16"/>
            <line x1="24" y1="8" x2="26" y2="6"/>
            <line x1="32" y1="16" x2="34" y2="14"/>
            <line x1="6" y1="34" x2="10" y2="30"/>
          </svg>
        </div>
        <div class="cat-text">
          <h2 class="cat-title geo-title">RPG</h2>
          <p class="cat-desc">Quests, dungeons, and adventure</p>
          <p class="cat-count geo-title">The Dungeon</p>
        </div>
        <span class="cat-arrow rpg-arrow" aria-hidden="true">→</span>
        <div class="card-shine" aria-hidden="true"></div>
      </button>

    </nav>

    <!-- Dungeon Leaderboard Widget -->
    {#if lbData}
      <section class="lb-widget" aria-label="The Dungeon leaderboard">
        <div class="lb-widget-hdr">
          <span class="lb-widget-title">THE DUNGEON — TOP PLAYERS</span>
          <a href="/dungeon" class="lb-play-link">PLAY NOW →</a>
        </div>
        <div class="lb-cols">
          <div class="lb-col">
            <div class="lb-col-title">DEEPEST ZONE</div>
            {#each lbData.zone as row, i}
              <div class="lb-row">
                <span class="lb-pos lb-pos-{i + 1}">{i + 1}</span>
                <span class="lb-pname">{row.player_name}</span>
                <span class="lb-val">Zone {row.highest_zone + 1} S{row.highest_stage}</span>
              </div>
            {:else}
              <div class="lb-empty">No entries yet</div>
            {/each}
          </div>
          <div class="lb-col">
            <div class="lb-col-title">MOST PRESTIGE</div>
            {#each lbData.prestige as row, i}
              <div class="lb-row">
                <span class="lb-pos lb-pos-{i + 1}">{i + 1}</span>
                <span class="lb-pname">{row.player_name}</span>
                <span class="lb-val">
                  <svg class="lb-val-icon" viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
                    <path d="M13 2 L4 14 h7 L9 22 l9-12 h-7 z"/>
                  </svg>
                  {row.prestige_tokens}
                </span>
              </div>
            {:else}
              <div class="lb-empty">No entries yet</div>
            {/each}
          </div>
          <div class="lb-col">
            <div class="lb-col-title">HIGHEST LEVEL</div>
            {#each lbData.level as row, i}
              <div class="lb-row">
                <span class="lb-pos lb-pos-{i + 1}">{i + 1}</span>
                <span class="lb-pname">{row.player_name}</span>
                <span class="lb-val">LV{row.player_level}</span>
              </div>
            {:else}
              <div class="lb-empty">No entries yet</div>
            {/each}
          </div>
        </div>
      </section>
    {:else}
      <section class="lb-widget" aria-label="The Dungeon leaderboard loading">
        <div class="lb-widget-hdr">
          <span class="lb-widget-title">THE DUNGEON — TOP PLAYERS</span>
          <a href="/dungeon" class="lb-play-link">PLAY NOW →</a>
        </div>
        <div class="lb-cols">
          <div class="lb-col">
            <div class="lb-col-title">DEEPEST ZONE</div>
            <div class="lb-skeleton">
              {#each Array(5) as _}<div class="lb-skeleton-row"></div>{/each}
            </div>
          </div>
          <div class="lb-col">
            <div class="lb-col-title">MOST PRESTIGE</div>
            <div class="lb-skeleton">
              {#each Array(5) as _}<div class="lb-skeleton-row"></div>{/each}
            </div>
          </div>
          <div class="lb-col">
            <div class="lb-col-title">HIGHEST LEVEL</div>
            <div class="lb-skeleton">
              {#each Array(5) as _}<div class="lb-skeleton-row"></div>{/each}
            </div>
          </div>
        </div>
      </section>
    {/if}

    <!-- Chip Leaderboard Widget -->
    {#if chipLb && (chipLb.chips.length > 0 || chipLb.wins.length > 0)}
      <section class="lb-widget chip-widget" aria-label="Arcade chip leaderboard">
        <div class="lb-widget-hdr">
          <span class="lb-widget-title">ARCADE CHIPS — TOP PLAYERS</span>
          <a href="/casino" class="lb-play-link">PLAY NOW →</a>
        </div>
        <div class="lb-cols lb-cols-2">
          <div class="lb-col">
            <div class="lb-col-title">TOP CHIPS</div>
            {#each chipLb.chips as row, i}
              <div class="lb-row">
                <span class="lb-pos lb-pos-{i + 1}">{i + 1}</span>
                <span class="lb-pname">{row.display_name}</span>
                <span class="lb-val">{fmtChips(row.chips)}</span>
              </div>
            {:else}
              <div class="lb-empty">No entries yet</div>
            {/each}
          </div>
          <div class="lb-col">
            <div class="lb-col-title">BIGGEST WINS</div>
            {#each chipLb.wins as row, i}
              <div class="lb-row">
                <span class="lb-pos lb-pos-{i + 1}">{i + 1}</span>
                <span class="lb-pname">{row.display_name}</span>
                <span class="lb-val" title={row.biggest_win_game ?? ''}>
                  +{fmtChips(row.biggest_win)}
                </span>
              </div>
            {:else}
              <div class="lb-empty">No entries yet</div>
            {/each}
          </div>
        </div>
      </section>
    {:else if !chipLb}
      <section class="lb-widget chip-widget" aria-label="Arcade chip leaderboard loading">
        <div class="lb-widget-hdr">
          <span class="lb-widget-title">ARCADE CHIPS — TOP PLAYERS</span>
          <a href="/casino" class="lb-play-link">PLAY NOW →</a>
        </div>
        <div class="lb-cols lb-cols-2">
          <div class="lb-col">
            <div class="lb-col-title">TOP CHIPS</div>
            <div class="lb-skeleton">
              {#each Array(5) as _}<div class="lb-skeleton-row"></div>{/each}
            </div>
          </div>
          <div class="lb-col">
            <div class="lb-col-title">BIGGEST WINS</div>
            <div class="lb-skeleton">
              {#each Array(5) as _}<div class="lb-skeleton-row"></div>{/each}
            </div>
          </div>
        </div>
      </section>
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
    justify-content: center;
    padding: 5rem 1.25rem 4rem;
  }

  .hub-content {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  /* ── Hero ────────────────────────────────────────────── */
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

  /* ── Category grid ───────────────────────────────────── */
  .category-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  /* ── Base card ───────────────────────────────────────── */
  .category-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.75rem 2rem;
    min-height: 130px;
    width: 100%;
    text-align: left;
    background: var(--bg-card);
    border: none;
    font-family: inherit;
    cursor: pointer;
    clip-path: var(--clip-card);
    transition: background 0.15s ease, transform 0.15s ease;
    overflow: hidden;
  }

  /* Border effect – green accent */
  .category-card::before {
    content: '';
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
  }

  .category-card:hover {
    background: var(--bg-hover);
    transform: translateY(-3px);
  }

  /* Subtle top accent stripe */
  .category-card::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--accent) 0%, transparent 70%);
    opacity: 0.6;
  }

  /* ── Casino card overrides ───────────────────────────── */
  .casino-card::before {
    background: linear-gradient(135deg, var(--casino-border), var(--border));
  }

  .casino-card::after {
    background: linear-gradient(90deg, var(--casino) 0%, transparent 70%);
  }

  .casino-card:hover {
    filter: drop-shadow(0 0 12px var(--casino-glow));
  }

  /* ── RPG card ────────────────────────────────────────── */
  .rpg-card::before {
    background: linear-gradient(135deg, var(--rpg-panel-from), var(--rpg-panel-to));
  }

  .rpg-card::after {
    background: linear-gradient(90deg, var(--rpg-faint) 0%, transparent 70%);
  }

  .rpg-card:hover {
    filter: drop-shadow(0 0 12px var(--rpg-glow));
  }

  /* ── Glyph / icon area ───────────────────────────────── */
  .cat-glyph {
    flex-shrink: 0;
    width: 52px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .party-glyph {
    color: var(--accent);
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
  }

  .casino-glyph {
    color: var(--casino);
    background: var(--casino-faint);
    border: 1px solid var(--casino-border-soft);
  }

  .rpg-glyph {
    color: var(--rpg);
    background: var(--rpg-faint);
    border: 1px solid var(--rpg-border);
  }

  .rpg-arrow { color: var(--rpg); }

  .suit-cluster {
    font-size: 2rem;
    line-height: 1;
    display: block;
  }

  /* ── Text block ──────────────────────────────────────── */
  .cat-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .cat-title {
    font-size: 1.5rem;
    letter-spacing: 0.1em;
    color: var(--text);
    line-height: 1;
  }

  .casino-card .cat-title {
    color: var(--text);
  }

  .cat-desc {
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  .cat-count {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    color: var(--accent);
    margin-top: 0.25rem;
  }

  .casino-count {
    color: var(--casino);
  }

  /* ── Arrow ───────────────────────────────────────────── */
  .cat-arrow {
    flex-shrink: 0;
    font-size: 1.25rem;
    color: var(--accent);
    opacity: 0.6;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .casino-arrow {
    color: var(--casino);
  }

  .category-card:hover .cat-arrow {
    opacity: 1;
    transform: translateX(4px);
  }

  /* ── Coming soon badge ───────────────────────────────── */
  .coming-badge {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
    border: 1px solid var(--border-bright);
    border-radius: 2px;
    padding: 0.15rem 0.5rem;
    width: fit-content;
  }

  /* ── Subtle inner shine overlay ──────────────────────── */
  .card-shine {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 60%);
    pointer-events: none;
  }

  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  /* ── Dungeon Leaderboard Widget ──────────────────────── */
  .lb-widget {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
    border: 1px solid var(--border);
    background: var(--bg-card);
    padding: 1.25rem 1.5rem;
  }
  .lb-widget-hdr {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .lb-widget-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .lb-play-link {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--accent);
    text-decoration: none;
    transition: color 0.15s;
  }
  .lb-play-link:hover { color: var(--accent-hover); }
  .lb-cols {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }
  .lb-cols.lb-cols-2 {
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
  }
  .lb-col-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--accent);
    text-transform: uppercase;
    margin-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.25rem;
  }
  .lb-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.2rem 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
  }
  .lb-pos { width: 14px; text-align: right; color: var(--text-subtle); font-weight: 600; }
  .lb-pos-1 { color: #f0c030; }
  .lb-pos-2 { color: #aaa; }
  .lb-pos-3 { color: #c87432; }
  .lb-pname { flex: 1; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lb-val { color: var(--accent); font-weight: 600; font-variant-numeric: tabular-nums; }
  .lb-empty { font-size: 0.75rem; color: var(--text-subtle); font-family: 'Rajdhani', system-ui, sans-serif; }
  .lb-skeleton { display: flex; flex-direction: column; gap: 0.3rem; }
  .lb-skeleton-row { height: 14px; background: linear-gradient(90deg, var(--bg-hover) 0%, var(--bg-input) 50%, var(--bg-hover) 100%); background-size: 200% 100%; animation: shimmer 1.6s linear infinite; border-radius: 2px; }
</style>
