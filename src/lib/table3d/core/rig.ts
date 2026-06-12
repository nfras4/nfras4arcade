/**
 * Rig contract for the Monkey Table (Phase 0).
 * Node names here are the permanent interface: the Phase 0 procedural placeholder
 * and every future Blender GLB must use them exactly so models swap with zero code changes.
 * See: docs/table-art-bible.md, section "Rig contract"
 *
 * PORTABILITY: This file is engine-agnostic. No imports from svelte, three, threlte,
 * or SvelteKit. See docs/table-porting.md for the boundary rule.
 */

// ─── Node name constants ───────────────────────────────────────────────────────

export const NODE_ROOT          = 'Root';
export const NODE_HEAD          = 'Head';
export const NODE_JAW           = 'Jaw';
export const NODE_EYE_L         = 'EyeL';
export const NODE_EYE_R         = 'EyeR';
export const NODE_BROW_L        = 'BrowL';
export const NODE_BROW_R        = 'BrowR';
export const NODE_ANCHOR_CROWN  = 'AnchorCrown';
export const NODE_ANCHOR_BROW   = 'AnchorBrow';
export const NODE_ANCHOR_MOUTH  = 'AnchorMouth';
export const NODE_HAND_L        = 'HandL';
export const NODE_HAND_R        = 'HandR';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExpressionName = 'neutral' | 'grin' | 'shock' | 'sweat' | 'asleep' | 'laugh';

export type HatId = 'none' | 'party' | 'crown';

/** A single expression pose: all values applied simultaneously via lerp. */
export interface ExpressionPose {
  /** Jaw X-rotation in radians. Art bible: 0 closed, 0.45 max open. */
  jawRad: number;
  /** Eye Y-scale: 1.0 = normal, 0.7 = squint, 1.3 = wide. */
  eyeScale: number;
  /** Brow Y-offset in local units (positive = raised). */
  browOffset: number;
  /** Additional brow inward pinch angle in radians (used for sweat). */
  browPinch: number;
  /** Head tilt in degrees around Z-axis. Positive = tilt right. */
  headTiltDeg: number;
  /** Head pitch in degrees around X-axis. Positive = chin down (nodding forward). */
  headPitchDeg: number;
  /** Head pull-back translation in local Z units. Positive = pull back. */
  headPullBack: number;
  /** Whether the sweat tremor is active for this expression. */
  sweating: boolean;
}

export interface MonkeyConfig {
  furColor: string;
  expression: ExpressionName;
  /** 0..1 scalar from amplitude source (slider, oscillator, or audio analyser). */
  talkAmplitude: number;
  hat: HatId;
}

// ─── Expression presets (art bible § "Expressions") ──────────────────────────

export const EXPRESSION_POSES: Record<ExpressionName, ExpressionPose> = {
  neutral: {
    jawRad:        0,
    eyeScale:      1.0,
    browOffset:    0,
    browPinch:     0,
    headTiltDeg:   0,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      false,
  },
  grin: {
    jawRad:        0.12,
    eyeScale:      0.85,
    browOffset:    0,
    browPinch:     0,
    headTiltDeg:   4,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      false,
  },
  shock: {
    jawRad:        0.40,
    eyeScale:      1.30,
    browOffset:    0.08,  // raised brows
    browPinch:     0,
    headTiltDeg:   0,
    headPitchDeg:  0,
    headPullBack:  6,     // pulls back (6 degrees-worth of units)
    sweating:      false,
  },
  sweat: {
    jawRad:        0,
    eyeScale:      0.70,
    browOffset:    0,
    browPinch:     0.12,  // pinched inward
    headTiltDeg:   0,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      true,
  },
  /**
   * laugh: vindicated player's triumphant reaction during the Liar's Ritual VERDICT cue.
   * Jaw open wide, eyes squinted, head tilted with a slight pitch back.
   */
  laugh: {
    jawRad:        0.30,
    eyeScale:      0.85,
    browOffset:    0.06,
    browPinch:     0,
    headTiltDeg:   5,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      false,
  },
  /**
   * asleep: used for eliminated players still seated at the table.
   * Head pitched far forward (chin toward chest), eyes near-closed.
   * Must read clearly at 200px and at the new camera distance (~2.4 units).
   */
  asleep: {
    jawRad:        0.08,  // mouth slightly slack
    eyeScale:      0.15,  // nearly closed
    browOffset:   -0.04,  // brows low, heavy
    browPinch:     0,
    headTiltDeg:   3,     // slight list to one side
    headPitchDeg:  28,    // chin toward chest -- reads as "passed out" at distance
    headPullBack:  0,
    sweating:      false,
  },
};

// ─── Jaw-flap constants (art bible § "Jaw flap") ─────────────────────────────

/** Maximum jaw rotation from talk amplitude at full amplitude. */
export const JAW_MAX_TALK_RAD = 0.35;

/** Hard upper clamp on jaw rotation (art bible: 0 to 0.45). */
export const JAW_CLAMP_MAX_RAD = 0.45;

/**
 * Lerp factor per frame assuming 60fps.
 * Applied each frame regardless of actual delta; roughly correct for 60fps gameplay.
 * Art bible: ~0.3/frame at 60fps.
 */
export const JAW_LERP_FACTOR = 0.3;

/** Head bob magnitude per unit of talk amplitude, in degrees. */
export const HEAD_BOB_DEG_PER_AMP = 2;

// ─── Sweat tremor constants ───────────────────────────────────────────────────

/** Tremor amplitude in degrees (art bible: ~0.5 degrees). */
export const SWEAT_TREMOR_DEG = 0.5;

/** Tremor frequency in Hz (art bible: ~8Hz). */
export const SWEAT_TREMOR_HZ = 8;

// ─── Expression transition ────────────────────────────────────────────────────

/**
 * Lerp factor per frame for expression transitions.
 * Targeting ~150ms ease-out at 60fps: 1 - (1 - t)^(60*0.15) ≈ smooth.
 * A factor of ~0.15 per frame gives 90% there in ~14 frames (~230ms at 60fps).
 * Using 0.18 hits the 120-180ms window comfortably.
 */
export const EXPR_LERP_FACTOR = 0.18;

// ─── Fur palette ─────────────────────────────────────────────────────────────
// Six player colours derived from the app's existing player accent CSS vars.
// The app uses --accent (#5a8a5a green) and --casino (#f39c12 gold) as primary accents,
// with --yellow, --blue, --red, --green as semantic colours.
// These six warm toy-like values are chosen to read clearly at 200px tall and
// to echo the app's dark-mode accent family. They SHOULD converge with the CSS vars
// once the full Monkey Table palette is formalised (TODO: reconcile with app.css).
export const FUR_COLOURS: readonly string[] = [
  '#8B5E3C',  // warm walnut brown   (echoes --casino warmth)
  '#C47C3A',  // honey amber         (echoes --casino gold)
  '#5A8A5A',  // muted sage green    (matches --accent exactly)
  '#A85C52',  // clay rust red       (echoes --red desaturated)
  '#B8A060',  // straw gold          (echoes --yellow desaturated)
  '#7A7A8A',  // slate grey          (neutral complement)
] as const;

// ─── Geometry constants ───────────────────────────────────────────────────────
// Used by PlaceholderMonkey to keep geometry consistent and swappable.

/** Head dimensions [width, height, depth] in Three.js units. Wider than tall (1.2:1). */
export const HEAD_SIZE: [number, number, number] = [1.2, 1.0, 1.0];

/**
 * Muzzle box dimensions [width, height, depth].
 * Combined upper+jaw height is ~0.34; protrudes ~0.18 past the head face.
 */
export const MUZZLE_SIZE: [number, number, number] = [0.62, 0.22, 0.32];

/** Jaw mesh dimensions [width, height, depth]. Thin slab, same width as muzzle. */
export const JAW_SIZE: [number, number, number] = [0.60, 0.12, 0.30];

/**
 * Ear disc dimensions [radiusTop, radiusBottom, height, segments].
 * Cylinder axis along Z so the disc face points at the camera (Mickey-style).
 */
export const EAR_PARAMS: [number, number, number, number] = [0.34, 0.34, 0.06, 10];

/** Inner ear disc dimensions (cream inset, slightly in front of outer ear). */
export const INNER_EAR_PARAMS: [number, number, number, number] = [0.22, 0.22, 0.04, 10];

/** Eye sphere dimensions [radius, widthSegs, heightSegs]. Bumped to 10x7 for less lumpiness. */
export const EYE_SPHERE_PARAMS: [number, number, number] = [0.14, 10, 7];

/** Pupil disc dimensions: [radius, height, segments]. */
export const PUPIL_PARAMS: [number, number, number] = [0.08, 0.01, 7];

// ─── Muzzle cream colour ─────────────────────────────────────────────────────
/** Art bible: muzzle and inner ears are cream #F2E3C9. */
export const CREAM_COLOUR = '#F2E3C9';
