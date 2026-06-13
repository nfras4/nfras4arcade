<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { CardGameSocket } from '$lib/cardSocket';
  import { dispatchRelayMessages } from '$lib/levelUpDispatch';
  import { writable } from 'svelte/store';
  import { currentUser } from '$lib/auth';
  import NameFrame from '$lib/components/NameFrame.svelte';
  import QRDisplay from '$lib/components/pairing/QRDisplay.svelte';
  import FloatUp from '$lib/vfx/FloatUp.svelte';
  import Shockwave from '$lib/vfx/Shockwave.svelte';
  import { fireGoldBurst, fireLoss } from '$lib/vfx/burst';
  import { createShakeDetector } from '$lib/table3d/shake.js';
  import type { Component } from 'svelte';
  import type { LDStateLike } from '$lib/table3d/core/types.js';
  import type { EmoteId } from '$lib/table3d/core/emotes.js';
  import type { LayerHandle } from '$lib/table3d/LiarsDiceTableLayer.svelte';

  const code = $page.params.code!;
  const socket = new CardGameSocket('/ws/liars-dice');

  // ── TV mode detection ──────────────────────────────────────────────────────
  // role=table in the URL query indicates a display-only TV view.
  const isTv = $page.url.searchParams.get('role') === 'table';

  // ── Table view toggle ──────────────────────────────────────────────────────
  // localStorage key 'ld-table-view': '1' = on, '0' = off.
  // Default on first visit: on when viewport >= 900px AND WebGL available.
  // A stored key always wins over the default.
  // TV mode (isTv=true) always uses table view when WebGL is available.
  const TABLE_VIEW_KEY = 'ld-table-view';

  function probeWebGL(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  function resolveTableViewDefault(): boolean {
    if (isTv) {
      // TV mode: always on if WebGL available
      return probeWebGL();
    }
    if (typeof localStorage === 'undefined') return false;
    const stored = localStorage.getItem(TABLE_VIEW_KEY);
    if (stored !== null) return stored === '1';
    // First visit: on when wide viewport AND WebGL available
    return window.innerWidth >= 900 && probeWebGL();
  }

  let tableView = $state(resolveTableViewDefault());

  // ── Phone controller view ──────────────────────────────────────────────────
  // When tablePresent=true, default to controller view (no 3D stage).
  // Controlled by localStorage key 'ld-controller-view': '1' = on (default when tablePresent), '0' = off.
  const CONTROLLER_VIEW_KEY = 'ld-controller-view';

  let useControllerView = $state(false);
  // Tracks whether the default has been resolved for the current tablePresent=true session.
  // Reset when tablePresent goes false so a new TV appearing later re-resolves.
  let controllerViewResolved = false;

  // Write-back: persist whenever tableView changes (except in TV mode)
  $effect(() => {
    if (!isTv && typeof localStorage !== 'undefined') {
      localStorage.setItem(TABLE_VIEW_KEY, tableView ? '1' : '0');
    }
  });

  // ── Lazy layer import (only when table view is active) ─────────────────────
  type LayerProps = {
    state: LDStateLike;
    onemote?: (emoteId: EmoteId) => void;
    onready?: (handle: LayerHandle) => void;
  };
  // $state.raw: prevents Svelte deep-clone/snapshot on Component constructor.
  let LayerComp = $state.raw<Component<LayerProps> | null>(null);
  let layerHandle: LayerHandle | null = null;
  let layerLoadError = $state<string | null>(null);

  $effect(() => {
    if (!tableView) return; // only load when view is active
    if (LayerComp) return;  // already loaded
    import('$lib/table3d/LiarsDiceTableLayer.svelte')
      .then((mod) => { LayerComp = mod.default as Component<LayerProps>; })
      .catch((err) => { layerLoadError = String(err); });
  });

  function handleLayerReady(handle: LayerHandle): void {
    layerHandle = handle;
  }

  function handleLayerEmote(emoteId: EmoteId): void {
    socket.send({ type: 'emote', emoteId });
  }

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
    frameSvg?: string | null;
    emblemSvg?: string | null;
    nameColour?: string | null;
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
    tablePresent?: boolean;
  }

  const gameState = writable<LDState | null>(null);
  const myPlayerId = writable<string | null>(null);
  const errorMsg = writable<string | null>(null);

  // ── Controller view initialization ─────────────────────────────────────────
  // Resolves the default exactly once per tablePresent=true session.
  // After that, only the toggle (which also writes localStorage) changes useControllerView.
  // When tablePresent goes false, both state and the resolved flag are reset.
  // The TV view (role=table) NEVER enters controller layout: it is a display.
  $effect(() => {
    if (isTv) return;
    const s = $gameState;
    if (!s) return;
    const tp = s.tablePresent ?? false;
    if (!tp) {
      // TV left (or never appeared): reset so the next TV arrival re-resolves.
      useControllerView = false;
      controllerViewResolved = false;
      return;
    }
    // Already resolved for this tablePresent=true session; don't stomp in-session toggles.
    if (controllerViewResolved) return;
    // Only seated players can use controller view; spectators/TV sockets skip.
    const isSeatedPlayer = pid && s.players.some((p) => p.id === pid);
    if (!isSeatedPlayer) return;
    // Resolve once: stored key wins; no stored key defaults to on.
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(CONTROLLER_VIEW_KEY) : null;
    useControllerView = stored !== null ? stored === '1' : true;
    controllerViewResolved = true;
  });

  let reconnecting = $state(true);
  let bidCount = $state(1);
  let bidFace = $state(2);
  let errorTimeout: ReturnType<typeof setTimeout>;

  const ANTE_OPTIONS = [25, 50, 100, 250];

  // ── Shake detector state ───────────────────────────────────────────────────
  let dicePending = $state(false);
  let shakePermission = $state<'unknown' | 'granted' | 'denied' | 'unsupported' | 'not-required'>('unknown');
  let dealCounter = $state(0);
  let prevDealPhase = '';
  let shakeDetector: ReturnType<typeof createShakeDetector> | null = null;

  // ── VFX state ──────────────────────────────────────────────────────────────
  // bid pop re-trigger
  let bidKey = $state(0);
  let prevBidSig = '';

  // pot float-up
  let potFloats = $state<number[]>([]);
  let prevPot = 0;

  // round_over orchestration
  let roundOverKey = $state(0);          // re-keys the entire round_over section to replay tumble
  let showLiarStamp = $state(false);     // LIAR! overlay
  let liarStampKey = $state(0);          // re-trigger slam-in
  let panelShakeKey = $state(0);         // shake the result panel
  let matchIgniteKey = $state(0);        // re-trigger match gold pop sequence
  let matchIgniteDelay = $state(false);  // true after tumble settles (~820ms)
  let loserFlashKey = $state(0);         // flash loser tile red
  let callerWrongFlashKey = $state(0);   // flash caller tile green (if caller was wrong)
  let prevLoserId = '';
  let prevCallerId = '';

  // pot ring
  let potRingTrigger = $state(0);

  // game_over
  let gameOverKey = $state(0);
  let prevPhase = '';
  let prevWinnerId = '';

  // eliminated tile dissolve keys: map playerId -> dissolve epoch
  let dissolveKeys = $state<Record<string, number>>({});
  let prevEliminated: Record<string, boolean> = {};

  // cleanup handles
  let liarStampTimer: ReturnType<typeof setTimeout>;
  let matchIgniteTimer: ReturnType<typeof setTimeout>;
  let gameOverBurstTimer: ReturnType<typeof setTimeout>;

  // ── VFX effects ────────────────────────────────────────────────────────────

  // Bid change: pop-in the bid chip + ring on pot if pot grew
  $effect(() => {
    const s = $gameState;
    if (!s) return;
    const sig = s.currentBid ? `${s.currentBid.count}:${s.currentBid.face}` : '';
    if (sig !== prevBidSig) {
      prevBidSig = sig;
      if (sig) bidKey++;
    }
    // Pot growth
    const newPot = s.pot;
    if (newPot > prevPot && prevPot !== 0) {
      const diff = newPot - prevPot;
      potFloats = [...potFloats, Date.now()];
      potRingTrigger++;
      // FloatUp text injected via derived below
      potFloatText = `+${diff.toLocaleString()}`;
    }
    prevPot = newPot;
  });

  let potFloatText = $state('+0');

  // Round over: LIAR stamp + shake + tumble key + match ignite sequence
  $effect(() => {
    const s = $gameState;
    if (!s) return;
    const phase = s.phase;
    const loserId = s.lastRoundResult?.loserId ?? '';
    const callerId = s.lastRoundResult?.callerId ?? '';

    if (phase === 'round_over' && prevPhase !== 'round_over') {
      // 1. LIAR stamp
      liarStampKey++;
      showLiarStamp = true;
      clearTimeout(liarStampTimer);
      liarStampTimer = setTimeout(() => { showLiarStamp = false; }, 1100);

      // 2. Shake panel
      panelShakeKey++;

      // 3. Re-key the reveal grid so dice re-tumble
      roundOverKey++;

      // 4. After tumble settles, ignite matching dice
      clearTimeout(matchIgniteTimer);
      matchIgniteDelay = false;
      matchIgniteTimer = setTimeout(() => {
        matchIgniteDelay = true;
        matchIgniteKey++;
      }, 820);

      // 5. Flash loser tile
      if (loserId) {
        prevLoserId = loserId;
        loserFlashKey++;
        // fireLoss puff near center
        fireLoss({ x: 0.5, y: 0.55 });
      }

      // 6. Did caller guess wrong? The caller loses a die when they were wrong (loserId === callerId)
      //    Honest bid: loserId === callerId (caller was wrong, their die is lost)
      //    Caught bluffing: loserId === bidderId (bidder was the liar)
      if (callerId && loserId === callerId) {
        // caller guessed wrong - flash caller tile green? No: caller is the loser here.
        // Actually: loserId === callerId means the bid WAS covered, caller was wrong. Caller loses die.
        // The "green" goes to the bidder (honest bidder vindicated).
        callerWrongFlashKey++;
      }
    }

    prevPhase = phase;
  });

  // Game over: fire gold burst + sparkle
  $effect(() => {
    const s = $gameState;
    if (!s) return;
    if (s.phase === 'game_over' && s.winnerId && s.winnerId !== prevWinnerId) {
      prevWinnerId = s.winnerId;
      gameOverKey++;
      fireGoldBurst({ x: 0.5, y: 0.4 });
      clearTimeout(gameOverBurstTimer);
      gameOverBurstTimer = setTimeout(() => fireGoldBurst({ x: 0.5, y: 0.6 }), 350);
    }
    return () => { clearTimeout(gameOverBurstTimer); };
  });

  // Eliminated: detect newly eliminated players and trigger dissolve
  $effect(() => {
    const s = $gameState;
    if (!s) return;
    const next: Record<string, boolean> = {};
    for (const p of s.players) {
      next[p.id] = p.eliminated;
      if (p.eliminated && !prevEliminated[p.id]) {
        dissolveKeys = { ...dissolveKeys, [p.id]: Date.now() };
      }
    }
    prevEliminated = next;
  });

  // Deal detection: increment dealCounter on every lobby/round_over -> playing transition.
  // Using a counter (not a signature) means dice-count stability across rounds is not a problem.
  $effect(() => {
    const s = $gameState;
    if (!s) return;
    if (s.phase === 'playing' && prevDealPhase !== 'playing') {
      if (s.myDice.length > 0) {
        dealCounter++;
        dicePending = true;
      }
    }
    prevDealPhase = s.phase;
  });

  // Shake detector lifecycle — explicit state machine, no cleanup closure.
  // Branch order: controller off → denied/unsupported → unknown → granted/not-required.
  $effect(() => {
    if (!useControllerView) {
      if (shakeDetector) { shakeDetector.stop(); shakeDetector = null; }
      return;
    }
    if (shakePermission === 'denied' || shakePermission === 'unsupported') {
      if (shakeDetector) { shakeDetector.stop(); shakeDetector = null; }
      return;
    }
    // Ensure a detector instance exists for all remaining states.
    if (!shakeDetector) {
      shakeDetector = createShakeDetector({ onShake: () => { dicePending = false; } });
    }
    if (shakePermission === 'granted' || shakePermission === 'not-required') {
      shakeDetector.start();
    }
    // 'unknown': detector created but not started — requestPermission() is reachable.
  });

  // ── Game logic ─────────────────────────────────────────────────────────────

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
      } else if (msg.type === 'player_emote') {
        layerHandle?.handleRemoteEmote(msg.playerId, msg.emoteId);
      }
      dispatchRelayMessages(msg);
    });

    socket.connect(code, undefined, isTv ? 'table' : undefined)
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
      // Clamp a stale count when totalDice shrank between rounds; otherwise
      // the opener can be left with no legal action (count stuck above the
      // ceiling, raise disabled, nothing to call liar on).
      const ceiling = s.players.reduce((sum, p) => sum + (p.eliminated ? 0 : p.diceCount), 0);
      if (ceiling > 0 && bidCount > ceiling) bidCount = ceiling;
    }
  });

  // Cleanup timers on destroy
  $effect(() => {
    return () => {
      clearTimeout(liarStampTimer);
      clearTimeout(matchIgniteTimer);
    };
  });

  let state = $derived($gameState);
  let pid = $derived($myPlayerId);
  let tablePresent = $derived(state?.tablePresent ?? false);

  // ── LDStateLike mapping for the table layer ────────────────────────────────
  // Maps the page's LDState + myPlayerId into the engine-agnostic LDStateLike
  // shape consumed by LiarsDiceTableLayer. Players are mapped to PlayerViewLike
  // (nameColour is not in PlayerView; pass null so the layer uses its default).
  let ldStateLike = $derived<LDStateLike | null>(
    state
      ? {
          phase: state.phase,
          players: state.players.map((p) => ({
            id: p.id,
            name: p.name,
            connected: p.connected,
            isBot: p.isBot,
            diceCount: p.diceCount,
            eliminated: p.eliminated,
            chips: p.chips,
            nameColour: p.nameColour ?? null,
          })),
          myId: pid ?? '',
          currentTurnId: state.currentTurnId,
          currentBid: state.currentBid,
          lastRoundResult: state.lastRoundResult,
          onesWild: state.onesWild,
          pot: state.pot,
          turnOrder: state.turnOrder,
        }
      : null
  );
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

  // VFX derived: which player tile gets which flash
  let loserPlayerId = $derived(state?.lastRoundResult?.loserId ?? '');
  let callerPlayerId = $derived(state?.lastRoundResult?.callerId ?? '');
  // caller-was-wrong means loserId === callerId
  let callerWasWrong = $derived(
    state?.lastRoundResult != null &&
    state.lastRoundResult.loserId === state.lastRoundResult.callerId
  );

  function toggleControllerView(): void {
    const next = !useControllerView;
    useControllerView = next;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CONTROLLER_VIEW_KEY, next ? '1' : '0');
    }
  }

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
    dicePending = false;
    socket.send({ type: 'place_bid', count: bidCount, face: bidFace });
  }

  function callLiar() {
    if (!state?.currentBid || !isMyTurn) return;
    dicePending = false;
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
    if (next < 1) return;
    // Increments respect the ceiling; decrements are always allowed so a
    // stale count above a shrunken totalDice can step back into range.
    if (delta > 0 && next > totalDice) return;
    bidCount = next;
  }

  function dieFace(n: number): string {
    const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return faces[n] ?? String(n);
  }

  let tableFeltHex = $derived($currentUser?.tableFelt?.hex ?? null);
  let tableFeltStyle = $derived(tableFeltHex ? `--table-felt-bg: ${tableFeltHex};` : '');

  // ── TV cast URL ────────────────────────────────────────────────────────────
  // Generate the room URL with role=table query param for TV casting.
  let tvCastUrl = $derived(
    typeof window !== 'undefined'
      ? `${window.location.origin}/liars-dice/${code}?role=table`
      : ''
  );
</script>

{#if $errorMsg}
  <div class="error-toast">{$errorMsg}</div>
{/if}

{#if state}
  <div class="game" class:table-mode={tableView} class:tv-mode={isTv} class:controller-mode={useControllerView} style={tableFeltStyle}>
    <!-- 3D stage band: only rendered in table view; fully unmounted otherwise (no hidden canvas burning frames) -->
    {#if (tableView || isTv) && ldStateLike && !useControllerView}
      <div class="stage-band">
        {#if LayerComp}
          <LayerComp
            state={ldStateLike}
            onemote={handleLayerEmote}
            onready={handleLayerReady}
            fullTable={isTv}
            showEmoteStrip={!isTv}
          />
        {:else if layerLoadError}
          <p class="stage-error">{layerLoadError}</p>
        {:else}
          <p class="stage-loading">Loading 3D scene...</p>
        {/if}
      </div>

      <!-- TV lower third: current bid and turn info -->
      {#if isTv}
        <div class="tv-lower-third">
          {#if state.phase === 'playing' && state.currentBid}
            <div class="tv-lower-text">
              <span class="bid-label">Bid:</span> {state.currentBid.count} {dieFace(state.currentBid.face)} by {bidderName}
            </div>
            <div class="tv-lower-turn">
              {currentTurnName} to act
            </div>
          {/if}
        </div>
      {/if}
    {/if}

    <div class="table-rail">
    {#if !isTv}
    <header class="header">
      <div class="room-code">
        Room <strong>{state.code}</strong>
        {#if state.onesWild}
          <span class="wild-badge" title="Ones count as wild faces">WILDS</span>
        {/if}
      </div>
      <div class="pot-chip" style="position:relative">
        {#each potFloats as id (id)}
          <FloatUp text={potFloatText} color="var(--accent)" />
        {/each}
        <Shockwave trigger={potRingTrigger} color="var(--accent)" size={80} />
        {#key potRingTrigger}
          {#if potRingTrigger > 0}
            <span class="pot-value-wrap vfx-flash-gold">
              <span class="pot-label">Pot</span>
              <span class="pot-value">{state.pot.toLocaleString()} chips</span>
            </span>
          {:else}
            <span class="pot-value-wrap">
              <span class="pot-label">Pot</span>
              <span class="pot-value">{state.pot.toLocaleString()} chips</span>
            </span>
          {/if}
        {/key}
      </div>
      <button
        class="btn-view-toggle"
        onclick={() => { tableView = !tableView; }}
        aria-pressed={tableView}
        title={tableView ? 'Switch to classic view' : 'Switch to table view'}
      >
        {tableView ? 'Classic view' : 'Table view'}
      </button>
      {#if tablePresent}
        <button
          class="btn-view-toggle"
          onclick={toggleControllerView}
          aria-pressed={useControllerView}
          title={useControllerView ? 'Switch to full view' : 'Switch to controller view'}
        >
          {useControllerView ? 'Full view' : 'Controller view'}
        </button>
      {/if}
    </header>
    {/if}

    <!-- Player table: hidden in table view and TV mode (monkeys + nameplates replace it) -->
    {#if !useControllerView}
    <section class="players">
      {#each state.players as p (p.id)}
        {#key loserFlashKey}
          <div
            class="player-tile"
            class:active={state.currentTurnId === p.id && state.phase === 'playing'}
            aria-current={(state.currentTurnId === p.id && state.phase === 'playing') ? 'true' : 'false'}
            class:eliminated={p.eliminated}
            class:disconnected={!p.connected}
            class:vfx-flash-red={state.phase === 'round_over' && p.id === loserPlayerId}
            class:vfx-flash-green={state.phase === 'round_over' && callerWasWrong && p.id === state.lastRoundResult?.bid.bidderId}
            class:vfx-shake={state.phase === 'round_over' && p.id === loserPlayerId}
          >
            <div class="player-head">
              <NameFrame name={p.name} frameSvg={p.frameSvg} emblemSvg={p.emblemSvg} nameColour={p.nameColour} titleText={null} isHost={p.isHost} isBot={p.isBot} />
              <span class="player-chips">{p.chips.toLocaleString()}</span>
            </div>
            <div class="player-dice-count">
              {#if p.eliminated}
                {#key dissolveKeys[p.id]}
                  <span class="out-tag" class:vfx-dissolve-out={!!dissolveKeys[p.id]}>OUT</span>
                {/key}
              {:else}
                {#each Array(p.diceCount) as _, i (i)}
                  <!-- TODO: card back on hidden cups -- deferred, see deep-interview-nameframe-rollout.md ADR-3 -->
                  <span class="small-die">⚂</span>
                {/each}
                {#if p.diceCount === 0 && state.phase === 'lobby'}
                  <span class="ready-tag">ready</span>
                {/if}
              {/if}
            </div>
          </div>
        {/key}
      {/each}
    </section>
    {/if}

    <!-- Phase: lobby -->
    {#if state.phase === 'lobby' && !isTv}
      <section class="panel">
        <h2 class="panel-title">Lobby</h2>
        <p class="panel-hint">Waiting for players. Share code <strong>{state.code}</strong>.</p>

        {#if isHost}
          <div class="setting">
            <span class="setting-label">Mode</span>
            <div class="btn-group">
              <button class:selected={state.gameMode === 'casual'} aria-pressed={state.gameMode === 'casual'} onclick={() => setMode('casual')}>Casual</button>
              <button class:selected={state.gameMode === 'competitive'} aria-pressed={state.gameMode === 'competitive'} onclick={() => setMode('competitive')}>Competitive</button>
            </div>
          </div>
          <div class="setting">
            <span class="setting-label">Ante</span>
            <div class="btn-group">
              {#each ANTE_OPTIONS as a (a)}
                <button class:selected={state.ante === a} aria-pressed={state.ante === a} onclick={() => setAnte(a)}>{a}</button>
              {/each}
            </div>
          </div>
          <div class="setting">
            <span class="setting-label">Wilds</span>
            <div class="btn-group">
              <button class:selected={!state.onesWild} aria-pressed={!state.onesWild} onclick={() => setOnesWild(false)}>Off</button>
              <button class:selected={state.onesWild} aria-pressed={state.onesWild} onclick={() => setOnesWild(true)}>Ones wild</button>
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

        <!-- Party Night: cast to TV disclosure -->
        <details class="cast-disclosure">
          <summary class="cast-summary">Party Night: cast to TV</summary>
          <div class="cast-content">
            <p class="cast-hint">Open this on a TV or laptop. Phones become controllers.</p>
            <div class="cast-qr">
              <QRDisplay text={tvCastUrl} size={200} />
            </div>
            <p class="cast-url">{tvCastUrl}</p>
          </div>
        </details>
      </section>
    {/if}

    <!-- Phase: playing -->
    {#if state.phase === 'playing'}
      <section class="panel">
        <div class="bid-display">
          {#if state.currentBid}
            {#key bidKey}
              <div class="bid-value vfx-pop-in" style="position:relative">
                <Shockwave trigger={bidKey} color="var(--accent)" size={90} />
                <span class="bid-count">{state.currentBid.count}</span>
                <span class="bid-x">×</span>
                <span class="bid-face">{dieFace(state.currentBid.face)}</span>
              </div>
            {/key}
            <div class="bid-by">bid by {bidderName}</div>
          {:else}
            <div class="bid-empty">No bid yet. {currentTurnName} opens.</div>
          {/if}
          <div class="turn-line">{isMyTurn ? 'Your turn' : `${currentTurnName}'s turn`} / {totalDice} dice on the table</div>
        </div>

        <!-- My dice -->
        <div class="my-dice">
          <span class="my-dice-label">Your dice</span>
          {#if useControllerView && dicePending && !matchMedia('(prefers-reduced-motion: reduce)').matches}
            <!-- Shake pending: face-down placeholders -->
            <div class="die-row">
              {#each Array(state.myDice.length) as _, i (i)}
                <span class="die die-facedown">⚂</span>
              {/each}
            </div>
            <div class="dice-pending-controls">
              <p class="dice-pending-hint">Shake to reveal</p>
              {#if shakePermission === 'unknown'}
                <button class="btn-small" onclick={async () => {
                  const result = await shakeDetector?.requestPermission();
                  if (result) shakePermission = result;
                }}>Tap to enable shake</button>
              {/if}
              <button class="btn-small btn-reveal" onclick={() => dicePending = false}>Reveal</button>
            </div>
          {:else}
            <!-- Normal: show actual dice faces -->
            <div class="die-row">
              {#each state.myDice as d, i (i)}
                <span class="die">{dieFace(d)}</span>
              {/each}
              {#if state.myDice.length === 0}
                <span class="die-placeholder">No dice left</span>
              {/if}
            </div>
          {/if}
        </div>

        {#if isMyTurn && !me?.eliminated}
          <div class="bid-controls vfx-breathe">
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
                    aria-pressed={bidFace === f}
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
      {#key panelShakeKey}
        <section class="panel" class:vfx-shake-hard={panelShakeKey > 0}>
          <div class="round-over-header">
            <h2 class="panel-title">Round Result</h2>
            {#if showLiarStamp}
              {#key liarStampKey}
                <span class="liar-stamp vfx-slam-in">LIAR!</span>
              {/key}
            {/if}
          </div>
          <p class="result-line">
            <strong>{callerName}</strong> called liar on <strong>{prevBidderName}</strong>'s bid
            of <strong>{state.lastRoundResult.bid.count} {dieFace(state.lastRoundResult.bid.face)}</strong>
          </p>
          <p class="result-line">
            Actual count: <strong>{state.lastRoundResult.actualCount}</strong> / <strong>{loserName}</strong> loses a die
          </p>
          {#key roundOverKey}
            <div class="reveal-grid">
              {#each state.players as p, pi (p.id)}
                {#if state.lastRoundResult && state.lastRoundResult.revealedDice[p.id]}
                  <div class="reveal-row">
                    <NameFrame name={p.name} frameSvg={p.frameSvg} emblemSvg={p.emblemSvg} nameColour={p.nameColour} titleText={null} isHost={p.isHost} isBot={p.isBot} />
                    <span class="reveal-dice">
                      {#each state.lastRoundResult.revealedDice[p.id] as d, i (i)}
                        {#key matchIgniteKey}
                          <span
                            class="reveal-die"
                            class:match={d === state.lastRoundResult.bid.face}
                            class:match-ignite={matchIgniteDelay && d === state.lastRoundResult.bid.face}
                            style="animation-delay: {pi * 120 + i * 80}ms"
                          >{dieFace(d)}</span>
                        {/key}
                      {/each}
                    </span>
                  </div>
                {/if}
              {/each}
            </div>
          {/key}
          {#if isHost}
            <button class="btn-primary btn-full" onclick={nextRound}>Next Round</button>
          {:else}
            <p class="panel-hint">Waiting for host to start next round.</p>
          {/if}
        </section>
      {/key}
    {/if}

    <!-- Phase: game_over -->
    {#if state.phase === 'game_over'}
      {#key gameOverKey}
        <section class="panel game-over-panel">
          <h2 class="panel-title">Game Over</h2>
          {#if state.winnerId}
            <p class="result-line">
              <strong class="winner-name vfx-sparkle-text">{winnerName}</strong>
              wins <strong>{state.pot.toLocaleString()} chips</strong>!
            </p>
          {:else}
            <p class="result-line">No winner.</p>
          {/if}
          {#if isHost}
            <button class="btn-primary btn-full" onclick={newGame}>Play Again</button>
          {:else}
            <p class="panel-hint">Waiting for host to start a new game.</p>
          {/if}
        </section>
      {/key}
    {/if}

    <div class="footer">
      <button class="btn-ghost" onclick={() => goto('/liars-dice')}>Leave</button>
    </div>
    </div><!-- /.table-rail -->
  </div>
{:else if reconnecting}
  <div class="loading">Connecting...</div>
{/if}

<style>
  :root {
    --danger-bg-deep: #6b1f1f;
    --danger-text-pale: #f5d2d2;
    --danger-border-mid: #8a3030;
  }

  .game {
    max-width: 560px;
    margin: 0 auto;
    padding: 4rem 1rem max(3rem, env(safe-area-inset-bottom, 3rem));
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    background-color: var(--table-felt-bg, transparent);
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

  .pot-value-wrap {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
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

  .player-tile.eliminated {
    opacity: 0.45;
    filter: saturate(0.2);
  }

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

  .die-facedown {
    opacity: 0.5;
  }

  .dice-pending-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.6rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
  }

  .dice-pending-hint {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-muted);
    text-align: center;
    font-style: italic;
  }

  .btn-small {
    padding: 0.5rem 0.8rem;
    font-size: 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .btn-small:hover {
    background: var(--accent-faint);
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .btn-reveal {
    background: var(--accent-faint);
    border-color: var(--accent-border);
    color: var(--accent);
    font-weight: 600;
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
    background: var(--danger-bg-deep);
    color: var(--danger-text-pale);
    border: 1px solid var(--danger-border-mid);
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
    /* tumble into view on round_over reveal */
    animation: vfx-tumble 800ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .reveal-die.match { color: var(--accent); }

  /* gold ignite on matching dice after tumble settles */
  .reveal-die.match-ignite {
    animation:
      vfx-tumble 800ms cubic-bezier(0.22, 1, 0.36, 1) both,
      ld-match-pop 400ms 820ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes ld-match-pop {
    0%   { transform: scale(1); filter: drop-shadow(0 0 0px var(--accent)); }
    40%  { transform: scale(1.45); filter: drop-shadow(0 0 8px var(--accent)); }
    70%  { transform: scale(0.95); filter: drop-shadow(0 0 4px var(--accent)); }
    100% { transform: scale(1); filter: drop-shadow(0 0 3px var(--accent)); }
  }

  /* ring pulse on matching dice */
  .reveal-die.match-ignite::after {
    content: '';
    position: absolute;
    inset: -4px;
    border: 2px solid var(--accent);
    border-radius: 50%;
    pointer-events: none;
    animation: vfx-ring 600ms 840ms ease-out both;
  }

  .reveal-die { position: relative; }

  /* LIAR stamp */
  .round-over-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .liar-stamp {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #e94560;
    text-shadow: 0 0 12px rgba(233, 69, 96, 0.6);
    pointer-events: none;
  }

  /* winner sparkle text override so it stays readable */
  .winner-name {
    font-size: 1.1rem;
  }

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

  /* ── View toggle button ─────────────────────────────────────────────────── */

  .btn-view-toggle {
    padding: 0.3rem 0.65rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }

  .btn-view-toggle:hover {
    background: var(--accent-faint);
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .btn-view-toggle[aria-pressed="true"] {
    background: var(--accent-faint);
    border-color: var(--accent-border);
    color: var(--accent);
  }

  /* ── 3D stage band ──────────────────────────────────────────────────────── */

  .stage-band {
    width: 100%;
    height: clamp(320px, 52vh, 560px);
    position: relative;
    overflow: hidden;
    background: #080a0c;
    /* Negative margin pulls the stage band to full column width in table-mode */
  }

  .stage-loading,
  .stage-error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .stage-error { color: var(--red, #e94560); }

  /* ── Table-mode layout overrides ────────────────────────────────────────── */
  /* All selectors are gated behind .table-mode so classic view stays
     pixel-identical. No existing selectors are modified. */

  /* .table-rail is an invisible passthrough wrapper in classic / narrow view */
  .table-rail {
    display: contents;
  }

  .table-mode {
    max-width: 1100px;
  }

  /* In table-mode suppress idle breathe animation on bid controls */
  .table-mode .bid-controls {
    animation: none;
  }

  /* In table-mode the .players tile grid is hidden: monkeys + nameplates
     in the stage replace it. */
  .table-mode .players {
    display: none;
  }

  /* Compact the control panels in table-mode so they sit tightly
     below the stage band. */
  .table-mode .panel {
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
    width: 100%;
  }

  .table-mode .my-dice {
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
    width: 100%;
  }

  .table-mode .my-dice .die-row {
    justify-content: center;
    row-gap: 0.4rem;
  }

  /* Face picker: shrink buttons so all 6 fit in the 290px rail content row.
     The global button padding (0.75rem 1.5rem) puts a 49.6px border-box floor
     under each button, which both overflows the rail and defeats max-width;
     zero the horizontal padding here so flex sizing can actually compress. */
  .table-mode .face-picker {
    flex: 1 1 auto;
    min-width: 0;
  }

  .table-mode .face-picker button {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
    max-width: 2.6rem;
    padding: 0.25rem 0;
  }

  /* Safety: allow label + picker to wrap if still too tight */
  .table-mode .control-row {
    flex-wrap: wrap;
  }

  /* Stage band stretches to the full column width */
  .table-mode .stage-band {
    width: 100%;
  }

  /* ── 900-1199px: stacked, compact to fit 100vh ──────────────────────────── */
  @media (min-width: 900px) and (max-width: 1199px) {
    .table-mode {
      max-width: 900px;
      padding-top: 1rem;
    }

    .table-mode .stage-band {
      height: clamp(240px, 38vh, 420px) !important;
    }

    .table-mode .panel {
      padding: 0.65rem 0.8rem 0.75rem;
      gap: 0.5rem;
    }

    .table-mode .header {
      padding-bottom: 0.5rem;
    }

    .table-mode .bid-display {
      padding: 0.2rem 0;
    }

    .table-mode .bid-value {
      font-size: 1.4rem;
    }

    .table-mode .die {
      font-size: 1.6rem;
      padding: 0.15rem 0.3rem;
    }

    .table-mode .footer {
      padding-top: 0.25rem;
    }

    .table-mode .my-dice {
      max-width: none;
      margin: 0;
    }
  }

  /* ── >= 1200px: side-rail layout, one viewport, zero page scroll ────────── */
  @media (min-width: 1200px) {
    .table-mode {
      max-width: none;
      width: 100%;
      padding: 0;
      display: grid;
      grid-template-columns: 1fr 360px;
      height: calc(100vh - 3.25rem);
      overflow: hidden;
      gap: 0;
      align-items: start;
    }

    /* Stage band: left column, full height */
    .table-mode .stage-band {
      grid-column: 1;
      grid-row: 1;
      height: 100% !important;
      width: 100%;
    }

    /* Right rail: flex column, scrollable */
    .table-mode .table-rail {
      display: flex;
      flex-direction: column;
      grid-column: 2;
      grid-row: 1;
      overflow-y: auto;
      height: 100%;
      background: var(--bg-base, #0d1117);
      border-left: 1px solid var(--border);
      padding: 1rem;
      gap: 1rem;
    }

    /* Remove extra centering on panels inside the rail */
    .table-mode .panel {
      max-width: none;
      margin: 0;
      width: 100%;
    }

    .table-mode .my-dice {
      max-width: none;
      margin: 0;
      width: 100%;
    }

    .table-mode .my-dice .die-row {
      justify-content: center;
      row-gap: 0.4rem;
    }
  }

  /* ── TV Mode Layout ────────────────────────────────────────────────────────── */
  /* Full-viewport display: stage fills entire viewport, no controls visible */

  .tv-mode {
    max-width: 100%;
    padding: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    gap: 0;
  }

  .tv-mode .stage-band {
    flex: 1;
    height: auto !important;
    width: 100%;
    max-width: none;
  }

  .tv-mode .table-rail {
    display: none;
  }

  /* TV lower third: broadcast-style info bar at bottom of stage */
  .tv-lower-third {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.85);
    padding: 1rem;
    border-top: 2px solid var(--accent, #6b9e6b);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    color: var(--text, #d8dce8);
  }

  .tv-lower-text {
    flex: 1;
    letter-spacing: 0.05em;
  }

  .tv-lower-text .bid-label {
    font-weight: 700;
    color: var(--accent, #6b9e6b);
  }

  .tv-lower-turn {
    text-align: right;
    font-size: 0.95rem;
    color: var(--text-muted, #a8b8c4);
    font-weight: 500;
  }

  /* ── Controller View Mode ──────────────────────────────────────────────────── */
  /* Phone-first layout: controls prominent, no 3D stage, collapsed players list */

  .controller-mode .players {
    display: none;
  }

  .controller-mode .stage-band {
    display: none;
  }

  .controller-mode .my-dice {
    order: -1; /* Render before panel controls */
  }

  /* ── Cast Affordance Styling ───────────────────────────────────────────────── */

  .cast-disclosure {
    margin-top: 0.5rem;
  }

  .cast-summary {
    padding: 0.6rem 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted, #a8b8c4);
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .cast-summary:hover {
    color: var(--accent, #6b9e6b);
  }

  .cast-summary::before {
    content: '[+]';
    margin-right: 0.4rem;
    font-size: 0.7rem;
  }

  .cast-disclosure[open] .cast-summary::before {
    content: '[\2212]'; /* minus sign */
  }

  .cast-content {
    padding: 0.8rem 0;
    border-top: 1px solid var(--border, #333);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .cast-hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted, #a8b8c4);
    line-height: 1.4;
  }

  .cast-qr {
    display: flex;
    justify-content: center;
  }

  .cast-qr :global(img) {
    max-width: 100%;
    height: auto;
  }

  .cast-url {
    margin: 0;
    padding: 0.4rem 0.6rem;
    background: var(--bg-input, #1a1a1a);
    border: 1px solid var(--border, #333);
    border-radius: 4px;
    font-family: 'Rajdhani', monospace;
    font-size: 0.7rem;
    color: var(--text-muted, #a8b8c4);
    word-break: break-all;
    text-align: center;
  }
</style>
