<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { currentUser, isLoggedIn, logout, fetchUser } from '$lib/auth';
  import FeedbackWidget from '$lib/components/FeedbackWidget.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  let theme = $state<'dark' | 'light'>('dark');

  let showCopied = $state(false);

  let roomCode = $derived((() => {
    const parts = $page.url.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const maybeCode = parts[parts.length - 1].toUpperCase();
      if (/^[A-Z]{4}$/.test(maybeCode)) return maybeCode;
    }
    return null;
  })());

  function copyRoomCode() {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    showCopied = true;
    setTimeout(() => { showCopied = false; }, 1500);
  }

  $effect(() => {
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch {}
  });

  $effect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  });

  $effect(() => {
    fetchUser();
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
  }

  async function handleLogout() {
    await logout();
    goto('/');
  }
</script>

<nav class="top-nav">
  <a href="/" class="nav-brand geo-title">nfras4arcade</a>

  {#if roomCode}
    <button class="nav-room-code" onclick={copyRoomCode} title="Click to copy room code">
      <span class="nav-room-label">ROOM</span>
      <span class="nav-room-value">{roomCode}</span>
      {#if showCopied}<span class="nav-copied">Copied!</span>{/if}
    </button>
  {/if}

  <div class="nav-right">
    <button
      class="theme-toggle"
      onclick={toggleTheme}
      aria-label="Toggle {theme === 'dark' ? 'light' : 'dark'} mode"
      title="Toggle theme"
    >
      {theme === 'dark' ? 'light' : 'dark'}
    </button>

    {#if $isLoggedIn}
      <a href="/profile" class="nav-profile-link" title="Profile">
        <span class="nav-avatar">{$currentUser?.avatar || $currentUser?.displayName[0]?.toUpperCase()}</span>
        <span class="nav-display-name">{$currentUser?.displayName}</span>
      </a>
      <button class="nav-logout-btn" onclick={handleLogout} title="Log out">
        Log Out
      </button>
    {:else}
      <a href="/login" class="nav-link">Log In</a>
    {/if}
  </div>
</nav>

{@render children()}

<FeedbackWidget />

<style>
  .top-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.25rem;
    height: 3.25rem;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border);
  }

  .nav-brand {
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    color: var(--accent);
    text-decoration: none;
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    overflow: hidden;
    min-width: 0;
  }

  .theme-toggle {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    clip-path: none;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .theme-toggle:hover {
    color: var(--accent);
    border-color: var(--accent-border);
  }

  .nav-link {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.5rem;
    min-height: 44px;
    display: flex;
    align-items: center;
    transition: color 0.15s ease;
  }

  .nav-link:hover {
    color: var(--accent);
  }

  .nav-profile-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    text-decoration: none;
    padding: 0.4rem 0.6rem;
    min-height: 44px;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    transition: background 0.15s ease;
  }

  .nav-profile-link:hover {
    background: var(--accent-border);
  }

  .nav-avatar {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-faint);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .nav-display-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .nav-logout-btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    min-width: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 2px;
    clip-path: none;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .nav-logout-btn:hover {
    color: var(--red);
    border-color: var(--red);
  }

  @media (max-width: 480px) {
    .nav-display-name {
      display: none;
    }
  }

  @media (max-width: 380px) {
    .top-nav {
      padding: 0 0.5rem;
      gap: 0.25rem;
    }
    .nav-room-code {
      padding: 0.25rem 0.4rem;
      gap: 0.2rem;
    }
    .nav-room-value {
      font-size: 0.85rem;
      letter-spacing: 0.12em;
    }
    .nav-room-label {
      display: none;
    }
  }

  .nav-room-code {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    min-height: 44px;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    cursor: pointer;
    clip-path: none;
    position: relative;
    transition: background 0.15s ease;
  }

  .nav-room-code:hover {
    background: var(--accent-border);
  }

  .nav-room-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .nav-room-value {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--accent);
  }

  .nav-copied {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 4px;
    background: var(--green, #22c55e);
    color: #000;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 60;
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }
</style>
