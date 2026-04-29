<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { isLoggedIn } from '$lib/auth';
  import { getGuestId } from '$lib/guest';

  interface PlatformerPlayer {
    id: string;
    name: string;
    x: number; y: number;
    vx: number; vy: number;
    facing: -1 | 1;
    onGround: boolean;
    jumpsRemaining: number;
    attackCooldownMs: number;
    attackActiveMs: number;
    invulnMs: number;
    lives: number;
    respawnMs: number;
    connected: boolean;
    isGuest: boolean;
    nameColour?: string | null;
  }

  interface Snapshot {
    tick: number;
    phase: 'lobby' | 'playing' | 'round_over' | 'game_over';
    players: PlatformerPlayer[];
    roundEndsAt: number;
    roundWinnerId?: string | null;
    matchWinnerId?: string | null;
    hostId: string;
    code: string;
    scores?: Record<string, number>;
  }

  const code = $derived($page.params.code?.toUpperCase() ?? '');
  let snapshot: Snapshot | null = $state(null);
  let myId: string | null = $state(null);
  let connected = $state(false);
  let error: string | null = $state(null);
  let canvas: HTMLCanvasElement | null = $state(null);
  let isCoarsePointer = $state(false);

  const MAP_W = 800;
  const MAP_H = 480;
  const PLATFORMS = [
    { x: 80, y: 400, w: 640, h: 24 },
    { x: 200, y: 300, w: 160, h: 16 },
    { x: 440, y: 300, w: 160, h: 16 },
    { x: 320, y: 220, w: 160, h: 16 },
  ];
  const PLAYER_W = 36;
  const PLAYER_H = 56;
  const ATTACK_RANGE = 56;
  const ATTACK_HEIGHT = 44;

  let ws: WebSocket | null = null;
  let inputState = { left: false, right: false, jump: false, attack: false };
  let lastSentMask = -1;
  let inputSeq = 0;
  let rafHandle = 0;

  function buildWsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const guestId = $isLoggedIn ? '' : `&guestId=${encodeURIComponent(getGuestId())}`;
    return `${proto}//${location.host}/ws/platformer?room=${code}${guestId}`;
  }

  function send(obj: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function sendInputIfChanged(force = false): void {
    const mask =
      (inputState.left ? 1 : 0) |
      (inputState.right ? 2 : 0) |
      (inputState.jump ? 4 : 0) |
      (inputState.attack ? 8 : 0);
    if (!force && mask === lastSentMask) return;
    lastSentMask = mask;
    inputSeq += 1;
    send({ type: 'input', ...inputState, seq: inputSeq });
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.repeat) return;
    let changed = true;
    switch (e.key) {
      case 'a': case 'A': case 'ArrowLeft': inputState.left = true; break;
      case 'd': case 'D': case 'ArrowRight': inputState.right = true; break;
      case ' ': case 'w': case 'W': case 'ArrowUp': inputState.jump = true; break;
      case 'j': case 'J': case 'k': case 'K': case 'ArrowDown': inputState.attack = true; break;
      default: changed = false;
    }
    if (changed) {
      e.preventDefault();
      sendInputIfChanged();
    }
  }

  function handleKeyup(e: KeyboardEvent): void {
    let changed = true;
    switch (e.key) {
      case 'a': case 'A': case 'ArrowLeft': inputState.left = false; break;
      case 'd': case 'D': case 'ArrowRight': inputState.right = false; break;
      case ' ': case 'w': case 'W': case 'ArrowUp': inputState.jump = false; break;
      case 'j': case 'J': case 'k': case 'K': case 'ArrowDown': inputState.attack = false; break;
      default: changed = false;
    }
    if (changed) {
      e.preventDefault();
      sendInputIfChanged();
    }
  }

  function setTouchInput(key: 'left' | 'right' | 'jump' | 'attack', value: boolean): void {
    inputState[key] = value;
    sendInputIfChanged();
  }

  function colorFor(p: PlatformerPlayer): string {
    if (p.nameColour) return p.nameColour;
    const palette = ['#4cc8ff', '#ff8c5a', '#a8e36e', '#d68bff'];
    const idx = snapshot?.players.findIndex(x => x.id === p.id) ?? 0;
    return palette[idx % palette.length];
  }

  function draw(): void {
    rafHandle = requestAnimationFrame(draw);
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const scale = Math.min(canvas.width / MAP_W, canvas.height / MAP_H);
    const offX = (canvas.width - MAP_W * scale) / 2;
    const offY = (canvas.height - MAP_H * scale) / 2;

    ctx.fillStyle = '#0e1218';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#161c25';
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    ctx.fillStyle = '#3a4658';
    for (const plat of PLATFORMS) {
      ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
      ctx.fillStyle = '#566377';
      ctx.fillRect(plat.x, plat.y, plat.w, 3);
      ctx.fillStyle = '#3a4658';
    }

    for (const p of snapshot.players) {
      if (p.lives <= 0) continue;
      if (p.respawnMs > 0) continue;
      const color = colorFor(p);

      if (p.invulnMs > 0 && Math.floor(Date.now() / 80) % 2 === 0) {
        ctx.globalAlpha = 0.4;
      }

      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, PLAYER_W, PLAYER_H);

      ctx.fillStyle = '#0e1218';
      const eyeY = p.y + 14;
      const eyeX = p.facing === 1 ? p.x + PLAYER_W - 12 : p.x + 6;
      ctx.fillRect(eyeX, eyeY, 6, 6);

      if (p.attackActiveMs > 0) {
        const hbX = p.facing === 1 ? p.x + PLAYER_W : p.x - ATTACK_RANGE;
        const hbY = p.y + (PLAYER_H - ATTACK_HEIGHT) / 2;
        ctx.fillStyle = 'rgba(255, 220, 60, 0.55)';
        ctx.fillRect(hbX, hbY, ATTACK_RANGE, ATTACK_HEIGHT);
        ctx.strokeStyle = 'rgba(255, 240, 120, 0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(hbX, hbY, ATTACK_RANGE, ATTACK_HEIGHT);
      }

      ctx.globalAlpha = 1;

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x + PLAYER_W / 2, p.y - 18);
      ctx.fillStyle = '#ff5050';
      ctx.fillText('♥'.repeat(Math.max(0, p.lives)), p.x + PLAYER_W / 2, p.y - 4);
    }

    ctx.restore();
  }

  function connect(): void {
    if (ws) return;
    try {
      ws = new WebSocket(buildWsUrl());
    } catch {
      error = 'Failed to open WebSocket';
      return;
    }
    ws.addEventListener('open', () => {
      connected = true;
      send({ type: 'join' });
    });
    ws.addEventListener('close', () => {
      connected = false;
    });
    ws.addEventListener('error', () => {
      error = 'Connection error';
    });
    ws.addEventListener('message', (ev) => {
      let msg: { type: string; [key: string]: unknown };
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      if (msg.type === 'joined') {
        myId = msg.playerId as string;
        snapshot = msg.snapshot as Snapshot;
      } else if (msg.type === 'snapshot') {
        snapshot = msg.snapshot as Snapshot;
      } else if (msg.type === 'error') {
        error = msg.message as string;
      } else if (msg.type === 'xp_gained') {
        try {
          window.dispatchEvent(new CustomEvent('xpgained', { detail: { amount: msg.amount, newXp: msg.newXp } }));
        } catch {}
      } else if (msg.type === 'level_up') {
        try {
          window.dispatchEvent(new CustomEvent('levelup', { detail: { newLevel: msg.newLevel, rewards: msg.rewards } }));
        } catch {}
      }
    });
  }

  $effect(() => {
    isCoarsePointer = matchMedia('(pointer: coarse)').matches || window.innerWidth < 700;
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    connect();
    rafHandle = requestAnimationFrame(draw);
    const pingInterval = setInterval(() => send({ type: 'ping' }), 25_000);
    return () => {
      cancelAnimationFrame(rafHandle);
      clearInterval(pingInterval);
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      try { ws?.close(); } catch {}
      ws = null;
    };
  });

  let isHost = $derived(snapshot && myId ? snapshot.hostId === myId : false);
  let me = $derived(snapshot && myId ? snapshot.players.find(p => p.id === myId) ?? null : null);
  let timeLeft = $derived.by(() => {
    if (!snapshot || snapshot.phase !== 'playing') return 0;
    return Math.max(0, Math.ceil((snapshot.roundEndsAt - Date.now()) / 1000));
  });
  let winnerName = $derived.by(() => {
    if (!snapshot) return null;
    const id = snapshot.matchWinnerId ?? snapshot.roundWinnerId;
    if (!id) return null;
    return snapshot.players.find(p => p.id === id)?.name ?? null;
  });
</script>

<div class="game-shell">
  <header class="topbar">
    <a href="/platformer" class="back-link">← Lobby</a>
    <span class="room-code">ROOM {code}</span>
    <span class="status">{connected ? 'CONNECTED' : 'CONNECTING...'}</span>
  </header>

  {#if error}
    <div class="error-toast" onclick={() => (error = null)} role="alert">{error}</div>
  {/if}

  <div class="stage-wrap">
    <canvas bind:this={canvas} class="stage" aria-label="Platformer arena"></canvas>

    {#if snapshot && snapshot.phase === 'lobby'}
      <div class="overlay">
        <div class="overlay-card">
          <h2>Lobby</h2>
          <p class="overlay-text">Players ({snapshot.players.length}/4):</p>
          <ul class="player-list">
            {#each snapshot.players as p}
              <li>{p.name}{p.id === snapshot.hostId ? ' (host)' : ''}</li>
            {/each}
          </ul>
          {#if isHost}
            <button class="btn-primary" onclick={() => send({ type: 'start_game' })} disabled={snapshot.players.length < 2}>
              {snapshot.players.length < 2 ? 'Need 2+ players' : 'Start Game'}
            </button>
          {:else}
            <p class="overlay-text">Waiting for host to start...</p>
          {/if}
        </div>
      </div>
    {/if}

    {#if snapshot && (snapshot.phase === 'round_over' || snapshot.phase === 'game_over')}
      <div class="overlay">
        <div class="overlay-card">
          <h2>{snapshot.phase === 'game_over' ? 'Match Over' : 'Round Over'}</h2>
          {#if winnerName}
            <p class="winner-text">{winnerName} wins!</p>
          {:else}
            <p class="winner-text">Draw</p>
          {/if}
          {#if snapshot.scores}
            <ul class="player-list">
              {#each snapshot.players as p}
                <li>{p.name}: {snapshot.scores?.[p.id] ?? 0}</li>
              {/each}
            </ul>
          {/if}
          {#if isHost}
            <button class="btn-primary" onclick={() => send({ type: 'play_again' })}>
              {snapshot.phase === 'game_over' ? 'Back to Lobby' : 'Next Round'}
            </button>
          {:else}
            <p class="overlay-text">Waiting for host...</p>
          {/if}
          <button class="btn-secondary" onclick={() => goto('/platformer')}>Leave</button>
        </div>
      </div>
    {/if}

    {#if snapshot && snapshot.phase === 'playing'}
      <div class="hud">
        <span class="hud-time">{timeLeft}s</span>
        {#if me}
          <span class="hud-lives">Your lives: {me.lives}</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if isCoarsePointer && snapshot?.phase === 'playing'}
    <div class="touch-controls" aria-hidden="true">
      <div class="touch-pad-left">
        <button class="touch-btn"
          ontouchstart={(e) => { e.preventDefault(); setTouchInput('left', true); }}
          ontouchend={(e) => { e.preventDefault(); setTouchInput('left', false); }}
          ontouchcancel={(e) => { e.preventDefault(); setTouchInput('left', false); }}
        >←</button>
        <button class="touch-btn"
          ontouchstart={(e) => { e.preventDefault(); setTouchInput('right', true); }}
          ontouchend={(e) => { e.preventDefault(); setTouchInput('right', false); }}
          ontouchcancel={(e) => { e.preventDefault(); setTouchInput('right', false); }}
        >→</button>
      </div>
      <div class="touch-pad-right">
        <button class="touch-btn touch-jump"
          ontouchstart={(e) => { e.preventDefault(); setTouchInput('jump', true); }}
          ontouchend={(e) => { e.preventDefault(); setTouchInput('jump', false); }}
          ontouchcancel={(e) => { e.preventDefault(); setTouchInput('jump', false); }}
        >JUMP</button>
        <button class="touch-btn touch-attack"
          ontouchstart={(e) => { e.preventDefault(); setTouchInput('attack', true); }}
          ontouchend={(e) => { e.preventDefault(); setTouchInput('attack', false); }}
          ontouchcancel={(e) => { e.preventDefault(); setTouchInput('attack', false); }}
        >HIT</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .game-shell {
    position: relative;
    width: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    color: var(--text);
    user-select: none;
    touch-action: none;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .back-link { color: var(--text-subtle); text-decoration: none; }
  .back-link:hover { color: var(--accent); }
  .room-code { color: var(--accent); font-weight: 700; }
  .status { color: var(--text-muted); }
  .stage-wrap {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    min-height: 0;
  }
  .stage {
    width: 100%;
    max-width: 1000px;
    aspect-ratio: 5 / 3;
    background: #0e1218;
    border: 1px solid var(--border);
    display: block;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .overlay-card {
    background: var(--bg-card);
    border: 1px solid var(--border-bright);
    padding: 1.5rem 2rem;
    min-width: 260px;
    max-width: 90vw;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    pointer-events: auto;
  }
  .overlay-card h2 {
    margin: 0;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.5rem;
    letter-spacing: 0.14em;
    color: var(--accent);
  }
  .overlay-text { color: var(--text-muted); font-size: 0.85rem; margin: 0; }
  .winner-text { color: #f0c030; font-size: 1.2rem; font-weight: 700; margin: 0; }
  .player-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
  .btn-primary {
    padding: 0.7rem 1.25rem;
    background: var(--accent);
    color: var(--bg);
    border: none;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .btn-primary:disabled { opacity: 0.4; cursor: default; }
  .btn-secondary {
    padding: 0.6rem 1.25rem;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .hud {
    position: absolute;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 1.5rem;
    background: rgba(0, 0, 0, 0.6);
    padding: 0.4rem 1rem;
    border: 1px solid var(--border);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    color: var(--text);
    letter-spacing: 0.12em;
  }
  .hud-time { color: #f0c030; font-weight: 700; }
  .error-toast {
    position: absolute;
    top: 3rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-card);
    border: 1px solid #d04040;
    color: #ff7070;
    padding: 0.5rem 1rem;
    z-index: 20;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .touch-controls {
    position: fixed;
    inset: auto 0 0 0;
    display: flex;
    justify-content: space-between;
    padding: 0.75rem;
    pointer-events: none;
    gap: 0.5rem;
  }
  .touch-pad-left, .touch-pad-right {
    display: flex;
    gap: 0.5rem;
    pointer-events: auto;
  }
  .touch-btn {
    width: 64px;
    height: 64px;
    border: 1px solid var(--border-bright);
    background: rgba(20, 26, 35, 0.85);
    color: var(--text);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.06em;
    border-radius: 50%;
    touch-action: none;
  }
  .touch-jump { background: rgba(76, 200, 255, 0.2); color: #6fdcff; }
  .touch-attack { background: rgba(240, 192, 48, 0.2); color: #f0c030; }
  .touch-btn:active { background: var(--accent); color: var(--bg); }
</style>
