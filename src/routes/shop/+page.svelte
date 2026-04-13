<script lang="ts">
  import { goto } from '$app/navigation';
  import { currentUser, isLoggedIn } from '$lib/auth';

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
  }

  interface EquippedState {
    avatar_id: string | null;
    name_colour_id: string | null;
    card_back_id: string | null;
    table_felt_id: string | null;
  }

  type TabId = 'cosmetic' | 'consumable' | 'boost';

  let items = $state<ShopItem[]>([]);
  let owned = $state<Record<string, number>>({});
  let equipped = $state<EquippedState>({
    avatar_id: null,
    name_colour_id: null,
    card_back_id: null,
    table_felt_id: null,
  });
  let chipBalance = $state<number | null>(null);
  let activeTab = $state<TabId>('cosmetic');
  let loading = $state(true);
  let purchasing = $state<string | null>(null);
  let equipping = $state<string | null>(null);
  let confirmItem = $state<ShopItem | null>(null);
  let errorMsg = $state('');
  let successMsg = $state('');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'cosmetic', label: 'Cosmetics' },
    { id: 'consumable', label: 'Consumables' },
    { id: 'boost', label: 'Boosts' },
  ];

  let visibleItems = $derived(items.filter(item => item.category === activeTab));

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
        <div class="item-grid">
          {#each visibleItems as item}
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
    color: #f39c12;
  }

  .chips-icon { color: #f39c12; }

  /* Notices */
  .notice {
    padding: 0.65rem 0.875rem;
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
    color: #f39c12;
    border-color: rgba(243, 156, 18, 0.4);
    background: rgba(243, 156, 18, 0.06);
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
    border-color: rgba(243, 156, 18, 0.3);
    transform: translateY(-2px);
  }

  .item-card.owned {
    border-color: rgba(243, 156, 18, 0.35);
    background: rgba(243, 156, 18, 0.03);
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
    color: #f39c12;
    padding: 0.15rem 0.4rem;
    border: 1px solid rgba(243, 156, 18, 0.4);
    border-radius: 2px;
    background: rgba(243, 156, 18, 0.08);
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
    color: #f39c12;
  }

  .price-icon { color: #f39c12; }

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
    border: 1px solid rgba(243, 156, 18, 0.35);
    background: rgba(243, 156, 18, 0.08);
    color: #f39c12;
  }

  .buy-btn:hover:not(:disabled),
  .equip-btn:hover:not(:disabled) {
    background: rgba(243, 156, 18, 0.16);
  }

  .buy-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .equip-btn.equipped {
    background: rgba(243, 156, 18, 0.18);
    border-color: #f39c12;
    color: #f39c12;
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
    background: rgba(0, 0, 0, 0.65);
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
    color: #f39c12;
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
</style>
