<script lang="ts">
  // Inline SVG paths for crisp rendering on all devices
  const SUIT_PATHS: Record<string, string> = {
    hearts: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    diamonds: 'M12 2L6 12l6 10 6-10z',
    clubs: 'M12 2C9.24 2 7 4.24 7 7c0 1.2.44 2.3 1.16 3.15C6.28 10.58 5 12.13 5 14c0 2.76 2.24 5 5 5 .71 0 1.39-.15 2-.42V22h0 0v-3.42c.61.27 1.29.42 2 .42 2.76 0 5-2.24 5-5 0-1.87-1.28-3.42-3.16-3.85A4.98 4.98 0 0017 7c0-2.76-2.24-5-5-5z',
    spades: 'M12 2C9 7 3 10.5 3 14.5c0 2.76 2.24 5 5 5 .71 0 1.39-.15 2-.42V22h4v-2.92c.61.27 1.29.42 2 .42 2.76 0 5-2.24 5-5C21 10.5 15 7 12 2z',
  };

  let {
    card = null,
    faceUp = true,
    selected = false,
    disabled = false,
    onclick = undefined,
    dealDelay = 0,
    cardBackStyle = null,
  }: {
    card?: { suit: string; rank: string } | null;
    faceUp?: boolean;
    selected?: boolean;
    disabled?: boolean;
    onclick?: (() => void) | undefined;
    dealDelay?: number;
    /** Equipped card back cosmetic. Supports style-based (CSS class) or SVG-based (background-image). */
    cardBackStyle?: { style: string } | { svg: string } | null;
  } = $props();

  // TODO: wire feature flag — hardcoded true until COSMETIC_TILES_ENABLED is accessible client-side
  const cosmeticsEnabled = true;

  let backClass = $derived(
    cosmeticsEnabled && cardBackStyle && 'style' in cardBackStyle
      ? `back-pattern back-pattern--${cardBackStyle.style}`
      : 'back-pattern'
  );

  let backImgStyle = $derived(
    cosmeticsEnabled && cardBackStyle && 'svg' in cardBackStyle
      ? `background-image: url('${cardBackStyle.svg}'); background-size: cover; background-position: center;`
      : ''
  );

  let isRed = $derived(card?.suit === 'hearts' || card?.suit === 'diamonds');
  let suitPath = $derived(card ? (SUIT_PATHS[card.suit] ?? '') : '');
</script>

{#if onclick}
  <button
    class="card-face"
    class:face-down={!faceUp}
    class:selected
    class:disabled
    class:red={isRed && faceUp}
    class:deal-animate={dealDelay > 0}
    style={dealDelay > 0 ? `animation-delay: ${dealDelay}ms` : ''}
    {disabled}
    onclick={onclick}
  >
    {#if faceUp && card}
      <span class="rank">{card.rank}</span>
      <svg class="suit-icon" viewBox="0 0 24 24"><path d={suitPath}/></svg>
    {:else}
      <span class={backClass} style={backImgStyle}></span>
    {/if}
  </button>
{:else}
  <div
    class="card-face"
    class:face-down={!faceUp}
    class:selected
    class:red={isRed && faceUp}
    class:deal-animate={dealDelay > 0}
    style={dealDelay > 0 ? `animation-delay: ${dealDelay}ms` : ''}
  >
    {#if faceUp && card}
      <span class="rank">{card.rank}</span>
      <svg class="suit-icon" viewBox="0 0 24 24"><path d={suitPath}/></svg>
    {:else}
      <span class={backClass} style={backImgStyle}></span>
    {/if}
  </div>
{/if}

<style>
  :root {
    --card-back-red-dark: #8b1a1a;
    --card-back-red: #c0392b;
    --card-back-blue-dark: #1a3a5c;
    --card-back-blue: #2980b9;
    --card-back-gold-dark: #b8860b;
    --card-back-gold: #ffd700;
    --suit-red: #e63232;
  }

  .card-face {
    width: 68px;
    height: 94px;
    background: var(--bg-card);
    border: 2px solid var(--border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    transition: transform 0.1s, border-color 0.1s;
    padding: 0;
    clip-path: none;
    font-family: inherit;
    flex-shrink: 0;
  }

  button.card-face {
    cursor: pointer;
    padding: 4px;
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
    width: 40px;
    height: 58px;
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

  /* Equipped card back styles — match subcategory metadata {"style":"..."} values */
  .back-pattern--red_pattern {
    background: repeating-linear-gradient(
      45deg,
      var(--card-back-red-dark) 0px,
      var(--card-back-red-dark) 2px,
      var(--card-back-red) 2px,
      var(--card-back-red) 6px
    );
    opacity: 0.85;
  }

  .back-pattern--blue_pattern {
    background: repeating-linear-gradient(
      45deg,
      var(--card-back-blue-dark) 0px,
      var(--card-back-blue-dark) 2px,
      var(--card-back-blue) 2px,
      var(--card-back-blue) 6px
    );
    opacity: 0.85;
  }

  .back-pattern--gold_foil {
    background: repeating-linear-gradient(
      45deg,
      var(--card-back-gold-dark) 0px,
      var(--card-back-gold-dark) 2px,
      var(--card-back-gold) 2px,
      var(--card-back-gold) 6px
    );
    opacity: 0.9;
  }

  /* SVG card back — background-image applied via inline style; ensure it fills */
  .back-pattern[style*="background-image"] {
    opacity: 1;
    background-repeat: no-repeat;
  }

  .rank {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.35rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .suit-icon {
    width: 22px;
    height: 22px;
    fill: var(--text);
    flex-shrink: 0;
  }

  .red .rank { color: var(--suit-red); }
  .red .suit-icon { fill: var(--suit-red); }

  @keyframes dealIn {
    from {
      opacity: 0;
      transform: translateY(-30px) scale(0.8);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .deal-animate {
    animation: dealIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
</style>
