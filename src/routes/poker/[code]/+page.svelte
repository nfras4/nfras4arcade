<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { isLoggedIn, userStats } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';
  import { fireWinConfetti } from '$lib/vfx';
  import Card from '$lib/components/cards/Card.svelte';
  import PlayerSeat from '$lib/components/cards/PlayerSeat.svelte';
  import CommunityCards from '$lib/components/cards/CommunityCards.svelte';
  import BetControls from '$lib/components/poker/BetControls.svelte';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/poker');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let isSpectator = $state(false);
  let reconnecting = $state(true);
  let blindSetting = $state(10);
  let gameMode: 'casual' | 'competitive' = $state('casual');
  let casualChipCount = $state(1000);
  let errorTimeout: ReturnType<typeof setTimeout>;

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        isSpectator = msg.isSpectator ?? false;
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
        if (msg.isSpectator !== undefined) isSpectator = msg.isSpectator;
      } else if (msg.type === 'error') {
        error.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
      }
    });

    socket.connect(code, !$isLoggedIn)
      .then(() => socket.joinRoom(code))
      .catch(() => goto('/poker'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/poker');
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let myPlayer = $derived(state?.players?.find((p: any) => p.id === pid));
  let ts = $derived(state?.tableState);
  let isMyTurn = $derived(ts?.actionOnPlayerId === pid);
  let bettingRound = $derived(ts?.bettingRound ?? 'preflop');
  let communityCards = $derived((ts?.communityCards ?? []) as { suit: string; rank: string }[]);
  let myHand = $derived((ts?.myHand ?? []) as { suit: string; rank: string }[]);
  let winnersInfo = $derived(ts?.winnersInfo as { playerId: string; amount: number; hand?: string }[] | null);
  let playerChips = $derived((ts?.playerChips ?? {}) as Record<string, number>);
  let playerBets = $derived((ts?.playerBets ?? {}) as Record<string, number>);
  let playerFolded = $derived((ts?.playerFolded ?? {}) as Record<string, boolean>);
  let playerAllIn = $derived((ts?.playerAllIn ?? {}) as Record<string, boolean>);
  let playerHands = $derived((ts?.playerHands ?? {}) as Record<string, { suit: string; rank: string }[] | null>);
  let dealerId = $derived(ts?.dealerId as string | null);
  let sbPlayerId = $derived(ts?.smallBlindPlayerId as string | null);
  let bbPlayerId = $derived(ts?.bigBlindPlayerId as string | null);
  let pots = $derived((ts?.pots ?? []) as { amount: number; eligiblePlayerIds: string[] }[]);
  let totalPot = $derived(pots.reduce((sum: number, p: any) => sum + p.amount, 0) + Object.values(playerBets).reduce((sum: number, b: number) => sum + b, 0));
  let currentBet = $derived((ts?.currentBet ?? 0) as number);
  let bigBlindAmount = $derived((ts?.bigBlindAmount ?? 10) as number);

  // Bet controls derived values
  let myBet = $derived(pid ? (playerBets[pid] ?? 0) : 0);
  let myChips = $derived(pid ? (playerChips[pid] ?? 0) : 0);
  let amIFolded = $derived(pid ? (playerFolded[pid] ?? false) : false);
  let toCall = $derived(currentBet - myBet);
  let canCheck = $derived(toCall <= 0);
  let callAmount = $derived(Math.min(toCall, myChips));
  let minRaise = $derived(currentBet + bigBlindAmount);
  let maxRaise = $derived(myChips + myBet);

  // Sync chips to nav bar
  $effect(() => {
    if (myChips !== undefined && myChips !== null) {
      userStats.update(s => s ? { ...s, chips: myChips } : s);
    }
  });

  // Client-side hand name evaluator
  const RANK_VAL: Record<string, number> = {
    '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14
  };
  const RANK_LABEL: Record<number, string> = {
    2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A'
  };

  function evaluateHandName(holeCards: {suit:string;rank:string}[], community: {suit:string;rank:string}[]): string {
    const all = [...holeCards, ...community];
    if (all.length < 2) return '';
    const vals = all.map(c => RANK_VAL[c.rank] ?? 0).sort((a,b) => b - a);
    const suits = all.map(c => c.suit);

    // Count ranks
    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    const groups = [...counts.entries()].sort((a,b) => b[1] - a[1] || b[0] - a[0]);

    // Check flush (5+ of same suit)
    const suitCounts = new Map<string, number>();
    for (const s of suits) suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
    let flushSuit: string | null = null;
    for (const [s, c] of suitCounts) { if (c >= 5) { flushSuit = s; break; } }

    // Check straight (using unique sorted values)
    const unique = [...new Set(vals)].sort((a,b) => a - b);
    // Add low ace for A-2-3-4-5
    if (unique.includes(14)) unique.unshift(1);
    let straightHigh = 0;
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i+4] - unique[i] === 4) {
        straightHigh = unique[i+4];
      }
    }

    // Straight flush / royal flush
    if (flushSuit && straightHigh) {
      const flushCards = all.filter(c => c.suit === flushSuit);
      const fv = [...new Set(flushCards.map(c => RANK_VAL[c.rank]))].sort((a,b) => a - b);
      if (fv.includes(14)) fv.unshift(1);
      let sfHigh = 0;
      for (let i = 0; i <= fv.length - 5; i++) {
        if (fv[i+4] - fv[i] === 4) sfHigh = fv[i+4];
      }
      if (sfHigh === 14) return 'Royal Flush';
      if (sfHigh > 0) return 'Straight Flush';
    }

    if (groups[0][1] >= 4) return `Four of a Kind, ${RANK_LABEL[groups[0][0]]}s`;
    if (groups[0][1] >= 3 && groups.length > 1 && groups[1][1] >= 2) return `Full House`;
    if (flushSuit) return 'Flush';
    if (straightHigh) return `Straight`;
    if (groups[0][1] >= 3) return `Three of a Kind`;
    if (groups[0][1] >= 2 && groups.length > 1 && groups[1][1] >= 2) return `Two Pair`;
    if (groups[0][1] >= 2) return `Pair of ${RANK_LABEL[groups[0][0]]}s`;
    return `High Card ${RANK_LABEL[groups[0][0]]}`;
  }

  let myHandName = $derived(
    myHand.length >= 2 && !amIFolded
      ? evaluateHandName(myHand, communityCards)
      : ''
  );

  // VFX: confetti on hand win
  let vfxFired = $state(false);
  $effect(() => {
    if (bettingRound === 'showdown' && winnersInfo && !vfxFired) {
      vfxFired = true;
      if (winnersInfo.some((w: any) => w.playerId === pid)) {
        fireWinConfetti();
      }
    }
    if (bettingRound !== 'showdown') vfxFired = false;
  });

  function sendAction(action: { type: string; amount?: number }) {
    socket.send(action);
  }

  function startGame() {
    socket.send({
      type: 'start_game',
      blindAmount: blindSetting,
      gameMode,
      casualChipCount: gameMode === 'casual' ? casualChipCount : undefined,
    });
  }

  function nextHand() {
    socket.send({ type: 'next_hand' });
  }

  function leaveGame() {
    socket.disconnect();
    gameState.set(null);
    goto('/poker');
  }

  function playerName(id: string): string {
    return state?.players?.find((p: any) => p.id === id)?.name ?? 'Unknown';
  }

  function getBlindLabel(playerId: string): string | undefined {
    if (playerId === sbPlayerId) return 'SB';
    if (playerId === bbPlayerId) return 'BB';
    return undefined;
  }

  let addingBot = $state(false);

  async function addBot() {
    addingBot = true;
    try {
      await fetch(`/api/add-bot?room=${code}&game=poker`, { method: 'POST' });
    } catch {}
    addingBot = false;
  }

  async function removeAllBots() {
    await fetch(`/api/remove-bots?room=${code}&game=poker`, { method: 'POST' });
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
        <h2 class="geo-title phase-title">Lobby</h2>
        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name" class:owner-name={player.name === 'nfras4'}>{player.name}</span>
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              {#if player.isBot}<span class="bot-badge">BOT</span>{/if}
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected && !player.isBot}<span class="dc-badge">DC</span>{/if}
              <span class="chip-count">{playerChips[player.id] ?? 1000} chips</span>
            </div>
          {/each}
        </div>
        <p class="player-count">
          {state.players.length} / 8 players
          {#if state.players.length < 2}
            -- Need {2 - state.players.length} more to start
          {/if}
        </p>
        {#if isHost}
          <div class="blind-selector">
            <label class="field-label" for="blind-select">Big Blind</label>
            <select id="blind-select" bind:value={blindSetting}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div class="mode-selector">
            <label class="field-label">Game Mode</label>
            <div class="mode-toggle">
              <button class="mode-btn" class:active={gameMode === 'casual'} onclick={() => gameMode = 'casual'}>
                Casual
              </button>
              <button class="mode-btn" class:active={gameMode === 'competitive'} onclick={() => gameMode = 'competitive'}>
                Competitive
              </button>
            </div>
          </div>

          {#if gameMode === 'casual'}
            <div class="chip-config">
              <label class="field-label" for="chip-select">Starting Chips</label>
              <select id="chip-select" class="input-field" bind:value={casualChipCount}>
                <option value={500}>500</option>
                <option value={1000}>1,000</option>
                <option value={2500}>2,500</option>
                <option value={5000}>5,000</option>
                <option value={10000}>10,000</option>
              </select>
            </div>
          {:else}
            <p class="competitive-note">Using real chip balances from your profile</p>
          {/if}

          <button class="btn-primary" onclick={startGame} disabled={state.players.length < 2}>
            Start Game
          </button>
          <div class="bot-controls">
            <button class="btn-secondary btn-sm" onclick={addBot} disabled={state.players.length >= 8 || addingBot}>
              {addingBot ? 'Adding...' : 'Add Bot'}
            </button>
            {#if state.players.some((p: any) => p.isBot)}
              <button class="btn-secondary btn-sm btn-danger" onclick={removeAllBots}>
                Remove All Bots
              </button>
            {/if}
          </div>
        {:else}
          <p class="waiting-text">Waiting for host to start...</p>
        {/if}
        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
      </div>

    <!-- PLAYING / SHOWDOWN -->
    {:else if state.phase === 'playing' || state.phase === 'round_over'}

      <div class="phase-panel">
        {#if isSpectator}<div class="spectator-banner">Spectating</div>{/if}
        <!-- Turn indicator -->
        <div class="turn-indicator">
          {#if bettingRound === 'showdown'}
            <span class="round-label">Showdown</span>
          {:else if isMyTurn && !amIFolded}
            <span class="your-turn">Your turn!</span>
          {:else if amIFolded}
            <span class="waiting-turn">You folded this hand</span>
          {:else if ts?.actionOnPlayerId}
            <span class="waiting-turn">Waiting for {playerName(ts.actionOnPlayerId)}...</span>
          {:else}
            <span class="waiting-turn">Waiting...</span>
          {/if}
        </div>

        <!-- Community Cards -->
        <CommunityCards cards={communityCards} {bettingRound} />

        <!-- Pot display -->
        {#if totalPot > 0}
          <div class="pot-display">
            {#if pots.length <= 1}
              <span class="pot-total geo-title">Pot: {totalPot}</span>
            {:else}
              {#each pots as pot, i}
                <span class="pot-item geo-title">
                  {i === 0 ? 'Main Pot' : `Side Pot ${i}`}: {pot.amount}
                </span>
              {/each}
              {#if Object.values(playerBets).some((b) => b > 0)}
                <span class="pot-item geo-title pot-bets">Current bets: {Object.values(playerBets).reduce((s, b) => s + b, 0)}</span>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Player ring -->
        <div class="player-bar">
          {#each state.players as player}
            <PlayerSeat
              name={player.name}
              cardCount={player.cardCount}
              active={ts?.actionOnPlayerId === player.id}
              connected={player.connected}
              chipCount={playerChips[player.id]}
              currentBet={playerBets[player.id]}
              dealerBadge={dealerId === player.id}
              blindLabel={getBlindLabel(player.id)}
              folded={playerFolded[player.id] ?? false}
              allIn={playerAllIn[player.id] ?? false}
            />
          {/each}
        </div>

        <!-- Last action -->
        {#if ts?.lastAction}
          <div class="last-action fade-in">
            <span class="action-text">
              {playerName(ts.lastAction.playerId)}
              {#if ts.lastAction.action === 'fold'}folded
              {:else if ts.lastAction.action === 'check'}checked
              {:else if ts.lastAction.action === 'call'}called {ts.lastAction.amount ?? ''}
              {:else if ts.lastAction.action === 'raise'}raised to {ts.lastAction.amount ?? ''}
              {:else if ts.lastAction.action === 'all_in'}went all in ({ts.lastAction.amount ?? ''})
              {/if}
            </span>
          </div>
        {/if}

        <!-- My hand -->
        <div class="hand-area">
          <div class="hand-label geo-title">Your Hand</div>
          <div class="hole-cards" class:dimmed={amIFolded}>
            {#each myHand as card, i}
              <Card {card} faceUp={true} dealDelay={i * 150} />
            {/each}
            {#if myHand.length === 0}
              <span class="no-cards">No cards dealt</span>
            {/if}
          </div>
          {#if myHandName}
            <div class="hand-name">{myHandName}</div>
          {/if}
        </div>

        <!-- Showdown: reveal opponent hands -->
        {#if bettingRound === 'showdown' && playerHands}
          <div class="showdown-hands">
            {#each state.players as player}
              {#if player.id !== pid && playerHands[player.id] && !playerFolded[player.id]}
                <div class="opponent-hand fade-in">
                  <span class="opponent-name">{player.name}</span>
                  <div class="opponent-cards">
                    {#each playerHands[player.id] ?? [] as card, i}
                      <Card {card} faceUp={true} dealDelay={i * 100} />
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}

        <!-- Winners info -->
        {#if winnersInfo && winnersInfo.length > 0}
          <div class="winners-panel fade-in">
            {#each winnersInfo as winner}
              <div class="winner-row">
                <span class="winner-name">{playerName(winner.playerId)}</span>
                <span class="winner-amount">wins {winner.amount}</span>
                {#if winner.hand}
                  <span class="winner-hand">with {winner.hand}</span>
                {/if}
              </div>
            {/each}
          </div>

          {#if isHost}
            <div class="action-bar">
              <button class="btn-primary" onclick={nextHand}>Next Hand</button>
            </div>
          {:else}
            <p class="waiting-text">Waiting for host to deal next hand...</p>
          {/if}
        {/if}

        <!-- Bet controls -->
        {#if isMyTurn && !amIFolded && bettingRound !== 'showdown'}
          <BetControls
            {canCheck}
            {callAmount}
            {minRaise}
            {maxRaise}
            playerChips={myChips}
            disabled={false}
            onaction={sendAction}
          />
        {/if}
      </div>

    <!-- GAME OVER -->
    {:else if state.phase === 'game_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Game Over</h2>
        {#each state.players as player}
          <div class="result-row" class:result-winner={playerChips[player.id] > 0}>
            <span class="result-name">{player.name}</span>
            <span class="result-chips">{playerChips[player.id] ?? 0} chips</span>
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
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeUp 0.3s ease both;
  }

  .phase-title {
    font-size: 1.25rem;
    letter-spacing: 0.12em;
    color: var(--accent);
    text-align: center;
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

  .chip-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .host-badge, .dc-badge, .bot-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .host-badge { background: var(--accent-faint); color: var(--accent); }
  .dc-badge { background: var(--bg-input); color: var(--text-subtle); }
  .bot-badge { background: rgba(155, 89, 182, 0.15); color: #9b59b6; }

  .bot-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .btn-sm {
    padding: 0.5rem 0.875rem !important;
    font-size: 0.875rem !important;
  }

  .btn-danger {
    color: #e74c3c !important;
    border-color: rgba(231, 76, 60, 0.3) !important;
  }

  .btn-danger:hover {
    background: rgba(231, 76, 60, 0.1) !important;
  }

  .player-count {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  .blind-selector {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: center;
  }

  .blind-selector select {
    width: auto;
    min-width: 80px;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .field-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .waiting-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Turn indicator */
  .turn-indicator {
    text-align: center;
    padding: 0.5rem;
  }

  .your-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .round-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--yellow);
  }

  .waiting-turn {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  /* Pot display */
  .pot-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .pot-total {
    font-size: 1.1rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }

  .pot-item {
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .pot-bets {
    color: var(--text-subtle);
    font-size: 0.75rem;
  }

  /* Player bar */
  .player-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  /* Last action */
  .last-action {
    text-align: center;
    padding: 0.25rem;
  }

  .action-text {
    font-size: 0.8rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Hand */
  .hand-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hand-label {
    font-size: 0.85rem;
    letter-spacing: 0.14em;
    color: var(--text-muted);
    text-align: center;
  }

  .hole-cards {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    transition: opacity 0.2s;
  }

  .hole-cards.dimmed {
    opacity: 0.3;
  }

  .hand-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent);
    text-align: center;
    margin-top: 0.25rem;
  }

  .no-cards {
    font-size: 0.875rem;
    color: var(--text-subtle);
    font-style: italic;
    padding: 1rem 0;
  }

  /* Showdown hands */
  .showdown-hands {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    justify-content: center;
  }

  .opponent-hand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .opponent-name {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  .opponent-cards {
    display: flex;
    gap: 0.25rem;
  }

  /* Winners panel */
  .winners-panel {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
    background: rgba(108, 180, 130, 0.08);
    border: 1px solid rgba(108, 180, 130, 0.3);
    border-radius: 4px;
  }

  .winner-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .winner-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--accent);
  }

  .winner-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--yellow);
  }

  .winner-hand {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  /* Actions */
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

  /* Results (game over) */
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

  .result-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
  }

  /* Mode selector */
  .mode-selector {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .mode-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 2px;
    overflow: hidden;
  }

  .mode-btn {
    flex: 1;
    padding: 0.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    background: var(--bg-input);
    color: var(--text-muted);
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn.active {
    background: var(--accent-faint);
    color: var(--accent);
  }

  .mode-btn:hover:not(.active) {
    color: var(--text);
  }

  .chip-config {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .competitive-note {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Mobile responsiveness */
  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      padding-bottom: max(7rem, env(safe-area-inset-bottom, 7rem));
    }

    .player-bar {
      gap: 0.375rem;
    }

    .showdown-hands {
      gap: 0.5rem;
    }

    .result-row {
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
    }

    .hole-cards {
      gap: 0.375rem;
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
      max-width: 460px;
    }
  }

  .spectator-banner {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--yellow, #eab308);
    border: 1px solid rgba(234, 179, 8, 0.3);
    border-radius: 2px;
    padding: 0.3rem 0.75rem;
    text-align: center;
    margin-bottom: 0.5rem;
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
