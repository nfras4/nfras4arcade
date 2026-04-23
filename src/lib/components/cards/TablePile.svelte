<script lang="ts">
  import Card from './Card.svelte';

  let {
    cards = [],
    mode = 'stack',
    emptyText = 'Empty',
    label = '',
    warning = false,
    warningText = '',
    trickCards = [],
    playerName = () => 'Unknown',
  }: {
    cards?: { suit: string; rank: string }[];
    mode?: 'stack' | 'trick';
    emptyText?: string;
    label?: string;
    warning?: boolean;
    warningText?: string;
    trickCards?: { playerId: string; card: { suit: string; rank: string } }[];
    playerName?: (id: string) => string;
  } = $props();

  let displayCards = $derived(mode === 'stack' ? cards.slice(-4) : []);
</script>

<div class="table-area" class:warning>
  {#if label}
    <div class="pile-label geo-title">
      {label}
      {#if warning && warningText}
        <span class="warning-alert">{warningText}</span>
      {/if}
    </div>
  {/if}

  {#if mode === 'stack'}
    <div class="pile">
      {#if cards.length === 0}
        <div class="pile-empty">{emptyText}</div>
      {:else}
        {#each displayCards as card, i}
          <div class="pile-card-wrapper" style="transform: rotate({(i - 1.5) * 5}deg)">
            <Card {card} faceUp={true} />
          </div>
        {/each}
      {/if}
    </div>

  {:else if mode === 'trick'}
    <div class="trick-cards">
      {#if trickCards.length === 0}
        <div class="pile-empty">{emptyText}</div>
      {:else}
        {#each trickCards as tc}
          <div class="trick-slot">
            <Card card={tc.card} faceUp={true} />
            <span class="trick-name">{playerName(tc.playerId)}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  :root {
    --danger-red: #e74c3c;
    --danger-red-15: rgba(231, 76, 60, 0.15);
  }

  .table-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: border-color 0.2s;
  }

  .table-area.warning {
    border-color: var(--danger-red);
    box-shadow: 0 0 12px var(--danger-red-15);
  }

  .pile-label {
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .warning-alert {
    color: var(--danger-red);
    font-weight: 700;
    letter-spacing: 0.08em;
    animation: pulse 1s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .pile {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100px;
    gap: 0.25rem;
    position: relative;
  }

  .pile-card-wrapper {
    flex-shrink: 0;
  }

  .pile-empty {
    font-size: 0.875rem;
    color: var(--text-muted);
    font-style: italic;
    padding: 1rem 0;
  }

  .trick-cards {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 110px;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .trick-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .trick-name {
    font-size: 0.75rem;
    color: var(--text-muted);
    max-width: 72px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 420px) {
    .table-area {
      padding: 0.75rem;
    }

    .trick-cards {
      gap: 0.5rem;
    }
  }
</style>
