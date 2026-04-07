// This file is overwritten by @sveltejs/adapter-cloudflare during build.
// After build, scripts/patch-worker.ts patches it to add:
//   - ImpostorRoom Durable Object export
//   - WebSocket upgrade interception (/ws route)
//
// API routes are handled by SvelteKit server routes (src/routes/api/).
// See worker/impostor/room.ts for the Durable Object class.

export default {
  async fetch() {
    return new Response('Run `bun run build` first', { status: 500 });
  },
};
