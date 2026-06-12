import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    // @threlte/core must not be prebundled: vite-plugin-svelte 4.x does not
    // auto-exclude it, and prebundling duplicates the Svelte runtime, which
    // breaks setContext inside Threlte's <Canvas> (lifecycle_outside_component).
    exclude: ['@threlte/core']
  }
});
