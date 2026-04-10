<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';
  import Dial from '$lib/components/wavelength/Dial.svelte';

  const PLAYER_COLORS = [
    '#4a90d9', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#3498db', '#e91e63', '#00bcd4',
    '#ff5722', '#8bc34a', '#ff9800', '#673ab7', '#009688', '#cddc39'
  ];

  const socket = new CardGameSocket('/ws/wavelength');
  const gameState = writable<any>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  const code = $page.params.code!;

  let showCopied = $state(false);
  let reconnecting = $state(true);
  let errorTimeout: ReturnType<typeof setTimeout>;

  // Clue input
  let clueText = $state('');

  // Custom card inputs
  let customLeft = $state('');
  let customRight = $state('');

  // Needle angle for guessing
  let myNeedleAngle = $state(90);

  // Throttle for submit_guess
  let guessThrottleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSentAngle = $state<number | null>(null);

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
      .catch(() => goto('/wavelength'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/wavelength');
    }
  });

  // Send guess angle on needle move (throttled)
  $effect(() => {
    if (state?.phase === 'guessing' && !isPsychic && myNeedleAngle !== lastSentAngle) {
      if (guessThrottleTimer) clearTimeout(guessThrottleTimer);
      guessThrottleTimer = setTimeout(() => {
        socket.send({ type: 'submit_guess', angle: Math.round(myNeedleAngle) });
        lastSentAngle = myNeedleAngle;
      }, 80);
    }
  });

  // Derived state
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p: any) => p.id === pid)?.isHost ?? false);
  let isPsychic = $derived(state?.psychicId === pid);
  let myPlayer = $derived(state?.players?.find((p: any) => p.id === pid));

  // Player color map
  let playerColorMap = $derived.by(() => {
    const map: Record<string, string> = {};
    if (!state?.players) return map;
    state.players.forEach((p: any, i: number) => {
      map[p.id] = PLAYER_COLORS[i % PLAYER_COLORS.length];
    });
    return map;
  });

  // Other needles for guessing/reveal phases
  let otherNeedles = $derived.by(() => {
    if (!state?.guesses || !state?.players) return [];
    return state.players
      .filter((p: any) => p.id !== pid && p.id !== state.psychicId && state.guesses[p.id] != null)
      .map((p: any) => ({
        playerId: p.id,
        angle: state.guesses[p.id],
        name: p.name,
        color: playerColorMap[p.id] ?? '#888',
      }));
  });

  // Reveal scores for Dial
  let revealScores = $derived.by(() => {
    if (state?.phase !== 'reveal') return [];
    const scores: Array<{ playerId: string; score: number; angle: number }> = [];
    if (!state?.guesses || !state?.players) return scores;
    for (const p of state.players) {
      if (p.id === state.psychicId) continue;
      if (state.guesses[p.id] != null) {
        // Score calculation is server-side; we use round score if available
        const roundScore = state.roundScores?.[p.id] ?? 0;
        scores.push({
          playerId: p.id === pid ? 'me' : p.id,
          score: roundScore,
          angle: state.guesses[p.id],
        });
      }
    }
    return scores;
  });

  // Countdown timer
  let timeLeft = $state<number | null>(null);
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (state?.timerEndsAt) {
      const update = () => {
        const remaining = Math.max(0, Math.ceil((state.timerEndsAt - Date.now()) / 1000));
        timeLeft = remaining;
        if (remaining <= 0 && timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
      };
      update();
      timerInterval = setInterval(update, 250);
    } else {
      timeLeft = null;
    }
    return () => { if (timerInterval) clearInterval(timerInterval); };
  });

  // Sorted scoreboard
  let sortedPlayers = $derived.by(() => {
    if (!state?.players) return [];
    return [...state.players].sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0));
  });

  // Psychic name
  let psychicName = $derived(state?.players?.find((p: any) => p.id === state?.psychicId)?.name ?? 'Psychic');

  // Has locked in
  let hasLockedIn = $derived(state?.lockedIn?.includes(pid) ?? false);

  // Actions
  function startGame() { socket.send({ type: 'start_game' }); }
  function nextRound() { socket.send({ type: 'next_round' }); }
  function playAgain() { socket.send({ type: 'play_again' }); }
  function endGame() { socket.send({ type: 'end_game' }); }
  function doneCluing() { socket.send({ type: 'done_cluing' }); }
  function lockGuess() { socket.send({ type: 'lock_guess' }); }

  function sendClue() {
    const text = clueText.trim();
    if (!text) return;
    socket.send({ type: 'send_clue', text });
    clueText = '';
  }

  function addCustomCard() {
    const left = customLeft.trim();
    const right = customRight.trim();
    if (!left || !right) return;
    socket.send({ type: 'add_custom_card', left, right });
    customLeft = '';
    customRight = '';
  }

  function leaveGame() {
    socket.disconnect();
    gameState.set(null);
    goto('/wavelength');
  }

  function copyCode() {
    navigator.clipboard.writeText(code);
    showCopied = true;
    setTimeout(() => { showCopied = false; }, 1500);
  }

  let addingBot = $state(false);

  async function addBot() {
    addingBot = true;
    try {
      await fetch(`/api/add-bot?room=${code}&game=wavelength`, { method: 'POST' });
    } catch {
      error.set('Failed to add bot');
    }
    addingBot = false;
  }

  async function removeAllBots() {
    await fetch(`/api/remove-bots?room=${code}&game=wavelength`, { method: 'POST' });
  }

  function playerName(id: string): string {
    return state?.players?.find((p: any) => p.id === id)?.name ?? 'Unknown';
  }

  function handleClueKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendClue();
    }
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

    <!-- Room header -->
    <div class="room-header">
      <button class="room-code-value" onclick={copyCode} aria-label="Copy room code">{code}</button>
      <span class="room-code-hint">{showCopied ? 'Copied!' : 'tap to copy'}</span>
    </div>

    <!-- Timer -->
    {#if timeLeft != null && timeLeft > 0}
      <div class="timer" class:timer-urgent={timeLeft <= 5}>
        <span class="timer-value">{timeLeft}</span>
        <span class="timer-label">s</span>
      </div>
    {/if}

    <!-- LOBBY -->
    {#if state.phase === 'lobby'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Lobby</h2>
        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name">{player.name}</span>
              {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
              {#if player.isBot}<span class="bot-badge">BOT</span>{/if}
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected && !player.isBot}<span class="dc-badge">DC</span>{/if}
            </div>
          {/each}
        </div>
        <p class="player-count">
          {state.players.length} player{state.players.length !== 1 ? 's' : ''}
          {#if state.players.length < 2}
            — Need {2 - state.players.length} more to start
          {/if}
        </p>
        {#if isHost}
          <button class="btn-primary" onclick={startGame} disabled={state.players.length < 2}>
            Start Game
          </button>
          <div class="bot-controls">
            <button class="btn-secondary btn-sm" onclick={addBot} disabled={addingBot}>
              {addingBot ? 'Adding...' : 'Add Bot'}
            </button>
            {#if state.players.some((p: any) => p.isBot)}
              <button class="btn-secondary btn-sm btn-danger" onclick={removeAllBots}>
                Remove Bots
              </button>
            {/if}
          </div>
        {:else}
          <p class="waiting-text">Waiting for host to start...</p>
        {/if}

        <!-- Custom cards -->
        {#if state.allowCustomCards}
          <div class="custom-card-section">
            <h3 class="section-label">Add Custom Card</h3>
            <div class="custom-card-form">
              <input
                type="text"
                class="input-field"
                placeholder="Left label"
                bind:value={customLeft}
                maxlength="40"
              />
              <span class="arrow-divider">&#8596;</span>
              <input
                type="text"
                class="input-field"
                placeholder="Right label"
                bind:value={customRight}
                maxlength="40"
              />
              <button class="btn-secondary btn-sm" onclick={addCustomCard} disabled={!customLeft.trim() || !customRight.trim()}>
                Add
              </button>
            </div>
            {#if state.customCardCount > 0}
              <p class="custom-count">{state.customCardCount} custom card{state.customCardCount !== 1 ? 's' : ''} added</p>
            {/if}
          </div>
        {/if}

        <button class="btn-secondary" onclick={leaveGame}>Leave</button>
      </div>

    <!-- CLUE GIVING -->
    {:else if state.phase === 'clue_giving'}
      <div class="phase-panel">
        <div class="round-indicator">
          <span class="round-badge">Round {state.roundNumber} / {state.totalRounds}</span>
        </div>

        <!-- Spectrum card -->
        {#if state.currentCard}
          <div class="spectrum-card">
            <span class="spectrum-left">{state.currentCard.left}</span>
            <span class="spectrum-arrow">&#8596;</span>
            <span class="spectrum-right">{state.currentCard.right}</span>
          </div>
        {/if}

        {#if isPsychic}
          <!-- Psychic view: sees target -->
          <Dial
            leftLabel={state.currentCard?.left ?? ''}
            rightLabel={state.currentCard?.right ?? ''}
            targetAngle={state.targetAngle ?? 90}
            showTarget={true}
            showMyNeedle={false}
            disabled={true}
          />

          <p class="role-label">You are the Psychic! Give clues to guide your team.</p>

          <!-- Clue input -->
          <div class="clue-input-row">
            <input
              type="text"
              class="input-field clue-input"
              placeholder="Type a clue..."
              bind:value={clueText}
              onkeydown={handleClueKeydown}
              maxlength="100"
            />
            <button class="btn-primary btn-sm" onclick={sendClue} disabled={!clueText.trim()}>
              Send
            </button>
          </div>

          <!-- Clue feed -->
          {#if state.clues?.length > 0}
            <div class="clue-feed">
              {#each state.clues as clue}
                <div class="clue-bubble clue-mine">{clue}</div>
              {/each}
            </div>
          {/if}

          <button class="btn-primary" onclick={doneCluing}>Done Cluing</button>

        {:else}
          <!-- Guesser view: no target -->
          <Dial
            leftLabel={state.currentCard?.left ?? ''}
            rightLabel={state.currentCard?.right ?? ''}
            showTarget={false}
            showMyNeedle={false}
            disabled={true}
          />

          <p class="role-label">Waiting for <strong>{psychicName}</strong> to give clues...</p>

          <!-- Clue feed -->
          {#if state.clues?.length > 0}
            <div class="clue-feed">
              {#each state.clues as clue}
                <div class="clue-bubble">{clue}</div>
              {/each}
            </div>
          {:else}
            <p class="waiting-text">No clues yet...</p>
          {/if}
        {/if}
      </div>

    <!-- GUESSING -->
    {:else if state.phase === 'guessing'}
      <div class="phase-panel">
        <div class="round-indicator">
          <span class="round-badge">Round {state.roundNumber} / {state.totalRounds}</span>
        </div>

        <!-- Spectrum card -->
        {#if state.currentCard}
          <div class="spectrum-card">
            <span class="spectrum-left">{state.currentCard.left}</span>
            <span class="spectrum-arrow">&#8596;</span>
            <span class="spectrum-right">{state.currentCard.right}</span>
          </div>
        {/if}

        {#if isPsychic}
          <!-- Psychic sees target + other needles -->
          <Dial
            leftLabel={state.currentCard?.left ?? ''}
            rightLabel={state.currentCard?.right ?? ''}
            targetAngle={state.targetAngle ?? 90}
            showTarget={true}
            showMyNeedle={false}
            disabled={true}
            {otherNeedles}
          />

          <p class="role-label">Watching guessers place their needles...</p>
        {:else}
          <!-- Guesser: draggable needle -->
          <Dial
            leftLabel={state.currentCard?.left ?? ''}
            rightLabel={state.currentCard?.right ?? ''}
            showTarget={false}
            showMyNeedle={true}
            bind:myNeedleAngle
            disabled={hasLockedIn}
            {otherNeedles}
          />

          {#if !hasLockedIn}
            <button class="btn-primary" onclick={lockGuess}>Lock In</button>
          {:else}
            <p class="locked-in-text">Locked in! Waiting for others...</p>
          {/if}
        {/if}

        <!-- Clue feed (read-only) -->
        {#if state.clues?.length > 0}
          <div class="clue-feed">
            {#each state.clues as clue}
              <div class="clue-bubble">{clue}</div>
            {/each}
          </div>
        {/if}

        <!-- Lock-in status -->
        <div class="lockin-status">
          {#each state.players.filter((p: any) => p.id !== state.psychicId) as player}
            <span class="lockin-player" class:locked={state.lockedIn?.includes(player.id)}>
              {#if state.lockedIn?.includes(player.id)}
                <span class="check-mark">&#10003;</span>
              {/if}
              {player.name}
            </span>
          {/each}
        </div>
      </div>

    <!-- REVEAL -->
    {:else if state.phase === 'reveal'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Reveal</h2>

        <div class="round-indicator">
          <span class="round-badge">Round {state.roundNumber} / {state.totalRounds}</span>
        </div>

        <!-- Spectrum card -->
        {#if state.currentCard}
          <div class="spectrum-card">
            <span class="spectrum-left">{state.currentCard.left}</span>
            <span class="spectrum-arrow">&#8596;</span>
            <span class="spectrum-right">{state.currentCard.right}</span>
          </div>
        {/if}

        <!-- Dial showing target + all needles + scores -->
        <Dial
          leftLabel={state.currentCard?.left ?? ''}
          rightLabel={state.currentCard?.right ?? ''}
          targetAngle={state.targetAngle ?? 90}
          showTarget={true}
          showMyNeedle={!isPsychic && pid != null && state.guesses?.[pid] != null}
          myNeedleAngle={pid != null ? (state.guesses?.[pid] ?? 90) : 90}
          disabled={true}
          {otherNeedles}
          {revealScores}
        />

        <!-- Round scores -->
        <div class="round-scores">
          <h3 class="section-label">Round Scores</h3>
          {#each state.players.filter((p: any) => p.id !== state.psychicId) as player}
            <div class="score-row">
              <span class="score-row-name" style="color: {playerColorMap[player.id] ?? 'var(--text)'}">{player.name}</span>
              <span class="score-row-value">+{state.roundScores?.[player.id] ?? 0}</span>
            </div>
          {/each}
          <div class="score-row psychic-score">
            <span class="score-row-name">{psychicName} (psychic)</span>
            <span class="score-row-value">+{state.roundScores?.[state.psychicId] ?? 0}</span>
          </div>
        </div>

        <!-- Scoreboard -->
        <div class="scoreboard">
          <h3 class="section-label">Scoreboard</h3>
          {#each sortedPlayers as player, i}
            <div class="score-row" class:highlight={player.id === pid}>
              <span class="rank">#{i + 1}</span>
              <span class="score-row-name">{player.name}{player.id === pid ? ' (you)' : ''}</span>
              <span class="score-row-value">{player.score ?? 0}</span>
            </div>
          {/each}
        </div>

        {#if isHost}
          <div class="action-bar">
            {#if state.roundNumber < state.totalRounds}
              <button class="btn-primary" onclick={nextRound}>Next Round</button>
            {:else}
              <button class="btn-primary" onclick={nextRound}>See Results</button>
            {/if}
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

        <!-- Final scoreboard -->
        <div class="scoreboard final-scoreboard">
          {#each sortedPlayers as player, i}
            <div class="score-row" class:highlight={player.id === pid} class:winner={i === 0}>
              <span class="rank">#{i + 1}</span>
              <span class="score-row-name">{player.name}{player.id === pid ? ' (you)' : ''}</span>
              <span class="score-row-value">{player.score ?? 0}</span>
            </div>
          {/each}
        </div>

        <!-- Awards -->
        {#if state.awards}
          <div class="awards-section">
            <h3 class="section-label">Awards</h3>
            {#if state.awards.bestClue}
              <div class="award-card">
                <span class="award-icon">&#127942;</span>
                <div class="award-info">
                  <span class="award-title">Best Psychic</span>
                  <span class="award-detail">{state.awards.bestClue.psychicName} — avg +{state.awards.bestClue.avgScore.toFixed(1)}</span>
                </div>
              </div>
            {/if}
            {#if state.awards.mindMeld}
              <div class="award-card">
                <span class="award-icon">&#129504;</span>
                <div class="award-info">
                  <span class="award-title">Mind Meld</span>
                  <span class="award-detail">Round {state.awards.mindMeld.roundNumber} — {state.awards.mindMeld.spread.toFixed(0)}&#176; spread</span>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if isHost}
          <button class="btn-primary" onclick={playAgain}>Play Again</button>
        {/if}
        <button class="btn-secondary" onclick={leaveGame}>Back to Lobby</button>
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

  /* Error toast */
  .error-toast {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(231, 76, 60, 0.95);
    color: #fff;
    padding: 0.625rem 1.25rem;
    border-radius: 4px;
    font-size: 0.875rem;
    z-index: 100;
    animation: fadeUp 0.3s ease both;
  }

  /* Room header */
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
    font-size: 0.875rem;
    color: var(--text-subtle);
  }

  /* Timer */
  .timer {
    display: flex;
    align-items: baseline;
    gap: 0.15rem;
    margin-bottom: 0.75rem;
  }

  .timer-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .timer-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .timer-urgent .timer-value {
    color: #e74c3c;
    animation: timerPulse 0.5s ease-in-out infinite alternate;
  }

  @keyframes timerPulse {
    from { opacity: 1; }
    to { opacity: 0.5; }
  }

  /* Phase panel */
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

  /* Round indicator */
  .round-indicator {
    text-align: center;
  }

  .round-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border);
    padding: 0.25rem 0.75rem;
    border-radius: 2px;
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

  .waiting-text {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
  }

  /* Spectrum card */
  .spectrum-card {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .spectrum-left,
  .spectrum-right {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text);
  }

  .spectrum-arrow {
    font-size: 1.25rem;
    color: var(--text-muted);
  }

  /* Role label */
  .role-label {
    font-size: 0.875rem;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.4;
  }

  /* Clue input */
  .clue-input-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .clue-input {
    flex: 1;
  }

  .input-field {
    font-family: inherit;
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--text);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .input-field::placeholder {
    color: var(--text-subtle);
  }

  .input-field:focus {
    border-color: var(--accent-border);
  }

  /* Clue feed */
  .clue-feed {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    max-height: 200px;
    overflow-y: auto;
    padding: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .clue-bubble {
    padding: 0.4rem 0.75rem;
    background: rgba(74, 144, 217, 0.12);
    border: 1px solid rgba(74, 144, 217, 0.2);
    border-radius: 12px;
    font-size: 0.875rem;
    color: var(--text);
    align-self: flex-start;
  }

  .clue-bubble.clue-mine {
    background: rgba(108, 180, 130, 0.12);
    border-color: rgba(108, 180, 130, 0.25);
    align-self: flex-end;
  }

  /* Custom card form */
  .custom-card-section {
    padding: 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .custom-card-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .custom-card-form .input-field {
    flex: 1;
    min-width: 80px;
  }

  .arrow-divider {
    color: var(--text-muted);
    font-size: 1.1rem;
  }

  .custom-count {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.375rem;
  }

  /* Section label */
  .section-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  /* Lock-in status */
  .lockin-status {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .lockin-player {
    font-size: 0.8rem;
    color: var(--text-muted);
    padding: 0.25rem 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .lockin-player.locked {
    color: #2ecc71;
    border-color: rgba(46, 204, 113, 0.3);
    background: rgba(46, 204, 113, 0.08);
  }

  .check-mark {
    margin-right: 0.25rem;
  }

  .locked-in-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    color: #2ecc71;
    text-align: center;
    letter-spacing: 0.06em;
  }

  /* Round scores */
  .round-scores,
  .scoreboard {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .score-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .score-row.highlight {
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .score-row.winner {
    border-color: rgba(245, 200, 66, 0.4);
    background: rgba(245, 200, 66, 0.08);
  }

  .score-row.psychic-score {
    border-color: rgba(155, 89, 182, 0.3);
    background: rgba(155, 89, 182, 0.08);
  }

  .rank {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
    min-width: 1.5rem;
  }

  .score-row-name {
    flex: 1;
    font-size: 0.85rem;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .score-row-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
  }

  /* Awards */
  .awards-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .award-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 0.875rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .award-icon {
    font-size: 1.5rem;
  }

  .award-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .award-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text);
  }

  .award-detail {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  /* Final scoreboard */
  .final-scoreboard .score-row:first-child {
    border-color: rgba(245, 200, 66, 0.5);
    background: rgba(245, 200, 66, 0.1);
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

  /* Animations */
  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Mobile responsiveness */
  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }

    .spectrum-card {
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .custom-card-form {
      flex-direction: column;
    }

    .custom-card-form .input-field {
      width: 100%;
    }

    .arrow-divider {
      display: none;
    }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
</style>
