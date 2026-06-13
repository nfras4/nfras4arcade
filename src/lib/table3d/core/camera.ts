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

/** Camera world position (desktop, 5-seat view). */
export const CAM_POSITION: [number, number, number] = [0, 1.5, 3.6];

/** Camera lookAt point (desktop, 5-seat view). */
export const CAM_LOOK_AT: [number, number, number] = [0, 0.2, -0.6];

/** Camera FOV in degrees (desktop, 5-seat view). */
export const CAM_FOV = 42;

// ─── TV mode framing (6-seat FULL_TABLE_ARC, 16:9 landscape) ──────────────────

/** TV camera world position. Frames the 6-seat FULL_TABLE_ARC for far-field viewing. */
export const TV_CAMERA_POSITION: [number, number, number] = [0, 1.9, 4.6];

/** TV camera lookAt point. Slightly elevated to clear the table's sight line. */
export const TV_CAMERA_LOOK_AT: [number, number, number] = [0, 0.2, -0.5];

/** TV camera FOV in degrees. Tuned for 16:9 aspect ratio and spectator distance. */
export const TV_CAMERA_FOV = 46;

// Note: TV constants are PROVISIONAL pending art director tuning for final show framing.

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
