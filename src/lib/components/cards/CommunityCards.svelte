<script lang="ts">
  import Card from './Card.svelte';

  let {
    cards = [],
    bettingRound = 'preflop',
  }: {
    cards?: { suit: string; rank: string }[];
    bettingRound?: string;
  } = $props();

  let flopCards = $derived(cards.slice(0, 3));
  let turnCard = $derived(cards.length >= 4 ? cards[3] : null);
  let riverCard = $derived(cards.length >= 5 ? cards[4] : null);
</script>

<div class="community">
  <div class="community-row">
    <!-- Flop -->
    <div class="card-group">
      {#each { length: 3 } as _, i}
        {#if flopCards[i]}
          <div class="community-card">
            <Card card={flopCards[i]} faceUp={true} dealDelay={i * 120} />
          </div>
        {:else}
          <div class="card-placeholder"></div>
        {/if}
      {/each}
      <span class="group-label geo-title">Flop</span>
    </div>

    <!-- Turn -->
    <div class="card-group">
      {#if turnCard}
        <div class="community-card">
          <Card card={turnCard} faceUp={true} />
        </div>
      {:else}
        <div class="card-placeholder"></div>
      {/if}
      <span class="group-label geo-title">Turn</span>
    </div>

    <!-- River -->
    <div class="card-group">
      {#if riverCard}
        <div class="community-card">
          <Card card={riverCard} faceUp={true} />
        </div>
      {:else}
        <div class="card-placeholder"></div>
      {/if}
      <span class="group-label geo-title">River</span>
    </div>
  </div>
</div>

<style>
  .community {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .community-row {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .card-group {
    display: flex;
    gap: 0.25rem;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    position: relative;
  }

  .group-label {
    position: absolute;
    bottom: -1.1rem;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.55rem;
    letter-spacing: 0.12em;
    color: var(--text-subtle);
    white-space: nowrap;
  }

  .community-card {
    flex-shrink: 0;
  }

  .card-placeholder {
    width: 68px;
    height: 94px;
    border: 2px dashed var(--border-bright);
    border-radius: 6px;
    background: transparent;
    opacity: 0.3;
    flex-shrink: 0;
  }

  @media (max-width: 420px) {
    .community-row {
      gap: 0.5rem;
    }

    .card-placeholder {
      width: 56px;
      height: 78px;
    }
  }
</style>
