/**
 * Eggnogg+ canvas renderer.
 * Handles asset loading, tile drawing, player drawing, and camera panning.
 * All coordinates are in screen pixels; fixed-point values are converted via fromFP().
 */

import type { SimState, MapDef, Tile, AimHeight } from './types.js';
import { TILE_PX, PANEL_W } from './types.js';
import { fromFP } from './fixedPoint.js';

// ---------------------------------------------------------------------------
// Tile atlas constants
// tiles.png is 256x144, tiles are 16x16.
// Source rects are { sx, sy, sw, sh } in pixels within the PNG.
// Phase 1 rough mapping -- phase 4 will refine via auto-tuner.
// ---------------------------------------------------------------------------

interface AtlasRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Placeholder rect used when a tile type has no specific atlas entry yet. */
const PLACEHOLDER: AtlasRect = { sx: 0, sy: 0, sw: 16, sh: 16 };

/**
 * Tile atlas mapping for tiles.png (256x144, 16x16 tiles).
 * Layout assumptions based on visual inspection:
 *   Row 0 (y=0):   ground/wall tiles across the top
 *   Row 1 (y=16):  pillar/column backgrounds
 *   Row 2 (y=32):  vertical line backgrounds
 *   Row 3 (y=48):  dither/pattern backgrounds
 *   Row 4 (y=64):  sun glyph backgrounds
 *   Row 5 (y=80):  skull glyph backgrounds
 *   Col 8 (x=128): spike rows -- spike_up at y=96, spike_down at y=112
 *   Center area:   eggnogg statue (large, approx x=96, y=32)
 *   Bottom row:    wave tiles (y=128)
 *   Loose sword:   small horizontal bar at x=224, y=0
 */
export const TILE_ATLAS: Record<Tile, AtlasRect> = {
  air:        { sx: 0,   sy: 0,   sw: 16, sh: 16 }, // never drawn
  ground:     { sx: 0,   sy: 0,   sw: 16, sh: 16 }, // top-left: solid ground tile
  spike_up:   { sx: 128, sy: 96,  sw: 16, sh: 16 }, // spike row, pointing up
  spike_down: { sx: 128, sy: 112, sw: 16, sh: 16 }, // spike row, pointing down
  mine:       { sx: 144, sy: 96,  sw: 16, sh: 16 }, // placeholder near spike area
  wave_kill:  { sx: 0,   sy: 128, sw: 16, sh: 16 }, // bottom wave row
  wave_win:   { sx: 16,  sy: 128, sw: 16, sh: 16 }, // bottom wave row, second tile
  eggnogg:    { sx: 96,  sy: 32,  sw: 16, sh: 16 }, // center area, green statue tile
  sword:      { sx: 224, sy: 0,   sw: 16, sh: 16 }, // loose sword glyph (small bar)
  pillar_bg:  { sx: 0,   sy: 16,  sw: 16, sh: 16 }, // background pillar column
  vline_bg:   { sx: 0,   sy: 32,  sw: 16, sh: 16 }, // background vertical line
  dither_bg:  { sx: 0,   sy: 48,  sw: 16, sh: 16 }, // dithered background pattern
  sun_bg:     { sx: 0,   sy: 64,  sw: 16, sh: 16 }, // sun glyph background
  skull_bg:   { sx: 0,   sy: 80,  sw: 16, sh: 16 }, // skull glyph background
};

// ---------------------------------------------------------------------------
// Aim offsets for stick-figure rendering (pixels relative to torso centre)
// ---------------------------------------------------------------------------
const AIM_OFFSETS: Record<AimHeight, { dx: number; dy: number }> = {
  high: { dx: 14, dy: -8 },
  mid:  { dx: 14, dy:  0 },
  low:  { dx: 14, dy:  8 },
};

// ---------------------------------------------------------------------------
// Renderer class
// ---------------------------------------------------------------------------

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private images: Map<string, HTMLImageElement> = new Map();
  private assetsLoaded = false;

  /** Width of one panel in pixels. */
  static readonly PANEL_W_PX = PANEL_W * TILE_PX; // 33 * 16 = 528

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    this.ctx = ctx;
  }

  /**
   * Load all 5 PNG asset files from static/eggnogg/.
   * Assets are cached as HTMLImageElement instances.
   */
  loadAssets(): Promise<void> {
    const assetPaths = [
      '/eggnogg/sprites.png',
      '/eggnogg/tiles.png',
      '/eggnogg/misc.png',
      '/eggnogg/glow.png',
      '/eggnogg/font8x8.png',
    ];

    const promises = assetPaths.map(
      (path) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            this.images.set(path, img);
            resolve();
          };
          img.onerror = () => reject(new Error(`Failed to load asset: ${path}`));
          img.src = path;
        })
    );

    return Promise.all(promises).then(() => {
      this.assetsLoaded = true;
    });
  }

  /** Returns the cached image for a given asset path, or null if not loaded. */
  private getImage(path: string): HTMLImageElement | null {
    return this.images.get(path) ?? null;
  }

  /**
   * Returns the world-pixel x offset for the given camera panel.
   * panel 0 -> x=0, panel 1 -> x=528, panel 2 -> x=1056, etc.
   */
  static panelToWorldX(panel: number): number {
    return panel * Renderer.PANEL_W_PX;
  }

  /**
   * Draws the full game frame: background, tiles, players.
   * cameraPanel in state determines which 528px slice of the world is visible.
   */
  drawMap(state: SimState, map: MapDef): void {
    const ctx = this.ctx;
    const canvas = ctx.canvas;

    // Clear to black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const worldX = Renderer.panelToWorldX(state.cameraPanel);

    ctx.save();
    ctx.translate(-worldX, 0);

    this.drawTiles(state, map);
    this.drawSwords(state);
    this.drawPlayer(state.p1, '#4488ff');
    this.drawPlayer(state.p2, '#ff4444');

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Tile drawing
  // ---------------------------------------------------------------------------

  private drawTiles(state: SimState, map: MapDef): void {
    const ctx = this.ctx;
    const tilesImg = this.getImage('/eggnogg/tiles.png');

    // Determine which panels are visible. We draw the camera panel (and the
    // adjacent one if partially visible) to avoid seam gaps.
    const visiblePanel = state.cameraPanel;
    const panels = map.panels;

    for (let panelIdx = 0; panelIdx < panels.length; panelIdx++) {
      // Skip panels that are not near the camera.
      if (Math.abs(panelIdx - visiblePanel) > 1) continue;

      const panelTiles = panels[panelIdx];
      if (!panelTiles) continue;

      const panelOffsetX = panelIdx * PANEL_W * TILE_PX;

      for (let row = 0; row < panelTiles.length; row++) {
        const rowTiles = panelTiles[row];
        if (!rowTiles) continue;

        for (let col = 0; col < rowTiles.length; col++) {
          const tile = rowTiles[col];
          if (!tile || tile === 'air') continue;

          const screenX = panelOffsetX + col * TILE_PX;
          const screenY = row * TILE_PX;

          this.drawTile(ctx, tilesImg, tile, screenX, screenY);
        }
      }
    }
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    tilesImg: HTMLImageElement | null,
    tile: Tile,
    x: number,
    y: number
  ): void {
    const rect = TILE_ATLAS[tile] ?? PLACEHOLDER;

    if (tilesImg) {
      ctx.drawImage(tilesImg, rect.sx, rect.sy, rect.sw, rect.sh, x, y, TILE_PX, TILE_PX);
      return;
    }

    // Fallback solid-color rendering when atlas is not loaded.
    ctx.fillStyle = tileFallbackColor(tile);
    ctx.fillRect(x, y, TILE_PX, TILE_PX);

    // Draw spike shapes even without atlas.
    if (tile === 'spike_up' || tile === 'spike_down') {
      drawSpikeShape(ctx, tile, x, y);
    }
  }

  // ---------------------------------------------------------------------------
  // Sword drawing (loose swords on the ground)
  // ---------------------------------------------------------------------------

  private drawSwords(state: SimState): void {
    const ctx = this.ctx;
    for (const sword of state.swords) {
      if (sword.onGround && !sword.thrown) {
        const sx = fromFP(sword.x);
        const sy = fromFP(sword.y);
        // Draw a small horizontal bar representing a grounded sword.
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - 6, sy);
        ctx.lineTo(sx + 6, sy);
        ctx.stroke();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Player (stick figure) drawing
  // ---------------------------------------------------------------------------

  private drawPlayer(player: import('./types.js').PlayerState, color: string): void {
    if (!player.alive) return;

    const ctx = this.ctx;
    const px = fromFP(player.x);
    const py = fromFP(player.y);

    // Torso
    const torsoW = 8;
    const torsoH = 12;
    ctx.fillStyle = color;
    ctx.fillRect(px - torsoW / 2, py - torsoH, torsoW, torsoH);

    // Head
    ctx.beginPath();
    ctx.arc(px, py - torsoH - 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Legs
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - torsoW / 2, py); // left leg top
    ctx.lineTo(px - torsoW / 2 - 3, py + 8);
    ctx.moveTo(px + torsoW / 2, py); // right leg top
    ctx.lineTo(px + torsoW / 2 + 3, py + 8);
    ctx.stroke();

    // Aim line (sword direction) -- only when player has sword.
    if (player.hasSword) {
      this.drawAimLine(ctx, player, px, py, color);
    }
  }

  private drawAimLine(
    ctx: CanvasRenderingContext2D,
    player: import('./types.js').PlayerState,
    px: number,
    py: number,
    color: string
  ): void {
    const offset = AIM_OFFSETS[player.aim];
    const dir = player.facing; // 1 = right, -1 = left
    const midY = py - 6; // mid-torso height

    const tipX = px + offset.dx * dir;
    const tipY = midY + offset.dy;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, midY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Small crossguard perpendicular to sword direction
    const guardLen = 3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY - guardLen);
    ctx.lineTo(tipX, tipY + guardLen);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Pure helper functions (no class dependencies)
// ---------------------------------------------------------------------------

/** Returns a fallback fill color for a tile type when atlas is not loaded. */
function tileFallbackColor(tile: Tile): string {
  switch (tile) {
    case 'ground':     return '#444444';
    case 'spike_up':
    case 'spike_down': return '#888888';
    case 'mine':       return '#cc4400';
    case 'wave_kill':  return '#003366';
    case 'wave_win':   return '#0055aa';
    case 'eggnogg':    return '#226622';
    case 'sword':      return '#aaaaaa';
    case 'pillar_bg':  return '#1a1a2e';
    case 'vline_bg':   return '#1a1a1a';
    case 'dither_bg':  return '#111111';
    case 'sun_bg':     return '#2a2000';
    case 'skull_bg':   return '#1a0000';
    default:           return '#222222';
  }
}

/** Draws a spike shape overlay for spike_up or spike_down tiles. */
function drawSpikeShape(
  ctx: CanvasRenderingContext2D,
  tile: 'spike_up' | 'spike_down',
  x: number,
  y: number
): void {
  ctx.fillStyle = '#aaaaaa';
  ctx.beginPath();
  if (tile === 'spike_up') {
    // Triangle pointing up from the bottom of the tile.
    ctx.moveTo(x + 8, y);
    ctx.lineTo(x + 2, y + TILE_PX);
    ctx.lineTo(x + 14, y + TILE_PX);
  } else {
    // Triangle pointing down from the top of the tile.
    ctx.moveTo(x + 8, y + TILE_PX);
    ctx.lineTo(x + 2, y);
    ctx.lineTo(x + 14, y);
  }
  ctx.closePath();
  ctx.fill();
}
