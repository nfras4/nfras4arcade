<script lang="ts">
  // @ts-nocheck
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { CardGameSocket } from '$lib/cardSocket';
  import { dispatchRelayMessages } from '$lib/levelUpDispatch';
  import { isLoggedIn } from '$lib/auth';
  import { fireWinConfetti } from '$lib/vfx';
  import SnapCard from '$lib/components/snap/SnapCard.svelte';
  import NameFrame from '$lib/components/NameFrame.svelte';

  const code = $page.params.code!;
  const urlParams = new URLSearchParams($page.url.search);
  let deviceRole: 'center' | 'player' = $state(urlParams.get('role') === 'center' ? 'center' : 'player');

  const socket = new CardGameSocket('/ws/snap');

  let gameState: any = $state(null);
  let myPlayerId: string | null = $state(null);
  let error: string | null = $state(null);
  let reconnecting = $state(true);
  let lastSnapResult: any = $state(null);
  let snapFlash = $state(false);
  let isSpectator = $state(false);
  let errorTimeout: ReturnType<typeof setTimeout>;

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId = msg.playerId;
        gameState = msg.state;
        reconnecting = false;
        isSpectator = msg.isSpectator ?? false;
      } else if (msg.type === 'state_update') {
        gameState = msg.state;
        if (msg.isSpectator !== undefined) isSpectator = msg.isSpectator;
      } else if (msg.type === 'card_played') {
        if (navigator.vibrate) navigator.vibrate(50);
      } else if (msg.type === 'snap_result') {
        lastSnapResult = msg;
        snapFlash = true;
        if (navigator.vibrate) navigator.vibrate(msg.wasValid ? [100, 50, 100] : [200]);
        setTimeout(() => { lastSnapResult = null; snapFlash = false; }, 1500);
      } else if (msg.type === 'error') {
        error = msg.message;
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => { error = null; }, 4000);
      }
      dispatchRelayMessages(msg);
    });

    socket.connect(code, !$isLoggedIn)
      .then(() => socket.send({ type: 'join', code, role: deviceRole }))
      .catch(() => goto('/snap'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !gameState) {
      goto('/snap');
    }
  });

  // Derived state
  let state = $derived(gameState);
  let isHost = $derived(state?.players?.some((p: any) => p.id === myPlayerId && p.isHost) ?? false);
  let myPlayer = $derived(state?.players?.find((p: any) => p.id === myPlayerId));
  let myDeckSize = $derived(myPlayer?.deckSize ?? 0);
  let isMyTurn = $derived(state?.currentDrawPlayerId === myPlayerId);
  let snapIsActive = $derived(state?.snapActive ?? false);
  let topCard = $derived(state?.topCard ?? null);
  let isGameOver = $derived(state?.phase === 'game_over');
  let isLobby = $derived(state?.phase === 'lobby');
  let isPlaying = $derived(state?.phase === 'playing');
  let currentDrawPlayerName = $derived(
    state?.players?.find((p: any) => p.id === state?.currentDrawPlayerId)?.name ?? '...'
  );
  let isEliminated = $derived(isPlaying && myDeckSize === 0 && deviceRole === 'player');
  let didWin = $derived(isGameOver && state?.winnerId === myPlayerId);

  $effect(() => {
    if (didWin && deviceRole === 'player') {
      fireWinConfetti();
    }
  });

  // Actions
  function startGame() { socket.send({ type: 'start_game' }); }
  function drawCard() { socket.send({ type: 'draw' }); }
  function callSnap() { socket.send({ type: 'snap' }); }
  function playAgain() { socket.send({ type: 'play_again' }); }
  function leaveGame() { socket.disconnect(); goto('/snap'); }

</script>

{#if error}
  <div class="error-toast">{error}</div>
{/if}

{#if reconnecting}
  <div class="snap-container center-content">
    <p class="connecting-text">Connecting...</p>
  </div>

{:else if !state}
  <div class="snap-container center-content">
    <p class="connecting-text">Loading...</p>
  </div>

<!-- ==================== CENTER PAD MODE ==================== -->
{:else if deviceRole === 'center'}

  {#if isLobby}
    <div class="snap-container center-content">
      <div class="center-lobby">
        <p class="center-label geo-title">Room Code</p>
        <h1 class="center-code geo-title">{state.code}</h1>
        <p class="center-waiting">Waiting for players to join...</p>
        <p class="center-count">{state.players?.length ?? 0} player{(state.players?.length ?? 0) !== 1 ? 's' : ''} connected</p>
      </div>
    </div>

  {:else if isPlaying}
    <div class="snap-container center-playing" class:snap-flash={snapFlash}>
      <!-- Player status bar -->
      <div class="center-status-bar">
        <!-- TODO: wire NameFrame (deferred, see deep-interview-nameframe-rollout.md). Center-pad + per-device split architecture requires separate design pass. -->
        {#each state.players as player (player.id)}
          <span class="center-player-chip" class:disconnected={!player.connected}>
            {player.name}: {player.deckSize}
          </span>
        {/each}
      </div>

      <!-- Main card area -->
      <div class="center-card-area">
        <SnapCard card={topCard} faceUp={!!topCard} size="huge" animate={true} highlight={snapIsActive} />
        <span class="pile-badge">{state.pileSize} in pile</span>
      </div>

      <!-- Snap overlay / tap target -->
      {#if snapIsActive}
        <button class="center-snap-target" onclick={callSnap}>
          <span class="center-snap-text geo-title">SNAP!</span>
        </button>
      {/if}

      <!-- Snap result overlay -->
      {#if lastSnapResult}
        <div class="snap-result-overlay" class:valid={lastSnapResult.wasValid} class:invalid={!lastSnapResult.wasValid}>
          {#if lastSnapResult.wasValid}
            <p class="snap-result-text">{lastSnapResult.winnerName} wins {lastSnapResult.pileSize} cards!</p>
          {:else}
            <p class="snap-result-text">False snap! {lastSnapResult.winnerName} loses {lastSnapResult.pileSize} cards</p>
          {/if}
        </div>
      {/if}
    </div>

  {:else if isGameOver}
    <div class="snap-container center-content">
      <div class="game-over-display">
        <h1 class="winner-text geo-title">{state.winnerName ?? 'Nobody'} wins!</h1>
        {#if isHost}
          <div class="action-row">
            <button class="btn-primary btn-full" onclick={playAgain}>Play Again</button>
            <button class="btn-secondary btn-full" onclick={leaveGame}>New Game</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

<!-- ==================== PLAYER MODE ==================== -->
{:else}

  {#if isLobby}
    <div class="snap-container player-lobby">
      <header class="lobby-header">
        <h1 class="lobby-title geo-title">Snap</h1>
      </header>

      <div class="panel">
        <div class="panel-border" aria-hidden="true"></div>
        <div class="panel-inner">
          <h2 class="section-label geo-title">Players</h2>
          <ul class="player-list">
            {#each state.players as player (player.id)}
              <li class="player-item" class:disconnected={!player.connected}>
                <NameFrame name={player.name} frameSvg={player.frameSvg ?? null} emblemSvg={player.emblemSvg ?? null} nameColour={player.nameColour ?? null} />
                {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
                {#if player.isHost}<span class="host-badge">Host</span>{/if}
                {#if player.id === myPlayerId}<span class="you-badge">You</span>{/if}
              </li>
            {/each}
          </ul>

          {#if isHost}
            <button class="btn-primary btn-full" onclick={startGame} disabled={(state.players?.length ?? 0) < 2}>
              {(state.players?.length ?? 0) < 2 ? 'Need 2+ players' : 'Start Game'}
            </button>
          {:else}
            <p class="waiting-text">Waiting for host to start...</p>
          {/if}
        </div>
      </div>

      <button class="btn-secondary leave-btn" onclick={leaveGame}>Leave Room</button>
    </div>

  {:else if isPlaying}
    <div class="snap-container player-playing" class:snap-flash={snapFlash}>
      {#if isSpectator}<div class="spectator-banner">Spectating</div>{/if}
      <!-- Top bar -->
      <div class="top-bar">
        <span class="top-pile">Pile: {state.pileSize}</span>
        <span class="top-deck">Your cards: {myDeckSize}</span>
      </div>

      <!-- Center card display -->
      <div class="card-display-area">
        <SnapCard card={topCard} faceUp={!!topCard} size="large" animate={true} highlight={snapIsActive} />

        <!-- Snap result overlay -->
        {#if lastSnapResult}
          <div class="snap-result-banner" class:valid={lastSnapResult.wasValid} class:invalid={!lastSnapResult.wasValid}>
            {#if lastSnapResult.wasValid}
              <p>{lastSnapResult.winnerName} wins {lastSnapResult.pileSize} cards!</p>
            {:else}
              <p>False snap! {lastSnapResult.winnerName} loses {lastSnapResult.pileSize} cards</p>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Bottom action area -->
      <div class="bottom-area">
        {#if isSpectator}
          <div class="eliminated-msg">
            <p class="eliminated-text geo-title">Spectating</p>
            <p class="eliminated-sub">You'll join next round</p>
          </div>
        {:else if isEliminated}
          <div class="eliminated-msg">
            <p class="eliminated-text geo-title">You're out!</p>
            <p class="eliminated-sub">Watch the rest of the game</p>
          </div>
        {:else if snapIsActive}
          <button class="snap-btn" onclick={callSnap}>SNAP!</button>
        {:else if isMyTurn}
          <button class="draw-btn btn-primary" onclick={drawCard}>DRAW</button>
        {:else}
          <button class="draw-btn draw-btn-disabled" disabled>Waiting for {currentDrawPlayerName}...</button>
        {/if}

        {#if !isSpectator && !isEliminated && !snapIsActive}
          <button class="snap-btn snap-btn-idle" onclick={callSnap}>SNAP!</button>
        {/if}
      </div>
    </div>

  {:else if isGameOver}
    <div class="snap-container center-content">
      <div class="game-over-display">
        {#if didWin}
          <h1 class="winner-text geo-title you-won">You win!</h1>
        {:else}
          <h1 class="winner-text geo-title">{state.winnerName ?? 'Nobody'} wins!</h1>
        {/if}

        <div class="final-scores">
          {#each state.players as player (player.id)}
            <div class="score-row" class:winner={player.id === state.winnerId}>
              <span class="score-name">{player.name}</span>
              <span class="score-cards">{player.deckSize} cards</span>
            </div>
          {/each}
        </div>

        <div class="action-row">
          {#if isHost}
            <button class="btn-primary btn-full" onclick={playAgain}>Play Again</button>
          {/if}
          <button class="btn-secondary btn-full" onclick={leaveGame}>Back to Lobby</button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* === Layout === */
  * { touch-action: manipulation; }

  .snap-container {
    height: 100dvh;
    width: 100vw;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .center-content {
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }

  .connecting-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    color: var(--text-muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* === Error toast === */
  .error-toast {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    background: #e74c3c;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    animation: fadeUp 0.3s ease;
  }

  /* === CENTER PAD: Lobby === */
  .center-lobby {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .center-label {
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    color: var(--text-subtle);
    text-transform: uppercase;
  }

  .center-code {
    font-size: clamp(4rem, 20vw, 8rem);
    font-weight: 700;
    letter-spacing: 0.3em;
    color: var(--accent);
    line-height: 1;
  }

  .center-waiting {
    font-size: 1rem;
    color: var(--text-muted);
  }

  .center-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* === CENTER PAD: Playing === */
  .center-playing {
    position: relative;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .center-status-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    z-index: 10;
  }

  .center-player-chip {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .center-player-chip.disconnected { opacity: 0.4; }

  .center-card-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .pile-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-subtle);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .center-snap-target {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(46, 204, 113, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    clip-path: none;
    animation: snapTargetPulse 0.5s ease-in-out infinite alternate;
  }

  @keyframes snapTargetPulse {
    from { background: rgba(46, 204, 113, 0.2); }
    to { background: rgba(46, 204, 113, 0.4); }
  }

  .center-snap-text {
    font-size: clamp(3rem, 15vw, 6rem);
    font-weight: 700;
    color: white;
    letter-spacing: 0.2em;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  }

  /* === Snap result overlays === */
  .snap-result-overlay {
    position: fixed;
    inset: 0;
    z-index: 150;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    pointer-events: none;
    animation: fadeUp 0.2s ease;
  }

  .snap-result-overlay.valid { background: rgba(46, 204, 113, 0.3); }
  .snap-result-overlay.invalid { background: rgba(231, 76, 60, 0.3); }

  .snap-result-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: clamp(1.25rem, 5vw, 2rem);
    font-weight: 700;
    color: white;
    text-align: center;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  }

  .snap-result-banner {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: -3rem;
    padding: 0.75rem;
    border-radius: 8px;
    text-align: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    animation: fadeUp 0.2s ease;
    z-index: 20;
  }

  .snap-result-banner.valid { background: rgba(46, 204, 113, 0.85); }
  .snap-result-banner.invalid { background: rgba(231, 76, 60, 0.85); }

  /* === Snap flash on container === */
  .snap-flash {
    animation: snapFlash 0.3s ease;
  }

  @keyframes snapFlash {
    0% { background: var(--bg); }
    50% { background: rgba(46, 204, 113, 0.15); }
    100% { background: var(--bg); }
  }

  /* === PLAYER: Lobby === */
  .player-lobby {
    padding: 2rem 1.25rem;
    align-items: center;
    gap: 1.5rem;
    overflow-y: auto;
  }

  .lobby-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 400px;
  }

  .lobby-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--accent);
  }

  .panel {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    overflow: visible;
    position: relative;
    width: 100%;
    max-width: 400px;
  }

  .panel-border {
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
    pointer-events: none;
  }

  .panel-inner {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.5rem;
  }

  .section-label {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
    text-transform: uppercase;
  }

  .player-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .player-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    color: var(--text);
  }

  .player-item:last-child { border-bottom: none; }
  .player-item.disconnected { opacity: 0.4; }

  .player-name { flex: 1; }

  .host-badge, .you-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .host-badge {
    background: var(--accent-faint);
    color: var(--accent);
  }

  .you-badge {
    background: rgba(90, 138, 90, 0.15);
    color: var(--text-muted);
  }

  .waiting-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  .btn-full {
    width: 100%;
    padding: 0.875rem 1.25rem;
    font-size: 0.9375rem;
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
    width: 100%;
    max-width: 400px;
  }

  .leave-btn {
    padding: 0.6rem 1.5rem;
    font-size: 0.8rem;
  }

  /* === PLAYER: Playing === */
  .player-playing {
    position: relative;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    height: 50px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .top-pile, .top-deck {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .top-deck {
    color: var(--accent);
  }

  .card-display-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    min-height: 0;
  }

  /* === Bottom action area === */
  .bottom-area {
    flex-shrink: 0;
    padding: 0.75rem 1rem;
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .draw-btn {
    min-height: 120px;
    font-size: 2rem;
    font-weight: 700;
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    width: 100%;
    border-radius: 8px;
  }

  .draw-btn-disabled {
    min-height: 120px;
    font-size: 1rem;
    font-weight: 600;
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    width: 100%;
    border-radius: 8px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    opacity: 0.6;
    cursor: default;
    clip-path: none;
  }

  .snap-btn {
    min-height: 150px;
    font-size: 3rem;
    font-weight: 700;
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 8px;
    width: 100%;
    cursor: pointer;
    clip-path: none;
    animation: snapPulse 0.5s ease-in-out infinite alternate;
  }

  .snap-btn-idle {
    min-height: 80px;
    font-size: 1.5rem;
    background: var(--bg-input);
    color: var(--text-subtle);
    border: 1px solid var(--border);
    animation: none;
    opacity: 0.5;
  }

  .snap-btn-idle:active {
    opacity: 1;
    background: #e74c3c;
    color: white;
  }

  @keyframes snapPulse {
    from { transform: scale(1); box-shadow: 0 0 20px rgba(231, 76, 60, 0.5); }
    to { transform: scale(1.03); box-shadow: 0 0 40px rgba(231, 76, 60, 0.8); }
  }

  .eliminated-msg {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 2rem;
  }

  .eliminated-text {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--text-muted);
  }

  .eliminated-sub {
    font-size: 0.85rem;
    color: var(--text-subtle);
  }

  /* === Game over === */
  .game-over-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    width: 100%;
    max-width: 400px;
    padding: 0 1.25rem;
  }

  .winner-text {
    font-size: clamp(2rem, 8vw, 3rem);
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text);
    text-align: center;
  }

  .winner-text.you-won {
    color: var(--accent);
  }

  .final-scores {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .score-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .score-row:last-child { border-bottom: none; }

  .score-row.winner {
    color: var(--accent);
    font-weight: 600;
  }

  .score-name { flex: 1; }

  .score-cards {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  /* === Shared button styles === */
  button:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  @media (max-width: 420px) {
    .snap-result-overlay {
      padding: 1rem;
    }
  }

  @media (max-width: 360px) {
    .player-lobby {
      padding-left: 0.375rem;
      padding-right: 0.375rem;
    }
    .panel-inner {
      padding: 1rem;
    }
  }

  @media (min-width: 480px) {
    .panel-inner { padding: 1.875rem; }
  }

  .spectator-banner {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: center;
    padding: 0.35rem;
    background: var(--accent-faint, rgba(74, 144, 217, 0.1));
    color: var(--accent, #4a90d9);
    border-bottom: 1px solid var(--border);
  }
</style>
