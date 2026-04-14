<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { isLoggedIn, userStats } from '$lib/auth';
  import Card from '$lib/components/cards/Card.svelte';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/baccarat');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let reconnecting = $state(true);
  let betInput = $state(25);
  let myBetType: 'player' | 'banker' | 'tie' | null = $state(null);
  let errorTimeout: ReturnType<typeof setTimeout>;
  let bettingTimeLeft = $state(0);
  let nextRoundIn = $state(0);

  const BET_PRESETS = [10, 25, 50, 100, 250];

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
        if (msg.state?.phase === 'betting') {
          myBetType = null;
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
      .catch(() => goto('/casino/baccarat'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/casino/baccarat');
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let myPlayer = $derived(state?.players?.find((p: any) => p.id === pid));
  let ts = $derived(state?.tableState);
  let playerHand = $derived((ts?.playerHand ?? []) as { suit: string; rank: string; value: number }[]);
  let bankerHand = $derived((ts?.bankerHand ?? []) as { suit: string; rank: string; value: number }[]);
  // Backend sends playerBets as Record<string, BaccaratBet[]> - flatten to first bet per player for display
  let playerBetsRaw = $derived((ts?.playerBets ?? {}) as Record<string, { type: string; amount: number }[]>);
  let betsPlaced = $derived(
    Object.fromEntries(
      Object.entries(playerBetsRaw)
        .filter(([, bets]) => bets.length > 0)
        .map(([id, bets]) => [id, bets[0]])
    ) as Record<string, { type: string; amount: number }>
  );
  let payouts = $derived(ts?.payouts as Record<string, number> | null);
  let winner = $derived(ts?.result as string | null);
  let myChips = $derived(myPlayer?.chips ?? 0);
  let minBet = $derived(state?.minBet ?? 10);
  let maxBet = $derived(state?.maxBet ?? 10000);
  let myBetInfo = $derived(pid ? betsPlaced[pid] ?? null : null);

  // Sync chips to nav bar
  $effect(() => {
    if (myChips !== undefined && myChips !== null) {
      userStats.update(s => s ? { ...s, chips: myChips } : s);
    }
  });

  // Betting countdown timer
  $effect(() => {
    if (state?.phase === 'betting' && ts?.bettingEndsAt > 0) {
      const endAt = ts.bettingEndsAt;
      const update = () => {
        bettingTimeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      };
      update();
      const interval = setInterval(update, 200);
      return () => clearInterval(interval);
    } else {
      bettingTimeLeft = 0;
    }
  });

  // Round-over countdown timer
  $effect(() => {
    if (state?.phase === 'round_over' && ts?.displayEndsAt > 0) {
      const endAt = ts.displayEndsAt;
      const update = () => {
        nextRoundIn = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      };
      update();
      const interval = setInterval(update, 200);
      return () => clearInterval(interval);
    } else {
      nextRoundIn = 0;
    }
  });

  function handTotal(cards: { suit: string; rank: string; value: number }[]): number {
    if (!cards || cards.length === 0) return 0;
    let total = 0;
    for (const card of cards) {
      if (card.rank === 'A') {
        total += 1;
      } else if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J' || card.rank === '10') {
        total += 0;
      } else {
        total += parseInt(card.rank, 10);
      }
    }
    return total % 10;
  }

  function placeBet(type: 'player' | 'banker' | 'tie') {
    myBetType = type;
    socket.send({ type: 'place_bet', bet: { type, amount: betInput } });
  }

  function clearBets() {
    myBetType = null;
    socket.send({ type: 'clear_bets' });
  }

  function leaveGame() {
    socket.send({ type: 'leave' });
    socket.disconnect();
    gameState.set(null);
    goto('/casino/baccarat');
  }

  function setBetPreset(amount: number) {
    betInput = Math.max(minBet, Math.min(maxBet, amount));
  }

  function winnerLabel(w: string | null): string {
    if (w === 'player') return 'Player Wins';
    if (w === 'banker') return 'Banker Wins';
    if (w === 'tie') return 'Tie';
    return '';
  }

  function winnerColor(w: string | null): string {
    if (w === 'player') return 'blue';
    if (w === 'banker') return 'red';
    if (w === 'tie') return 'green';
    return 'neutral';
  }
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
          {state.players.length} player{state.players.length !== 1 ? 's' : ''}
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
              <span class="chip-pill-name">
                {player.name}
                {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              </span>
              <span class="chip-pill-chips">{player.chips ?? 0}</span>
              {#if betsPlaced[player.id] !== undefined}
                <span class="chip-pill-bet">{betsPlaced[player.id].type}</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="phase-title-row">
          <span class="phase-label geo-title">Place Your Bet</span>
          <span class="chips-display">{myChips} chips</span>
        </div>

        {#if bettingTimeLeft > 0}
          <div class="countdown-bar">
            <div class="countdown-fill" style="width: {(bettingTimeLeft / 20) * 100}%"></div>
            <span class="countdown-text" class:countdown-urgent={bettingTimeLeft <= 5}>{bettingTimeLeft}s</span>
          </div>
        {/if}

        {#if myBetInfo || myBetType}
          <div class="bet-confirmed">
            <span class="bet-confirmed-label geo-title">Bet placed on</span>
            <span class="bet-confirmed-type bet-type-{myBetInfo?.type ?? myBetType}">{(myBetInfo?.type ?? myBetType ?? '').toUpperCase()}</span>
            <span class="bet-confirmed-amount">{myBetInfo?.amount ?? betInput} chips</span>
            <button class="btn-ghost btn-sm" onclick={clearBets}>Change Bet</button>
            <p class="waiting-text">Waiting for other players...</p>
          </div>
        {:else}
          <div class="bet-controls">
            <div class="bet-type-buttons">
              <button
                class="bet-type-btn bet-type-player"
                class:selected={myBetType === 'player'}
                onclick={() => placeBet('player')}
              >
                <span class="bet-type-name">Player</span>
                <span class="bet-type-payout">1:1</span>
              </button>
              <button
                class="bet-type-btn bet-type-tie"
                class:selected={myBetType === 'tie'}
                onclick={() => placeBet('tie')}
              >
                <span class="bet-type-name">Tie</span>
                <span class="bet-type-payout">8:1</span>
              </button>
              <button
                class="bet-type-btn bet-type-banker"
                class:selected={myBetType === 'banker'}
                onclick={() => placeBet('banker')}
              >
                <span class="bet-type-name">Banker</span>
                <span class="bet-type-payout">1:1 (½ on 6)</span>
              </button>
            </div>

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
                value={betInput} oninput={(e) => betInput = Number(e.currentTarget.value)}
              />
              <span class="bet-max">{Math.min(maxBet, myChips)}</span>
            </div>

            <div class="bet-amount-display">
              <span class="bet-amount-label geo-title">Bet</span>
              <span class="bet-amount-value">{betInput}</span>
            </div>
          </div>
        {/if}
      </div>

    <!-- RESOLVING PHASE (cards being dealt) -->
    {:else if state.phase === 'resolving'}
      <div class="phase-panel">
        <div class="room-header">
          <span class="room-code-label geo-title">Room</span>
          <span class="room-code-value geo-title">{code}</span>
        </div>

        <div class="player-chips-bar">
          {#each state.players as player}
            <div class="chip-pill" class:active-player={betsPlaced[player.id] !== undefined}>
              <span class="chip-pill-name">
                {player.name}
                {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              </span>
              <span class="chip-pill-chips">{player.chips ?? 0}</span>
              {#if betsPlaced[player.id] !== undefined}
                <span class="chip-pill-bet bet-type-{betsPlaced[player.id].type}">{betsPlaced[player.id].type}</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="hands-container">
          <div class="hand-area">
            <div class="hand-header">
              <span class="area-label geo-title">Player</span>
              {#if playerHand.length > 0}
                <span class="hand-value">{handTotal(playerHand)}</span>
              {/if}
            </div>
            <div class="card-row">
              {#each playerHand as card, i}
                <Card {card} faceUp={true} dealDelay={i * 150} />
              {/each}
              {#if playerHand.length === 0}
                <span class="no-cards">Dealing...</span>
              {/if}
            </div>
          </div>

          <div class="hand-divider"></div>

          <div class="hand-area">
            <div class="hand-header">
              <span class="area-label geo-title">Banker</span>
              {#if bankerHand.length > 0}
                <span class="hand-value">{handTotal(bankerHand)}</span>
              {/if}
            </div>
            <div class="card-row">
              {#each bankerHand as card, i}
                <Card {card} faceUp={true} dealDelay={i * 150} />
              {/each}
              {#if bankerHand.length === 0}
                <span class="no-cards">Dealing...</span>
              {/if}
            </div>
          </div>
        </div>

        <p class="waiting-text">Cards being dealt...</p>
      </div>

    <!-- ROUND OVER -->
    {:else if state.phase === 'round_over'}
      <div class="phase-panel">
        <div class="room-header">
          <span class="room-code-label geo-title">Round Over</span>
        </div>

        {#if winner}
          <div class="winner-banner winner-{winnerColor(winner)}">
            <span class="winner-label geo-title">{winnerLabel(winner)}</span>
          </div>
        {/if}

        <div class="hands-container">
          <div class="hand-area">
            <div class="hand-header">
              <span class="area-label geo-title">Player</span>
              <span class="hand-value" class:winner-hand={winner === 'player'}>{handTotal(playerHand)}</span>
            </div>
            <div class="card-row">
              {#each playerHand as card, i}
                <Card {card} faceUp={true} dealDelay={i * 80} />
              {/each}
            </div>
          </div>

          <div class="hand-divider"></div>

          <div class="hand-area">
            <div class="hand-header">
              <span class="area-label geo-title">Banker</span>
              <span class="hand-value" class:winner-hand={winner === 'banker'}>{handTotal(bankerHand)}</span>
            </div>
            <div class="card-row">
              {#each bankerHand as card, i}
                <Card {card} faceUp={true} dealDelay={i * 80} />
              {/each}
            </div>
          </div>
        </div>

        <div class="results-section">
          {#each state.players as player}
            {@const playerPayout = payouts?.[player.id] ?? 0}
            {@const playerBet = betsPlaced[player.id]}
            <div class="result-player-block" class:is-me={player.id === pid}>
              <div class="result-player-header">
                <span class="result-player-name">
                  {player.name}
                  {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
                </span>
                {#if playerBet}
                  <span class="result-bet-type bet-type-{playerBet.type}">{playerBet.type}</span>
                {/if}
                <span class="result-payout" class:payout-pos={playerPayout > 0} class:payout-neg={playerPayout < 0}>
                  {playerPayout > 0 ? '+' : ''}{playerPayout}
                </span>
                <span class="result-chips-after">{player.chips ?? 0} chips</span>
              </div>
            </div>
          {/each}
        </div>

        <div class="next-round-timer">
          <span class="next-round-label">Next round in {nextRoundIn}s</span>
          <div class="countdown-bar mini">
            <div class="countdown-fill" style="width: {(nextRoundIn / 6) * 100}%"></div>
          </div>
        </div>

        <button class="btn-secondary btn-leave" onclick={leaveGame}>Leave</button>
      </div>

    <!-- GAME OVER -->
    {:else if state.phase === 'game_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Game Over</h2>
        {#each state.players as player}
          <div class="result-row">
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
    max-width: 540px;
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

  /* Player chips bar */
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
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
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

  /* Countdown bar */
  .countdown-bar {
    position: relative;
    height: 4px;
    background: var(--bg-input);
    border-radius: 2px;
    overflow: hidden;
  }

  .countdown-bar.mini { height: 3px; }

  .countdown-fill {
    height: 100%;
    background: linear-gradient(90deg, #f39c12, #f5c842);
    border-radius: 2px;
    transition: width 0.2s linear;
  }

  .countdown-text {
    position: absolute;
    right: 0;
    top: -1.4rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .countdown-text.countdown-urgent { color: #e74c3c; }

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
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
  }

  .bet-confirmed-type {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1;
  }

  .bet-confirmed-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  .btn-ghost {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: 2px;
    cursor: pointer;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    clip-path: none;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-ghost:hover { border-color: var(--border-bright); color: var(--text); }

  .btn-sm { padding: 0.3rem 0.75rem; }

  /* Bet controls */
  .bet-controls {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.25rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  /* Bet type buttons */
  .bet-type-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
  }

  .bet-type-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.875rem 0.5rem;
    background: var(--bg-input);
    border: 2px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
    clip-path: none;
  }

  .bet-type-btn:hover:not(:disabled) {
    border-color: var(--border-bright);
    background: rgba(255,255,255,0.04);
  }

  .bet-type-btn.selected {
    border-color: currentColor;
    background: rgba(255,255,255,0.06);
  }

  .bet-type-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text);
  }

  .bet-type-payout {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* Bet type color theming */
  .bet-type-player { color: #4a9eff; }
  .bet-type-banker { color: #e74c3c; }
  .bet-type-tie { color: #2ecc71; }

  .bet-type-btn.bet-type-player.selected .bet-type-name { color: #4a9eff; }
  .bet-type-btn.bet-type-banker.selected .bet-type-name { color: #e74c3c; }
  .bet-type-btn.bet-type-tie.selected .bet-type-name { color: #2ecc71; }

  /* Bet presets */
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
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
  }

  .bet-amount-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  /* Hands container - side by side */
  .hands-container {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 0.75rem;
    align-items: start;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1rem;
  }

  .hand-area {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .hand-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .area-label {
    font-size: 0.7rem;
    letter-spacing: 0.14em;
    color: var(--text-muted);
  }

  .hand-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  .hand-value.winner-hand {
    color: #2ecc71;
    text-shadow: 0 0 8px rgba(46, 204, 113, 0.4);
  }

  .hand-divider {
    width: 1px;
    background: var(--border);
    align-self: stretch;
    margin: 0 0.25rem;
  }

  .card-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: flex-end;
    min-height: 60px;
  }

  .no-cards {
    font-size: 0.8rem;
    color: var(--text-subtle);
    font-style: italic;
    padding: 0.5rem 0;
  }

  /* Winner banner */
  .winner-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.875rem;
    border-radius: 4px;
    border: 1px solid;
  }

  .winner-banner.winner-blue {
    background: rgba(74, 158, 255, 0.1);
    border-color: rgba(74, 158, 255, 0.4);
  }

  .winner-banner.winner-red {
    background: rgba(231, 76, 60, 0.1);
    border-color: rgba(231, 76, 60, 0.4);
  }

  .winner-banner.winner-green {
    background: rgba(46, 204, 113, 0.1);
    border-color: rgba(46, 204, 113, 0.4);
  }

  .winner-label {
    font-size: 1.1rem;
    letter-spacing: 0.14em;
    color: var(--text);
  }

  /* Results section */
  .results-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .result-player-block {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.625rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .result-player-block.is-me {
    border-color: rgba(243, 156, 18, 0.3);
    background: rgba(243, 156, 18, 0.04);
  }

  .result-player-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .result-player-name {
    flex: 1;
    font-size: 0.9rem;
    color: var(--text);
    font-weight: 500;
  }

  .result-bet-type {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.1rem 0.35rem;
    border-radius: 2px;
    background: rgba(255,255,255,0.05);
  }

  .result-payout {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
  }

  .result-payout.payout-pos { color: #2ecc71; }
  .result-payout.payout-neg { color: #e74c3c; }

  .result-chips-after {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* Next round timer */
  .next-round-timer {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .next-round-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .btn-leave {
    align-self: center;
    min-width: 120px;
  }

  /* Result row (game over) */
  .result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .result-name {
    font-size: 0.9rem;
    color: var(--text);
  }

  .result-chips-final {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    color: #f39c12;
  }
</style>
