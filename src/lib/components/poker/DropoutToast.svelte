<script lang="ts">
  let {
    partnerRole,
    visible,
    reconnected,
    graceDurationMs = 60_000,
  }: {
    partnerRole: 'controller' | 'table';
    visible: boolean;
    reconnected: boolean;
    graceDurationMs?: number;
  } = $props();

  let remainingMs = $state(graceDurationMs);
  let startTime = $state(0);

  $effect(() => {
    if (!visible || reconnected) {
      remainingMs = graceDurationMs;
      return;
    }
    startTime = Date.now();
    remainingMs = graceDurationMs;
    const id = setInterval(() => {
      const elapsed = Date.now() - startTime;
      remainingMs = Math.max(0, graceDurationMs - elapsed);
    }, 250);
    return () => clearInterval(id);
  });

  let secondsRemaining = $derived(Math.ceil(remainingMs / 1000));
  let label = $derived(partnerRole === 'controller' ? 'Controller' : 'Table');
</script>

{#if visible}
  <div class="dropout-toast" class:reconnected aria-live="polite">
    {#if reconnected}
      <span class="status">{label} reconnected</span>
    {:else}
      <span class="status">{label} offline ({secondsRemaining}s)</span>
    {/if}
  </div>
{/if}

<style>
  .dropout-toast {
    position: fixed;
    top: 4.75rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.4rem 0.85rem;
    background: rgba(231, 76, 60, 0.92);
    color: #fff;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-radius: 4px;
    z-index: 60;
    pointer-events: none;
  }
  .dropout-toast.reconnected {
    background: rgba(108, 180, 130, 0.92);
  }
  .status {
    display: inline-block;
  }
</style>
