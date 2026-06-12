<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    /** Whether the spotlight is active. Fades in/out over 250ms. */
    active: boolean;
    /** Content to keep bright (sits above the dim layer). */
    children?: Snippet;
  }

  let { active, children }: Props = $props();
</script>

{#if active}
  <div class="spotlight-backdrop" aria-hidden="true"></div>
{/if}

{#if children && active}
  <div class="spotlight-content">
    {@render children()}
  </div>
{/if}

<style>
  .spotlight-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    z-index: 300;
    pointer-events: none;
    animation: sp-fade-in 250ms ease forwards;
  }

  .spotlight-content {
    position: fixed;
    inset: 0;
    z-index: 301;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    animation: sp-fade-in 250ms ease forwards;
  }

  @keyframes sp-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
</style>
