<script lang="ts">
  import { revealSchedule, type VoiceParams } from './core/chatVoice.js';

  interface Props {
    text: string;
    voice: VoiceParams;
    startTs: number;
    onDone?: () => void;
    reducedMotion?: boolean;
  }

  let { text, voice: _voice, startTs, onDone, reducedMotion = false }: Props = $props();

  let revealedCount = $state(0);
  let isDwelling = $state(false);

  // Constants
  const DWELL_MS = 4000;
  const REVEAL_SPEED_CPS = 18;

  // Compute reveal schedule on mount.
  // Iterate by Unicode code points so astral emoji reveal as one character,
  // not two surrogate halves (audit fix #8).
  const codePoints = Array.from(text);
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

    // Audit fix #28: when the bubble mounts LATE (view switch, slow render)
    // relative to the audio path (which fires on chatLog append), the
    // typewriter would lag the blips. Compute an offset from the canonical
    // startTs and (a) instantly reveal characters whose delay has already
    // passed, (b) schedule remaining ones at delaysMs[i] - offsetMs.
    const offsetMs = Math.max(0, Date.now() - startTs);

    if (reducedMotion) {
      // Under reduced-motion: show all text immediately, dwell, then done
      revealedCount = codePoints.length;
      isDwelling = true;

      const dwellTimeout = setTimeout(() => {
        onDone?.();
      }, Math.max(0, DWELL_MS - Math.max(0, offsetMs - (delaysMs[delaysMs.length - 1] ?? 0))));

      timeoutIds.push(dwellTimeout);
    } else {
      // Normal mode: typewriter reveal code-point-by-code-point.
      // Skip-ahead any chars whose scheduled delay is already in the past.
      let firstFutureIndex = 0;
      for (let i = 0; i < codePoints.length; i++) {
        if (delaysMs[i] <= offsetMs) {
          firstFutureIndex = i + 1;
        } else {
          break;
        }
      }
      if (firstFutureIndex > 0) {
        revealedCount = firstFutureIndex;
      }

      if (firstFutureIndex >= codePoints.length) {
        // Entire reveal already in the past: jump to dwell.
        isDwelling = true;
        const dwellTimeout = setTimeout(() => {
          onDone?.();
        }, DWELL_MS);
        timeoutIds.push(dwellTimeout);
      } else {
        for (let i = firstFutureIndex; i < codePoints.length; i++) {
          const delayMs = Math.max(0, delaysMs[i] - offsetMs);

          const revealTimeout = setTimeout(() => {
            revealedCount = i + 1;

            // After the last character, enter dwell phase
            if (i === codePoints.length - 1) {
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
    }

    return cleanup;
  });
</script>

<div class="bubble">
  <div class="content">
    {codePoints.slice(0, revealedCount).join('')}{#if !isDwelling && revealedCount < codePoints.length}_
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
