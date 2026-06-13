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

export type ExpressionName = 'neutral' | 'grin' | 'shock' | 'sweat' | 'asleep' | 'laugh' | 'smug';

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
  /**
   * Lower-face curve, roughly -1..1. There is no drawn mouth line: the chin
   * carries expression. Positive tucks the chin up and widens it (content
   * closed-mouth smile); negative narrows it and cracks open a dark sliver
   * (worry/frown).
   */
  mouthCurve: number;
  /** Chin tremble 0..1: anxious chatter on the jaw (reduced-motion safe). */
  mouthWave: number;
  /** Chin tilt -1..1: jaw swings to one side (smirk). */
  mouthSkew: number;
  /** Show the floating sweat-droplet prop for this expression. */
  showSweatDrop?: boolean;
  /** Show the floating exclamation-mark prop for this expression. */
  showAlert?: boolean;
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
    mouthCurve:    0.30,  // gentle resting smile
    mouthWave:     0.55,  // cute squiggle (reference art's wavy mouth)
    mouthSkew:     0,
  },
  grin: {
    jawRad:        0.12,
    eyeScale:      0.85,
    browOffset:    0.05,
    browPinch:    -0.04,
    headTiltDeg:   4,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      false,
    mouthCurve:    0.85,  // big clean smile
    mouthWave:     0,
    mouthSkew:     0,
  },
  shock: {
    jawRad:        0.40,
    eyeScale:      1.30,
    browOffset:    0.14,  // raised brows
    browPinch:     0,
    headTiltDeg:   0,
    headPitchDeg:  0,
    headPullBack:  6,     // pulls back (6 degrees-worth of units)
    sweating:      false,
    mouthCurve:   -0.15,  // slack; the open jaw carries the read
    mouthWave:     0,
    mouthSkew:     0,
    showAlert:     true,
  },
  sweat: {
    jawRad:        0,
    eyeScale:      0.70,
    browOffset:   -0.03,
    browPinch:     0.22,  // pinched inward
    headTiltDeg:   0,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      true,
    mouthCurve:   -0.35,  // anxious downturn
    mouthWave:     1.0,   // maximum wobble
    mouthSkew:     0,
    showSweatDrop: true,
  },
  /**
   * laugh: vindicated player's triumphant reaction during the Liar's Ritual VERDICT cue.
   * Jaw open wide, eyes squinted, head tilted with a slight pitch back.
   */
  laugh: {
    jawRad:        0.30,
    eyeScale:      0.85,
    browOffset:    0.10,
    browPinch:    -0.06,
    headTiltDeg:   5,
    headPitchDeg:  0,
    headPullBack:  0,
    sweating:      false,
    mouthCurve:    1.0,   // widest smile
    mouthWave:     0,
    mouthSkew:     0,
  },
  /**
   * asleep: used for eliminated players still seated at the table.
   * Head pitched far forward (chin toward chest), eyes near-closed.
   * Must read clearly at 200px and at the new camera distance (~2.4 units).
   */
  asleep: {
    jawRad:        0.08,  // mouth slightly slack
    eyeScale:      0.15,  // nearly closed
    browOffset:   -0.06,  // brows low, heavy
    browPinch:     0,
    headTiltDeg:   3,     // slight list to one side
    headPitchDeg:  28,    // chin toward chest -- reads as "passed out" at distance
    headPullBack:  0,
    sweating:      false,
    mouthCurve:   -0.10,  // slack, faintly down
    mouthWave:     0.15,
    mouthSkew:     0,
  },

  /**
   * smug: asymmetric knowing look. Used by taunt and sus emotes.
   * One-sided head tilt + squinted eyes + slight jaw smirk.
   */
  smug: {
    jawRad:        0.06,  // barely-open smirk
    eyeScale:      0.78,  // narrowed, knowing
    browOffset:    0.04,  // one brow raised (approximated via uniform offset + pinch asymmetry)
    browPinch:    -0.08,  // outward slant -- opposite of sweat's worry pinch
    headTiltDeg:   6,     // distinct lean, reads clearly at distance
    headPitchDeg: -2,     // chin ever so slightly up (confident)
    headPullBack:  0,
    sweating:      false,
    mouthCurve:    0.30,
    mouthWave:     0,
    mouthSkew:     0.8,   // one corner up: the smirk itself
  },
};

// ─── Jaw-flap constants (art bible § "Jaw flap") ─────────────────────────────

/** Maximum jaw rotation from talk amplitude at full amplitude. */
export const JAW_MAX_TALK_RAD = 0.42;

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

// ─── Geometry constants (cartoony v2) ────────────────────────────────────────
// Used by PlaceholderMonkey to keep geometry consistent and swappable.
// Overall head bounding height stays ~1.1 units so seat/camera framing from
// Phase 0 (head centre at seat Y + ~0.5) still holds.

/** Cranium: low-poly sphere radius, before squash. */
export const HEAD_RADIUS = 0.55;

/** Cranium squash [x, y, z]: slightly wider than tall, slightly shallow. */
export const HEAD_SQUASH: [number, number, number] = [1.12, 1.0, 0.92];

/** Cream face plate: flattened sphere radius hugging the front of the head. */
export const FACE_PLATE_RADIUS = 0.40;

/** Muzzle sphere radius before squash. */
export const MUZZLE_RADIUS = 0.30;

/**
 * Ear disc dimensions [radiusTop, radiusBottom, height, segments].
 * Cylinder axis along Z so the disc face points at the camera (Mickey-style).
 * Bigger than Phase 0: the oversized ears are the marketable silhouette.
 */
export const EAR_PARAMS: [number, number, number, number] = [0.40, 0.40, 0.08, 12];

/** Inner ear disc dimensions (cream inset, slightly in front of outer ear). */
export const INNER_EAR_PARAMS: [number, number, number, number] = [0.28, 0.28, 0.05, 12];

/** Eye sphere radius. Solid glossy black ovals, no separate pupil. */
export const EYE_RADIUS = 0.115;

// ─── Muzzle cream colour ─────────────────────────────────────────────────────
/** Art bible: muzzle and inner ears are cream #F2E3C9. */
export const CREAM_COLOUR = '#F2E3C9';
