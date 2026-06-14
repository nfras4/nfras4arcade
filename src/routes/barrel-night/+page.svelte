<script lang="ts">
  import { isLoggedIn } from '$lib/auth';

  interface Status {
    serverNow: number;
    nextStartIso: string;
    live: { week: string; code: string } | null;
    lastChampion: { week: string; displayName: string; until: number } | null;
  }

  let status = $state<Status | null>(null);
  let loaded = $state(false);
  // Client clock offset so the countdown stays honest even if the device clock drifts.
  let nowMs = $state(Date.now());

  $effect(() => {
    fetch('/api/barrel-night/status')
      .then((r) => r.json() as Promise<Status>)
      .then((d) => {
        status = d;
        loaded = true;
      })
      .catch(() => {
        loaded = true;
      });
  });

  $effect(() => {
    const t = setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => clearInterval(t);
  });

  const msUntil = $derived(status ? Math.max(0, Date.parse(status.nextStartIso) - nowMs) : 0);
  const countdown = $derived.by(() => {
    let s = Math.floor(msUntil / 1000);
    const d = Math.floor(s / 86400);
    s -= d * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    s -= m * 60;
    return { d, h, m, s };
  });

  const champUntilLabel = $derived.by(() => {
    if (!status?.lastChampion) return '';
    const until = status.lastChampion.until * 1000;
    if (until <= nowMs) return 'reign ended';
    const date = new Date(until);
    return `crown until ${date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  });
</script>

<svelte:head>
  <title>Barrel Night | nfras4arcade</title>
</svelte:head>

<div class="bn-page">
  <header class="bn-hero">
    <span class="bn-crown" aria-hidden="true">👑</span>
    <h1 class="geo-title">Barrel Night</h1>
    <p class="bn-tagline">Every Sunday, one monkey wins a crown nobody can buy.</p>
  </header>

  {#if status?.live}
    <section class="bn-live card" aria-live="polite">
      <span class="bn-live-badge">LIVE NOW</span>
      <p class="bn-live-text">The table is open. Last monkey standing takes the crown.</p>
      <a class="btn-primary bn-seat" href={`/liars-dice/${status.live.code}`}>Take a seat</a>
      {#if !$isLoggedIn}
        <p class="bn-note">Playing as a guest is fine, but the crown only goes to a signed-in player. <a href="/login">Log in</a></p>
      {/if}
    </section>
  {:else}
    <section class="bn-countdown card">
      <span class="bn-countdown-label">Next Barrel Night</span>
      {#if loaded && status}
        <div class="bn-clock" role="timer">
          <div class="bn-unit"><span class="bn-num">{countdown.d}</span><span class="bn-cap">days</span></div>
          <div class="bn-unit"><span class="bn-num">{countdown.h}</span><span class="bn-cap">hrs</span></div>
          <div class="bn-unit"><span class="bn-num">{countdown.m}</span><span class="bn-cap">min</span></div>
          <div class="bn-unit"><span class="bn-num">{countdown.s}</span><span class="bn-cap">sec</span></div>
        </div>
        <span class="bn-when">Sundays · 7:00pm AEST</span>
      {:else}
        <span class="bn-when">Loading…</span>
      {/if}
    </section>
  {/if}

  <section class="bn-champion card">
    <h2 class="bn-section-title">Reigning champion</h2>
    {#if status?.lastChampion}
      <div class="bn-champ-row">
        <span class="bn-champ-crown" aria-hidden="true">👑</span>
        <div class="bn-champ-info">
          <span class="bn-champ-name">{status.lastChampion.displayName}</span>
          <span class="bn-champ-sub">{champUntilLabel}</span>
        </div>
      </div>
    {:else}
      <p class="bn-empty">No champion yet. The first crown is up for grabs.</p>
    {/if}
  </section>

  <section class="bn-how card">
    <h2 class="bn-section-title">How it works</h2>
    <ol class="bn-steps">
      <li>Show up Sunday at 7pm. One liar's dice table, bots fill the empty seats.</li>
      <li>Bluff, bid, and call. Lose all your dice and you're out.</li>
      <li>Last player standing wears the crown for a week, on every monkey, everywhere.</li>
    </ol>
    <a class="bn-link" href="/liars-dice">New to liar's dice? Learn the rules →</a>
  </section>
</div>

<style>
  .bn-page {
    max-width: 560px;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .bn-hero {
    text-align: center;
    padding: 1rem 0 0.5rem;
  }
  .bn-crown {
    font-size: 2.75rem;
    display: block;
    line-height: 1;
  }
  .bn-hero h1 {
    font-size: 2rem;
    margin: 0.4rem 0 0.25rem;
    color: var(--gold, #e8b84b);
  }
  .bn-tagline {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.95rem;
  }

  .card {
    background: var(--bg-elevated, var(--bg-input, #181b22));
    border: 1px solid var(--border, #2a2f3a);
    border-radius: 10px;
    padding: 1.25rem;
  }

  .bn-live {
    text-align: center;
    border-color: var(--gold, #e8b84b);
  }
  .bn-live-badge {
    display: inline-block;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: 0.12em;
    font-size: 0.8rem;
    color: #1a1206;
    background: var(--gold, #e8b84b);
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
  }
  .bn-live-text {
    margin: 0.75rem 0 1rem;
    color: var(--text);
  }
  .bn-seat {
    display: inline-block;
    text-decoration: none;
    padding: 0.7rem 1.6rem;
  }
  .bn-note {
    margin: 0.9rem 0 0;
    font-size: 0.82rem;
    color: var(--text-muted);
  }
  .bn-note a, .bn-link { color: var(--accent, #6cb482); }

  .bn-countdown {
    text-align: center;
  }
  .bn-countdown-label {
    display: block;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.9rem;
  }
  .bn-clock {
    display: flex;
    justify-content: center;
    gap: 1.1rem;
  }
  .bn-unit {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 3rem;
  }
  .bn-num {
    font-size: 2rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--gold, #e8b84b);
    line-height: 1;
  }
  .bn-cap {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-top: 0.3rem;
  }
  .bn-when {
    display: block;
    margin-top: 1rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .bn-section-title {
    font-size: 0.95rem;
    margin: 0 0 0.75rem;
  }
  .bn-champ-row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }
  .bn-champ-crown { font-size: 1.8rem; line-height: 1; }
  .bn-champ-info { display: flex; flex-direction: column; }
  .bn-champ-name { font-weight: 700; font-size: 1.1rem; color: var(--gold, #e8b84b); }
  .bn-champ-sub { font-size: 0.8rem; color: var(--text-muted); }
  .bn-empty { margin: 0; color: var(--text-muted); font-size: 0.9rem; }

  .bn-steps {
    margin: 0 0 0.9rem;
    padding-left: 1.2rem;
    color: var(--text);
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .bn-steps li { margin: 0.2rem 0; }
  .bn-link { text-decoration: none; font-size: 0.88rem; font-weight: 600; }
  .bn-link:hover { text-decoration: underline; }
</style>
