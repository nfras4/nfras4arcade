<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    /** Viewport X pixel. Omit to render in-place (position: absolute on parent). */
    x?: number;
    /** Viewport Y pixel. Omit to render in-place. */
    y?: number;
    /** Ring color. Defaults to var(--accent). */
    color?: string;
    /** Outer ring diameter in px. */
    size?: number;
    /** Fires one shockwave per increment. Increment this prop to trigger. */
    trigger?: number;
  }

  let {
    x,
    y,
    color = 'var(--accent)',
    size = 120,
    trigger = 0,
  }: Props = $props();

  let visible = $state(false);
  let prevTrigger = $state(0);

  $effect(() => {
    const t = trigger;
    untrack(() => {
      if (t !== prevTrigger) {
        prevTrigger = t;
        visible = true;
        const id = setTimeout(() => { visible = false; }, 700);
        return () => clearTimeout(id);
      }
    });
  });

  const fixedStyle = $derived(
    x !== undefined && y !== undefined
      ? `position:fixed;left:${x}px;top:${y}px;transform:translate(-50%,-50%);`
      : `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);`
  );
</script>

{#if visible}
  <span
    class="shockwave-host"
    style={fixedStyle}
    aria-hidden="true"
  >
    <span
      class="shockwave-ring ring-1"
      style="width:{size}px;height:{size}px;border-color:{color};"
    ></span>
    <span
      class="shockwave-ring ring-2"
      style="width:{size * 0.6}px;height:{size * 0.6}px;border-color:{color};"
    ></span>
  </span>
{/if}

<style>
  .shockwave-host {
    pointer-events: none;
    z-index: 9999;
  }

  .shockwave-ring {
    display: block;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.4);
    border-radius: 50%;
    border: 2px solid;
    opacity: 0.9;
    animation: sw-ring 600ms ease-out forwards;
  }

  .ring-2 {
    animation-delay: 80ms;
  }

  @keyframes sw-ring {
    0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.9; }
    100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
  }
</style>
