<script lang="ts">
  /**
   * TableDirectorTick: renderless Threlte component that must live inside <Canvas>.
   * Calls director.tick(delta) every frame via useTask so the ritual timeline
   * and jaw-chatter oscillators advance with the render loop.
   *
   * Usage: place ONE instance inside LiarsDiceTableLayer's <Canvas> block.
   */
  import { useTask } from '@threlte/core';
  import type { TableDirector } from './TableDirector.svelte.js';

  let { director }: { director: TableDirector } = $props();

  useTask((delta) => {
    director.tick(delta);
  });
</script>
