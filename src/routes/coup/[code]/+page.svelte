<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { writable } from 'svelte/store';
  import { isLoggedIn, currentUser } from '$lib/auth';
  import { dispatchRelayMessages } from '$lib/levelUpDispatch';
  import { CoupSocket } from '$lib/coup/socket';
  import BetPanel from '$lib/components/BetPanel.svelte';
  import {
    ROLE_GLYPH,
    ROLE_LABEL,
    type CoupGameState,
    type CoupActionType,
    type Influence,
    type PendingActionView,
  } from '$lib/coup/types';

  const code = $page.params.code!;
  const socket = new CoupSocket();

  const gameState = writable<CoupGameState | null>(null);
  const myPlayerId = writable<string | null>(null);
  const error = writable<string | null>(null);

  let isSpectator = $state(false);
  let reconnecting = $state(true);
  let buyIn = $state<10 | 25 | 50 | 100 | 250>(25);
  let errorTimeout: ReturnType<typeof setTimeout>;

  // Action panel UI state
  let pickingTargetFor = $state<CoupActionType | null>(null);
  let exchangeSelection = $state<number[]>([]);

  $effect(() => {
    const unsub = socket.onMessage((raw: any) => {
      const msg = raw as any;
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        isSpectator = msg.isSpectator ?? false;
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
        if (msg.isSpectator !== undefined) isSpectator = msg.isSpectator;
        // Reset transient UI when phase changes
        pickingTargetFor = null;
      } else if (msg.type === 'error') {
        error.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => error.set(null), 4000);
      }
      dispatchRelayMessages(msg);
    });

    socket.connect(code).then(() => socket.joinRoom(code)).catch(() => goto('/coup'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) {
      goto('/coup');
    }
  });

  // ─── Derived state ────────────────────────────────────────────
  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let isHost = $derived(state?.players?.find((p) => p.id === pid)?.isHost ?? false);
  let ts = $derived(state?.tableState ?? null);
  let pa = $derived<PendingActionView>(ts?.pendingAction ?? null);
  let myView = $derived(pid && ts ? ts.playerStates[pid] : null);
  let myCoins = $derived(myView?.coins ?? 0);
  let myCards = $derived<Influence[]>(myView?.myCards ?? []);
  let amIEliminated = $derived(myView?.eliminated ?? false);
  let isMyTurn = $derived(!!pid && ts?.currentPlayerId === pid);
  let currentTurnName = $derived(ts?.currentPlayerId ? playerName(ts.currentPlayerId) : '');

  // Reset exchange selection when leaving exchange phase
  $effect(() => {
    if (!pa || pa.phase !== 'exchange_select' || pa.playerId !== pid) {
      exchangeSelection = [];
    }
  });

  function playerName(id: string): string {
    return state?.players?.find((p) => p.id === id)?.name ?? id;
  }

  function send(msg: object) {
    socket.send(msg);
  }

  function leaveGame() {
    socket.disconnect();
    gameState.set(null);
    goto('/coup');
  }

  function startGame() {
    send({ type: 'start_game', buyIn });
  }

  function playAgain() {
    send({ type: 'play_again' });
  }

  // ─── Bot controls ──────────────────────────────────────────────
  let addingBot = $state(false);
  async function addBot() {
    addingBot = true;
    try {
      await fetch(`/api/add-bot?room=${code}&game=coup`, { method: 'POST' });
    } catch {}
    addingBot = false;
  }
  async function removeAllBots() {
    await fetch(`/api/remove-bots?room=${code}&game=coup`, { method: 'POST' });
  }

  // ─── Action helpers ────────────────────────────────────────────
  const NEEDS_TARGET: Record<CoupActionType, boolean> = {
    income: false,
    foreign_aid: false,
    coup: true,
    tax: false,
    assassinate: true,
    steal: true,
    exchange: false,
  };

  function declareAction(action: CoupActionType, targetId?: string) {
    if (NEEDS_TARGET[action] && !targetId) {
      pickingTargetFor = action;
      return;
    }
    send({ type: 'declare_action', action, targetId });
    pickingTargetFor = null;
  }

  function cancelTargetPick() {
    pickingTargetFor = null;
  }

  function challenge() { send({ type: 'challenge' }); }
  function pass() { send({ type: 'pass' }); }
  function block(claimedRole: Influence) { send({ type: 'block', claimedRole }); }
  function loseCard(idx: number) { send({ type: 'lose_card', cardIdx: idx }); }
  function submitExchange() {
    if (exchangeSelection.length !== 2) return;
    send({ type: 'exchange_select', keepIndices: [...exchangeSelection] });
    exchangeSelection = [];
  }
  function toggleExchangeIdx(idx: number) {
    if (exchangeSelection.includes(idx)) {
      exchangeSelection = exchangeSelection.filter((i) => i !== idx);
    } else if (exchangeSelection.length < 2) {
      exchangeSelection = [...exchangeSelection, idx];
    }
  }

  // Build target list for an action: alive opponents.
  function targetCandidates(): { id: string; name: string }[] {
    if (!ts || !state) return [];
    return state.players
      .filter((p) => p.id !== pid && !ts.playerStates[p.id]?.eliminated)
      .map((p) => ({ id: p.id, name: p.name }));
  }

  // For "what cost is needed" disabling on action buttons.
  function cantAfford(action: CoupActionType): boolean {
    if (action === 'coup') return myCoins < 7;
    if (action === 'assassinate') return myCoins < 3;
    return false;
  }

  // If forced to coup (>=10 coins), only Coup is enabled.
  let mustCoup = $derived(myCoins >= 10);

  // ─── Spectator bet panel data ─────────────────────────────────
  let myUserId = $derived($currentUser?.id ?? null);
  let betPlayers = $derived(
    (state?.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      eliminated: ts?.playerStates[p.id]?.eliminated ?? false,
    }))
  );

  // Roles allowed to block per action.
  function blockerRoles(actionType: CoupActionType): Influence[] {
    if (actionType === 'foreign_aid') return ['duke'];
    if (actionType === 'assassinate') return ['contessa'];
    if (actionType === 'steal') return ['captain', 'ambassador'];
    return [];
  }

  // Drawn-cards length when in exchange_select phase (only for spectators / others).
  function exchangeDrawnCount(): number {
    if (!pa || pa.phase !== 'exchange_select') return 0;
    return pa.drawnCards?.length ?? pa.drawnCardCount ?? 0;
  }

  // Combined hand+drawn list for the actor's exchange UI.
  let exchangeCards = $derived<Influence[]>(
    pa && pa.phase === 'exchange_select' && pa.playerId === pid && pa.drawnCards
      ? [...myCards, ...pa.drawnCards]
      : []
  );

  // Helpers for the action-claim summary string.
  function claimedRoleForAction(actionType: CoupActionType): Influence | null {
    if (actionType === 'tax') return 'duke';
    if (actionType === 'assassinate') return 'assassin';
    if (actionType === 'steal') return 'captain';
    if (actionType === 'exchange') return 'ambassador';
    return null;
  }

  function describeAction(actionType: CoupActionType, actorId: string, targetId?: string): string {
    const actor = playerName(actorId);
    const target = targetId ? playerName(targetId) : '';
    switch (actionType) {
      case 'income': return `${actor} took Income`;
      case 'foreign_aid': return `${actor} claims Foreign Aid`;
      case 'coup': return `${actor} coups ${target}`;
      case 'tax': return `${actor} claims Duke for Tax`;
      case 'assassinate': return `${actor} claims Assassin on ${target}`;
      case 'steal': return `${actor} claims Captain to steal from ${target}`;
      case 'exchange': return `${actor} claims Ambassador to exchange`;
    }
  }
</script>

{#if $error}
  <div class="error-toast">{$error}</div>
{/if}

<div class="game-page">
  {#if !state}
    <div class="loading"><p>Connecting...</p></div>
  {:else}

    <!-- ─── LOBBY ─── -->
    {#if state.phase === 'lobby'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Lobby</h2>
        <p class="room-code">Room <strong>{state.code}</strong></p>

        <div class="player-list">
          {#each state.players as player}
            <div class="player-item" class:disconnected={!player.connected}>
              <span class="player-name" style:color={player.nameColour ?? undefined}>{player.name}</span>
              {#if player.isBot}<span class="bot-badge">BOT</span>{/if}
              {#if player.isHost}<span class="host-badge">HOST</span>{/if}
              {#if !player.connected && !player.isBot}<span class="dc-badge">DC</span>{/if}
            </div>
          {/each}
        </div>

        <p class="player-count">
          {state.players.length} / 6 players
          {#if state.players.length < 2}
            (need {2 - state.players.length} more to start)
          {/if}
        </p>

        {#if isHost}
          <div class="buyin-selector">
            <label class="field-label">Buy-in</label>
            <div class="buyin-row">
              {#each [10, 25, 50, 100, 250] as v}
                <button
                  class="buyin-btn"
                  class:active={buyIn === v}
                  onclick={() => (buyIn = v as 10 | 25 | 50 | 100 | 250)}
                >{v}</button>
              {/each}
            </div>
            <p class="competitive-note">Buy-in deducted from your chip balance at start.</p>
          </div>

          <button class="btn-primary" onclick={startGame} disabled={state.players.length < 2}>
            Start Game
          </button>
          <div class="bot-controls">
            <button class="btn-secondary btn-sm" onclick={addBot} disabled={state.players.length >= 6 || addingBot}>
              {addingBot ? 'Adding...' : 'Add Bot'}
            </button>
            {#if state.players.some((p) => p.isBot)}
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

    <!-- ─── PLAYING / ROUND_OVER ─── -->
    {:else if state.phase === 'playing' || state.phase === 'round_over'}
      <div class="phase-panel">
        {#if isSpectator}<div class="spectator-banner">Spectating</div>{/if}

        {#if isSpectator}
          <BetPanel
            roomCode={code}
            game="coup"
            players={betPlayers}
            isSpectator={isSpectator}
            isGameEnded={state.phase === 'round_over'}
            myUserId={myUserId}
          />
        {/if}

        <!-- Pot + turn header -->
        <div class="header-row">
          <div class="pot-display">
            <span class="pot-label">Pot</span>
            <span class="pot-value geo-title">{ts?.pot ?? 0}</span>
          </div>
          <div class="turn-display">
            {#if isMyTurn && !pa}
              <span class="your-turn">Your turn</span>
            {:else if currentTurnName}
              <span class="waiting-turn">Turn: {currentTurnName}</span>
            {/if}
          </div>
        </div>

        <!-- Action log -->
        {#if ts?.actionLog && ts.actionLog.length > 0}
          <div class="log">
            {#each ts.actionLog.slice(-8) as entry}
              <div class="log-entry">{entry.text}</div>
            {/each}
          </div>
        {/if}

        <!-- Other players around the table -->
        <div class="opponents">
          {#each state.players.filter((p) => p.id !== pid) as opp}
            {@const ops = ts?.playerStates[opp.id]}
            <div class="opponent" class:eliminated={ops?.eliminated}
                 class:active={ts?.currentPlayerId === opp.id}>
              <div class="opp-head">
                <span class="opp-name" style:color={opp.nameColour ?? undefined}>{opp.name}</span>
                {#if opp.isBot}<span class="bot-badge">BOT</span>{/if}
                {#if !opp.connected && !opp.isBot}<span class="dc-badge">DC</span>{/if}
              </div>
              <div class="opp-stats">
                <span class="coins">{ops?.coins ?? 0} <span class="coin-label">coins</span></span>
              </div>
              <div class="opp-cards">
                {#each Array(ops?.hiddenCardCount ?? 0) as _}
                  <span class="card-back" aria-label="Face-down card"></span>
                {/each}
                {#each ops?.revealedCards ?? [] as role}
                  <span class="card-up revealed" title={ROLE_LABEL[role]}>
                    <span class="role-glyph">{ROLE_GLYPH[role]}</span>
                    <span class="role-name">{ROLE_LABEL[role]}</span>
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <!-- Pending action banner -->
        {#if pa}
          <div class="pending-banner">
            {#if pa.phase === 'awaiting_challenge'}
              <span class="pending-text">{describeAction(pa.action.type, pa.action.playerId, pa.action.targetId)}</span>
              <span class="pending-sub">Challenge or pass?</span>
            {:else if pa.phase === 'awaiting_block'}
              <span class="pending-text">{describeAction(pa.action.type, pa.action.playerId, pa.action.targetId)}</span>
              <span class="pending-sub">Block or pass?</span>
            {:else if pa.phase === 'awaiting_block_challenge'}
              <span class="pending-text">{playerName(pa.block.blockerId)} blocks with {ROLE_LABEL[pa.block.claimedRole]}</span>
              <span class="pending-sub">Challenge the block?</span>
            {:else if pa.phase === 'lose_influence'}
              <span class="pending-text">{playerName(pa.targetId)} must lose an influence</span>
              <span class="pending-sub">Reason: {pa.reason.replace('_', ' ')}</span>
            {:else if pa.phase === 'exchange_select'}
              <span class="pending-text">{playerName(pa.playerId)} is exchanging cards</span>
              <span class="pending-sub">Drew {exchangeDrawnCount()}</span>
            {/if}
          </div>
        {/if}

        <!-- My hand -->
        {#if !isSpectator && myView}
          <div class="my-hand">
            <div class="my-head">
              <span class="my-label geo-title">Your Hand</span>
              <span class="my-coins">{myCoins} coins</span>
            </div>
            <div class="my-cards">
              {#each myCards as role, idx}
                <button
                  class="my-card"
                  class:selectable={pa && pa.phase === 'lose_influence' && pa.targetId === pid}
                  disabled={!(pa && pa.phase === 'lose_influence' && pa.targetId === pid)}
                  onclick={() => loseCard(idx)}
                  title={ROLE_LABEL[role]}
                >
                  <span class="role-glyph">{ROLE_GLYPH[role]}</span>
                  <span class="role-name">{ROLE_LABEL[role]}</span>
                </button>
              {/each}
              {#if myCards.length === 0 && !amIEliminated}
                <span class="no-cards">No face-down cards</span>
              {/if}
              {#if amIEliminated}
                <span class="eliminated-tag">Eliminated</span>
              {/if}
            </div>
          </div>
        {/if}

        <!-- ─── Action panel (driven by pendingAction) ─── -->
        {#if !isSpectator && !amIEliminated && state.phase === 'playing'}
          <div class="action-panel">

            {#if !pa && isMyTurn}
              {#if pickingTargetFor}
                <div class="target-picker">
                  <span class="target-label">Choose target for {pickingTargetFor}</span>
                  <div class="target-row">
                    {#each targetCandidates() as t}
                      <button class="btn-secondary btn-sm" onclick={() => declareAction(pickingTargetFor!, t.id)}>{t.name}</button>
                    {/each}
                  </div>
                  <button class="btn-secondary btn-sm" onclick={cancelTargetPick}>Cancel</button>
                </div>
              {:else}
                <div class="action-grid">
                  <button class="action-btn" disabled={mustCoup} onclick={() => declareAction('income')}>Income (+1)</button>
                  <button class="action-btn" disabled={mustCoup} onclick={() => declareAction('foreign_aid')}>Foreign Aid (+2)</button>
                  <button class="action-btn" disabled={mustCoup} onclick={() => declareAction('tax')}>Tax (Duke +3)</button>
                  <button class="action-btn" disabled={mustCoup || cantAfford('assassinate')} onclick={() => declareAction('assassinate')}>Assassinate (3)</button>
                  <button class="action-btn" disabled={mustCoup} onclick={() => declareAction('steal')}>Steal (Captain)</button>
                  <button class="action-btn" disabled={mustCoup} onclick={() => declareAction('exchange')}>Exchange</button>
                  <button class="action-btn primary" disabled={cantAfford('coup')} onclick={() => declareAction('coup')}>Coup (7)</button>
                </div>
                {#if mustCoup}
                  <p class="forced-note">10+ coins. You must Coup.</p>
                {/if}
              {/if}

            {:else if !pa && !isMyTurn}
              <p class="waiting-text">Waiting for {currentTurnName} to act...</p>

            {:else if pa && pa.phase === 'awaiting_challenge'}
              {#if pa.action.playerId === pid}
                <p class="waiting-text">Waiting for challenges...</p>
                <p class="passed-list">Passed: {pa.passedBy.length}</p>
              {:else if pa.passedBy.includes(pid!)}
                <p class="waiting-text">You passed. Waiting for others...</p>
              {:else}
                <div class="action-row-h">
                  <button class="btn-primary" onclick={challenge}>Challenge</button>
                  <button class="btn-secondary" onclick={pass}>Pass</button>
                </div>
              {/if}

            {:else if pa && pa.phase === 'awaiting_block'}
              {#if pa.action.playerId === pid}
                <p class="waiting-text">Waiting for blocks...</p>
                <p class="passed-list">Passed: {pa.passedBy.length}</p>
              {:else}
                {@const canBlock = pa.action.type === 'foreign_aid' || pa.action.targetId === pid}
                {#if canBlock && !pa.passedBy.includes(pid!)}
                  <div class="action-row-h">
                    {#each blockerRoles(pa.action.type) as role}
                      <button class="btn-primary" onclick={() => block(role)}>Block as {ROLE_LABEL[role]}</button>
                    {/each}
                    <button class="btn-secondary" onclick={pass}>Pass</button>
                  </div>
                {:else if pa.passedBy.includes(pid!)}
                  <p class="waiting-text">You passed. Waiting...</p>
                {:else}
                  <p class="waiting-text">Only {pa.action.targetId ? playerName(pa.action.targetId) : 'targets'} may block this.</p>
                {/if}
              {/if}

            {:else if pa && pa.phase === 'awaiting_block_challenge'}
              {#if pa.block.blockerId === pid}
                <p class="waiting-text">Waiting for challenges to your block...</p>
                <p class="passed-list">Passed: {pa.passedBy.length}</p>
              {:else if pa.passedBy.includes(pid!)}
                <p class="waiting-text">You passed. Waiting for others...</p>
              {:else}
                <div class="action-row-h">
                  <button class="btn-primary" onclick={challenge}>Challenge</button>
                  <button class="btn-secondary" onclick={pass}>Pass</button>
                </div>
              {/if}

            {:else if pa && pa.phase === 'lose_influence'}
              {#if pa.targetId === pid}
                <p class="prompt">Click one of your cards above to lose it.</p>
              {:else}
                <p class="waiting-text">Waiting for {playerName(pa.targetId)} to lose an influence...</p>
              {/if}

            {:else if pa && pa.phase === 'exchange_select'}
              {#if pa.playerId === pid && pa.drawnCards}
                <p class="prompt">Pick 2 cards to keep.</p>
                <div class="exchange-grid">
                  {#each exchangeCards as role, idx}
                    <button
                      class="exchange-card"
                      class:selected={exchangeSelection.includes(idx)}
                      onclick={() => toggleExchangeIdx(idx)}
                      title={ROLE_LABEL[role]}
                    >
                      <span class="role-glyph">{ROLE_GLYPH[role]}</span>
                      <span class="role-name">{ROLE_LABEL[role]}</span>
                    </button>
                  {/each}
                </div>
                <button
                  class="btn-primary"
                  disabled={exchangeSelection.length !== 2}
                  onclick={submitExchange}
                >Keep selected ({exchangeSelection.length}/2)</button>
              {:else}
                <p class="waiting-text">Waiting for {playerName(pa.playerId)} to exchange...</p>
              {/if}
            {/if}

          </div>
        {/if}
      </div>

    <!-- ─── GAME OVER ─── -->
    {:else if state.phase === 'game_over'}
      <div class="phase-panel">
        <h2 class="geo-title phase-title">Game Over</h2>
        {#if ts?.winnerId}
          <div class="winner-row fade-in">
            <span class="winner-label">Winner</span>
            <span class="winner-name">{playerName(ts.winnerId)}</span>
            {#if ts.pot > 0}
              <span class="winner-pot">+{ts.pot} chips</span>
            {/if}
          </div>
        {/if}

        <div class="player-list">
          {#each state.players as player}
            {@const ps = ts?.playerStates[player.id]}
            <div class="player-item" class:eliminated={ps?.eliminated}>
              <span class="player-name" style:color={player.nameColour ?? undefined}>{player.name}</span>
              {#if player.id === ts?.winnerId}<span class="host-badge">WIN</span>{/if}
              <span class="chip-count">{ps?.coins ?? 0} coins</span>
            </div>
          {/each}
        </div>

        {#if isHost}
          <button class="btn-primary" onclick={playAgain}>Play Again</button>
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
    color: var(--accent);
    text-align: center;
  }

  .room-code { text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: -0.25rem; }
  .room-code strong { color: var(--accent); letter-spacing: 0.2em; }

  /* Player list (lobby + game over) */
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

  .player-item.disconnected, .player-item.eliminated { opacity: 0.45; }

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
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }
  .host-badge { background: var(--accent-faint); color: var(--accent); }
  .dc-badge { background: var(--bg-input); color: var(--text-subtle); }
  .bot-badge { background: rgba(155, 89, 182, 0.15); color: #9b59b6; }

  .bot-controls { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
  .btn-sm { padding: 0.5rem 0.875rem !important; font-size: 0.8rem !important; }
  .btn-danger { color: #e74c3c !important; border-color: rgba(231, 76, 60, 0.3) !important; }
  .btn-danger:hover { background: rgba(231, 76, 60, 0.1) !important; }

  .player-count { font-size: 0.875rem; color: var(--text-muted); text-align: center; }
  .waiting-text { font-size: 0.875rem; color: var(--text-muted); text-align: center; }
  .prompt { font-size: 0.9rem; color: var(--accent); text-align: center; font-weight: 600; }

  /* Buy-in selector */
  .buyin-selector { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .buyin-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .buyin-btn {
    flex: 1 0 60px;
    padding: 0.55rem 0.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    background: var(--bg-input);
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .buyin-btn.active { background: var(--accent-faint); color: var(--accent); border-color: var(--accent-border); }
  .buyin-btn:hover:not(.active) { color: var(--text); }
  .competitive-note { font-size: 0.75rem; color: var(--text-subtle); margin: 0; }

  /* Header row (pot + turn) */
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }
  .pot-display { display: flex; flex-direction: column; align-items: flex-start; gap: 0.1rem; }
  .pot-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }
  .pot-value { font-size: 1.1rem; color: var(--yellow, #eab308); }
  .turn-display { text-align: right; }
  .your-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .waiting-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  /* Log */
  .log {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    max-height: 9rem;
    overflow-y: auto;
    padding: 0.5rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-family: 'Rajdhani', 'Consolas', monospace;
    font-size: 0.78rem;
    color: var(--text-muted);
  }
  .log-entry { line-height: 1.45; }

  /* Opponents */
  .opponents { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem; }
  .opponent {
    padding: 0.55rem 0.7rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    transition: border-color 0.15s ease;
  }
  .opponent.active { border-color: var(--accent-border); box-shadow: 0 0 0 1px var(--accent-border) inset; }
  .opponent.eliminated { opacity: 0.45; }
  .opp-head { display: flex; align-items: center; gap: 0.4rem; }
  .opp-name { flex: 1; font-size: 0.85rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .opp-stats { display: flex; gap: 0.5rem; }
  .coins { font-family: 'Rajdhani', system-ui, sans-serif; font-size: 0.85rem; font-weight: 700; color: var(--yellow, #eab308); }
  .coin-label { font-size: 0.65rem; color: var(--text-subtle); font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; }
  .opp-cards { display: flex; gap: 0.3rem; flex-wrap: wrap; }

  /* Cards */
  .card-back {
    width: 24px;
    height: 36px;
    background: linear-gradient(135deg, var(--accent-faint), var(--bg-input));
    border: 1px solid var(--accent-border);
    border-radius: 2px;
  }
  .card-up {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 50px;
    background: var(--bg-input);
    border: 1px solid var(--border-bright);
    border-radius: 2px;
    color: var(--text-muted);
    font-family: 'Rajdhani', system-ui, sans-serif;
  }
  .card-up.revealed {
    opacity: 0.6;
    background: rgba(231, 76, 60, 0.08);
    border-color: rgba(231, 76, 60, 0.3);
    color: #e74c3c;
  }
  .role-glyph { font-size: 1.1rem; line-height: 1; }
  .role-name { font-size: 0.55rem; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 0.1rem; }

  /* Pending banner */
  .pending-banner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.55rem 0.75rem;
    background: rgba(74, 144, 217, 0.08);
    border: 1px solid rgba(74, 144, 217, 0.3);
    border-radius: 3px;
    text-align: center;
  }
  .pending-text { font-size: 0.95rem; color: var(--accent); font-weight: 600; }
  .pending-sub {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* My hand */
  .my-hand {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.6rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--accent-border);
    border-radius: 3px;
  }
  .my-head { display: flex; align-items: center; justify-content: space-between; }
  .my-label { font-size: 0.75rem; letter-spacing: 0.14em; color: var(--text-muted); }
  .my-coins { font-family: 'Rajdhani', system-ui, sans-serif; font-size: 0.95rem; font-weight: 700; color: var(--yellow, #eab308); }
  .my-cards { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .my-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 80px;
    background: var(--bg-input);
    border: 1px solid var(--accent-border);
    border-radius: 3px;
    color: var(--accent);
    font-family: 'Rajdhani', system-ui, sans-serif;
    cursor: default;
    transition: all 0.15s ease;
  }
  .my-card .role-glyph { font-size: 1.6rem; }
  .my-card .role-name { font-size: 0.6rem; letter-spacing: 0.08em; }
  .my-card.selectable {
    cursor: pointer;
    border-color: #e74c3c;
    color: #e74c3c;
    background: rgba(231, 76, 60, 0.08);
  }
  .my-card.selectable:hover { filter: brightness(1.15); transform: translateY(-2px); }

  .no-cards { font-size: 0.85rem; color: var(--text-subtle); font-style: italic; }
  .eliminated-tag { font-size: 0.85rem; color: #e74c3c; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }

  /* Action panel */
  .action-panel { display: flex; flex-direction: column; gap: 0.6rem; padding-top: 0.25rem; }
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.4rem;
  }
  .action-btn {
    padding: 0.65rem 0.5rem;
    background: var(--bg-input);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 2px;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .action-btn:hover:not(:disabled) { border-color: var(--accent-border); color: var(--accent); }
  .action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .action-btn.primary { background: var(--accent-faint); color: var(--accent); border-color: var(--accent-border); }

  .forced-note {
    font-size: 0.78rem;
    color: var(--yellow, #eab308);
    text-align: center;
    margin: 0;
  }

  .action-row-h { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
  .action-row-h .btn-primary, .action-row-h .btn-secondary { flex: 1 0 100px; max-width: 220px; }

  .target-picker { display: flex; flex-direction: column; gap: 0.5rem; align-items: center; }
  .target-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    color: var(--text-muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .target-row { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; }

  .passed-list {
    font-size: 0.75rem;
    color: var(--text-subtle);
    text-align: center;
    margin: 0;
  }

  /* Exchange grid */
  .exchange-grid { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
  .exchange-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 60px;
    height: 84px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-muted);
    font-family: 'Rajdhani', system-ui, sans-serif;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .exchange-card .role-glyph { font-size: 1.7rem; }
  .exchange-card .role-name { font-size: 0.6rem; letter-spacing: 0.08em; }
  .exchange-card.selected { background: var(--accent-faint); color: var(--accent); border-color: var(--accent-border); }
  .exchange-card:hover { transform: translateY(-2px); }

  /* Spectator banner */
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

  /* Winner row */
  .winner-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(108, 180, 130, 0.1);
    border: 1px solid rgba(108, 180, 130, 0.4);
    border-radius: 3px;
    box-shadow: 0 0 16px rgba(108, 180, 130, 0.15);
  }
  .winner-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .winner-name { flex: 1; font-size: 1rem; color: var(--accent); font-weight: 700; }
  .winner-pot { font-family: 'Rajdhani', system-ui, sans-serif; font-size: 0.9rem; font-weight: 700; color: var(--yellow, #eab308); }

  @media (max-width: 420px) {
    .game-page {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
      padding-bottom: max(7rem, env(safe-area-inset-bottom, 7rem));
    }
    .opponents { grid-template-columns: 1fr 1fr; }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
