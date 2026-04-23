<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, userStats, userBadges, isLoggedIn, fetchUser } from '$lib/auth';
  import PlayerTile from '$lib/components/PlayerTile.svelte';
  import { xpToLevel } from '$lib/xp';

  interface ShopItemMetadata {
    svg?: string;
    hex?: string;
    gradient?: string[];
    slice?: string;
    borderWidth?: string;
  }

  interface InventoryItem {
    item: {
      id: string;
      category: string;
      subcategory: string | null;
      name: string;
      description: string;
      price: number;
      icon: string;
      metadata: string | null;
    };
    quantity: number;
    purchasedAt: number;
  }

  interface EquippedState {
    avatar_id: string | null;
    name_colour_id: string | null;
    card_back_id: string | null;
    table_felt_id: string | null;
    frame_id?: string | null;
    emblem_id?: string | null;
    title_badge_id?: string | null;
  }

  type TabId = 'frame' | 'emblem' | 'title';

  interface OwnedCosmetic {
    id: string;
    name: string;
    description: string;
    icon: string;
    svgPath: string | null;
  }

  interface OwnedTitle {
    slug: string;
    label: string;
    description: string;
    icon: string;
  }

  let inventory: InventoryItem[] = $state([]);
  let equipped: EquippedState = $state({
    avatar_id: null,
    name_colour_id: null,
    card_back_id: null,
    table_felt_id: null,
    frame_id: null,
    emblem_id: null,
    title_badge_id: null,
  });

  let previewFrameSvg: string | null = $state(null);
  let previewEmblemSvg: string | null = $state(null);
  let previewTitleSlug: string | null = $state(null);

  let activeTab: TabId = $state('frame');
  let loading = $state(true);
  let pendingId: string | null = $state(null);
  let errorMsg = $state('');
  let successMsg = $state('');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'frame', label: 'Frame' },
    { id: 'emblem', label: 'Emblem' },
    { id: 'title', label: 'Title' },
  ];

  function iconChar(codePoint: string): string {
    try {
      const cp = parseInt(codePoint, 16);
      if (!isNaN(cp)) return String.fromCodePoint(cp);
    } catch {}
    return codePoint || '?';
  }

  function resolveCosmeticSvg(subcategory: 'frame' | 'emblem', metadataStr: string | null): string | null {
    if (!metadataStr) return null;
    try {
      const meta: ShopItemMetadata = JSON.parse(metadataStr);
      if (!meta.svg) return null;
      return `/cosmetics/${subcategory}s/${meta.svg}`;
    } catch {
      return null;
    }
  }

  let ownedFrames = $derived<OwnedCosmetic[]>(
    inventory
      .filter((row) => row.item.subcategory === 'frame')
      .map((row) => ({
        id: row.item.id,
        name: row.item.name,
        description: row.item.description,
        icon: row.item.icon,
        svgPath: resolveCosmeticSvg('frame', row.item.metadata),
      }))
  );

  let ownedEmblems = $derived<OwnedCosmetic[]>(
    inventory
      .filter((row) => row.item.subcategory === 'emblem')
      .map((row) => ({
        id: row.item.id,
        name: row.item.name,
        description: row.item.description,
        icon: row.item.icon,
        svgPath: resolveCosmeticSvg('emblem', row.item.metadata),
      }))
  );

  let earnedTitles = $derived<OwnedTitle[]>(
    $userBadges.map((b) => ({
      slug: b.slug,
      label: b.label,
      description: b.description,
      icon: b.icon,
    }))
  );

  let previewLevel = $derived(xpToLevel($userStats?.xp ?? 0));
  let previewName = $derived($currentUser?.displayName || 'You');
  let previewColour = $derived($currentUser?.nameColour || null);
  let previewTitleText = $derived(
    earnedTitles.find((t) => t.slug === previewTitleSlug)?.label ?? null
  );

  async function loadCustomizeData() {
    loading = true;
    errorMsg = '';
    try {
      await fetchUser();
      const invRes = await fetch('/api/shop/inventory');
      if (invRes.ok) {
        const invData: { inventory: InventoryItem[]; equipped: EquippedState } = await invRes.json();
        inventory = invData.inventory || [];
        equipped = {
          ...invData.equipped,
          frame_id: invData.equipped.frame_id ?? null,
          emblem_id: invData.equipped.emblem_id ?? null,
          title_badge_id: invData.equipped.title_badge_id ?? null,
        };
      }

      // Seed preview from resolved /api/auth/me response
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meData: {
          user: {
            frame?: { svg: string } | null;
            emblem?: { svg: string } | null;
            titleBadge?: { id: string } | null;
          };
        } = await meRes.json();
        previewFrameSvg = meData.user?.frame?.svg ?? null;
        previewEmblemSvg = meData.user?.emblem?.svg ?? null;
        previewTitleSlug = meData.user?.titleBadge?.id ?? null;
      }
    } catch {
      errorMsg = 'Failed to load your loadout';
    }
    loading = false;
  }

  $effect(() => {
    if ($isLoggedIn) {
      loadCustomizeData();
    } else {
      loading = false;
    }
  });

  async function equipCosmetic(slot: 'frame' | 'emblem', item: OwnedCosmetic | null) {
    const targetId = item?.id ?? null;
    const prevId = slot === 'frame' ? equipped.frame_id : equipped.emblem_id;
    const prevSvg = slot === 'frame' ? previewFrameSvg : previewEmblemSvg;

    pendingId = item?.id ?? `__none_${slot}`;
    errorMsg = '';

    // Optimistic update
    if (slot === 'frame') {
      equipped = { ...equipped, frame_id: targetId };
      previewFrameSvg = item?.svgPath ?? null;
    } else {
      equipped = { ...equipped, emblem_id: targetId };
      previewEmblemSvg = item?.svgPath ?? null;
    }

    try {
      const res = await fetch('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, itemId: targetId }),
      });
      const data: { success?: boolean; error?: string } = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Equip failed');
      }
      successMsg = targetId ? `Equipped ${item?.name}` : `Unequipped ${slot}`;
      setTimeout(() => { successMsg = ''; }, 2000);
    } catch (err) {
      // Revert
      if (slot === 'frame') {
        equipped = { ...equipped, frame_id: prevId ?? null };
        previewFrameSvg = prevSvg;
      } else {
        equipped = { ...equipped, emblem_id: prevId ?? null };
        previewEmblemSvg = prevSvg;
      }
      errorMsg = err instanceof Error ? err.message : 'Equip failed';
    }

    pendingId = null;
  }

  async function equipTitle(title: OwnedTitle | null) {
    const targetSlug = title?.slug ?? null;
    const prevSlug = previewTitleSlug;

    pendingId = title?.slug ?? '__none_title';
    errorMsg = '';

    previewTitleSlug = targetSlug;
    equipped = { ...equipped, title_badge_id: targetSlug };

    try {
      const res = await fetch('/api/shop/equip-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId: targetSlug }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Equip failed');
      }
      successMsg = targetSlug ? `Equipped ${title?.label}` : 'Title cleared';
      setTimeout(() => { successMsg = ''; }, 2000);
    } catch (err) {
      previewTitleSlug = prevSlug;
      equipped = { ...equipped, title_badge_id: prevSlug };
      errorMsg = err instanceof Error ? err.message : 'Equip failed';
    }

    pendingId = null;
  }

  function isFrameEquipped(id: string | null): boolean {
    return (equipped.frame_id ?? null) === id;
  }

  function isEmblemEquipped(id: string | null): boolean {
    return (equipped.emblem_id ?? null) === id;
  }

  function isTitleEquipped(slug: string | null): boolean {
    return (equipped.title_badge_id ?? null) === slug;
  }
</script>

<svelte:head>
  <title>Customize | nfras4arcade</title>
</svelte:head>

<div class="customize-page">
  <div class="customize-content">
    <header class="page-hero">
      <h1 class="page-title geo-title">Customize</h1>
      <p class="tagline">Arrange your loadout</p>
    </header>

    <div class="info-banner" role="note">
      Cosmetic rendering in games is being rolled out; your loadout will apply wherever it's enabled.
    </div>

    {#if !$isLoggedIn && !loading}
      <div class="auth-gate card">
        <p class="auth-msg">Log in to customize your loadout</p>
        <button class="btn-primary" onclick={() => goto('/login')}>Log In</button>
      </div>
    {:else if loading}
      <div class="loading-state">
        <p class="loading-text">Loading your loadout...</p>
      </div>
    {:else}
      <!-- Live preview -->
      <div class="preview-wrap card" aria-label="Loadout preview">
        <span class="preview-label">Preview</span>
        <div class="preview-stage">
          <PlayerTile
            player={{
              id: $currentUser?.id ?? 'preview',
              name: previewName,
              level: previewLevel,
              nameColour: previewColour,
              frameSvg: previewFrameSvg,
              emblemSvg: previewEmblemSvg,
              titleBadgeId: previewTitleSlug,
              isHost: false,
              isBot: false,
            }}
            titleText={previewTitleText}
            status="idle"
            size="lg"
            orientation="horizontal"
          />
        </div>
      </div>

      {#if errorMsg}
        <div class="notice notice-error" role="alert">{errorMsg}</div>
      {/if}
      {#if successMsg}
        <div class="notice notice-success" role="status">{successMsg}</div>
      {/if}

      <div class="tab-bar" role="tablist" aria-label="Cosmetic category">
        {#each tabs as tab}
          <button
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="panel-{tab.id}"
            id="tab-{tab.id}"
            class="tab-btn"
            class:active={activeTab === tab.id}
            onclick={() => { activeTab = tab.id; errorMsg = ''; }}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      {#if activeTab === 'frame'}
        <div
          class="picker-panel"
          role="tabpanel"
          id="panel-frame"
          aria-labelledby="tab-frame"
        >
          {#if ownedFrames.length === 0}
            <div class="empty-state card">
              <p>You don't own any frames yet.</p>
              <a class="btn-primary" href="/shop">Visit the shop</a>
            </div>
          {:else}
            <div class="picker-grid" role="radiogroup" aria-label="Frame">
              <button
                class="picker-card none-card"
                role="radio"
                aria-checked={isFrameEquipped(null)}
                class:selected={isFrameEquipped(null)}
                disabled={pendingId === '__none_frame'}
                onclick={() => equipCosmetic('frame', null)}
                aria-label="No frame"
              >
                <span class="picker-none" aria-hidden="true">∅</span>
                <span class="picker-name">None</span>
                {#if isFrameEquipped(null)}<span class="picker-check" aria-hidden="true">&#x2713;</span>{/if}
                {#if pendingId === '__none_frame'}<span class="picker-loader" aria-hidden="true"></span>{/if}
              </button>
              {#each ownedFrames as frame}
                {@const selected = isFrameEquipped(frame.id)}
                <button
                  class="picker-card"
                  role="radio"
                  aria-checked={selected}
                  class:selected
                  disabled={pendingId === frame.id}
                  onclick={() => equipCosmetic('frame', frame)}
                  aria-label="Equip {frame.name}"
                >
                  <div class="frame-swatch">
                    {#if frame.svgPath}
                      <div
                        class="frame-swatch-inner"
                        style:--frame-url="url({frame.svgPath})"
                      ></div>
                    {:else}
                      <span class="picker-icon" aria-hidden="true">{iconChar(frame.icon)}</span>
                    {/if}
                  </div>
                  <span class="picker-name">{frame.name}</span>
                  {#if selected}<span class="picker-check" aria-hidden="true">&#x2713;</span>{/if}
                  {#if pendingId === frame.id}<span class="picker-loader" aria-hidden="true"></span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else if activeTab === 'emblem'}
        <div
          class="picker-panel"
          role="tabpanel"
          id="panel-emblem"
          aria-labelledby="tab-emblem"
        >
          {#if ownedEmblems.length === 0}
            <div class="empty-state card">
              <p>You don't own any emblems yet.</p>
              <a class="btn-primary" href="/shop">Visit the shop</a>
            </div>
          {:else}
            <div class="picker-grid" role="radiogroup" aria-label="Emblem">
              <button
                class="picker-card none-card"
                role="radio"
                aria-checked={isEmblemEquipped(null)}
                class:selected={isEmblemEquipped(null)}
                disabled={pendingId === '__none_emblem'}
                onclick={() => equipCosmetic('emblem', null)}
                aria-label="No emblem"
              >
                <span class="picker-none" aria-hidden="true">∅</span>
                <span class="picker-name">None</span>
                {#if isEmblemEquipped(null)}<span class="picker-check" aria-hidden="true">&#x2713;</span>{/if}
                {#if pendingId === '__none_emblem'}<span class="picker-loader" aria-hidden="true"></span>{/if}
              </button>
              {#each ownedEmblems as emblem}
                {@const selected = isEmblemEquipped(emblem.id)}
                <button
                  class="picker-card"
                  role="radio"
                  aria-checked={selected}
                  class:selected
                  disabled={pendingId === emblem.id}
                  onclick={() => equipCosmetic('emblem', emblem)}
                  aria-label="Equip {emblem.name}"
                >
                  <div class="emblem-swatch">
                    {#if emblem.svgPath}
                      <img src={emblem.svgPath} alt="{emblem.name} emblem" />
                    {:else}
                      <span class="picker-icon" aria-hidden="true">{iconChar(emblem.icon)}</span>
                    {/if}
                  </div>
                  <span class="picker-name">{emblem.name}</span>
                  {#if selected}<span class="picker-check" aria-hidden="true">&#x2713;</span>{/if}
                  {#if pendingId === emblem.id}<span class="picker-loader" aria-hidden="true"></span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div
          class="picker-panel"
          role="tabpanel"
          id="panel-title"
          aria-labelledby="tab-title"
        >
          {#if earnedTitles.length === 0}
            <div class="empty-state card">
              <p>You haven't earned any titles yet.</p>
              <a class="btn-primary" href="/profile">See badges on your profile</a>
            </div>
          {:else}
            <div class="picker-grid" role="radiogroup" aria-label="Title">
              <button
                class="picker-card none-card"
                role="radio"
                aria-checked={isTitleEquipped(null)}
                class:selected={isTitleEquipped(null)}
                disabled={pendingId === '__none_title'}
                onclick={() => equipTitle(null)}
                aria-label="No title"
              >
                <span class="picker-none" aria-hidden="true">∅</span>
                <span class="picker-name">None</span>
                {#if isTitleEquipped(null)}<span class="picker-check" aria-hidden="true">&#x2713;</span>{/if}
                {#if pendingId === '__none_title'}<span class="picker-loader" aria-hidden="true"></span>{/if}
              </button>
              {#each earnedTitles as title}
                {@const selected = isTitleEquipped(title.slug)}
                <button
                  class="picker-card"
                  role="radio"
                  aria-checked={selected}
                  class:selected
                  disabled={pendingId === title.slug}
                  onclick={() => equipTitle(title)}
                  aria-label="Equip title {title.label}"
                >
                  <span class="picker-icon" aria-hidden="true">{iconChar(title.icon)}</span>
                  <span class="picker-name">{title.label}</span>
                  {#if selected}<span class="picker-check" aria-hidden="true">&#x2713;</span>{/if}
                  {#if pendingId === title.slug}<span class="picker-loader" aria-hidden="true"></span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <div class="footer-actions">
        <a class="foot-link" href="/shop">Buy more cosmetics</a>
        <a class="foot-link" href="/profile">Back to profile</a>
      </div>
    {/if}
  </div>
</div>

<style>
  .customize-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5rem 1.25rem 4rem;
  }

  .customize-content {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .page-hero {
    text-align: center;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .page-title {
    font-size: clamp(1.5rem, 6vw, 2.25rem);
    letter-spacing: 0.14em;
    color: var(--accent);
  }

  .tagline {
    margin-top: 0.5rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .info-banner {
    padding: 0.6rem 0.875rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px dashed var(--border);
    border-radius: 2px;
    line-height: 1.5;
  }

  .preview-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 1rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.05s both;
  }

  .preview-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .preview-stage {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0.75rem 0;
  }

  .notice {
    padding: 0.6rem 0.875rem;
    border-radius: 2px;
    font-size: 0.8rem;
    font-weight: 500;
    animation: fadeUp 0.3s ease both;
  }
  .notice-error {
    background: rgba(231, 76, 60, 0.08);
    border: 1px solid rgba(231, 76, 60, 0.3);
    color: #e74c3c;
  }
  .notice-success {
    background: rgba(61, 214, 140, 0.08);
    border: 1px solid rgba(61, 214, 140, 0.3);
    color: var(--green, #3dd68c);
  }

  .tab-bar {
    display: flex;
    gap: 0.5rem;
  }

  .tab-btn {
    flex: 1;
    padding: 0.55rem 0.75rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .tab-btn.active {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-faint);
  }

  .tab-btn:hover:not(.active) {
    color: var(--text);
    background: var(--bg-hover, rgba(255, 255, 255, 0.03));
  }

  .picker-panel {
    animation: fadeUp 0.3s ease both;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 0.75rem;
  }

  .picker-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.85rem 0.6rem;
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    transition: border-color 0.15s ease, transform 0.15s ease, background 0.15s ease;
    font-family: inherit;
    color: var(--text);
    min-height: 110px;
  }

  .picker-card:hover:not(:disabled):not(.selected) {
    border-color: var(--accent-border);
    transform: translateY(-2px);
  }

  .picker-card.selected {
    border-color: var(--accent);
    background: var(--accent-faint);
  }

  .picker-card:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .picker-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .picker-icon {
    font-size: 1.75rem;
    line-height: 1;
  }

  .picker-none {
    font-size: 1.5rem;
    line-height: 1;
    color: var(--text-subtle);
  }

  .picker-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text);
    text-align: center;
    line-height: 1.2;
  }

  .picker-check {
    position: absolute;
    top: 0.3rem;
    right: 0.4rem;
    font-size: 0.75rem;
    color: var(--accent);
    font-weight: 700;
  }

  .picker-loader {
    position: absolute;
    bottom: 0.35rem;
    left: 50%;
    transform: translateX(-50%);
    width: 28px;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: loaderSlide 1s linear infinite;
    border-radius: 2px;
  }

  @keyframes loaderSlide {
    0% { transform: translate(-100%, 0); }
    100% { transform: translate(100%, 0); }
  }

  .frame-swatch {
    width: 56px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .frame-swatch-inner {
    width: 100%;
    height: 100%;
    border-style: solid;
    border-width: 10px;
    border-color: transparent;
    border-image-source: var(--frame-url);
    border-image-slice: 30 fill;
    border-image-width: 10px;
    border-image-repeat: stretch;
  }

  .emblem-swatch {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emblem-swatch img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .empty-state {
    padding: 2rem 1.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .empty-state .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
  }

  .auth-gate {
    text-align: center;
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .auth-msg {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .loading-state {
    padding: 2rem 0;
    text-align: center;
  }

  .loading-text {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-subtle);
  }

  .footer-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .foot-link {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
    text-decoration: none;
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 2px;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .foot-link:hover {
    color: var(--accent);
    border-color: var(--accent-border);
  }

  @media (max-width: 600px) {
    .customize-page { padding: 4.5rem 0.875rem 3rem; }
    .preview-stage { transform: scale(0.9); transform-origin: center; }
    .picker-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
    .tab-bar { position: sticky; top: 3.25rem; z-index: 5; background: var(--bg, #111); padding: 0.4rem 0; }
  }

  button:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.98); transition: transform 0.1s; }
</style>
