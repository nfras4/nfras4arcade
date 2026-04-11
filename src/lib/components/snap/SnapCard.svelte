<script lang="ts">
  const SUIT_PATHS: Record<string, string> = {
    hearts: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    diamonds: 'M12 2L6 12l6 10 6-10z',
    clubs: 'M12 2C9.24 2 7 4.24 7 7c0 1.2.44 2.3 1.16 3.15C6.28 10.58 5 12.13 5 14c0 2.76 2.24 5 5 5 .71 0 1.39-.15 2-.42V22h0 0v-3.42c.61.27 1.29.42 2 .42 2.76 0 5-2.24 5-5 0-1.87-1.28-3.42-3.16-3.85A4.98 4.98 0 0017 7c0-2.76-2.24-5-5-5z',
    spades: 'M12 2C9 7 3 10.5 3 14.5c0 2.76 2.24 5 5 5 .71 0 1.39-.15 2-.42V22h4v-2.92c.61.27 1.29.42 2 .42 2.76 0 5-2.24 5-5C21 10.5 15 7 12 2z',
  };

  let {
    card = null,
    faceUp = true,
    size = 'large',
    animate = false,
    highlight = false,
  }: {
    card?: { suit: string; rank: string } | null;
    faceUp?: boolean;
    size?: 'normal' | 'large' | 'huge';
    animate?: boolean;
    highlight?: boolean;
  } = $props();

  let isRed = $derived(card?.suit === 'hearts' || card?.suit === 'diamonds');
  let suitPath = $derived(card ? (SUIT_PATHS[card.suit] ?? '') : '');

  let flipKey = $state(0);
  let flipping = $state(false);

  $effect(() => {
    if (animate && card) {
      flipping = true;
      flipKey++;
      const timer = setTimeout(() => { flipping = false; }, 300);
      return () => clearTimeout(timer);
    }
  });
</script>

<div
  class="snap-card size-{size}"
  class:highlight
  class:flipping
  class:face-down={!faceUp || !card}
  class:red={isRed && faceUp && card}
>
  <div class="card-inner">
    {#if faceUp && card}
      <span class="rank">{card.rank}</span>
      <svg class="suit-icon" viewBox="0 0 24 24"><path d={suitPath}/></svg>
      <span class="rank rank-bottom">{card.rank}</span>
    {:else}
      <span class="back-pattern"></span>
    {/if}
  </div>
</div>

<style>
  .snap-card {
    border-radius: 12px;
    background: var(--bg-card);
    border: 2px solid var(--border-bright);
    display: flex;
    align-items: center;
    justify-content: center;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    transition: box-shadow 0.2s, border-color 0.2s;
    perspective: 600px;
    flex-shrink: 0;
  }

  .size-normal {
    width: 120px;
    aspect-ratio: 2.5 / 3.5;
  }

  .size-large {
    width: 180px;
    aspect-ratio: 2.5 / 3.5;
  }

  .size-huge {
    width: min(280px, 80vw);
    aspect-ratio: 2.5 / 3.5;
  }

  .card-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.3s ease;
  }

  .flipping .card-inner {
    animation: cardFlip 0.3s ease;
  }

  @keyframes cardFlip {
    0% { transform: rotateY(0deg); }
    50% { transform: rotateY(90deg); }
    100% { transform: rotateY(0deg); }
  }

  .highlight {
    border-color: #2ecc71;
    box-shadow: 0 0 20px rgba(46, 204, 113, 0.5), 0 0 40px rgba(46, 204, 113, 0.2);
    animation: highlightPulse 0.8s ease-in-out infinite alternate;
  }

  @keyframes highlightPulse {
    from { box-shadow: 0 0 20px rgba(46, 204, 113, 0.5), 0 0 40px rgba(46, 204, 113, 0.2); }
    to { box-shadow: 0 0 30px rgba(46, 204, 113, 0.7), 0 0 60px rgba(46, 204, 113, 0.3); }
  }

  .face-down {
    background: var(--bg-input);
    border-color: var(--border-bright);
  }

  .back-pattern {
    display: block;
    width: 60%;
    height: 70%;
    background: repeating-linear-gradient(
      45deg,
      var(--border) 0px,
      var(--border) 2px,
      transparent 2px,
      transparent 6px
    );
    border-radius: 4px;
    opacity: 0.3;
  }

  .rank {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .rank-bottom {
    transform: rotate(180deg);
  }

  .size-normal .rank { font-size: 1.5rem; }
  .size-large .rank { font-size: 2.25rem; }
  .size-huge .rank { font-size: 3.5rem; }

  .suit-icon {
    fill: var(--text);
    flex-shrink: 0;
  }

  .size-normal .suit-icon { width: 28px; height: 28px; }
  .size-large .suit-icon { width: 42px; height: 42px; }
  .size-huge .suit-icon { width: 64px; height: 64px; }

  .red .rank { color: #e63232; }
  .red .suit-icon { fill: #e63232; }
</style>
