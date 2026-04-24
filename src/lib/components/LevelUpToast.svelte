<script lang="ts">
  interface Reward {
    name: string;
    type: string;
    tier: 'hero' | 'minor';
  }

  interface LevelUpDetail {
    newLevel: number;
    rewards: Reward[];
  }

  let visible = $state(false);
  let newLevel = $state(0);
  let rewards: Reward[] = $state([]);
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function handleLevelUp(event: CustomEvent<LevelUpDetail>) {
    // Clear any pending auto-dismiss
    if (dismissTimer) clearTimeout(dismissTimer);

    newLevel = event.detail.newLevel;
    rewards = event.detail.rewards;
    visible = true;

    dismissTimer = setTimeout(() => {
      visible = false;
    }, 5000);
  }

  function dismiss() {
    if (dismissTimer) clearTimeout(dismissTimer);
    visible = false;
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('levelup', handleLevelUp as EventListener);
    return () => {
      window.removeEventListener('levelup', handleLevelUp as EventListener);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  });
</script>

{#if visible}
  <div class="levelup-toast" role="status" aria-live="polite">
    <button class="levelup-dismiss" onclick={dismiss} aria-label="Dismiss">×</button>
    <div class="levelup-heading">Level {newLevel}!</div>
    {#if rewards.length > 0}
      <div class="levelup-rewards">
        You unlocked:
        <ul class="levelup-list">
          {#each rewards as reward}
            <li class="levelup-item">
              <span class="levelup-tier" class:levelup-tier-hero={reward.tier === 'hero'} class:levelup-tier-minor={reward.tier === 'minor'}>
                {reward.tier === 'hero' ? 'HERO' : 'NEW'}
              </span>
              {reward.name}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .levelup-toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    background: var(--bg-card);
    border: 1px solid rgba(234, 179, 8, 0.5);
    border-radius: 4px;
    padding: 1rem 1.25rem;
    min-width: 220px;
    max-width: 320px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    animation: toastIn 0.3s ease-out;
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .levelup-dismiss {
    position: absolute;
    top: 0.35rem;
    right: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.1rem 0.25rem;
    transition: color 0.15s ease;
  }

  .levelup-dismiss:hover {
    color: var(--text);
  }

  .levelup-heading {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--yellow, #e6c44d);
    margin-bottom: 0.4rem;
    padding-right: 1.2rem;
  }

  .levelup-rewards {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .levelup-list {
    list-style: none;
    margin: 0.35rem 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .levelup-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--text);
    font-size: 0.8rem;
  }

  .levelup-tier {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .levelup-tier-hero {
    background: rgba(234, 179, 8, 0.15);
    color: var(--yellow, #e6c44d);
    border: 1px solid rgba(234, 179, 8, 0.4);
  }

  .levelup-tier-minor {
    background: var(--accent-faint);
    color: var(--accent);
    border: 1px solid var(--accent-border);
  }
</style>
