<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { isLoggedIn, userStats } from '$lib/auth';
  import { fireWinConfetti } from '$lib/vfx';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/roulette');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let reconnecting = $state(true);
  let errorTimeout: ReturnType<typeof setTimeout>;

  // Bet interaction state
  let betAmount = $state(10);
  let sliding = $state(false);
  let stripOffset = $state(0);
  let showResult = $state(false);
  let displayedChips = $state(0);
  let chipAnimating = $state(false);

  // Countdown timers
  let timeLeft = $state(0);
  let nextRoundIn = $state(0);

  // Tick SFX using Web Audio API
  let audioCtx: AudioContext | null = null;
  function playTick() {
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 800 + Math.random() * 400;
      osc.type = 'square';
      gain.gain.value = 0.06;
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.04);
    } catch {}
  }

  function startTickSfx() {
    let count = 0;
    const maxTicks = 40;
    function tick() {
      if (count >= maxTicks || !sliding) return;
      playTick();
      count++;
      const delay = 40 + (count / maxTicks) * 160;
      setTimeout(tick, delay);
    }
    tick();
  }

  // Animate chip count up/down
  function animateChips(target: number) {
    const start = displayedChips;
    const diff = target - start;
    if (diff === 0) return;
    chipAnimating = true;
    const steps = 20;
    const stepTime = 40;
    let step = 0;
    function frame() {
      step++;
      displayedChips = Math.round(start + (diff * step) / steps);
      if (step < steps) {
        setTimeout(frame, stepTime);
      } else {
        displayedChips = target;
        chipAnimating = false;
      }
    }
    frame();
  }

  const STRIP_PATTERN = ['red','black','red','black','red','black','red','black','red','black','red','black','red','green','black'];
  const SEGMENT_WIDTH = 56;
  const REPETITIONS = 10;
  const TOTAL_SEGMENTS = STRIP_PATTERN.length * REPETITIONS;

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

  const SEGMENT_GAP = 6;
  const SEGMENT_STEP = SEGMENT_WIDTH + SEGMENT_GAP;
  let prevPhase = $state<string | null>(null);

  // Trigger strip slide animation when result arrives
  $effect(() => {
    const slotIndex = state?.tableState?.resultSlotIndex;
    const phase = state?.phase;
    if (slotIndex !== null && slotIndex !== undefined && phase === 'round_over' && !sliding && prevPhase !== 'round_over') {
      sliding = true;
      showResult = false;
      prevPhase = 'round_over';
      // Land on segment in a random middle repetition for visual variety
      const rep = 4 + Math.floor(Math.random() * 3);
      const targetSeg = rep * STRIP_PATTERN.length + slotIndex;
      const viewport = document.querySelector('.strip-viewport');
      const containerCenter = viewport ? viewport.clientWidth / 2 : 250;
      stripOffset = targetSeg * SEGMENT_STEP + SEGMENT_WIDTH / 2 - containerCenter;
      // Start tick SFX
      startTickSfx();
      // Show result + VFX after spin completes
      setTimeout(() => {
        sliding = false;
        showResult = true;
        // Check if we won and fire VFX
        const payout = myPayout();
        if (payout > 0) {
          fireWinConfetti();
        }
        // Animate chip count
        animateChips(myChips);
      }, 3200);
    }
    if (phase === 'betting') {
      showResult = false;
      prevPhase = 'betting';
      stripOffset = 0;
      // Sync displayed chips without animation
      displayedChips = myChips;
    }
  });

  // Initialize displayedChips when first connected
  $effect(() => {
    if (myChips > 0 && displayedChips === 0 && !chipAnimating) {
      displayedChips = myChips;
    }
  });

  // Betting countdown timer
  $effect(() => {
    if (state?.phase === 'betting' && ts?.bettingEndsAt > 0) {
      const endAt = ts.bettingEndsAt;
      const update = () => {
        timeLeft = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      };
      update();
      const interval = setInterval(update, 200);
      return () => clearInterval(interval);
    } else {
      timeLeft = 0;
    }
  });

  // Next round countdown timer
  $effect(() => {
    if (state?.phase === 'round_over' && ts?.displayEndsAt > 0 && showResult) {
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

  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let ts = $derived(state?.tableState);
  let myBets = $derived((ts?.myBets ?? []) as { type: string; amount: number }[]);
  let myBetTotal = $derived(ts?.myBetTotal ?? 0);
  let result = $derived(ts?.result as string | null);
  let history = $derived((ts?.history ?? []) as string[]);
  let payouts = $derived(ts?.payouts as Record<string, number> | null);
  let myChips = $derived(state?.players?.find((p: any) => p.id === pid)?.chips ?? 0);

  // Sync chips to nav bar
  $effect(() => {
    if (myChips !== undefined && myChips !== null) {
      userStats.update(s => s ? { ...s, chips: myChips } : s);
    }
  });

  // Hide newest history entry during spin animation (prevents spoiling result)
  let visibleHistory = $derived(
    state?.phase === 'round_over' && !showResult && result
      ? history.slice(1)
      : history
  );

  let historyStats = $derived({
    red: visibleHistory.filter((h: string) => h === 'red').length,
    black: visibleHistory.filter((h: string) => h === 'black').length,
    green: visibleHistory.filter((h: string) => h === 'green').length,
  });

  // Per-color bets from all players
  let allBetsByColor = $derived(() => {
    const playerBets = ts?.playerBets as Record<string, { type: string; amount: number }[]> | undefined;
    const players = state?.players as { id: string; name: string }[] | undefined;
    if (!playerBets || !players) return { red: [] as { name: string; amount: number }[], black: [] as { name: string; amount: number }[], green: [] as { name: string; amount: number }[] };
    const nameMap = new Map(players.map((p: any) => [p.id, p.name]));
    const result: Record<string, { name: string; amount: number }[]> = { red: [], black: [], green: [] };
    for (const [playerId, bets] of Object.entries(playerBets)) {
      const name = nameMap.get(playerId) ?? 'Player';
      const totals: Record<string, number> = {};
      for (const b of bets) {
        totals[b.type] = (totals[b.type] ?? 0) + b.amount;
      }
      for (const [color, amount] of Object.entries(totals)) {
        if (result[color]) result[color].push({ name, amount });
      }
    }
    return result;
  });

  function betOnColor(color: string): number {
    return myBets
      .filter(b => b.type === color)
      .reduce((sum, b) => sum + b.amount, 0);
  }

  function placeBet(color: string) {
    if (state?.phase !== 'betting') return;
    if (betAmount < 1 || betAmount > myChips) return;
    socket.send({ type: 'place_bet', bet: { type: color, amount: betAmount } });
  }

  function adjustBet(delta: number) {
    betAmount = Math.max(1, Math.min(myChips, betAmount + delta));
  }

  function multiplyBet(factor: number) {
    betAmount = Math.max(1, Math.min(myChips, Math.floor(betAmount * factor)));
  }

  function clearBets() {
    socket.send({ type: 'clear_bets' });
  }

  function leaveGame() {
    socket.send({ type: 'leave' });
    socket.disconnect();
    gameState.set(null);
    goto('/casino');
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

    <div class="game-layout">

      <!-- Top bar -->
      <div class="top-bar">
        <div class="top-bar-left">
          <button class="leave-btn" onclick={leaveGame}>Leave</button>
        </div>
        <div class="player-chips-strip">
          {#each state.players as player}
            <div class="player-chip-item" class:disconnected={!player.connected}>
              <span class="pci-name" class:owner-name={player.name === 'nfras4'}>{player.name}</span>
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              <span class="pci-chips">{player.chips ?? 0}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- History strip with stats (uses visibleHistory to hide spoilers during spin) -->
      {#if visibleHistory.length > 0}
        <div class="history-section">
          <div class="history-stats">
            <span class="stat-label">LAST {visibleHistory.length}</span>
            <span class="stat-dot stat-red"></span><span class="stat-count">{historyStats.red}</span>
            <span class="stat-dot stat-green"></span><span class="stat-count">{historyStats.green}</span>
            <span class="stat-dot stat-black"></span><span class="stat-count">{historyStats.black}</span>
          </div>
          <div class="history-strip">
            {#each visibleHistory.slice(-20) as h}
              <span class="history-tile" class:ht-red={h==='red'} class:ht-black={h==='black'} class:ht-green={h==='green'}></span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Countdown timer -->
      {#if state.phase === 'betting' && timeLeft > 0}
        <div class="countdown-bar">
          <div class="countdown-info">
            <span class="countdown-label">SPINNING IN</span>
            <span class="countdown-time">{timeLeft}s</span>
          </div>
          <div class="countdown-track">
            <div class="countdown-fill" style="width: {Math.min(100, (timeLeft / 30) * 100)}%"></div>
          </div>
        </div>
      {/if}

      <!-- Sliding strip -->
      <div class="strip-container">
        <div class="strip-marker"></div>
        <div class="strip-viewport">
          <div
            class="strip-track"
            style="transform: translateX(-{stripOffset}px); transition: {sliding ? 'transform 3.2s cubic-bezier(0.17, 0.67, 0.12, 1.0)' : 'none'};"
          >
            {#each Array(TOTAL_SEGMENTS) as _, i}
              {@const color = STRIP_PATTERN[i % STRIP_PATTERN.length]}
              <div class="strip-segment" class:seg-red={color==='red'} class:seg-black={color==='black'} class:seg-green={color==='green'}>
                {color === 'green' ? 'G' : ''}
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Result / status display -->
      {#if showResult && result}
        <div class="result-display" class:res-red={result==='red'} class:res-black={result==='black'} class:res-green={result==='green'} class:win-glow={myPayout() > 0}>
          <span class="result-color-text">{result.toUpperCase()}</span>
          {#if result === 'green'}<span class="result-multiplier">14x</span>{/if}
        </div>
      {:else if state.phase === 'betting'}
        <div class="phase-status">
          <span class="phase-status-text">Place your bets</span>
          {#if ts?.totalBettors > 0}
            <span class="bettors-count">{ts.totalBettors} betting</span>
          {/if}
        </div>
      {:else if state.phase === 'resolving' || (state.phase === 'round_over' && !showResult)}
        <div class="phase-status">
          <span class="phase-status-text spinning-text">Spinning...</span>
        </div>
      {/if}

      <!-- Bet amount controls -->
      <div class="bet-amount-bar">
        <div class="bet-amount-left">
          <span class="bet-amount-label">Play amount</span>
          <span class="bet-amount-value">{betAmount}</span>
        </div>
        <div class="bet-amount-buttons">
          <button class="amt-btn" onclick={clearBets} disabled={myBetTotal === 0 || state.phase !== 'betting'}>CLEAR</button>
          <button class="amt-btn amt-minus" onclick={() => adjustBet(-100)} disabled={state.phase !== 'betting'}>-100</button>
          <button class="amt-btn amt-minus" onclick={() => adjustBet(-10)} disabled={state.phase !== 'betting'}>-10</button>
          <button class="amt-btn amt-minus" onclick={() => adjustBet(-1)} disabled={state.phase !== 'betting'}>-1</button>
          <button class="amt-btn" onclick={() => adjustBet(1)} disabled={state.phase !== 'betting'}>+1</button>
          <button class="amt-btn" onclick={() => adjustBet(10)} disabled={state.phase !== 'betting'}>+10</button>
          <button class="amt-btn" onclick={() => adjustBet(100)} disabled={state.phase !== 'betting'}>+100</button>
          <button class="amt-btn" onclick={() => multiplyBet(0.5)} disabled={state.phase !== 'betting'}>1/2</button>
          <button class="amt-btn" onclick={() => multiplyBet(2)} disabled={state.phase !== 'betting'}>X2</button>
          <button class="amt-btn" onclick={() => { betAmount = myChips; }} disabled={state.phase !== 'betting'}>MAX</button>
        </div>
      </div>

      <!-- Color bet cards -->
      <div class="color-bets">
        <div class="color-card card-red">
          <div class="color-card-top">
            <span class="color-card-name">RED</span>
            <span class="color-card-multi">2x</span>
          </div>
          {#if betOnColor('red') > 0}<span class="color-card-bet">You: {betOnColor('red')}</span>{/if}
          {#each allBetsByColor().red as bet}
            <span class="color-card-other">{bet.name}: {bet.amount}</span>
          {/each}
          <button class="color-play-btn play-red" onclick={() => placeBet('red')} disabled={state.phase !== 'betting'}>
            Play
          </button>
        </div>
        <div class="color-card card-green">
          <div class="color-card-top">
            <span class="color-card-name">GREEN</span>
            <span class="color-card-multi">14x</span>
          </div>
          {#if betOnColor('green') > 0}<span class="color-card-bet">You: {betOnColor('green')}</span>{/if}
          {#each allBetsByColor().green as bet}
            <span class="color-card-other">{bet.name}: {bet.amount}</span>
          {/each}
          <button class="color-play-btn play-green" onclick={() => placeBet('green')} disabled={state.phase !== 'betting'}>
            Play
          </button>
        </div>
        <div class="color-card card-black">
          <div class="color-card-top">
            <span class="color-card-name">BLACK</span>
            <span class="color-card-multi">2x</span>
          </div>
          {#if betOnColor('black') > 0}<span class="color-card-bet">You: {betOnColor('black')}</span>{/if}
          {#each allBetsByColor().black as bet}
            <span class="color-card-other">{bet.name}: {bet.amount}</span>
          {/each}
          <button class="color-play-btn play-black" onclick={() => placeBet('black')} disabled={state.phase !== 'betting'}>
            Play
          </button>
        </div>
      </div>

      <!-- Round info -->
      <div class="round-controls">
        {#if state.phase === 'round_over' && showResult}
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
          {#if nextRoundIn > 0}
            <div class="next-round-timer">Next round in {nextRoundIn}s</div>
          {/if}
        {/if}
        <div class="bet-summary">
          <span class="bet-summary-label">Total bet:</span>
          <span class="bet-summary-val">{myBetTotal}</span>
          <span class="bet-summary-label">Chips:</span>
          <span class="bet-summary-val" class:chip-counting={chipAnimating}>{displayedChips}</span>
        </div>
      </div>

      <!-- All players payouts on round over -->
      {#if state.phase === 'round_over' && showResult && payouts !== null}
        <div class="all-payouts fade-in">
          <span class="all-payouts-label">Round Results</span>
          {#each state.players as player}
            {@const payout = payouts[player.id] ?? 0}
            <div class="payout-row">
              <span class="pr-name" class:owner-name={player.name === 'nfras4'}>{player.name}</span>
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
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

  .leave-btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.3rem 0.6rem;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
  }

  .leave-btn:hover { color: #e74c3c; border-color: #e74c3c; }

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

  /* History section */
  .history-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .history-stats {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
  }

  .stat-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-subtle);
    margin-right: 0.25rem;
  }

  .stat-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .stat-red { background: #c0392b; }
  .stat-green { background: #1e7e34; }
  .stat-black { background: #1a1a2e; border: 1px solid #444; }

  .stat-count {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text);
    margin-right: 0.5rem;
  }

  .history-strip {
    display: flex;
    align-items: center;
    gap: 3px;
    overflow-x: auto;
    padding: 0.25rem 0;
    scrollbar-width: none;
  }

  .history-strip::-webkit-scrollbar { display: none; }

  .history-tile {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 4px;
  }

  .ht-red { background: #c0392b; }
  .ht-black { background: #1a1a2e; border: 1px solid #333; }
  .ht-green { background: #1e7e34; }

  /* ---- Countdown bar ---- */
  .countdown-bar {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .countdown-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .countdown-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
  }

  .countdown-time {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: #f39c12;
  }

  .countdown-track {
    width: 100%;
    height: 4px;
    background: var(--bg-input);
    border-radius: 2px;
    overflow: hidden;
  }

  .countdown-fill {
    height: 100%;
    background: linear-gradient(90deg, #f39c12, #d68910);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  /* ---- Sliding strip ---- */
  .strip-container {
    width: 100%;
    position: relative;
  }

  .strip-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 3px;
    background: #fff;
    z-index: 20;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
    border-radius: 1px;
  }

  .strip-viewport {
    width: 100%;
    overflow: hidden;
    border-radius: 8px;
    background: #0d0d0d;
    padding: 6px 0;
  }

  .strip-track {
    display: flex;
    gap: 6px;
    will-change: transform;
    padding: 0 4px;
  }

  .strip-segment {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    border-radius: 6px;
  }

  .seg-red { background: #c0392b; }
  .seg-black { background: #1a1a2e; border: 1px solid #2a2a3e; }
  .seg-green { background: #1e7e34; }

  /* ---- Result display ---- */
  .result-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 1.5rem;
    border-radius: 4px;
    border: 2px solid;
    animation: fadeUp 0.4s ease both;
    align-self: center;
  }

  .res-red { background: rgba(192, 57, 43, 0.2); border-color: #c0392b; }
  .res-black { background: rgba(26, 26, 26, 0.6); border-color: #555; }
  .res-green { background: rgba(30, 126, 52, 0.2); border-color: #1e7e34; }

  .result-color-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 2.25rem;
    font-weight: 700;
    color: #fff;
    line-height: 1;
    letter-spacing: 0.1em;
  }

  .result-multiplier {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: #2ecc71;
    letter-spacing: 0.08em;
  }

  .win-glow {
    animation: winPulse 0.6s ease 2;
    box-shadow: 0 0 20px rgba(46, 204, 113, 0.5);
  }

  @keyframes winPulse {
    0%, 100% { box-shadow: 0 0 12px rgba(46, 204, 113, 0.3); }
    50% { box-shadow: 0 0 28px rgba(46, 204, 113, 0.7); }
  }

  .chip-counting {
    color: #2ecc71 !important;
    text-shadow: 0 0 8px rgba(46, 204, 113, 0.5);
  }

  .phase-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .phase-status-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #f39c12;
  }

  .spinning-text {
    animation: pulse 0.8s ease infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .bettors-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* ---- Bet amount bar ---- */
  .bet-amount-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    flex-wrap: wrap;
  }

  .bet-amount-left {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 70px;
  }

  .bet-amount-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .bet-amount-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f39c12;
    line-height: 1;
  }

  .bet-amount-buttons {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    flex: 1;
    justify-content: flex-end;
  }

  .amt-btn {
    padding: 0.3rem 0.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .amt-btn:hover:not(:disabled) {
    background: var(--border);
    color: var(--text);
  }

  .amt-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .amt-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .amt-minus {
    color: #e74c3c;
  }

  .amt-minus:hover:not(:disabled) {
    color: #ff6b6b;
  }

  /* ---- Color bet cards ---- */
  .color-bets {
    display: flex;
    gap: 0.5rem;
  }

  .color-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    border-radius: 8px;
    background: var(--bg-card);
    border: 1px solid var(--border);
  }

  .color-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .color-card-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text);
  }

  .color-card-multi {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .color-card-bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    color: #f39c12;
  }

  .color-card-other {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    opacity: 0.8;
  }

  .color-play-btn {
    width: 100%;
    padding: 0.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: filter 0.1s, transform 0.08s;
    color: #fff;
  }

  .color-play-btn:not(:disabled):hover {
    filter: brightness(1.15);
  }

  .color-play-btn:not(:disabled):active {
    transform: scale(0.97);
  }

  .color-play-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .play-red { background: #c0392b; }
  .play-green { background: #1e7e34; }
  .play-black { background: #2a2a3e; }

  /* ---- Round controls ---- */
  .round-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
  }

  .next-round-timer {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--text-muted);
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

    .strip-segment {
      width: 64px;
      height: 64px;
      font-size: 1.1rem;
    }

    .color-card {
      padding: 0.5rem;
    }

    .color-card-name {
      font-size: 0.75rem;
    }
  }

  button:focus-visible { outline: 2px solid #f39c12; outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
  .owner-crown { font-size: 0.85rem; margin-left: -0.25rem; }
</style>
