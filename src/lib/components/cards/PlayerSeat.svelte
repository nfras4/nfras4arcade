<script lang="ts">
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
  } = $props();
</script>

<div class="seat" class:active class:finished class:passed class:disconnected={!connected}>
  <span class="seat-name">{name}</span>
  <span class="seat-cards">{cardCount} cards</span>
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
  {#if !connected}
    <span class="seat-dc">DC</span>
  {/if}
</div>

<style>
  .seat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.4rem 0.6rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    min-width: 75px;
    transition: border-color 0.15s;
  }

  .seat.active { border-color: var(--accent); }
  .seat.finished { opacity: 0.5; }
  .seat.passed { opacity: 0.6; }
  .seat.disconnected { opacity: 0.4; }

  .seat-name { font-size: 0.75rem; font-weight: 600; color: var(--text); }
  .seat-cards { font-size: 0.65rem; color: var(--text-muted); }
  .seat-score { font-size: 0.65rem; color: var(--text-subtle); }
  .seat-penalty { font-size: 0.6rem; color: #e74c3c; font-weight: 600; }
  .seat-title {
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .seat-out { font-size: 0.6rem; color: var(--text-subtle); }
  .seat-passed { font-size: 0.6rem; color: var(--text-subtle); font-style: italic; }
  .seat-dc {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.1rem 0.3rem;
    background: var(--bg-input);
    color: var(--text-subtle);
    border-radius: 2px;
  }
</style>
