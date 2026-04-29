<script lang="ts">
  import {
    fetchActiveBets,
    placeBet,
    errorMessage,
    WAGER_ALLOWLIST,
    type ActiveBet,
    type PlaceBetError,
  } from '$lib/bets';

  interface PlayerLite {
    id: string;
    name: string;
    eliminated?: boolean;
    isBot?: boolean;
  }

  interface Props {
    roomCode: string;
    game: string;
    players: PlayerLite[];
    isSpectator: boolean;
    isGameEnded: boolean;
    myUserId: string | null;
  }

  let { roomCode, game, players, isSpectator, isGameEnded, myUserId }: Props = $props();

  let activeBets = $state<ActiveBet[]>([]);
  let totalPot = $state(0);
  let selectedTargetId = $state<string | null>(null);
  let selectedWager = $state<number>(WAGER_ALLOWLIST[0]);
  let placing = $state(false);
  let inlineError = $state<string | null>(null);
  let inlineErrorTimeout: ReturnType<typeof setTimeout> | null = null;

  // Eligible bet targets: not eliminated.
  let eligibleTargets = $derived(players.filter((p) => p.eliminated !== true));

  // Auto-clear selected target if it becomes ineligible.
  $effect(() => {
    if (selectedTargetId && !eligibleTargets.some((p) => p.id === selectedTargetId)) {
      selectedTargetId = null;
    }
  });

  // Lookup helper for displaying bet target names.
  function targetName(id: string): string {
    return players.find((p) => p.id === id)?.name ?? 'Unknown';
  }

  // Polling loop for live bets. Returns cleanup for $effect.
  $effect(() => {
    if (!isSpectator) return;
    let cancelled = false;
    async function refresh() {
      const data = await fetchActiveBets(roomCode, game);
      if (cancelled) return;
      activeBets = data.bets;
      totalPot = data.totalPot;
    }
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  });

  function showInlineError(msg: string) {
    inlineError = msg;
    if (inlineErrorTimeout) clearTimeout(inlineErrorTimeout);
    inlineErrorTimeout = setTimeout(() => {
      inlineError = null;
    }, 4000);
  }

  async function onPlaceBet() {
    if (!selectedTargetId || placing) return;
    placing = true;
    const result = await placeBet({
      roomCode,
      game,
      targetPlayerId: selectedTargetId,
      wagerAmount: selectedWager,
    });
    if (result.ok) {
      selectedTargetId = null;
      // Refetch immediately to reflect the new bet.
      const data = await fetchActiveBets(roomCode, game);
      activeBets = data.bets;
      totalPot = data.totalPot;
    } else {
      showInlineError(errorMessage(result.error as PlaceBetError));
    }
    placing = false;
  }

  let canPlace = $derived(
    !isGameEnded &&
      myUserId !== null &&
      selectedTargetId !== null &&
      WAGER_ALLOWLIST.includes(selectedWager as (typeof WAGER_ALLOWLIST)[number]) &&
      !placing
  );

  let winPreview = $derived(selectedWager * 2);
</script>

{#if isSpectator}
  <aside class="bet-panel" aria-label="Spectator bet panel">
    <h3 class="geo-title bet-title">Place a Bet</h3>

    {#if myUserId === null}
      <p class="guest-cta">
        <a href="/login" class="guest-link">Log in</a>
        to place bets.
      </p>
    {:else}
      <!-- Target picker -->
      <div class="picker-section">
        <span class="field-label">Bet on</span>
        {#if eligibleTargets.length === 0}
          <p class="muted-note">No eligible players to bet on.</p>
        {:else}
          <div class="target-list">
            {#each eligibleTargets as p (p.id)}
              <button
                type="button"
                class="target-row"
                class:selected={selectedTargetId === p.id}
                disabled={isGameEnded}
                onclick={() => (selectedTargetId = p.id)}
              >
                <span
                  class="target-dot"
                  class:on={selectedTargetId === p.id}
                  aria-hidden="true"
                ></span>
                <span class="target-name">{p.name}</span>
                {#if p.isBot}<span class="bot-badge">BOT</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Wager picker -->
      <div class="picker-section">
        <span class="field-label">Wager</span>
        <div class="wager-row">
          {#each WAGER_ALLOWLIST as w}
            <button
              type="button"
              class="wager-btn"
              class:active={selectedWager === w}
              disabled={isGameEnded}
              onclick={() => (selectedWager = w)}
            >{w}</button>
          {/each}
        </div>
        <p class="win-preview">Win: {winPreview} chips</p>
      </div>

      <button
        type="button"
        class="btn-primary place-btn"
        disabled={!canPlace}
        onclick={onPlaceBet}
      >
        {placing ? 'Placing...' : isGameEnded ? 'Game ended' : 'Place Bet'}
      </button>

      {#if inlineError}
        <p class="inline-error" role="alert">{inlineError}</p>
      {/if}
    {/if}

    <!-- Active bets section -->
    <div class="live-section">
      <div class="live-head">
        <span class="field-label">Live Bets</span>
        <span class="pot-chip">Pot: {totalPot}</span>
      </div>
      {#if activeBets.length === 0}
        <p class="muted-note">No active bets yet.</p>
      {:else}
        <ul class="bet-list">
          {#each activeBets as b (b.id)}
            <li class="bet-row">
              <span class="bettor">{b.bettorName}</span>
              <span class="bet-verb">bet</span>
              <span class="wager-amt">{b.wagerAmount}</span>
              <span class="bet-verb">on</span>
              <span class="bet-target">{targetName(b.targetPlayerId)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .bet-panel {
    width: 100%;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding: 0.85rem 0.9rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .bet-title {
    font-size: 0.95rem;
    letter-spacing: 0.14em;
    color: var(--accent);
    margin: 0;
    text-align: center;
  }

  .field-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .picker-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .target-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .target-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
    font-family: inherit;
    font-size: 0.85rem;
  }

  .target-row:hover:not(:disabled) {
    border-color: var(--accent-border);
  }

  .target-row:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .target-row.selected {
    background: var(--accent-faint);
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .target-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--border-bright, var(--border));
    background: transparent;
    flex-shrink: 0;
  }

  .target-dot.on {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 6px var(--accent);
  }

  .target-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bot-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.1rem 0.35rem;
    border-radius: 2px;
    background: rgba(155, 89, 182, 0.15);
    color: #9b59b6;
  }

  .wager-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.3rem;
  }

  .wager-btn {
    padding: 0.45rem 0.4rem;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .wager-btn:hover:not(:disabled):not(.active) {
    color: var(--text);
  }

  .wager-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .wager-btn.active {
    background: var(--accent-faint);
    color: var(--accent);
    border-color: var(--accent-border);
  }

  .win-preview {
    margin: 0.1rem 0 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    color: var(--yellow, #eab308);
    text-align: right;
    letter-spacing: 0.06em;
  }

  .place-btn {
    width: 100%;
  }

  .inline-error {
    margin: 0;
    padding: 0.4rem 0.55rem;
    background: rgba(231, 76, 60, 0.08);
    border: 1px solid rgba(231, 76, 60, 0.3);
    border-radius: 2px;
    font-size: 0.78rem;
    color: #e74c3c;
    text-align: center;
  }

  .live-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--border);
  }

  .live-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .pot-chip {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--yellow, #eab308);
    letter-spacing: 0.06em;
  }

  .bet-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 11rem;
    overflow-y: auto;
  }

  .bet-row {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    flex-wrap: wrap;
    padding: 0.35rem 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-size: 0.78rem;
    color: var(--text-muted);
    font-family: 'Rajdhani', system-ui, sans-serif;
  }

  .bettor {
    color: var(--text);
    font-weight: 700;
  }

  .wager-amt {
    color: var(--yellow, #eab308);
    font-weight: 700;
  }

  .bet-target {
    color: var(--accent);
    font-weight: 600;
  }

  .bet-verb {
    color: var(--text-subtle);
  }

  .muted-note {
    margin: 0;
    font-size: 0.78rem;
    color: var(--text-subtle);
    font-style: italic;
    text-align: center;
  }

  .guest-cta {
    margin: 0;
    padding: 0.5rem 0.6rem;
    text-align: center;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-size: 0.82rem;
    color: var(--text-muted);
  }

  .guest-link {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
    margin-right: 0.25rem;
  }

  .guest-link:hover {
    text-decoration: underline;
  }
</style>
