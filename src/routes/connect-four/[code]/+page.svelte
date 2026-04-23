<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import { fireWinConfetti } from '$lib/vfx';
  import { currentUser } from '$lib/auth';
  import NameFrame from '$lib/components/NameFrame.svelte';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/connect-four');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);
  let isSpectator = $state(false);

  let reconnecting = $state(true);
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

    socket.connect(code)
      .then(() => socket.joinRoom(code))
      .catch(() => goto('/connect-four'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/connect-four');
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let isMyTurn = $derived(state?.currentTurn === pid);
  let board = $derived((state?.tableState?.board ?? []) as number[][]);
  let myPiece = $derived(state?.tableState?.myPiece ?? null);
  let winnerId = $derived(state?.tableState?.winnerId ?? null);
  let winCells = $derived((state?.tableState?.winCells ?? null) as [number, number][] | null);
  let isDraw = $derived(state?.tableState?.isDraw ?? false);
  let lastMove = $derived(state?.tableState?.lastMove ?? null);
  let scores = $derived((state?.scores ?? {}) as Record<string, number>);

  // VFX: confetti on win
  let vfxFired = $state(false);
  $effect(() => {
    if (state?.phase === 'round_over' && !vfxFired && winnerId === pid) {
      vfxFired = true;
      fireWinConfetti();
    }
    if (state?.phase !== 'round_over') vfxFired = false;
  });

  // Hover column for preview
  let hoverCol: number | null = $state(null);

  function dropPiece(col: number) {
    if (!isMyTurn || state?.phase !== 'playing') return;
    socket.send({ type: 'drop_piece', column: col });
  }

  function startGame() { socket.send({ type: 'start_game' }); }
  function nextRound() { socket.send({ type: 'next_round' }); }
  function playAgain() { socket.send({ type: 'play_again' }); }
  function endGame() { socket.send({ type: 'end_game' }); }

  function leaveGame() {
    socket.disconnect();
    gameState.set(null);
    goto('/connect-four');
  }

  function playerName(id: string): string {
    return state?.players?.find((p: any) => p.id === id)?.name ?? 'Unknown';
  }

  function isWinCell(row: number, col: number): boolean {
    if (!winCells) return false;
    return winCells.some(([r, c]: [number, number]) => r === row && c === col);
  }

  function getPreviewRow(col: number): number {
    for (let row = 5; row >= 0; row--) {
      if (board[row]?.[col] === 0) return row;
    }
    return -1;
  }

  let addingBot = $state(false);

  async function addBot() {
    addingBot = true;
    try {
      await fetch(`/api/add-bot?room=${code}&game=connect-four`, { method: 'POST' });
    } catch {}
    addingBot = false;
  }

  async function removeAllBots() {
    await fetch(`/api/remove-bots?room=${code}&game=connect-four`, { method: 'POST' });
  }

  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');
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
        <h2 class="geo-title phase-title">Lobby</h2>
        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} titleText={null} isHost={player.isHost} isBot={player.isBot} />
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              {#if player.isBot}<span class="bot-badge">BOT</span>{/if}
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected && !player.isBot}<span class="dc-badge">DC</span>{/if}
            </div>
          {/each}
        </div>
        <p class="player-count">
          {state.players.length} / 2 players
          {#if state.players.length < 2}
            — Need {2 - state.players.length} more to start
          {/if}
        </p>
        {#if isHost}
          <button class="btn-primary" onclick={startGame} disabled={state.players.length < 2}>
            Start Game
          </button>
          <div class="bot-controls">
            <button class="btn-secondary btn-sm" onclick={addBot} disabled={state.players.length >= 2 || addingBot}>
              {addingBot ? 'Adding...' : 'Add Bot'}
            </button>
            {#if state.players.some((p: any) => p.isBot)}
              <button class="btn-secondary btn-sm btn-danger" onclick={removeAllBots}>
                Remove Bot
              </button>
            {/if}
          </div>
        {:else}
          <p class="waiting-text">Waiting for host to start...</p>
        {/if}
        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
        <div class="tutorial-warning">
          <p class="tutorial-warning-text">New to Connect 4?</p>
          <button class="btn-tutorial" onclick={() => goto('/connect-four/tutorial')}>
            Read the rules first
          </button>
        </div>
      </div>

    <!-- PLAYING -->
    {:else if state.phase === 'playing'}
      <div class="phase-panel">
        {#if isSpectator}
          <div class="spectator-banner">Spectating</div>
        {/if}
        <!-- Turn indicator -->
        <div class="turn-indicator">
          {#if isSpectator}
            <span class="waiting-turn">{playerName(state.currentTurn)}'s turn</span>
          {:else if isMyTurn}
            <span class="your-turn">Your turn!</span>
            <span class="piece-indicator piece-{myPiece}"></span>
          {:else}
            <span class="waiting-turn">Waiting for {playerName(state.currentTurn)}...</span>
          {/if}
        </div>

        <!-- Score bar -->
        <div class="score-bar">
          {#each state.players as player}
            {@const piece = state.tableState.pieces[player.id]}
            <div class="score-item" class:active={state.currentTurn === player.id} aria-current={(state.currentTurn === player.id) ? 'true' : 'false'}>
              <span class="piece-dot piece-{piece}"></span>
              <NameFrame name={player.name + (player.id === pid ? ' (you)' : '')} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} titleText={null} isHost={player.isHost} isBot={player.isBot} />
              <span class="score-value">{scores[player.id] ?? 0}</span>
            </div>
          {/each}
        </div>

        <!-- Board -->
        <div class="board-wrapper">
          <div class="board"
            onmouseleave={() => { hoverCol = null; }}
          >
            {#each board as row, rowIdx}
              {#each row as cell, colIdx}
                {@const preview = isMyTurn && hoverCol === colIdx && cell === 0 && getPreviewRow(colIdx) === rowIdx}
                <button
                  class="cell"
                  class:cell-1={cell === 1}
                  class:cell-2={cell === 2}
                  class:win-cell={isWinCell(rowIdx, colIdx)}
                  class:last-move={lastMove?.row === rowIdx && lastMove?.col === colIdx}
                  class:preview={preview}
                  class:preview-1={preview && myPiece === 1}
                  class:preview-2={preview && myPiece === 2}
                  class:clickable={isMyTurn && cell === 0}
                  onclick={() => dropPiece(colIdx)}
                  onmouseenter={() => { if (isMyTurn) hoverCol = colIdx; }}
                  aria-label="Column {colIdx + 1}, Row {rowIdx + 1}"
                >
                  <span class="piece"></span>
                </button>
              {/each}
            {/each}
          </div>
        </div>
      </div>

    <!-- ROUND OVER -->
    {:else if state.phase === 'round_over'}
      <div class="phase-panel">
        {#if isDraw}
          <h2 class="geo-title phase-title">Draw!</h2>
          <p class="result-desc">The board is full — no winner this round.</p>
        {:else if winnerId}
          <h2 class="geo-title phase-title">
            {winnerId === pid ? 'You Win!' : `${playerName(winnerId)} Wins!`}
          </h2>
        {/if}

        <!-- Show final board -->
        <div class="board-wrapper">
          <div class="board">
            {#each board as row, rowIdx}
              {#each row as cell, colIdx}
                <div
                  class="cell"
                  class:cell-1={cell === 1}
                  class:cell-2={cell === 2}
                  class:win-cell={isWinCell(rowIdx, colIdx)}
                >
                  <span class="piece"></span>
                </div>
              {/each}
            {/each}
          </div>
        </div>

        <!-- Score bar -->
        <div class="score-bar">
          {#each state.players as player}
            {@const piece = state.tableState.pieces[player.id]}
            <div class="score-item" class:winner={player.id === winnerId}>
              <span class="piece-dot piece-{piece}"></span>
              <NameFrame name={player.name + (player.id === pid ? ' (you)' : '')} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} titleText={null} isHost={player.isHost} isBot={player.isBot} />
              <span class="score-value">{scores[player.id] ?? 0}</span>
            </div>
          {/each}
        </div>

        {#if isHost}
          <div class="action-bar">
            <button class="btn-primary" onclick={nextRound}>Next Round</button>
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
        <div class="score-bar">
          {#each state.players as player}
            <div class="score-item">
              <NameFrame name={player.name} frameSvg={player.frameSvg} emblemSvg={player.emblemSvg} nameColour={player.nameColour} titleText={null} isHost={player.isHost} isBot={player.isBot} />
              <span class="score-value">{scores[player.id] ?? 0} wins</span>
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
  :root {
    --player-red: #e74c3c;
    --player-red-10: rgba(231, 76, 60, 0.1);
    --player-red-30: rgba(231, 76, 60, 0.3);
    --player-red-bright: #ff6b6b;
    --player-red-deep: #c0392b;
    --player-yellow: #f1c40f;
    --player-yellow-bright: #ffd93d;
    --player-yellow-deep: #d4ac0d;
    --board-blue-main: #1a3a6e;
    --board-blue-deep: #0d1b2a;
    --board-blue-mid: #162d50;
    --bot-purple: #9b59b6;
    --bot-purple-15: rgba(155, 89, 182, 0.15);
    --panel-overlay-06: rgba(233, 69, 96, 0.06);
    --panel-overlay-20: rgba(233, 69, 96, 0.2);
    --felt-green-10: rgba(108, 180, 130, 0.1);
    --felt-green-40: rgba(108, 180, 130, 0.4);
    --felt-green-glow-30: rgba(108, 180, 130, 0.3);
    --felt-green-glow-60: rgba(108, 180, 130, 0.6);
    --shadow-dark-20: rgba(0, 0, 0, 0.2);
    --shadow-dark-30: rgba(0, 0, 0, 0.3);
    --highlight-white-10: rgba(255, 255, 255, 0.1);
    --highlight-white-50: rgba(255, 255, 255, 0.5);
    --yellow-alert-30: rgba(234, 179, 8, 0.3);
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

  .host-badge, .dc-badge, .bot-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .host-badge { background: var(--accent-faint); color: var(--accent); }
  .owner-crown { font-size: 0.85rem; margin-left: -0.25rem; }
  .dc-badge { background: var(--bg-input); color: var(--text-subtle); }
  .bot-badge { background: var(--bot-purple-15); color: var(--bot-purple); }

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
    color: var(--player-red) !important;
    border-color: var(--player-red-30) !important;
  }

  .btn-danger:hover {
    background: var(--player-red-10) !important;
  }

  .player-count {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  .tutorial-warning {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--panel-overlay-06);
    border: 1px solid var(--panel-overlay-20);
    border-radius: 4px;
  }

  .tutorial-warning-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--yellow);
  }

  .btn-tutorial {
    background: var(--accent-faint) !important;
    color: var(--accent) !important;
    border: 1px solid var(--accent-border) !important;
    font-size: 0.8rem;
    padding: 0.4rem 1rem;
  }

  .btn-tutorial:hover {
    background: var(--accent-border) !important;
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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
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
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .piece-indicator {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }

  .piece-indicator.piece-1 { background: var(--player-red); }
  .piece-indicator.piece-2 { background: var(--player-yellow); }

  /* Score bar */
  .score-bar {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .score-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.875rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    flex: 1;
    max-width: 220px;
  }

  .score-item.active {
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .score-item.winner {
    border-color: var(--felt-green-40);
    background: var(--felt-green-10);
  }

  .piece-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .piece-dot.piece-1 { background: var(--player-red); }
  .piece-dot.piece-2 { background: var(--player-yellow); }

  .score-name {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .score-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
  }

  /* Board */
  .board-wrapper {
    display: flex;
    justify-content: center;
    padding: 0.5rem 0;
  }

  .board {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-template-rows: repeat(6, 1fr);
    gap: 4px;
    background: var(--board-blue-main);
    padding: 8px;
    border-radius: 8px;
    width: 100%;
    max-width: min(380px, calc(100vw - 2rem));
    aspect-ratio: 7 / 6;
    box-shadow: 0 4px 20px var(--shadow-dark-30), inset 0 1px 0 var(--highlight-white-10);
  }

  .cell {
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--board-blue-deep);
    border: none;
    padding: 0;
    cursor: default;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease;
    clip-path: none;
  }

  .cell .piece {
    width: 85%;
    height: 85%;
    border-radius: 50%;
    transition: background 0.15s ease, transform 0.2s ease, box-shadow 0.2s ease;
  }

  .cell.clickable {
    cursor: pointer;
  }

  .cell.clickable:hover {
    background: var(--board-blue-mid);
  }

  /* Pieces */
  .cell.cell-1 .piece {
    background: radial-gradient(circle at 35% 35%, var(--player-red-bright), var(--player-red) 50%, var(--player-red-deep));
    box-shadow: inset 0 -2px 4px var(--shadow-dark-30), 0 1px 3px var(--shadow-dark-20);
  }

  .cell.cell-2 .piece {
    background: radial-gradient(circle at 35% 35%, var(--player-yellow-bright), var(--player-yellow) 50%, var(--player-yellow-deep));
    box-shadow: inset 0 -2px 4px var(--shadow-dark-20), 0 1px 3px var(--shadow-dark-20);
  }

  /* Preview piece (ghost) */
  .cell.preview .piece {
    opacity: 0.35;
  }

  .cell.preview-1 .piece {
    background: radial-gradient(circle at 35% 35%, var(--player-red-bright), var(--player-red) 50%, var(--player-red-deep));
  }

  .cell.preview-2 .piece {
    background: radial-gradient(circle at 35% 35%, var(--player-yellow-bright), var(--player-yellow) 50%, var(--player-yellow-deep));
  }

  /* Win highlight */
  .cell.win-cell .piece {
    animation: winPulse 0.8s ease-in-out infinite alternate;
    box-shadow: 0 0 12px var(--felt-green-glow-60), 0 0 24px var(--felt-green-glow-30);
  }

  /* Last move indicator */
  .cell.last-move::after {
    content: '';
    position: absolute;
    width: 20%;
    height: 20%;
    border-radius: 50%;
    background: var(--highlight-white-50);
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  @keyframes winPulse {
    0% { transform: scale(1); }
    100% { transform: scale(1.08); }
  }

  .result-desc {
    font-size: 0.9rem;
    color: var(--text-muted);
    text-align: center;
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

  /* Mobile responsiveness */
  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }

    .board {
      padding: 5px;
      gap: 3px;
      border-radius: 6px;
      max-width: calc(100vw - 1rem);
    }

    .score-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .score-item {
      max-width: none;
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
    border: 1px solid var(--yellow-alert-30);
    border-radius: 2px;
    padding: 0.3rem 0.75rem;
    text-align: center;
    margin-bottom: 0.5rem;
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
</style>
