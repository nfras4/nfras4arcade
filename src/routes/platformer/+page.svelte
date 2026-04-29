<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn } from '$lib/auth';
  import { getGuestDisplayName } from '$lib/guest';

  let displayName = $derived($isLoggedIn ? $currentUser?.displayName : getGuestDisplayName());

  let roomCode = $state('');
  let joining = $state(false);
  let mode: 'menu' | 'join' = $state('menu');
  let error: string | null = $state(null);
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
      goto(`/platformer/${data.code}`);
    } catch {
      showError('Could not connect to server');
      joining = false;
    }
  }

  function joinRoom() {
    if (!roomCode.trim()) return;
    const code = roomCode.trim().toUpperCase();
    goto(`/platformer/${code}`);
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
      <a href="/games" class="back-link geo-title">← Party Games</a>
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">Platformer</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Knock rivals off the stage</p>
      <span class="experimental-badge">EXPERIMENTAL</span>
    </header>

    <div class="panel">
      <div class="panel-border" aria-hidden="true"></div>

      {#if mode === 'menu'}
        <div class="panel-inner fade-in">
          <div class="identity">
            <span class="identity-label">Playing as</span>
            <span class="identity-name">{displayName}</span>
          </div>
          <p class="panel-description">2-4 players. Last fighter standing wins the round. First to 2 round wins takes the match.</p>
          <p class="controls-hint">Move: A/D or ← →&nbsp;&nbsp;Jump: Space (double-tap for double jump)&nbsp;&nbsp;Attack: J or K</p>
          <div class="action-row">
            <button class="btn-primary btn-full" onclick={createRoom} disabled={joining}>{joining ? 'Creating...' : 'Create Room'}</button>
            <button class="btn-secondary btn-full" onclick={() => mode = 'join'}>Join Room</button>
          </div>
        </div>

      {:else}
        <div class="panel-inner fade-in">
          <p class="panel-description">Enter the 4-letter room code:</p>
          <input
            type="text"
            bind:value={roomCode}
            onkeydown={handleKeydown}
            placeholder="CODE"
            maxlength="4"
            class="code-input"
            autocapitalize="characters"
            autocomplete="off"
          />
          <div class="action-row">
            <button class="btn-primary btn-full" onclick={joinRoom}>Join</button>
            <button class="btn-secondary btn-full" onclick={() => mode = 'menu'}>Back</button>
          </div>
        </div>
      {/if}
    </div>
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
    justify-content: center;
    padding: 5rem 1.25rem 4rem;
  }
  .content { width: 100%; max-width: 460px; display: flex; flex-direction: column; gap: 2rem; }
  .hero { text-align: center; position: relative; }
  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    color: var(--text-subtle);
    text-decoration: none;
  }
  .back-link:hover { color: var(--accent); }
  .title-frame { display: flex; align-items: center; justify-content: center; gap: 1rem; }
  .wordmark {
    font-size: clamp(2rem, 8vw, 3.5rem);
    font-weight: 700;
    letter-spacing: 0.14em;
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
  .experimental-badge {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.2rem 0.6rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: #f0c030;
    border: 1px solid #f0c03050;
    background: #f0c03010;
    border-radius: 2px;
  }
  .panel { background: var(--bg-card); clip-path: var(--clip-card); position: relative; }
  .panel-border {
    position: absolute; inset: -1px; clip-path: var(--clip-card);
    background: linear-gradient(135deg, var(--accent-border), var(--border));
    z-index: -1;
    pointer-events: none;
  }
  .panel-inner { display: flex; flex-direction: column; gap: 0.875rem; padding: 1.5rem; }
  .identity { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
  .identity-label { font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-subtle); }
  .identity-name { font-family: 'Rajdhani', system-ui, sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--accent); }
  .panel-description { font-size: 0.875rem; color: var(--text-muted); text-align: center; line-height: 1.5; }
  .controls-hint { font-size: 0.7rem; color: var(--text-subtle); text-align: center; line-height: 1.6; font-family: 'Rajdhani', system-ui, sans-serif; }
  .code-input {
    width: 100%;
    padding: 1rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 2rem;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: var(--accent);
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
  }
  .code-input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
  .action-row { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
  .btn-full { width: 100%; padding: 0.875rem 1.25rem; }
  .error-toast {
    position: fixed; top: 4rem; left: 50%; transform: translateX(-50%);
    background: var(--bg-card); border: 1px solid #d04040; color: #ff6060;
    padding: 0.75rem 1.25rem; border-radius: 2px; z-index: 100;
    font-size: 0.85rem;
  }
  .fade-in { animation: fadeIn 0.2s ease both; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>
