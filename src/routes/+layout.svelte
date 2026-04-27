<script lang="ts">
  import '../app.css';
  import { goto } from '$app/navigation';
  import LevelUpToast from '$lib/components/LevelUpToast.svelte';
  import XpGainedToast from '$lib/components/XpGainedToast.svelte';
  import { page } from '$app/stores';
  import { currentUser, userStats, isLoggedIn, logout, fetchUser } from '$lib/auth';
  import { canClaim, nextClaimAt, canHourlyClaim, nextHourlyClaimAt, fetchChipStatus } from '$lib/chipStatus';
  import { xpToLevel } from '$lib/xp';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  let theme: 'dark' | 'light' = $state('dark');

  let showCopied = $state(false);
  let chipFlash = $state('');

  let userLevel = $derived(xpToLevel($userStats?.xp ?? 0));

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

  let claimCountdown = $state('');
  let claiming = $state(false);
  let hourlyCountdown = $state('');
  let claimingHourly = $state(false);

  $effect(() => {
    fetchUser();
  });

  $effect(() => {
    if ($isLoggedIn) fetchChipStatus();
  });

  $effect(() => {
    if (!$canClaim && $nextClaimAt) {
      const target = $nextClaimAt;
      const interval = setInterval(() => {
        const remaining = target - Date.now();
        if (remaining <= 0) {
          canClaim.set(true);
          claimCountdown = '';
          clearInterval(interval);
        } else {
          const h = Math.floor(remaining / 3600000);
          const m = Math.floor((remaining % 3600000) / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          claimCountdown = `${h}h ${m}m ${s}s`;
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  });

  $effect(() => {
    if (!$canHourlyClaim && $nextHourlyClaimAt) {
      const target = $nextHourlyClaimAt;
      const interval = setInterval(() => {
        const remaining = target - Date.now();
        if (remaining <= 0) {
          canHourlyClaim.set(true);
          hourlyCountdown = '';
          clearInterval(interval);
        } else {
          const m = Math.floor(remaining / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          hourlyCountdown = `${m}m ${s}s`;
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  });

  async function claimChips() {
    claiming = true;
    try {
      const res = await fetch('/api/chips/claim', { method: 'POST' });
      const data: any = await res.json();
      if (data.success) {
        canClaim.set(false);
        nextClaimAt.set(data.nextClaimAt);
        userStats.update(s => s ? { ...s, chips: data.chips } : s);
        chipFlash = '+500';
        setTimeout(() => chipFlash = '', 1500);
      }
    } catch {}
    claiming = false;
  }

  async function claimHourly() {
    claimingHourly = true;
    try {
      const res = await fetch('/api/chips/hourly', { method: 'POST' });
      const data: any = await res.json();
      if (data.success) {
        canHourlyClaim.set(false);
        nextHourlyClaimAt.set(data.nextHourlyClaimAt);
        userStats.update(s => s ? { ...s, chips: data.chips } : s);
        chipFlash = '+50';
        setTimeout(() => chipFlash = '', 1500);
      }
    } catch {}
    claimingHourly = false;
  }

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
    <button class="theme-toggle" onclick={toggleTheme} aria-label="Switch to {theme === 'dark' ? 'light' : 'dark'} mode" title="Toggle theme">
      {#if theme === 'dark'}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      {/if}
    </button>

    {#if $isLoggedIn}
      {#if $userStats}
        <span class="nav-level">Lv.{userLevel}</span>
        <span class="nav-chips-group">
          <span class="nav-chips" title="Chips">
            <svg class="chip-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
            {$userStats.chips}
            {#if chipFlash}<span class="chip-flash">{chipFlash}</span>{/if}
          </span>
          {#if $canClaim}
            <button class="nav-claim-btn" onclick={claimChips} disabled={claiming} title="Claim daily 500 chips">
              {claiming ? '...' : '+500'}
            </button>
          {:else if claimCountdown}
            <span class="nav-claim-timer" title="Daily claim">{claimCountdown}</span>
          {/if}
          {#if $canHourlyClaim}
            <button class="nav-claim-btn nav-claim-hourly" onclick={claimHourly} disabled={claimingHourly} title="Claim hourly 50 chips">
              {claimingHourly ? '...' : '+50'}
            </button>
          {:else if hourlyCountdown}
            <span class="nav-claim-timer nav-claim-timer-hourly" title="Hourly claim">{hourlyCountdown}</span>
          {/if}
        </span>
      {/if}
      <a href="/customize" class="nav-link nav-customize-link" title="Customize">Customize</a>
      <a href="/profile" class="nav-profile-link" title="Profile">
        <span class="nav-avatar">{$currentUser?.avatar || $currentUser?.displayName[0]?.toUpperCase()}</span>
        <span class="nav-display-name" style:color={$currentUser?.nameColour || undefined}>{$currentUser?.displayName}</span>{#if $currentUser?.displayName === 'nfras4'}<span class="owner-crown" title="Site Owner" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M3 8l3 6h12l3-6-5 3-4-6-4 6z"/></svg>
        </span>{/if}
      </a>
      <button class="nav-logout-btn" onclick={handleLogout} title="Log out">
        Log Out
      </button>
    {:else}
      <a href="/login" class="nav-link">Log In</a>
    {/if}
  </div>
</nav>

<a href="#main-content" class="skip-link">Skip to main content</a>
<LevelUpToast />
<XpGainedToast />
<main id="main-content">
  {@render children()}
</main>

{#if !roomCode}
  <a href="/about" class="corner-about" title="About this project">About</a>
{/if}


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
    padding: env(safe-area-inset-top) 1.25rem 0;
    height: calc(3.25rem + env(safe-area-inset-top));
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

  .owner-crown { font-size: 0.7rem; margin-left: 0.1rem; }

  .chip-flash {
    position: absolute;
    top: -0.5rem;
    right: -0.25rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    color: #3dd68c;
    animation: chipFlashUp 1.5s ease-out forwards;
    pointer-events: none;
  }

  @keyframes chipFlashUp {
    0% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-12px); }
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

  .nav-level {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--yellow, #eab308);
    padding: 0.1rem 0.35rem;
    border: 1px solid rgba(234, 179, 8, 0.3);
    border-radius: 2px;
    font-variant-numeric: tabular-nums;
  }

  .nav-chips {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--accent);
    cursor: default;
    font-variant-numeric: tabular-nums;
  }

  .chip-icon {
    flex-shrink: 0;
    opacity: 0.85;
  }

  .nav-chips-group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .nav-claim-btn {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--bg);
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.1s ease;
    white-space: nowrap;
  }

  .nav-claim-btn:hover:not(:disabled) {
    opacity: 0.85;
    transform: scale(1.05);
  }

  .nav-claim-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .nav-claim-hourly {
    background: transparent;
    color: var(--accent);
    font-size: 0.55rem;
    padding: 0.1rem 0.3rem;
  }

  .nav-claim-hourly:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }

  .nav-claim-timer {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .nav-claim-timer-hourly {
    font-size: 0.5rem;
  }

  .nav-customize-link {
    padding: 0.5rem 0.6rem;
  }

  @media (max-width: 480px) {
    .nav-display-name {
      display: none;
    }
    .nav-chips-group {
      display: none;
    }
    .nav-customize-link {
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

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #5a8a5a); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  .skip-link {
    position: absolute;
    top: -999px;
    left: 0;
    background: var(--accent);
    color: var(--btn-primary-text);
    padding: 0.75rem 1rem;
    z-index: 100;
    text-decoration: none;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.75rem;
  }
  .skip-link:focus {
    top: 0;
  }

  .corner-about {
    position: fixed;
    left: max(1rem, env(safe-area-inset-left));
    bottom: max(1rem, env(safe-area-inset-bottom));
    z-index: 40;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.5rem 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .corner-about:hover {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  @media (max-width: 480px) {
    .corner-about {
      font-size: 0.6rem;
      padding: 0.4rem 0.6rem;
    }
  }
</style>
