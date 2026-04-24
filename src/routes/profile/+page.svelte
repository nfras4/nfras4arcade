<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    currentUser, userStats, userBadges, isLoggedIn, fetchUser,
    gameHistory, perGameStats,
    type AuthBadge,
  } from '$lib/auth';
  import { canClaim, nextClaimAt, canHourlyClaim, nextHourlyClaimAt, fetchChipStatus } from '$lib/chipStatus';
  import { xpProgress, levelXpThreshold } from '$lib/xp';

  interface RewardItem {
    id: string;
    name: string;
    category: string;
    subcategory: string | null;
    price: number;
    tier: 'hero' | 'minor';
    level_requirement: number;
  }

  const cosmeticTypeLabel: Record<string, string> = {
    frame: 'Frame',
    emblem: 'Emblem',
    avatar: 'Avatar',
    name_colour: 'Name Colour',
    card_back: 'Card Back',
    table_felt: 'Table Felt',
  };

  let rewardItems = $state<RewardItem[]>([]);
  let rewardOwned = $state<Record<string, number>>({});
  let rewardsLoading = $state(false);

  let editingName = $state(false);
  let editName = $state('');
  let editAvatar = $state('');
  let saving = $state(false);
  let saveError = $state('');
  let claiming = $state(false);
  let claimCountdown = $state('');
  let claimingHourly = $state(false);
  let hourlyCountdown = $state('');

  interface BadgeDef {
    slug: string;
    label: string;
    description: string;
    emoji: string;
    secret?: boolean;
  }

  const allBadges: BadgeDef[] = [
    { slug: 'first_game',        label: 'First Game',        description: 'Play your first game',                              emoji: '\u{1F3AE}' },
    { slug: 'champion',          label: 'Champion',          description: 'Win your first game',                               emoji: '\u{1F3C6}' },
    { slug: 'veteran',           label: 'Veteran',           description: 'Play 10 games',                                     emoji: '\u{2B50}' },
    { slug: 'impostor_win',      label: 'Impostor Win',      description: 'Win as the impostor',                               emoji: '\u{1F3AD}' },
    { slug: 'perfect_detective', label: 'Perfect Detective', description: 'Vote correctly when everyone else does too',         emoji: '\u{1F50D}' },
    { slug: 'going_bananas',     label: 'Going Bananas',     description: 'Shoot the moon in Chase the Queen',                 emoji: '\u{1F34C}' },
    { slug: 'lone_monkey',       label: 'Lone Monkey',       description: 'Won a game solo against bots',                      emoji: '\u{1F412}' },
    { slug: 'connect_four_win',  label: 'Four in a Row',     description: 'Win a game of Connect 4',                           emoji: '\u{1F534}' },
    { slug: 'social_butterfly',  label: 'Social Butterfly',  description: 'Win games of 3 or more game types',                 emoji: '\u{1F98B}' },
    { slug: 'card_shark',        label: 'Card Shark',        description: 'Win 10 card games',                                 emoji: '\u{1F988}' },
    { slug: 'poker_win',         label: 'High Roller',       description: 'Win a hand of Texas Hold\'em',                     emoji: '\u{1F0CF}' },
    { slug: 'snap_win',          label: 'Quick Reflexes',    description: 'Win a game of Snap',                                emoji: '\u{1F44F}' },
    // Easter eggs — hidden until earned
    { slug: 'night_owl',         label: 'Night Owl',         description: 'Play a game between midnight and 5am',              emoji: '\u{1F989}', secret: true },
    { slug: 'stalemate',         label: 'Stalemate',         description: 'Draw in Connect 4',                                 emoji: '\u{1F91D}', secret: true },
    { slug: 'speed_demon',       label: 'Speed Demon',       description: 'Win a game in under 2 minutes',                     emoji: '\u{26A1}',  secret: true },
    { slug: 'royal_flush',      label: 'Royal Flush',       description: 'Get a royal flush in Texas Hold\'em',               emoji: '\u{1F451}', secret: true },
    { slug: 'all_in_win',       label: 'All In Win',        description: 'Win an all-in showdown',                            emoji: '\u{1F4B0}', secret: true },
    { slug: 'snap_streak',      label: 'Snap Streak',       description: 'Win 3 snaps in a row',                              emoji: '\u{1F525}', secret: true },
    { slug: 'b_blackjack_natural', label: 'Natural',        description: 'Get a natural blackjack (21 on first two cards)',    emoji: '\u{1F0A1}', secret: true },
    { slug: 'b_high_roller',   label: 'High Roller',       description: 'Win 1000+ chips in a single casino round',           emoji: '\u{1F4B5}', secret: true },
    { slug: 'b_roulette_win',  label: 'Lucky Number',      description: 'Win a straight-up roulette bet',                     emoji: '\u{1F3B0}', secret: true },
    { slug: 'b_lucky_streak',  label: 'Lucky Streak',      description: 'Win 5 casino rounds in a row',                       emoji: '\u{1F340}', secret: true },
    { slug: 'degen_gambler',   label: 'Degenerate Gambler', description: 'Gamble more than 100 times',                          emoji: '\u{1F911}', secret: true },
  ];

  const gameTypeLabels: Record<string, string> = {
    'impostor': 'Impostor',
    'president': 'President',
    'chase_the_queen': 'Chase the Queen',
    'chase-the-queen': 'Chase the Queen',
    'connect_four': 'Connect 4',
    'connect-four': 'Connect 4',
    'poker': 'Texas Hold\'em',
    'snap': 'Snap',
    'wavelength': 'Wavelength',
    'blackjack': 'Blackjack',
    'roulette': 'Roulette',
    'baccarat': 'Baccarat',
  };

  $effect(() => {
    fetchUser().then(user => {
      if (!user) goto('/login');
    });
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

  async function claimChips() {
    claiming = true;
    try {
      const res = await fetch('/api/chips/claim', { method: 'POST' });
      const data: any = await res.json();
      if (data.success) {
        canClaim.set(false);
        nextClaimAt.set(data.nextClaimAt);
        userStats.update(s => s ? { ...s, chips: data.chips } : s);
      }
    } catch {}
    claiming = false;
  }

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

  async function claimHourly() {
    claimingHourly = true;
    try {
      const res = await fetch('/api/chips/hourly', { method: 'POST' });
      const data: any = await res.json();
      if (data.success) {
        canHourlyClaim.set(false);
        nextHourlyClaimAt.set(data.nextHourlyClaimAt);
        userStats.update(s => s ? { ...s, chips: data.chips } : s);
      }
    } catch {}
    claimingHourly = false;
  }

  $effect(() => {
    if ($currentUser) {
      editName = $currentUser.displayName;
      editAvatar = $currentUser.avatar || '';
    }
  });

  function isEarned(slug: string): boolean {
    return $userBadges.some(b => b.slug === slug);
  }

  function earnedDate(slug: string): string {
    const badge = $userBadges.find(b => b.slug === slug);
    if (!badge) return '';
    return 'Earned ' + new Date(badge.awardedAt * 1000).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  /** Badges to display: show all non-secret + any earned secret badges */
  let visibleBadges = $derived(
    allBadges.filter(b => !b.secret || isEarned(b.slug))
  );

  let xp = $derived(xpProgress($userStats?.xp ?? 0));

  interface Milestone {
    level: number;
    label: string;
    emoji: string;
  }

  const milestones: Milestone[] = [
    { level: 2,  label: 'Newcomer',     emoji: '\u{1F331}' },
    { level: 5,  label: 'Regular',      emoji: '\u{2B50}' },
    { level: 10, label: 'Veteran',      emoji: '\u{1F396}' },
    { level: 15, label: 'Expert',       emoji: '\u{1F4AA}' },
    { level: 20, label: 'Master',       emoji: '\u{1F451}' },
    { level: 30, label: 'Legend',       emoji: '\u{1F525}' },
    { level: 50, label: 'Mythic',       emoji: '\u{1F48E}' },
  ];

  let nextMilestone = $derived(milestones.find(m => m.level > xp.level));
  let completedMilestones = $derived(milestones.filter(m => m.level <= xp.level));

  let earnedCount = $derived($userBadges.length);
  let totalCount = $derived(allBadges.length);
  let hasHiddenBadges = $derived(allBadges.some(b => b.secret && !isEarned(b.slug)));

  function winRate(): string {
    if (!$userStats || $userStats.gamesPlayed === 0) return '0%';
    return Math.round(($userStats.gamesWon / $userStats.gamesPlayed) * 100) + '%';
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    });
  }

  $effect(() => {
    if ($isLoggedIn) {
      rewardsLoading = true;
      fetch('/api/shop/items')
        .then(r => r.json() as Promise<{ items: Array<{ id: string; name: string; category: string; subcategory: string | null; price: number; tier?: string; level_requirement?: number | null }>; owned: Record<string, number> }>)
        .then((data) => {
          rewardItems = (data.items ?? []).filter(
            (it): it is RewardItem =>
              it.tier === 'hero' || it.tier === 'minor'
          ).sort((a, b) => a.level_requirement - b.level_requirement);
          rewardOwned = data.owned ?? {};
        })
        .catch(() => {})
        .finally(() => { rewardsLoading = false; });
    }
  });

  let sortedRewards = $derived(rewardItems);

  function rewardUnlocked(item: RewardItem): boolean {
    if (rewardOwned[item.id]) return true;
    return (xp.level >= item.level_requirement);
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
              <h2 class="display-name" style:color={$currentUser.nameColour || undefined}>{$currentUser.displayName}{#if $currentUser.displayName === 'nfras4'}<span class="owner-crown" title="Site Owner"> &#x1F451;</span>{/if}</h2>
              <p class="email">{$currentUser.email}</p>
              <div class="profile-action-row">
                <button class="btn-secondary btn-small edit-btn" onclick={() => { editingName = true; }}>
                  Edit Profile
                </button>
                <button class="btn-secondary btn-small edit-btn" onclick={() => goto('/customize')}>
                  Customize loadout
                </button>
              </div>
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
          <div class="stat">
            <span class="stat-value">{$userStats?.chips ?? 0}</span>
            <span class="stat-label">Chips</span>
            {#if $canClaim}
              <button class="btn-claim" onclick={claimChips} disabled={claiming}>
                {claiming ? 'Claiming...' : 'Claim 500'}
              </button>
            {:else if claimCountdown}
              <span class="claim-timer">{claimCountdown}</span>
            {/if}
            {#if $canHourlyClaim}
              <button class="btn-claim btn-claim-hourly" onclick={claimHourly} disabled={claimingHourly}>
                {claimingHourly ? 'Claiming...' : 'Claim 50'}
              </button>
            {:else if hourlyCountdown}
              <span class="claim-timer claim-timer-hourly">{hourlyCountdown}</span>
            {/if}
          </div>
        </div>

        <div class="xp-section">
          <div class="xp-header">
            <span class="xp-level">Level {xp.level}</span>
            <span class="xp-numbers">{xp.current} / {xp.needed} XP</span>
          </div>
          <div class="xp-bar">
            <div class="xp-fill" style="width: {xp.percent}%"></div>
          </div>
        </div>
      </div>

      <!-- Milestones -->
      <div class="card milestones-card">
        <h3 class="card-heading geo-title">Milestones</h3>
        <div class="milestone-track">
          {#each milestones as ms}
            {@const reached = xp.level >= ms.level}
            <div class="milestone-item" class:reached>
              <div class="milestone-marker" class:reached>
                <span class="milestone-emoji">{ms.emoji}</span>
              </div>
              <div class="milestone-info">
                <span class="milestone-label">{ms.label}</span>
                <span class="milestone-level">Level {ms.level}</span>
              </div>
              {#if reached}
                <span class="milestone-check">{'\u2713'}</span>
              {:else if nextMilestone?.level === ms.level}
                <span class="milestone-next">NEXT</span>
              {/if}
            </div>
          {/each}
        </div>
        {#if nextMilestone}
          <p class="milestone-hint">
            {nextMilestone.emoji} {nextMilestone.label} unlocks at Level {nextMilestone.level}
            ({levelXpThreshold(nextMilestone.level) - ($userStats?.xp ?? 0)} XP to go)
          </p>
        {:else}
          <p class="milestone-hint">All milestones reached! You're a legend.</p>
        {/if}
      </div>

      <!-- Rewards ladder -->
      {#if rewardItems.length > 0 || rewardsLoading}
        <div class="card rewards-card">
          <h3 class="card-heading geo-title">Rewards</h3>
          {#if rewardsLoading && rewardItems.length === 0}
            <p class="empty-state">Loading rewards...</p>
          {:else}
            <div class="reward-list">
              {#each sortedRewards as item}
                {@const unlocked = rewardUnlocked(item)}
                {@const isHero = item.tier === 'hero'}
                <div class="reward-row" class:reward-locked={!unlocked} class:reward-hero={isHero}>
                  <div class="reward-tier-badge" class:reward-tier-hero={isHero} class:reward-tier-minor={!isHero}>
                    {isHero ? '★' : '●'}
                  </div>
                  <div class="reward-info">
                    <span class="reward-name">{item.name}</span>
                    <span class="reward-type">{cosmeticTypeLabel[item.subcategory ?? ''] ?? cosmeticTypeLabel[item.category] ?? item.subcategory ?? item.category}</span>
                  </div>
                  <span class="reward-level">Lv {item.level_requirement}</span>
                  <div class="reward-state">
                    {#if unlocked}
                      <span class="reward-check">{'✓'}</span>
                    {:else}
                      <span class="reward-lock">{'🔒'}</span>
                      {#if !isHero}
                        <a href="/shop" class="reward-buy-hint">{item.price} chips</a>
                      {/if}
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

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
        <div class="badges-header">
          <h3 class="card-heading geo-title">Badges</h3>
          <span class="badge-count">{earnedCount} / {totalCount}</span>
        </div>
        <div class="badge-grid">
          {#each visibleBadges as badge}
            {@const earned = isEarned(badge.slug)}
            <div class="badge-item" class:earned class:secret={badge.secret}>
              <div class="badge-emoji" class:earned>{badge.emoji}</div>
              <span class="badge-label">{badge.label}</span>
              {#if badge.secret && earned}
                <span class="secret-tag">SECRET</span>
              {/if}
              <!-- Tooltip -->
              <div class="badge-tooltip">
                <div class="tooltip-header">
                  <span class="tooltip-emoji">{badge.emoji}</span>
                  <span class="tooltip-name">{badge.label}</span>
                </div>
                <p class="tooltip-desc">{badge.description}</p>
                {#if earned}
                  <p class="tooltip-date">{earnedDate(badge.slug)}</p>
                {:else}
                  <p class="tooltip-locked">Not yet earned</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
        {#if hasHiddenBadges}
          <p class="hidden-hint">+ hidden badges to discover...</p>
        {/if}
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

  @media (max-width: 360px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
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

  /* XP section */
  .xp-section {
    width: 100%;
    margin-top: 0.75rem;
  }

  .xp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .xp-level {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--accent);
  }

  .xp-numbers {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .xp-bar {
    width: 100%;
    height: 6px;
    background: var(--bg-input);
    border-radius: 3px;
    overflow: hidden;
  }

  .xp-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .btn-claim {
    display: inline-block;
    margin-top: 0.375rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.25rem 0.5rem;
    background: var(--accent-faint);
    color: var(--accent);
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-claim:hover:not(:disabled) {
    background: var(--accent-border);
  }

  .btn-claim:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .claim-timer {
    display: block;
    margin-top: 0.375rem;
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .btn-claim-hourly {
    background: var(--card-bg);
    border: 1px solid var(--accent-border);
    color: var(--accent);
    font-size: 0.6rem;
    padding: 0.15rem 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-claim-hourly:hover:not(:disabled) {
    background: var(--accent);
    color: var(--bg);
  }

  .claim-timer-hourly {
    font-size: 0.55rem;
    margin-top: 0.15rem;
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

  .badges-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .badges-header .card-heading {
    margin-bottom: 0;
  }

  .badge-count {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--accent);
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
    border-radius: 4px;
    opacity: 0.35;
    transition: opacity 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
    position: relative;
    cursor: default;
  }

  .badge-item.earned {
    opacity: 1;
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .badge-item.secret.earned {
    border-color: rgba(155, 89, 182, 0.4);
    background: rgba(155, 89, 182, 0.08);
  }

  .badge-item:hover {
    transform: translateY(-2px);
    opacity: 1;
  }

  .badge-emoji {
    font-size: 1.5rem;
    line-height: 1;
    filter: grayscale(1);
    transition: filter 0.15s ease;
  }

  .badge-emoji.earned {
    filter: none;
  }

  .badge-item:hover .badge-emoji {
    filter: none;
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

  .secret-tag {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9b59b6;
    padding: 0.1rem 0.3rem;
    border: 1px solid rgba(155, 89, 182, 0.3);
    border-radius: 2px;
  }

  /* Tooltip */
  .badge-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 200px;
    padding: 0.75rem;
    background: var(--bg-card);
    border: 1px solid var(--accent-border);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    z-index: 50;
    pointer-events: none;
  }

  .badge-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--accent-border);
  }

  .badge-item:hover .badge-tooltip {
    display: block;
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
  }

  .tooltip-emoji {
    font-size: 1.125rem;
  }

  .tooltip-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text);
  }

  .tooltip-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .tooltip-date {
    font-size: 0.65rem;
    color: var(--accent);
    margin-top: 0.375rem;
    font-weight: 500;
  }

  .tooltip-locked {
    font-size: 0.65rem;
    color: var(--text-subtle);
    margin-top: 0.375rem;
    font-style: italic;
  }

  .hidden-hint {
    font-size: 0.75rem;
    color: var(--text-subtle);
    text-align: center;
    font-style: italic;
    margin-top: 0.75rem;
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

  /* Milestones */
  .milestones-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.12s both;
  }

  .milestone-track {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .milestone-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--border);
    opacity: 0.4;
    transition: opacity 0.15s ease;
  }

  .milestone-item:last-child { border-bottom: none; }
  .milestone-item.reached { opacity: 1; }

  .milestone-marker {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    flex-shrink: 0;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .milestone-marker.reached {
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .milestone-emoji { font-size: 0.9rem; line-height: 1; }

  .milestone-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .milestone-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
  }

  .milestone-level {
    font-size: 0.65rem;
    color: var(--text-muted);
  }

  .milestone-check {
    font-size: 0.8rem;
    color: var(--accent);
    font-weight: 700;
  }

  .milestone-next {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--accent);
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    background: var(--accent-faint);
  }

  .milestone-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
    margin-top: 0.75rem;
    line-height: 1.5;
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  /* Rewards ladder */
  .rewards-card {
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.13s both;
  }

  .reward-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .reward-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--border);
    transition: opacity 0.15s ease;
  }

  .reward-row:last-child { border-bottom: none; }

  .reward-locked {
    opacity: 0.4;
  }

  .reward-hero {
    border-left: 2px solid rgba(212, 175, 55, 0.5);
    padding-left: 0.5rem;
    margin-left: -0.5rem;
  }

  .reward-hero:not(.reward-locked) {
    opacity: 1;
    background: rgba(212, 175, 55, 0.04);
    border-radius: 2px;
  }

  .reward-tier-badge {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .reward-tier-hero {
    color: #d4af37;
  }

  .reward-tier-minor {
    color: var(--text-subtle);
    font-size: 0.5rem;
  }

  .reward-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .reward-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.03em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reward-type {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .reward-level {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .reward-state {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .reward-check {
    font-size: 0.8rem;
    color: var(--accent);
    font-weight: 700;
  }

  .reward-lock {
    font-size: 0.7rem;
    line-height: 1;
  }

  .reward-buy-hint {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
    text-decoration: none;
    padding: 0.1rem 0.35rem;
    border: 1px solid var(--accent-border);
    border-radius: 2px;
    background: var(--accent-faint);
    transition: background 0.15s ease;
  }

  .reward-buy-hint:hover {
    background: var(--accent-border);
  }
</style>
