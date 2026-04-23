<script lang="ts">
  import Card from './Card.svelte';
  import NameFrame from '$lib/components/NameFrame.svelte';

  let {
    name = '',
    cardCount = 0,
    active = false,
    connected = true,
    isHost = false,
    score = undefined,
    roundPenalty = undefined,
    title = undefined,
    finished = false,
    finishPosition = undefined,
    passed = false,
    chipCount = undefined,
    currentBet = undefined,
    dealerBadge = false,
    blindLabel = undefined,
    folded = false,
    allIn = false,
    cardBackStyle = null,
    frameSvg = null,
    emblemSvg = null,
    nameColour = null,
    titleText = null,
    isBot = false,
  }: {
    name?: string;
    cardCount?: number;
    active?: boolean;
    connected?: boolean;
    isHost?: boolean;
    score?: number | undefined;
    roundPenalty?: number | undefined;
    title?: string | undefined;
    finished?: boolean;
    finishPosition?: number | undefined;
    passed?: boolean;
    chipCount?: number | undefined;
    currentBet?: number | undefined;
    dealerBadge?: boolean;
    blindLabel?: string | undefined;
    folded?: boolean;
    allIn?: boolean;
    /** Equipped card back cosmetic to show on face-down cards for this player's seat. */
    cardBackStyle?: { style: string } | { svg: string } | null;
    frameSvg?: string | null;
    emblemSvg?: string | null;
    nameColour?: string | null;
    titleText?: string | null;
    isBot?: boolean;
  } = $props();
</script>

<div class="seat" class:active class:finished class:passed class:disconnected={!connected} class:folded class:all-in={allIn}>
  {#if dealerBadge}
    <span class="dealer-badge">D</span>
  {/if}
  {#if blindLabel}
    <span class="blind-label">{blindLabel}</span>
  {/if}
  <div class="seat-name-wrap" class:folded-name={folded}>
    <NameFrame {name} {frameSvg} {emblemSvg} {nameColour} {titleText} size="pill" {isHost} {isBot} />
  </div>
  {#if cardCount > 0}
    <div class="seat-cards-row">
      {#each { length: Math.min(cardCount, 4) } as _, i}
        <Card faceUp={false} {cardBackStyle} />
      {/each}
      {#if cardCount > 4}
        <span class="seat-cards-extra">+{cardCount - 4}</span>
      {/if}
    </div>
  {:else}
    <span class="seat-cards">{cardCount} cards</span>
  {/if}
  {#if chipCount !== undefined}
    <span class="seat-score">{chipCount} chips</span>
  {/if}
  {#if currentBet !== undefined && currentBet > 0}
    <span class="seat-bet">Bet: {currentBet}</span>
  {/if}
  {#if score !== undefined}
    <span class="seat-score">Score: {score}</span>
  {/if}
  {#if roundPenalty !== undefined && roundPenalty > 0}
    <span class="seat-penalty">+{roundPenalty}</span>
  {/if}
  {#if title}
    <span class="seat-title">{title}</span>
  {/if}
  {#if finishPosition !== undefined}
    <span class="seat-out">Out #{finishPosition + 1}</span>
  {/if}
  {#if passed}
    <span class="seat-passed">Passed</span>
  {/if}
  {#if folded}
    <span class="seat-passed">Folded</span>
  {/if}
  {#if allIn}
    <span class="seat-allin">ALL IN</span>
  {/if}
  {#if !connected}
    <span class="seat-dc">DC</span>
  {/if}
</div>

<style>
  :root {
    --felt-green-glow-20: rgba(108, 180, 130, 0.2);
    --felt-green-glow-25: rgba(108, 180, 130, 0.25);
    --felt-green-glow-50: rgba(108, 180, 130, 0.5);
    --danger-red: #e74c3c;
    --seat-badge-on-accent: #0c0e10;
  }

  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 2px solid var(--border);
    border-radius: 4px;
    min-width: 85px;
    transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    position: relative;
  }

  .seat.active {
    border-color: var(--accent);
    background: var(--accent-faint);
    box-shadow: 0 0 12px var(--felt-green-glow-25);
  }
  .seat.finished { opacity: 0.5; }
  .seat.passed { opacity: 0.6; }
  .seat.disconnected { opacity: 0.4; }
  .seat.folded { opacity: 0.4; }
  .seat.all-in {
    border-color: var(--accent);
    animation: allInPulse 1.5s ease-in-out infinite;
  }

  @keyframes allInPulse {
    0%, 100% { box-shadow: 0 0 6px var(--felt-green-glow-20); }
    50% { box-shadow: 0 0 16px var(--felt-green-glow-50); }
  }

  .seat-name-wrap { font-size: 0.9rem; }
  .folded-name :global(.name) { text-decoration: line-through; }
  .seat-cards { font-size: 0.8rem; color: var(--text-muted); font-weight: 500; }

  .seat-cards-row {
    display: flex;
    gap: 2px;
    align-items: center;
    justify-content: center;
  }

  /* Scale down face-down cards to fit the compact seat */
  .seat-cards-row :global(.card-face) {
    width: 22px;
    height: 32px;
  }

  .seat-cards-extra {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-weight: 600;
  }
  .seat-score { font-size: 0.8rem; color: var(--text-muted); font-weight: 600; }
  .seat-penalty { font-size: 0.75rem; color: var(--danger-red); font-weight: 600; }
  .seat-bet {
    font-size: 0.75rem;
    color: var(--accent);
    font-weight: 600;
  }
  .seat-title {
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .seat-out { font-size: 0.7rem; color: var(--text-muted); }
  .seat-passed { font-size: 0.7rem; color: var(--text-muted); font-style: italic; }
  .seat-allin {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.1rem 0.3rem;
    background: var(--accent-faint);
    color: var(--accent);
    border-radius: 2px;
  }
  .seat-dc {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.1rem 0.3rem;
    background: var(--bg-input);
    color: var(--text-subtle);
    border-radius: 2px;
  }

  .dealer-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    background: var(--yellow);
    color: var(--seat-badge-on-accent);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    line-height: 1;
  }

  .blind-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.1rem 0.4rem;
    background: var(--accent-faint);
    color: var(--accent);
    border-radius: 8px;
  }

  @media (max-width: 420px) {
    .seat {
      min-width: 78px;
      padding: 0.4rem 0.5rem;
    }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
</style>
