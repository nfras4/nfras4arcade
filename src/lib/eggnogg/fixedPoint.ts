/**
 * Fixed-point integer math helpers for the Eggnogg+ simulator.
 * All world positions and velocities are stored as integers: world_unit = pixel * FP_SCALE.
 * Only fromFP() converts back to float pixels, and only for rendering output.
 */

import type { FP } from './types.js';
export { FP_SCALE } from './types.js';

/** Convert pixel value to fixed-point integer. */
export function toFP(px: number): FP {
	return Math.round(px * 256) | 0;
}

/** Convert fixed-point integer back to float pixels. For rendering only, not simulation. */
export function fromFP(fp: FP): number {
	return fp / 256;
}

/** Multiply two fixed-point values: (a * b) / FP_SCALE, integer result. */
export function mulFP(a: FP, b: FP): FP {
	return ((a * b) / 256) | 0;
}

/** Divide two fixed-point values: (a * FP_SCALE) / b, integer result. */
export function divFP(a: FP, b: FP): FP {
	return ((a * 256) / b) | 0;
}

/** Convert fixed-point to integer pixel coordinate (floor). For collision math. */
export function floorFP(fp: FP): number {
	return (fp / 256) | 0;
}
