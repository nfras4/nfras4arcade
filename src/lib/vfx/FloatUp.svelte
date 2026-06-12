<script lang="ts">
  interface Props {
    /** Label text, e.g. "+250" or "BLACKJACK". */
    text: string;
    /** CSS color string. Defaults to var(--green). */
    color?: string;
  }

  let { text, color = 'var(--green)' }: Props = $props();

  let alive = $state(true);

  $effect(() => {
    const id = setTimeout(() => { alive = false; }, 900);
    return () => clearTimeout(id);
  });
</script>

{#if alive}
  <span
    class="float-up-label"
    style="color:{color};"
    aria-hidden="true"
  >{text}</span>
{/if}

<style>
  .float-up-label {
    position: absolute;
    left: 50%;
    top: 0;
    transform: translateX(-50%);
    font-family: 'Rajdhani', system-ui, sans-serif;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.06em;
    white-space: nowrap;
    pointer-events: none;
    z-index: 200;
    animation: fu-rise 800ms ease-out forwards;
  }

  @keyframes fu-rise {
    0%   { transform: translateX(-50%) translateY(0); opacity: 1; }
    70%  { opacity: 0.85; }
    100% { transform: translateX(-50%) translateY(-36px); opacity: 0; }
  }
</style>
