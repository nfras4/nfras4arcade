<script lang="ts">
  import type { VoiceParams } from './core/chatVoice.js';

  interface Props {
    entries: Array<{ id: number; playerId: string; text: string; voice: VoiceParams; ts: number }>;
    names: Record<string, string>;
    maxVisible?: number;
    nameColours?: Record<string, string | null>;
    tv?: boolean;
  }

  let {
    entries = [],
    names = {},
    maxVisible = 6,
    nameColours = {},
    tv = false,
  }: Props = $props();

  // Show the last maxVisible entries (oldest at top, newest at bottom)
  const visibleEntries = $derived(
    entries.slice(Math.max(0, entries.length - maxVisible))
  );

  // Detect reduced motion
  const rmQuery =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  let reducedMotion = $state(rmQuery?.matches ?? false);

  $effect(() => {
    if (!rmQuery) return;
    const handler = (e: MediaQueryListEvent) => { reducedMotion = e.matches; };
    rmQuery.addEventListener('change', handler);
    return () => rmQuery.removeEventListener('change', handler);
  });
</script>

<div class="chat-stage-log" class:tv-variant={tv} aria-hidden="true">
  {#each visibleEntries as entry (entry.id)}
    <div
      class="log-line"
      class:no-slide={reducedMotion}
    >
      <span
        class="line-name"
        style="color: {nameColours?.[entry.playerId] ?? 'var(--text, #ffffff)'}"
      >
        {names[entry.playerId] ?? 'Unknown'}:
      </span>
      <span class="line-text">{entry.text}</span>
    </div>
  {/each}
</div>

<style>
  .chat-stage-log {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    pointer-events: none;
    max-width: min(420px, 40%);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .chat-stage-log.tv-variant {
    bottom: 2rem;
    left: 2rem;
    max-width: 540px;
  }

  .log-line {
    background-color: rgba(0, 0, 0, 0.55);
    padding: 0.4rem 0.65rem;
    border-radius: 10px;
    font-size: clamp(0.85rem, 1.25vw, 1rem);
    color: var(--text, #ffffff);
    white-space: normal;
    word-wrap: break-word;
    line-height: 1.3;
    animation: slide-in 0.2s ease-out;
  }

  .chat-stage-log.tv-variant .log-line {
    font-size: clamp(1.1rem, 1.6vw, 1.5rem);
  }

  .log-line.no-slide {
    animation: none;
  }

  @keyframes slide-in {
    from {
      transform: translateY(8px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .line-name {
    font-weight: 600;
  }

  .line-text {
    color: var(--text, #ffffff);
    margin-left: 0.25rem;
  }
</style>
