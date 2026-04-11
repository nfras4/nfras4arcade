<script lang="ts">
  let {
    canCheck = false,
    callAmount = 0,
    minRaise = 0,
    maxRaise = 0,
    playerChips = 0,
    disabled = false,
    onaction = () => {},
  }: {
    canCheck?: boolean;
    callAmount?: number;
    minRaise?: number;
    maxRaise?: number;
    playerChips?: number;
    disabled?: boolean;
    onaction?: (action: { type: string; amount?: number }) => void;
  } = $props();

  let raiseAmount = $state(0);

  // Keep raiseAmount in bounds when props change
  $effect(() => {
    if (raiseAmount < minRaise) raiseAmount = minRaise;
    if (raiseAmount > maxRaise) raiseAmount = maxRaise;
  });

  // Estimate pot from callAmount context (rough heuristic)
  let estimatedPot = $derived(callAmount > 0 ? callAmount * 3 : minRaise * 2);

  function fold() { onaction({ type: 'fold' }); }
  function check() { onaction({ type: 'check' }); }
  function call() { onaction({ type: 'call' }); }
  function raise() { onaction({ type: 'raise', amount: raiseAmount }); }
  function allIn() { onaction({ type: 'all_in' }); }

  function setQuickBet(multiplier: number) {
    const amount = Math.min(Math.floor(estimatedPot * multiplier), maxRaise);
    raiseAmount = Math.max(amount, minRaise);
  }
</script>

<div class="bet-controls" class:disabled>
  <div class="action-buttons">
    <button class="btn-fold" onclick={fold} {disabled}>
      Fold
    </button>

    {#if canCheck}
      <button class="btn-check" onclick={check} {disabled}>
        Check
      </button>
    {:else}
      <button class="btn-call" onclick={call} {disabled}>
        Call {callAmount}
      </button>
    {/if}

    <button class="btn-allin" onclick={allIn} {disabled}>
      All In ({playerChips})
    </button>
  </div>

  {#if minRaise > 0 && maxRaise > minRaise}
    <div class="raise-section">
      <div class="quick-bets">
        <button class="btn-quick" onclick={() => setQuickBet(0.5)} {disabled}>1/2 Pot</button>
        <button class="btn-quick" onclick={() => setQuickBet(1)} {disabled}>Pot</button>
        <button class="btn-quick" onclick={() => setQuickBet(2)} {disabled}>2x Pot</button>
      </div>
      <div class="raise-row">
        <input
          type="range"
          class="raise-slider"
          min={minRaise}
          max={maxRaise}
          step={1}
          bind:value={raiseAmount}
          {disabled}
        />
        <span class="raise-value">{raiseAmount}</span>
        <button class="btn-raise" onclick={raise} {disabled}>
          Raise
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .bet-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    max-width: 500px;
    padding: 0.75rem;
    background: var(--bg-card);
    border-top: 1px solid var(--border);
  }

  .bet-controls.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .action-buttons {
    display: flex;
    gap: 0.375rem;
    justify-content: center;
  }

  .action-buttons button {
    flex: 1;
    padding: 0.65rem 0.5rem;
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: none;
    cursor: pointer;
    clip-path: var(--clip-btn);
    transition: background 0.15s, opacity 0.15s;
  }

  .btn-fold {
    background: rgba(233, 69, 96, 0.15);
    color: #e94560;
  }
  .btn-fold:hover:not(:disabled) {
    background: rgba(233, 69, 96, 0.25);
  }

  .btn-check {
    background: rgba(61, 214, 140, 0.15);
    color: #3dd68c;
  }
  .btn-check:hover:not(:disabled) {
    background: rgba(61, 214, 140, 0.25);
  }

  .btn-call {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
  }
  .btn-call:hover:not(:disabled) {
    background: var(--btn-primary-bg-hover);
  }

  .btn-allin {
    background: var(--accent-faint);
    color: var(--accent);
    border: 1px solid var(--accent-border);
  }
  .btn-allin:hover:not(:disabled) {
    background: var(--accent-border);
  }

  .raise-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .quick-bets {
    display: flex;
    gap: 0.25rem;
    justify-content: center;
  }

  .btn-quick {
    padding: 0.35rem 0.6rem;
    font-size: 0.7rem;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
    clip-path: none;
    border-radius: 2px;
  }
  .btn-quick:hover:not(:disabled) {
    color: var(--accent);
    border-color: var(--accent-border);
  }

  .raise-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .raise-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    background: var(--border-bright);
    border-radius: 2px;
    outline: none;
    border: none;
    padding: 0;
  }

  .raise-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
  }

  .raise-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: none;
  }

  .raise-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
    min-width: 3rem;
    text-align: center;
  }

  .btn-raise {
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
  }
  .btn-raise:hover:not(:disabled) {
    background: var(--btn-primary-bg-hover);
  }

  @media (max-width: 420px) {
    .bet-controls {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 40;
      padding: 0.5rem 0.75rem max(0.5rem, env(safe-area-inset-bottom, 0.5rem));
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
      max-width: none;
    }

    .action-buttons button {
      padding: 0.6rem 0.25rem;
      font-size: 0.75rem;
    }
  }
</style>
