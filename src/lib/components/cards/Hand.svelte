<script lang="ts">
  import Card from './Card.svelte';

  let {
    cards = [],
    disabled = false,
    selectedCards = [],
    onchange = () => {},
    multiSelect = false,
    isCardPlayable,
  }: {
    cards?: { suit: string; rank: string }[];
    disabled?: boolean;
    selectedCards?: { suit: string; rank: string }[];
    onchange?: (selected: { suit: string; rank: string }[]) => void;
    multiSelect?: boolean;
    isCardPlayable?: (card: { suit: string; rank: string }) => boolean;
  } = $props();

  function isSelected(card: { suit: string; rank: string }): boolean {
    return selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
  }

  function cardDisabled(card: { suit: string; rank: string }): boolean {
    if (disabled) return true;
    if (isCardPlayable && !isCardPlayable(card)) return true;
    return false;
  }

  function toggle(card: { suit: string; rank: string }) {
    if (cardDisabled(card)) return;
    const idx = selectedCards.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx >= 0) {
      onchange(selectedCards.filter((_, i) => i !== idx));
    } else if (multiSelect) {
      // For President: only same-rank cards
      if (selectedCards.length > 0 && selectedCards[0].rank !== card.rank) {
        onchange([card]);
      } else {
        onchange([...selectedCards, card]);
      }
    } else {
      onchange([card]);
    }
  }
</script>

<div class="hand" class:many={cards.length > 10}>
  {#each cards as card}
    <Card
      {card}
      faceUp={true}
      selected={isSelected(card)}
      disabled={cardDisabled(card)}
      onclick={() => toggle(card)}
    />
  {/each}
</div>

<style>
  .hand {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.375rem;
  }

  .hand.many {
    gap: 0.125rem;
  }

  @media (max-width: 420px) {
    .hand {
      gap: 0.25rem;
    }

    .hand.many {
      gap: 0.1rem;
    }
  }
</style>
