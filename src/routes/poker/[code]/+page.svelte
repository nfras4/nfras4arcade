<script lang="ts">
  // @ts-nocheck
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { dispatchRelayMessages } from '$lib/levelUpDispatch';
  import { writable } from 'svelte/store';
  import { isLoggedIn, userStats, currentUser } from '$lib/auth';
  import { fireWinConfetti } from '$lib/vfx';
  import { detectInputMode } from '$lib/utils/inputMode';
  import PairButton from '$lib/components/pairing/PairButton.svelte';
  import TableView from '$lib/components/poker/TableView.svelte';
  import ControllerView from '$lib/components/poker/ControllerView.svelte';
  import MobilePokerView from '$lib/components/poker/MobilePokerView.svelte';
  import { evaluateHandName } from '$lib/utils/pokerHelpers';

  const code = $page.params.code!;
  const roleParam = $page.url.searchParams.get('role');
  const initialRole = roleParam === 'controller' || roleParam === 'table' || roleParam === 'both' ? roleParam : undefined;
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

  // HoleCards integration: muck-target ref, armed-state mirror, input mode.
  let muckTargetRef = $state<HTMLElement | undefined>(undefined);
  let isArmed = $state(false);
  let inputMode = $state<'touch' | 'pointer'>('touch');
  // Phase 3 Bug 2: latch so we only swap to 'table' once when the phone pairs.
  let demotedToTable = $state(false);

  // Phase 4: viewport / input capability detection drives layout selection.
  let isMobile = $state(false);

  function detectMobile(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
    } catch {
      return false;
    }
  }

  $effect(() => {
    inputMode = detectInputMode();
  });

  $effect(() => {
    if (typeof window === 'undefined') return;
    isMobile = detectMobile();
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => { isMobile = detectMobile(); };
    const onResize = () => { isMobile = detectMobile(); };
    mq.addEventListener('change', onChange);
    window.addEventListener('resize', onResize);
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onResize);
    };
  });

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        // WHY: Phase 4 spectator bug - if state arrives null/undefined, do not
        // clobber existing gameState; re-issue join to request a fresh broadcast.
        if (msg.state) {
          gameState.set(msg.state);
          isSpectator = msg.isSpectator ?? false;
          reconnecting = false;
        } else {
          console.warn('[poker] joined arrived with no state, re-requesting');
          setTimeout(() => socket.joinRoom(code), 500);
        }
      } else if (msg.type === 'state_update') {
        if (msg.state) {
          gameState.set(msg.state);
          // First state_update for a spectator unblocks the loading gate too.
          reconnecting = false;
        }
        if (msg.isSpectator !== undefined) isSpectator = msg.isSpectator;
      } else if (msg.type === 'error') {
        error.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
      } else if (
        msg.type === 'paired_device_added' &&
        msg.role === 'controller' &&
        roleParam !== 'controller' &&
        !demotedToTable &&
        msg.playerId === $myPlayerId
      ) {
        // Phase 3 Bug 2: phone just paired as our controller; demote this
        // device to 'table' so the server's role-aware getStateFor strips
        // hole cards from subsequent state broadcasts.
        demotedToTable = true;
        socket.setRole('table').catch(() => { demotedToTable = false; });
      }
      dispatchRelayMessages(msg);
    });

    socket.connect(code, !$isLoggedIn, initialRole)
      .then(() => { socket.joinRoom(code); })
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

  // Spectator bet panel data
  let myUserId = $derived($currentUser?.id ?? null);
  let betPlayers = $derived(
    (state?.players ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      eliminated: (playerChips[p.id] ?? 0) <= 0,
    }))
  );

  // Cosmetics: card back and table felt from auth store
  let myCardBackStyle = $derived($currentUser?.cardBack ?? null);
  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');

  // Sync chips to nav bar
  $effect(() => {
    if (myChips !== undefined && myChips !== null) {
      userStats.update(s => s ? { ...s, chips: myChips } : s);
    }
  });

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

  let addingBot = $state(false);

  async function addBot() {
    addingBot = true;
    try {
      await fetch(`/api/add-bot?room=${code}&game=poker`, { method: 'POST' });
    } catch (e) {
      console.error('addBot failed', e);
    }
    addingBot = false;
  }

  async function removeAllBots() {
    try {
      await fetch(`/api/remove-bots?room=${code}&game=poker`, { method: 'POST' });
    } catch (e) {
      console.error('removeAllBots failed', e);
    }
  }

  // Phase 4: layout selector. controller -> phone-only paired surface.
  // mobile -> phone solo (or any coarse-pointer / narrow viewport solo).
  // table -> PC table-only paired OR PC solo (default desktop fallback).
  type LayoutKind = 'controller' | 'mobile' | 'table';
  let layout: LayoutKind = $derived.by(() => {
    if (roleParam === 'controller') return 'controller';
    if (isMobile && (roleParam === 'both' || roleParam == null)) return 'mobile';
    return 'table';
  });
  let showOwnHandOnTable = $derived(roleParam === 'both' || roleParam == null);
</script>

{#if $error}
  <div class="error-toast">{$error}</div>
{/if}

<div class="game-page" style={tableFeltStyle}>
  {#if !state}
    <div class="loading"><p>Connecting...</p></div>
  {:else if state.phase === 'lobby' && layout !== 'mobile'}
    <!-- PC lobby: kept inline; mobile lobby is handled inside MobilePokerView. -->
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
            <button class="mode-btn" class:active={gameMode === 'casual'} onclick={() => gameMode = 'casual'}>Casual</button>
            <button class="mode-btn" class:active={gameMode === 'competitive'} onclick={() => gameMode = 'competitive'}>Competitive</button>
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
      {#if pid && roleParam !== 'controller' && roleParam !== 'table' && $isLoggedIn}
        <PairButton roomCode={code} playerId={pid} phase={state.phase} {socket} />
      {/if}
      <button class="btn-secondary" onclick={leaveGame}>Leave</button>
    </div>

  {:else if layout === 'controller'}
    <ControllerView
      {state} {pid}
      {myHand} {isMyTurn} {amIFolded} {bettingRound}
      {myChips} {myBet} {myHandName}
      {inputMode}
      {canCheck} {callAmount} {minRaise} {maxRaise}
      {isArmed}
      {playerChips} {winnersInfo}
      onaction={sendAction}
      onarmedchange={(armed) => isArmed = armed}
      onleaveGame={leaveGame}
    />

  {:else if layout === 'mobile'}
    <MobilePokerView
      {state} {pid} {ts} {isHost} {isSpectator}
      {isMyTurn} {amIFolded} {myHand} {myHandName} {myChips} {myBet}
      {bettingRound} {communityCards} {pots} {totalPot}
      {playerChips} {playerBets} {playerFolded} {playerAllIn} {playerHands}
      {dealerId} {sbPlayerId} {bbPlayerId} {winnersInfo} {myCardBackStyle}
      {canCheck} {callAmount} {minRaise} {maxRaise}
      {inputMode} {isArmed}
      setMuckRef={(el) => muckTargetRef = el}
      {blindSetting} {gameMode} {casualChipCount} {addingBot}
      {betPlayers} {myUserId} {code} {socket} {roleParam} isLoggedIn={$isLoggedIn}
      onaction={sendAction}
      onarmedchange={(armed) => isArmed = armed}
      onstartGame={startGame}
      onnextHand={nextHand}
      onleaveGame={leaveGame}
      onaddBot={addBot}
      onremoveAllBots={removeAllBots}
      onblindChange={(v) => blindSetting = v}
      ongameModeChange={(v) => gameMode = v}
      oncasualChipCountChange={(v) => casualChipCount = v}
    />

  {:else}
    <TableView
      {state} {pid} {ts} {isSpectator}
      {isMyTurn} {amIFolded} {myHand} {myHandName} {myChips} {myBet}
      {bettingRound} {communityCards} {pots} {totalPot}
      {playerChips} {playerBets} {playerFolded} {playerAllIn} {playerHands}
      {dealerId} {sbPlayerId} {bbPlayerId} {winnersInfo} {myCardBackStyle}
      {canCheck} {callAmount} {minRaise} {maxRaise}
      {inputMode} {isArmed}
      setMuckRef={(el) => muckTargetRef = el}
      showOwnHandAndActions={showOwnHandOnTable}
      {isHost}
      onnextHand={nextHand}
      onleaveGame={leaveGame}
      {betPlayers} {myUserId} {code}
      onaction={sendAction}
      onarmedchange={(armed) => isArmed = armed}
    />
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
    overscroll-behavior: contain;
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

  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      padding-bottom: max(18rem, calc(env(safe-area-inset-bottom, 0px) + 18rem));
    }

    /* HOTFIX2 FIX 1: at <=420px BetControls becomes position:fixed bottom:0 z-index:40
       and visually collides with the fixed HoleCards (bottom:0 z-index:50). Push the
       fixed bet controls upward by ~card area height so action buttons sit above
       the cards. */
    :global(.bet-controls) {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 140px) !important;
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

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
