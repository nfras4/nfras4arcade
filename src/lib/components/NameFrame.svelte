<script lang="ts">
  import { resolveTint } from '$lib/cosmetics/tintSpec';

  interface Props {
    name: string;
    level?: number;
    frameSvg?: string | null;
    emblemSvg?: string | null;
    nameColour?: string | null;
    titleText?: string | null;
    size?: 'pill' | 'full';
    compact?: boolean;
    isHost?: boolean;
    isBot?: boolean;
  }

  let {
    name,
    level,
    frameSvg = null,
    emblemSvg = null,
    nameColour = null,
    titleText = null,
    size = 'pill',
    compact = false,
    isHost = false,
    isBot = false,
  }: Props = $props();

  const resolvedColour = $derived(nameColour || 'var(--name-frame-default-colour, #e5e7eb)');
  const tintSpec = $derived(resolveTint(frameSvg));
  const hasFrame = $derived(!!tintSpec);
  const showLevel = $derived(size === 'full' && !!level);
  const showTitle = $derived(size === 'full' && !!titleText);

  const ariaLabel = $derived.by(() => {
    let parts = '';
    if (isHost) parts += 'Host ';
    if (isBot) parts += 'Bot ';
    parts += name;
    if (level) parts += `, level ${level}`;
    if (titleText) parts += `, ${titleText}`;
    return parts;
  });
</script>

<div
  role="group"
  aria-label={ariaLabel}
  class="nameframe size-{size}"
  class:compact
  class:has-frame={hasFrame}
  data-tier={tintSpec?.tier ?? 'none'}
  style:--nf-colour={resolvedColour}
  style:--nf-tint-rgb={tintSpec?.tintRgb ?? '0 0 0'}
  style:--nf-tint-opacity={tintSpec?.opacity ?? 0}
>
  <div class="nf-inner">
    {#if emblemSvg}
      <img class="emblem" src={emblemSvg} alt="" aria-hidden="true" />
    {/if}

    <span class="name-block">
      {#if isHost}<span class="host-crown" aria-hidden="true">♔</span>{/if}{#if isBot}<span class="bot-square" aria-hidden="true">▢</span>{/if}<span class="name">{name}</span>
    </span>

    {#if showLevel}
      <span class="level">Lv.{level}</span>
    {/if}
  </div>

  {#if showTitle}
    <span class="title-badge">{titleText}</span>
  {/if}
</div>

<style>
  .nameframe {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 6px 10px;
    border-radius: 6px;
    color: var(--nf-colour);
  }

  .nameframe:not(.has-frame) {
    border: 1px solid var(--name-frame-default-border, #334155);
  }

  /* Cosmetic nameplates match the default 1px border. The tier signal is
     carried entirely by a left-to-right linear tint fade on the background,
     with higher tiers layering additional subtle overlays on top. */
  .nameframe.has-frame {
    border: 1px solid var(--name-frame-default-border, #334155);
    background-image: linear-gradient(
      90deg,
      rgb(var(--nf-tint-rgb) / var(--nf-tint-opacity, 0.21)) 0%,
      transparent 70%
    );
  }

  .nameframe.has-frame[data-tier='silver'] {
    background-image:
      repeating-linear-gradient(
        45deg,
        rgb(255 255 255 / 0.08) 0 2px,
        transparent 2px 8px
      ),
      linear-gradient(
        90deg,
        rgb(var(--nf-tint-rgb) / var(--nf-tint-opacity, 0.25)) 0%,
        transparent 70%
      );
  }

  .nameframe.has-frame[data-tier='gold'] {
    background-image:
      radial-gradient(
        ellipse at 30% 40%,
        rgb(255 255 255 / 0.1) 0%,
        transparent 60%
      ),
      linear-gradient(
        90deg,
        rgb(var(--nf-tint-rgb) / var(--nf-tint-opacity, 0.28)) 0%,
        transparent 70%
      );
  }

  .nf-inner {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .emblem {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    margin-right: 6px;
    object-fit: contain;
    display: block;
  }

  .name-block {
    flex: 1 1 auto;
    min-width: 0;
    display: inline-flex;
    align-items: baseline;
    gap: 0.2rem;
    overflow: hidden;
  }

  .host-crown {
    flex: 0 0 auto;
    color: var(--yellow, #ffd700);
    font-size: 0.9em;
    line-height: 1;
  }

  .bot-square {
    flex: 0 0 auto;
    color: var(--text-muted, #9ca3af);
    font-size: 0.9em;
    line-height: 1;
  }

  .name {
    font-weight: 700;
    color: var(--nf-colour);
    white-space: nowrap;
  }

  .level {
    flex: 0 0 auto;
    font-size: 0.75em;
    color: var(--text-muted, #9ca3af);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .title-badge {
    display: block;
    margin-top: 0.25rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent, #6cb482);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Compact mode: via prop OR ancestor class */
  .nameframe.compact,
  :global(.nameframe-compact) .nameframe {
    padding: 2px 4px;
  }

  .nameframe.compact .emblem,
  :global(.nameframe-compact) .nameframe .emblem {
    display: none;
  }

  .nameframe.compact .title-badge,
  :global(.nameframe-compact) .nameframe .title-badge {
    display: none;
  }

  .nameframe.compact .name,
  :global(.nameframe-compact) .nameframe .name {
    max-width: 10ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: no-preference) {
    .nameframe {
      transition: filter 0.15s ease;
    }
  }
</style>

<!-- USAGE:
  <NameFrame name="Nick" nameColour="#f39c12" frameSvg="/cosmetics/frames/gold.svg" emblemSvg="/cosmetics/emblems/flame.svg" />
  <NameFrame name="Nickolas Very Long Name" compact frameSvg="/cosmetics/frames/bronze.svg" />
  <NameFrame name="Nick" size="full" titleText="Chip Tycoon" level={50} frameSvg="/cosmetics/frames/gold.svg" isHost />
-->
