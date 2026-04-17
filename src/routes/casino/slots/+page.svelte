<script lang="ts">
  import { goto } from '$app/navigation';
  import { isLoggedIn, userStats, currentUser } from '$lib/auth';
  import { SYMBOLS, WILD_ID } from '$lib/slots/symbols';
  import { PAYLINES, NUM_REELS, NUM_ROWS } from '$lib/slots/paylines';

  // Randomized initial grid (each reel independent)
  function randomGrid(): number[][] {
    const g: number[][] = [];
    for (let r = 0; r < NUM_REELS; r++) {
      const col: number[] = [];
      for (let row = 0; row < NUM_ROWS; row++) {
        col.push(Math.floor(Math.random() * 5)); // 0-4 standard symbols only
      }
      g.push(col);
    }
    return g;
  }

  let chips = $state<number | null>(null);
  let betPerLine = $state(1);
  let totalBet = $derived(betPerLine * 10);
  let spinning = $state(false);
  let grid = $state<number[][]>(randomGrid());
  let wins = $state<any[]>([]);
  let totalWin = $state(0);
  let lastWin = $state(0);
  let showPaytable = $state(false);
  let errorMsg = $state<string | null>(null);
  let hasSpun = $state(false);

  // Animation state
  let reelSpinning = $state([false, false, false, false, false]);
  let winHighlight = $state<Set<string>>(new Set());
  let expandGlow = $state<Set<number>>(new Set());
  let showWinBanner = $state(false);
  let activePaylines = $state<number[]>([]);
  let displayedWin = $state(0);
  let winCountUp = $state(false);

  // Spinning reel random symbols (shown during spin animation)
  let spinDisplayGrid = $state<number[][]>(randomGrid());
  let spinInterval: ReturnType<typeof setInterval> | null = null;

  // Audio
  let audioCtx: AudioContext | null = null;

  function playSound(freq: number, dur: number, vol = 0.06, type: OscillatorType = 'square') {
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      osc.type = type;
      gain.gain.value = vol;
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch {}
  }

  function playReelStop() { playSound(200, 0.06, 0.1, 'sine'); }
  function playWin() {
    [600, 800, 1000, 1200].forEach((f, i) => setTimeout(() => playSound(f, 0.15, 0.06, 'sine'), i * 70));
  }
  function playWildExpand() { playSound(1200, 0.3, 0.05, 'sine'); }
  function playTick() { playSound(600 + Math.random() * 400, 0.03, 0.04, 'square'); }

  // Fetch chip balance
  $effect(() => {
    if ($isLoggedIn) {
      fetch('/api/chips/status')
        .then(r => r.json())
        .then((data: any) => { chips = data.chips ?? 0; })
        .catch(() => {});
    }
  });

  // Track which reels just settled (for bounce animation)
  let reelSettling = $state([false, false, false, false, false]);

  // Rapidly cycle random symbols during spin
  function startSpinDisplay() {
    if (spinInterval) clearInterval(spinInterval);
    spinInterval = setInterval(() => {
      spinDisplayGrid = randomGrid();
    }, 50);
  }

  function stopSpinDisplay() {
    if (spinInterval) { clearInterval(spinInterval); spinInterval = null; }
  }

  function setBet(delta: number) {
    betPerLine = Math.max(1, Math.min(10, betPerLine + delta));
  }

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Animate win counter
  function countUpWin(target: number) {
    displayedWin = 0;
    winCountUp = true;
    const steps = 20;
    const stepTime = 40;
    let step = 0;
    function frame() {
      step++;
      displayedWin = Math.round((target * step) / steps);
      if (step < steps) {
        setTimeout(frame, stepTime);
      } else {
        displayedWin = target;
        winCountUp = false;
      }
    }
    frame();
  }

  async function spin() {
    if (spinning || !$isLoggedIn || chips === null || chips < totalBet) return;
    spinning = true;
    hasSpun = true;
    errorMsg = null;
    wins = [];
    totalWin = 0;
    lastWin = 0;
    displayedWin = 0;
    winHighlight = new Set();
    expandGlow = new Set();
    showWinBanner = false;
    activePaylines = [];

    // Optimistic deduct
    chips -= totalBet;

    // Start all reels spinning
    reelSpinning = [true, true, true, true, true];
    startSpinDisplay();

    const res = await fetch('/api/slots/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ betPerLine }),
    }).catch(() => null);

    if (!res || !res.ok) {
      const data = res ? await res.json().catch(() => ({ error: 'Network error' })) : { error: 'Network error' };
      errorMsg = data.error || 'Spin failed';
      chips += totalBet;
      reelSpinning = [false, false, false, false, false];
      stopSpinDisplay();
      spinning = false;
      return;
    }

    const data = await res.json();
    const baseGrid: number[][] = data.baseGrid;
    const finalGrid: number[][] = data.grid;

    // Minimum spin time before first reel stops
    await sleep(400);

    // Stop reels left to right with stagger
    for (let r = 0; r < NUM_REELS; r++) {
      await sleep(150);
      grid[r] = baseGrid[r];
      reelSpinning[r] = false;
      reelSettling[r] = true;
      playReelStop();
      // Clear settle after animation completes
      setTimeout(() => { reelSettling[r] = false; }, 300);
    }
    stopSpinDisplay();

    await sleep(300);

    // Wild expansion + respin
    if (data.expandedReels.length > 0) {
      for (const reelIdx of data.expandedReels) {
        expandGlow = new Set([...expandGlow, reelIdx]);
        playWildExpand();
        grid[reelIdx] = [WILD_ID, WILD_ID, WILD_ID];
        await sleep(500);
      }

      for (const step of data.respinHistory) {
        // Spin non-locked reels
        for (let r = 1; r <= 3; r++) {
          if (!expandGlow.has(r)) {
            reelSpinning[r] = true;
          }
        }
        startSpinDisplay();
        await sleep(700);
        const stepGrid: number[][] = step.grid;
        for (let r = 0; r < NUM_REELS; r++) {
          if (reelSpinning[r]) {
            grid[r] = stepGrid[r];
            reelSpinning[r] = false;
            playReelStop();
            await sleep(150);
          }
        }
        stopSpinDisplay();
        const newExpanded: number[] = step.expandedReels;
        for (const reelIdx of newExpanded) {
          if (!expandGlow.has(reelIdx)) {
            expandGlow = new Set([...expandGlow, reelIdx]);
            playWildExpand();
            grid[reelIdx] = [WILD_ID, WILD_ID, WILD_ID];
            await sleep(500);
          }
        }
        await sleep(300);
      }
    }

    // Apply final grid
    grid = finalGrid.map((col: number[]) => [...col]);

    wins = data.wins;
    totalWin = data.totalWin;
    lastWin = data.totalWin;
    chips = data.balance;

    userStats.update((s: any) => s ? { ...s, chips: data.balance } : s);

    // Win display
    if (wins.length > 0) {
      playWin();
      showWinBanner = true;
      countUpWin(totalWin);

      // Highlight winning cells
      const highlighted = new Set<string>();
      activePaylines = wins.map((w: any) => w.paylineIndex);
      for (const win of wins) {
        const payline = PAYLINES[win.paylineIndex];
        for (let r = 0; r < win.count; r++) {
          highlighted.add(`${r}-${payline[r]}`);
        }
      }
      winHighlight = highlighted;

      setTimeout(() => {
        winHighlight = new Set();
        showWinBanner = false;
        activePaylines = [];
      }, 4000);
    }

    spinning = false;
  }

  // Payline colors for overlay
  const PAYLINE_COLORS = [
    '#f39c12', '#e94560', '#3dd68c', '#4da8e6', '#a855f7',
    '#e6c44d', '#ff6b6b', '#48dbfb', '#ff9ff3', '#54a0ff',
  ];

  function getDisplaySymbol(reel: number, row: number): number {
    if (reelSpinning[reel]) return spinDisplayGrid[reel]?.[row] ?? 0;
    return grid[reel]?.[row] ?? 0;
  }
</script>

<div class="slots-page">
  <div class="slots-content">

    <header class="hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">Slots</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Spin the reels, match symbols</p>
    </header>

    <div class="identity-bar">
      <div class="identity">
        <span class="identity-label">Playing as</span>
        <span class="identity-name">{$isLoggedIn ? $currentUser?.displayName : 'Guest'}</span>
      </div>
      {#if chips !== null}
        <div class="chip-balance">
          <svg class="chips-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>
          <span>{chips.toLocaleString()}</span>
        </div>
      {/if}
    </div>

    {#if !$isLoggedIn}
      <div class="login-prompt card">
        <p>Log in to play slots</p>
        <button class="btn-primary" onclick={() => goto('/login')}>Log In</button>
      </div>
    {:else}

      <!-- Win Display -->
      <div class="win-display" class:win-active={showWinBanner}>
        {#if showWinBanner}
          <span class="win-text">WIN</span>
          <span class="win-amount">{displayedWin}</span>
          <span class="win-chips">chips</span>
        {:else if hasSpun && lastWin === 0}
          <span class="win-text no-win">No win</span>
        {:else}
          <span class="win-text idle">Spin to play</span>
        {/if}
      </div>

      <!-- Reel Grid -->
      <div class="reel-frame">
        <!-- Reel depth fades -->
        <div class="reel-fade reel-fade-top"></div>
        <div class="reel-fade reel-fade-bottom"></div>

        <div class="reel-grid">
          {#each { length: NUM_REELS } as _, reel}
            <div class="reel-col" class:expanding={expandGlow.has(reel)} class:reel-spinning={reelSpinning[reel]} class:reel-settling={reelSettling[reel]}>
              {#each { length: NUM_ROWS } as _, row}
                {@const symId = getDisplaySymbol(reel, row)}
                {@const sym = SYMBOLS[symId]}
                {@const tier = sym.id === WILD_ID ? 5 : sym.id}
                <div
                  class="cell"
                  class:spinning-cell={reelSpinning[reel]}
                  class:win-cell={winHighlight.has(`${reel}-${row}`)}
                  class:wild-cell={sym.id === WILD_ID}
                  class:tier-high={tier >= 3}
                >
                  <!-- SVG Symbol Icons -->
                  {#if sym.id === 0}
                    <!-- Cherry -->
                    <svg class="sym-svg" viewBox="0 0 40 40" style="--sym-color: {sym.color}">
                      <!-- Stems from top center down to each fruit -->
                      <path d="M20 4 Q18 10 14 16" stroke="#5a8a5a" stroke-width="2" fill="none" stroke-linecap="round"/>
                      <path d="M20 4 Q22 10 26 16" stroke="#5a8a5a" stroke-width="2" fill="none" stroke-linecap="round"/>
                      <!-- Leaf -->
                      <ellipse cx="22" cy="6" rx="4" ry="2" fill="#5a8a5a" transform="rotate(25 22 6)"/>
                      <!-- Fruits -->
                      <circle cx="14" cy="26" r="9" fill="{sym.color}" opacity="0.9"/>
                      <circle cx="26" cy="26" r="9" fill="{sym.color}" opacity="0.9"/>
                      <!-- Highlights -->
                      <ellipse cx="11" cy="23" rx="3" ry="4" fill="rgba(255,255,255,0.2)"/>
                      <ellipse cx="23" cy="23" rx="3" ry="4" fill="rgba(255,255,255,0.2)"/>
                    </svg>
                  {:else if sym.id === 1}
                    <!-- Lemon -->
                    <svg class="sym-svg" viewBox="0 0 40 40" style="--sym-color: {sym.color}">
                      <ellipse cx="20" cy="21" rx="13" ry="11" fill="{sym.color}" opacity="0.9"/>
                      <ellipse cx="20" cy="21" rx="13" ry="11" fill="none" stroke="{sym.color}" stroke-width="1"/>
                      <path d="M13 16 Q20 14 27 16" stroke="rgba(255,255,255,0.25)" stroke-width="2" fill="none"/>
                      <ellipse cx="16" cy="18" rx="3" ry="5" fill="rgba(255,255,255,0.15)" transform="rotate(-15 16 18)"/>
                    </svg>
                  {:else if sym.id === 2}
                    <!-- Orange -->
                    <svg class="sym-svg" viewBox="0 0 40 40" style="--sym-color: {sym.color}">
                      <circle cx="20" cy="22" r="12" fill="{sym.color}" opacity="0.9"/>
                      <!-- Stem -->
                      <line x1="20" y1="10" x2="20" y2="7" stroke="#5a8a5a" stroke-width="2" stroke-linecap="round"/>
                      <!-- Leaf -->
                      <ellipse cx="23" cy="8" rx="4" ry="2" fill="#5a8a5a" transform="rotate(20 23 8)"/>
                      <!-- Highlight -->
                      <ellipse cx="16" cy="18" rx="4" ry="5" fill="rgba(255,255,255,0.15)" transform="rotate(-10 16 18)"/>
                    </svg>
                  {:else if sym.id === 3}
                    <!-- Gem (Diamond) -->
                    <svg class="sym-svg sym-svg-gem" viewBox="0 0 40 40" style="--sym-color: {sym.color}">
                      <polygon points="20,6 34,18 20,34 6,18" fill="{sym.color}" opacity="0.85"/>
                      <polygon points="20,6 27,18 20,34 13,18" fill="rgba(255,255,255,0.1)"/>
                      <line x1="6" y1="18" x2="34" y2="18" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
                      <polygon points="20,6 13,18 20,18" fill="rgba(255,255,255,0.15)"/>
                      <polygon points="20,6 27,18 20,18" fill="rgba(255,255,255,0.05)"/>
                    </svg>
                  {:else if sym.id === 4}
                    <!-- Star -->
                    <svg class="sym-svg sym-svg-star" viewBox="0 0 40 40" style="--sym-color: {sym.color}">
                      <polygon points="20,4 24,15 36,15 27,22 30,34 20,27 10,34 13,22 4,15 16,15" fill="{sym.color}" opacity="0.9"/>
                      <polygon points="20,4 24,15 36,15 27,22 30,34 20,27 10,34 13,22 4,15 16,15" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
                      <polygon points="20,8 22,15 20,15" fill="rgba(255,255,255,0.2)"/>
                      <polygon points="20,8 18,15 20,15" fill="rgba(255,255,255,0.1)"/>
                    </svg>
                  {:else}
                    <!-- Wild (W burst) -->
                    <svg class="sym-svg sym-svg-wild" viewBox="0 0 40 40" style="--sym-color: {sym.color}">
                      <circle cx="20" cy="20" r="15" fill="rgba(61,214,140,0.15)" stroke="{sym.color}" stroke-width="1.5"/>
                      <text x="20" y="26" text-anchor="middle" font-family="Rajdhani, sans-serif" font-weight="700" font-size="18" fill="{sym.color}">W</text>
                      <!-- Starburst rays -->
                      {#each [0,45,90,135,180,225,270,315] as angle}
                        <line
                          x1={20 + Math.cos(angle * Math.PI/180) * 12}
                          y1={20 + Math.sin(angle * Math.PI/180) * 12}
                          x2={20 + Math.cos(angle * Math.PI/180) * 16}
                          y2={20 + Math.sin(angle * Math.PI/180) * 16}
                          stroke="{sym.color}" stroke-width="1.5" opacity="0.5"
                        />
                      {/each}
                    </svg>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>

        <!-- Payline overlay for winning lines -->
        {#if activePaylines.length > 0}
          <svg class="payline-overlay" viewBox="0 0 500 300" preserveAspectRatio="none">
            {#each activePaylines as pIdx}
              {@const payline = PAYLINES[pIdx]}
              {@const color = PAYLINE_COLORS[pIdx]}
              <polyline
                points={payline.map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
                stroke={color}
                stroke-width="6"
                fill="none"
                opacity="0.9"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <polyline
                points={payline.map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
                stroke="white"
                stroke-width="2"
                fill="none"
                opacity="0.3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              {#each payline as row, reel}
                <circle cx={reel * 100 + 50} cy={row * 100 + 50} r="10" fill={color} opacity="0.7"/>
              {/each}
            {/each}
          </svg>
        {/if}
      </div>

      <!-- Payline labels -->
      {#if activePaylines.length > 0}
        <div class="payline-legend">
          {#each wins as win}
            <span class="payline-tag" style="border-color: {PAYLINE_COLORS[win.paylineIndex]}; color: {PAYLINE_COLORS[win.paylineIndex]}">
              L{win.paylineIndex + 1}: {win.count}x {SYMBOLS[win.symbolId].name} = {win.payout}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Bet Controls -->
      <div class="controls">
        <div class="bet-row">
          <button class="bet-btn" onclick={() => setBet(-1)} disabled={spinning || betPerLine <= 1}>-</button>
          <div class="bet-display">
            <span class="bet-label">Bet / Line</span>
            <span class="bet-value">{betPerLine}</span>
          </div>
          <button class="bet-btn" onclick={() => setBet(1)} disabled={spinning || betPerLine >= 10}>+</button>
          <div class="total-display">
            <span class="bet-label">Total ({betPerLine} x 10 lines)</span>
            <span class="bet-value">{totalBet}</span>
          </div>
        </div>

        <button
          class="spin-btn"
          onclick={spin}
          disabled={spinning || chips === null || chips < totalBet}
        >
          {#if spinning}
            Spinning...
          {:else if chips !== null && chips < totalBet}
            Need {totalBet} chips (have {chips})
          {:else}
            Spin ({totalBet} chips)
          {/if}
        </button>

        {#if errorMsg}
          <div class="error-toast">{errorMsg}</div>
        {/if}
      </div>

      <!-- Paytable -->
      <div class="paytable-section">
        <button class="toggle-btn" onclick={() => showPaytable = !showPaytable}>
          {showPaytable ? 'Hide' : 'Show'} Paytable
        </button>

        {#if showPaytable}
          <div class="paytable card">
            <h3 class="pt-heading geo-title">Payouts (x bet per line)</h3>
            <div class="pt-grid">
              <div class="pt-header">
                <span></span>
                <span>3x</span>
                <span>4x</span>
                <span>5x</span>
              </div>
              {#each SYMBOLS.filter(s => s.id !== WILD_ID).reverse() as sym}
                <div class="pt-row">
                  <span class="pt-sym">
                    <svg viewBox="0 0 20 20" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">
                      {#if sym.id === 0}
                        <circle cx="7" cy="13" r="5" fill="{sym.color}" opacity="0.9"/><circle cx="13" cy="13" r="5" fill="{sym.color}" opacity="0.9"/>
                      {:else if sym.id === 1}
                        <ellipse cx="10" cy="11" rx="7" ry="6" fill="{sym.color}" opacity="0.9"/>
                      {:else if sym.id === 2}
                        <circle cx="10" cy="11" r="7" fill="{sym.color}" opacity="0.9"/>
                      {:else if sym.id === 3}
                        <polygon points="10,3 17,10 10,17 3,10" fill="{sym.color}" opacity="0.85"/>
                      {:else}
                        <polygon points="10,2 12,8 18,8 13,12 15,18 10,14 5,18 7,12 2,8 8,8" fill="{sym.color}" opacity="0.9"/>
                      {/if}
                    </svg>
                    <span style="color: {sym.color}">{sym.name}</span>
                  </span>
                  <span>{sym.payouts[3]}x</span>
                  <span>{sym.payouts[4]}x</span>
                  <span>{sym.payouts[5]}x</span>
                </div>
              {/each}
            </div>
            <div class="pt-wild">
              <span class="pt-sym">
                <svg viewBox="0 0 20 20" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">
                  <circle cx="10" cy="10" r="8" fill="rgba(61,214,140,0.2)" stroke="#3dd68c" stroke-width="1"/>
                  <text x="10" y="14" text-anchor="middle" font-family="Rajdhani, sans-serif" font-weight="700" font-size="10" fill="#3dd68c">W</text>
                </svg>
                <span style="color: #3dd68c">Wild</span>
              </span>
              <span class="pt-wild-desc">Substitutes for all. Reels 2-4 only. Expands to fill reel + triggers respin (max 3).</span>
            </div>
            <div class="pt-info">
              <p>10 paylines, left-to-right from reel 1. 3+ matching to win.</p>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <button class="back-btn" onclick={() => goto('/casino')}>Back to Casino</button>
  </div>
</div>

<style>
  .slots-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 5rem 1.25rem 4rem;
  }

  .slots-content {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Hero */
  .hero {
    text-align: center;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .wordmark {
    font-size: clamp(2rem, 8vw, 3.5rem);
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    background: linear-gradient(180deg, #f5c542 0%, #f39c12 60%, #e67e22 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline {
    margin-top: 0.875rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .diamond-accent {
    width: 6px;
    height: 6px;
    background: #f39c12;
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    flex-shrink: 0;
  }

  /* Identity bar */
  .identity-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.875rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both;
  }

  .identity { display: flex; align-items: center; gap: 0.5rem; }

  .identity-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .identity-name { font-size: 0.9rem; color: var(--accent); font-weight: 500; }

  .chip-balance {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: #f39c12;
  }

  .chips-icon { color: #f39c12; }

  /* Login prompt */
  .login-prompt {
    text-align: center;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    color: var(--text-muted);
  }

  .btn-primary {
    padding: 0.6rem 1.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--btn-primary-text, #0c0e10);
    background: var(--btn-primary-bg, #5a8a5a);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    clip-path: var(--clip-btn);
  }

  /* Win Display Area */
  .win-display {
    text-align: center;
    padding: 0.6rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 48px;
    transition: all 0.3s ease;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both;
  }

  .win-display.win-active {
    border-color: #f39c12;
    box-shadow: 0 0 20px rgba(243, 156, 18, 0.3), inset 0 0 15px rgba(243, 156, 18, 0.05);
    background: linear-gradient(180deg, rgba(243, 156, 18, 0.08), var(--bg-card));
  }

  .win-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #f39c12;
  }

  .win-text.no-win { color: var(--text-subtle); }
  .win-text.idle { color: var(--text-subtle); font-weight: 600; }

  .win-amount {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.8rem;
    font-weight: 700;
    color: #f39c12;
    letter-spacing: 0.04em;
    line-height: 1;
    text-shadow: 0 0 12px rgba(243, 156, 18, 0.4);
  }

  .win-chips {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  /* Reel frame */
  .reel-frame {
    position: relative;
    background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, var(--bg-card) 8%, var(--bg-card) 92%, rgba(0,0,0,0.3) 100%);
    border: 1.5px solid #f39c12;
    box-shadow: 0 0 20px rgba(243, 156, 18, 0.2), inset 0 0 12px rgba(243, 156, 18, 0.04);
    border-radius: 6px;
    padding: 0.5rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
    overflow: hidden;
  }

  /* Reel depth fades */
  .reel-fade {
    position: absolute;
    left: 0;
    right: 0;
    height: 18px;
    z-index: 3;
    pointer-events: none;
  }

  .reel-fade-top {
    top: 0;
    background: linear-gradient(180deg, rgba(12, 14, 16, 0.7) 0%, transparent 100%);
  }

  .reel-fade-bottom {
    bottom: 0;
    background: linear-gradient(0deg, rgba(12, 14, 16, 0.7) 0%, transparent 100%);
  }

  .reel-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
    position: relative;
  }

  .reel-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: box-shadow 0.3s ease;
    border-radius: 3px;
    position: relative;
    overflow: hidden;
  }

  .reel-col.reel-spinning {
    animation: reelScroll 0.12s linear infinite;
    filter: blur(0.5px);
  }

  .reel-col.reel-settling {
    animation: reelSettle 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  .reel-col.expanding {
    box-shadow: 0 0 24px rgba(61, 214, 140, 0.5), inset 0 0 12px rgba(61, 214, 140, 0.1);
    animation: wildGlow 0.8s ease-in-out infinite;
  }

  /* Reel separator lines */
  .reel-col:not(:last-child)::after {
    content: '';
    position: absolute;
    right: -2px;
    top: 4px;
    bottom: 4px;
    width: 1px;
    background: linear-gradient(180deg, transparent, var(--border-bright), transparent);
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(24, 30, 36, 0.6);
    border: 1px solid rgba(120, 140, 130, 0.06);
    border-radius: 3px;
    aspect-ratio: 1;
    transition: all 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .cell.spinning-cell {
    opacity: 0.6;
  }

  .cell.win-cell {
    border-color: #f39c12;
    box-shadow: 0 0 14px rgba(243, 156, 18, 0.5), inset 0 0 8px rgba(243, 156, 18, 0.1);
    animation: winPulse 0.8s ease-in-out infinite;
    background: rgba(243, 156, 18, 0.06);
  }

  .cell.wild-cell {
    background: rgba(61, 214, 140, 0.08);
    border-color: rgba(61, 214, 140, 0.3);
  }

  .cell.tier-high .sym-svg {
    filter: drop-shadow(0 0 4px var(--sym-color));
  }

  /* SVG symbols */
  .sym-svg {
    width: 70%;
    height: 70%;
    transition: transform 0.2s ease;
  }

  .sym-svg-gem, .sym-svg-star {
    width: 78%;
    height: 78%;
  }

  .sym-svg-wild {
    width: 80%;
    height: 80%;
    animation: wildSpin 3s linear infinite;
  }

  .cell.win-cell .sym-svg {
    transform: scale(1.1);
  }

  /* Payline overlay */
  .payline-overlay {
    position: absolute;
    inset: 0.5rem;
    z-index: 4;
    pointer-events: none;
  }

  /* Payline legend */
  .payline-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    justify-content: center;
    animation: fadeUp 0.2s ease both;
  }

  .payline-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border: 1px solid;
    border-radius: 2px;
    background: rgba(0,0,0,0.3);
  }

  /* Controls */
  .controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
  }

  .bet-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .bet-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.2rem;
    font-weight: 700;
    color: #f39c12;
    background: rgba(243, 156, 18, 0.08);
    border: 1px solid rgba(243, 156, 18, 0.3);
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease;
    clip-path: none;
  }

  .bet-btn:hover:not(:disabled) { background: rgba(243, 156, 18, 0.15); }
  .bet-btn:disabled { opacity: 0.4; cursor: default; }

  .bet-display, .total-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.3rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .total-display { margin-left: auto; }

  .bet-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .bet-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f39c12;
  }

  .spin-btn {
    width: 100%;
    padding: 0.85rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #0c0e10;
    background: linear-gradient(180deg, #f5c542, #f39c12);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.1s ease;
    clip-path: var(--clip-btn);
  }

  .spin-btn:hover:not(:disabled) { opacity: 0.9; }
  .spin-btn:active:not(:disabled) { transform: scale(0.97); }
  .spin-btn:disabled { opacity: 0.5; cursor: default; }

  .error-toast {
    text-align: center;
    padding: 0.5rem 0.75rem;
    background: rgba(233, 69, 96, 0.1);
    border: 1px solid rgba(233, 69, 96, 0.3);
    border-radius: 2px;
    color: #e94560;
    font-size: 0.8rem;
    animation: fadeUp 0.2s ease both;
  }

  /* Paytable */
  .paytable-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both;
  }

  .toggle-btn {
    width: 100%;
    padding: 0.6rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #f39c12;
    background: rgba(243, 156, 18, 0.06);
    border: 1px solid rgba(243, 156, 18, 0.2);
    border-radius: 2px;
    cursor: pointer;
    clip-path: none;
  }

  .toggle-btn:hover { background: rgba(243, 156, 18, 0.12); }

  .paytable {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .pt-heading {
    font-size: 0.65rem;
    letter-spacing: 0.16em;
    color: var(--text-subtle);
  }

  .pt-grid {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .pt-header, .pt-row {
    display: grid;
    grid-template-columns: 1fr 50px 50px 50px;
    gap: 0.5rem;
    align-items: center;
  }

  .pt-header span {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
    text-align: center;
  }

  .pt-header span:first-child { text-align: left; }

  .pt-row span {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
    text-align: center;
  }

  .pt-sym {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-weight: 700 !important;
    text-align: left !important;
    letter-spacing: 0.06em;
  }

  .pt-wild {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .pt-wild-desc {
    font-size: 0.7rem !important;
    color: var(--text-muted) !important;
    line-height: 1.5;
    text-align: left !important;
  }

  .pt-info {
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }

  .pt-info p {
    font-size: 0.7rem;
    color: var(--text-subtle);
    line-height: 1.6;
  }

  /* Back button */
  .back-btn {
    width: 100%;
    padding: 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: none;
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    clip-path: none;
  }

  .back-btn:hover { color: var(--accent); border-color: var(--accent-border); }

  .card {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    position: relative;
  }

  .card::before {
    content: '';
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
  }

  /* Animations */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes reelScroll {
    0% { transform: translateY(0); }
    100% { transform: translateY(33.33%); }
  }

  @keyframes reelSettle {
    0% { transform: translateY(-8px); }
    60% { transform: translateY(3px); }
    100% { transform: translateY(0); }
  }

  @keyframes winPulse {
    0%, 100% { box-shadow: 0 0 8px rgba(243, 156, 18, 0.3), inset 0 0 4px rgba(243, 156, 18, 0.05); }
    50% { box-shadow: 0 0 20px rgba(243, 156, 18, 0.7), inset 0 0 10px rgba(243, 156, 18, 0.1); }
  }

  @keyframes wildGlow {
    0%, 100% { box-shadow: 0 0 14px rgba(61, 214, 140, 0.3); }
    50% { box-shadow: 0 0 28px rgba(61, 214, 140, 0.6); }
  }

  @keyframes wildSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  button:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  .geo-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    text-transform: uppercase;
  }

  @media (max-width: 420px) {
    .cell { min-height: 0; }
    .sym-svg { width: 60%; height: 60%; }
    .reel-frame { padding: 0.35rem; }
    .win-amount { font-size: 1.4rem; }
  }
</style>
