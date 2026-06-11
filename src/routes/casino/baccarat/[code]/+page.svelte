<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { dispatchRelayMessages } from '$lib/levelUpDispatch';
  import { writable } from 'svelte/store';
  import { isLoggedIn, userStats, currentUser } from '$lib/auth';
  import Card from '$lib/components/cards/Card.svelte';
  import NameFrame from '$lib/components/NameFrame.svelte';
  import Shockwave from '$lib/vfx/Shockwave.svelte';
  import FloatUp from '$lib/vfx/FloatUp.svelte';
  import { fireGoldBurst, fireLoss } from '$lib/vfx/burst';

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
      dispatchRelayMessages(msg);
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

  // Cosmetics: table felt from auth store (no card back -- all Baccarat cards are face-up)
  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');

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

  // -------------------------------------------------------------------------
  // VFX state
  // -------------------------------------------------------------------------

  // Bet placed: felt ripple under bet-confirmed panel
  let betShockwave = $state(0);
  let prevMyBetType: typeof myBetType = null;
  $effect(() => {
    const cur = myBetType;
    if (cur !== null && cur !== prevMyBetType) {
      betShockwave++;
    }
    prevMyBetType = cur;
  });

  // Deal phase: shockwave under each hand-area when cards arrive
  let playerShockwave = $state(0);
  let bankerShockwave = $state(0);
  let prevPlayerLen = 0;
  let prevBankerLen = 0;
  $effect(() => {
    const pl = playerHand.length;
    const bl = bankerHand.length;
    if (pl > prevPlayerLen) { playerShockwave++; }
    if (bl > prevBankerLen) { bankerShockwave++; }
    prevPlayerLen = pl;
    prevBankerLen = bl;
  });

  // Third-card drama: brief spotlight dim when a 3rd card arrives on either side
  let thirdCardSide = $state<'player' | 'banker' | null>(null);
  let prevPlayerLen3 = 0;
  let prevBankerLen3 = 0;
  $effect(() => {
    const pl = playerHand.length;
    const bl = bankerHand.length;
    if (pl === 3 && prevPlayerLen3 < 3) {
      thirdCardSide = 'player';
      const id = setTimeout(() => { thirdCardSide = null; }, 900);
      prevPlayerLen3 = pl;
      prevBankerLen3 = bl;
      return () => clearTimeout(id);
    }
    if (bl === 3 && prevBankerLen3 < 3) {
      thirdCardSide = 'banker';
      const id = setTimeout(() => { thirdCardSide = null; }, 900);
      prevPlayerLen3 = pl;
      prevBankerLen3 = bl;
      return () => clearTimeout(id);
    }
    prevPlayerLen3 = pl;
    prevBankerLen3 = bl;
  });

  // Winner reveal: glow wall + slam-in banner key
  let winnerRevealKey = $state(0);
  let glowWallActive = $state(false);
  let prevWinner: string | null = null;
  $effect(() => {
    const w = winner;
    if (w !== null && w !== prevWinner) {
      winnerRevealKey++;
      glowWallActive = true;
      const id = setTimeout(() => { glowWallActive = false; }, 1100);
      prevWinner = w;
      return () => clearTimeout(id);
    }
    prevWinner = w;
  });

  // Natural 8/9: gold shimmer on score chip + NATURAL pop
  let playerNaturalKey = $state(0);
  let bankerNaturalKey = $state(0);
  let showPlayerNatural = $state(false);
  let showBankerNatural = $state(false);
  let prevPlayerTotal = -1;
  let prevBankerTotal = -1;
  $effect(() => {
    const pt = handTotal(playerHand);
    const bt = handTotal(bankerHand);
    const ptCards = playerHand.length;
    const btCards = bankerHand.length;
    if (ptCards === 2 && (pt === 8 || pt === 9) && prevPlayerTotal !== pt) {
      playerNaturalKey++;
      showPlayerNatural = true;
      const id = setTimeout(() => { showPlayerNatural = false; }, 1100);
      prevPlayerTotal = pt;
      return () => clearTimeout(id);
    }
    if (btCards === 2 && (bt === 8 || bt === 9) && prevBankerTotal !== bt) {
      bankerNaturalKey++;
      showBankerNatural = true;
      const id = setTimeout(() => { showBankerNatural = false; }, 1100);
      prevBankerTotal = bt;
      return () => clearTimeout(id);
    }
    prevPlayerTotal = pt;
    prevBankerTotal = bt;
  });

  // Payouts: FloatUp entries + fireGoldBurst for own win
  interface FloatEntry { id: number; text: string; color: string; }
  let floatEntries = $state<Record<string, FloatEntry[]>>({});
  let prevPayouts: Record<string, number> | null = null;
  $effect(() => {
    const p = payouts;
    if (p && p !== prevPayouts) {
      const next: Record<string, FloatEntry[]> = {};
      for (const [playerId, amount] of Object.entries(p)) {
        if (amount === 0) continue;
        const entryId = Date.now() + Math.random();
        next[playerId] = [
          ...(floatEntries[playerId] ?? []),
          {
            id: entryId,
            text: amount > 0 ? `+${amount}` : `${amount}`,
            color: amount > 0 ? 'var(--bet-tie-green)' : 'var(--bet-banker-red)',
          }
        ];
        if (playerId === pid && amount > 0) {
          fireGoldBurst();
        } else if (playerId === pid && amount < 0) {
          fireLoss();
        }
      }
      floatEntries = { ...floatEntries, ...next };
      prevPayouts = p;
      // Self-cleanup: clear entries after FloatUp has faded (~1s)
      const id = setTimeout(() => { floatEntries = {}; }, 1100);
      return () => clearTimeout(id);
    }
    prevPayouts = p;
  });
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
              <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
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
          <div class="bet-confirmed" style="position:relative;">
            <Shockwave trigger={betShockwave} color="var(--shop-gold)" size={160} />
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
                aria-pressed={myBetType === 'player'}
                onclick={() => placeBet('player')}
              >
                <span class="bet-type-name">Player</span>
                <span class="bet-type-payout">1:1</span>
              </button>
              <button
                class="bet-type-btn bet-type-tie"
                class:selected={myBetType === 'tie'}
                aria-pressed={myBetType === 'tie'}
                onclick={() => placeBet('tie')}
              >
                <span class="bet-type-name">Tie</span>
                <span class="bet-type-payout">8:1</span>
              </button>
              <button
                class="bet-type-btn bet-type-banker"
                class:selected={myBetType === 'banker'}
                aria-pressed={myBetType === 'banker'}
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
              <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
              <span class="chip-pill-chips">{player.chips ?? 0}</span>
              {#if betsPlaced[player.id] !== undefined}
                <span class="chip-pill-bet bet-type-{betsPlaced[player.id].type}">{betsPlaced[player.id].type}</span>
              {/if}
            </div>
          {/each}
        </div>

        <div class="hands-container">
          <!-- Player hand -->
          <div class="hand-area" class:third-card-dim={thirdCardSide === 'banker'}>
            <div class="hand-header">
              <span class="area-label geo-title">Player</span>
              {#if playerHand.length > 0}
                {#key playerNaturalKey}
                  <span class="hand-value" class:natural-chip={showPlayerNatural}>{handTotal(playerHand)}</span>
                {/key}
              {/if}
            </div>
            {#if showPlayerNatural}
              <span class="natural-pop vfx-slam-in" aria-hidden="true">NATURAL</span>
            {/if}
            <div class="card-row" style="position:relative;">
              <Shockwave trigger={playerShockwave} color="var(--bet-player-blue)" size={110} />
              {#each playerHand as card, i}
                <div class:third-card-delay={i === 2}>
                  <Card {card} faceUp={true} dealDelay={i * 150} />
                </div>
              {/each}
              {#if playerHand.length === 0}
                <span class="no-cards">Dealing...</span>
              {/if}
            </div>
          </div>

          <div class="hand-divider"></div>

          <!-- Banker hand -->
          <div class="hand-area" class:third-card-dim={thirdCardSide === 'player'}>
            <div class="hand-header">
              <span class="area-label geo-title">Banker</span>
              {#if bankerHand.length > 0}
                {#key bankerNaturalKey}
                  <span class="hand-value" class:natural-chip={showBankerNatural}>{handTotal(bankerHand)}</span>
                {/key}
              {/if}
            </div>
            {#if showBankerNatural}
              <span class="natural-pop vfx-slam-in" aria-hidden="true">NATURAL</span>
            {/if}
            <div class="card-row" style="position:relative;">
              <Shockwave trigger={bankerShockwave} color="var(--bet-banker-red)" size={110} />
              {#each bankerHand as card, i}
                <div class:third-card-delay={i === 2}>
                  <Card {card} faceUp={true} dealDelay={i * 150} />
                </div>
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
          <!-- Glow wall washing in from winning side -->
          {#if glowWallActive}
            <div class="glow-wall glow-wall-{winnerColor(winner)}" aria-hidden="true"></div>
          {/if}
          {#key winnerRevealKey}
            <div class="winner-banner winner-{winnerColor(winner)} vfx-slam-in winner-banner-{winnerColor(winner)}-sweep">
              {#if winner === 'tie'}
                <span class="winner-label geo-title vfx-sparkle-text">{winnerLabel(winner)}</span>
                <span class="tie-payout-label vfx-sparkle-text">8:1</span>
              {:else}
                <span class="winner-label geo-title winner-side-label winner-side-{winnerColor(winner)}">{winnerLabel(winner)}</span>
              {/if}
            </div>
          {/key}
        {/if}

        <div class="hands-container">
          <div class="hand-area">
            <div class="hand-header">
              <span class="area-label geo-title">Player</span>
              {#key playerNaturalKey}
                <span class="hand-value" class:winner-hand={winner === 'player'} class:natural-chip={showPlayerNatural}>{handTotal(playerHand)}</span>
              {/key}
            </div>
            {#if showPlayerNatural}
              <span class="natural-pop vfx-slam-in" aria-hidden="true">NATURAL</span>
            {/if}
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
              {#key bankerNaturalKey}
                <span class="hand-value" class:winner-hand={winner === 'banker'} class:natural-chip={showBankerNatural}>{handTotal(bankerHand)}</span>
              {/key}
            </div>
            {#if showBankerNatural}
              <span class="natural-pop vfx-slam-in" aria-hidden="true">NATURAL</span>
            {/if}
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
            <div class="result-player-block" class:is-me={player.id === pid} style="position:relative;">
              {#each (floatEntries[player.id] ?? []) as entry (entry.id)}
                <FloatUp text={entry.text} color={entry.color} />
              {/each}
              <div class="result-player-header">
                <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} />
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
    --shop-gold-end: #f5c842;
    --shop-gold-04: rgba(243, 156, 18, 0.04);
    --shop-gold-06: rgba(243, 156, 18, 0.06);
    --shop-gold-15: rgba(243, 156, 18, 0.15);
    --shop-gold-30: rgba(243, 156, 18, 0.3);
    --shop-gold-50: rgba(243, 156, 18, 0.5);
    --bet-banker-red: #e74c3c;
    --bet-banker-red-10: rgba(231, 76, 60, 0.1);
    --bet-banker-red-40: rgba(231, 76, 60, 0.4);
    --bet-player-blue: #4a9eff;
    --bet-player-blue-10: rgba(74, 158, 255, 0.1);
    --bet-player-blue-40: rgba(74, 158, 255, 0.4);
    --bet-tie-green: #2ecc71;
    --bet-tie-green-10: rgba(46, 204, 113, 0.1);
    --bet-tie-green-40: rgba(46, 204, 113, 0.4);
    --bet-tie-glow: rgba(46, 204, 113, 0.4);
    --overlay-04: rgba(255, 255, 255, 0.04);
    --overlay-05: rgba(255, 255, 255, 0.05);
    --overlay-06: rgba(255, 255, 255, 0.06);
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
    max-width: 540px;
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
    border-color: var(--shop-gold-50);
    background: var(--shop-gold-06);
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
    color: var(--shop-gold);
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
    background: linear-gradient(90deg, var(--shop-gold), var(--shop-gold-end));
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

  .countdown-text.countdown-urgent { color: var(--bet-banker-red); }

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
    color: var(--shop-gold);
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
    background: var(--overlay-04);
  }

  .bet-type-btn.selected {
    border-color: currentColor;
    background: var(--overlay-06);
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
  .bet-type-player { color: var(--bet-player-blue); }
  .bet-type-banker { color: var(--bet-banker-red); }
  .bet-type-tie { color: var(--bet-tie-green); }

  .bet-type-btn.bet-type-player.selected .bet-type-name { color: var(--bet-player-blue); }
  .bet-type-btn.bet-type-banker.selected .bet-type-name { color: var(--bet-banker-red); }
  .bet-type-btn.bet-type-tie.selected .bet-type-name { color: var(--bet-tie-green); }

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
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
  }

  .bet-amount-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--shop-gold);
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
    color: var(--shop-gold);
    line-height: 1;
  }

  .hand-value.winner-hand {
    color: var(--bet-tie-green);
    text-shadow: 0 0 8px var(--bet-tie-glow);
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
    background: var(--bet-player-blue-10);
    border-color: var(--bet-player-blue-40);
  }

  .winner-banner.winner-red {
    background: var(--bet-banker-red-10);
    border-color: var(--bet-banker-red-40);
  }

  .winner-banner.winner-green {
    background: var(--bet-tie-green-10);
    border-color: var(--bet-tie-green-40);
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
    border-color: var(--shop-gold-30);
    background: var(--shop-gold-04);
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
    background: var(--overlay-05);
  }

  .result-payout {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
  }

  .result-payout.payout-pos { color: var(--bet-tie-green); }
  .result-payout.payout-neg { color: var(--bet-banker-red); }

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
    color: var(--shop-gold);
  }

  /* -------------------------------------------------------------------------
     VFX additions
     ------------------------------------------------------------------------- */

  /* Third-card drama: dim opposing side while spotlight is on arriving card */
  .third-card-dim {
    opacity: 0.45;
    filter: brightness(0.6);
    transition: opacity 0.25s ease, filter 0.25s ease;
  }

  /* Third-card: staggered entrance for card index 2 */
  .third-card-delay {
    animation: bac-third-card-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: 0.18s;
  }

  @keyframes bac-third-card-enter {
    0%   { transform: scale(0.7) rotate(-6deg); opacity: 0; filter: brightness(1.6); }
    60%  { transform: scale(1.08) rotate(1deg); opacity: 1; filter: brightness(1.2); }
    100% { transform: scale(1) rotate(0deg); opacity: 1; filter: brightness(1); }
  }

  /* Natural 8/9: gold shimmer on the score chip */
  @keyframes bac-natural-shimmer {
    0%   { box-shadow: 0 0 0px var(--shop-gold); color: var(--shop-gold); }
    30%  { box-shadow: 0 0 14px var(--shop-gold-50), 0 0 28px var(--shop-gold-30); color: #ffe680; }
    70%  { box-shadow: 0 0 10px var(--shop-gold-50); color: var(--shop-gold); }
    100% { box-shadow: none; color: var(--shop-gold); }
  }

  .natural-chip {
    animation: bac-natural-shimmer 1.0s ease-out forwards;
  }

  /* "NATURAL" pop label */
  .natural-pop {
    display: block;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--shop-gold);
    text-align: center;
    pointer-events: none;
    line-height: 1;
  }

  /* Winner banner: slam-in already on element; add side-colored glow */
  .winner-side-label {
    font-size: 1.1rem;
    letter-spacing: 0.14em;
  }

  .winner-side-blue {
    color: var(--bet-player-blue);
    text-shadow: 0 0 12px var(--bet-player-blue-40);
  }

  .winner-side-red {
    color: var(--bet-banker-red);
    text-shadow: 0 0 12px var(--bet-banker-red-40);
  }

  /* TIE: vfx-sparkle-text already handles shimmer; extra purple tint on banner */
  .winner-banner.winner-green .winner-label.vfx-sparkle-text,
  .winner-banner.winner-green .tie-payout-label {
    background: linear-gradient(90deg, #bf5af2 0%, #e0aaff 30%, #bf5af2 50%, #f8d4ff 65%, #bf5af2 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    animation: vfx-sparkle-sweep 1.4s linear infinite;
  }

  .tie-payout-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    margin-left: 0.5rem;
  }

  /* Glow wall: full-width overlay that sweeps across the table from the winning side */
  .glow-wall {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    animation: bac-glow-wall-sweep 1.1s ease-out forwards;
  }

  .glow-wall-blue {
    background: linear-gradient(90deg, rgba(74, 158, 255, 0.22) 0%, rgba(74, 158, 255, 0.08) 55%, transparent 100%);
  }

  .glow-wall-red {
    background: linear-gradient(270deg, rgba(231, 76, 60, 0.22) 0%, rgba(231, 76, 60, 0.08) 55%, transparent 100%);
  }

  .glow-wall-green {
    background: radial-gradient(ellipse at center, rgba(191, 90, 242, 0.22) 0%, rgba(191, 90, 242, 0.06) 60%, transparent 100%);
  }

  @keyframes bac-glow-wall-sweep {
    0%   { opacity: 0; }
    18%  { opacity: 1; }
    70%  { opacity: 0.7; }
    100% { opacity: 0; }
  }
</style>
