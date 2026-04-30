<script lang="ts">
  // @ts-nocheck
  import Card from '$lib/components/cards/Card.svelte';
  import PlayerSeat from '$lib/components/cards/PlayerSeat.svelte';
  import CommunityCards from '$lib/components/cards/CommunityCards.svelte';
  import HoleCards from '$lib/components/poker/HoleCards.svelte';
  import BetControls from '$lib/components/poker/BetControls.svelte';
  import BetPanel from '$lib/components/BetPanel.svelte';
  import PairButton from '$lib/components/pairing/PairButton.svelte';
  import { playerName, getBlindLabel } from '$lib/utils/pokerHelpers';

  let {
    state,
    pid,
    ts,
    isHost,
    isSpectator,
    isMyTurn,
    amIFolded,
    myHand,
    myHandName,
    myChips,
    myBet,
    bettingRound,
    communityCards,
    pots,
    totalPot,
    playerChips,
    playerBets,
    playerFolded,
    playerAllIn,
    playerHands,
    dealerId,
    sbPlayerId,
    bbPlayerId,
    winnersInfo,
    myCardBackStyle,
    canCheck,
    callAmount,
    minRaise,
    maxRaise,
    inputMode,
    isArmed,
    setMuckRef,
    blindSetting,
    gameMode,
    casualChipCount,
    addingBot,
    onaction,
    onarmedchange,
    onstartGame,
    onnextHand,
    onleaveGame,
    onaddBot,
    onremoveAllBots,
    onblindChange,
    ongameModeChange,
    oncasualChipCountChange,
    betPlayers,
    myUserId,
    code,
    socket,
    roleParam,
  }: {
    state: any;
    pid: string | null;
    ts: any;
    isHost: boolean;
    isSpectator: boolean;
    isMyTurn: boolean;
    amIFolded: boolean;
    myHand: { suit: string; rank: string }[];
    myHandName: string;
    myChips: number;
    myBet: number;
    bettingRound: string;
    communityCards: { suit: string; rank: string }[];
    pots: { amount: number; eligiblePlayerIds: string[] }[];
    totalPot: number;
    playerChips: Record<string, number>;
    playerBets: Record<string, number>;
    playerFolded: Record<string, boolean>;
    playerAllIn: Record<string, boolean>;
    playerHands: Record<string, { suit: string; rank: string }[] | null>;
    dealerId: string | null;
    sbPlayerId: string | null;
    bbPlayerId: string | null;
    winnersInfo: any;
    myCardBackStyle: any;
    canCheck: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
    inputMode: 'touch' | 'pointer';
    isArmed: boolean;
    setMuckRef: (el: HTMLElement) => void;
    blindSetting: number;
    gameMode: 'casual' | 'competitive';
    casualChipCount: number;
    addingBot: boolean;
    onaction: (a: any) => void;
    onarmedchange: (armed: boolean) => void;
    onstartGame: () => void;
    onnextHand: () => void;
    onleaveGame: () => void;
    onaddBot: () => void;
    onremoveAllBots: () => void;
    onblindChange: (v: number) => void;
    ongameModeChange: (v: 'casual' | 'competitive') => void;
    oncasualChipCountChange: (v: number) => void;
    betPlayers: any[];
    myUserId: string | null;
    code: string;
    socket: any;
    roleParam: string | null;
  } = $props();

  let opponents = $derived((state?.players ?? []).filter((p: any) => p.id !== pid));
  let muckEl: HTMLElement | undefined = $state(undefined);
  $effect(() => {
    if (muckEl) setMuckRef(muckEl);
  });
</script>

<div class="mobile-poker-view">
  {#if !state}
    <div class="loading"><p>Connecting...</p></div>
  {:else if state.phase === 'lobby'}
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
          <label class="field-label" for="blind-select-m">Big Blind</label>
          <select id="blind-select-m" value={blindSetting} onchange={(e) => onblindChange(Number((e.target as HTMLSelectElement).value))}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div class="mode-selector">
          <label class="field-label">Game Mode</label>
          <div class="mode-toggle">
            <button class="mode-btn" class:active={gameMode === 'casual'} onclick={() => ongameModeChange('casual')}>Casual</button>
            <button class="mode-btn" class:active={gameMode === 'competitive'} onclick={() => ongameModeChange('competitive')}>Competitive</button>
          </div>
        </div>
        {#if gameMode === 'casual'}
          <div class="chip-config">
            <label class="field-label" for="chip-select-m">Starting Chips</label>
            <select id="chip-select-m" class="input-field" value={casualChipCount} onchange={(e) => oncasualChipCountChange(Number((e.target as HTMLSelectElement).value))}>
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
        <button class="btn-primary" onclick={onstartGame} disabled={state.players.length < 2}>Start Game</button>
        <div class="bot-controls">
          <button class="btn-secondary btn-sm" onclick={onaddBot} disabled={state.players.length >= 8 || addingBot}>
            {addingBot ? 'Adding...' : 'Add Bot'}
          </button>
          {#if state.players.some((p: any) => p.isBot)}
            <button class="btn-secondary btn-sm btn-danger" onclick={onremoveAllBots}>Remove All Bots</button>
          {/if}
        </div>
      {:else}
        <p class="waiting-text">Waiting for host to start...</p>
      {/if}
      {#if pid && roleParam !== 'controller' && roleParam !== 'table'}
        <PairButton roomCode={code} playerId={pid} phase={state.phase} {socket} />
      {/if}
      <button class="btn-secondary" onclick={onleaveGame}>Leave</button>
    </div>

  {:else if state.phase === 'playing' || state.phase === 'round_over'}
    <div class="play-stack">
      {#if isSpectator}
        <div class="spectator-banner">Spectating</div>
        <BetPanel
          roomCode={code}
          game="poker"
          players={betPlayers}
          isSpectator={isSpectator}
          isGameEnded={bettingRound === 'showdown'}
          myUserId={myUserId}
        />
      {/if}

      <div class="opponents-row">
        {#each opponents as opp}
          <PlayerSeat
            name={opp.name}
            cardCount={opp.cardCount}
            active={ts?.actionOnPlayerId === opp.id}
            connected={opp.connected}
            chipCount={playerChips[opp.id]}
            currentBet={playerBets[opp.id]}
            dealerBadge={dealerId === opp.id}
            blindLabel={getBlindLabel(opp.id, sbPlayerId, bbPlayerId)}
            folded={playerFolded[opp.id] ?? false}
            allIn={playerAllIn[opp.id] ?? false}
            cardBackStyle={myCardBackStyle}
            frameSvg={opp.frameSvg}
            emblemSvg={opp.emblemSvg}
            nameColour={opp.nameColour}
            isBot={opp.isBot}
          />
        {/each}
      </div>

      <div class="middle-section" bind:this={muckEl}>
        {#if totalPot > 0}
          <div class="pot-hud">
            {#if pots.length <= 1}
              <span>Pot: {totalPot}</span>
            {:else}
              {#each pots as pot, i}
                <span class="pot-line">{i === 0 ? 'Main Pot' : `Side Pot ${i}`}: {pot.amount}</span>
              {/each}
            {/if}
          </div>
        {/if}
        <CommunityCards cards={communityCards} {bettingRound} />
      </div>

      <div class="turn-indicator">
        {#if bettingRound === 'showdown'}
          <span class="round-label">Showdown</span>
        {:else if isMyTurn && !amIFolded}
          <span class="your-turn">Your turn!</span>
        {:else if amIFolded}
          <span class="waiting-turn">You folded this hand</span>
        {:else if ts?.actionOnPlayerId}
          <span class="waiting-turn">Waiting for {playerName(ts.actionOnPlayerId, state?.players)}...</span>
        {:else}
          <span class="waiting-turn">Waiting...</span>
        {/if}
      </div>

      {#if ts?.lastAction}
        <div class="last-action fade-in">
          <span class="action-text">
            {playerName(ts.lastAction.playerId, state?.players)}
            {#if ts.lastAction.action === 'fold'}folded
            {:else if ts.lastAction.action === 'check'}checked
            {:else if ts.lastAction.action === 'call'}called {ts.lastAction.amount ?? ''}
            {:else if ts.lastAction.action === 'raise'}raised to {ts.lastAction.amount ?? ''}
            {:else if ts.lastAction.action === 'all_in'}went all in ({ts.lastAction.amount ?? ''})
            {/if}
          </span>
        </div>
      {/if}

      {#if myHandName}<div class="hand-name">{myHandName}</div>{/if}

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

      {#if winnersInfo && winnersInfo.length > 0}
        <div class="winners-panel fade-in">
          {#each winnersInfo as winner}
            <div class="winner-row">
              <span class="winner-name">{playerName(winner.playerId, state?.players)}</span>
              <span class="winner-amount">wins {winner.amount}</span>
              {#if winner.hand}<span class="winner-hand">with {winner.hand}</span>{/if}
            </div>
          {/each}
        </div>
        {#if isHost}
          <div class="action-bar">
            <button class="btn-primary" onclick={onnextHand}>Next Hand</button>
          </div>
        {:else}
          <p class="waiting-text">Waiting for host to deal next hand...</p>
        {/if}
      {/if}

      <HoleCards
        cards={myHand}
        isPlayerTurn={isMyTurn}
        gameState={amIFolded ? 'folded' : (bettingRound === 'showdown' ? 'showdown' : (myHand.length === 0 ? 'pre-deal' : 'in-hand'))}
        {inputMode}
        muckTarget={muckEl ? { kind: 'element', ref: muckEl } : { kind: 'offscreen-top' }}
        onaction={onaction}
        onarmedchange={onarmedchange}
      />

      {#if isMyTurn && !amIFolded && bettingRound !== 'showdown'}
        <div class:armed-dimmed={isArmed}>
          <BetControls
            {canCheck}
            {callAmount}
            {minRaise}
            {maxRaise}
            playerChips={myChips}
            disabled={false}
            onaction={onaction}
          />
        </div>
      {/if}
    </div>

  {:else if state.phase === 'game_over'}
    <div class="phase-panel">
      <h2 class="geo-title phase-title">Game Over</h2>
      {#each state.players as player}
        <div class="result-row" class:result-winner={playerChips[player.id] > 0}>
          <span class="result-name">{player.name}</span>
          <span class="result-chips">{playerChips[player.id] ?? 0} chips</span>
        </div>
      {/each}
      <button class="btn-primary" onclick={onleaveGame}>Back to Lobby</button>
    </div>
  {/if}
</div>

<style>
  .mobile-poker-view {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    width: 100%;
    max-width: 500px;
    margin: 0 auto;
    padding: 0.5rem;
    gap: 0.5rem;
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

  .play-stack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .opponents-row {
    display: flex;
    gap: 0.375rem;
    overflow-x: auto;
    padding: 0.25rem;
    scroll-snap-type: x mandatory;
  }

  .opponents-row :global(.seat) {
    min-width: 68px;
    padding: 0.3rem 0.4rem;
  }

  .middle-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 120px;
  }

  .pot-hud {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--yellow);
    padding: 0.25rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .pot-line {
    font-size: 0.85rem;
    color: var(--text-muted);
    letter-spacing: 0.08em;
  }
  .pot-line:first-child { color: var(--yellow); font-size: 1rem; }

  .turn-indicator { text-align: center; padding: 0.25rem; }

  .your-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .round-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--yellow);
  }

  .waiting-turn { font-size: 0.85rem; color: var(--text-muted); }

  .last-action { text-align: center; padding: 0.2rem; }
  .action-text { font-size: 0.75rem; color: var(--text-muted); font-style: italic; }

  .hand-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent);
    text-align: center;
  }

  .showdown-hands {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
  }

  .opponent-hand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.4rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .opponent-name { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; }
  .opponent-cards { display: flex; gap: 0.25rem; }

  .winners-panel {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.6rem;
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

  .winner-name { font-size: 0.95rem; font-weight: 700; color: var(--accent); }
  .winner-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--yellow);
  }
  .winner-hand { font-size: 0.8rem; color: var(--text-muted); }

  .action-bar { display: flex; gap: 0.5rem; justify-content: center; }
  .action-bar .btn-primary { flex: 1; max-width: 200px; }

  .waiting-text { font-size: 0.85rem; color: var(--text-muted); text-align: center; }

  .armed-dimmed {
    opacity: 0.3;
    pointer-events: none;
    transition: opacity 120ms ease-out;
  }

  /* Lobby pieces */
  .player-list { display: flex; flex-direction: column; gap: 0.375rem; }
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
  .player-name { flex: 1; font-size: 0.9rem; color: var(--text); }

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
  .owner-crown { font-size: 0.85rem; margin-left: -0.25rem; }
  .dc-badge { background: var(--bg-input); color: var(--text-subtle); }
  .bot-badge { background: rgba(155, 89, 182, 0.15); color: #9b59b6; }

  .player-count { font-size: 0.85rem; color: var(--text-muted); text-align: center; }

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

  .mode-selector { display: flex; flex-direction: column; gap: 0.375rem; }
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
  }
  .mode-btn.active { background: var(--accent-faint); color: var(--accent); }

  .chip-config { display: flex; flex-direction: column; gap: 0.25rem; }
  .competitive-note { font-size: 0.8rem; color: var(--text-muted); text-align: center; }

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

  .result-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .result-row.result-winner {
    background: rgba(108, 180, 130, 0.1);
    border-color: rgba(108, 180, 130, 0.4);
    box-shadow: 0 0 16px rgba(108, 180, 130, 0.15);
  }

  .result-name { flex: 1; font-size: 1rem; color: var(--text); }
  .result-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--accent);
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
  }

  .waiting-text { font-size: 0.85rem; color: var(--text-muted); text-align: center; }
</style>
