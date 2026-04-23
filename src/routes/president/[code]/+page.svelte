<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import Hand from '$lib/components/cards/Hand.svelte';
  import PlayerSeat from '$lib/components/cards/PlayerSeat.svelte';
  import NameFrame from '$lib/components/NameFrame.svelte';
  import TablePile from '$lib/components/cards/TablePile.svelte';
  import { fireWinConfetti } from '$lib/vfx';
  import { currentUser } from '$lib/auth';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/president');

  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let isSpectator = $state(false);
  let selectedCards: any[] = $state([]);
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
      .catch(() => goto('/president'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/president');
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let isMyTurn = $derived(state?.currentTurn === pid);
  let myHand = $derived((state?.tableState?.myHand ?? []) as { suit: string; rank: string; value: number }[]);
  let pile = $derived((state?.tableState?.pile ?? []) as { suit: string; rank: string; value: number }[]);
  let pilePlayCount = $derived(state?.tableState?.pilePlayCount ?? 0);
  let titles = $derived((state?.tableState?.titles ?? {}) as Record<string, string>);
  let finishOrder = $derived((state?.tableState?.finishOrder ?? []) as string[]);
  let passedPlayers = $derived(new Set(state?.tableState?.passedPlayers ?? []));

  // VFX: confetti on round over (you finished first = President)
  let vfxFired = $state(false);
  $effect(() => {
    if (state?.phase === 'round_over' && !vfxFired) {
      vfxFired = true;
      if (finishOrder[0] === pid) fireWinConfetti();
    }
    if (state?.phase !== 'round_over') vfxFired = false;
  });

  // VFX: combo callout for pairs/triples/quads
  let comboText = $state('');
  let comboClass = $state('');
  let prevPileLen = $state(0);
  $effect(() => {
    const pLen = pile.length;
    if (pLen > prevPileLen && pilePlayCount > 1 && state?.phase === 'playing') {
      if (pilePlayCount === 2) {
        comboText = 'Pair!';
        comboClass = 'combo-pair';
      } else if (pilePlayCount === 3) {
        comboText = 'Triple!';
        comboClass = 'combo-triple';
      } else if (pilePlayCount >= 4) {
        comboText = 'QUAD!';
        comboClass = 'combo-quad';
      }
      setTimeout(() => { comboText = ''; comboClass = ''; }, pilePlayCount >= 4 ? 1500 : pilePlayCount === 3 ? 1200 : 800);
    }
    prevPileLen = pLen;
  });

  const PRESIDENT_ORDER: Record<string, number> = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  };

  function isCardPlayable(card: { suit: string; rank: string }): boolean {
    if (!isMyTurn) return false;
    if (finishOrder.includes(pid!)) return false;
    if (pile.length === 0) return true; // leading — any card
    // Must beat the top of pile, and need enough cards of this rank
    const topRank = pile[pile.length - 1].rank;
    if ((PRESIDENT_ORDER[card.rank] ?? 0) <= (PRESIDENT_ORDER[topRank] ?? 0)) return false;
    // Check if player has enough of this rank to match pilePlayCount
    const countOfRank = myHand.filter((c: any) => c.rank === card.rank).length;
    return countOfRank >= pilePlayCount;
  }

  function canPlay(): boolean {
    if (!isMyTurn || selectedCards.length === 0) return false;
    if (finishOrder.includes(pid!)) return false;
    if (pile.length > 0 && selectedCards.length !== pilePlayCount) return false;
    return true;
  }

  function playCards() {
    if (!canPlay()) return;
    socket.send({ type: 'play_cards', cards: selectedCards });
    selectedCards = [];
  }

  function pass() {
    socket.send({ type: 'pass' });
    selectedCards = [];
  }

  function startGame() { socket.send({ type: 'start_game' }); }
  function nextRound() { socket.send({ type: 'next_round' }); }
  function playAgain() { socket.send({ type: 'play_again' }); }
  function endGame() { socket.send({ type: 'end_game' }); }

  function leaveGame() {
    socket.disconnect();
    gameState.set(null);
    goto('/president');
  }

  function playerName(id: string): string {
    return state?.players?.find((p: any) => p.id === id)?.name ?? 'Unknown';
  }

  // Cosmetics: card back and table felt from auth store
  let myCardBackStyle = $derived($currentUser?.cardBack ?? null);
  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');

  let addingBot = $state(false);

  async function addBot() {
    addingBot = true;
    try {
      await fetch(`/api/add-bot?room=${code}&game=president`, { method: 'POST' });
    } catch {}
    addingBot = false;
  }

  async function removeAllBots() {
    await fetch(`/api/remove-bots?room=${code}&game=president`, { method: 'POST' });
  }
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
              <NameFrame
                name={player.name}
                frameSvg={player.frameSvg}
                emblemSvg={player.emblemSvg}
                nameColour={player.nameColour}
                isHost={player.isHost}
                isBot={player.isBot}
                compact
              />
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              {#if player.isBot}<span class="bot-badge">BOT</span>{/if}
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected && !player.isBot}<span class="dc-badge">DC</span>{/if}
            </div>
          {/each}
        </div>
        <p class="player-count">
          {state.players.length} / 6 players
          {#if state.players.length < 3}
            — Need {3 - state.players.length} more to start
          {/if}
        </p>
        {#if isHost}
          <button class="btn-primary" onclick={startGame} disabled={state.players.length < 3}>
            Start Game
          </button>
          <div class="bot-controls">
            <button class="btn-secondary btn-sm" onclick={addBot} disabled={state.players.length >= 6 || addingBot}>
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
        <div class="tutorial-warning">
          <p class="tutorial-warning-text">New to President?</p>
          <button class="btn-tutorial" onclick={() => goto('/president/tutorial')}>
            Read the rules first
          </button>
        </div>
      </div>

    <!-- PLAYING -->
    {:else if state.phase === 'playing'}
      <div class="phase-panel">
        {#if isSpectator}<div class="spectator-banner">Spectating</div>{/if}
        <!-- Turn indicator -->
        <div class="turn-indicator">
          {#if isMyTurn}
            <span class="your-turn">Your turn!</span>
          {:else}
            <span class="waiting-turn">Waiting for {playerName(state.currentTurn)}...</span>
          {/if}
        </div>

        <!-- Player bar -->
        <div class="player-bar">
          {#each state.players as player}
            <PlayerSeat
              name={player.name}
              cardCount={player.cardCount}
              active={state.currentTurn === player.id}
              connected={player.connected}
              title={titles[player.id]}
              finished={finishOrder.includes(player.id)}
              finishPosition={finishOrder.includes(player.id) ? finishOrder.indexOf(player.id) : undefined}
              passed={passedPlayers.has(player.id)}
              frameSvg={player.frameSvg}
              emblemSvg={player.emblemSvg}
              nameColour={player.nameColour}
              titleText={null}
              isHost={player.isHost}
              isBot={player.isBot}
              cardBackStyle={myCardBackStyle}
            />
          {/each}
        </div>

        <!-- Pile -->
        <TablePile
          cards={pile}
          mode="stack"
          label="Table"
          emptyText="Empty - play anything"
        />
        {#if pilePlayCount > 0}
          <div class="pile-info">Play {pilePlayCount} card{pilePlayCount > 1 ? 's' : ''}</div>
        {/if}

        <!-- Combo VFX callout -->
        {#if comboText}
          <div class="combo-callout {comboClass}">{comboText}</div>
        {/if}

        <!-- My hand -->
        <div class="hand-area">
          <div class="hand-label geo-title">Your Hand ({myHand.length})</div>
          <Hand
            cards={myHand}
            disabled={!isMyTurn}
            {selectedCards}
            multiSelect={true}
            {isCardPlayable}
            onchange={(cards) => { selectedCards = cards; }}
          />
        </div>

        <!-- Actions -->
        {#if isMyTurn && !finishOrder.includes(pid!)}
          <div class="action-bar">
            <button class="btn-primary" onclick={playCards} disabled={!canPlay()}>
              Play {selectedCards.length > 0 ? `(${selectedCards.length})` : ''}
            </button>
            <button class="btn-secondary" onclick={pass}>Pass</button>
          </div>
        {/if}
      </div>

    <!-- ROUND OVER -->
    {:else if state.phase === 'round_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Round Over!</h2>
        <div class="results-list">
          {#each finishOrder as fpid, i}
            {@const role = titles[fpid]?.toUpperCase?.() ?? ''}
            {@const roleClass = role === 'PRESIDENT' ? 'role-president' : role === 'SCUM' ? 'role-scum' : 'role-neutral'}
            {@const isWinner = i === 0}
            {@const isMe = fpid === pid}
            <div class="result-row {roleClass}" class:result-winner={isWinner}>
              <span class="result-position">#{i + 1}</span>
              <span class="result-name">{playerName(fpid)}</span>
              <div class="result-right">
                <span class="result-title {roleClass}">{titles[fpid]}</span>
                {#if isMe}
                  <span class="result-context">
                    {#if role === 'PRESIDENT'}You won this round!{:else if role === 'SCUM'}You lost this round.{:else}Middle of the pack.{/if}
                  </span>
                {/if}
              </div>
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

  .tutorial-warning {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.75rem 1rem;
    background: rgba(233, 69, 96, 0.06);
    border: 1px solid rgba(233, 69, 96, 0.2);
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

  /* Player bar */
  .player-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .pile-info {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Hand */
  .hand-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hand-label { font-size: 0.85rem; letter-spacing: 0.14em; color: var(--text-muted); text-align: center; }

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

  /* Results */
  .results-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--border);
    border-radius: 4px;
    transition: transform 0.2s;
  }

  .result-row.role-president { border-left-color: #4ade80; }
  .result-row.role-neutral { border-left-color: #facc15; }
  .result-row.role-scum { border-left-color: #f87171; }

  .result-row.result-winner {
    background: rgba(108, 180, 130, 0.1);
    border-color: rgba(108, 180, 130, 0.4);
    box-shadow: 0 0 16px rgba(108, 180, 130, 0.15);
    padding: 1rem 1rem;
  }

  .result-row.result-winner .result-position {
    font-size: 1.5rem;
  }

  .result-row.result-winner .result-name {
    font-size: 1.15rem;
    font-weight: 700;
  }

  .result-position {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--accent);
    min-width: 2rem;
  }

  .result-name {
    flex: 1;
    font-size: 1rem;
    color: var(--text);
  }

  .result-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
  }

  .result-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .result-title.role-president { color: #4ade80; }
  .result-title.role-neutral { color: #facc15; }
  .result-title.role-scum { color: #f87171; }

  .result-context {
    font-size: 0.8rem;
    font-style: italic;
    color: var(--text-muted);
  }

  /* Combo VFX callouts */
  .combo-callout {
    text-align: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    pointer-events: none;
    animation: comboIn 0.4s ease-out both;
  }

  .combo-pair {
    font-size: 1rem;
    color: var(--accent);
    opacity: 0.85;
  }

  .combo-triple {
    font-size: 1.3rem;
    color: #ffcc00;
    text-shadow: 0 0 12px rgba(255, 204, 0, 0.5);
  }

  .combo-quad {
    font-size: 1.8rem;
    color: #ff2d55;
    text-shadow: 0 0 20px rgba(255, 45, 85, 0.6), 0 0 40px rgba(255, 45, 85, 0.3);
    animation: quadIn 0.5s ease-out both;
  }

  @keyframes comboIn {
    0% { transform: scale(0.5); opacity: 0; }
    60% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); }
  }

  /* Mobile responsiveness */
  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      padding-bottom: max(4.5rem, env(safe-area-inset-bottom, 4.5rem));
    }

    .player-bar {
      gap: 0.375rem;
    }

    .result-row {
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
    }

    .result-row.result-winner {
      padding: 0.75rem 0.75rem;
    }

    .action-bar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 40;
      gap: 0.5rem;
      padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom, 0.75rem));
      background: var(--bg-card);
      border-top: 1px solid var(--border);
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
    }

    .action-bar .btn-primary,
    .action-bar .btn-secondary {
      max-width: none;
      flex: 1;
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
    .result-row {
      gap: 0.375rem;
      padding: 0.5rem;
    }
    .result-position {
      min-width: 1.5rem;
    }
  }

  @media (min-width: 421px) and (max-width: 768px) {
    .phase-panel {
      max-width: 460px;
    }
  }

  @keyframes quadIn {
    0% { transform: scale(0.3) rotate(-3deg); opacity: 0; filter: blur(4px); }
    50% { transform: scale(1.2) rotate(1deg); opacity: 1; filter: blur(0); }
    70% { transform: scale(0.95) rotate(0deg); }
    100% { transform: scale(1); }
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
