<script lang="ts">
  import { resolveTint } from '$lib/cosmetics/tintSpec';

  interface PlayerProp {
    id: string;
    name: string;
    level: number;
    nameColour?: string | null;
    frameSvg?: string | null;
    emblemSvg?: string | null;
    titleBadgeId?: string | null;
    isBot?: boolean;
    isHost?: boolean;
  }

  type Status = 'idle' | 'on-turn' | 'disconnected' | 'spectating' | 'winner';
  type Size = 'sm' | 'md' | 'lg';
  type Orientation = 'horizontal' | 'vertical';
  type Trailing = 'rank' | 'chip-balance' | 'action' | null;

  let {
    player,
    titleText = null,
    status = 'idle',
    size = 'md',
    orientation = 'horizontal',
    trailing = null,
    trailingValue = null,
  }: {
    player: PlayerProp;
    titleText?: string | null;
    status?: Status;
    size?: Size;
    orientation?: Orientation;
    trailing?: Trailing;
    trailingValue?: number | string | null;
  } = $props();

  const showEmblem = $derived(size !== 'sm');
  const showLevel = $derived(size !== 'sm');
  const showTitle = $derived(size === 'lg' && !!titleText);

  const nameColour = $derived(player.nameColour || '#e5e7eb');
  const tintSpec = $derived(resolveTint(player.frameSvg));

  const ariaLabel = $derived.by(() => {
    const parts = [player.name, `level ${player.level}`, status];
    if (player.isHost) parts.push('host');
    if (player.isBot) parts.push('bot');
    return parts.join(', ');
  });

  const trailingDisplay = $derived.by(() => {
    if (!trailing || trailingValue === null || trailingValue === undefined) return null;
    if (trailing === 'rank') return `#${trailingValue}`;
    if (trailing === 'chip-balance') return `${trailingValue} chips`;
    return String(trailingValue);
  });

  const statusDot = $derived.by(() => {
    if (player.isBot) return '▢';
    switch (status) {
      case 'on-turn':
        return '☆';
      case 'disconnected':
        return '✕';
      case 'spectating':
        return '◌';
      case 'winner':
        return '✨';
      case 'idle':
      default:
        return '●';
    }
  });
</script>

<div
  role="group"
  aria-label={ariaLabel}
  class="tile size-{size} orient-{orientation} status-{status}"
  class:has-frame={!!tintSpec}
  class:is-bot={player.isBot}
  class:is-host={player.isHost}
  data-tier={tintSpec?.tier ?? 'none'}
  style:--name-colour={nameColour}
  style:--tile-tint-rgb={tintSpec?.tintRgb ?? '0 0 0'}
  style:--tile-tint-opacity={tintSpec?.opacity ?? 0}
>
  {#if status === 'on-turn'}
    <span class="glow-layer" aria-hidden="true"></span>
  {/if}
  {#if status === 'winner'}
    <span class="glow-layer glow-winner" aria-hidden="true"></span>
  {/if}

  <div class="frame-inner">
    <span class="status-dot" aria-hidden="true">{statusDot}</span>

    {#if showEmblem && player.emblemSvg}
      <img class="emblem" src={player.emblemSvg} alt="" aria-hidden="true" />
    {/if}

    <span class="name-block">
      {#if player.isHost}<span class="host-crown" aria-hidden="true">♔</span>{/if}<span class="name">{player.name}</span>
    </span>

    {#if showLevel}
      <span class="level">Lv.{player.level}</span>
    {/if}

    {#if trailingDisplay}
      <span class="trailing trailing-{trailing}">{trailingDisplay}</span>
    {/if}
  </div>

  {#if showTitle}
    <span class="title-badge">{titleText}</span>
  {/if}
</div>

<style>
  :root {
    --winner-gold: #ffd700;
    --winner-gold-40: rgba(255, 215, 0, 0.4);
    --winner-gold-55: rgba(255, 215, 0, 0.55);
    --winner-gold-60: rgba(255, 215, 0, 0.6);
    --winner-gold-70: rgba(255, 215, 0, 0.7);
    --felt-green-glow-35: rgba(108, 180, 130, 0.35);
    --felt-green-glow-70: rgba(108, 180, 130, 0.7);
  }

  .tile {
    position: relative;
    display: flex;
    box-sizing: border-box;
    background: var(--bg-card);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    color: var(--text, #e5e7eb);
    transform: translateZ(0);
    will-change: transform, opacity;
    transition: opacity 0.15s ease, filter 0.15s ease;
  }

  .tile:not(.has-frame) {
    border: 2px solid var(--border);
  }

  /* Cosmetic tiles match the default 2px border. Tier signal comes from a
     left-to-right linear tint fade on the background; higher tiers layer
     additional subtle overlays on top. */
  .tile.has-frame {
    border: 2px solid var(--border);
    background-image: linear-gradient(
      90deg,
      rgb(var(--tile-tint-rgb) / var(--tile-tint-opacity, 0.15)) 0%,
      transparent 70%
    ),
    linear-gradient(var(--bg-card), var(--bg-card));
    background-repeat: no-repeat;
  }

  .tile.has-frame[data-tier='silver'] {
    background-image:
      repeating-linear-gradient(
        45deg,
        rgb(255 255 255 / 0.08) 0 2px,
        transparent 2px 8px
      ),
      linear-gradient(
        90deg,
        rgb(var(--tile-tint-rgb) / var(--tile-tint-opacity, 0.18)) 0%,
        transparent 70%
      ),
      linear-gradient(var(--bg-card), var(--bg-card));
    background-repeat: no-repeat;
  }

  .tile.has-frame[data-tier='gold'] {
    background-image:
      radial-gradient(
        ellipse at 30% 40%,
        rgb(255 255 255 / 0.1) 0%,
        transparent 60%
      ),
      linear-gradient(
        90deg,
        rgb(var(--tile-tint-rgb) / var(--tile-tint-opacity, 0.2)) 0%,
        transparent 70%
      ),
      linear-gradient(var(--bg-card), var(--bg-card));
    background-repeat: no-repeat;
  }

  .frame-inner {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .orient-vertical {
    flex-direction: column;
    align-items: stretch;
  }
  .orient-vertical .frame-inner {
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .orient-horizontal {
    flex-direction: column;
  }

  .status-dot {
    flex: 0 0 auto;
    font-size: 0.75rem;
    line-height: 1;
    color: var(--text-muted, #9ca3af);
  }
  .status-on-turn .status-dot { color: var(--accent, #6cb482); }
  .status-disconnected .status-dot { color: var(--text-subtle, #6b7280); }
  .status-spectating .status-dot { color: var(--text-subtle, #6b7280); }
  .status-winner .status-dot { color: var(--winner-gold); }
  .is-bot .status-dot { color: var(--text-muted, #9ca3af); }

  .emblem {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    object-fit: contain;
    display: block;
  }

  .name-block {
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    overflow: hidden;
  }

  .host-crown {
    flex: 0 0 auto;
    color: var(--yellow, #ffd700);
    font-size: 0.85em;
    line-height: 1;
  }

  .name {
    flex: 1 1 auto;
    min-width: 0;
    font-weight: 700;
    color: var(--name-colour);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .level {
    flex: 0 0 auto;
    font-size: 0.75em;
    color: var(--text-muted, #9ca3af);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .trailing {
    flex: 0 0 auto;
    font-size: 0.75em;
    color: var(--text-muted, #9ca3af);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding-left: 0.3rem;
  }
  .trailing-chip-balance { color: var(--yellow, #ffd700); }
  .trailing-rank { color: var(--accent, #6cb482); }

  .title-badge {
    display: block;
    margin-top: 0.3rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent, #6cb482);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .size-sm {
    min-width: 120px;
    max-width: 170px;
    font-size: 12px;
  }
  .size-sm .frame-inner { gap: 0.3rem; }
  .size-sm .name { font-size: clamp(11px, 3vw, 13px); }

  .size-md {
    min-width: 240px;
    font-size: 14px;
  }
  .size-md .name { font-size: 14px; }

  .size-lg {
    min-width: 320px;
    font-size: 16px;
  }
  .size-lg .name { font-size: 16px; }
  .size-lg .title-badge { font-size: 12px; }

  .glow-layer {
    position: absolute;
    inset: -4px;
    border-radius: 8px;
    pointer-events: none;
    transform: translateZ(0);
    will-change: opacity, box-shadow;
  }

  .size-md.status-on-turn .glow-layer,
  .size-lg.status-on-turn .glow-layer {
    border: 2px solid var(--accent, #6cb482);
    animation: ringPulse 1.6s ease-in-out infinite;
  }

  .size-sm.status-on-turn .glow-layer {
    box-shadow: 0 0 12px 2px var(--winner-gold-55);
    animation: glowPulse 1.6s ease-in-out infinite;
  }

  .glow-winner {
    box-shadow: 0 0 18px 4px var(--winner-gold-60);
  }

  .status-disconnected { opacity: 0.4; }
  .status-spectating { filter: saturate(0.5); }

  @keyframes ringPulse {
    0%, 100% { box-shadow: 0 0 6px var(--felt-green-glow-35); }
    50% { box-shadow: 0 0 14px var(--felt-green-glow-70); }
  }
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 8px 1px var(--winner-gold-40); }
    50% { box-shadow: 0 0 16px 3px var(--winner-gold-70); }
  }

  @media (prefers-reduced-motion: reduce) {
    .glow-layer,
    .size-sm.status-on-turn .glow-layer,
    .size-md.status-on-turn .glow-layer,
    .size-lg.status-on-turn .glow-layer {
      animation: none !important;
      box-shadow: none;
      border: 2px solid var(--accent, #6cb482);
    }
    .tile { transition: none; }
  }

  @media (max-width: 420px) {
    .size-sm {
      min-width: 0;
      max-width: 100%;
    }
  }
</style>

<!-- USAGE EXAMPLES
  Example 1: Compact in-game tile (mobile, 6-player grid)
  <PlayerTile
    player={{ id: 'p1', name: 'Nick', level: 7, nameColour: '#9ae6b4', frameSvg: '/cosmetics/frames/bronze.svg', emblemSvg: null, isHost: true }}
    status="on-turn"
    size="sm"
    orientation="horizontal"
  />

  Example 2: Lobby tile (desktop)
  <PlayerTile
    player={{ id: 'p2', name: 'Jordan', level: 14, frameSvg: '/cosmetics/frames/silver.svg', emblemSvg: '/cosmetics/emblems/flame.svg' }}
    status="idle"
    size="md"
    orientation="horizontal"
    trailing="chip-balance"
    trailingValue={2500}
  />

  Example 3: Profile / leaderboard tile with title
  <PlayerTile
    player={{ id: 'p3', name: 'Sora', level: 42, nameColour: '#ffd700', frameSvg: '/cosmetics/frames/gold.svg', emblemSvg: '/cosmetics/emblems/crown.svg', titleBadgeId: 'badge_first_win' }}
    titleText="Rookie Champion"
    status="winner"
    size="lg"
    orientation="horizontal"
    trailing="rank"
    trailingValue={1}
  />
-->
