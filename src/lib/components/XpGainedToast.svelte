<script lang="ts">
  // Rapid-fire strategy: replace — new event cancels the active timer and restarts the toast.
  // This is simpler than a queue and avoids stale XP values showing after the fact.

  interface XpGainedDetail {
    amount: number;
    newXp: number;
  }

  let visible = $state(false);
  let amount = $state(0);
  let newXp = $state(0);
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  function handleXpGained(event: CustomEvent<XpGainedDetail>) {
    // Cancel any pending auto-dismiss so we restart cleanly
    if (dismissTimer) clearTimeout(dismissTimer);

    amount = event.detail.amount;
    newXp = event.detail.newXp;
    visible = true;

    dismissTimer = setTimeout(() => {
      visible = false;
    }, 3000);
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener('xpgained', handleXpGained as EventListener);
    return () => {
      window.removeEventListener('xpgained', handleXpGained as EventListener);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  });
</script>

{#if visible}
  <div class="xp-toast" role="status" aria-live="polite">
    <div class="xp-amount">+{amount} XP</div>
    <div class="xp-total">Total: {newXp} XP</div>
  </div>
{/if}

<style>
  .xp-toast {
    position: fixed;
    top: 1rem;
    right: 1.5rem;
    z-index: 9999;
    background: var(--bg-card);
    border: 1px solid rgba(234, 179, 8, 0.5);
    border-radius: 4px;
    padding: 0.75rem 1.25rem;
    min-width: 140px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    animation: xpToastIn 0.25s ease-out, xpToastOut 0.25s ease-in 2.75s forwards;
  }

  @keyframes xpToastIn {
    from {
      opacity: 0;
      transform: translateX(12px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes xpToastOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(12px);
    }
  }

  .xp-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--yellow, #e6c44d);
  }

  .xp-total {
    font-family: 'Space Grotesk', system-ui, sans-serif;
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 0.15rem;
  }
</style>
