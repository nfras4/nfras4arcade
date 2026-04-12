<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';

  let displayName = $derived($isLoggedIn ? $currentUser?.displayName : getGuestDisplayName());

  let roomCode = $state('');
  let joining = $state(false);
  let mode = $state<'menu' | 'role' | 'join'>('menu');
  let showRules = $state(false);
  let createdCode = $state('');
  let error = $state<string | null>(null);
  let errorTimeout: ReturnType<typeof setTimeout>;

  function showError(msg: string) {
    error = msg;
    clearTimeout(errorTimeout);
    errorTimeout = setTimeout(() => { error = null; }, 4000);
  }

  async function createRoom() {
    joining = true;
    try {
      const res = await fetch('/api/create', { method: 'POST' });
      const data: { code?: string; error?: string } = await res.json();
      if (data.error || !data.code) {
        showError(data.error || 'Failed to create room');
        joining = false;
        return;
      }
      createdCode = data.code;
      mode = 'role';
      joining = false;
    } catch {
      showError('Could not connect to server');
      joining = false;
    }
  }

  function joinAsCenter() {
    goto(`/snap/${createdCode}?role=center`);
  }

  function joinAsPlayer() {
    goto(`/snap/${createdCode}`);
  }

  function joinRoom() {
    if (!roomCode.trim()) return;
    const code = roomCode.trim().toUpperCase();
    goto(`/snap/${code}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') joinRoom();
  }
</script>

{#if error}
  <div class="error-toast">{error}</div>
{/if}

<div class="home">
  <div class="content">
    <header class="hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">Snap</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Race to slap matching cards!</p>
    </header>

    <div class="panel">
      <div class="panel-border" aria-hidden="true"></div>

      {#if mode === 'menu'}
        <div class="panel-inner fade-in">
          <div class="identity">
            <span class="identity-label">Playing as</span>
            <span class="identity-name">{displayName}</span>
          </div>
          <p class="panel-description">2-6 players. One phone becomes the center snap pad.</p>
          <div class="action-row">
            <button class="btn-primary btn-full" onclick={createRoom} disabled={joining}>{joining ? 'Creating...' : 'Create Room'}</button>
            <button class="btn-secondary btn-full" onclick={() => mode = 'join'}>Join Room</button>
          </div>
        </div>

      {:else if mode === 'role'}
        <div class="panel-inner fade-in">
          <p class="panel-description">Room <strong>{createdCode}</strong> created. Choose this device's role:</p>
          <div class="action-row">
            <button class="btn-primary btn-full role-btn" onclick={joinAsCenter}>
              <span class="role-title">This Device is the Center Pad</span>
              <span class="role-desc">Place face-up in the middle of the table</span>
            </button>
            <button class="btn-secondary btn-full role-btn" onclick={joinAsPlayer}>
              <span class="role-title">I'm a Player</span>
              <span class="role-desc">Play from your own phone</span>
            </button>
          </div>
          <p class="panel-hint">Place one phone face-up in the middle of the table as the Snap Pad. Everyone else joins as a Player.</p>
        </div>

      {:else if mode === 'join'}
        <div class="panel-inner fade-in">
          <div class="identity">
            <span class="identity-label">Playing as</span>
            <span class="identity-name">{displayName}</span>
          </div>
          <label class="field-label" for="room-code-input">Room code</label>
          <input
            id="room-code-input"
            bind:value={roomCode}
            placeholder="ABCD"
            maxlength="4"
            class="code-input"
            onkeydown={handleKeydown}
          />
          <div class="action-row">
            <button class="btn-primary btn-full" onclick={joinRoom} disabled={joining || roomCode.length < 4}>
              {joining ? 'Joining...' : 'Join Room'}
            </button>
            <button class="btn-secondary btn-full" onclick={() => { mode = 'menu'; joining = false; }}>Back</button>
          </div>
        </div>
      {/if}
    </div>

    <section class="rules">
      <button class="rules-toggle" onclick={() => showRules = !showRules}>
        <h2 class="rules-heading geo-title">How to Play Snap</h2>
        <span class="toggle-arrow">{showRules ? 'Hide' : 'Show'}</span>
      </button>
      {#if showRules}
        <ol class="rules-list fade-in">
          <li><span class="step-num" aria-hidden="true">1</span><span>Each player takes turns <strong>drawing a card</strong> to the center pile</span></li>
          <li><span class="step-num" aria-hidden="true">2</span><span>When two cards in a row <strong>match rank</strong>, race to tap SNAP!</span></li>
          <li><span class="step-num" aria-hidden="true">3</span><span><strong>First to snap</strong> wins the entire pile</span></li>
          <li><span class="step-num" aria-hidden="true">4</span><span><strong>False snap:</strong> lose 3 cards as a penalty</span></li>
          <li><span class="step-num" aria-hidden="true">5</span><span><strong>Collect all the cards</strong> to win</span></li>
        </ol>
      {/if}
    </section>
  </div>
</div>

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
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .hero { text-align: center; animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }

  .title-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .wordmark {
    font-size: clamp(2.75rem, 10vw, 4.5rem);
    font-weight: 700;
    letter-spacing: 0.18em;
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

  .panel-hint {
    font-size: 0.75rem;
    color: var(--text-subtle);
    line-height: 1.5;
    text-align: center;
    margin-top: 0.25rem;
  }

  .role-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1.25rem 1rem;
    min-height: 80px;
  }

  .role-title {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .role-desc {
    font-size: 0.75rem;
    opacity: 0.7;
    font-weight: 400;
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

  .rules { animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.16s both; }

  .rules-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    clip-path: none;
  }

  .rules-heading {
    font-size: 0.65rem;
    letter-spacing: 0.16em;
    color: var(--text-subtle);
  }

  .toggle-arrow {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .rules-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-top: 1rem;
  }

  .rules-list li {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    padding: 0.75rem 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.55;
    border-bottom: 1px solid var(--border);
  }

  .rules-list li:last-child { border-bottom: none; }
  .rules-list li strong { color: var(--text); font-weight: 500; }

  .step-num {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    background: var(--accent-faint);
    clip-path: var(--clip-diamond);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--accent);
    margin-top: 0.2rem;
    line-height: 1;
  }

  @media (min-width: 480px) {
    .panel-inner { padding: 1.875rem; }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-secondary:hover:not(:disabled) { background: var(--accent-border); color: var(--accent); }
  .rules-toggle:hover .rules-heading { color: var(--accent); }
</style>
