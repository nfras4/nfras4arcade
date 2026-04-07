<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import Hand from '$lib/components/cards/Hand.svelte';
  import PlayerSeat from '$lib/components/cards/PlayerSeat.svelte';
  import TablePile from '$lib/components/cards/TablePile.svelte';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/chase-the-queen');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let selectedCards = $state<any[]>([]);
  let showCopied = $state(false);
  let reconnecting = $state(true);
  let errorTimeout: ReturnType<typeof setTimeout>;

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
      } else if (msg.type === 'error') {
        error.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
      }
    });

    socket.connect(code)
      .then(() => socket.joinRoom(code))
      .catch(() => goto('/chase-the-queen'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/chase-the-queen');
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let isMyTurn = $derived(state?.currentTurn === pid);
  let myHand = $derived((state?.tableState?.myHand ?? []) as any[]);
  let currentTrick = $derived((state?.tableState?.currentTrick ?? []) as any[]);
  let roundScores = $derived((state?.tableState?.roundScores ?? {}) as Record<string, number>);
  let queenInTrick = $derived(state?.tableState?.queenInTrick ?? false);
  let awaitingMoonChoice = $derived(state?.tableState?.awaitingMoonChoice as string | null);
  let trickNumber = $derived(state?.tableState?.trickNumber ?? 0);
  let totalTricks = $derived(state?.tableState?.totalTricks ?? 0);
  let wonTricks = $derived((state?.tableState?.wonTricks ?? {}) as Record<string, any[]>);
  let isMoonChooser = $derived(awaitingMoonChoice === pid);
  let scores = $derived((state?.scores ?? {}) as Record<string, number>);

  const SUIT_SYMBOLS: Record<string, string> = { clubs: '\u2663', diamonds: '\u2666', hearts: '\u2665', spades: '\u2660' };

  function suitSymbol(suit: string): string {
    return SUIT_SYMBOLS[suit] || suit;
  }

  function suitColor(suit: string): string {
    return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
  }

  function isPenaltyCard(card: any): boolean {
    return (card.suit === 'spades' && card.rank === 'Q') || card.suit === 'hearts';
  }

  function playCard() {
    if (selectedCards.length !== 1 || !isMyTurn) return;
    socket.send({ type: 'play_card', card: selectedCards[0] });
    selectedCards = [];
  }

  function chooseMoon(choice: 'double_others' | 'halve_self') {
    socket.send({ type: 'moon_choice', choice });
  }

  function startGame() { socket.send({ type: 'start_game' }); }
  function nextRound() { socket.send({ type: 'next_round' }); }
  function playAgain() { socket.send({ type: 'play_again' }); }
  function endGame() { socket.send({ type: 'end_game' }); }

  function leaveGame() {
    socket.disconnect();
    goto('/chase-the-queen');
  }

  function copyCode() {
    navigator.clipboard.writeText(code);
    showCopied = true;
    setTimeout(() => { showCopied = false; }, 1500);
  }

  function playerName(id: string): string {
    return state?.players?.find((p: any) => p.id === id)?.name ?? 'Unknown';
  }

  function penaltyCardsForPlayer(id: string): any[] {
    const cards = wonTricks[id] ?? [];
    return cards.filter((c: any) => isPenaltyCard(c));
  }

  let gameEnding = $derived(
    state?.phase === 'round_over' &&
    state?.turnOrder?.some((id: string) => (scores[id] ?? 0) >= 500)
  );
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

    <!-- Room header -->
    <div class="room-header">
      <button class="room-code-value" onclick={copyCode} aria-label="Copy room code">{code}</button>
      <span class="room-code-hint">{showCopied ? 'Copied!' : 'tap to copy'}</span>
    </div>

    <!-- LOBBY -->
    {#if state.phase === 'lobby'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Lobby</h2>
        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name">{player.name}</span>
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected}<span class="dc-badge">DC</span>{/if}
            </div>
          {/each}
        </div>
        <p class="player-count">{state.players.length} / 6 players (min 3)</p>
        {#if isHost}
          <button class="btn-primary" onclick={startGame} disabled={state.players.length < 3}>
            Start Game
          </button>
        {:else}
          <p class="waiting-text">Waiting for host to start...</p>
        {/if}
        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
      </div>

    <!-- PLAYING -->
    {:else if state.phase === 'playing'}
      <div class="phase-panel">

        <!-- Shoot the Moon Decision -->
        {#if awaitingMoonChoice}
          {#if isMoonChooser}
            <div class="moon-panel">
              <h2 class="geo-title phase-title">You shot the moon!</h2>
              <p class="moon-desc">You took ALL penalty cards this round. Choose your reward:</p>
              <div class="moon-choices">
                <button class="btn-primary moon-btn" onclick={() => chooseMoon('double_others')}>
                  Double everyone else's score
                </button>
                <button class="btn-secondary moon-btn" onclick={() => chooseMoon('halve_self')}>
                  Halve your own score
                </button>
              </div>
            </div>
          {:else}
            <div class="moon-panel">
              <h2 class="geo-title phase-title">Shot the moon!</h2>
              <p class="moon-desc">Waiting for {playerName(awaitingMoonChoice)} to choose...</p>
            </div>
          {/if}
        {:else}

          <!-- Turn indicator -->
          <div class="turn-indicator">
            {#if isMyTurn}
              <span class="your-turn">Your turn!</span>
            {:else}
              <span class="waiting-turn">Waiting for {playerName(state.currentTurn)}...</span>
            {/if}
            <span class="trick-count">Trick {trickNumber} / {totalTricks}</span>
          </div>

          <!-- Player bar with scores -->
          <div class="player-bar">
            {#each state.players as player}
              <PlayerSeat
                name={player.name}
                cardCount={player.cardCount}
                active={state.currentTurn === player.id}
                connected={player.connected}
                score={scores[player.id] ?? 0}
                roundPenalty={roundScores[player.id]}
              />
            {/each}
          </div>

          <!-- Current trick -->
          <TablePile
            mode="trick"
            label="Current Trick"
            warning={queenInTrick}
            warningText="Queen of Spades in play!"
            trickCards={currentTrick}
            {playerName}
            emptyText={isMyTurn ? 'Lead any card' : 'Waiting for lead...'}
          />

          <!-- My hand -->
          <div class="hand-area">
            <div class="hand-label geo-title">Your Hand ({myHand.length})</div>
            <Hand
              cards={myHand}
              disabled={!isMyTurn}
              {selectedCards}
              multiSelect={false}
              onchange={(cards) => { selectedCards = cards; }}
            />
          </div>

          <!-- Actions -->
          {#if isMyTurn && selectedCards.length === 1}
            <div class="action-bar">
              <button class="btn-primary" onclick={playCard}>
                Play {selectedCards[0].rank}{suitSymbol(selectedCards[0].suit)}
              </button>
            </div>
          {/if}
        {/if}
      </div>

    <!-- ROUND OVER -->
    {:else if state.phase === 'round_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Round {state.roundNumber} Complete</h2>

        <div class="round-summary">
          {#each state.turnOrder as id}
            <div class="summary-row">
              <span class="summary-name">{playerName(id)}</span>
              <div class="summary-penalties">
                {#each penaltyCardsForPlayer(id) as card}
                  <span class="mini-card" class:red={suitColor(card.suit) === 'red'}>
                    {card.rank}{suitSymbol(card.suit)}
                  </span>
                {/each}
              </div>
              <span class="summary-round-score">+{roundScores[id] ?? 0}</span>
              <span class="summary-total">Total: {scores[id] ?? 0}</span>
            </div>
          {/each}
        </div>

        {#if gameEnding}
          <div class="game-ending-notice">
            <p class="ending-text">A player has reached 500 points!</p>
          </div>
        {/if}

        {#if isHost}
          <div class="action-bar">
            <button class="btn-primary" onclick={nextRound}>
              {gameEnding ? 'See Final Results' : 'Next Round'}
            </button>
            <button class="btn-secondary" onclick={endGame}>End Game</button>
          </div>
        {:else}
          <p class="waiting-text">Waiting for host...</p>
        {/if}
      </div>

    <!-- GAME OVER -->
    {:else if state.phase === 'game_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Game Over</h2>
        <div class="final-results">
          {#each state.turnOrder
            .slice()
            .sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0)) as id, i}
            <div class="result-row" class:winner={i === 0}>
              <span class="result-position">#{i + 1}</span>
              <span class="result-name">{playerName(id)}</span>
              <span class="result-score">{scores[id] ?? 0} pts</span>
            </div>
          {/each}
        </div>
        {#if isHost}
          <button class="btn-primary" onclick={playAgain}>Back to Lobby</button>
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
    padding: 4.5rem 1rem 2rem;
  }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
    color: var(--text-muted);
  }

  .room-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .room-code-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: var(--accent);
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    clip-path: none;
  }

  .room-code-hint {
    font-size: 0.7rem;
    color: var(--text-subtle);
  }

  .phase-panel {
    width: 100%;
    max-width: 560px;
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

  /* Player list */
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

  .host-badge, .dc-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .host-badge { background: var(--accent-faint); color: var(--accent); }
  .dc-badge { background: var(--bg-input); color: var(--text-subtle); }

  .player-count {
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
  }

  .waiting-text {
    font-size: 0.85rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Turn indicator */
  .turn-indicator {
    text-align: center;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .your-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .waiting-turn {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .trick-count {
    font-size: 0.7rem;
    color: var(--text-subtle);
  }

  /* Player bar */
  .player-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  /* Hand */
  .hand-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hand-label { font-size: 0.6rem; letter-spacing: 0.14em; color: var(--text-subtle); text-align: center; }

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

  /* Moon panel */
  .moon-panel {
    text-align: center;
    padding: 1.5rem;
    background: var(--bg-card);
    border: 2px solid var(--accent);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .moon-desc {
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .moon-choices {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .moon-btn {
    padding: 1rem;
    font-size: 0.9375rem;
  }

  /* Round summary */
  .round-summary {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .summary-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    flex-wrap: wrap;
  }

  .summary-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text);
    min-width: 60px;
  }

  .summary-penalties {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .mini-card {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.3rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text);
  }

  .mini-card.red { color: #e74c3c; }

  .summary-round-score {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: #e74c3c;
  }

  .summary-total {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  /* Game ending notice */
  .game-ending-notice {
    text-align: center;
    padding: 0.75rem;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
  }

  .ending-text {
    font-size: 0.85rem;
    color: var(--accent);
    font-weight: 600;
  }

  /* Final results */
  .final-results {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .result-row.winner {
    border-color: var(--accent);
    background: var(--accent-faint);
  }

  .result-position {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
    min-width: 2rem;
  }

  .result-name {
    flex: 1;
    font-size: 0.9rem;
    color: var(--text);
  }

  .result-score {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text-muted);
  }
</style>
