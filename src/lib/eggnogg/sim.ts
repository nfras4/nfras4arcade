/**
 * Eggnogg+ physics simulator (phase 1 skeleton).
 * Pure functions: no side effects, no Math.random, no Math.sin/cos.
 * All positions and velocities are fixed-point integers (FP_SCALE = 256).
 *
 * Phase 1 implements: gravity, ground collision, horizontal walk, jump.
 * Combat, sword physics, and screen scrolling land in phase 2.
 */

import type { SimState, PlayerState, InputState, MapDef, Tile, FP } from './types.js';
import { PANEL_W, PANEL_H, TILE_PX } from './types.js';
import { toFP, floorFP } from './fixedPoint.js';

// ---------------------------------------------------------------------------
// Physics constants (all in fixed-point units per frame at 60fps)
// ---------------------------------------------------------------------------
const GRAVITY = 60;
const WALK_SPEED = 250;
const JUMP_VELOCITY = -1100;
const TERMINAL_VELOCITY = 1500;

// Player hitbox in fixed-point (12px wide, 20px tall)
const PLAYER_W_FP = toFP(12);
const PLAYER_H_FP = toFP(20);

// ---------------------------------------------------------------------------
// Tile queries
// ---------------------------------------------------------------------------

function getTile(map: MapDef, tileX: number, tileY: number): Tile {
	if (tileY < 0 || tileY >= PANEL_H) return 'air';
	const panelIndex = Math.floor(tileX / PANEL_W);
	if (panelIndex < 0 || panelIndex >= map.panels.length) return 'air';
	const localX = tileX - panelIndex * PANEL_W;
	if (localX < 0 || localX >= PANEL_W) return 'air';
	return map.panels[panelIndex][tileY][localX];
}

function isSolid(tile: Tile): boolean {
	// spike_up is NOT solid — it's a death tile (handled in Step 5).
	return tile === 'ground' || tile === 'eggnogg';
}

export function isLethal(tile: Tile): boolean {
	return tile === 'spike_up' || tile === 'mine' || tile === 'wave_kill';
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

/**
 * Returns the highest solid tile surface (in FP) that the player is standing on,
 * or null if no solid ground directly below.
 * Checks two tile columns under the player feet.
 */
function groundSurfaceBelow(map: MapDef, x: FP, bottomY: FP): number | null {
	const pixBottom = floorFP(bottomY);
	const pixLeft = floorFP(x);
	const pixRight = floorFP(x + PLAYER_W_FP - 1);

	// Check tiles at the row that contains bottomY
	const tileRow = Math.floor(pixBottom / TILE_PX);
	const tileColLeft = Math.floor(pixLeft / TILE_PX);
	const tileColRight = Math.floor(pixRight / TILE_PX);

	// Check row below feet
	for (const col of [tileColLeft, tileColRight]) {
		if (isSolid(getTile(map, col, tileRow))) {
			const surfaceFP = toFP(tileRow * TILE_PX);
			return surfaceFP;
		}
	}
	return null;
}

/**
 * Resolve horizontal collision after vx is applied.
 * Scans tile rows at the player's leading edge (depending on direction)
 * and clamps x to the wall boundary if a solid tile is found.
 * Returns the resolved x and whether a wall was hit.
 */
function resolveWallX(
	map: MapDef,
	x: FP,
	y: FP,
	vx: FP,
	playerW: FP,
	playerH: FP
): { x: FP; hit: boolean } {
	if (vx === 0) return { x, hit: false };

	const pixTop = floorFP(y);
	const pixBottom = floorFP(y + playerH - 1);
	const tileRowTop = Math.floor(pixTop / TILE_PX);
	const tileRowBottom = Math.floor(pixBottom / TILE_PX);

	if (vx > 0) {
		// Moving right: check right edge
		const pixRight = floorFP(x + playerW - 1);
		const tileColRight = Math.floor(pixRight / TILE_PX);
		for (let row = tileRowTop; row <= tileRowBottom; row++) {
			if (isSolid(getTile(map, tileColRight, row))) {
				// Clamp x so right edge sits one pixel left of the wall tile
				const wallLeftPx = tileColRight * TILE_PX;
				return { x: toFP(wallLeftPx) - playerW, hit: true };
			}
		}
	} else {
		// Moving left: check left edge
		const pixLeft = floorFP(x);
		const tileColLeft = Math.floor(pixLeft / TILE_PX);
		for (let row = tileRowTop; row <= tileRowBottom; row++) {
			if (isSolid(getTile(map, tileColLeft, row))) {
				// Clamp x so left edge sits at the right side of the wall tile
				const wallRightPx = (tileColLeft + 1) * TILE_PX;
				return { x: toFP(wallRightPx), hit: true };
			}
		}
	}
	return { x, hit: false };
}

/**
 * Resolve ceiling collision after vy is applied (only relevant when vy < 0).
 * Returns clamped y and whether ceiling was hit.
 */
function resolveCeilingY(
	map: MapDef,
	x: FP,
	y: FP,
	vy: FP,
	playerW: FP
): { y: FP; hit: boolean } {
	if (vy >= 0) return { y, hit: false };

	const pixTop = floorFP(y);
	const pixLeft = floorFP(x);
	const pixRight = floorFP(x + playerW - 1);
	const tileColLeft = Math.floor(pixLeft / TILE_PX);
	const tileColRight = Math.floor(pixRight / TILE_PX);
	const tileRowTop = Math.floor(pixTop / TILE_PX);

	for (const col of [tileColLeft, tileColRight]) {
		if (isSolid(getTile(map, col, tileRowTop))) {
			// Clamp y so top edge sits at the bottom of the ceiling tile
			const ceilBottomPx = (tileRowTop + 1) * TILE_PX;
			return { y: toFP(ceilBottomPx), hit: true };
		}
	}
	return { y, hit: false };
}

// ---------------------------------------------------------------------------
// Player state helpers
// ---------------------------------------------------------------------------

function defaultPlayer(side: 'p1' | 'p2', x: number, y: number): PlayerState {
	return {
		side,
		x: toFP(x),
		y: toFP(y),
		vx: 0,
		vy: 0,
		facing: side === 'p1' ? 1 : -1,
		hasSword: true,
		aim: 'mid',
		stance: 'idle',
		stanceFrame: 0,
		onGround: false,
		jumpsLeft: 1,
		hitstunFrames: 0,
		alive: true,
		lives: 3,
		spawnPanel: side === 'p1' ? 0 : 0,
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a fresh SimState for the given map.
 * P1 spawns at the left side of panel 0, P2 at the right side of the last panel.
 * Both start with sword, both face inward.
 */
export function createInitialState(map: MapDef, seed: number): SimState {
	const lastPanel = map.panels.length - 1;

	// Find spawn Y: scan from row 0 downward for the first solid tile in the spawn column,
	// then place player just above it. Default to row 4 if nothing found.
	function spawnY(tileCol: number): number {
		for (let row = 1; row < PANEL_H; row++) {
			const panelIndex = Math.floor(tileCol / PANEL_W);
			const localX = tileCol - panelIndex * PANEL_W;
			const tile =
				panelIndex >= 0 && panelIndex < map.panels.length
					? map.panels[panelIndex][row][localX]
					: 'air';
			if (isSolid(tile)) {
				// Place player so their feet touch the top of this tile
				return row * TILE_PX - 20;
			}
		}
		return 4 * TILE_PX - 20;
	}

	const p1TileCol = 2;
	const p2TileCol = lastPanel * PANEL_W + PANEL_W - 3;

	const p1 = defaultPlayer('p1', p1TileCol * TILE_PX, spawnY(p1TileCol));
	const p2 = defaultPlayer('p2', p2TileCol * TILE_PX, spawnY(p2TileCol));

	p1.facing = 1;
	p2.facing = -1;
	p1.spawnPanel = 0;
	p2.spawnPanel = lastPanel;

	return {
		frame: 0,
		phase: 'playing',
		p1,
		p2,
		swords: [],
		frontPanelP1: 0,
		frontPanelP2: lastPanel,
		cameraPanel: 0,
		winner: null,
		rngSeed: seed,
		map,
	};
}

/**
 * Advance the simulation by one frame.
 * Phase 1: gravity, ground collision, horizontal walk, jump.
 */
export function tick(state: SimState, p1Input: InputState, p2Input: InputState): SimState {
	const p1 = tickPlayer(state.p1, p1Input, state);
	const p2 = tickPlayer(state.p2, p2Input, state);

	return {
		...state,
		frame: state.frame + 1,
		p1,
		p2,
	};
}

function tickPlayer(
	player: PlayerState,
	input: InputState,
	state: SimState
): PlayerState {
	if (!player.alive) return player;

	const map = state.map;

	let { x, y, vx, vy, onGround, jumpsLeft, facing, stance } = player;

	// --- Horizontal movement ---
	if (input.left) {
		vx = -WALK_SPEED;
		facing = -1;
	} else if (input.right) {
		vx = WALK_SPEED;
		facing = 1;
	} else {
		vx = 0;
	}

	// --- Jump ---
	if (input.jump && onGround) {
		vy = JUMP_VELOCITY;
		onGround = false;
		jumpsLeft = 0;
	}

	// --- Gravity ---
	vy = vy + GRAVITY;
	if (vy > TERMINAL_VELOCITY) vy = TERMINAL_VELOCITY;

	// --- Sweep X first ---
	x = x + vx;
	const wall = resolveWallX(map, x, y, vx, PLAYER_W_FP, PLAYER_H_FP);
	if (wall.hit) {
		x = wall.x;
		vx = 0;
	}

	// --- Sweep Y next ---
	y = y + vy;

	// --- Ceiling collision (vy < 0 case) ---
	const ceiling = resolveCeilingY(map, x, y, vy, PLAYER_W_FP);
	if (ceiling.hit) {
		y = ceiling.y;
		vy = 0;
	}

	// --- Ground collision (vy >= 0 case) ---
	const footY = y + PLAYER_H_FP;
	const surface = groundSurfaceBelow(map, x, footY);
	if (surface !== null && vy >= 0) {
		// Snap to ground surface (feet align to tile top)
		y = surface - PLAYER_H_FP;
		vy = 0;
		onGround = true;
		jumpsLeft = 1;
	} else {
		// Check if we were on ground but tile was removed under us
		const currentSurface = groundSurfaceBelow(map, x, y + PLAYER_H_FP + 1);
		if (currentSurface === null) {
			onGround = false;
		}
	}

	// --- Stance update ---
	if (!onGround) {
		stance = vy < 0 ? 'jumping' : 'falling';
	} else if (vx !== 0) {
		stance = 'walking';
	} else {
		stance = 'idle';
	}

	return {
		...player,
		x,
		y,
		vx,
		vy,
		facing,
		onGround,
		jumpsLeft,
		stance,
	};
}

// ---------------------------------------------------------------------------
// Game loop factory (render-path utility, lives outside sim hot path)
// ---------------------------------------------------------------------------

export interface GameLoopHandle {
	start(): void;
	stop(): void;
}

export interface GameLoopOptions {
	step?: number; // default 1000/60
	maxFrameCatchup?: number; // default 4 (cap accumulator at 4 frames)
}

/**
 * Fixed-timestep loop with rAF-driven render and accumulator-driven sim.
 * - Sim ticks at exactly `step` ms regardless of monitor refresh rate.
 * - On rAF resume after tab unfocus, lastTime resets to current time BEFORE
 *   draining the accumulator, so the cap applies to real elapsed time.
 * - Accumulator caps at `maxFrameCatchup * step` ms to prevent spiral-of-death.
 *
 * NOTE: STEP = 1000/60 is intentionally float; it lives in the render path,
 * never inside tick(). The sim hot path stays integer-only.
 *
 * tickFn: called once per fixed step
 * renderFn: called once per rAF (passed alpha = acc / step for interpolation if desired)
 */
export function createGameLoop(
	tickFn: () => void,
	renderFn: (alpha: number) => void,
	options: GameLoopOptions = {}
): GameLoopHandle {
	const STEP = options.step ?? 1000 / 60;
	const MAX_CATCHUP = (options.maxFrameCatchup ?? 4) * STEP;
	let acc = 0;
	let lastTime = 0;
	let rafId = 0;
	let running = false;
	let resumed = true; // first tick after start() always treated as resume

	function frame(now: number): void {
		if (!running) return;
		if (resumed) {
			lastTime = now;
			acc = 0;
			resumed = false;
		}
		const delta = now - lastTime;
		lastTime = now;
		acc = Math.min(acc + delta, MAX_CATCHUP);
		while (acc >= STEP) {
			tickFn();
			acc -= STEP;
		}
		renderFn(acc / STEP);
		rafId = requestAnimationFrame(frame);
	}

	return {
		start(): void {
			if (running) return;
			running = true;
			resumed = true;
			rafId = requestAnimationFrame(frame);
		},
		stop(): void {
			running = false;
			if (rafId) cancelAnimationFrame(rafId);
			rafId = 0;
		},
	};
}
