<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { tick } from 'svelte';
  import { socket } from '$lib/ws';
  import {
    gameState, playerId, chatMessages, error, connected, votesIn, votedPlayerIds,
    isHost, myTurn, currentTurnPlayer, isSpectator,
    initSocketListeners, resetStores
  } from '$lib/stores';
  import { isLoggedIn, currentUser } from '$lib/auth';
  import type { GameMode, Player } from '$lib/types';
  import { fireWinConfetti, fireImpostorVfx } from '$lib/vfx';
  import NameFrame from '$lib/components/NameFrame.svelte';

  const code = $page.params.code!;

  // Helper: resolve cosmetic props from a player ID
  function lookupCosmetics(id: string | undefined, players: Player[]) {
    if (!id) return { frameSvg: null, emblemSvg: null, nameColour: null, titleBadgeId: null };
    const p = players.find(x => x.id === id);
    return p
      ? { frameSvg: p.frameSvg ?? null, emblemSvg: p.emblemSvg ?? null, nameColour: p.nameColour ?? null, titleBadgeId: p.titleBadgeId ?? null }
      : { frameSvg: null, emblemSvg: null, nameColour: null, titleBadgeId: null };
  }

  // Table felt (ADR-4: all phases)
  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');

  let hintInput = $state('');
  let chatInput = $state('');
  let chatContainer: HTMLElement;
  let hintBubblesContainer: HTMLElement;
  let showChat = $state(false);
  let unreadChat = $state(0);

  // Category list (fetched once)
  let categories: string[] = $state([]);

  // Onboarding tips (dismissed tips persist in localStorage)
  let dismissedTips: Set<string> = $state(new Set());

  $effect(() => {
    try {
      const stored = localStorage.getItem('impostor-dismissed-tips');
      if (stored) dismissedTips = new Set(JSON.parse(stored));
    } catch {}
  });

  function dismissTip(tipId: string) {
    dismissedTips = new Set([...dismissedTips, tipId]);
    localStorage.setItem('impostor-dismissed-tips', JSON.stringify([...dismissedTips]));
  }

  function showTip(tipId: string): boolean {
    return !dismissedTips.has(tipId);
  }

  let reconnecting = $state(false);

  // Setup socket listeners and handle reconnection on page refresh
  $effect(() => {
    const unsub = initSocketListeners();
    fetch('/api/categories')
      .then(r => r.json())
      .then((data) => { categories = data as string[]; })
      .catch(() => {});

    // If no game state (page refresh), try to reconnect
    if (!$gameState && !socket.connected) {
      reconnecting = true;
      socket.connect(code, !$isLoggedIn)
        .then(() => {
          socket.joinRoom(code);
          // Give the server a moment to respond with state
          setTimeout(() => { reconnecting = false; }, 3000);
        })
        .catch(() => {
          goto('/impostor');
        });
    }

    return () => unsub();
  });

  // Clear reconnecting flag once we have state
  $effect(() => {
    if ($gameState) reconnecting = false;
  });

  // Redirect only after reconnection attempt has settled and still no state
  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/impostor');
    }
  });

  // Track unread chat messages when chat is closed
  let prevChatLen = 0;
  $effect(() => {
    const len = $chatMessages.length;
    if (len > prevChatLen && !showChat) {
      unreadChat += len - prevChatLen;
    }
    prevChatLen = len;
  });

  // Clear unread when chat opens
  $effect(() => {
    if (showChat) unreadChat = 0;
  });

  // Auto-scroll chat
  $effect(() => {
    if ($chatMessages.length && chatContainer) {
      tick().then(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }
  });

  // Auto-scroll to latest hint when new hints arrive
  $effect(() => {
    const hints = $gameState?.hints;
    const allHints = $gameState?.allHints;
    if ((hints?.length || allHints?.length) && hintBubblesContainer) {
      tick().then(() => {
        const lastBubble = hintBubblesContainer.querySelector('.hint-bubble:last-child');
        if (lastBubble) {
          lastBubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });
    }
  });

  // VFX on game over
  let vfxFired = $state(false);
  $effect(() => {
    if ($gameState?.phase === 'game_over' && !vfxFired) {
      vfxFired = true;
      if ($gameState.roundResult?.impostorCaught) {
        fireWinConfetti();
      } else {
        fireImpostorVfx();
      }
    }
    if ($gameState?.phase !== 'game_over') vfxFired = false;
  });

  function sendHint() {
    if (!hintInput.trim()) return;
    socket.send({ type: 'give_hint', text: hintInput.trim() });
    hintInput = '';
  }

  function markDone() {
    socket.send({ type: 'mark_done' });
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    socket.send({ type: 'chat', text: chatInput.trim() });
    chatInput = '';
  }

  let votedForName = $state('');
  let votedForCosmetics = $state<{ frameSvg: string | null; emblemSvg: string | null; nameColour: string | null }>({ frameSvg: null, emblemSvg: null, nameColour: null });

  function vote(targetId: string, targetName: string) {
    socket.send({ type: 'vote', targetId });
    const targetPlayer = $gameState?.players.find(p => p.id === targetId);
    votedForCosmetics = {
      frameSvg: targetPlayer?.frameSvg ?? null,
      emblemSvg: targetPlayer?.emblemSvg ?? null,
      nameColour: targetPlayer?.nameColour ?? null,
    };
    votedForName = targetName;
  }

  function selectCategory(cat: string) {
    socket.send({ type: 'select_category', category: cat });
  }

  function selectMode(mode: GameMode) {
    socket.send({ type: 'select_mode', mode });
  }

  function startGame() {
    socket.send({ type: 'start_game' });
  }

  function startVoting() {
    socket.send({ type: 'start_voting' });
  }

  function nextHintRound() {
    socket.send({ type: 'next_hint_round' });
  }

  function playAgain() {
    socket.send({ type: 'play_again' });
  }

  function endGame() {
    socket.send({ type: 'end_game' });
  }

  function leaveGame() {
    socket.send({ type: 'leave_game' });
    socket.disconnect();
    resetStores();
    goto('/impostor');
  }

  function handleChatKey(e: KeyboardEvent) {
    if (e.key === 'Enter') sendChat();
  }

  function handleHintKey(e: KeyboardEvent) {
    if (e.key === 'Enter') sendHint();
  }

  function handleGlobalKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && showChat) {
      showChat = false;
    }
  }

  // Accessibility: announce phase changes and manage focus
  let liveAnnouncement = $state('');
  let gameMainEl: HTMLElement;
  let prevPhase = '';

  $effect(() => {
    const phase = $gameState?.phase;
    if (!phase || phase === prevPhase) return;
    prevPhase = phase;

    const announcements: Record<string, string> = {
      lobby: 'Lobby. Waiting for players to join.',
      hints: $gameState?.role === 'impostor'
        ? 'Hints phase. You are the impostor. Your hint is ' + ($gameState?.impostorHint || '') + '.'
        : 'Hints phase. The secret word is ' + ($gameState?.word || '') + '.',
      discussion: 'Discussion phase. Discuss who you think is the impostor.',
      voting: 'Voting phase. Choose who you think is the impostor.',
      reveal: $gameState?.roundResult?.impostorCaught
        ? 'The impostor was caught!'
        : 'The impostor escaped!',
      game_over: 'Game over.',
    };

    liveAnnouncement = announcements[phase] || '';

    // Move focus to main game area on phase change
    tick().then(() => {
      if (gameMainEl) gameMainEl.focus();
    });
  });

  // Announce turn changes
  $effect(() => {
    if ($myTurn) {
      liveAnnouncement = "It's your turn to give a hint.";
    } else if ($currentTurnPlayer) {
      liveAnnouncement = `Waiting for ${$currentTurnPlayer.name} to give a hint.`;
    }
  });
</script>

{#if $error}
  <div class="error-toast">{$error}</div>
{/if}

<svelte:window onkeydown={handleGlobalKey} />

<!-- Screen reader announcements -->
<div class="sr-only" aria-live="polite" aria-atomic="true" role="status">
  {liveAnnouncement}
</div>

<div class="game-page" style={tableFeltStyle}>
  <!-- Header -->
  <header class="game-header">
    <div class="header-left">
      <button class="btn-secondary btn-small" onclick={leaveGame}>Leave</button>
      <span class="connection-dot" class:online={$connected} class:offline={!$connected}></span>
    </div>
    {#if $gameState?.phase !== 'lobby' && $gameState?.hintRound}
      <div class="round-badge">
        Round {$gameState.hintRound}
      </div>
    {/if}
    <button
      class="btn-secondary btn-small chat-toggle"
      onclick={() => showChat = !showChat}
      aria-label={showChat ? 'Hide chat' : `Open chat${unreadChat > 0 ? `, ${unreadChat} unread messages` : ''}`}
    >
      {showChat ? 'Hide' : 'Chat'}
      {#if unreadChat > 0 && !showChat}
        <span class="chat-badge" aria-hidden="true">{unreadChat > 9 ? '9+' : unreadChat}</span>
      {/if}
    </button>
  </header>

  {#if $isSpectator && $gameState && $gameState.phase !== 'lobby'}
    <div class="spectator-banner">Spectating</div>
  {/if}

  <div class="game-body">
    <!-- Main content area -->
    <main class="game-main" bind:this={gameMainEl} tabindex="-1">
      {#if $gameState?.phase === 'lobby'}
        <!-- LOBBY -->
        <div class="phase-content fade-in">
          {#if showTip('lobby')}
            <div class="tip-banner fade-in">
              <p class="tip-text">Share the room code with friends so they can join. The host picks a category and starts the game once 3+ players are in.</p>
              <button class="tip-dismiss" onclick={() => dismissTip('lobby')}>Got it</button>
            </div>
          {/if}
          <h2>Waiting for players...</h2>

          <div class="player-list">
            {#each $gameState.players as player}
              <div class="player-chip" class:host={player.isHost} class:reconnecting={player.connectionStatus === 'reconnecting'} class:disconnected={player.connectionStatus === 'disconnected'} class:owner-name={player.name === 'nfras4'}>
                <NameFrame name={player.name} frameSvg={player.frameSvg ?? null} emblemSvg={player.emblemSvg ?? null} nameColour={player.nameColour ?? null} />
                {#if player.name === 'nfras4'}<span class="owner-crown" title="Site Owner">&#x1F451;</span>{/if}
                {#if player.isHost}<span class="host-badge">HOST</span>{/if}
                {#if player.connectionStatus === 'reconnecting'}
                  <span class="status-badge reconnecting-badge">Reconnecting...</span>
                {:else if player.connectionStatus === 'disconnected'}
                  <span class="status-badge disconnected-badge">Disconnected</span>
                {/if}
              </div>
            {/each}
          </div>

          {#if $isHost}
            <div class="lobby-settings card">
              <h3>Game Settings</h3>

              <label>
                Category
                <select aria-label="Category" onchange={(e) => selectCategory(e.currentTarget.value)}>
                  <option value="">Random</option>
                  {#each categories as cat}
                    <option value={cat} selected={$gameState.category === cat}>{cat}</option>
                  {/each}
                </select>
              </label>

              <label>
                Mode
                <div class="mode-toggle">
                  <button
                    class:active={$gameState.mode === 'text'}
                    aria-pressed={$gameState.mode === 'text'}
                    onclick={() => selectMode('text')}
                  >
                    Text Chat
                  </button>
                  <button
                    class:active={$gameState.mode === 'voice'}
                    aria-pressed={$gameState.mode === 'voice'}
                    onclick={() => selectMode('voice')}
                  >
                    Voice / IRL
                  </button>
                </div>
              </label>

              <button
                class="btn-primary btn-full"
                onclick={startGame}
                disabled={$gameState.players.length < 3}
              >
                {$gameState.players.length < 3
                  ? `Need ${3 - $gameState.players.length} more player(s)`
                  : 'Start Game'}
              </button>
            </div>
          {:else}
            <p class="waiting-text">Waiting for the host to start<span class="loading-dots"></span></p>

            {#if $gameState.category}
              <p class="setting-display">Category: <strong>{$gameState.category}</strong></p>
            {/if}
            <p class="setting-display">Mode: <strong>{$gameState.mode === 'text' ? 'Text Chat' : 'Voice / IRL'}</strong></p>
            <p class="setting-display">Hint Rounds: <strong>2 standard (+ 1 optional)</strong></p>
          {/if}
        </div>

      {:else if $gameState?.phase === 'hints'}
        <!-- HINTS PHASE -->
        <div class="phase-content phase-enter">
          {#if showTip('hints')}
            <div class="tip-banner fade-in">
              <p class="tip-text">Give a clue that proves you know the word, but keep it vague so the impostor can't figure it out. The impostor should try to blend in using their hint.</p>
              <button class="tip-dismiss" onclick={() => dismissTip('hints')}>Got it</button>
            </div>
          {/if}
          <!-- Role card -->
          <div class="role-card role-reveal" class:impostor={$gameState.role === 'impostor'}>
            {#if $gameState.role === 'impostor'}
              <div class="role-label">You are the IMPOSTOR</div>
              <div class="role-detail">
                Your hint: <strong>{$gameState.impostorHint}</strong>
              </div>
              <div class="role-tip">Blend in! Don't reveal you don't know the word.</div>
            {:else}
              <div class="role-label">You know the word</div>
              <div class="role-detail">
                The word is: <strong>{$gameState.word}</strong>
              </div>
              <div class="role-tip">Be vague enough that the impostor can't guess it!</div>
            {/if}
          </div>

          <!-- Round indicator -->
          <div class="round-indicator">
            Hint Round {$gameState.hintRound} of {$gameState.totalHintRounds}{$gameState.canExtraRound ? '+' : ''}
          </div>

          <!-- Turn indicator -->
          <div class="turn-indicator">
            {#if $myTurn}
              <div class="your-turn">It's YOUR turn!</div>
            {:else if $currentTurnPlayer}
              <div class="other-turn">Waiting for <strong>{$currentTurnPlayer.name}</strong>...</div>
            {/if}
          </div>

          <!-- Hints as chat bubbles -->
          <div class="hint-bubbles" bind:this={hintBubblesContainer}>
            {#if $gameState.allHints.length > 0}
              {#each $gameState.allHints as roundHints, i}
                {#if roundHints.length > 0}
                  <div class="hints-round-divider">Round {i + 1}</div>
                  {#each roundHints as hint}
                    {@const c = lookupCosmetics(hint.playerId, $gameState.players)}
                    <div class="hint-bubble previous" class:mine={hint.playerId === $playerId}>
                      <span class="bubble-name"><NameFrame name={hint.playerName} frameSvg={c.frameSvg} emblemSvg={c.emblemSvg} nameColour={c.nameColour} /></span>
                      <div class="bubble-body">{hint.text}</div>
                    </div>
                  {/each}
                {/if}
              {/each}
            {/if}

            {#if $gameState.hints.length > 0}
              {#if $gameState.allHints.length > 0 && $gameState.allHints.some(r => r.length > 0)}
                <div class="hints-round-divider">Round {$gameState.hintRound}</div>
              {/if}
              {#each $gameState.hints as hint}
                {@const c = lookupCosmetics(hint.playerId, $gameState.players)}
                <div class="hint-bubble fade-in" class:mine={hint.playerId === $playerId}>
                  <span class="bubble-name"><NameFrame name={hint.playerName} frameSvg={c.frameSvg} emblemSvg={c.emblemSvg} nameColour={c.nameColour} /></span>
                  <div class="bubble-body">{hint.text}</div>
                </div>
              {/each}
            {/if}
          </div>

          <!-- Hint input (text mode) or done button (voice mode) -->
          {#if $myTurn}
            {#if $gameState.mode === 'text'}
              <div class="hint-input">
                <input
                  aria-label="Your hint"
                  value={hintInput} oninput={(e) => hintInput = e.currentTarget.value}
                  placeholder="Type your hint..."
                  maxlength="200"
                  autofocus
                  onkeydown={handleHintKey}
                />
                <button class="btn-primary" onclick={sendHint} disabled={!hintInput.trim()}>
                  Send
                </button>
              </div>
            {:else}
              <button class="btn-primary btn-full" onclick={markDone}>
                I've given my hint (voice)
              </button>
            {/if}
          {/if}
        </div>

      {:else if $gameState?.phase === 'discussion'}
        <!-- DISCUSSION PHASE -->
        <div class="phase-content phase-enter">
          {#if showTip('discussion')}
            <div class="tip-banner fade-in">
              <p class="tip-text">Review the hints above and discuss who might be the impostor. The host decides when to move to voting or run another hint round.</p>
              <button class="tip-dismiss" onclick={() => dismissTip('discussion')}>Got it</button>
            </div>
          {/if}
          <h2>Discussion Time</h2>
          <p class="phase-desc">
            {$gameState.mode === 'text'
              ? 'Discuss in the chat — who do you think is the impostor?'
              : 'Discuss over voice — who is the impostor?'}
          </p>

          <!-- Show all hints as chat bubbles -->
          <div class="hint-bubbles">
            {#each $gameState.allHints as roundHints, i}
              {#if roundHints.length > 0}
                <div class="hints-round-divider">Round {i + 1}</div>
                {#each roundHints as hint}
                  {@const c = lookupCosmetics(hint.playerId, $gameState.players)}
                  <div class="hint-bubble" class:mine={hint.playerId === $playerId}>
                    <span class="bubble-name"><NameFrame name={hint.playerName} frameSvg={c.frameSvg} emblemSvg={c.emblemSvg} nameColour={c.nameColour} /></span>
                    <div class="bubble-body">{hint.text}</div>
                  </div>
                {/each}
              {/if}
            {/each}
            {#if $gameState.hints.length > 0}
              <div class="hints-round-divider">Round {$gameState.hintRound}</div>
              {#each $gameState.hints as hint}
                {@const c = lookupCosmetics(hint.playerId, $gameState.players)}
                <div class="hint-bubble" class:mine={hint.playerId === $playerId}>
                  <span class="bubble-name"><NameFrame name={hint.playerName} frameSvg={c.frameSvg} emblemSvg={c.emblemSvg} nameColour={c.nameColour} /></span>
                  <div class="bubble-body">{hint.text}</div>
                </div>
              {/each}
            {/if}
          </div>

          {#if $isHost}
            <div class="discussion-actions">
              {#if $gameState.hintRound < $gameState.totalHintRounds}
                <button class="btn-primary btn-full" onclick={nextHintRound}>
                  Next Hint Round ({$gameState.hintRound + 1} of {$gameState.totalHintRounds})
                </button>
              {:else}
                <button class="btn-primary btn-full" onclick={startVoting}>
                  Start Voting
                </button>
                {#if $gameState.canExtraRound}
                  <button class="btn-secondary btn-full" onclick={nextHintRound}>
                    One More Hint Round
                  </button>
                {/if}
              {/if}
            </div>
          {:else}
            <p class="waiting-text">Waiting for host<span class="loading-dots"></span></p>
          {/if}
        </div>

      {:else if $gameState?.phase === 'voting'}
        <!-- VOTING PHASE -->
        <div class="phase-content phase-enter">
          {#if showTip('voting')}
            <div class="tip-banner fade-in">
              <p class="tip-text">Tap the name of the player you think is the impostor. Your vote is final once cast. If the group votes correctly, the impostor is caught!</p>
              <button class="tip-dismiss" onclick={() => dismissTip('voting')}>Got it</button>
            </div>
          {/if}
          <div class="phase-header-card">
            <span class="phase-icon">&#9878;</span>
            <h2>Vote!</h2>
            <p class="phase-desc">Who do you think is the impostor?</p>
          </div>

          {#if !$gameState.hasVoted}
            <div class="vote-list" role="group" aria-label="Vote for a player">
              {#each $gameState.players.filter(p => p.id !== $playerId) as player, i}
                <button
                  class="vote-option stagger-item"
                  style="animation-delay: {i * 0.06}s"
                  onclick={() => vote(player.id, player.name)}
                  aria-label="Vote for {player.name}"
                >
                  <span class="vote-avatar">{player.name.charAt(0).toUpperCase()}</span>
                  <span class="vote-name"><NameFrame name={player.name} frameSvg={player.frameSvg ?? null} emblemSvg={player.emblemSvg ?? null} nameColour={player.nameColour ?? null} /></span>
                </button>
              {/each}
            </div>
            <p class="vote-instruction">Tap a name to lock in your vote</p>
          {:else}
            <div class="voted-confirmation fade-in">
              <div class="vote-check">&#10003;</div>
              <p>Voted for <NameFrame name={votedForName} frameSvg={votedForCosmetics.frameSvg} emblemSvg={votedForCosmetics.emblemSvg} nameColour={votedForCosmetics.nameColour} /></p>
              <div class="vote-progress">
                <div class="vote-progress-bar">
                  <div
                    class="vote-progress-fill"
                    style="width: {$gameState.players.length > 0 ? ($votesIn / $gameState.players.length) * 100 : 0}%"
                  ></div>
                </div>
                <p class="vote-progress-text">{$votesIn} of {$gameState.players.length} voted</p>
              </div>
              <div class="who-voted">
                <div class="who-voted-title">WHO'S VOTED</div>
                {#each $gameState.players as p}
                  {@const hasVoted = $votedPlayerIds.includes(p.id)}
                  <div class="who-voted-row" class:voted={hasVoted}>
                    <span class="who-voted-box" aria-hidden="true">{hasVoted ? '☑' : '☐'}</span>
                    <span class="who-voted-name"><NameFrame name={p.name} frameSvg={p.frameSvg ?? null} emblemSvg={p.emblemSvg ?? null} nameColour={p.nameColour ?? null} /></span>
                    {#if !hasVoted}<span class="who-voted-waiting">waiting...</span>{/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      {:else if $gameState?.phase === 'reveal'}
        <!-- REVEAL -->
        <div class="phase-content phase-enter">
          {#if $gameState.roundResult}
            {@const result = $gameState.roundResult}
            {@const iC = lookupCosmetics(result.impostorId, $gameState.players)}

            <!-- Celebration particles -->
            <div class="particles" aria-hidden="true">
              {#each Array(12) as _, i}
                <span
                  class="particle"
                  class:particle-green={result.impostorCaught}
                  class:particle-red={!result.impostorCaught}
                  style="--i: {i}; --x: {Math.random() * 200 - 100}px; --y: {Math.random() * -200 - 50}px; --r: {Math.random() * 360}deg; --delay: {Math.random() * 0.3}s; --size: {4 + Math.random() * 6}px"
                ></span>
              {/each}
            </div>

            <div class="reveal-card reveal-entrance" class:caught={result.impostorCaught} class:escaped={!result.impostorCaught}>
              <div class="reveal-headline">
                <span class="reveal-icon">{result.impostorCaught ? '✓' : '✗'}</span>
                <h2>{result.impostorCaught ? 'Impostor Caught!' : 'Impostor Escaped!'}</h2>
              </div>

              <div class="reveal-details">
                <div class="reveal-detail-card">
                  <span class="reveal-detail-label">Impostor</span>
                  <span class="reveal-detail-value impostor-name"><NameFrame name={result.impostorName} frameSvg={iC.frameSvg} emblemSvg={iC.emblemSvg} nameColour={iC.nameColour} /></span>
                </div>
                <div class="reveal-detail-card">
                  <span class="reveal-detail-label">Secret Word</span>
                  <span class="reveal-detail-value word-value">{result.word}</span>
                </div>
                <div class="reveal-detail-card">
                  <span class="reveal-detail-label">Impostor's Hint</span>
                  <span class="reveal-detail-value hint-value">{result.impostorHint}</span>
                </div>
              </div>

              <div class="vote-breakdown">
                <h3>Vote Breakdown</h3>
                {#each result.votes as v, i}
                  {@const vC = lookupCosmetics(v.voterId, $gameState.players)}
                  {@const tC = lookupCosmetics(v.targetId, $gameState.players)}
                  <div class="vote-row stagger-item" style="animation-delay: {i * 0.05}s" class:correct-vote={v.targetId === result.impostorId}>
                    <span class="voter-name"><NameFrame name={v.voterName} frameSvg={vC.frameSvg} emblemSvg={vC.emblemSvg} nameColour={vC.nameColour} /></span>
                    <span class="vote-arrow">&#8594;</span>
                    <strong class:correct={v.targetId === result.impostorId}><NameFrame name={v.targetName} frameSvg={tC.frameSvg} emblemSvg={tC.emblemSvg} nameColour={tC.nameColour} /></strong>
                  </div>
                {/each}
              </div>
            </div>

            {#if $isHost}
              <div class="reveal-actions">
                <button class="btn-primary btn-full" onclick={playAgain}>
                  Play Again
                </button>
                <button class="btn-secondary btn-full" onclick={endGame}>
                  End Game
                </button>
              </div>
            {:else}
              <div class="reveal-actions">
                <p class="waiting-text">Waiting for host to restart<span class="loading-dots"></span></p>
                <button class="btn-secondary btn-full" onclick={leaveGame}>
                  Leave
                </button>
              </div>
            {/if}
          {/if}
        </div>

      {:else if $gameState?.phase === 'game_over'}
        <!-- GAME OVER / POST-GAME SCREEN -->
        <div class="phase-content phase-enter">
          <h2 class="postgame-title">Game Over</h2>

          {#if $gameState.roundResult}
            {@const result = $gameState.roundResult}
            {@const iC = lookupCosmetics(result.impostorId, $gameState.players)}

            <div class="reveal-card postgame-card" class:caught={result.impostorCaught} class:escaped={!result.impostorCaught}>
              <div class="reveal-headline">
                <span class="reveal-icon">{result.impostorCaught ? '✓' : '✗'}</span>
                {#if result.impostorCaught}
                  <h3>Impostor Caught!</h3>
                {:else}
                  <h3 class="impostor-wins-text">Impostor Wins!</h3>
                {/if}
              </div>

              <div class="reveal-details">
                <div class="reveal-detail-card">
                  <span class="reveal-detail-label">Impostor</span>
                  <span class="reveal-detail-value impostor-name"><NameFrame name={result.impostorName} frameSvg={iC.frameSvg} emblemSvg={iC.emblemSvg} nameColour={iC.nameColour} /></span>
                </div>
                <div class="reveal-detail-card">
                  <span class="reveal-detail-label">Secret Word</span>
                  <span class="reveal-detail-value word-value">{result.word}</span>
                </div>
              </div>

              <!-- Final player list with status -->
              <div class="postgame-players">
                <h4 class="postgame-section-title">Players</h4>
                {#each $gameState.players as player}
                  <div class="postgame-player-row">
                    <span class="postgame-player-name" class:impostor-highlight={player.id === result.impostorId}>
                      <NameFrame name={player.name} frameSvg={player.frameSvg ?? null} emblemSvg={player.emblemSvg ?? null} nameColour={player.nameColour ?? null} />
                      {#if player.id === result.impostorId}
                        <span class="impostor-tag">Impostor</span>
                      {/if}
                    </span>
                    <span class="postgame-player-status">
                      {#if player.connectionStatus === 'disconnected'}
                        <span class="disconnected-badge">Left</span>
                      {:else if player.connectionStatus === 'reconnecting'}
                        <span class="reconnecting-badge">Away</span>
                      {/if}
                    </span>
                  </div>
                {/each}
              </div>

              <div class="vote-breakdown">
                <h4 class="postgame-section-title">Votes</h4>
                {#each result.votes as v}
                  {@const vC = lookupCosmetics(v.voterId, $gameState.players)}
                  {@const tC = lookupCosmetics(v.targetId, $gameState.players)}
                  <div class="vote-row" class:correct-vote={v.targetId === result.impostorId}>
                    <span class="voter-name"><NameFrame name={v.voterName} frameSvg={vC.frameSvg} emblemSvg={vC.emblemSvg} nameColour={vC.nameColour} /></span>
                    <span class="vote-arrow">&#8594;</span>
                    <strong class:correct={v.targetId === result.impostorId}><NameFrame name={v.targetName} frameSvg={tC.frameSvg} emblemSvg={tC.emblemSvg} nameColour={tC.nameColour} /></strong>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <div class="postgame-actions">
            {#if $isHost}
              <button class="btn-primary btn-full" onclick={playAgain}>
                Play Again
              </button>
            {:else}
              <p class="waiting-text">Waiting for host to restart<span class="loading-dots"></span></p>
            {/if}
            <button class="btn-secondary btn-full" onclick={leaveGame}>
              Leave
            </button>
          </div>
        </div>
      {/if}
    </main>

    <!-- Chat sidebar / overlay -->
    {#if showChat}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="chat-backdrop" onclick={() => showChat = false} onkeydown={(e) => { if (e.key === 'Escape') showChat = false; }}></div>
      <aside class="chat-panel slide-up">
        <div class="chat-drag-handle" onclick={() => showChat = false}>
          <div class="drag-bar"></div>
        </div>
        <div class="chat-messages nameframe-compact" bind:this={chatContainer}>
          {#each $chatMessages as msg}
            {@const cC = lookupCosmetics(msg.playerId, $gameState?.players ?? [])}
            <div class="chat-msg">
              <strong><NameFrame name={msg.name} frameSvg={null} emblemSvg={null} nameColour={cC.nameColour} /></strong>
              <span>{msg.text}</span>
            </div>
          {/each}
          {#if $chatMessages.length === 0}
            <p class="chat-empty">No messages yet</p>
          {/if}
        </div>
        <div class="chat-input-row">
          <input
            aria-label="Chat message"
            value={chatInput} oninput={(e) => chatInput = e.currentTarget.value}
            placeholder="Type a message..."
            onkeydown={handleChatKey}
          />
          <button class="btn-primary btn-small" onclick={sendChat} disabled={!chatInput.trim()}>
            Send
          </button>
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  :root {
    --on-accent-dark: #000;
    --on-accent-light: #fff;
    --accused-red: #ff0033;
    --accused-red-glow-30: rgba(255, 0, 51, 0.3);
    --accused-red-glow-60: rgba(255, 0, 51, 0.6);
    --green-chip-05: rgba(61, 214, 140, 0.05);
    --scrim-40: rgba(0, 0, 0, 0.4);
    --bottom-shadow-15: rgba(0, 0, 0, 0.15);
  }

  .game-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding-top: 4.5rem;
    background-color: var(--table-felt-bg, transparent);
  }

  /* ─── Header ─────────────────────────────────────────── */

  .game-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: linear-gradient(180deg, var(--bg-card), var(--bg));
    border-bottom: 1px solid var(--accent-border);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .round-badge {
    background: var(--bg-input);
    clip-path: var(--clip-btn);
    padding: 0.25rem 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--yellow);
  }

  .chat-toggle {
    margin-left: auto;
    position: relative;
  }

  /* ─── Layout ─────────────────────────────────────────── */

  .game-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .game-main {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .phase-content {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .phase-content h2 {
    text-align: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .phase-desc {
    text-align: center;
    color: var(--text-muted);
  }

  /* ─── Player chips ────────────────────────────────────── */

  .player-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .player-chip {
    background: var(--bg-input);
    clip-path: var(--clip-btn);
    box-shadow: inset 0 0 0 1px var(--border);
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .player-chip.host {
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }

  .host-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    background: var(--yellow);
    color: var(--on-accent-dark);
    padding: 0.1rem 0.4rem;
    clip-path: var(--clip-btn);
  }

  .owner-crown { font-size: 0.85rem; margin-left: -0.25rem; }

  .player-chip.reconnecting {
    opacity: 0.6;
  }

  .player-chip.disconnected {
    opacity: 0.35;
  }

  .status-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 0.1rem 0.4rem;
    clip-path: var(--clip-btn);
  }

  .reconnecting-badge {
    background: var(--yellow, #f1c40f);
    color: var(--on-accent-dark);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .disconnected-badge {
    background: var(--red, #e74c3c);
    color: var(--on-accent-light);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* ─── Lobby settings ─────────────────────────────────── */

  .lobby-settings {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .lobby-settings label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .mode-toggle {
    display: flex;
    gap: 0.25rem;
    background: var(--bg-input);
    border-radius: var(--radius-sm);
    padding: 0.25rem;
  }

  .mode-toggle button {
    flex: 1;
    padding: 0.5rem;
    min-height: 44px;
    font-size: 0.8rem;
    background: transparent;
    color: var(--text-muted);
    clip-path: none;
    border-radius: var(--radius-sm);
    letter-spacing: 0.05em;
  }

  .mode-toggle button.active {
    background: var(--accent);
    color: var(--btn-primary-text);
  }

  .waiting-text {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }

  /* ─── Accessibility ───────────────────────────────────── */

  .game-main:focus {
    outline: none;
  }

  :global(.sr-only) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* ─── Onboarding tips ─────────────────────────────────── */

  .tip-banner {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 4px;
    padding: 0.75rem 1rem;
  }

  .tip-text {
    flex: 1;
    font-size: 0.825rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .tip-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    clip-path: none;
    color: var(--accent);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .tip-dismiss:hover {
    opacity: 1;
  }

  /* ─── Loading dots ───────────────────────────────────── */

  .loading-dots::after {
    content: '';
    animation: dots 1.4s steps(4, end) infinite;
  }

  @keyframes dots {
    0%  { content: ''; }
    25% { content: '.'; }
    50% { content: '..'; }
    75% { content: '...'; }
  }

  /* ─── Connection indicator ──────────────────────────── */

  .connection-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 0.35rem;
    vertical-align: middle;
    transition: background 0.3s ease;
  }

  .connection-dot.online {
    background: var(--green);
    box-shadow: 0 0 4px var(--green);
  }

  .connection-dot.offline {
    background: var(--red);
    box-shadow: 0 0 4px var(--red);
    animation: pulse 1s ease-in-out infinite;
  }

  /* ─── Vote progress ─────────────────────────────────── */

  .vote-progress {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    max-width: 240px;
    margin-left: auto;
    margin-right: auto;
  }

  .vote-progress-bar {
    width: 100%;
    height: 6px;
    background: var(--bg-input);
    border-radius: 3px;
    overflow: hidden;
  }

  .vote-progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .vote-progress-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .setting-display {
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  /* ─── Role card ──────────────────────────────────────── */

  .role-card {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    box-shadow: inset 0 0 0 2px var(--green);
    padding: 1.25rem;
    text-align: center;
    position: relative;
  }

  .role-card.impostor {
    background: var(--bg-card);
    box-shadow: inset 0 0 0 2px var(--red);
  }

  .role-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: var(--green);
    margin-bottom: 0.5rem;
  }

  .impostor .role-label {
    color: var(--red);
  }

  .role-detail {
    font-size: 1.3rem;
    margin: 0.5rem 0;
  }

  .role-detail strong {
    color: var(--yellow);
    font-size: 1.5rem;
  }

  .role-tip {
    font-size: 0.85rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* ─── Turn indicator ─────────────────────────────────── */

  .turn-indicator {
    text-align: center;
    padding: 0.5rem;
  }

  .your-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--yellow);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .other-turn {
    color: var(--text-muted);
  }

  /* ─── Hint bubbles ───────────────────────────────────── */

  .hint-bubbles {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
  }

  .hint-bubble {
    display: flex;
    flex-direction: column;
    max-width: 80%;
    align-self: flex-start;
  }

  .hint-bubble.mine {
    align-self: flex-end;
  }

  .bubble-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--blue);
    margin-bottom: 0.15rem;
    padding: 0 0.5rem;
  }

  .hint-bubble.mine .bubble-name {
    text-align: right;
    color: var(--accent);
  }

  .bubble-body {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 0.75rem 0.75rem 0.75rem 0.25rem;
    padding: 0.6rem 1rem;
    font-size: 0.95rem;
    color: var(--text);
    line-height: 1.4;
  }

  .hint-bubble.mine .bubble-body {
    background: var(--accent-faint);
    border-color: var(--accent-border);
    border-radius: 0.75rem 0.75rem 0.25rem 0.75rem;
  }

  .hint-bubble.previous .bubble-body {
    opacity: 0.65;
  }

  .hints-round-divider {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    text-align: center;
    padding: 0.5rem 0;
    position: relative;
  }

  .hints-round-divider::before,
  .hints-round-divider::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 30%;
    height: 1px;
    background: var(--border);
  }

  .hints-round-divider::before { left: 0; }
  .hints-round-divider::after { right: 0; }

  .round-indicator {
    text-align: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--yellow);
    padding: 0.25rem 0;
  }

  /* ─── Chat badge ─────────────────────────────────────── */

  .chat-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: var(--accent);
    color: var(--btn-primary-text);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    line-height: 1;
    animation: badge-pop 0.3s ease;
  }

  @keyframes badge-pop {
    0% { transform: scale(0); }
    70% { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  /* ─── Discussion actions ─────────────────────────────── */

  .discussion-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .voted-confirmation {
    text-align: center;
    padding: 2rem;
  }

  .vote-check {
    font-size: 3rem;
    color: var(--green);
    margin-bottom: 0.5rem;
  }

  .voted-confirmation p {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .vote-waiting {
    font-size: 0.9rem !important;
    font-weight: 400 !important;
    color: var(--text-muted);
    margin-top: 0.5rem;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .hint-input {
    display: flex;
    gap: 0.5rem;
  }

  .hint-input input {
    flex: 1;
  }

  /* ─── Phase header card ──────────────────────────────── */

  .phase-header-card {
    text-align: center;
    padding: 1.25rem;
    background: var(--bg-card);
    clip-path: var(--clip-card);
    position: relative;
  }

  .phase-header-card::before {
    content: '';
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
  }

  .phase-header-card h2 {
    margin: 0;
  }

  .phase-header-card .phase-desc {
    margin-top: 0.25rem;
  }

  .phase-icon {
    font-size: 1.5rem;
    display: block;
    margin-bottom: 0.25rem;
    opacity: 0.6;
  }

  /* ─── Voting ─────────────────────────────────────────── */

  .vote-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .vote-option {
    background: var(--bg-card);
    clip-path: var(--clip-btn);
    box-shadow: inset 0 0 0 1px var(--border-bright);
    color: var(--text);
    padding: 1rem 1.25rem;
    text-align: left;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    transition: box-shadow 0.15s ease, background 0.15s ease;
    display: flex;
    align-items: center;
    gap: 0.875rem;
  }

  .vote-avatar {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--accent);
  }

  .vote-name {
    flex: 1;
  }

  .vote-option:hover {
    box-shadow: inset 0 0 0 1px var(--accent-border);
    background: var(--accent-faint);
    color: var(--accent);
  }

  .vote-option:hover .vote-avatar {
    background: var(--accent);
    color: var(--btn-primary-text);
    border-color: var(--accent);
  }

  .vote-option:active {
    opacity: 0.75;
  }

  .vote-instruction {
    text-align: center;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* ─── Who's voted checklist ──────────────────────────── */

  .who-voted {
    margin-top: 1.25rem;
    width: 100%;
    max-width: 240px;
    margin-left: auto;
    margin-right: auto;
  }

  .who-voted-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
    text-align: center;
  }

  .who-voted-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0;
    border-bottom: 1px solid var(--border);
    opacity: 0.5;
    transition: opacity 0.25s ease;
  }

  .who-voted-row:last-child {
    border-bottom: none;
  }

  .who-voted-row.voted {
    opacity: 1;
  }

  .who-voted-box {
    font-size: 1rem;
    line-height: 1;
    color: var(--green);
    flex-shrink: 0;
    width: 1.1rem;
    text-align: center;
  }

  .who-voted-row:not(.voted) .who-voted-box {
    color: var(--text-subtle);
  }

  .who-voted-name {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .who-voted-waiting {
    font-size: 0.7rem;
    color: var(--text-subtle);
    font-style: italic;
    animation: pulse 1.5s ease-in-out infinite;
  }

  /* ─── Reveal card ────────────────────────────────────── */

  .reveal-card {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    padding: 1.5rem;
    text-align: center;
    position: relative;
  }

  .reveal-card::before {
    content: '';
    position: absolute;
    inset: -2px;
    clip-path: var(--clip-card);
    z-index: -1;
  }

  .reveal-card.caught::before {
    background: linear-gradient(135deg, var(--green), transparent 60%);
  }

  .reveal-card.escaped::before {
    background: linear-gradient(135deg, var(--red), transparent 60%);
  }

  .reveal-card.caught {
    box-shadow: inset 0 0 0 2px var(--green);
  }

  .reveal-card.escaped {
    box-shadow: inset 0 0 0 2px var(--red);
  }

  .reveal-headline {
    margin-bottom: 1rem;
  }

  .reveal-icon {
    font-size: 2.5rem;
    line-height: 1;
    display: block;
    margin-bottom: 0.25rem;
  }

  .reveal-card.caught .reveal-icon {
    color: var(--green);
  }

  .reveal-card.escaped .reveal-icon {
    color: var(--red);
  }

  .reveal-card.caught h2 {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--green);
  }

  .reveal-card.escaped h2 {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--red);
  }

  .impostor-wins-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--accused-red);
    text-shadow: 0 0 20px var(--accused-red-glow-60), 0 0 40px var(--accused-red-glow-30);
    animation: impostorReveal 0.6s ease-out both;
  }

  @keyframes impostorReveal {
    0% { transform: scale(0.3); opacity: 0; filter: blur(8px); }
    50% { transform: scale(1.15); opacity: 1; filter: blur(0); }
    70% { transform: scale(0.95); }
    100% { transform: scale(1); }
  }

  .reveal-details {
    margin: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .reveal-detail-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.875rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .reveal-detail-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .reveal-detail-value {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .impostor-name {
    color: var(--red);
  }

  .word-value {
    color: var(--yellow);
  }

  .hint-value {
    color: var(--text);
    font-style: italic;
  }

  .vote-breakdown {
    margin-top: 1.25rem;
    text-align: left;
  }

  .vote-breakdown h3 {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .vote-row {
    font-size: 0.9rem;
    color: var(--text-muted);
    padding: 0.4rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  .vote-row:last-child {
    border-bottom: none;
  }

  .voter-name {
    flex: 1;
  }

  .vote-arrow {
    color: var(--text-subtle);
    font-size: 0.8rem;
  }

  .vote-row .correct {
    color: var(--green);
  }

  .correct-vote {
    background: var(--green-chip-05);
    padding-left: 0.5rem;
    padding-right: 0.5rem;
    border-radius: 2px;
  }

  .reveal-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* ─── Chat panel ─────────────────────────────────────── */

  .chat-backdrop {
    display: none;
  }

  .chat-panel {
    width: min(300px, 30vw);
    min-width: 220px;
    border-left: 1px solid var(--accent-border);
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
  }

  .chat-drag-handle {
    display: none;
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    -webkit-overflow-scrolling: touch;
  }

  .chat-msg {
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .chat-msg strong {
    color: var(--accent);
    margin-right: 0.5rem;
  }

  .chat-empty {
    color: var(--text-muted);
    text-align: center;
    font-size: 0.85rem;
    padding: 2rem 0;
  }

  .chat-input-row {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .chat-input-row input {
    flex: 1;
    font-size: 1rem;
    padding: 0.6rem;
  }

  .btn-full {
    width: 100%;
  }

  /* ─── Animations ─────────────────────────────────────── */

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  @keyframes fadeBackdrop {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @keyframes phaseEnter {
    from { opacity: 0; transform: translateY(1.5rem) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes roleReveal {
    0%   { opacity: 0; transform: scale(0.8); }
    50%  { transform: scale(1.03); }
    100% { opacity: 1; transform: scale(1); }
  }

  @keyframes revealEntrance {
    0%   { opacity: 0; transform: scale(0.85) translateY(1rem); }
    60%  { transform: scale(1.02) translateY(-0.25rem); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes staggerIn {
    from { opacity: 0; transform: translateX(-0.75rem); }
    to   { opacity: 1; transform: translateX(0); }
  }

  @keyframes particleBurst {
    0%   { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1); }
    100% { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--r)) scale(0); }
  }

  .slide-up {
    animation: slideUp 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .phase-enter {
    animation: phaseEnter 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .role-reveal {
    animation: roleReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
  }

  .reveal-entrance {
    animation: revealEntrance 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .stagger-item {
    opacity: 0;
    animation: staggerIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  /* ─── Post-game screen ─────────────────────────────── */

  .postgame-title {
    text-align: center;
    margin-bottom: 0.5rem;
  }

  .postgame-card {
    margin-top: 0;
  }

  .postgame-players {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }

  .postgame-section-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .postgame-player-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.4rem 0;
    border-bottom: 1px solid var(--border);
  }

  .postgame-player-row:last-child {
    border-bottom: none;
  }

  .postgame-player-name {
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .impostor-highlight {
    color: var(--red, #e74c3c);
  }

  .impostor-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    background: var(--red, #e74c3c);
    color: var(--on-accent-light);
    padding: 0.1rem 0.4rem;
    clip-path: var(--clip-btn);
  }

  .postgame-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  /* ─── Particles ──────────────────────────────────────── */

  .particles {
    position: relative;
    height: 0;
    width: 100%;
    display: flex;
    justify-content: center;
    pointer-events: none;
    overflow: visible;
  }

  .particle {
    position: absolute;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    animation: particleBurst 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--delay) both;
  }

  .particle-green {
    background: var(--green);
  }

  .particle-red {
    background: var(--red);
  }

  /* ─── Mobile ─────────────────────────────────────────── */

  @media (max-width: 640px) {
    .chat-backdrop {
      display: block;
      position: fixed;
      inset: 0;
      background: var(--scrim-40);
      z-index: 49;
      animation: fadeBackdrop 0.2s ease;
    }

    .chat-panel {
      position: fixed;
      bottom: 0;
      right: 0;
      left: 0;
      height: 65dvh;
      width: 100%;
      z-index: 50;
      border-left: none;
      border-top: none;
      border-radius: 12px 12px 0 0;
      box-shadow: 0 -4px 20px var(--bottom-shadow-15);
    }

    .chat-drag-handle {
      display: flex;
      justify-content: center;
      padding: 0.6rem 0 0.25rem;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .drag-bar {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--text-subtle);
    }

    .chat-input-row {
      padding: 0.5rem;
      padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    }

    .chat-input-row input {
      font-size: 1rem;
    }

    /* Larger touch targets on mobile */
    .vote-option {
      padding: 1.15rem 1.25rem;
      font-size: 1.1rem;
    }

    .btn-small {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .game-header {
      padding: 0.5rem 0.625rem;
    }

    .round-badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
    }
  }

  @media (max-width: 360px) {
    .game-page {
      padding-left: 0.375rem;
      padding-right: 0.375rem;
    }
  }

  /* ─── Spectator banner ───────────────────────────────── */

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
