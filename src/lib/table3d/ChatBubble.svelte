<script lang="ts">
  import { revealSchedule, type VoiceParams } from './core/chatVoice.js';

  interface Props {
    text: string;
    voice: VoiceParams;
    startTs: number;
    onDone?: () => void;
    reducedMotion?: boolean;
  }

  let { text, voice: _voice, startTs: _startTs, onDone, reducedMotion = false }: Props = $props();

  let revealedCount = $state(0);
  let isDwelling = $state(false);

  // Constants
  const DWELL_MS = 4000;
  const REVEAL_SPEED_CPS = 18;

  // Compute reveal schedule on mount
  const { delaysMs } = revealSchedule(text, REVEAL_SPEED_CPS);

  // State machine: reveal characters, then dwell, then call onDone.
  // Audio is NOT played here; the route's $effect calls playChatBlips() once
  // per chatLog entry so all views (table, controller, classic) share one
  // audio path with no double-play risk.
  $effect(() => {
    let timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const cleanup = () => {
      timeoutIds.forEach(id => clearTimeout(id));
      timeoutIds = [];
    };

    if (reducedMotion) {
      // Under reduced-motion: show all text immediately, dwell, then done
      revealedCount = text.length;
      isDwelling = true;

      const dwellTimeout = setTimeout(() => {
        onDone?.();
      }, DWELL_MS);

      timeoutIds.push(dwellTimeout);
    } else {
      // Normal mode: typewriter reveal character-by-character
      for (let i = 0; i < text.length; i++) {
        const delayMs = delaysMs[i];

        const revealTimeout = setTimeout(() => {
          revealedCount = i + 1;

          // After the last character, enter dwell phase
          if (i === text.length - 1) {
            isDwelling = true;
            const dwellTimeout = setTimeout(() => {
              onDone?.();
            }, DWELL_MS);
            timeoutIds.push(dwellTimeout);
          }
        }, delayMs);

        timeoutIds.push(revealTimeout);
      }
    }

    return cleanup;
  });
</script>

<div class="bubble">
  <div class="content">
    {text.slice(0, revealedCount)}{#if !isDwelling && revealedCount < text.length}_
    {/if}
  </div>
</div>

<style>
  .bubble {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 0.5rem;
    animation: pop-in 0.14s ease-out backwards;
    animation-delay: 0s;
  }

  @keyframes pop-in {
    0% {
      opacity: 0;
      transform: translateX(-50%) scale(0.85);
    }
    100% {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
  }

  .content {
    background-color: rgba(0, 0, 0, 0.78);
    border-radius: 12px;
    padding: 0.5rem 0.75rem;
    max-width: 240px;
    font-size: 0.9rem;
    color: var(--text, #ffffff);
    white-space: normal;
    word-wrap: break-word;
    position: relative;
    font-family: inherit;
    font-weight: 400;
    line-height: 1.3;
  }

  /* Small tail pointing down */
  .content::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid rgba(0, 0, 0, 0.78);
  }

  /* Respect prefers-reduced-motion: disable animation */
  @media (prefers-reduced-motion: reduce) {
    .bubble {
      animation: none;
    }
  }
</style>
