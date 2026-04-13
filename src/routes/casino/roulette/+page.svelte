<script lang="ts">
  import { goto } from '$app/navigation';

  // Single shared roulette table - redirect immediately
  $effect(() => {
    goto('/casino/roulette/MAIN', { replaceState: true });
  });
</script>

<div class="loading">
  <p>Joining roulette table...</p>
</div>

<style>
  .loading {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
</style>
