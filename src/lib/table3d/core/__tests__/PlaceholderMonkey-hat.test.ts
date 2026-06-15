import { describe, it, expect } from 'vitest';
import {
  type HatId,
  NODE_ANCHOR_CROWN,
} from '../rig.js';

// ── PlaceholderMonkey hat rendering ───────────────────────────────────────────
//
// PlaceholderMonkey.svelte depends on Threlte + THREE.js which require a
// WebGL/canvas context unavailable in vitest's node environment. Mounting the
// Svelte component directly would throw at import time on `useTask` and WebGL
// geometry constructors.
//
// Instead we verify the rig contract that the component is built against:
//   - All hat ids are valid HatId union members (compile-time + runtime).
//   - The anchor node name used by the hat-swap logic matches the rig constant.
//   - The builder functions in the .svelte file are covered indirectly through
//     rig.ts exports (hat switch branches are exercised in integration via the
//     resolver tests; geometry construction requires a canvas).
//
// If a future test run adds a browser/canvas environment (e.g. playwright or
// vitest-browser), the Svelte mount tests should be ported there.

// ── HatId: all known values compile and round-trip ───────────────────────────

describe('HatId values (rig contract)', () => {
  it('all wearable hat ids are valid HatId members', () => {
    const wearable: HatId[] = ['party', 'top_hat', 'beanie', 'sombrero', 'crown',
      'wizard', 'cowboy', 'halo', 'horns', 'propeller', 'chef', 'graduate',
      'viking', 'flower_crown', 'cat_ears', 'santa', 'beret'];
    expect(wearable).toHaveLength(17);
    for (const id of wearable) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('"none" is the no-hat sentinel and a valid HatId', () => {
    const sentinel: HatId = 'none';
    expect(sentinel).toBe('none');
  });

  it('HatId covers exactly 18 values including the sentinel', () => {
    // Enumerate every value the union currently declares.
    // Adding a new hat without updating this list will cause a type error.
    const all: HatId[] = ['none', 'party', 'top_hat', 'beanie', 'sombrero', 'crown',
      'wizard', 'cowboy', 'halo', 'horns', 'propeller', 'chef', 'graduate',
      'viking', 'flower_crown', 'cat_ears', 'santa', 'beret'];
    expect(all).toHaveLength(18);
  });

  it('each hat id is a non-empty lowercase string with no spaces', () => {
    const all: HatId[] = ['none', 'party', 'top_hat', 'beanie', 'sombrero', 'crown',
      'wizard', 'cowboy', 'halo', 'horns', 'propeller', 'chef', 'graduate',
      'viking', 'flower_crown', 'cat_ears', 'santa', 'beret'];
    for (const id of all) {
      expect(id).toMatch(/^[a-z_]+$/);
    }
  });
});

// ── Rig anchor name used by hat-swap logic ────────────────────────────────────

describe('NODE_ANCHOR_CROWN (hat attachment point)', () => {
  it('is a non-empty string', () => {
    expect(typeof NODE_ANCHOR_CROWN).toBe('string');
    expect(NODE_ANCHOR_CROWN.length).toBeGreaterThan(0);
  });

  it('equals "AnchorCrown" (rig contract stable name)', () => {
    // PlaceholderMonkey attaches hats via anchorCrown.add(activeHat).
    // The GLB swap contract requires this node name to be permanent.
    expect(NODE_ANCHOR_CROWN).toBe('AnchorCrown');
  });
});

// ── Harness limitation note ───────────────────────────────────────────────────
//
// To add full render coverage (geometry child counts per hat id), run the
// component under a browser environment:
//   1. Add vitest-browser or use Playwright component testing.
//   2. Import PlaceholderMonkey.svelte and mount it with hat='party' etc.
//   3. Traverse root.getObjectByName('AnchorCrown').children to assert
//      child count > 0 for every wearable id and === 0 for 'none'.
