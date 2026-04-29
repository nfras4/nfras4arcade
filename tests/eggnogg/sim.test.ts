import { describe, it, expect } from 'bun:test';
import { createInitialState, tick } from '../../src/lib/eggnogg/sim.js';
import { loadMap } from '../../src/lib/eggnogg/maps.js';
import { EMPTY_INPUT } from '../../src/lib/eggnogg/types.js';
import type { InputState, MapDef, Tile } from '../../src/lib/eggnogg/types.js';
import { PANEL_W, PANEL_H } from '../../src/lib/eggnogg/types.js';
import { toFP } from '../../src/lib/eggnogg/fixedPoint.js';

// Build a minimal 2-panel map with a solid ground row at the bottom.
function makeTestMap() {
	const groundRow = '@'.repeat(PANEL_W);
	const airRow = ' '.repeat(PANEL_W);
	// Build: separator, PANEL_H-1 air rows, 1 ground row, separator, same for panel 2
	const lines: string[] = [];
	for (let p = 0; p < 2; p++) {
		lines.push('---');
		for (let r = 0; r < PANEL_H - 1; r++) {
			lines.push(airRow);
		}
		lines.push(groundRow);
	}
	return loadMap(lines.join('\n'), 'test-map');
}

const testMap = makeTestMap();

describe('sim -- createInitialState', () => {
	it('p1 starts with hasSword=true', () => {
		const state = createInitialState(testMap, 42);
		expect(state.p1.hasSword).toBe(true);
	});

	it('p2 starts with hasSword=true', () => {
		const state = createInitialState(testMap, 42);
		expect(state.p2.hasSword).toBe(true);
	});

	it('p1 starts alive', () => {
		const state = createInitialState(testMap, 42);
		expect(state.p1.alive).toBe(true);
	});

	it('p2 starts alive', () => {
		const state = createInitialState(testMap, 42);
		expect(state.p2.alive).toBe(true);
	});

	it('p1 faces right (facing=1)', () => {
		const state = createInitialState(testMap, 42);
		expect(state.p1.facing).toBe(1);
	});

	it('p2 faces left (facing=-1)', () => {
		const state = createInitialState(testMap, 42);
		expect(state.p2.facing).toBe(-1);
	});

	it('phase is playing', () => {
		const state = createInitialState(testMap, 42);
		expect(state.phase).toBe('playing');
	});

	it('frame starts at 0', () => {
		const state = createInitialState(testMap, 42);
		expect(state.frame).toBe(0);
	});
});

describe('sim -- tick gravity', () => {
	it('vy increases (downward) when player is airborne with empty input', () => {
		const state = createInitialState(testMap, 0);
		// Lift player high above ground so gravity has room to act before collision.
		const airborne = {
			...state,
			p1: { ...state.p1, y: toFP(0), vy: 0, onGround: false },
		};
		const state1 = tick(airborne, EMPTY_INPUT, EMPTY_INPUT);
		// vy should have increased (GRAVITY is positive = downward)
		expect(state1.p1.vy).toBeGreaterThan(airborne.p1.vy);
	});

	it('vy increases further on second tick (gravity accumulates)', () => {
		const state = createInitialState(testMap, 0);
		const airborne = {
			...state,
			p1: { ...state.p1, y: toFP(0), vy: 0, onGround: false },
		};
		const state1 = tick(airborne, EMPTY_INPUT, EMPTY_INPUT);
		const state2 = tick(state1, EMPTY_INPUT, EMPTY_INPUT);
		expect(state2.p1.vy).toBeGreaterThan(state1.p1.vy);
	});

	it('vy does not exceed TERMINAL_VELOCITY (1500)', () => {
		// Use a map with no ground so vy never gets clamped by collision.
		const airRow = ' '.repeat(PANEL_W);
		const allAirLines: string[] = ['---'];
		for (let r = 0; r < PANEL_H; r++) allAirLines.push(airRow);
		const noGroundMap = loadMap(allAirLines.join('\n'), 'no-ground');
		const state = createInitialState(noGroundMap, 0);
		let current = {
			...state,
			p1: { ...state.p1, y: toFP(0), vy: 0, onGround: false },
		};
		for (let i = 0; i < 200; i++) {
			current = tick(current, EMPTY_INPUT, EMPTY_INPUT);
		}
		expect(current.p1.vy).toBeLessThanOrEqual(1500);
	});
});

describe('sim -- tick jump', () => {
	it('jump input on ground produces upward (negative) vy', () => {
		const baseState = createInitialState(testMap, 0);
		// Manually place player on ground by setting onGround=true and vy=0
		const state = {
			...baseState,
			p1: { ...baseState.p1, onGround: true, vy: 0, y: baseState.p1.y },
		};
		const jumpInput: InputState = { ...EMPTY_INPUT, jump: true };
		const state1 = tick(state, jumpInput, EMPTY_INPUT);
		// After jump, vy should be negative
		expect(state1.p1.vy).toBeLessThan(0);
	});

	it('jump does not trigger when player is airborne', () => {
		const baseState = createInitialState(testMap, 0);
		const state = {
			...baseState,
			p1: { ...baseState.p1, onGround: false, vy: 0 },
		};
		const jumpInput: InputState = { ...EMPTY_INPUT, jump: true };
		const state1 = tick(state, jumpInput, EMPTY_INPUT);
		// vy should not be JUMP_VELOCITY (should just be gravity applied to 0)
		// JUMP_VELOCITY is -1100, gravity = 60, so if no jump: vy = 0+60=60
		expect(state1.p1.vy).toBeGreaterThan(-1100);
	});
});

describe('sim -- tick ground collision', () => {
	it('downward velocity stops when player lands on ground', () => {
		const state = createInitialState(testMap, 0);
		// Place p1 just above the ground row (row 11 = y 176px, player 20px tall, so feet at 176)
		// Put player at y = 176-20 = 156px in FP with vy = 60 (falling)
		const groundY = (PANEL_H - 1) * 16; // row 11 * 16px = 176
		const playerFP = (groundY - 20) * 256; // place feet just touching
		const stateWithMap = {
			...state,
			p1: { ...state.p1, y: playerFP, vy: 60, onGround: false },
		};
		const state1 = tick(stateWithMap, EMPTY_INPUT, EMPTY_INPUT);
		// After collision, vy should be 0 and onGround should be true
		expect(state1.p1.onGround).toBe(true);
		expect(state1.p1.vy).toBe(0);
	});
});

describe('sim -- tick frame counter', () => {
	it('frame increments by 1 each tick', () => {
		const state = createInitialState(testMap, 0);
		const state1 = tick(state, EMPTY_INPUT, EMPTY_INPUT);
		expect(state1.frame).toBe(1);
		const state2 = tick(state1, EMPTY_INPUT, EMPTY_INPUT);
		expect(state2.frame).toBe(2);
	});
});

describe('fixed-timestep frame counter', () => {
	it('120 ticks from createInitialState produces frame === 120', () => {
		let state = createInitialState(testMap, 0);
		for (let i = 0; i < 120; i++) {
			state = tick(state, EMPTY_INPUT, EMPTY_INPUT);
		}
		expect(state.frame).toBe(120);
	});
});

describe('wall and ceiling collision', () => {
	// Build a hand-crafted single-panel map. Bottom row is ground.
	// We can stamp solid tiles into specific cells before each test.
	function makeBlankMap(): MapDef {
		const grid: Tile[][] = [];
		for (let r = 0; r < PANEL_H; r++) {
			const row: Tile[] = [];
			for (let c = 0; c < PANEL_W; c++) {
				row.push(r === PANEL_H - 1 ? 'ground' : 'air');
			}
			grid.push(row);
		}
		return {
			name: 'wall-test',
			panels: [grid],
			widthTiles: PANEL_W,
			heightTiles: PANEL_H,
		};
	}

	function setTile(map: MapDef, col: number, row: number, tile: Tile): void {
		map.panels[0][row][col] = tile;
	}

	it('player walking right into a ground wall stops at the boundary with vx=0', () => {
		const wallMap = makeBlankMap();
		// Place a vertical wall at column 5 spanning rows 8..10 (above ground row 11)
		for (let r = 8; r <= 10; r++) setTile(wallMap, 5, r, 'ground');

		const state = createInitialState(wallMap, 0);
		// Place player on the floor at column 3 (x=48px), feet on top of ground row 11.
		const playerY = (PANEL_H - 1) * 16 - 20; // 156 px
		const start = {
			...state,
			p1: {
				...state.p1,
				x: toFP(3 * 16),
				y: toFP(playerY),
				vx: 0,
				vy: 0,
				onGround: true,
			},
		};
		const right: InputState = { ...EMPTY_INPUT, right: true };
		// Walk right for many frames to ensure we hit the wall.
		let s = start;
		for (let i = 0; i < 60; i++) s = tick(s, right, EMPTY_INPUT);
		// Wall is at column 5 (left edge px = 80). Player width 12, so right edge px max = 79.
		// Player's left edge x must be <= 80 - 12 = 68 px.
		const playerLeftPx = s.p1.x / 256;
		expect(playerLeftPx).toBeLessThanOrEqual(68);
		expect(s.p1.vx).toBe(0);
	});

	it('player walking left into a ground wall stops at the boundary with vx=0', () => {
		const wallMap = makeBlankMap();
		// Wall at column 2 (left side)
		for (let r = 8; r <= 10; r++) setTile(wallMap, 2, r, 'ground');

		const state = createInitialState(wallMap, 0);
		const playerY = (PANEL_H - 1) * 16 - 20;
		const start = {
			...state,
			p1: {
				...state.p1,
				x: toFP(8 * 16),
				y: toFP(playerY),
				vx: 0,
				vy: 0,
				onGround: true,
			},
		};
		const left: InputState = { ...EMPTY_INPUT, left: true };
		let s = start;
		// WALK_SPEED is 250 FP/frame ≈ 0.97 px/frame; need ~85 frames to traverse 80px gap. Use 200 to be safe.
		for (let i = 0; i < 200; i++) s = tick(s, left, EMPTY_INPUT);
		// Wall at column 2: right edge px = (2+1)*16 = 48. Player left edge must be >= 48.
		const playerLeftPx = s.p1.x / 256;
		expect(playerLeftPx).toBeGreaterThanOrEqual(48);
		expect(s.p1.vx).toBe(0);
	});

	it('player jumping into ceiling has vy clamped to 0 and y clamped below ceiling', () => {
		const wallMap = makeBlankMap();
		// Place a ceiling tile spanning columns 3..5 at row 6.
		for (let c = 3; c <= 5; c++) setTile(wallMap, c, 6, 'ground');

		const state = createInitialState(wallMap, 0);
		// Ceiling tile at row 6 occupies pixels 96..111. Bottom of ceiling = 112 px.
		// Place player top at 113 px (just below ceiling) with strong upward velocity
		// so that integration moves player top into row 6 and triggers collision.
		const start = {
			...state,
			p1: {
				...state.p1,
				x: toFP(4 * 16),
				y: toFP(113),
				vx: 0,
				vy: -1000, // upward (FP units/frame). After +60 gravity, ≈ -940 FP/frame ≈ -3.67 px.
				onGround: false,
			},
		};
		const s = tick(start, EMPTY_INPUT, EMPTY_INPUT);
		// After tick: vy should be clamped to 0 because we hit ceiling.
		expect(s.p1.vy).toBe(0);
		// Player top should be clamped to the bottom of the ceiling tile (row 6 bottom = 112 px).
		const playerTopPx = s.p1.y / 256;
		expect(playerTopPx).toBe(112);
	});

	it('player in 1-tile-wide vertical corridor cannot exit horizontally', () => {
		const wallMap = makeBlankMap();
		// Walls at columns 4 and 6 spanning rows 6..10. Corridor is column 5.
		for (let r = 6; r <= 10; r++) {
			setTile(wallMap, 4, r, 'ground');
			setTile(wallMap, 6, r, 'ground');
		}

		const state = createInitialState(wallMap, 0);
		const playerY = (PANEL_H - 1) * 16 - 20;
		// Player at column 5, x = 5*16 = 80 px. Player width 12; right edge = 91 (< 96 = col 6 left).
		const start = {
			...state,
			p1: {
				...state.p1,
				x: toFP(5 * 16),
				y: toFP(playerY),
				vx: 0,
				vy: 0,
				onGround: true,
			},
		};
		const right: InputState = { ...EMPTY_INPUT, right: true };
		let s = start;
		for (let i = 0; i < 60; i++) s = tick(s, right, EMPTY_INPUT);
		// Player should still be inside the corridor: left edge px between 80 (col 5 left) and 84 (col 6 left - playerW)
		const playerLeftPx = s.p1.x / 256;
		expect(playerLeftPx).toBeGreaterThanOrEqual(80);
		expect(playerLeftPx).toBeLessThanOrEqual(84);
		expect(s.p1.vx).toBe(0);
	});
});

describe('determinism regression', () => {
	// TODO: once Step 3 calibrates final movement constants, replace the two-run
	// equivalence check below with an assertion against a hardcoded expected hash.
	it('two runs from same seed produce identical final state', () => {
		function run() {
			let state = createInitialState(testMap, 1);
			const right: InputState = { ...EMPTY_INPUT, right: true };
			const rightJump: InputState = { ...EMPTY_INPUT, right: true, jump: true };
			for (let i = 0; i < 300; i++) state = tick(state, right, EMPTY_INPUT);
			for (let i = 0; i < 300; i++) state = tick(state, rightJump, EMPTY_INPUT);
			return state;
		}
		const a = run();
		const b = run();
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});
