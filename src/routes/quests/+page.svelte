<script lang="ts">
  import { isLoggedIn, userStats, fetchUser } from '$lib/auth';
  import { goto } from '$app/navigation';

  interface DailyQuest {
    slot: number;
    id: string;
    title: string;
    description: string;
    objective_type: string;
    objective_target: number;
    objective_arg: string | null;
    progress: number;
    claimed: boolean;
    reward_chips: number;
    reward_xp: number;
  }

  let quests = $state<DailyQuest[]>([]);
  let loading = $state(true);
  let claiming = $state<number | null>(null);
  let resetAt = $state(0);
  let countdown = $state('');
  let initialized = $state(false);

  $effect(() => {
    if (!initialized) {
      initialized = true;
      fetchUser().finally(() => {
        if (!$isLoggedIn) {
          loading = false;
          return;
        }
        loadQuests();
      });
    }
  });

  async function loadQuests() {
    loading = true;
    try {
      const res = await fetch('/api/quests/today');
      if (!res.ok) {
        quests = [];
        return;
      }
      const data = (await res.json()) as { quests?: DailyQuest[]; reset_at?: number };
      quests = data.quests ?? [];
      resetAt = data.reset_at ?? 0;
    } catch {
      quests = [];
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (resetAt > 0) {
      const target = resetAt * 1000;
      const tick = () => {
        const remaining = target - Date.now();
        if (remaining <= 0) {
          countdown = 'Resetting...';
          return;
        }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        countdown = `Resets in ${h}h ${m}m`;
      };
      tick();
      const id = setInterval(tick, 30000);
      return () => clearInterval(id);
    }
  });

  async function claim(slot: number) {
    claiming = slot;
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        new_chips?: number;
        new_xp?: number;
      };
      if (data.success) {
        quests = quests.map((q) => (q.slot === slot ? { ...q, claimed: true } : q));
        if (typeof data.new_chips === 'number' && typeof data.new_xp === 'number') {
          userStats.update((s) =>
            s ? { ...s, chips: data.new_chips!, xp: data.new_xp! } : s
          );
        }
      }
    } catch {}
    claiming = null;
  }

  function pct(q: DailyQuest): number {
    if (q.objective_target <= 0) return 0;
    return Math.min(100, Math.round((q.progress / q.objective_target) * 100));
  }
</script>

<svelte:head>
  <title>Daily Quests · Monkey Barrel</title>
</svelte:head>

<div class="page">
  <header class="hero">
    <h1 class="heading">Daily Quests</h1>
    {#if countdown}
      <span class="reset-pill">{countdown}</span>
    {/if}
  </header>

  {#if loading}
    <p class="muted">Loading quests...</p>
  {:else if !$isLoggedIn}
    <div class="auth-prompt">
      <p>Sign in to track daily quests</p>
      <button class="btn btn-primary" onclick={() => goto('/login')}>Log In</button>
    </div>
  {:else if quests.length === 0}
    <p class="muted">No quests available right now.</p>
  {:else}
    <p class="lede">
      Three rotating challenges each day. Complete them for chips and XP. Resets at midnight UTC.
    </p>

    <ul class="quest-list">
      {#each quests as q (q.slot)}
        {@const progressPct = pct(q)}
        {@const ready = q.progress >= q.objective_target && !q.claimed}
        <li class="quest-card" class:quest-claimed={q.claimed} class:quest-ready={ready}>
          <div class="quest-head">
            <span class="quest-slot">Quest {q.slot + 1}</span>
            <span class="quest-reward">+{q.reward_chips} chips · +{q.reward_xp} XP</span>
          </div>
          <h2 class="quest-title">{q.title}</h2>
          <p class="quest-desc">{q.description}</p>

          <div class="progress-track">
            <div class="progress-fill" style="width: {progressPct}%"></div>
          </div>
          <div class="progress-row">
            <span class="progress-count">
              {Math.min(q.progress, q.objective_target)} / {q.objective_target}
            </span>
            <span class="progress-pct">{progressPct}%</span>
          </div>

          <div class="quest-action">
            {#if q.claimed}
              <span class="claimed-tag">Claimed</span>
            {:else if ready}
              <button
                class="btn btn-primary"
                disabled={claiming === q.slot}
                onclick={() => claim(q.slot)}
              >
                {claiming === q.slot ? 'Claiming...' : 'Claim reward'}
              </button>
            {:else}
              <span class="in-progress">In progress</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .page {
    max-width: 720px;
    margin: 0 auto;
    padding: 5rem 1.25rem 4rem;
    color: var(--text);
    position: relative;
    z-index: 1;
  }

  .hero {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .heading {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0;
    color: var(--casino);
    text-shadow: 0 0 18px var(--casino-glow);
  }

  .reset-pill {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--casino);
    background: var(--casino-faint);
    border: 1px solid var(--casino-border-soft);
    border-radius: 2px;
    padding: 0.35rem 0.65rem;
  }

  .lede {
    color: var(--text-muted);
    font-size: 0.9rem;
    margin: 0 0 1.5rem;
    max-width: 540px;
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .auth-prompt {
    text-align: center;
    padding: 2.5rem 1.25rem;
    background: var(--bg-card);
    border: 1px solid var(--casino-border-soft);
    border-radius: 4px;
  }
  .auth-prompt p {
    margin: 0 0 1rem;
    color: var(--text-muted);
  }

  .quest-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .quest-card {
    background: var(--bg-card);
    border: 1px solid var(--casino-border-soft);
    border-radius: 4px;
    padding: 1.1rem 1.25rem;
    position: relative;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .quest-card.quest-ready {
    border-color: var(--casino);
    box-shadow: 0 0 18px var(--casino-glow);
  }

  .quest-card.quest-claimed {
    opacity: 0.55;
  }

  .quest-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }
  .quest-slot {
    color: var(--text-subtle);
  }
  .quest-reward {
    color: var(--casino);
  }

  .quest-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.05rem;
    font-weight: 700;
    margin: 0 0 0.2rem;
    color: var(--text);
    letter-spacing: 0.02em;
  }

  .quest-desc {
    margin: 0 0 0.8rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .progress-track {
    background: var(--bg-input);
    border: 1px solid var(--border-bright);
    border-radius: 2px;
    height: 8px;
    overflow: hidden;
    margin-bottom: 0.35rem;
  }
  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--casino) 0%, var(--casino-hover) 100%);
    transition: width 0.3s ease;
  }
  .quest-claimed .progress-fill {
    background: var(--text-subtle);
  }

  .progress-row {
    display: flex;
    justify-content: space-between;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.9rem;
  }

  .quest-action {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    min-height: 32px;
  }

  .claimed-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }
  .in-progress {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 0.5rem 1rem;
    border-radius: 2px;
    border: 1px solid var(--casino-border-soft);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .btn-primary {
    background: var(--casino);
    color: var(--btn-primary-text, #0c0e10);
    border-color: var(--casino);
  }
  .btn-primary:hover:not(:disabled) {
    background: var(--casino-hover);
    border-color: var(--casino-hover);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (max-width: 520px) {
    .hero { flex-direction: column; align-items: flex-start; gap: 0.6rem; }
    .quest-card { padding: 0.9rem 1rem; }
  }
</style>
