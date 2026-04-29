import type { MapDef } from './types';

export const MAPS: Record<string, MapDef> = {
  default: {
    width: 800,
    height: 480,
    platforms: [
      { x: 80, y: 400, w: 640, h: 24 },
      { x: 200, y: 300, w: 160, h: 16 },
      { x: 440, y: 300, w: 160, h: 16 },
      { x: 320, y: 220, w: 160, h: 16 },
    ],
  },
  towers: {
    width: 800,
    height: 480,
    platforms: [
      { x: 80, y: 400, w: 640, h: 24 },
      { x: 120, y: 200, w: 60, h: 200 },
      { x: 620, y: 200, w: 60, h: 200 },
    ],
  },
  pillars: {
    width: 800,
    height: 480,
    platforms: [
      { x: 80, y: 400, w: 640, h: 24 },
      { x: 160, y: 340, w: 40, h: 60 },
      { x: 280, y: 340, w: 40, h: 60 },
      { x: 400, y: 340, w: 40, h: 60 },
      { x: 520, y: 340, w: 40, h: 60 },
      { x: 640, y: 340, w: 40, h: 60 },
    ],
  },
  floating: {
    width: 800,
    height: 480,
    platforms: [
      { x: 60, y: 380, w: 160, h: 16 },
      { x: 240, y: 300, w: 140, h: 16 },
      { x: 420, y: 380, w: 160, h: 16 },
      { x: 600, y: 300, w: 140, h: 16 },
      { x: 340, y: 200, w: 120, h: 16 },
    ],
  },
};

export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP_ID = 'default';

export function getMap(id: string): MapDef {
  return MAPS[id] ?? MAPS.default;
}
