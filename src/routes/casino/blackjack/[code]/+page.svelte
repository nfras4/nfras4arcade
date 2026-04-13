<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { isLoggedIn } from '$lib/auth';
  import Card from '$lib/components/cards/Card.svelte';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/blackjack');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let reconnecting = $state(true);
  let betInput = $state(25);
  let betPlaced = $state(false);
  let hasPlayedRound = $state(false);
  let errorTimeout: ReturnType<typeof setTimeout>;

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
        // Reset bet placed flag when a new round starts
        if (msg.state?.phase === 'betting') {
          betPlaced = false;
        }
        if (msg.state?.phase === 'round_over') {
          hasPlayedRound = true;
        }
      } else if (msg.type === 'error') {
        error.set(msg.message);
        reconnecting = false;
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
      }
    });

    socket.connect(code, !$isLoggedIn)
      .then(() => socket.joinRoom(code))
      .catch(() => goto('/casino/blackjack'));

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/casino/blackjack');
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let myPlayer = $derived(state?.players?.find((p: any) => p.id === pid));
  let ts = $derived(state?.tableState);
  let dealerHand = $derived((ts?.dealerHand ?? []) as { suit: string; rank: string; value: number }[]);
  let dealerRevealed = $derived(ts?.dealerRevealed ?? false);
  let dealerValue = $derived(ts?.dealerValue as number | null);
  let playerHands = $derived((ts?.playerHands ?? {}) as Record<string, any[]>);
  let currentPlayerId = $derived(ts?.currentPlayerId as string | null);
  let currentHandIndex = $derived(ts?.currentHandIndex ?? 0);
  let results = $derived(ts?.results as Record<string, string[]> | null);
  let payouts = $derived(ts?.payouts as Record<string, number> | null);
  let betsPlaced = $derived((ts?.betsPlaced ?? {}) as Record<string, number>);
  let myBet = $derived(ts?.myBet as number | null);
  let myHands = $derived(pid ? (playerHands[pid] ?? []) : []);
  let myChips = $derived(myPlayer?.chips ?? 0);
  let isMyTurn = $derived(currentPlayerId === pid);
  let activeHand = $derived(isMyTurn ? (myHands[currentHandIndex] ?? null) : null);

  // Bet constraints
  let minBet = $derived(state?.minBet ?? 10);
  let maxBet = $derived(state?.maxBet ?? 500);

  // Auto-place bet when returning to betting phase after a round
  $effect(() => {
    if (state?.phase === 'betting' && hasPlayedRound && !betPlaced && betInput >= minBet && betInput <= myChips) {
      placeBet();
    }
  });

  // Can double down: exactly 2 cards in active hand and enough chips
  let canDoubleDown = $derived(
    isMyTurn &&
    activeHand &&
    activeHand.cards?.length === 2 &&
    !activeHand.stood &&
    !activeHand.busted &&
    myChips >= (activeHand.bet ?? 0)
  );

  // Can split: exactly 2 cards with same rank and enough chips
  let canSplit = $derived(
    isMyTurn &&
    activeHand &&
    activeHand.cards?.length === 2 &&
    !activeHand.stood &&
    !activeHand.busted &&
    activeHand.cards[0]?.rank === activeHand.cards[1]?.rank &&
    myChips >= (activeHand.bet ?? 0) &&
    myHands.length < 4
  );

  function handValue(hand: any): number {
    if (!hand?.cards) return 0;
    let total = 0;
    let aces = 0;
    for (const card of hand.cards) {
      if (card.rank === 'A') {
        aces++;
        total += 11;
      } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
        total += 10;
      } else {
        total += parseInt(card.rank, 10);
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function playerName(id: string): string {
    return state?.players?.find((p: any) => p.id === id)?.name ?? 'Unknown';
  }

  function resultLabel(result: string): string {
    switch (result) {
      case 'blackjack': return 'Blackjack!';
      case 'win': return 'Win';
      case 'lose': return 'Lose';
      case 'push': return 'Push';
      default: return result;
    }
  }

  function resultColor(result: string): string {
    switch (result) {
      case 'blackjack': return 'gold';
      case 'win': return 'green';
      case 'lose': return 'red';
      case 'push': return 'neutral';
      default: return 'neutral';
    }
  }

  function placeBet() {
    const amount = Math.max(minBet, Math.min(maxBet, betInput));
    socket.send({ type: 'place_bet', amount });
    betPlaced = true;
  }

  function setBetPreset(amount: number) {
    betInput = Math.max(minBet, Math.min(maxBet, amount));
  }

  function leaveGame() {
    socket.send({ type: 'leave' });
    socket.disconnect();
    gameState.set(null);
    goto('/casino/blackjack');
  }

  const BET_PRESETS = [10, 25, 50, 100, 250];
</script>

{#if $error}
  <div class="error-toast">{$error}</div>
{/if}

<div class="game-page">
  {#if !state}
    <div class="loading">
      <p>Connecting...</p>
    </div>
  {:else}

    <!-- LOBBY -->
    {#if state.phase === 'lobby'}
      <div class="phase-panel">
        <div class="room-header">
          <span class="room-code-label geo-title">Room</span>
          <span class="room-code-value geo-title">{code}</span>
        </div>

        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name" class:owner-name={player.name === 'nfras4'}>{player.name}</span>
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected}<span class="dc-badge">DC</span>{/if}
              <span class="chip-count">{player.chips ?? 0} chips</span>
            </div>
          {/each}
        </div>

        <p class="player-count">
          {state.players.length} / 6 players
          {#if state.players.length < 1}
            -- Need at least 1 player to start
          {/if}
        </p>

        {#if isHost}
          <button class="btn-primary" onclick={() => socket.send({ type: 'start_game' })} disabled={state.players.length < 1}>
            Start Game
          </button>
        {:else}
          <p class="waiting-text">Waiting for host to start...</p>
        {/if}

        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
      </div>

    <!-- BETTING PHASE -->
    {:else if state.phase === 'betting'}
      <div class="phase-panel">
        <div class="room-header">
          <span class="room-code-label geo-title">Room</span>
          <span class="room-code-value geo-title">{code}</span>
        </div>

        <div class="player-chips-bar">
          {#each state.players as player}
            <div class="chip-pill" class:active-player={betsPlaced[player.id] !== undefined}>
              <span class="chip-pill-name">{player.name}</span>
              <span class="chip-pill-chips">{player.chips ?? 0}</span>
              {#if betsPlaced[player.id] !== undefined}
                <span class="chip-pill-bet">bet {betsPlaced[player.id]}</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="phase-title-row">
          <span class="phase-label geo-title">Place Your Bet</span>
          <span class="chips-display">{myChips} chips</span>
        </div>

        {#if betPlaced || myBet !== null}
          <div class="bet-confirmed">
            <span class="bet-confirmed-label geo-title">Bet placed:</span>
            <span class="bet-confirmed-amount">{myBet ?? betInput}</span>
            <p class="waiting-text">Waiting for other players...</p>
          </div>
        {:else}
          <div class="bet-controls">
            <div class="bet-presets">
              {#each BET_PRESETS as preset}
                <button
                  class="preset-btn"
                  class:active={betInput === preset}
                  onclick={() => setBetPreset(preset)}
                  disabled={preset > myChips || preset < minBet || preset > maxBet}
                >
                  {preset}
                </button>
              {/each}
            </div>
            <div class="bet-slider-row">
              <span class="bet-min">{minBet}</span>
              <input
                type="range"
                class="bet-slider"
                min={minBet}
                max={Math.min(maxBet, myChips)}
                step={5}
                bind:value={betInput}
              />
              <span class="bet-max">{Math.min(maxBet, myChips)}</span>
            </div>
            <div class="bet-amount-display">
              <span class="bet-amount-label geo-title">Bet</span>
              <span class="bet-amount-value">{betInput}</span>
            </div>
            <button class="btn-primary" onclick={placeBet} disabled={betInput < minBet || betInput > myChips}>
              Place Bet
            </button>
          </div>
        {/if}
      </div>

    <!-- PLAYING PHASE -->
    {:else if state.phase === 'playing'}
      <div class="phase-panel">
        <div class="room-header">
          <span class="room-code-label geo-title">Room</span>
          <span class="room-code-value geo-title">{code}</span>
        </div>

        <!-- Dealer area -->
        <div class="dealer-area">
          <div class="dealer-header">
            <span class="area-label geo-title">Dealer</span>
            {#if dealerRevealed && dealerValue !== null}
              <span class="hand-value" class:bust={dealerValue > 21}>{dealerValue > 21 ? 'Bust' : dealerValue}</span>
            {:else}
              <span class="hand-value-hidden">?</span>
            {/if}
          </div>
          <div class="card-row">
            {#each dealerHand as card, i}
              <Card {card} faceUp={dealerRevealed || i === 0} dealDelay={i * 120} />
            {/each}
            {#if dealerHand.length === 0}
              <span class="no-cards">Waiting for deal...</span>
            {/if}
          </div>
        </div>

        <!-- My hands -->
        {#if myHands.length > 0}
          <div class="my-hands-area">
            <div class="area-header">
              <span class="area-label geo-title">Your Hand{myHands.length > 1 ? 's' : ''}</span>
              <span class="chips-display">{myChips} chips</span>
            </div>
            {#each myHands as hand, hi}
              <div
                class="hand-block"
                class:active-hand={isMyTurn && hi === currentHandIndex}
                class:stood={hand.stood}
                class:busted={hand.busted}
              >
                <div class="hand-meta">
                  {#if myHands.length > 1}<span class="hand-index geo-title">Hand {hi + 1}</span>{/if}
                  <span class="hand-value" class:bust={handValue(hand) > 21}>
                    {hand.isBlackjack ? 'BJ' : (handValue(hand) > 21 ? 'Bust' : handValue(hand))}
                  </span>
                  {#if hand.bet}<span class="hand-bet">bet {hand.bet}</span>{/if}
                  {#if hand.stood}<span class="hand-status">Stood</span>{/if}
                  {#if hand.busted}<span class="hand-status bust-label">Bust</span>{/if}
                  {#if hand.doubled}<span class="hand-status">2x</span>{/if}
                </div>
                <div class="card-row">
                  {#each hand.cards as card, i}
                    <Card {card} faceUp={true} dealDelay={i * 120} />
                  {/each}
                </div>
              </div>
            {/each}
          </div>

          <!-- Action buttons for my turn -->
          {#if isMyTurn && activeHand && !activeHand.stood && !activeHand.busted}
            <div class="action-buttons">
              <button class="btn-action btn-hit" onclick={() => socket.send({ type: 'hit' })}>
                Hit
              </button>
              <button class="btn-action btn-stand" onclick={() => socket.send({ type: 'stand' })}>
                Stand
              </button>
              {#if canDoubleDown}
                <button class="btn-action btn-double" onclick={() => socket.send({ type: 'double_down' })}>
                  Double
                </button>
              {/if}
              {#if canSplit}
                <button class="btn-action btn-split" onclick={() => socket.send({ type: 'split' })}>
                  Split
                </button>
              {/if}
            </div>
          {:else if isMyTurn}
            <p class="waiting-text">Your turn complete</p>
          {:else if currentPlayerId}
            <div class="turn-indicator">
              <span class="waiting-turn">Waiting for {playerName(currentPlayerId)}...</span>
            </div>
          {/if}
        {:else}
          <div class="turn-indicator">
            <span class="waiting-turn">Waiting for deal...</span>
          </div>
        {/if}

        <!-- Other players' hands -->
        {#if state.players.filter((p: any) => p.id !== pid).length > 0}
          <div class="other-players">
            {#each state.players as player}
              {#if player.id !== pid}
                {@const theirHands = playerHands[player.id] ?? []}
                <div class="other-player-block">
                  <div class="other-player-header">
                    <span class="other-player-name">{player.name}</span>
                    <span class="other-player-chips">{player.chips ?? 0} chips</span>
                    {#if currentPlayerId === player.id}
                      <span class="active-indicator">Active</span>
                    {/if}
                  </div>
                  {#if theirHands.length > 0}
                    {#each theirHands as hand, hi}
                      <div class="other-hand-row">
                        {#if theirHands.length > 1}<span class="hand-index-small">H{hi + 1}</span>{/if}
                        <div class="other-cards">
                          {#each hand.cards as card, i}
                            <Card {card} faceUp={true} dealDelay={i * 100} />
                          {/each}
                        </div>
                        <span class="hand-value-small" class:bust={handValue(hand) > 21}>
                          {hand.isBlackjack ? 'BJ' : (handValue(hand) > 21 ? 'Bust' : handValue(hand))}
                        </span>
                      </div>
                    {/each}
                  {:else}
                    <span class="other-no-cards">No cards</span>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

    <!-- ROUND OVER -->
    {:else if state.phase === 'round_over'}
      <div class="phase-panel">
        <div class="room-header">
          <span class="room-code-label geo-title">Round Over</span>
        </div>

        <!-- Dealer final hand -->
        <div class="dealer-area">
          <div class="dealer-header">
            <span class="area-label geo-title">Dealer</span>
            {#if dealerValue !== null}
              <span class="hand-value" class:bust={dealerValue > 21}>{dealerValue > 21 ? 'Bust' : dealerValue}</span>
            {/if}
          </div>
          <div class="card-row">
            {#each dealerHand as card, i}
              <Card {card} faceUp={true} dealDelay={i * 80} />
            {/each}
          </div>
        </div>

        <!-- Results for all players -->
        <div class="results-section">
          {#each state.players as player}
            {@const playerResults = results?.[player.id] ?? []}
            {@const playerPayout = payouts?.[player.id] ?? 0}
            {@const theirHands = playerHands[player.id] ?? []}
            <div class="result-player-block" class:is-me={player.id === pid}>
              <div class="result-player-header">
                <span class="result-player-name">{player.name}</span>
                <span class="result-payout" class:payout-pos={playerPayout > 0} class:payout-neg={playerPayout < 0}>
                  {playerPayout > 0 ? '+' : ''}{playerPayout}
                </span>
                <span class="result-chips-after">{player.chips ?? 0} chips</span>
              </div>
              {#each theirHands as hand, hi}
                <div class="result-hand-row">
                  {#if theirHands.length > 1}<span class="hand-index-small">H{hi + 1}</span>{/if}
                  <div class="result-cards">
                    {#each hand.cards as card, i}
                      <Card {card} faceUp={true} dealDelay={i * 80} />
                    {/each}
                  </div>
                  {#if playerResults[hi]}
                    <span class="result-badge result-{resultColor(playerResults[hi])}">
                      {resultLabel(playerResults[hi])}
                    </span>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <!-- Inline bet adjuster for next round -->
        <div class="next-bet-strip">
          <span class="next-bet-label geo-title">Next Bet</span>
          <div class="next-bet-presets">
            {#each BET_PRESETS as preset}
              <button
                class="preset-btn preset-sm"
                class:active={betInput === preset}
                onclick={() => setBetPreset(preset)}
                disabled={preset > myChips || preset < minBet || preset > maxBet}
              >
                {preset}
              </button>
            {/each}
          </div>
          <span class="next-bet-amount">{betInput}</span>
        </div>

        {#if isHost}
          <div class="action-bar">
            <button class="btn-primary" onclick={() => socket.send({ type: 'next_round' })}>Deal Next Round</button>
            <button class="btn-secondary" onclick={() => socket.send({ type: 'play_again' })}>Back to Lobby</button>
          </div>
        {:else}
          <p class="waiting-text">Waiting for host to deal...</p>
        {/if}

        <button class="btn-secondary btn-leave" onclick={leaveGame}>Leave</button>
      </div>

    <!-- GAME OVER -->
    {:else if state.phase === 'game_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Game Over</h2>
        {#each state.players as player}
          <div class="result-row" class:result-winner={(player.chips ?? 0) > 0}>
            <span class="result-name">{player.name}</span>
            <span class="result-chips-final">{player.chips ?? 0} chips</span>
          </div>
        {/each}
        <button class="btn-primary" onclick={leaveGame}>Back to Lobby</button>
      </div>
    {/if}

  {/if}
</div>

<style>
  .game-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4.5rem 1rem max(2rem, env(safe-area-inset-bottom, 2rem));
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    color: var(--text-muted);
  }

  .phase-panel {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeUp 0.3s ease both;
  }

  .phase-title {
    font-size: 1.25rem;
    letter-spacing: 0.12em;
    color: #f39c12;
    text-align: center;
  }

  /* Room header */
  .room-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .room-code-label {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
  }

  .room-code-value {
    font-size: 1rem;
    letter-spacing: 0.2em;
    color: #f39c12;
  }

  /* Player list (lobby) */
  .player-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .player-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .player-item.disconnected { opacity: 0.4; }

  .player-name {
    flex: 1;
    font-size: 0.9rem;
    color: var(--text);
  }

  .owner-name { color: #f39c12; }
  .owner-crown { font-size: 0.8rem; }

  .chip-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .host-badge, .dc-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .host-badge { background: rgba(243, 156, 18, 0.15); color: #f39c12; }
  .dc-badge { background: var(--bg-input); color: var(--text-subtle); }

  .player-count {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  .waiting-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Player chips bar (betting phase) */
  .player-chips-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    justify-content: center;
  }

  .chip-pill {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.3rem 0.6rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 20px;
    font-size: 0.75rem;
    color: var(--text-muted);
    transition: border-color 0.15s;
  }

  .chip-pill.active-player {
    border-color: rgba(243, 156, 18, 0.5);
    background: rgba(243, 156, 18, 0.06);
  }

  .chip-pill-name { color: var(--text); font-weight: 500; }
  .chip-pill-chips { color: var(--text-muted); }
  .chip-pill-bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    color: #f39c12;
  }

  /* Phase title row */
  .phase-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.25rem;
  }

  .phase-label {
    font-size: 0.9rem;
    letter-spacing: 0.12em;
    color: #f39c12;
  }

  .chips-display {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  /* Bet confirmed */
  .bet-confirmed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem;
    background: var(--bg-card);
    border: 1px solid rgba(243, 156, 18, 0.3);
    border-radius: 4px;
  }

  .bet-confirmed-label {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }

  .bet-confirmed-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 2rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  /* Bet controls */
  .bet-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .bet-presets {
    display: flex;
    gap: 0.375rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: 0.4rem 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.1s;
    clip-path: none;
  }

  .preset-btn.active {
    background: rgba(243, 156, 18, 0.15);
    border-color: rgba(243, 156, 18, 0.5);
    color: #f39c12;
  }

  .preset-btn:hover:not(:disabled):not(.active) {
    border-color: var(--border-bright);
    color: var(--text);
  }

  .preset-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .bet-slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .bet-slider {
    flex: 1;
    height: 4px;
    accent-color: #f39c12;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .bet-min, .bet-max {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-subtle);
    min-width: 28px;
  }

  .bet-max { text-align: right; }

  .bet-amount-display {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .bet-amount-label {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }

  .bet-amount-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  /* Dealer area */
  .dealer-area {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .dealer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .area-label {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }

  .area-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.25rem;
  }

  .hand-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  .hand-value.bust { color: #e74c3c; }

  .hand-value-hidden {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-subtle);
    line-height: 1;
  }

  .card-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: flex-end;
  }

  .no-cards {
    font-size: 0.8rem;
    color: var(--text-subtle);
    font-style: italic;
    padding: 0.5rem 0;
  }

  /* My hands area */
  .my-hands-area {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .hand-block {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .hand-block.active-hand {
    border-color: rgba(243, 156, 18, 0.5);
    box-shadow: 0 0 12px rgba(243, 156, 18, 0.1);
  }

  .hand-block.stood { opacity: 0.65; }
  .hand-block.busted { opacity: 0.5; border-color: rgba(231, 76, 60, 0.3); }

  .hand-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .hand-index {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: var(--text-subtle);
  }

  .hand-bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-muted);
    margin-left: auto;
  }

  .hand-status {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-subtle);
    padding: 0.15rem 0.35rem;
    background: var(--bg-input);
    border-radius: 2px;
  }

  .hand-status.bust-label { color: #e74c3c; background: rgba(231, 76, 60, 0.1); }

  /* Action buttons */
  .action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-action {
    flex: 1;
    min-width: 80px;
    max-width: 140px;
    padding: 0.75rem 1rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    clip-path: none;
    transition: all 0.1s;
  }

  .btn-hit {
    background: rgba(243, 156, 18, 0.12);
    color: #f39c12;
    border-color: rgba(243, 156, 18, 0.4);
  }

  .btn-hit:hover { background: rgba(243, 156, 18, 0.22); border-color: rgba(243, 156, 18, 0.7); }

  .btn-stand {
    background: var(--bg-card);
    color: var(--text-muted);
    border-color: var(--border);
  }

  .btn-stand:hover { background: var(--bg-input); color: var(--text); }

  .btn-double {
    background: rgba(108, 180, 130, 0.1);
    color: #6cb482;
    border-color: rgba(108, 180, 130, 0.3);
  }

  .btn-double:hover { background: rgba(108, 180, 130, 0.2); }

  .btn-split {
    background: rgba(155, 89, 182, 0.1);
    color: #9b59b6;
    border-color: rgba(155, 89, 182, 0.3);
  }

  .btn-split:hover { background: rgba(155, 89, 182, 0.2); }

  /* Turn indicator */
  .turn-indicator {
    text-align: center;
    padding: 0.5rem;
  }

  .waiting-turn {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* Other players */
  .other-players {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .other-player-block {
    padding: 0.625rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .other-player-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .other-player-name {
    flex: 1;
    font-size: 0.85rem;
    color: var(--text);
    font-weight: 500;
  }

  .other-player-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .active-indicator {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #f39c12;
    padding: 0.1rem 0.35rem;
    background: rgba(243, 156, 18, 0.12);
    border-radius: 2px;
  }

  .other-hand-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .other-cards {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .hand-index-small {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--text-subtle);
    min-width: 18px;
  }

  .hand-value-small {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted);
    margin-left: auto;
  }

  .hand-value-small.bust { color: #e74c3c; }

  .other-no-cards {
    font-size: 0.75rem;
    color: var(--text-subtle);
    font-style: italic;
  }

  /* Results section */
  .results-section {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .result-player-block {
    padding: 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .result-player-block.is-me {
    border-color: rgba(243, 156, 18, 0.3);
    background: rgba(243, 156, 18, 0.04);
  }

  .result-player-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .result-player-name {
    flex: 1;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text);
  }

  .result-payout {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
  }

  .result-payout.payout-pos { color: #6cb482; }
  .result-payout.payout-neg { color: #e74c3c; }

  .result-chips-after {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .result-hand-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }

  .result-cards {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .result-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 0.2rem 0.5rem;
    border-radius: 2px;
    margin-left: auto;
  }

  .result-gold {
    background: rgba(243, 156, 18, 0.15);
    color: #f39c12;
    border: 1px solid rgba(243, 156, 18, 0.4);
  }

  .result-green {
    background: rgba(108, 180, 130, 0.12);
    color: #6cb482;
    border: 1px solid rgba(108, 180, 130, 0.3);
  }

  .result-red {
    background: rgba(231, 76, 60, 0.1);
    color: #e74c3c;
    border: 1px solid rgba(231, 76, 60, 0.25);
  }

  .result-neutral {
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
  }

  /* Next bet strip (inline in round_over) */
  .next-bet-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    flex-wrap: wrap;
  }

  .next-bet-label {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .next-bet-presets {
    display: flex;
    gap: 0.25rem;
    flex: 1;
    flex-wrap: wrap;
  }

  .preset-sm {
    padding: 0.25rem 0.5rem !important;
    font-size: 0.75rem !important;
  }

  .next-bet-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f39c12;
    min-width: 36px;
    text-align: right;
  }

  /* Action bar */
  .action-bar {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .action-bar .btn-primary,
  .action-bar .btn-secondary {
    flex: 1;
    max-width: 200px;
  }

  .btn-leave {
    align-self: center;
    min-width: 120px;
  }

  /* Game over */
  .result-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .result-row.result-winner {
    background: rgba(108, 180, 130, 0.1);
    border-color: rgba(108, 180, 130, 0.4);
    box-shadow: 0 0 16px rgba(108, 180, 130, 0.15);
  }

  .result-name {
    flex: 1;
    font-size: 1rem;
    color: var(--text);
  }

  .result-chips-final {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: #f39c12;
  }

  /* Field label */
  .field-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* Mobile */
  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      padding-bottom: max(7rem, env(safe-area-inset-bottom, 7rem));
    }

    .action-buttons {
      gap: 0.375rem;
    }

    .btn-action {
      padding: 0.65rem 0.75rem;
      font-size: 0.875rem;
    }

    .bet-presets {
      gap: 0.25rem;
    }

    .preset-btn {
      padding: 0.35rem 0.6rem;
      font-size: 0.8rem;
    }
  }

  @media (max-width: 360px) {
    .game-page {
      padding-left: 0.375rem;
      padding-right: 0.375rem;
    }

    .phase-panel {
      max-width: 100%;
    }
  }

  @media (min-width: 421px) and (max-width: 768px) {
    .phase-panel {
      max-width: 480px;
    }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
