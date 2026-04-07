<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    currentUser, userStats, userBadges, isLoggedIn, fetchUser,
    gameHistory, perGameStats,
    type AuthBadge,
  } from '$lib/auth';

  let editingName = $state(false);
  let editName = $state('');
  let editAvatar = $state('');
  let saving = $state(false);
  let saveError = $state('');

  const allBadges = [
    { slug: 'first_game', label: 'First Game', description: 'Play your first game', icon: 'star' },
    { slug: 'impostor_win', label: 'Impostor Win', description: 'Win as the impostor', icon: 'mask' },
    { slug: 'perfect_detective', label: 'Perfect Detective', description: 'Vote correctly when everyone else does too', icon: 'search' },
    { slug: 'veteran', label: 'Veteran', description: 'Play 10 games', icon: 'shield' },
    { slug: 'champion', label: 'Champion', description: 'Win your first game', icon: 'trophy' },
    { slug: 'going_bananas', label: 'Going Bananas', description: 'Play 50 games', icon: 'banana' },
  ];

  const gameTypeLabels: Record<string, string> = {
    'impostor': 'Impostor',
    'president': 'President',
    'chase-the-queen': 'Chase the Queen',
  };

  $effect(() => {
    fetchUser().then(user => {
      if (!user) goto('/login');
    });
  });

  $effect(() => {
    if ($currentUser) {
      editName = $currentUser.displayName;
      editAvatar = $currentUser.avatar || '';
    }
  });

  function isEarned(slug: string): boolean {
    return $userBadges.some(b => b.slug === slug);
  }

  function winRate(): string {
    if (!$userStats || $userStats.gamesPlayed === 0) return '0%';
    return Math.round(($userStats.gamesWon / $userStats.gamesPlayed) * 100) + '%';
  }

  function badgeSymbol(icon: string): string {
    const symbols: Record<string, string> = {
      star: '*', mask: '?', search: '!', shield: '#', trophy: '+', banana: '~',
    };
    return symbols[icon] || '*';
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    });
  }

  async function saveProfile() {
    saving = true;
    saveError = '';
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: editName.trim(), avatar: editAvatar.trim() || null }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        saveError = data.error || 'Failed to save';
      } else {
        await fetchUser();
        editingName = false;
      }
    } catch {
      saveError = 'Failed to save';
    }
    saving = false;
  }
</script>

<div class="profile-page">
  <div class="profile-content">
    <h1 class="page-title geo-title">Profile</h1>

    {#if $currentUser}
      <!-- Identity card -->
      <div class="card profile-card">
        <div class="profile-header">
          <div class="avatar-circle">
            {$currentUser.avatar || $currentUser.displayName[0]?.toUpperCase()}
          </div>
          <div class="profile-info">
            {#if editingName}
              <div class="edit-fields">
                <input
                  bind:value={editName}
                  placeholder="Display name"
                  maxlength="20"
                  class="edit-input"
                />
                <input
                  bind:value={editAvatar}
                  placeholder="Avatar (emoji or URL)"
                  maxlength="200"
                  class="edit-input"
                />
                {#if saveError}<p class="edit-error">{saveError}</p>{/if}
                <div class="edit-actions">
                  <button class="btn-primary btn-small" onclick={saveProfile} disabled={saving || !editName.trim()}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button class="btn-secondary btn-small" onclick={() => { editingName = false; editName = $currentUser?.displayName || ''; editAvatar = $currentUser?.avatar || ''; }}>
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <h2 class="display-name">{$currentUser.displayName}</h2>
              <p class="email">{$currentUser.email}</p>
              <button class="btn-secondary btn-small edit-btn" onclick={() => { editingName = true; }}>
                Edit Profile
              </button>
            {/if}
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="card stats-card">
        <h3 class="card-heading geo-title">Stats</h3>
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-value">{$userStats?.gamesPlayed ?? 0}</span>
            <span class="stat-label">Games Played</span>
          </div>
          <div class="stat">
            <span class="stat-value">{$userStats?.gamesWon ?? 0}</span>
            <span class="stat-label">Games Won</span>
          </div>
          <div class="stat">
            <span class="stat-value">{winRate()}</span>
            <span class="stat-label">Win Rate</span>
          </div>
        </div>
      </div>

      <!-- Per-game stats -->
      {#if $perGameStats.length > 0}
        <div class="card pergame-card">
          <h3 class="card-heading geo-title">Per Game</h3>
          <div class="pergame-list">
            {#each $perGameStats as gs}
              <div class="pergame-row">
                <span class="pergame-name">{gameTypeLabels[gs.gameType] || gs.gameType}</span>
                <div class="pergame-stats">
                  <span class="pergame-stat">{gs.played} played</span>
                  <span class="pergame-stat">{gs.won} won</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Badges -->
      <div class="card badges-card">
        <h3 class="card-heading geo-title">Badges</h3>
        <div class="badge-grid">
          {#each allBadges as badge}
            <div class="badge-item" class:earned={isEarned(badge.slug)} title={badge.description}>
              <div class="badge-icon">{badgeSymbol(badge.icon)}</div>
              <span class="badge-label">{badge.label}</span>
            </div>
          {/each}
        </div>
      </div>

      <!-- Recent games -->
      <div class="card history-card">
        <h3 class="card-heading geo-title">Recent Games</h3>
        {#if $gameHistory.length > 0}
          <div class="history-list">
            {#each $gameHistory as game}
              <div class="history-row">
                <div class="history-left">
                  <span class="history-game">{gameTypeLabels[game.gameType] || game.gameType}</span>
                  <span class="history-meta">{game.playerCount} players</span>
                </div>
                <div class="history-right">
                  <span class="history-result" class:won={game.won}>{game.won ? 'Won' : 'Lost'}</span>
                  <span class="history-date">{formatDate(game.endedAt)}</span>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty-state">No games played yet. Jump into a game to start your history!</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .profile-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5rem 1.25rem 4rem;
  }

  .profile-content {
    width: 100%;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .page-title {
    font-size: 1.5rem;
    letter-spacing: 0.12em;
    color: var(--accent);
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .profile-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
  }

  .profile-header {
    display: flex;
    gap: 1.25rem;
    align-items: flex-start;
  }

  .avatar-circle {
    width: 56px;
    height: 56px;
    background: var(--accent-faint);
    border: 1px solid var(--accent-border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--accent);
    flex-shrink: 0;
  }

  .profile-info {
    flex: 1;
    min-width: 0;
  }

  .display-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.04em;
  }

  .email {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.125rem;
  }

  .edit-btn {
    margin-top: 0.5rem;
  }

  .edit-fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .edit-input {
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
  }

  .edit-error {
    font-size: 0.8rem;
    color: var(--red);
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Stats */
  .stats-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
  }

  .card-heading {
    font-size: 0.65rem;
    letter-spacing: 0.16em;
    color: var(--text-subtle);
    margin-bottom: 1rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    text-align: center;
  }

  .stat-value {
    display: block;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--accent);
    line-height: 1;
  }

  .stat-label {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-top: 0.375rem;
  }

  /* Per-game stats */
  .pergame-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
  }

  .pergame-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .pergame-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }

  .pergame-row:last-child {
    border-bottom: none;
  }

  .pergame-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .pergame-stats {
    display: flex;
    gap: 1rem;
  }

  .pergame-stat {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 500;
  }

  /* Badges */
  .badges-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both;
  }

  .badge-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.75rem;
  }

  .badge-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.75rem 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
    opacity: 0.35;
    transition: opacity 0.15s ease;
  }

  .badge-item.earned {
    opacity: 1;
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .badge-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--accent);
    background: var(--accent-faint);
    clip-path: var(--clip-diamond);
  }

  .badge-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.3;
  }

  .badge-item.earned .badge-label {
    color: var(--text);
  }

  /* Game history */
  .history-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .history-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
  }

  .history-row:last-child {
    border-bottom: none;
  }

  .history-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .history-game {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .history-meta {
    font-size: 0.7rem;
    color: var(--text-subtle);
  }

  .history-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .history-result {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .history-result.won {
    color: var(--green);
    border-color: rgba(61, 214, 140, 0.3);
    background: rgba(61, 214, 140, 0.06);
  }

  .history-date {
    font-size: 0.7rem;
    color: var(--text-subtle);
    min-width: 48px;
    text-align: right;
  }

  .empty-state {
    font-size: 0.8125rem;
    color: var(--text-muted);
    line-height: 1.6;
    text-align: center;
    padding: 1rem 0;
  }
</style>
