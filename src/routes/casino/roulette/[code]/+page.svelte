<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { isLoggedIn } from '$lib/auth';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/roulette');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let reconnecting = $state(true);
  let errorTimeout: ReturnType<typeof setTimeout>;

  // Bet interaction state
  let selectedChip = $state(10);
  let spinning = $state(false);
  let spinComplete = $state(false);
  let wheelDeg = $state(0);
  let prevResult = $state<number | null>(null);

  const CHIP_VALUES = [1, 5, 10, 25, 50, 100];

  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  function numberColor(n: number): 'green' | 'red' | 'black' {
    if (n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
  }

  // European wheel number order (for visual segment positioning)
  const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
        if (msg.isSpectator !== undefined) {}
      } else if (msg.type === 'error') {
        error.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
      }
    });

    socket.connect(code, !$isLoggedIn)
      .then(() => socket.joinRoom(code))
      .catch(() => goto('/casino/roulette'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/casino/roulette');
    }
  });

  // Trigger wheel spin animation when result arrives
  $effect(() => {
    const result = state?.tableState?.result;
    if (result !== null && result !== undefined && result !== prevResult && state?.phase === 'round_over') {
      prevResult = result;
      spinning = true;
      spinComplete = false;
      // Calculate target angle: find position of result number in wheel order
      const idx = WHEEL_ORDER.indexOf(result);
      const segAngle = 360 / WHEEL_ORDER.length;
      // Add several full rotations + land on the segment
      const targetOffset = 360 - (idx * segAngle + segAngle / 2);
      wheelDeg = (wheelDeg % 360) + 1800 + targetOffset;
      setTimeout(() => {
        spinning = false;
        spinComplete = true;
      }, 3200);
    }
    if (state?.phase === 'betting') {
      spinComplete = false;
    }
  });

  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let ts = $derived(state?.tableState);
  let myBets = $derived((ts?.myBets ?? []) as { type: string; numbers: number[]; amount: number }[]);
  let myBetTotal = $derived(ts?.myBetTotal ?? 0);
  let result = $derived(ts?.result as number | null);
  let history = $derived((ts?.history ?? []) as number[]);
  let payouts = $derived(ts?.payouts as Record<string, number> | null);
  let myChips = $derived(state?.players?.find((p: any) => p.id === pid)?.chips ?? 0);

  function placeBet(type: string, numbers: number[]) {
    if (state?.phase !== 'betting') return;
    socket.send({ type: 'place_bet', bet: { type, numbers, amount: selectedChip } });
  }

  function clearBets() {
    socket.send({ type: 'clear_bets' });
  }

  function spin() {
    socket.send({ type: 'spin' });
  }

  function nextRound() {
    socket.send({ type: 'next_round' });
  }

  function playAgain() {
    socket.send({ type: 'play_again' });
  }

  function leaveGame() {
    socket.send({ type: 'leave' });
    socket.disconnect();
    gameState.set(null);
    goto('/casino/roulette');
  }

  function startGame() {
    socket.send({ type: 'start_game' });
  }

  // Check if a number has a bet on it
  function betOnNumber(n: number): number {
    return myBets
      .filter(b => b.type === 'straight' && b.numbers[0] === n)
      .reduce((sum, b) => sum + b.amount, 0);
  }

  function betOnType(type: string): number {
    return myBets
      .filter(b => b.type === type)
      .reduce((sum, b) => sum + b.amount, 0);
  }

  // Roulette grid layout: 3 columns x 12 rows (numbers 1-36), 0 spans top
  // Column mapping: col 1 = 1,4,7,...,34; col 2 = 2,5,8,...,35; col 3 = 3,6,9,...,36
  function gridRow(n: number): number {
    return Math.ceil(n / 3);
  }
  function gridCol(n: number): number {
    return ((n - 1) % 3) + 1;
  }

  const ROWS = Array.from({ length: 12 }, (_, i) => i + 1); // rows 1-12
  const COLS = [1, 2, 3];

  function numbersInRow(row: number): number[] {
    // row 1 = 1,2,3; row 2 = 4,5,6 etc
    return [(row - 1) * 3 + 1, (row - 1) * 3 + 2, (row - 1) * 3 + 3];
  }

  function myPayout(): number {
    if (!payouts || !pid) return 0;
    return payouts[pid] ?? 0;
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
        <h2 class="geo-title phase-title">Roulette Lobby</h2>
        <div class="room-code-strip">
          <span class="room-code-label">Room</span>
          <span class="room-code-val">{state.code}</span>
        </div>
        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name">{player.name}</span>
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected}<span class="dc-badge">DC</span>{/if}
              <span class="chip-count">{player.chips ?? 1000} chips</span>
            </div>
          {/each}
        </div>
        <p class="player-count">{state.players.length} player{state.players.length !== 1 ? 's' : ''} in room</p>
        {#if isHost}
          <button class="btn-primary" onclick={startGame}>
            Start Game
          </button>
        {:else}
          <p class="waiting-text">Waiting for host to start...</p>
        {/if}
        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
      </div>

    <!-- BETTING / ROUND_OVER -->
    {:else if state.phase === 'betting' || state.phase === 'round_over'}
      <div class="game-layout">

        <!-- Top bar -->
        <div class="top-bar">
          <div class="top-bar-left">
            <span class="room-code-label">Room</span>
            <span class="room-code-val">{state.code}</span>
          </div>
          <div class="player-chips-strip">
            {#each state.players as player}
              <div class="player-chip-item" class:disconnected={!player.connected}>
                <span class="pci-name">{player.name}</span>
                <span class="pci-chips">{player.chips ?? 0}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- History strip -->
        {#if history.length > 0}
          <div class="history-strip">
            <span class="history-label">Last</span>
            {#each history.slice(-20) as h}
              <span class="history-ball" class:hb-red={numberColor(h) === 'red'} class:hb-black={numberColor(h) === 'black'} class:hb-green={numberColor(h) === 'green'}>
                {h}
              </span>
            {/each}
          </div>
        {/if}

        <!-- Wheel -->
        <div class="wheel-container">
          <div class="wheel-outer">
            <div
              class="wheel-inner"
              class:spinning={spinning}
              style="transform: rotate({wheelDeg}deg); transition: {spinning ? 'transform 3.2s cubic-bezier(0.17, 0.67, 0.12, 1.0)' : 'none'};"
            >
              {#each WHEEL_ORDER as num, i}
                {@const angle = (i / WHEEL_ORDER.length) * 360}
                {@const color = numberColor(num)}
                <div
                  class="wheel-segment"
                  class:seg-red={color === 'red'}
                  class:seg-black={color === 'black'}
                  class:seg-green={color === 'green'}
                  style="transform: rotate({angle}deg);"
                >
                  <div class="seg-label" style="transform: rotate(90deg) translateY(-42px);">{num}</div>
                </div>
              {/each}
              <div class="wheel-center"></div>
            </div>
            <div class="wheel-marker"></div>
          </div>

          {#if state.phase === 'round_over' && result !== null}
            <div class="result-display" class:res-red={numberColor(result) === 'red'} class:res-black={numberColor(result) === 'black'} class:res-green={numberColor(result) === 'green'}>
              <span class="result-number">{result}</span>
              <span class="result-color-label">{numberColor(result).toUpperCase()}</span>
            </div>
          {:else if state.phase === 'betting'}
            <div class="phase-status">
              <span class="phase-status-text">Place your bets</span>
              {#if ts?.totalBettors > 0}
                <span class="bettors-count">{ts.totalBettors} betting</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Betting board -->
        <div class="betting-board">
          <!-- Zero -->
          <div class="board-zero">
            <button
              class="num-cell zero-cell"
              class:has-bet={betOnNumber(0) > 0}
              class:winning-cell={state.phase === 'round_over' && result === 0}
              onclick={() => placeBet('straight', [0])}
              disabled={state.phase !== 'betting'}
            >
              0
              {#if betOnNumber(0) > 0}
                <span class="chip-indicator">{betOnNumber(0)}</span>
              {/if}
            </button>
          </div>

          <!-- Number grid: 12 rows x 3 cols -->
          <div class="number-grid">
            {#each ROWS as row}
              {#each numbersInRow(row) as n}
                {@const nc = numberColor(n)}
                <button
                  class="num-cell"
                  class:cell-red={nc === 'red'}
                  class:cell-black={nc === 'black'}
                  class:has-bet={betOnNumber(n) > 0}
                  class:winning-cell={state.phase === 'round_over' && result === n}
                  onclick={() => placeBet('straight', [n])}
                  disabled={state.phase !== 'betting'}
                >
                  {n}
                  {#if betOnNumber(n) > 0}
                    <span class="chip-indicator">{betOnNumber(n)}</span>
                  {/if}
                </button>
              {/each}
            {/each}
          </div>

          <!-- Column bets -->
          <div class="column-bets">
            <button
              class="outside-bet col-bet"
              class:has-bet={betOnType('column1') > 0}
              onclick={() => placeBet('column', [1])}
              disabled={state.phase !== 'betting'}
            >
              Col 1
              {#if betOnType('column1') > 0}<span class="chip-indicator">{betOnType('column1')}</span>{/if}
            </button>
            <button
              class="outside-bet col-bet"
              class:has-bet={betOnType('column2') > 0}
              onclick={() => placeBet('column', [2])}
              disabled={state.phase !== 'betting'}
            >
              Col 2
              {#if betOnType('column2') > 0}<span class="chip-indicator">{betOnType('column2')}</span>{/if}
            </button>
            <button
              class="outside-bet col-bet"
              class:has-bet={betOnType('column3') > 0}
              onclick={() => placeBet('column', [3])}
              disabled={state.phase !== 'betting'}
            >
              Col 3
              {#if betOnType('column3') > 0}<span class="chip-indicator">{betOnType('column3')}</span>{/if}
            </button>
          </div>

          <!-- Outside bets row 1: dozens -->
          <div class="outside-row">
            <button
              class="outside-bet dozen-bet"
              class:has-bet={betOnType('dozen1') > 0}
              onclick={() => placeBet('dozen', [1])}
              disabled={state.phase !== 'betting'}
            >
              1st 12
              {#if betOnType('dozen1') > 0}<span class="chip-indicator">{betOnType('dozen1')}</span>{/if}
            </button>
            <button
              class="outside-bet dozen-bet"
              class:has-bet={betOnType('dozen2') > 0}
              onclick={() => placeBet('dozen', [2])}
              disabled={state.phase !== 'betting'}
            >
              2nd 12
              {#if betOnType('dozen2') > 0}<span class="chip-indicator">{betOnType('dozen2')}</span>{/if}
            </button>
            <button
              class="outside-bet dozen-bet"
              class:has-bet={betOnType('dozen3') > 0}
              onclick={() => placeBet('dozen', [3])}
              disabled={state.phase !== 'betting'}
            >
              3rd 12
              {#if betOnType('dozen3') > 0}<span class="chip-indicator">{betOnType('dozen3')}</span>{/if}
            </button>
          </div>

          <!-- Outside bets row 2: even-money -->
          <div class="outside-row">
            <button
              class="outside-bet evenmoney-bet"
              class:has-bet={betOnType('low') > 0}
              onclick={() => placeBet('low', [])}
              disabled={state.phase !== 'betting'}
            >
              1-18
              {#if betOnType('low') > 0}<span class="chip-indicator">{betOnType('low')}</span>{/if}
            </button>
            <button
              class="outside-bet evenmoney-bet"
              class:has-bet={betOnType('even') > 0}
              onclick={() => placeBet('even', [])}
              disabled={state.phase !== 'betting'}
            >
              Even
              {#if betOnType('even') > 0}<span class="chip-indicator">{betOnType('even')}</span>{/if}
            </button>
            <button
              class="outside-bet evenmoney-bet bet-red"
              class:has-bet={betOnType('red') > 0}
              onclick={() => placeBet('red', [])}
              disabled={state.phase !== 'betting'}
            >
              Red
              {#if betOnType('red') > 0}<span class="chip-indicator">{betOnType('red')}</span>{/if}
            </button>
            <button
              class="outside-bet evenmoney-bet bet-black"
              class:has-bet={betOnType('black') > 0}
              onclick={() => placeBet('black', [])}
              disabled={state.phase !== 'betting'}
            >
              Black
              {#if betOnType('black') > 0}<span class="chip-indicator">{betOnType('black')}</span>{/if}
            </button>
            <button
              class="outside-bet evenmoney-bet"
              class:has-bet={betOnType('odd') > 0}
              onclick={() => placeBet('odd', [])}
              disabled={state.phase !== 'betting'}
            >
              Odd
              {#if betOnType('odd') > 0}<span class="chip-indicator">{betOnType('odd')}</span>{/if}
            </button>
            <button
              class="outside-bet evenmoney-bet"
              class:has-bet={betOnType('high') > 0}
              onclick={() => placeBet('high', [])}
              disabled={state.phase !== 'betting'}
            >
              19-36
              {#if betOnType('high') > 0}<span class="chip-indicator">{betOnType('high')}</span>{/if}
            </button>
          </div>
        </div>

        <!-- Bet controls -->
        <div class="bet-controls">
          <div class="chip-selector">
            {#each CHIP_VALUES as val}
              <button
                class="chip-btn"
                class:chip-selected={selectedChip === val}
                onclick={() => selectedChip = val}
              >
                {val}
              </button>
            {/each}
          </div>

          <div class="bet-summary">
            <span class="bet-summary-label">Total bet:</span>
            <span class="bet-summary-val">{myBetTotal}</span>
            <span class="bet-summary-label">Chips:</span>
            <span class="bet-summary-val">{myChips}</span>
          </div>

          <div class="bet-actions">
            {#if state.phase === 'betting'}
              <button class="btn-secondary btn-sm" onclick={clearBets} disabled={myBetTotal === 0}>
                Clear Bets
              </button>
              {#if isHost}
                <button class="btn-primary btn-sm spin-btn" onclick={spin}>
                  Spin!
                </button>
              {/if}
            {:else if state.phase === 'round_over'}
              <!-- Payout display -->
              {#if payouts !== null}
                <div class="payout-panel fade-in">
                  {#if myPayout() > 0}
                    <span class="payout-win">+{myPayout()} chips</span>
                  {:else if myBetTotal > 0}
                    <span class="payout-lose">-{myBetTotal} chips</span>
                  {:else}
                    <span class="payout-none">No bets placed</span>
                  {/if}
                </div>
              {/if}
              {#if isHost}
                <button class="btn-primary btn-sm" onclick={nextRound}>
                  Next Round
                </button>
              {:else}
                <p class="waiting-text">Waiting for host...</p>
              {/if}
            {/if}
          </div>
        </div>

        <!-- All players payouts on round over -->
        {#if state.phase === 'round_over' && payouts !== null}
          <div class="all-payouts fade-in">
            <span class="all-payouts-label">Round Results</span>
            {#each state.players as player}
              {@const payout = payouts[player.id] ?? 0}
              <div class="payout-row">
                <span class="pr-name">{player.name}</span>
                <span class="pr-chips">{player.chips ?? 0} chips</span>
                {#if payout > 0}
                  <span class="pr-win">+{payout}</span>
                {:else}
                  <span class="pr-neutral">--</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

      </div>

    <!-- GAME OVER / back to lobby -->
    {:else if state.phase === 'lobby_again'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Roulette</h2>
        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name">{player.name}</span>
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              <span class="chip-count">{player.chips ?? 0} chips</span>
            </div>
          {/each}
        </div>
        {#if isHost}
          <button class="btn-primary" onclick={startGame}>Start New Game</button>
          <button class="btn-secondary" onclick={playAgain}>Play Again (same players)</button>
        {:else}
          <p class="waiting-text">Waiting for host...</p>
        {/if}
        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
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
    padding: 4.5rem 0.75rem max(2rem, env(safe-area-inset-bottom, 2rem));
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    color: var(--text-muted);
  }

  /* ---- Lobby ---- */
  .phase-panel {
    width: 100%;
    max-width: 500px;
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

  .room-code-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    padding: 0.4rem 0;
  }

  .room-code-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .room-code-val {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: #f39c12;
  }

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

  .host-badge { background: rgba(243, 156, 18, 0.12); color: #f39c12; }
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

  /* ---- Game layout ---- */
  .game-layout {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Top bar */
  .top-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .player-chips-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    flex: 1;
  }

  .player-chip-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .player-chip-item.disconnected { opacity: 0.4; }

  .pci-name {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .pci-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: #f39c12;
  }

  /* History strip */
  .history-strip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    overflow-x: auto;
    padding: 0.25rem 0;
    scrollbar-width: none;
  }

  .history-strip::-webkit-scrollbar { display: none; }

  .history-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
    flex-shrink: 0;
    margin-right: 0.125rem;
  }

  .history-ball {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    color: #fff;
  }

  .hb-red { background: #c0392b; }
  .hb-black { background: #1a1a1a; border: 1px solid #444; }
  .hb-green { background: #1e7e34; }

  /* ---- Wheel ---- */
  .wheel-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .wheel-outer {
    position: relative;
    width: 180px;
    height: 180px;
    flex-shrink: 0;
  }

  .wheel-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    position: relative;
    overflow: hidden;
    border: 3px solid #f39c12;
    box-shadow: 0 0 24px rgba(243, 156, 18, 0.25), inset 0 0 12px rgba(0,0,0,0.5);
    will-change: transform;
  }

  .wheel-segment {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 50%;
    height: 2px;
    transform-origin: left center;
    overflow: visible;
  }

  .seg-red::before {
    content: '';
    position: absolute;
    left: 0;
    top: -45px;
    width: 100%;
    height: 90px;
    background: #c0392b;
    clip-path: polygon(0 50%, 100% 0%, 100% 100%);
    opacity: 0.9;
  }

  .seg-black::before {
    content: '';
    position: absolute;
    left: 0;
    top: -45px;
    width: 100%;
    height: 90px;
    background: #1a1a1a;
    clip-path: polygon(0 50%, 100% 0%, 100% 100%);
    opacity: 0.9;
  }

  .seg-green::before {
    content: '';
    position: absolute;
    left: 0;
    top: -45px;
    width: 100%;
    height: 90px;
    background: #1e7e34;
    clip-path: polygon(0 50%, 100% 0%, 100% 100%);
    opacity: 0.9;
  }

  .seg-label {
    position: absolute;
    left: 28px;
    top: -5px;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.42rem;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
    width: 10px;
    text-align: center;
    pointer-events: none;
  }

  .wheel-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #f39c12;
    z-index: 10;
    box-shadow: 0 0 8px rgba(243, 156, 18, 0.6);
  }

  .wheel-marker {
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-top: 14px solid #f39c12;
    z-index: 20;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
  }

  .result-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 1.5rem;
    border-radius: 4px;
    border: 2px solid;
    animation: fadeUp 0.4s ease both;
  }

  .res-red { background: rgba(192, 57, 43, 0.2); border-color: #c0392b; }
  .res-black { background: rgba(26, 26, 26, 0.6); border-color: #555; }
  .res-green { background: rgba(30, 126, 52, 0.2); border-color: #1e7e34; }

  .result-number {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 2.25rem;
    font-weight: 700;
    color: #fff;
    line-height: 1;
  }

  .result-color-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: rgba(255,255,255,0.6);
  }

  .phase-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .phase-status-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #f39c12;
  }

  .bettors-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* ---- Betting board ---- */
  .betting-board {
    background: #0b3d1a;
    border: 2px solid rgba(243, 156, 18, 0.3);
    border-radius: 6px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .board-zero {
    display: flex;
    justify-content: center;
    margin-bottom: 0.125rem;
  }

  .zero-cell {
    width: 100%;
    background: #1e7e34 !important;
    color: #fff !important;
  }

  .number-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
  }

  .num-cell {
    position: relative;
    padding: 0.4rem 0.2rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    color: #fff;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 2px;
    cursor: pointer;
    text-align: center;
    transition: filter 0.12s, transform 0.08s;
    line-height: 1;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .num-cell:disabled {
    cursor: default;
  }

  .num-cell:not(:disabled):hover {
    filter: brightness(1.3);
    transform: scale(1.05);
    z-index: 1;
  }

  .num-cell:not(:disabled):active {
    transform: scale(0.96);
  }

  .cell-red { background: #a93226; }
  .cell-black { background: #1c1c1c; }

  .num-cell.has-bet {
    outline: 2px solid #f39c12;
    outline-offset: -2px;
  }

  .num-cell.winning-cell {
    background: #f39c12 !important;
    color: #000 !important;
    outline: none;
    box-shadow: 0 0 12px rgba(243, 156, 18, 0.6);
    animation: pulseWin 0.5s ease 3;
  }

  @keyframes pulseWin {
    0%, 100% { box-shadow: 0 0 8px rgba(243, 156, 18, 0.5); }
    50% { box-shadow: 0 0 20px rgba(243, 156, 18, 0.9); }
  }

  .chip-indicator {
    position: absolute;
    bottom: 1px;
    right: 2px;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.5rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
    pointer-events: none;
  }

  .column-bets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    margin-top: 0.125rem;
  }

  .outside-row {
    display: flex;
    gap: 2px;
  }

  .outside-bet {
    flex: 1;
    position: relative;
    padding: 0.35rem 0.2rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.8);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 2px;
    cursor: pointer;
    text-align: center;
    transition: filter 0.12s, background 0.12s;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .outside-bet:not(:disabled):hover {
    filter: brightness(1.3);
    background: rgba(255,255,255,0.12);
  }

  .outside-bet:disabled {
    cursor: default;
  }

  .outside-bet.has-bet {
    outline: 2px solid #f39c12;
    outline-offset: -2px;
    color: #f39c12;
  }

  .col-bet { background: rgba(243, 156, 18, 0.08); }
  .dozen-bet { background: rgba(255,255,255,0.05); }
  .evenmoney-bet { background: rgba(255,255,255,0.05); }

  .bet-red { background: rgba(169, 50, 38, 0.5) !important; }
  .bet-red:not(:disabled):hover { background: rgba(169, 50, 38, 0.7) !important; filter: none; }

  .bet-black { background: rgba(28, 28, 28, 0.8) !important; border-color: rgba(255,255,255,0.25) !important; }
  .bet-black:not(:disabled):hover { background: rgba(60, 60, 60, 0.8) !important; filter: none; }

  /* ---- Bet controls ---- */
  .bet-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .chip-selector {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .chip-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    background: #1c1c1c;
    color: #f39c12;
    border: 2px solid rgba(243, 156, 18, 0.3);
    cursor: pointer;
    transition: all 0.12s;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .chip-btn:hover {
    border-color: #f39c12;
    background: rgba(243, 156, 18, 0.1);
  }

  .chip-btn.chip-selected {
    background: #f39c12;
    color: #000;
    border-color: #f39c12;
    box-shadow: 0 0 10px rgba(243, 156, 18, 0.4);
  }

  .bet-summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .bet-summary-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .bet-summary-val {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: #f39c12;
    margin-right: 0.5rem;
  }

  .bet-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
  }

  .btn-sm {
    padding: 0.5rem 1rem !important;
    font-size: 0.875rem !important;
  }

  .spin-btn {
    background: linear-gradient(135deg, #f39c12, #d68910) !important;
    color: #000 !important;
    font-weight: 700 !important;
    letter-spacing: 0.08em;
  }

  .spin-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: scale(1.02);
  }

  /* ---- Payout panel ---- */
  .payout-panel {
    padding: 0.4rem 1rem;
    border-radius: 4px;
    text-align: center;
  }

  .payout-win {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: #2ecc71;
    text-shadow: 0 0 12px rgba(46, 204, 113, 0.4);
  }

  .payout-lose {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #e74c3c;
  }

  .payout-none {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* All payouts */
  .all-payouts {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: rgba(243, 156, 18, 0.04);
    border: 1px solid rgba(243, 156, 18, 0.15);
    border-radius: 4px;
  }

  .all-payouts-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-subtle);
    text-align: center;
    margin-bottom: 0.125rem;
  }

  .payout-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.2rem 0.25rem;
  }

  .pr-name {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .pr-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .pr-win {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #2ecc71;
    min-width: 36px;
    text-align: right;
  }

  .pr-neutral {
    font-size: 0.75rem;
    color: var(--text-subtle);
    min-width: 36px;
    text-align: right;
  }

  /* Mobile */
  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.375rem;
      padding-right: 0.375rem;
    }

    .wheel-outer {
      width: 150px;
      height: 150px;
    }

    .chip-btn {
      width: 34px;
      height: 34px;
      font-size: 0.72rem;
    }

    .num-cell {
      font-size: 0.65rem;
      min-height: 24px;
    }
  }

  button:focus-visible { outline: 2px solid #f39c12; outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
