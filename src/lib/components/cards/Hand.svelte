<script lang="ts">
  import Card from './Card.svelte';

  let {
    cards = [],
    disabled = false,
    selectedCards = [],
    onchange = () => {},
    multiSelect = false,
  }: {
    cards?: { suit: string; rank: string }[];
    disabled?: boolean;
    selectedCards?: { suit: string; rank: string }[];
    onchange?: (selected: { suit: string; rank: string }[]) => void;
    multiSelect?: boolean;
  } = $props();

  function isSelected(card: { suit: string; rank: string }): boolean {
    return selectedCards.some(c => c.suit === card.suit && c.rank === card.rank);
  }

  function toggle(card: { suit: string; rank: string }) {
    if (disabled) return;
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
      {disabled}
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
</style>
