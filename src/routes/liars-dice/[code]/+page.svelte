<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { writable } from 'svelte/store';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/liars-dice');

  interface PlayerView {
    id: string;
    name: string;
    connected: boolean;
    isHost: boolean;
    isGuest: boolean;
    isBot: boolean;
    diceCount: number;
    eliminated: boolean;
    chips: number;
  }

  interface RoundResult {
    bid: { count: number; face: number; bidderId: string };
    actualCount: number;
    callerId: string;
    loserId: string;
    revealedDice: Record<string, number[]>;
  }

  interface LDState {
    code: string;
    phase: 'lobby' | 'playing' | 'round_over' | 'game_over';
    players: PlayerView[];
    hostId: string;
    turnOrder: string[];
    currentTurnId: string | null;
    currentBid: { count: number; face: number; bidderId: string } | null;
    pot: number;
    gameMode: 'casual' | 'competitive';
    ante: number;
    onesWild: boolean;
    myDice: number[];
    lastRoundResult: RoundResult | null;
    winnerId: string | null;
  }

  const gameState = writable<LDState | null>(null);
  const myPlayerId = writable<string | null>(null);
  const errorMsg = writable<string | null>(null);

  let reconnecting = $state(true);
  let bidCount = $state(1);
  let bidFace = $state(2);
  let errorTimeout: ReturnType<typeof setTimeout>;

  const ANTE_OPTIONS = [25, 50, 100, 250];

  $effect(() => {
    const unsub = socket.onMessage((msg: any) => {
      if (msg.type === 'joined') {
        myPlayerId.set(msg.playerId);
        gameState.set(msg.state);
        reconnecting = false;
      } else if (msg.type === 'state_update') {
        gameState.set(msg.state);
      } else if (msg.type === 'error') {
        errorMsg.set(msg.message);
        clearTimeout(errorTimeout);
        errorTimeout = setTimeout(() => errorMsg.set(null), 4000);
      }
    });

    socket.connect(code)
      .then(() => socket.joinRoom(code))
      .catch(() => goto('/liars-dice'));

    setTimeout(() => { reconnecting = false; }, 3000);

    return () => { unsub(); socket.disconnect(); };
  });

  $effect(() => {
    if (!reconnecting && !$gameState) goto('/liars-dice');
  });

  // Seed bid defaults to the lowest valid raise when currentBid changes.
  // Strict rule: face cannot drop below cb.face, count cannot drop below cb.count.
  $effect(() => {
    const s = $gameState;
    if (!s) return;
    const cb = s.currentBid;
    if (cb) {
      if (bidFace < cb.face) bidFace = cb.face;
      if (bidCount < cb.count) bidCount = cb.count;
      if (bidCount === cb.count && bidFace === cb.face) {
        if (cb.face < 6) {
          bidFace = cb.face + 1;
        } else {
          bidCount = cb.count + 1;
        }
      }
    } else {
      if (bidCount < 1) bidCount = 1;
      if (bidFace < 1 || bidFace > 6) bidFace = 2;
    }
  });

  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let me = $derived(state?.players.find((p) => p.id === pid) ?? null);
  let isHost = $derived(me?.isHost ?? false);
  let isMyTurn = $derived(state?.currentTurnId === pid);
  let currentTurnName = $derived(
    state?.players.find((p) => p.id === state.currentTurnId)?.name ?? ''
  );
  let totalDice = $derived(
    state?.players.reduce((sum, p) => sum + (p.eliminated ? 0 : p.diceCount), 0) ?? 0
  );
  let bidderName = $derived(
    state?.currentBid
      ? state.players.find((p) => p.id === state.currentBid!.bidderId)?.name ?? 'Someone'
      : ''
  );
  let winnerName = $derived(
    state?.winnerId ? state.players.find((p) => p.id === state.winnerId)?.name ?? 'Winner' : ''
  );
  let loserName = $derived(
    state?.lastRoundResult
      ? state.players.find((p) => p.id === state.lastRoundResult!.loserId)?.name ?? ''
      : ''
  );
  let callerName = $derived(
    state?.lastRoundResult
      ? state.players.find((p) => p.id === state.lastRoundResult!.callerId)?.name ?? ''
      : ''
  );
  let prevBidderName = $derived(
    state?.lastRoundResult
      ? state.players.find((p) => p.id === state.lastRoundResult!.bid.bidderId)?.name ?? ''
      : ''
  );

  function canPlaceBid(): boolean {
    if (!state || !isMyTurn) return false;
    if (bidCount < 1 || bidCount > totalDice) return false;
    if (bidFace < 1 || bidFace > 6) return false;
    const cb = state.currentBid;
    if (!cb) return true;
    // Strict rule: neither count nor face may decrease; at least one must increase.
    if (bidFace < cb.face) return false;
    if (bidCount < cb.count) return false;
    if (bidCount === cb.count && bidFace === cb.face) return false;
    return true;
  }

  function placeBid() {
    if (!canPlaceBid()) return;
    socket.send({ type: 'place_bid', count: bidCount, face: bidFace });
  }

  function callLiar() {
    if (!state?.currentBid || !isMyTurn) return;
    socket.send({ type: 'call_liar' });
  }

  function startGame() { socket.send({ type: 'start_game' }); }
  function nextRound() { socket.send({ type: 'next_round' }); }
  function newGame() { socket.send({ type: 'new_game' }); }
  function setMode(m: 'casual' | 'competitive') { socket.send({ type: 'set_mode', gameMode: m }); }
  function setAnte(a: number) { socket.send({ type: 'set_ante', ante: a }); }
  function setOnesWild(v: boolean) { socket.send({ type: 'set_ones_wild', onesWild: v }); }
  function addBot() { socket.send({ type: 'add_bot' }); }
  function removeBots() { socket.send({ type: 'remove_bots' }); }

  function bumpCount(delta: number) {
    const next = bidCount + delta;
    if (next < 1 || next > totalDice) return;
    bidCount = next;
  }

  function dieFace(n: number): string {
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return faces[n] ?? String(n);
  }
</script>

{#if $errorMsg}
  <div class="error-toast">{$errorMsg}</div>
{/if}

{#if state}
  <div class="game">
    <header class="header">
      <div class="room-code">
        Room <strong>{state.code}</strong>
        {#if state.onesWild}
          <span class="wild-badge" title="Ones count as wild faces">WILDS</span>
        {/if}
      </div>
      <div class="pot-chip">
        <span class="pot-label">Pot</span>
        <span class="pot-value">{state.pot.toLocaleString()} chips</span>
      </div>
    </header>

    <!-- Player table -->
    <section class="players">
      {#each state.players as p (p.id)}
        <div
          class="player-tile"
          class:active={state.currentTurnId === p.id && state.phase === 'playing'}
          class:eliminated={p.eliminated}
          class:disconnected={!p.connected}
        >
          <div class="player-head">
            <span class="player-name">{p.name}{p.isHost ? ' ★' : ''}</span>
            <span class="player-chips">{p.chips.toLocaleString()}</span>
          </div>
          <div class="player-dice-count">
            {#if p.eliminated}
              <span class="out-tag">OUT</span>
            {:else}
              {#each Array(p.diceCount) as _, i (i)}
                <span class="small-die">⚂</span>
              {/each}
              {#if p.diceCount === 0 && state.phase === 'lobby'}
                <span class="ready-tag">ready</span>
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </section>

    <!-- Phase: lobby -->
    {#if state.phase === 'lobby'}
      <section class="panel">
        <h2 class="panel-title">Lobby</h2>
        <p class="panel-hint">Waiting for players. Share code <strong>{state.code}</strong>.</p>

        {#if isHost}
          <div class="setting">
            <span class="setting-label">Mode</span>
            <div class="btn-group">
              <button class:selected={state.gameMode === 'casual'} onclick={() => setMode('casual')}>Casual</button>
              <button class:selected={state.gameMode === 'competitive'} onclick={() => setMode('competitive')}>Competitive</button>
            </div>
          </div>
          <div class="setting">
            <span class="setting-label">Ante</span>
            <div class="btn-group">
              {#each ANTE_OPTIONS as a (a)}
                <button class:selected={state.ante === a} onclick={() => setAnte(a)}>{a}</button>
              {/each}
            </div>
          </div>
          <div class="setting">
            <span class="setting-label">Wilds</span>
            <div class="btn-group">
              <button class:selected={!state.onesWild} onclick={() => setOnesWild(false)}>Off</button>
              <button class:selected={state.onesWild} onclick={() => setOnesWild(true)}>Ones wild</button>
            </div>
          </div>
          <div class="setting">
            <span class="setting-label">Bots</span>
            <div class="btn-group">
              <button
                onclick={addBot}
                disabled={state.players.length >= 6}
              >Add bot</button>
              <button onclick={removeBots}>Remove bots</button>
            </div>
          </div>
          <button
            class="btn-primary btn-full"
            disabled={state.players.length < 2}
            onclick={startGame}
          >
            {state.players.length < 2 ? 'Need 2+ players' : 'Start Game'}
          </button>
        {:else}
          <p class="panel-hint">Mode: <strong>{state.gameMode}</strong> / Ante: <strong>{state.ante}</strong> / Wilds: <strong>{state.onesWild ? 'on' : 'off'}</strong></p>
          <p class="panel-hint">Waiting for the host to start.</p>
        {/if}
      </section>
    {/if}

    <!-- Phase: playing -->
    {#if state.phase === 'playing'}
      <section class="panel">
        <div class="bid-display">
          {#if state.currentBid}
            <div class="bid-value">
              <span class="bid-count">{state.currentBid.count}</span>
              <span class="bid-x">×</span>
              <span class="bid-face">{dieFace(state.currentBid.face)}</span>
            </div>
            <div class="bid-by">bid by {bidderName}</div>
          {:else}
            <div class="bid-empty">No bid yet. {currentTurnName} opens.</div>
          {/if}
          <div class="turn-line">{isMyTurn ? 'Your turn' : `${currentTurnName}'s turn`} / {totalDice} dice on the table</div>
        </div>

        <!-- My dice -->
        <div class="my-dice">
          <span class="my-dice-label">Your dice</span>
          <div class="die-row">
            {#each state.myDice as d, i (i)}
              <span class="die">{dieFace(d)}</span>
            {/each}
            {#if state.myDice.length === 0}
              <span class="die-placeholder">No dice left</span>
            {/if}
          </div>
        </div>

        {#if isMyTurn && !me?.eliminated}
          <div class="bid-controls">
            <div class="control-row">
              <span class="control-label">Count</span>
              <div class="stepper">
                <button onclick={() => bumpCount(-1)} disabled={bidCount <= 1}>-</button>
                <span class="stepper-value">{bidCount}</span>
                <button onclick={() => bumpCount(1)} disabled={bidCount >= totalDice}>+</button>
              </div>
            </div>
            <div class="control-row">
              <span class="control-label">Face</span>
              <div class="face-picker">
                {#each [1,2,3,4,5,6] as f (f)}
                  <button
                    class:selected={bidFace === f}
                    onclick={() => bidFace = f}
                    disabled={state.currentBid ? f < state.currentBid.face : false}
                  >{dieFace(f)}</button>
                {/each}
              </div>
            </div>
            <div class="action-row">
              <button class="btn-primary btn-full" onclick={placeBid} disabled={!canPlaceBid()}>
                Bid {bidCount} {dieFace(bidFace)}
              </button>
              <button
                class="btn-danger btn-full"
                onclick={callLiar}
                disabled={!state.currentBid}
              >
                Call Liar
              </button>
            </div>
          </div>
        {/if}
      </section>
    {/if}

    <!-- Phase: round_over -->
    {#if state.phase === 'round_over' && state.lastRoundResult}
      <section class="panel">
        <h2 class="panel-title">Round Result</h2>
        <p class="result-line">
          <strong>{callerName}</strong> called liar on <strong>{prevBidderName}</strong>'s bid
          of <strong>{state.lastRoundResult.bid.count} {dieFace(state.lastRoundResult.bid.face)}</strong>
        </p>
        <p class="result-line">
          Actual count: <strong>{state.lastRoundResult.actualCount}</strong> / <strong>{loserName}</strong> loses a die
        </p>
        <div class="reveal-grid">
          {#each state.players as p (p.id)}
            {#if state.lastRoundResult && state.lastRoundResult.revealedDice[p.id]}
              <div class="reveal-row">
                <span class="reveal-name">{p.name}</span>
                <span class="reveal-dice">
                  {#each state.lastRoundResult.revealedDice[p.id] as d, i (i)}
                    <span
                      class="reveal-die"
                      class:match={d === state.lastRoundResult.bid.face}
                    >{dieFace(d)}</span>
                  {/each}
                </span>
              </div>
            {/if}
          {/each}
        </div>
        {#if isHost}
          <button class="btn-primary btn-full" onclick={nextRound}>Next Round</button>
        {:else}
          <p class="panel-hint">Waiting for host to start next round.</p>
        {/if}
      </section>
    {/if}

    <!-- Phase: game_over -->
    {#if state.phase === 'game_over'}
      <section class="panel">
        <h2 class="panel-title">Game Over</h2>
        {#if state.winnerId}
          <p class="result-line"><strong>{winnerName}</strong> wins <strong>{state.pot.toLocaleString()} chips</strong>!</p>
        {:else}
          <p class="result-line">No winner.</p>
        {/if}
        {#if isHost}
          <button class="btn-primary btn-full" onclick={newGame}>Play Again</button>
        {:else}
          <p class="panel-hint">Waiting for host to start a new game.</p>
        {/if}
      </section>
    {/if}

    <div class="footer">
      <button class="btn-ghost" onclick={() => goto('/liars-dice')}>Leave</button>
    </div>
  </div>
{:else if reconnecting}
  <div class="loading">Connecting...</div>
{/if}

<style>
  .game {
    max-width: 560px;
    margin: 0 auto;
    padding: 4rem 1rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .room-code {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .room-code strong {
    color: var(--accent);
    font-size: 1.1rem;
    letter-spacing: 0.3em;
    margin-left: 0.5rem;
  }

  .wild-badge {
    margin-left: 0.6rem;
    padding: 0.15rem 0.45rem;
    background: var(--accent-faint);
    color: var(--accent);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    border: 1px solid var(--accent-border);
  }

  .pot-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-family: 'Rajdhani', system-ui, sans-serif;
  }

  .pot-label {
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .pot-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent);
  }

  .players {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.5rem;
  }

  .player-tile {
    background: var(--bg-card);
    border: 1px solid var(--border);
    padding: 0.65rem 0.75rem;
    clip-path: var(--clip-card);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: border-color 0.15s, background 0.15s;
  }

  .player-tile.active {
    border-color: var(--accent);
    background: var(--accent-faint);
  }

  .player-tile.eliminated { opacity: 0.45; }
  .player-tile.disconnected { opacity: 0.6; }

  .player-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  .player-name {
    font-size: 0.85rem;
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .player-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    color: var(--accent-dim);
    letter-spacing: 0.08em;
  }

  .player-dice-count {
    display: flex;
    gap: 0.15rem;
    flex-wrap: wrap;
    min-height: 1.1rem;
  }

  .small-die {
    font-size: 0.95rem;
    color: var(--text-muted);
    line-height: 1;
  }

  .out-tag, .ready-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    padding: 1rem 1.1rem 1.2rem;
    clip-path: var(--clip-card);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .panel-title {
    margin: 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .panel-hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .panel-hint strong { color: var(--text); font-weight: 500; }

  .bid-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--border);
  }

  .bid-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 2rem;
    color: var(--accent);
    font-weight: 600;
  }

  .bid-count { font-family: 'Rajdhani', system-ui, sans-serif; }
  .bid-x { font-size: 1.2rem; color: var(--text-subtle); }
  .bid-face { font-size: 2.5rem; }

  .bid-by {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .bid-empty {
    font-size: 0.9rem;
    color: var(--text-muted);
    text-align: center;
  }

  .turn-line {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    margin-top: 0.1rem;
  }

  .my-dice {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .my-dice-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .die-row {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .die {
    font-size: 2.25rem;
    line-height: 1;
    color: var(--accent);
    background: var(--bg-input);
    padding: 0.25rem 0.45rem;
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .die-placeholder {
    font-size: 0.85rem;
    color: var(--text-subtle);
    font-style: italic;
  }

  .bid-controls {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .control-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .control-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
    min-width: 3rem;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stepper button {
    width: 2.25rem;
    height: 2.25rem;
    font-size: 1.1rem;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text);
    cursor: pointer;
  }

  .stepper button:disabled { opacity: 0.4; cursor: not-allowed; }

  .stepper-value {
    min-width: 2.25rem;
    text-align: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--accent);
  }

  .face-picker {
    display: flex;
    gap: 0.3rem;
  }

  .face-picker button {
    width: 2.3rem;
    height: 2.3rem;
    font-size: 1.25rem;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-muted);
    cursor: pointer;
    line-height: 1;
  }

  .face-picker button.selected,
  .btn-group button.selected {
    background: var(--accent-faint);
    border-color: var(--accent);
    color: var(--accent);
  }

  .btn-group {
    display: flex;
    gap: 0.3rem;
  }

  .btn-group button {
    flex: 1;
    padding: 0.55rem 0.5rem;
    font-size: 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-muted);
    cursor: pointer;
  }

  .setting {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .setting-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.2rem;
  }

  .btn-full { width: 100%; padding: 0.85rem 1rem; font-size: 0.95rem; }

  .btn-danger {
    background: #6b1f1f;
    color: #f5d2d2;
    border: 1px solid #8a3030;
    cursor: pointer;
  }

  .btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-danger:hover:not(:disabled) { filter: brightness(1.15); }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 0.55rem 1.1rem;
    font-size: 0.8rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
  }

  .result-line {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text);
    line-height: 1.5;
  }

  .result-line strong { color: var(--accent); font-weight: 600; }

  .reveal-grid {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .reveal-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .reveal-name {
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .reveal-dice {
    display: flex;
    gap: 0.25rem;
  }

  .reveal-die {
    font-size: 1.3rem;
    line-height: 1;
    color: var(--text-muted);
  }

  .reveal-die.match { color: var(--accent); }

  .footer {
    display: flex;
    justify-content: center;
    padding-top: 0.5rem;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 50vh;
    color: var(--text-muted);
    font-family: 'Rajdhani', system-ui, sans-serif;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
