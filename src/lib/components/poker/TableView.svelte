<script lang="ts">
  // @ts-nocheck
  import Card from '$lib/components/cards/Card.svelte';
  import PlayerSeat from '$lib/components/cards/PlayerSeat.svelte';
  import CommunityCards from '$lib/components/cards/CommunityCards.svelte';
  import HoleCards from '$lib/components/poker/HoleCards.svelte';
  import BetControls from '$lib/components/poker/BetControls.svelte';
  import BetPanel from '$lib/components/BetPanel.svelte';
  import { playerName, getBlindLabel } from '$lib/utils/pokerHelpers';

  let {
    state,
    pid,
    ts,
    isSpectator,
    isMyTurn,
    amIFolded,
    myHand,
    myHandName,
    myChips,
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
    inputMode,
    isArmed,
    showOwnHandAndActions,
    canCheck,
    callAmount,
    minRaise,
    maxRaise,
    onaction,
    onarmedchange,
    setMuckRef,
    isHost,
    onnextHand,
    onleaveGame,
    betPlayers,
    myUserId,
    code,
    myBet,
  }: {
    state: any;
    pid: string | null;
    ts: any;
    isSpectator: boolean;
    isMyTurn: boolean;
    amIFolded: boolean;
    myHand: { suit: string; rank: string }[];
    myHandName: string;
    myChips: number;
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
    inputMode: 'touch' | 'pointer';
    isArmed: boolean;
    showOwnHandAndActions: boolean;
    canCheck: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
    onaction: (a: any) => void;
    onarmedchange: (armed: boolean) => void;
    setMuckRef: (el: HTMLElement) => void;
    isHost: boolean;
    onnextHand: () => void;
    onleaveGame: () => void;
    betPlayers: any[];
    myUserId: string | null;
    code: string;
    myBet: number;
  } = $props();

  let opponents = $derived((state?.players ?? []).filter((p: any) => p.id !== pid));

  function seatTransform(opponentIndex: number, totalOpponents: number): string {
    const step = 360 / (totalOpponents + 1);
    const angleDeg = 90 + step * (opponentIndex + 1);
    const angleRad = (angleDeg * Math.PI) / 180;
    const rx = 42;
    const ry = 36;
    const x = 50 + rx * Math.cos(angleRad);
    const y = 50 + ry * Math.sin(angleRad);
    return `left: ${x}%; top: ${y}%; transform: translate(-50%, -50%);`;
  }

  let muckEl: HTMLElement | undefined = $state(undefined);
  $effect(() => {
    if (muckEl) setMuckRef(muckEl);
  });
</script>

<div class="table-view">
  {#if state?.phase === 'game_over'}
    <div class="game-over-panel">
      <h2 class="geo-title phase-title">Game Over</h2>
      {#each state.players as player}
        <div class="result-row" class:result-winner={playerChips[player.id] > 0}>
          <span class="result-name">{player.name}</span>
          <span class="result-chips">{playerChips[player.id] ?? 0} chips</span>
        </div>
      {/each}
      <button class="btn-primary" onclick={onleaveGame}>Back to Lobby</button>
    </div>
  {:else}
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

  <div class="felt-oval">
    <div class="seats-layer">
      {#each opponents as opp, i}
        <div class="seat-position" style={seatTransform(i, opponents.length)}>
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
        </div>
      {/each}
    </div>
    <div class="felt-center" bind:this={muckEl}>
      {#if totalPot > 0}
        <div class="pot-display">
          {#if pots.length <= 1}
            <span class="pot-total geo-title">Pot: {totalPot}</span>
          {:else}
            {#each pots as pot, i}
              <span class="pot-item geo-title">
                {i === 0 ? 'Main Pot' : `Side Pot ${i}`}: {pot.amount}
              </span>
            {/each}
          {/if}
        </div>
      {/if}
      <CommunityCards cards={communityCards} {bettingRound} />
    </div>
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

  {#if showOwnHandAndActions}
    <div class="hand-area">
      {#if myHandName}<div class="hand-name">{myHandName}</div>{/if}
      {#if myBet > 0}<div class="my-bet">Bet: {myBet}</div>{/if}
    </div>

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
  {/if}
  {/if}
</div>

<style>
  .table-view {
    width: 100%;
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  .felt-oval {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 10;
    min-height: 480px;
    border-radius: 50%;
    background: radial-gradient(ellipse at center, var(--felt-green-glow-25, rgba(108, 180, 130, 0.25)) 0%, transparent 70%);
    border: 2px solid rgba(108, 180, 130, 0.3);
  }

  .seats-layer {
    position: absolute;
    inset: 0;
  }

  .seat-position {
    position: absolute;
  }

  .felt-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .pot-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .pot-total {
    font-size: 1.1rem;
    letter-spacing: 0.1em;
    color: var(--yellow);
  }

  .pot-item {
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .turn-indicator {
    text-align: center;
    padding: 0.25rem;
  }

  .your-turn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .round-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--yellow);
  }

  .waiting-turn { font-size: 0.875rem; color: var(--text-muted); }

  .last-action { text-align: center; padding: 0.25rem; }
  .action-text { font-size: 0.8rem; color: var(--text-muted); font-style: italic; }

  .hand-area { display: flex; flex-direction: column; gap: 0.5rem; }
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
    gap: 0.75rem;
    justify-content: center;
  }

  .opponent-hand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .opponent-name { font-size: 0.75rem; color: var(--text-muted); font-weight: 600; }
  .opponent-cards { display: flex; gap: 0.25rem; }

  .winners-panel {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.75rem;
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

  .waiting-text { font-size: 0.875rem; color: var(--text-muted); text-align: center; }

  .armed-dimmed {
    opacity: 0.3;
    pointer-events: none;
    transition: opacity 120ms ease-out;
  }

  .game-over-panel {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0 auto;
    padding: 1rem;
    animation: fadeUp 0.3s ease both;
  }

  .phase-title {
    font-size: 1.25rem;
    letter-spacing: 0.12em;
    color: var(--accent);
    text-align: center;
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

  .my-bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--yellow);
    text-align: center;
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
</style>
