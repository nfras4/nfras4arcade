<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn, userStats } from '$lib/auth';

  interface ShopItem {
    id: string;
    category: string;
    subcategory: string | null;
    name: string;
    description: string;
    price: number;
    icon: string;
    metadata: string | null;
    is_active: number;
    tier: 'shop' | 'hero' | 'minor';
    level_requirement: number | null;
  }

  interface EquippedState {
    avatar_id: string | null;
    name_colour_id: string | null;
    card_back_id: string | null;
    table_felt_id: string | null;
  }

  type TabId = 'cosmetic' | 'consumable' | 'boost';

  let items: ShopItem[] = $state([]);
  let owned: Record<string, number> = $state({});
  let equipped: EquippedState = $state({
    avatar_id: null,
    name_colour_id: null,
    card_back_id: null,
    table_felt_id: null,
  });
  let chipBalance: number | null = $state(null);
  let activeTab: TabId = $state('cosmetic');
  let loading = $state(true);
  let purchasing: string | null = $state(null);
  let equipping: string | null = $state(null);
  let confirmItem: ShopItem | null = $state(null);
  let errorMsg = $state('');
  let successMsg = $state('');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'cosmetic', label: 'Cosmetics' },
    { id: 'consumable', label: 'Consumables' },
    { id: 'boost', label: 'Boosts' },
  ];

  let visibleItems = $derived(items.filter(item => item.category === activeTab));
  let shopItems = $derived(visibleItems.filter(item => item.tier === 'shop'));
  let minorItems = $derived(visibleItems.filter(item => item.tier === 'minor').sort((a, b) => (a.level_requirement ?? 0) - (b.level_requirement ?? 0)));
  let heroItems = $derived(visibleItems.filter(item => item.tier === 'hero').sort((a, b) => (a.level_requirement ?? 0) - (b.level_requirement ?? 0)));
  let hasLevelRewards = $derived(minorItems.length > 0 || heroItems.length > 0);

  let heroTooltip: string | null = $state(null);

  function itemIcon(item: ShopItem): string {
    try {
      const cp = parseInt(item.icon, 16);
      if (!isNaN(cp)) return String.fromCodePoint(cp);
    } catch {}
    return item.icon || '?';
  }

  function isOwned(itemId: string): boolean {
    return (owned[itemId] ?? 0) > 0;
  }

  function isEquipped(item: ShopItem): boolean {
    if (!item.subcategory) return false;
    const colMap: Record<string, keyof EquippedState> = {
      avatar: 'avatar_id',
      name_colour: 'name_colour_id',
      card_back: 'card_back_id',
      table_felt: 'table_felt_id',
    };
    const col = colMap[item.subcategory];
    return col ? equipped[col] === item.id : false;
  }

  function canBuy(item: ShopItem): boolean {
    if (chipBalance === null) return false;
    if (chipBalance < item.price) return false;
    if (item.category === 'cosmetic' && isOwned(item.id)) return false;
    return true;
  }

  async function loadShopData() {
    loading = true;
    try {
      const [shopRes, chipsRes] = await Promise.all([
        fetch('/api/shop/items'),
        fetch('/api/chips/status'),
      ]);

      if (shopRes.ok) {
        const data: { items: ShopItem[]; owned: Record<string, number> } = await shopRes.json();
        items = data.items;
        owned = data.owned;
      }

      if (chipsRes.ok) {
        const chipsData: { chips: number } = await chipsRes.json();
        chipBalance = chipsData.chips;
      }

      if ($isLoggedIn) {
        const invRes = await fetch('/api/shop/inventory');
        if (invRes.ok) {
          const invData: { inventory: unknown[]; equipped: EquippedState } = await invRes.json();
          equipped = invData.equipped;
        }
      }
    } catch {}
    loading = false;
  }

  $effect(() => {
    loadShopData();
  });

  async function confirmPurchase() {
    if (!confirmItem) return;
    const item = confirmItem;
    confirmItem = null;
    purchasing = item.id;
    errorMsg = '';
    successMsg = '';

    try {
      const res = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data: { success?: boolean; chips?: number; inventory?: { itemId: string; quantity: number }; error?: string } = await res.json();

      if (!res.ok || !data.success) {
        errorMsg = data.error || 'Purchase failed';
      } else {
        chipBalance = data.chips ?? chipBalance;
        if (data.inventory) {
          owned = { ...owned, [data.inventory.itemId]: data.inventory.quantity };
        }
        successMsg = `Purchased ${item.name}!`;
        setTimeout(() => { successMsg = ''; }, 3000);
      }
    } catch {
      errorMsg = 'Purchase failed';
    }

    purchasing = null;
  }

  async function toggleEquip(item: ShopItem) {
    if (!item.subcategory) return;
    equipping = item.id;
    errorMsg = '';

    const slotMap: Record<string, string> = {
      avatar: 'avatar',
      name_colour: 'name_colour',
      card_back: 'card_back',
      table_felt: 'table_felt',
    };

    const slot = slotMap[item.subcategory];
    if (!slot) { equipping = null; return; }

    const currentlyEquipped = isEquipped(item);
    const newItemId = currentlyEquipped ? null : item.id;

    try {
      const res = await fetch('/api/shop/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, itemId: newItemId }),
      });
      const data: { success?: boolean; equipped?: { slot: string; itemId: string | null }; error?: string } = await res.json();

      if (!res.ok || !data.success) {
        errorMsg = data.error || 'Equip failed';
      } else {
        const colMap: Record<string, keyof EquippedState> = {
          avatar: 'avatar_id',
          name_colour: 'name_colour_id',
          card_back: 'card_back_id',
          table_felt: 'table_felt_id',
        };
        const col = colMap[slot];
        if (col) {
          equipped = { ...equipped, [col]: newItemId };
        }
      }
    } catch {
      errorMsg = 'Equip failed';
    }

    equipping = null;
  }
</script>

<div class="shop-page">
  <div class="shop-content">

    <header class="shop-hero">
      <div class="title-frame">
        <span class="diamond-accent" aria-hidden="true"></span>
        <h1 class="wordmark geo-title">Chip Shop</h1>
        <span class="diamond-accent" aria-hidden="true"></span>
      </div>
      <p class="tagline">Spend your chips on cosmetics &amp; items</p>
    </header>

    {#if !$isLoggedIn && !loading}
      <div class="auth-gate card">
        <p class="auth-msg">Log in to access the shop</p>
        <button class="btn-primary" onclick={() => goto('/login')}>Log In</button>
      </div>
    {:else}
      {#if chipBalance !== null}
        <div class="balance-bar card">
          <span class="balance-label">Your Balance</span>
          <div class="balance-amount">
            <svg class="chips-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
            </svg>
            <span>{chipBalance.toLocaleString()} chips</span>
          </div>
        </div>
      {/if}

      {#if errorMsg}
        <div class="notice notice-error">{errorMsg}</div>
      {/if}

      {#if successMsg}
        <div class="notice notice-success">{successMsg}</div>
      {/if}

      <div class="tab-bar">
        {#each tabs as tab}
          <button
            class="tab-btn"
            class:active={activeTab === tab.id}
            aria-pressed={activeTab === tab.id}
            onclick={() => { activeTab = tab.id; errorMsg = ''; }}
          >
            {tab.label}
          </button>
        {/each}
      </div>

      {#if loading}
        <div class="loading-state">
          <p class="loading-text">Loading shop...</p>
        </div>
      {:else if visibleItems.length === 0}
        <div class="empty-state card">
          <p>No items available in this category.</p>
        </div>
      {:else}
        {#if shopItems.length > 0}
          <div class="item-grid">
            {#each shopItems as item}
              {@const itemOwned = isOwned(item.id)}
              {@const itemEquipped = isEquipped(item)}
              {@const buyable = canBuy(item)}
              <div class="item-card card" class:owned={itemOwned}>
                <div class="item-header">
                  <span class="item-icon" aria-hidden="true">{itemIcon(item)}</span>
                  {#if itemOwned}
                    <span class="owned-badge">Owned</span>
                  {/if}
                </div>

                <div class="item-body">
                  <h3 class="item-name">{item.name}</h3>
                  <p class="item-desc">{item.description}</p>
                  {#if item.subcategory}
                    <span class="item-sub">{item.subcategory.replace('_', ' ')}</span>
                  {/if}
                </div>

                <div class="item-footer">
                  <span class="item-price">
                    <svg class="price-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
                      <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                    </svg>
                    {item.price.toLocaleString()}
                  </span>

                  <div class="item-actions">
                    {#if item.category === 'cosmetic' && itemOwned}
                      <button
                        class="equip-btn"
                        class:equipped={itemEquipped}
                        disabled={equipping === item.id}
                        onclick={() => toggleEquip(item)}
                      >
                        {equipping === item.id ? '...' : itemEquipped ? 'Equipped' : 'Equip'}
                      </button>
                    {:else}
                      <button
                        class="buy-btn"
                        disabled={!buyable || purchasing === item.id || !$isLoggedIn}
                        onclick={() => { confirmItem = item; errorMsg = ''; }}
                      >
                        {purchasing === item.id ? 'Buying...' : 'Buy'}
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if hasLevelRewards}
          <div class="section-separator">
            <span class="section-label">Level Rewards</span>
          </div>

          <div class="item-grid">
            {#each [...minorItems, ...heroItems].sort((a, b) => (a.level_requirement ?? 0) - (b.level_requirement ?? 0)) as item}
              {@const itemOwned = isOwned(item.id)}
              {@const itemEquipped = isEquipped(item)}
              {@const buyable = canBuy(item)}
              {@const isHero = item.tier === 'hero'}
              {@const isMinor = item.tier === 'minor'}
              {@const playerLevel = $userStats?.level ?? 0}
              {@const levelMet = playerLevel >= (item.level_requirement ?? 0)}
              <div class="item-card card" class:owned={itemOwned} class:hero-card={isHero} class:minor-card={isMinor}>
                <div class="item-header">
                  <span class="item-icon" aria-hidden="true">{itemIcon(item)}</span>
                  <div class="badge-stack">
                    {#if isHero}
                      <span class="hero-badge">HERO</span>
                    {/if}
                    {#if itemOwned}
                      <span class="owned-badge">Owned</span>
                    {:else if isMinor && !levelMet}
                      <span class="lock-badge" aria-label="Locked">&#128274;</span>
                    {/if}
                  </div>
                </div>

                <div class="item-body">
                  <h3 class="item-name">{item.name}</h3>
                  <p class="item-desc">{item.description}</p>
                  {#if item.subcategory}
                    <span class="item-sub">{item.subcategory.replace('_', ' ')}</span>
                  {/if}
                  {#if isHero}
                    <span class="level-label hero-level">Earn at Lv {item.level_requirement}</span>
                  {:else if isMinor}
                    <span class="level-label minor-level">Unlocks at Lv {item.level_requirement} or buy for {item.price.toLocaleString()} chips</span>
                  {/if}
                </div>

                <div class="item-footer">
                  {#if isHero}
                    <span class="item-price earn-only">Earn only</span>
                  {:else}
                    <span class="item-price">
                      <svg class="price-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                        <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                      </svg>
                      {item.price.toLocaleString()}
                    </span>
                  {/if}

                  <div class="item-actions">
                    {#if isHero}
                      <div class="hero-btn-wrap">
                        <button
                          class="hero-locked-btn"
                          aria-disabled="true"
                          onclick={() => { heroTooltip = heroTooltip === item.id ? null : item.id; }}
                        >
                          Earn at Lv {item.level_requirement}
                        </button>
                        {#if heroTooltip === item.id}
                          <div class="hero-tooltip" role="tooltip">
                            Reward unlocked by reaching Level {item.level_requirement} — not for sale
                          </div>
                        {/if}
                      </div>
                    {:else if item.category === 'cosmetic' && itemOwned}
                      <button
                        class="equip-btn"
                        class:equipped={itemEquipped}
                        disabled={equipping === item.id}
                        onclick={() => toggleEquip(item)}
                      >
                        {equipping === item.id ? '...' : itemEquipped ? 'Equipped' : 'Equip'}
                      </button>
                    {:else}
                      <button
                        class="buy-btn"
                        disabled={!buyable || purchasing === item.id || !$isLoggedIn}
                        onclick={() => { confirmItem = item; errorMsg = ''; }}
                      >
                        {purchasing === item.id ? 'Buying...' : 'Buy'}
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {/if}

    <button class="back-btn" onclick={() => goto('/casino')}>Back to Casino</button>
  </div>
</div>

{#if confirmItem}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
    <div class="modal-box card">
      <h2 class="modal-title geo-title" id="confirm-title">Confirm Purchase</h2>
      <div class="modal-item">
        <span class="modal-icon">{itemIcon(confirmItem)}</span>
        <div class="modal-info">
          <p class="modal-name">{confirmItem.name}</p>
          <p class="modal-cost">
            <svg class="price-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
            </svg>
            {confirmItem.price.toLocaleString()} chips
          </p>
        </div>
      </div>
      {#if chipBalance !== null}
        <p class="modal-balance">Balance after: {(chipBalance - confirmItem.price).toLocaleString()} chips</p>
      {/if}
      <div class="modal-actions">
        <button class="btn-primary" onclick={confirmPurchase}>Confirm</button>
        <button class="btn-secondary" onclick={() => { confirmItem = null; }}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  :root {
    --shop-gold: #f39c12;
    --shop-gold-03: rgba(243, 156, 18, 0.03);
    --shop-gold-06: rgba(243, 156, 18, 0.06);
    --shop-gold-08: rgba(243, 156, 18, 0.08);
    --shop-gold-16: rgba(243, 156, 18, 0.16);
    --shop-gold-18: rgba(243, 156, 18, 0.18);
    --shop-gold-30: rgba(243, 156, 18, 0.3);
    --shop-gold-35: rgba(243, 156, 18, 0.35);
    --shop-gold-40: rgba(243, 156, 18, 0.4);
    --danger-red: #e74c3c;
    --danger-red-08: rgba(231, 76, 60, 0.08);
    --danger-red-30: rgba(231, 76, 60, 0.3);
    --green-chip-08: rgba(61, 214, 140, 0.08);
    --green-chip-30: rgba(61, 214, 140, 0.3);
    --modal-scrim-65: rgba(0, 0, 0, 0.65);
  }

  .shop-page {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5rem 1.25rem 4rem;
  }

  .shop-content {
    width: 100%;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Header */
  .shop-hero {
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

  /* Balance bar */
  .balance-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.875rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.04s both;
  }

  .balance-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .balance-amount {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--shop-gold);
  }

  .chips-icon { color: var(--shop-gold); }

  /* Notices */
  .notice {
    padding: 0.65rem 0.875rem;
    border-radius: 2px;
    font-size: 0.8rem;
    font-weight: 500;
    animation: fadeUp 0.3s ease both;
  }

  .notice-error {
    background: var(--danger-red-08);
    border: 1px solid var(--danger-red-30);
    color: var(--danger-red);
  }

  .notice-success {
    background: var(--green-chip-08);
    border: 1px solid var(--green-chip-30);
    color: var(--green, #3dd68c);
  }

  /* Tabs */
  .tab-bar {
    display: flex;
    gap: 0.5rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both;
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
    color: var(--shop-gold);
    border-color: var(--shop-gold-40);
    background: var(--shop-gold-06);
  }

  .tab-btn:hover:not(.active) {
    color: var(--text);
    background: var(--bg-hover);
  }

  /* Item grid */
  .item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  .item-card {
    display: flex;
    flex-direction: column;
    gap: 0;
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .item-card:hover {
    border-color: var(--shop-gold-30);
    transform: translateY(-2px);
  }

  .item-card.owned {
    border-color: var(--shop-gold-35);
    background: var(--shop-gold-03);
  }

  .item-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1rem 1rem 0.5rem;
  }

  .item-icon {
    font-size: 2rem;
    line-height: 1;
  }

  .owned-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--shop-gold);
    padding: 0.15rem 0.4rem;
    border: 1px solid var(--shop-gold-40);
    border-radius: 2px;
    background: var(--shop-gold-08);
  }

  .item-body {
    padding: 0 1rem 0.75rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .item-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
    text-transform: uppercase;
  }

  .item-desc {
    font-size: 0.775rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .item-sub {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-subtle);
    margin-top: 0.125rem;
  }

  .item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    border-top: 1px solid var(--border);
  }

  .item-price {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--shop-gold);
  }

  .price-icon { color: var(--shop-gold); }

  .item-actions {
    display: flex;
    gap: 0.375rem;
  }

  .buy-btn,
  .equip-btn {
    padding: 0.35rem 0.65rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 2px;
    cursor: pointer;
    transition: background 0.15s ease;
    border: 1px solid var(--shop-gold-35);
    background: var(--shop-gold-08);
    color: var(--shop-gold);
  }

  .buy-btn:hover:not(:disabled),
  .equip-btn:hover:not(:disabled) {
    background: var(--shop-gold-16);
  }

  .buy-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .equip-btn.equipped {
    background: var(--shop-gold-18);
    border-color: var(--shop-gold);
    color: var(--shop-gold);
  }

  .equip-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Auth gate */
  .auth-gate {
    text-align: center;
    padding: 2rem 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .auth-msg {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  /* Loading / empty */
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

  .empty-state {
    padding: 2rem 1.5rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
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

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--modal-scrim-65);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1.25rem;
  }

  .modal-box {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    animation: fadeUp 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .modal-title {
    font-size: 0.85rem;
    letter-spacing: 0.14em;
    color: var(--text-subtle);
  }

  .modal-item {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 2px;
  }

  .modal-icon {
    font-size: 2rem;
    line-height: 1;
  }

  .modal-info {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .modal-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--text);
    text-transform: uppercase;
  }

  .modal-cost {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--shop-gold);
  }

  .modal-balance {
    font-size: 0.775rem;
    color: var(--text-muted);
  }

  .modal-actions {
    display: flex;
    gap: 0.5rem;
  }

  .modal-actions button {
    flex: 1;
  }

  button:focus-visible { outline: 2px solid var(--accent, #4a90d9); outline-offset: 2px; }
  button:active:not(:disabled) { transform: scale(0.97); transition: transform 0.1s; }

  /* Section separator for Level Rewards */
  .section-separator {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    animation: fadeUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both;
  }

  .section-separator::before,
  .section-separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--shop-gold-30);
  }

  .section-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--shop-gold);
    white-space: nowrap;
  }

  /* Hero card */
  .hero-card {
    border-color: var(--shop-gold-30);
    background: var(--shop-gold-03);
  }

  .hero-card:hover {
    border-color: var(--shop-gold-40);
  }

  /* Minor card */
  .minor-card {
    border-color: var(--border);
  }

  /* Badge stack */
  .badge-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }

  /* HERO badge */
  .hero-badge {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #1a1008;
    background: var(--shop-gold);
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  /* Lock badge */
  .lock-badge {
    font-size: 0.7rem;
    opacity: 0.6;
  }

  /* Level labels */
  .level-label {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    line-height: 1.4;
    margin-top: 0.25rem;
  }

  .hero-level {
    color: var(--shop-gold);
  }

  .minor-level {
    color: var(--text-muted);
  }

  /* Earn-only price label */
  .earn-only {
    font-style: italic;
    color: var(--shop-gold);
    opacity: 0.7;
  }

  /* Hero locked button */
  .hero-btn-wrap {
    position: relative;
  }

  .hero-locked-btn {
    padding: 0.35rem 0.65rem;
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-radius: 2px;
    border: 1px solid var(--shop-gold-30);
    background: var(--shop-gold-06);
    color: var(--shop-gold);
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Hero tooltip */
  .hero-tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    width: 180px;
    padding: 0.5rem 0.625rem;
    background: var(--bg-card, #1a1a1a);
    border: 1px solid var(--shop-gold-30);
    border-radius: 2px;
    font-size: 0.7rem;
    color: var(--text-muted);
    line-height: 1.45;
    z-index: 10;
    animation: fadeUp 0.15s ease both;
    pointer-events: none;
  }
</style>
