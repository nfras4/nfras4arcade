<script lang="ts">
  // @ts-nocheck
  import HoleCards from '$lib/components/poker/HoleCards.svelte';
  import BetControls from '$lib/components/poker/BetControls.svelte';

  let {
    state,
    pid,
    myHand,
    isMyTurn,
    amIFolded,
    bettingRound,
    myChips,
    myBet,
    myHandName,
    inputMode,
    canCheck,
    callAmount,
    minRaise,
    maxRaise,
    isArmed,
    playerChips,
    winnersInfo,
    onaction,
    onarmedchange,
    onleaveGame,
  }: {
    state: any;
    pid: string | null;
    myHand: { suit: string; rank: string }[];
    isMyTurn: boolean;
    amIFolded: boolean;
    bettingRound: string;
    myChips: number;
    myBet: number;
    myHandName: string;
    inputMode: 'touch' | 'pointer';
    canCheck: boolean;
    callAmount: number;
    minRaise: number;
    maxRaise: number;
    isArmed: boolean;
    playerChips: Record<string, number>;
    winnersInfo: any;
    onaction: (action: { type: string; amount?: number }) => void;
    onarmedchange: (armed: boolean) => void;
    onleaveGame: () => void;
  } = $props();
</script>

<div class="controller-view">
  {#if state?.phase === 'game_over'}
    <div class="game-over-mini">
      <h2 class="geo-title go-title">Hand Over</h2>
      {#if winnersInfo && winnersInfo.length > 0}
        {#each winnersInfo as w}
          <div class="go-winner">{(state?.players ?? []).find((p: any) => p.id === w.playerId)?.name ?? 'Winner'} wins {w.amount}</div>
        {/each}
      {/if}
      <div class="go-chips">Your chips: {playerChips?.[pid ?? ''] ?? myChips}</div>
      <button class="btn-primary" onclick={onleaveGame}>Back to Lobby</button>
    </div>
  {:else}
    <div class="chip-strip">
      <span class="chip-count">{myChips} chips</span>
      {#if myBet > 0}<span class="bet">Bet: {myBet}</span>{/if}
      {#if myHandName}<span class="hand-name">{myHandName}</span>{/if}
    </div>

    <HoleCards
      cards={myHand}
      isPlayerTurn={isMyTurn}
      gameState={amIFolded ? 'folded' : (bettingRound === 'showdown' ? 'showdown' : (myHand.length === 0 ? 'pre-deal' : 'in-hand'))}
      {inputMode}
      muckTarget={{ kind: 'offscreen-top' }}
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
</div>

<style>
  .controller-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 500px;
    min-height: 100dvh;
    padding: 1rem 0.5rem max(2rem, env(safe-area-inset-bottom, 2rem));
    margin: 0 auto;
  }

  .chip-strip {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    width: 100%;
  }

  .chip-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.06em;
  }

  .bet {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--yellow);
  }

  .hand-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.06em;
  }

  .armed-dimmed {
    opacity: 0.3;
    pointer-events: none;
    transition: opacity 120ms ease-out;
  }

  .game-over-mini {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    padding: 1rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    align-items: center;
  }

  .go-title {
    font-size: 1.1rem;
    letter-spacing: 0.12em;
    color: var(--accent);
    text-align: center;
  }

  .go-winner {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--yellow);
    text-align: center;
  }

  .go-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.9rem;
    color: var(--text-muted);
    text-align: center;
  }
</style>
