<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { isLoggedIn, userStats, currentUser } from '$lib/auth';
  import Card from '$lib/components/cards/Card.svelte';
  import NameFrame from '$lib/components/NameFrame.svelte';

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
  let bettingTimeLeft = $state(0);
  let nextRoundIn = $state(0);

  // Card deal SFX via Web Audio API
  let audioCtx: AudioContext | null = null;
  function playCardSound() {
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      const duration = 0.15;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / audioCtx.sampleRate;
        // Swoosh: filtered noise with fast attack, medium decay
        const noise = Math.random() * 2 - 1;
        const envelope = Math.exp(-t * 20) * Math.min(1, t * 200);
        data[i] = noise * envelope * 0.25;
      }
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      // Bandpass filter for a swooshy character
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 0.8;
      src.connect(bp).connect(audioCtx.destination);
      src.start();
    } catch {}
  }

  // Track phase transitions for deal SFX
  let prevPhase: string | null = $state(null);

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

  // Cosmetics: card back and table felt from auth store
  let myCardBackStyle = $derived($currentUser?.cardBack ?? null);
  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');

  // Auto-place bet when returning to betting phase after a round
  $effect(() => {
    if (state?.phase === 'betting' && hasPlayedRound && !betPlaced && betInput >= minBet && betInput <= myChips) {
      placeBet();
    }
  });

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

  // Play deal SFX when entering playing phase
  $effect(() => {
    const phase = state?.phase;
    if (phase === 'playing' && prevPhase === 'betting') {
      // Stagger swoosh sounds for each card dealt
      const playerCount = state?.players?.length ?? 1;
      const totalCards = (playerCount + 1) * 2;
      for (let i = 0; i < totalCards; i++) {
        setTimeout(() => playCardSound(), i * 120);
      }
    }
    prevPhase = phase ?? null;
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
    const labels: Record<string, string> = { blackjack: 'Blackjack!', win: 'Win', lose: 'Lose', push: 'Push' };
    return labels[result] ?? result;
  }

  function resultColor(result: string): string {
    const colors: Record<string, string> = { blackjack: 'gold', win: 'green', lose: 'red', push: 'neutral' };
    return colors[result] ?? 'neutral';
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

<div class="game-page" style={tableFeltStyle}>
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
              <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} isHost={player.isHost} />
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
              <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
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

        {#if bettingTimeLeft > 0}
          <div class="countdown-bar">
            <div class="countdown-fill" style="width: {(bettingTimeLeft / 20) * 100}%"></div>
            <span class="countdown-text" class:countdown-urgent={bettingTimeLeft <= 5}>{bettingTimeLeft}s</span>
          </div>
        {/if}

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
                  aria-pressed={betInput === preset}
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
              <Card {card} faceUp={dealerRevealed || i === 0} dealDelay={i * 120} cardBackStyle={(!dealerRevealed && i > 0) ? myCardBackStyle : null} />
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
              <button class="btn-action btn-hit" onclick={() => { playCardSound(); socket.send({ type: 'hit' }); }}>
                Hit
              </button>
              <button class="btn-action btn-stand" onclick={() => socket.send({ type: 'stand' })}>
                Stand
              </button>
              {#if canDoubleDown}
                <button class="btn-action btn-double" onclick={() => { playCardSound(); socket.send({ type: 'double_down' }); }}>
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
                    <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
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
                <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
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
                aria-pressed={betInput === preset}
                onclick={() => setBetPreset(preset)}
                disabled={preset > myChips || preset < minBet || preset > maxBet}
              >
                {preset}
              </button>
            {/each}
          </div>
          <span class="next-bet-amount">{betInput}</span>
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
          <div class="result-row" class:result-winner={(player.chips ?? 0) > 0}>
            <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
            <span class="result-chips-final">{player.chips ?? 0} chips</span>
          </div>
        {/each}
        <button class="btn-primary" onclick={leaveGame}>Back to Lobby</button>
      </div>
    {/if}

  {/if}
</div>

<style>
  :root {
    --shop-gold: #f39c12;
    --shop-gold-04: rgba(243, 156, 18, 0.04);
    --shop-gold-06: rgba(243, 156, 18, 0.06);
    --shop-gold-10: rgba(243, 156, 18, 0.1);
    --shop-gold-12: rgba(243, 156, 18, 0.12);
    --shop-gold-15: rgba(243, 156, 18, 0.15);
    --shop-gold-22: rgba(243, 156, 18, 0.22);
    --shop-gold-30: rgba(243, 156, 18, 0.3);
    --shop-gold-40: rgba(243, 156, 18, 0.4);
    --shop-gold-50: rgba(243, 156, 18, 0.5);
    --shop-gold-70: rgba(243, 156, 18, 0.7);
    --bust-red: #e74c3c;
    --bust-red-10: rgba(231, 76, 60, 0.1);
    --bust-red-25: rgba(231, 76, 60, 0.25);
    --bust-red-30: rgba(231, 76, 60, 0.3);
    --felt-green: #6cb482;
    --felt-green-10: rgba(108, 180, 130, 0.1);
    --felt-green-12: rgba(108, 180, 130, 0.12);
    --felt-green-15: rgba(108, 180, 130, 0.15);
    --felt-green-20: rgba(108, 180, 130, 0.2);
    --felt-green-30: rgba(108, 180, 130, 0.3);
    --felt-green-40: rgba(108, 180, 130, 0.4);
    --split-purple: #9b59b6;
    --split-purple-10: rgba(155, 89, 182, 0.1);
    --split-purple-20: rgba(155, 89, 182, 0.2);
    --split-purple-30: rgba(155, 89, 182, 0.3);
    --board-blue-25: rgba(74, 144, 217, 0.25);
    --board-blue-40: rgba(74, 144, 217, 0.4);
  }

  .game-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4.5rem 1rem max(2rem, env(safe-area-inset-bottom, 2rem));
    background-color: var(--table-felt-bg, transparent);
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
    color: var(--shop-gold);
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
    color: var(--shop-gold);
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

  .owner-name { color: var(--shop-gold); }
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

  .host-badge { background: var(--shop-gold-15); color: var(--shop-gold); }
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
    border-color: var(--shop-gold-50);
    background: var(--shop-gold-06);
  }

  .chip-pill-name { color: var(--text); font-weight: 500; }
  .chip-pill-chips { color: var(--text-muted); }
  .chip-pill-bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    color: var(--shop-gold);
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
    color: var(--shop-gold);
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
    border: 1px solid var(--shop-gold-30);
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
    color: var(--shop-gold);
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
    background: var(--shop-gold-15);
    border-color: var(--shop-gold-50);
    color: var(--shop-gold);
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
    accent-color: var(--shop-gold);
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
    color: var(--shop-gold);
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
    color: var(--shop-gold);
    line-height: 1;
  }

  .hand-value.bust { color: var(--bust-red); }

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
    border-color: var(--shop-gold-50);
    box-shadow: 0 0 12px var(--shop-gold-10);
  }

  .hand-block.stood { opacity: 0.65; }
  .hand-block.busted { opacity: 0.5; border-color: var(--bust-red-30); }

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

  .hand-status.bust-label { color: var(--bust-red); background: var(--bust-red-10); }

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
    background: var(--shop-gold-12);
    color: var(--shop-gold);
    border-color: var(--shop-gold-40);
  }

  .btn-hit:hover { background: var(--shop-gold-22); border-color: var(--shop-gold-70); }

  .btn-stand {
    background: var(--bg-card);
    color: var(--text-muted);
    border-color: var(--border);
  }

  .btn-stand:hover { background: var(--bg-input); color: var(--text); }

  .btn-double {
    background: var(--felt-green-10);
    color: var(--felt-green);
    border-color: var(--felt-green-30);
  }

  .btn-double:hover { background: var(--felt-green-20); }

  .btn-split {
    background: var(--split-purple-10);
    color: var(--split-purple);
    border-color: var(--split-purple-30);
  }

  .btn-split:hover { background: var(--split-purple-20); }

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
    color: var(--shop-gold);
    padding: 0.1rem 0.35rem;
    background: var(--shop-gold-12);
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

  .hand-value-small.bust { color: var(--bust-red); }

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
    border-color: var(--shop-gold-30);
    background: var(--shop-gold-04);
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

  .result-payout.payout-pos { color: var(--felt-green); }
  .result-payout.payout-neg { color: var(--bust-red); }

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
    background: var(--shop-gold-15);
    color: var(--shop-gold);
    border: 1px solid var(--shop-gold-40);
  }

  .result-green {
    background: var(--felt-green-12);
    color: var(--felt-green);
    border: 1px solid var(--felt-green-30);
  }

  .result-red {
    background: var(--bust-red-10);
    color: var(--bust-red);
    border: 1px solid var(--bust-red-25);
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
    color: var(--shop-gold);
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

  /* Countdown bar */
  .countdown-bar {
    position: relative;
    width: 100%;
    height: 28px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .countdown-bar.mini {
    height: 6px;
    margin-top: 0.25rem;
  }

  .countdown-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(90deg, var(--board-blue-40), var(--board-blue-25));
    transition: width 0.2s linear;
  }

  .countdown-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text);
    z-index: 1;
  }

  .countdown-urgent {
    color: var(--bust-red);
    animation: pulse 0.5s ease-in-out infinite alternate;
  }

  @keyframes pulse {
    from { opacity: 1; }
    to { opacity: 0.5; }
  }

  /* Next round timer */
  .next-round-timer {
    text-align: center;
  }

  .next-round-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text-muted);
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
    background: var(--felt-green-10);
    border-color: var(--felt-green-40);
    box-shadow: 0 0 16px var(--felt-green-15);
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
    color: var(--shop-gold);
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
