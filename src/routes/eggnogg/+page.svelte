<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn, fetchUser } from '$lib/auth';

  let roomCode = $state('');
  let joining = $state(false);
  let mode: 'menu' | 'join' = $state('menu');
  let error: string | null = $state(null);
  let errorTimeout: ReturnType<typeof setTimeout>;
  let isMobile = $state(false);

  $effect(() => {
    fetchUser().then(user => {
      if (!user) goto('/login');
    });
    // Check viewport width for mobile gate
    isMobile = window.innerWidth < 768;
  });

  function showError(msg: string) {
    error = msg;
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => { error = null; }, 4000);
  }

  async function createRoom() {
    joining = true;
    try {
      const res = await fetch('/api/create-solo?game=eggnogg', { method: 'POST' });
      const data: { code?: string; error?: string } = await res.json();
      if (data.error || !data.code) {
        showError(data.error || 'Failed to create room');
        joining = false;
        return;
      }
      goto(`/eggnogg/${data.code}`);
    } catch {
      showError('Could not connect to server');
      joining = false;
    }
  }

  function joinRoom() {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) return;
    goto(`/eggnogg/${code}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') joinRoom();
  }
</script>

{#if error}
  <div class="error-toast">{error}</div>
{/if}

{#if isMobile}
  <div class="mobile-gate">
    <div class="mobile-gate-inner">
      <p class="mobile-icon" aria-hidden="true">&#x1F5A5;</p>
      <h1 class="mobile-title geo-title">Desktop Only</h1>
      <p class="mobile-body">Eggnogg+ requires a keyboard. Open this page on a desktop or laptop.</p>
    </div>
  </div>
{:else}
  <div class="home">
    <div class="content">
      <header class="hero">
        <div class="title-frame">
          <span class="diamond-accent" aria-hidden="true"></span>
          <h1 class="wordmark geo-title">Eggnogg+</h1>
          <span class="diamond-accent" aria-hidden="true"></span>
        </div>
        <p class="tagline">1v1 pixel sword duel</p>
      </header>

      <div class="panel">
        <div class="panel-border" aria-hidden="true"></div>

        {#if mode === 'menu'}
          <div class="panel-inner fade-in">
            <div class="identity">
              <span class="identity-label">Playing as</span>
              <span class="identity-name">{$currentUser?.displayName ?? '...'}</span>
            </div>
            <p class="panel-description">
              Keyboard-controlled 1v1 dueling.
              P1: <strong>WASD + Q + Space</strong>.
              P2: <strong>Arrows + / + ,</strong>
            </p>
            <div class="action-row">
              <button class="btn-primary btn-full" onclick={createRoom} disabled={joining}>
                {joining ? 'Creating...' : 'Create Room'}
              </button>
              <button class="btn-secondary btn-full" onclick={() => mode = 'join'}>Join Room</button>
            </div>
          </div>

        {:else if mode === 'join'}
          <div class="panel-inner fade-in">
            <label class="field-label" for="room-code-input">Room code</label>
            <input
              id="room-code-input"
              value={roomCode}
              oninput={(e) => roomCode = e.currentTarget.value}
              placeholder="ABCD"
              maxlength="4"
              class="code-input"
              onkeydown={handleKeydown}
            />
            <div class="action-row">
              <button
                class="btn-primary btn-full"
                onclick={joinRoom}
                disabled={roomCode.trim().length < 4}
              >
                Join Room
              </button>
              <button class="btn-secondary btn-full" onclick={() => { mode = 'menu'; roomCode = ''; }}>
                Back
              </button>
            </div>
          </div>
        {/if}
      </div>

      <section class="controls-hint">
        <h2 class="controls-heading geo-title">Controls</h2>
        <div class="controls-grid">
          <div class="controls-col">
            <p class="controls-player">Player 1</p>
            <ul class="controls-list">
              <li><kbd>A</kbd> / <kbd>D</kbd> Move</li>
              <li><kbd>W</kbd> Jump</li>
              <li><kbd>S</kbd> Duck / aim low</li>
              <li><kbd>W</kbd> + hold Aim high</li>
              <li><kbd>Q</kbd> Attack / block</li>
              <li><kbd>Space</kbd> Run</li>
            </ul>
          </div>
          <div class="controls-col">
            <p class="controls-player">Player 2</p>
            <ul class="controls-list">
              <li><kbd>&larr;</kbd> / <kbd>&rarr;</kbd> Move</li>
              <li><kbd>&uarr;</kbd> Jump</li>
              <li><kbd>&darr;</kbd> Duck / aim low</li>
              <li><kbd>&uarr;</kbd> + hold Aim high</li>
              <li><kbd>/</kbd> Attack / block</li>
              <li><kbd>,</kbd> Run</li>
            </ul>
          </div>
        </div>
      </section>

      <footer class="attribution">
        Eggnogg+ original game by madgarden (2014). Fan-port. Sprites used with credit:
        <a href="https://madgarden.itch.io/eggnogg" target="_blank" rel="noopener noreferrer">
          madgarden.itch.io/eggnogg
        </a>
      </footer>
    </div>
  </div>
{/if}

<style>
  .home {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 5rem 1.25rem 4rem;
  }

  .content {
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

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
    font-size: clamp(2.5rem, 10vw, 4rem);
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1;
    color: var(--accent);
    background: linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 60%, var(--accent-dim) 100%);
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

  .panel {
    background: var(--bg-card);
    clip-path: var(--clip-card);
    overflow: visible;
    position: relative;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  .panel-border {
    position: absolute;
    inset: -1px;
    clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
    pointer-events: none;
  }

  .panel-inner {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.5rem;
  }

  .field-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .action-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-full {
    width: 100%;
    padding: 0.875rem 1.25rem;
    font-size: 0.9375rem;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.875rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .identity-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .identity-name {
    font-size: 0.9rem;
    color: var(--accent);
    font-weight: 500;
  }

  .panel-description {
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .panel-description strong {
    color: var(--accent);
    font-weight: 600;
  }

  .code-input {
    font-family: 'Rajdhani', system-ui, sans-serif !important;
    text-transform: uppercase;
    text-align: center;
    font-size: 2rem !important;
    letter-spacing: 0.4em;
    font-weight: 700 !important;
    padding: 0.875rem !important;
    color: var(--accent) !important;
  }

  /* Controls hint section */
  .controls-hint {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both;
  }

  .controls-heading {
    font-size: 0.65rem;
    letter-spacing: 0.16em;
    color: var(--text-subtle);
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  .controls-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .controls-player {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.4rem;
  }

  .controls-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .controls-list li {
    font-size: 0.8rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  kbd {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.1rem 0.35rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    color: var(--accent);
    letter-spacing: 0;
    white-space: nowrap;
  }

  /* Attribution footer */
  .attribution {
    font-size: 0.72rem;
    color: var(--text-subtle);
    line-height: 1.6;
    text-align: center;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.24s both;
  }

  .attribution a {
    color: var(--accent);
    text-decoration: none;
  }

  .attribution a:hover {
    text-decoration: underline;
  }

  /* Mobile gate */
  .mobile-gate {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .mobile-gate-inner {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    max-width: 320px;
  }

  .mobile-icon {
    font-size: 3rem;
    line-height: 1;
  }

  .mobile-title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
  }

  .mobile-body {
    font-size: 0.9rem;
    color: var(--text-muted);
    line-height: 1.6;
  }

  /* Error toast */
  .error-toast {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    background: #e74c3c;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    animation: fadeUp 0.3s ease;
  }

  @media (min-width: 480px) {
    .panel-inner { padding: 1.875rem; }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-secondary:hover:not(:disabled) { background: var(--accent-border); color: var(--accent); }
</style>
