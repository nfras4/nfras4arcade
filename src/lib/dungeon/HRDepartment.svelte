<script lang="ts">
  import { player, savePlayer, checkAchievements } from './player.svelte'
  import {
    SHOP_ITEMS,
    getVisibleItems,
    getItemCost,
    getTimesPurchased,
    canAfford,
    isMaxedOut,
    isItemActive,
    purchaseShopItem,
    type ShopItem,
    type ShopSection,
  } from './prestige'

  type Props = { onClose: () => void }
  let { onClose }: Props = $props()

  // Sections — Lore tab only visible if internal-memo was unlocked
  const hasLore = $derived(player.permanentUnlocks.includes('internal-memo'))
  const sections: { id: ShopSection | 'lore'; label: string }[] = $derived([
    { id: 'benefits',      label: 'BENEFITS'      },
    { id: 'metrics',       label: 'METRICS'       },
    { id: 'configuration', label: 'CONFIG'        },
    { id: 'review',        label: 'REVIEW'        },
    { id: 'classified',    label: 'CLASSIFIED'    },
    { id: 'noticeboard',   label: 'NOTICE BOARD'  },
    ...(hasLore ? [{ id: 'lore' as const, label: 'LORE' }] : []),
  ])

  let activeSection = $state<ShopSection | 'lore'>('benefits')

  const visible = $derived.by(() => {
    if (activeSection === 'lore') return []
    return getVisibleItems(player, activeSection as ShopSection)
  })

  // Confirm flow
  let confirmItem = $state<ShopItem | null>(null)

  function beginPurchase(item: ShopItem): void {
    confirmItem = item
  }

  let showResignationEnding = $state(false)

  function doPurchase(): void {
    if (!confirmItem) return
    const purchasedId = confirmItem.id
    const ok = purchaseShopItem(confirmItem, player)
    if (ok) {
      savePlayer()
      checkAchievements()
      if (purchasedId === 'resignation-letter') {
        showResignationEnding = true
      }
    }
    confirmItem = null
  }

  function cancelPurchase(): void {
    confirmItem = null
  }

  // ── LORE (internal memo content) ────────────────────────────────────────
  const LORE_MEMOS: { title: string; body: string }[] = [
    {
      title: 'INTERNAL MEMO #001 — ORIENTATION',
      body: 'Welcome to Wolton. You were hired because you scored in the 99th percentile of a test you do not remember sitting. Your employment contract begins on the first floor of the basement. Please do not ask about the other floors.',
    },
    {
      title: 'INTERNAL MEMO #017 — RE: FRASER',
      body: 'The CEO is no longer attending board meetings. He has been seen in the basement. He has been seen in the car park. He has been seen in the break room. Do not engage. If engagement occurs, document everything.',
    },
    {
      title: 'INTERNAL MEMO #042 — ATTENDANCE POLICY',
      body: '"Prestige" is not, as previously thought, a reward scheme. It is a reassignment. Each cycle, one employee is selected for promotion to the Deep. Statistically, this is probably fine.',
    },
    {
      title: 'INTERNAL MEMO #108 — [REDACTED]',
      body: '[REDACTED REDACTED REDACTED] was correct about the voidwood. [REDACTED] is not a metaphor. The floors were never numbered. Please stop counting them.',
    },
    {
      title: 'INTERNAL MEMO #???',
      body: 'If you are reading this, the resignation letter has been filed. You already know what to do. He is waiting in the place you have never been. Bring a pen.',
    },
  ]
</script>

<div class="hr-overlay" role="dialog" aria-modal="true">
  <div class="hr-box">
    <div class="hr-hdr">
      <span class="hr-title">📋 WOLTON HR DEPARTMENT</span>
      <span class="hr-tokens">⚡ {player.prestigeTokens} tokens</span>
      <button class="mclose" onclick={onClose}>✕</button>
    </div>

    <div class="hr-tabs">
      {#each sections as sec}
        <button
          class="hr-tab {activeSection === sec.id ? 'active' : ''}"
          onclick={() => activeSection = sec.id}
        >
          {sec.label}
        </button>
      {/each}
    </div>

    <div class="hr-body">
      {#if activeSection === 'lore'}
        <div class="hr-lore">
          {#each LORE_MEMOS as memo}
            <div class="lore-card">
              <div class="lore-title">{memo.title}</div>
              <div class="lore-body">{memo.body}</div>
            </div>
          {/each}
        </div>
      {:else if visible.length === 0}
        <div class="hr-empty">Nothing available in this section yet.</div>
      {:else}
        <div class="hr-grid">
          {#each visible as item}
            {@const times = getTimesPurchased(item, player)}
            {@const cost = getItemCost(item, times)}
            {@const maxed = isMaxedOut(item, player)}
            {@const active = isItemActive(item, player)}
            {@const affordable = canAfford(item, player)}
            <div class="hr-card {maxed ? 'maxed' : ''} {active ? 'active' : ''}">
              <div class="hr-card-hdr">
                <span class="hr-card-name">{item.name}</span>
                {#if item.repeatable}
                  <span class="hr-card-lvl">{times}/{item.maxPurchases ?? '∞'}</span>
                {/if}
              </div>
              <div class="hr-card-desc">{item.description}</div>
              <div class="hr-card-flavour">{item.flavour}</div>
              <div class="hr-card-footer">
                {#if maxed}
                  <span class="hr-card-max">MAX</span>
                {:else if active && !item.repeatable && item.section !== 'configuration'}
                  <span class="hr-card-owned">OWNED</span>
                {:else}
                  <button
                    class="hr-buy {affordable ? '' : 'disabled'}"
                    disabled={!affordable}
                    onclick={() => beginPurchase(item)}
                  >
                    ⚡ {cost}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="hr-footer">
      <span class="hr-foot-note">
        Tokens reset modifiers on prestige. Permanent unlocks persist.
      </span>
    </div>
  </div>
</div>

{#if confirmItem}
  <div class="hr-confirm-overlay" role="dialog" aria-modal="true">
    <div class="hr-confirm-box">
      <div class="hr-confirm-title">CONFIRM PURCHASE</div>
      <div class="hr-confirm-name">{confirmItem.name}</div>
      <div class="hr-confirm-desc">{confirmItem.description}</div>
      <div class="hr-confirm-cost">
        Cost: ⚡ {getItemCost(confirmItem, getTimesPurchased(confirmItem, player))}
      </div>
      <div class="hr-confirm-btns">
        <button class="hr-confirm-yes" onclick={doPurchase}>CONFIRM</button>
        <button class="hr-confirm-no" onclick={cancelPurchase}>CANCEL</button>
      </div>
    </div>
  </div>
{/if}

{#if showResignationEnding}
  <div class="ending-overlay" role="dialog" aria-modal="true">
    <div class="ending-box">
      <div class="ending-frame">
        <div class="ending-eyebrow">— INTERNAL DOCUMENT —</div>
        <div class="ending-title">LETTER OF RESIGNATION</div>
        <div class="ending-body">
          <p>To whom it may concern,</p>
          <p>Effective immediately, I am resigning from my position at Wolton Industries.</p>
          <p>I understand this is an unusual department from which to submit such a letter.</p>
          <p>Nick nods. Takes the pen. Signs it without looking.</p>
          <p>"Good," he says. "You figured it out. Most people don't."</p>
          <p>The basement begins to unfold. The walls, the floor, the ceiling. The floors you have climbed and the floors you have not. All of it.</p>
          <p class="ending-sign">You walk out the front door for the first time.</p>
        </div>
        <button
          class="ending-btn"
          onclick={() => { showResignationEnding = false; onClose() }}
        >
          CLOSE
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .hr-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.92);
    display: flex; align-items: center; justify-content: center; z-index: 120;
  }
  .hr-box {
    background: var(--z-panel, #0a0a0a);
    border: 2px solid var(--z-accent, #4a90d9);
    box-shadow: 4px 4px 0 #000;
    width: 90vw; max-width: 1100px;
    height: 88vh;
    display: flex; flex-direction: column;
    font-family: 'Press Start 2P', monospace;
  }
  .hr-hdr {
    display: flex; align-items: center; gap: 11px;
    padding: 14px 18px;
    border-bottom: 2px solid var(--z-border, #222);
    background: var(--z-panel2, #111);
  }
  .hr-title { font-size: 12px; color: var(--z-accent, #4a90d9); flex: 1; letter-spacing: 1px; }
  .hr-tokens { font-size: 10px; color: #f0c030; }
  .mclose {
    background: none; border: 1px solid var(--z-border, #222);
    color: #555; font-family: inherit; font-size: 10px;
    padding: 5px 9px; cursor: pointer;
  }
  .mclose:hover { color: #fff; border-color: #fff; }

  .hr-tabs {
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 10px 18px; background: var(--z-panel2, #111);
    border-bottom: 1px solid var(--z-border, #222);
  }
  .hr-tab {
    background: var(--z-panel, #0a0a0a);
    border: 1px solid var(--z-border, #222);
    color: #888; font-family: inherit; font-size: 9px;
    padding: 7px 10px; cursor: pointer; letter-spacing: 0.5px;
  }
  .hr-tab:hover { color: var(--z-accent, #4a90d9); border-color: var(--z-accent, #4a90d9); }
  .hr-tab.active {
    color: var(--z-accent, #4a90d9);
    border-color: var(--z-accent, #4a90d9);
    background: color-mix(in srgb, var(--z-accent, #4a90d9) 15%, #000);
  }

  .hr-body {
    flex: 1; overflow-y: auto; padding: 18px;
    background: var(--z-panel, #0a0a0a);
  }
  .hr-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
  .hr-card {
    background: var(--z-panel2, #111);
    border: 1px solid var(--z-border, #222);
    padding: 12px;
    display: flex; flex-direction: column; gap: 8px;
    min-height: 160px;
  }
  .hr-card.active {
    border-color: var(--z-accent2, #6bb6ff);
    background: color-mix(in srgb, var(--z-accent2, #6bb6ff) 8%, var(--z-panel2, #111));
  }
  .hr-card.maxed {
    opacity: 0.7;
  }
  .hr-card-hdr { display: flex; justify-content: space-between; align-items: center; }
  .hr-card-name { font-size: 10px; color: var(--z-accent, #4a90d9); letter-spacing: 1px; }
  .hr-card-lvl { font-size: 8px; color: #f0c030; }
  .hr-card-desc { font-size: 9px; color: #ccc; line-height: 1.6; }
  .hr-card-flavour {
    font-size: 8px; color: #666; font-style: italic;
    line-height: 1.5; flex: 1;
  }
  .hr-card-footer { display: flex; justify-content: flex-end; align-items: center; margin-top: 4px; }
  .hr-card-max {
    font-size: 9px; color: #666; letter-spacing: 1px;
    padding: 5px 10px; border: 1px solid #333;
  }
  .hr-card-owned {
    font-size: 9px; color: var(--z-accent2, #6bb6ff); letter-spacing: 1px;
    padding: 5px 10px; border: 1px solid var(--z-accent2, #6bb6ff);
  }
  .hr-buy {
    background: color-mix(in srgb, var(--z-accent, #4a90d9) 18%, #000);
    border: 1px solid color-mix(in srgb, var(--z-accent, #4a90d9) 45%, #000);
    color: var(--z-accent, #4a90d9); font-family: inherit;
    font-size: 9px; padding: 7px 14px; cursor: pointer;
  }
  .hr-buy:hover:not(.disabled) {
    background: color-mix(in srgb, var(--z-accent, #4a90d9) 32%, #000);
  }
  .hr-buy.disabled, .hr-buy:disabled {
    background: #111; color: #333; border-color: #222;
    cursor: not-allowed;
  }

  .hr-empty {
    text-align: center; color: #555; font-size: 10px;
    padding: 60px 20px; letter-spacing: 1px;
  }

  .hr-footer {
    padding: 10px 18px; background: var(--z-panel2, #111);
    border-top: 1px solid var(--z-border, #222);
  }
  .hr-foot-note { font-size: 8px; color: #555; letter-spacing: 0.5px; }

  /* ── LORE ───────────────────────────────────────────────────────────── */
  .hr-lore { display: flex; flex-direction: column; gap: 16px; max-width: 760px; margin: 0 auto; }
  .lore-card {
    background: var(--z-panel2, #111);
    border-left: 3px solid var(--z-accent2, #6bb6ff);
    padding: 14px 18px;
  }
  .lore-title {
    font-size: 10px; color: var(--z-accent2, #6bb6ff);
    letter-spacing: 1px; margin-bottom: 10px;
  }
  .lore-body { font-size: 9px; color: #bbb; line-height: 1.9; }

  /* ── CONFIRM ─────────────────────────────────────────────────────────── */
  .hr-confirm-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center; z-index: 130;
  }
  .hr-confirm-box {
    background: var(--z-panel, #0a0a0a);
    border: 2px solid var(--z-accent, #4a90d9);
    box-shadow: 4px 4px 0 #000;
    padding: 20px 24px;
    min-width: 340px;
    display: flex; flex-direction: column; gap: 10px;
    font-family: 'Press Start 2P', monospace;
  }
  .hr-confirm-title {
    font-size: 10px; color: var(--z-accent, #4a90d9);
    letter-spacing: 1px; margin-bottom: 4px;
    border-bottom: 1px solid var(--z-border, #222); padding-bottom: 10px;
  }
  .hr-confirm-name { font-size: 11px; color: #f0c030; letter-spacing: 1px; }
  .hr-confirm-desc { font-size: 9px; color: #ccc; line-height: 1.7; }
  .hr-confirm-cost { font-size: 10px; color: var(--z-accent, #4a90d9); margin-top: 6px; }
  .hr-confirm-btns { display: flex; gap: 10px; margin-top: 8px; }
  .hr-confirm-yes {
    flex: 1;
    background: color-mix(in srgb, var(--z-accent, #4a90d9) 24%, #000);
    border: 1px solid var(--z-accent, #4a90d9);
    color: var(--z-accent, #4a90d9); font-family: inherit;
    font-size: 9px; padding: 9px 14px; cursor: pointer;
  }
  .hr-confirm-yes:hover {
    background: color-mix(in srgb, var(--z-accent, #4a90d9) 40%, #000);
  }
  .hr-confirm-no {
    background: #111; border: 1px solid #333;
    color: #888; font-family: inherit;
    font-size: 9px; padding: 9px 14px; cursor: pointer;
  }
  .hr-confirm-no:hover { color: #fff; border-color: #fff; }

  /* ── RESIGNATION ENDING ──────────────────────────────────────────────── */
  .ending-overlay {
    position: fixed; inset: 0;
    background: #000;
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
    animation: fade-in 1.2s ease-out;
  }
  .ending-box {
    max-width: 640px; width: 90vw;
    font-family: 'Press Start 2P', monospace;
  }
  .ending-frame {
    background: #0a0a0a;
    border: 2px solid #f0c030;
    padding: 36px 42px;
    box-shadow: 4px 4px 0 #000, 0 0 40px rgba(240,192,48,0.18);
    display: flex; flex-direction: column; gap: 18px;
  }
  .ending-eyebrow {
    font-size: 9px; color: #888; letter-spacing: 2px; text-align: center;
  }
  .ending-title {
    font-size: 13px; color: #f0c030; letter-spacing: 2px; text-align: center;
    border-bottom: 1px solid #333; padding-bottom: 14px;
  }
  .ending-body { font-size: 10px; color: #ccc; line-height: 2; }
  .ending-body p { margin: 0 0 10px 0; }
  .ending-sign { color: #f0c030; text-align: center; margin-top: 10px !important; }
  .ending-btn {
    margin: 10px auto 0;
    background: color-mix(in srgb, #f0c030 20%, #000);
    border: 1px solid #f0c030; color: #f0c030;
    font-family: inherit; font-size: 10px;
    padding: 10px 22px; cursor: pointer; letter-spacing: 1px;
  }
  .ending-btn:hover { background: color-mix(in srgb, #f0c030 35%, #000); }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>
