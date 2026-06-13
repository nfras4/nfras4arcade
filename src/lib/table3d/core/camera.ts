/**
 * Camera rig constants for the seated-parallax effect.
 *
 * These values define the "turning your head at a chair" feel.
 * All angular values are in degrees; the rig converts to radians internally.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 * See docs/table-porting.md for the boundary rule.
 */

// ─── Authored framing (from art bible staging datum) ─────────────────────────

/** Camera world position. */
export const CAM_POSITION: [number, number, number] = [0, 1.5, 3.6];

/** Camera lookAt point. */
export const CAM_LOOK_AT: [number, number, number] = [0, 0.2, -0.6];

/** Camera FOV in degrees. */
export const CAM_FOV = 42;

// ─── Parallax feel constants ──────────────────────────────────────────────────

/**
 * Maximum yaw lean in degrees (+/- from authored heading).
 * Art bible: "about +/-6 degrees yaw".
 */
export const PARALLAX_YAW_DEG = 6;

/**
 * Maximum pitch lean in degrees (+/- from authored pitch).
 * Art bible: "about +/-2.5 degrees pitch".
 */
export const PARALLAX_PITCH_DEG = 2.5;

/**
 * Lerp factor per frame at 60fps for easing toward the pointer target.
 * Art bible: "lerp ~0.08/frame". Higher = snappier, lower = dreamier.
 */
export const PARALLAX_LERP = 0.08;

/**
 * Lerp factor used when the pointer leaves the stage or ritual is active.
 * Slightly slower than tracking to give a relaxed drift-to-centre feel.
 */
export const PARALLAX_RETURN_LERP = 0.05;
