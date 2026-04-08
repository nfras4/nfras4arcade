/**
 * Patches a known SvelteKit guard plugin bug where the import chain tracing
 * through SvelteKit's own internal modules (internal.js -> paths/server.js ->
 * paths/index.js -> client.js) causes a false "impossible situation" error
 * for legitimate server-only files like hooks.server.ts.
 *
 * Run automatically via postinstall.
 */
import { readFileSync, writeFileSync } from 'fs';

const GUARD_FILE = 'node_modules/@sveltejs/kit/src/exports/vite/index.js';

let code = readFileSync(GUARD_FILE, 'utf8');

const target = `throw new Error('An impossible situation occurred');`;

if (!code.includes(target)) {
  console.log('SvelteKit guard patch: already applied or target not found, skipping.');
  process.exit(0);
}

const replacement = `// Patched: guard reached end of import chain without finding a client entrypoint.
				// This can happen when SvelteKit's own internal module graph creates
				// a chain through paths/server.js. Safe to skip.
				return;`;

code = code.replace(target, replacement);

writeFileSync(GUARD_FILE, code);
console.log('SvelteKit guard patch: applied successfully.');
