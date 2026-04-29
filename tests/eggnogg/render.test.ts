/**
 * Tests for the Eggnogg+ Renderer.
 * Uses a lightweight canvas stub so no browser globals are required.
 * Image loading is mocked to resolve immediately.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Renderer, TILE_ATLAS } from '../../src/lib/eggnogg/render.js';
import type { SimState, MapDef, Tile } from '../../src/lib/eggnogg/types.js';
import { PANEL_W, TILE_PX } from '../../src/lib/eggnogg/types.js';

// ---------------------------------------------------------------------------
// Minimal canvas stub
// ---------------------------------------------------------------------------

/** Tracks draw calls for assertion. */
interface DrawRecord {
  type: string;
  args: unknown[];
}

function makeCtxStub(): { ctx: CanvasRenderingContext2D; records: DrawRecord[] } {
  const records: DrawRecord[] = [];

  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    fillRect(...args: number[]) { records.push({ type: 'fillRect', args }); },
    clearRect(...args: number[]) { records.push({ type: 'clearRect', args }); },
    strokeRect(...args: number[]) { records.push({ type: 'strokeRect', args }); },
    beginPath() { records.push({ type: 'beginPath', args: [] }); },
    closePath() { records.push({ type: 'closePath', args: [] }); },
    moveTo(...args: number[]) { records.push({ type: 'moveTo', args }); },
    lineTo(...args: number[]) { records.push({ type: 'lineTo', args }); },
    arc(...args: number[]) { records.push({ type: 'arc', args }); },
    fill() { records.push({ type: 'fill', args: [] }); },
    stroke() { records.push({ type: 'stroke', args: [] }); },
    drawImage(...args: unknown[]) { records.push({ type: 'drawImage', args }); },
    save() { records.push({ type: 'save', args: [] }); },
    restore() { records.push({ type: 'restore', args: [] }); },
    translate(...args: number[]) { records.push({ type: 'translate', args }); },
    canvas: { width: 528, height: 192 },
  } as unknown as CanvasRenderingContext2D;

  return { ctx, records };
}

function makeCanvasStub(): HTMLCanvasElement {
  const { ctx } = makeCtxStub();
  return {
    getContext(_type: string) { return ctx; },
  } as unknown as HTMLCanvasElement;
}

// ---------------------------------------------------------------------------
// SimState factory helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<import('../../src/lib/eggnogg/types.js').PlayerState> = {}): import('../../src/lib/eggnogg/types.js').PlayerState {
  return {
    side: 'p1',
    x: 256,   // 1 pixel in FP (FP_SCALE=256)
    y: 1536,  // 6 pixels
    vx: 0,
    vy: 0,
    facing: 1,
    hasSword: true,
    aim: 'mid',
    stance: 'idle',
    stanceFrame: 0,
    onGround: true,
    jumpsLeft: 2,
    hitstunFrames: 0,
    alive: true,
    lives: 3,
    spawnPanel: 0,
    ...overrides,
  };
}

function makeSimState(overrides: Partial<SimState> = {}): SimState {
  return {
    frame: 0,
    phase: 'playing',
    p1: makePlayer({ side: 'p1' }),
    p2: makePlayer({ side: 'p2', x: 5120, facing: -1 }),
    swords: [],
    frontPanelP1: 0,
    frontPanelP2: 5,
    cameraPanel: 0,
    winner: null,
    rngSeed: 42,
    map: makeMap(),
    ...overrides,
  };
}

function makeMap(overrides: Partial<MapDef> = {}): MapDef {
  // Single panel, 1 ground tile at row 0 col 0
  const panels: Tile[][][] = [
    [
      ['ground', 'air', 'air'],
      ['air',    'air', 'air'],
    ],
  ];
  return {
    name: 'test',
    panels,
    widthTiles: PANEL_W,
    heightTiles: 12,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Renderer instantiates without throwing
// ---------------------------------------------------------------------------

describe('Renderer -- construction', () => {
  it('constructs with a mock canvas without throwing', () => {
    const canvas = makeCanvasStub();
    expect(() => new Renderer(canvas)).not.toThrow();
  });

  it('throws when canvas has no 2D context', () => {
    const badCanvas = {
      getContext(_: string) { return null; },
    } as unknown as HTMLCanvasElement;
    expect(() => new Renderer(badCanvas)).toThrow('Could not get 2D context from canvas');
  });
});

// ---------------------------------------------------------------------------
// Test 2: Camera panel to world-x math
// ---------------------------------------------------------------------------

describe('Renderer.panelToWorldX -- camera math', () => {
  it('panel 0 maps to world x = 0', () => {
    expect(Renderer.panelToWorldX(0)).toBe(0);
  });

  it('panel 1 maps to world x = 528 (33 tiles * 16px)', () => {
    // 1 * 33 * 16 = 528
    expect(Renderer.panelToWorldX(1)).toBe(528);
  });

  it('panel 2 maps to world x = 1056', () => {
    // 2 * 33 * 16 = 1056
    expect(Renderer.panelToWorldX(2)).toBe(1056);
  });

  it('panel 5 maps to world x = 2640', () => {
    // 5 * 33 * 16 = 2640
    expect(Renderer.panelToWorldX(5)).toBe(2640);
  });

  it('PANEL_W_PX constant equals 33 * 16 = 528', () => {
    expect(Renderer.PANEL_W_PX).toBe(PANEL_W * TILE_PX);
    expect(Renderer.PANEL_W_PX).toBe(528);
  });
});

// ---------------------------------------------------------------------------
// Test 3: TILE_ATLAS has an entry for every Tile type
// ---------------------------------------------------------------------------

describe('TILE_ATLAS -- completeness', () => {
  const allTiles: Tile[] = [
    'air', 'ground', 'spike_up', 'spike_down', 'mine',
    'wave_kill', 'wave_win', 'eggnogg', 'sword',
    'pillar_bg', 'vline_bg', 'dither_bg', 'sun_bg', 'skull_bg',
  ];

  for (const tile of allTiles) {
    it(`has atlas entry for "${tile}"`, () => {
      expect(TILE_ATLAS[tile]).toBeDefined();
      const entry = TILE_ATLAS[tile];
      expect(typeof entry.sx).toBe('number');
      expect(typeof entry.sy).toBe('number');
      expect(entry.sw).toBe(16);
      expect(entry.sh).toBe(16);
    });
  }

  it('spike_up and spike_down have distinct source y coords', () => {
    expect(TILE_ATLAS.spike_up.sy).not.toBe(TILE_ATLAS.spike_down.sy);
  });

  it('eggnogg atlas entry is in the center area (sx >= 64, sy >= 32)', () => {
    expect(TILE_ATLAS.eggnogg.sx).toBeGreaterThanOrEqual(64);
    expect(TILE_ATLAS.eggnogg.sy).toBeGreaterThanOrEqual(32);
  });
});

// ---------------------------------------------------------------------------
// Test 4: drawMap issues save/restore and a translate call
// ---------------------------------------------------------------------------

describe('Renderer.drawMap -- draw call structure', () => {
  it('saves, translates by -worldX, and restores on each drawMap call', () => {
    const { ctx, records } = makeCtxStub();
    const canvas = {
      getContext(_: string) { return ctx; },
    } as unknown as HTMLCanvasElement;

    const renderer = new Renderer(canvas);
    const state = makeSimState({ cameraPanel: 2 });
    const map = makeMap();

    renderer.drawMap(state, map);

    const saveIdx   = records.findIndex(r => r.type === 'save');
    const transIdx  = records.findIndex(r => r.type === 'translate');
    const restoreIdx = records.findIndex(r => r.type === 'restore');

    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(transIdx).toBeGreaterThan(saveIdx);
    expect(restoreIdx).toBeGreaterThan(transIdx);

    // translate(-worldX, 0): panel 2 => worldX = 1056, so translate arg[0] = -1056
    const translateArgs = records[transIdx].args as number[];
    expect(translateArgs[0]).toBe(-1056);
    expect(translateArgs[1]).toBe(0);
  });

  it('clears the background to black before drawing', () => {
    const { ctx, records } = makeCtxStub();
    const canvas = {
      getContext(_: string) { return ctx; },
    } as unknown as HTMLCanvasElement;

    const renderer = new Renderer(canvas);
    renderer.drawMap(makeSimState(), makeMap());

    // First fillRect should be the background clear.
    const fillRects = records.filter(r => r.type === 'fillRect');
    expect(fillRects.length).toBeGreaterThan(0);
    // Background clear uses full canvas dims (0, 0, 528, 192).
    const first = fillRects[0].args as number[];
    expect(first[0]).toBe(0);
    expect(first[1]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 5: loadAssets -- class is callable (mock Image behavior)
// ---------------------------------------------------------------------------

describe('Renderer.loadAssets -- callable', () => {
  it('resolves when all images load (mocked Image)', async () => {
    // Patch globalThis.Image to auto-resolve onload.
    const OriginalImage = (globalThis as Record<string, unknown>).Image;

    (globalThis as Record<string, unknown>).Image = class MockImage {
      private _src: string = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(val: string) {
        this._src = val;
        // Simulate async image load via microtask.
        Promise.resolve().then(() => { if (this.onload) this.onload(); });
      }
      get src(): string { return this._src; }
    };

    const canvas = makeCanvasStub();
    const renderer = new Renderer(canvas);

    await expect(renderer.loadAssets()).resolves.toBeUndefined();

    // Restore original Image (may be undefined in Bun test env, that is fine).
    if (OriginalImage !== undefined) {
      (globalThis as Record<string, unknown>).Image = OriginalImage;
    } else {
      delete (globalThis as Record<string, unknown>).Image;
    }
  });
});

// ---------------------------------------------------------------------------
// Test 6: drawMap skips dead players
// ---------------------------------------------------------------------------

describe('Renderer.drawMap -- dead player not drawn', () => {
  it('draws fewer arcs when p1 is dead', () => {
    const { ctx: ctx1, records: rec1 } = makeCtxStub();
    const canvas1 = { getContext(_: string) { return ctx1; } } as unknown as HTMLCanvasElement;
    const r1 = new Renderer(canvas1);
    r1.drawMap(makeSimState(), makeMap());
    const arcsAlive = rec1.filter(r => r.type === 'arc').length;

    const { ctx: ctx2, records: rec2 } = makeCtxStub();
    const canvas2 = { getContext(_: string) { return ctx2; } } as unknown as HTMLCanvasElement;
    const r2 = new Renderer(canvas2);
    const stateDeadP1 = makeSimState({ p1: makePlayer({ alive: false }) });
    r2.drawMap(stateDeadP1, makeMap());
    const arcsDead = rec2.filter(r => r.type === 'arc').length;

    // With p1 dead, fewer arc (head circle) calls should happen.
    expect(arcsDead).toBeLessThan(arcsAlive);
  });
});
