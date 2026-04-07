<script lang="ts">
  const SUIT_SYMBOLS: Record<string, string> = { clubs: '\u2663', diamonds: '\u2666', hearts: '\u2665', spades: '\u2660' };

  let {
    card = null,
    faceUp = true,
    selected = false,
    disabled = false,
    onclick = undefined,
  }: {
    card?: { suit: string; rank: string } | null;
    faceUp?: boolean;
    selected?: boolean;
    disabled?: boolean;
    onclick?: (() => void) | undefined;
  } = $props();

  let isRed = $derived(card?.suit === 'hearts' || card?.suit === 'diamonds');
  let symbol = $derived(card ? (SUIT_SYMBOLS[card.suit] ?? card.suit) : '');
</script>

{#if onclick}
  <button
    class="card-face"
    class:face-down={!faceUp}
    class:selected
    class:disabled
    class:red={isRed && faceUp}
    {disabled}
    onclick={onclick}
  >
    {#if faceUp && card}
      <span class="rank">{card.rank}</span>
      <span class="suit">{symbol}</span>
    {:else}
      <span class="back-pattern"></span>
    {/if}
  </button>
{:else}
  <div
    class="card-face"
    class:face-down={!faceUp}
    class:selected
    class:red={isRed && faceUp}
  >
    {#if faceUp && card}
      <span class="rank">{card.rank}</span>
      <span class="suit">{symbol}</span>
    {:else}
      <span class="back-pattern"></span>
    {/if}
  </div>
{/if}

<style>
  .card-face {
    width: 52px;
    height: 72px;
    background: var(--bg-card);
    border: 2px solid var(--border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    transition: transform 0.1s, border-color 0.1s;
    padding: 0;
    clip-path: none;
    font-family: inherit;
    flex-shrink: 0;
  }

  button.card-face {
    cursor: pointer;
  }

  button.card-face:hover:not(.disabled) {
    border-color: var(--accent-border);
  }

  .card-face.selected {
    transform: translateY(-6px);
    border-color: var(--accent);
    background: var(--accent-faint);
  }

  button.card-face:active:not(.disabled) {
    transform: scale(0.95);
  }

  .card-face.disabled {
    cursor: default;
    opacity: 0.7;
  }

  .card-face.face-down {
    background: var(--bg-input);
    border-color: var(--border-bright);
  }

  .back-pattern {
    display: block;
    width: 30px;
    height: 44px;
    background: repeating-linear-gradient(
      45deg,
      var(--border) 0px,
      var(--border) 2px,
      transparent 2px,
      transparent 6px
    );
    border-radius: 2px;
    opacity: 0.3;
  }

  .rank {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .suit {
    font-size: 0.8rem;
    line-height: 1;
    color: var(--text);
  }

  .red .rank, .red .suit { color: #e74c3c; }
</style>
