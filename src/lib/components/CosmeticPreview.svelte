<script lang="ts">
  /**
   * CosmeticPreview — renders an actual visual preview of a cosmetic item
   * for shop and customize cards. Replaces the generic emoji icon so each
   * subcategory shows what the player will actually receive.
   *
   * Supported subcategories:
   *  - frame        → mock player tile wrapped in the frame border (uses gradient + svg)
   *  - emblem       → SVG rendered large over a soft glow disc
   *  - card_back    → playing-card-shaped element with back-pattern CSS class
   *                   (red_pattern, blue_pattern, gold_foil) or inline fallback
   *                   pattern keyed on style name (obsidian_sigil, forest_weave,
   *                   storm_grid, crimson_lattice)
   *  - table_felt   → felt swatch with radial gradient + stitched border
   *  - name_colour  → item name rendered in the hex colour with subtle underline
   *  - avatar       → large emoji rendered from icon hex codepoint
   *  - title        → chip-badge with emoji + name
   *  - default      → emoji fallback
   */

  interface CosmeticItem {
    id: string;
    subcategory: string | null;
    name: string;
    icon: string;
    metadata: string | null;
  }

  interface ParsedMetadata {
    svg?: string;
    hex?: string;
    style?: string;
    gradient?: string[];
    slice?: string;
    borderWidth?: string;
  }

  let {
    item,
    size = 'shop',
  }: {
    item: CosmeticItem;
    size?: 'shop' | 'customize';
  } = $props();

  // Parse metadata once per item change ----------------------------------
  const metaValue = $derived.by<ParsedMetadata>(() => {
    if (!item.metadata) return {};
    try {
      return JSON.parse(item.metadata) as ParsedMetadata;
    } catch {
      return {};
    }
  });

  // Convert codepoint string (e.g. "1F0CF") to emoji character ----------
  const emoji = $derived.by(() => {
    try {
      const cp = parseInt(item.icon, 16);
      if (!isNaN(cp)) return String.fromCodePoint(cp);
    } catch {}
    return item.icon || '?';
  });

  // Resolve frame SVG: filename → /cosmetics/frames/<name>, data: → pass through
  const frameSvgUrl = $derived.by(() => {
    const svg = metaValue.svg;
    if (!svg) return null;
    if (svg.startsWith('data:') || svg.startsWith('http') || svg.startsWith('/')) return svg;
    return `/cosmetics/frames/${svg}`;
  });

  // Resolve emblem SVG: filename → /cosmetics/emblems/<name>, data: → pass through
  const emblemSvgUrl = $derived.by(() => {
    const svg = metaValue.svg;
    if (!svg) return null;
    if (svg.startsWith('data:') || svg.startsWith('http') || svg.startsWith('/')) return svg;
    return `/cosmetics/emblems/${svg}`;
  });

  // Frame gradient backdrop (creates the inner glow behind the border)
  const frameGradient = $derived.by(() => {
    const g = metaValue.gradient;
    if (g && g.length >= 2) return `linear-gradient(135deg, ${g[0]} 0%, ${g[1]} 100%)`;
    return 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-input) 100%)';
  });

  // Card-back styles already covered by Card.svelte CSS
  const knownBackStyles = new Set(['red_pattern', 'blue_pattern', 'gold_foil']);
  const cardBackStyle = $derived(metaValue.style ?? null);
  const useKnownBackClass = $derived(!!cardBackStyle && knownBackStyles.has(cardBackStyle));

  // Inline fallback background for level-reward card backs whose CSS
  // classes don't yet live in Card.svelte (obsidian_sigil etc.)
  const cardBackInlineBg = $derived.by(() => {
    if (!cardBackStyle || useKnownBackClass) return null;
    switch (cardBackStyle) {
      case 'obsidian_sigil':
        return `radial-gradient(circle at 50% 50%, #1a1a24 0%, #06060a 70%),
                repeating-linear-gradient(90deg, rgba(120, 90, 200, 0.18) 0 1px, transparent 1px 8px)`;
      case 'forest_weave':
        return `repeating-linear-gradient(45deg, #1a3326 0 3px, #244a36 3px 6px),
                repeating-linear-gradient(-45deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 5px)`;
      case 'storm_grid':
        return `repeating-linear-gradient(0deg, #1a2a3a 0 3px, #243a52 3px 4px),
                repeating-linear-gradient(90deg, rgba(120, 180, 255, 0.12) 0 1px, transparent 1px 6px)`;
      case 'crimson_lattice':
        return `repeating-linear-gradient(60deg, #4a1018 0 3px, #6a1820 3px 6px),
                repeating-linear-gradient(-60deg, rgba(255, 200, 120, 0.1) 0 1px, transparent 1px 5px)`;
      default:
        return `repeating-linear-gradient(45deg, var(--border) 0 2px, transparent 2px 6px)`;
    }
  });

  const cardBackInlineStyle = $derived(
    cardBackInlineBg ? `background: ${cardBackInlineBg};` : ''
  );

  // Name colour hex (with sane fallback)
  const colourHex = $derived(metaValue.hex || '#e5e7eb');

  // Subcategory routing
  const sub = $derived(item.subcategory);
</script>

<div class="cos-preview" data-size={size} data-sub={sub ?? 'unknown'} aria-hidden="true">
  {#if sub === 'frame'}
    <div class="frame-stage">
      <div
        class="frame-mock"
        style:--frame-url="url('{frameSvgUrl}')"
        style:--frame-bg={frameGradient}
      >
        <div class="frame-inner">
          <span class="frame-avatar">{'🎭'}</span>
          <span class="frame-name">Preview</span>
        </div>
      </div>
    </div>

  {:else if sub === 'emblem'}
    <div class="emblem-stage">
      <span class="emblem-glow"></span>
      {#if emblemSvgUrl}
        <img class="emblem-img" src={emblemSvgUrl} alt="" />
      {:else}
        <span class="emblem-emoji">{emoji}</span>
      {/if}
    </div>

  {:else if sub === 'card_back'}
    <div class="cardback-stage">
      <div class="cardback-card">
        {#if useKnownBackClass}
          <span class="back-pattern back-pattern--{cardBackStyle}"></span>
        {:else}
          <span class="back-pattern back-pattern--inline" style={cardBackInlineStyle}></span>
        {/if}
      </div>
    </div>

  {:else if sub === 'table_felt'}
    <div class="felt-stage">
      <div
        class="felt-swatch"
        style:--felt-base={colourHex}
      >
        <span class="felt-stitch"></span>
      </div>
    </div>

  {:else if sub === 'name_colour'}
    <div class="colour-stage">
      <span class="colour-name" style:color={colourHex} style:--colour-hex={colourHex}>
        {item.name}
      </span>
    </div>

  {:else if sub === 'avatar'}
    <div class="avatar-stage">
      <span class="avatar-glow"></span>
      <span class="avatar-emoji">{emoji}</span>
    </div>

  {:else if sub === 'title'}
    <div class="title-stage">
      <span class="title-chip">
        <span class="title-chip-icon">{emoji}</span>
        <span class="title-chip-name">{item.name}</span>
      </span>
    </div>

  {:else}
    <span class="fallback-emoji">{emoji}</span>
  {/if}
</div>

<style>
  .cos-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    line-height: 1;
  }

  .cos-preview[data-size='shop'] {
    min-height: 80px;
  }

  .cos-preview[data-size='customize'] {
    min-height: 64px;
  }

  /* ---------- FRAME ---------- */
  .frame-stage {
    width: 100%;
    display: flex;
    justify-content: center;
  }

  .frame-mock {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 6px 10px;
    background-image: var(--frame-bg);
    background-size: cover;
    border-style: solid;
    border-width: 8px;
    border-color: transparent;
    border-image-source: var(--frame-url);
    border-image-slice: 30 fill;
    border-image-width: 8px;
    border-image-repeat: stretch;
    min-width: 110px;
    box-shadow: 0 0 14px rgba(0, 0, 0, 0.4) inset;
  }

  .cos-preview[data-size='customize'] .frame-mock {
    border-width: 6px;
    padding: 4px 8px;
    min-width: 92px;
  }

  .frame-inner {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }

  .frame-avatar {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.95rem;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.18);
  }

  .cos-preview[data-size='customize'] .frame-avatar {
    width: 18px;
    height: 18px;
    font-size: 0.8rem;
  }

  .frame-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #f5f1e6;
  }

  /* ---------- EMBLEM ---------- */
  .emblem-stage {
    position: relative;
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cos-preview[data-size='customize'] .emblem-stage {
    width: 48px;
    height: 48px;
  }

  .emblem-glow {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(
      circle at center,
      var(--shop-gold-30, rgba(243, 156, 18, 0.3)) 0%,
      transparent 70%
    );
    filter: blur(2px);
  }

  .emblem-img {
    position: relative;
    z-index: 1;
    width: 44px;
    height: 44px;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
  }

  .cos-preview[data-size='customize'] .emblem-img {
    width: 36px;
    height: 36px;
  }

  .emblem-emoji {
    position: relative;
    z-index: 1;
    font-size: 2rem;
    line-height: 1;
  }

  /* ---------- CARD BACK ---------- */
  .cardback-stage {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cardback-card {
    width: 56px;
    height: 78px;
    background: var(--bg-input);
    border: 1.5px solid var(--border-bright, #444);
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }

  .cos-preview[data-size='customize'] .cardback-card {
    width: 46px;
    height: 64px;
    border-width: 1px;
  }

  /* Mirror the Card.svelte back-pattern definitions so previews stay
     in sync without needing a global stylesheet refactor. */
  .back-pattern {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    opacity: 0.85;
  }

  .back-pattern--red_pattern {
    background: repeating-linear-gradient(
      45deg,
      #8b1a1a 0px,
      #8b1a1a 2px,
      #c0392b 2px,
      #c0392b 6px
    );
  }

  .back-pattern--blue_pattern {
    background: repeating-linear-gradient(
      45deg,
      #1a3a5c 0px,
      #1a3a5c 2px,
      #2980b9 2px,
      #2980b9 6px
    );
  }

  .back-pattern--gold_foil {
    background: repeating-linear-gradient(
      45deg,
      #b8860b 0px,
      #b8860b 2px,
      #ffd700 2px,
      #ffd700 6px
    );
    opacity: 0.9;
  }

  .back-pattern--inline {
    opacity: 1;
    background-size: cover, cover;
  }

  /* ---------- TABLE FELT ---------- */
  .felt-stage {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .felt-swatch {
    position: relative;
    width: 92px;
    height: 60px;
    border-radius: 8px;
    background:
      radial-gradient(
        ellipse at center,
        color-mix(in srgb, var(--felt-base) 100%, white 8%) 0%,
        var(--felt-base) 60%,
        color-mix(in srgb, var(--felt-base) 70%, black 30%) 100%
      );
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(0, 0, 0, 0.3) inset;
    overflow: hidden;
  }

  .cos-preview[data-size='customize'] .felt-swatch {
    width: 76px;
    height: 50px;
  }

  /* Subtle felt-fiber noise overlay */
  .felt-swatch::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 3px),
      repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.04) 0 1px, transparent 1px 3px);
    pointer-events: none;
  }

  /* Stitched border to evoke the felt edge of a real table */
  .felt-stitch {
    position: absolute;
    inset: 4px;
    border: 1px dashed rgba(255, 255, 255, 0.22);
    border-radius: 5px;
    pointer-events: none;
  }

  /* ---------- NAME COLOUR ---------- */
  .colour-stage {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.5rem;
  }

  .colour-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    text-shadow:
      0 0 8px color-mix(in srgb, var(--colour-hex) 40%, transparent),
      0 1px 2px rgba(0, 0, 0, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    position: relative;
  }

  .cos-preview[data-size='customize'] .colour-name {
    font-size: 0.95rem;
  }

  .colour-name::after {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    bottom: -2px;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      currentColor 50%,
      transparent 100%
    );
    opacity: 0.5;
  }

  /* ---------- AVATAR ---------- */
  .avatar-stage {
    position: relative;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cos-preview[data-size='customize'] .avatar-stage {
    width: 52px;
    height: 52px;
  }

  .avatar-glow {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: radial-gradient(
      circle at 35% 30%,
      rgba(255, 255, 255, 0.18) 0%,
      var(--bg-card) 50%,
      var(--bg-input) 100%
    );
    border: 1px solid var(--shop-gold-30, rgba(243, 156, 18, 0.3));
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }

  .avatar-emoji {
    position: relative;
    z-index: 1;
    font-size: 2.4rem;
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  .cos-preview[data-size='customize'] .avatar-emoji {
    font-size: 2rem;
  }

  /* ---------- TITLE ---------- */
  .title-stage {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.4rem;
  }

  .title-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    background: linear-gradient(
      180deg,
      var(--shop-gold-08, rgba(243, 156, 18, 0.08)) 0%,
      transparent 100%
    );
    border: 1px solid var(--shop-gold-30, rgba(243, 156, 18, 0.3));
    border-radius: 2px;
    max-width: 100%;
  }

  .title-chip-icon {
    font-size: 0.95rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .title-chip-name {
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--shop-gold, #f39c12);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---------- FALLBACK ---------- */
  .fallback-emoji {
    font-size: 2rem;
    line-height: 1;
  }
</style>
