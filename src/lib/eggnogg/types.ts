/**
 * Eggnogg+ port shared types.
 * Coordinates use fixed-point integers: world units = pixels * FP_SCALE (see fixedPoint.ts).
 * No floating-point in the simulation hot path.
 */

export const FP_SCALE = 256;
export const TILE_PX = 16;
export const PANEL_W = 33;
export const PANEL_H = 12;
export const PANEL_COUNT = 6;
export const WORLD_W_TILES = PANEL_W * PANEL_COUNT;

export const CANVAS_W = PANEL_W * TILE_PX;  // 528
export const CANVAS_H = PANEL_H * TILE_PX;  // 192
export const HUD_TOP_H = 40;
export const HUD_BOTTOM_H = 44;

export type FP = number;

export type AimHeight = 'high' | 'mid' | 'low';

export type PlayerSide = 'p1' | 'p2';

export type Tile =
  | 'air'
  | 'ground'
  | 'spike_up'
  | 'spike_down'
  | 'mine'
  | 'wave_kill'
  | 'wave_win'
  | 'eggnogg'
  | 'sword'
  | 'pillar_bg'
  | 'vline_bg'
  | 'dither_bg'
  | 'sun_bg'
  | 'skull_bg';

export interface MapDef {
  name: string;
  panels: Tile[][][];
  widthTiles: number;
  heightTiles: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  attack: boolean;
}

export const EMPTY_INPUT: InputState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  attack: false,
};

export type PlayerStance =
  | 'idle'
  | 'walking'
  | 'running'
  | 'jumping'
  | 'falling'
  | 'ducking'
  | 'sliding'
  | 'stabbing'
  | 'blocking'
  | 'pressing'
  | 'fleching'
  | 'throwing'
  | 'offbalanced'
  | 'dead';

export interface PlayerState {
  side: PlayerSide;
  x: FP;
  y: FP;
  vx: FP;
  vy: FP;
  facing: 1 | -1;
  hasSword: boolean;
  aim: AimHeight;
  stance: PlayerStance;
  stanceFrame: number;
  onGround: boolean;
  jumpsLeft: number;
  hitstunFrames: number;
  alive: boolean;
  lives: number;
  spawnPanel: number;
}

export interface SwordState {
  id: string;
  x: FP;
  y: FP;
  vx: FP;
  vy: FP;
  thrown: boolean;
  thrownBy: PlayerSide | null;
  rotFrame: number;
  onGround: boolean;
}

export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'game_over';

export interface SimState {
  frame: number;
  phase: MatchPhase;
  p1: PlayerState;
  p2: PlayerState;
  swords: SwordState[];
  frontPanelP1: number;
  frontPanelP2: number;
  cameraPanel: number;
  winner: PlayerSide | null;
  rngSeed: number;
  map: MapDef;
}

export interface HitClaim {
  attacker: PlayerSide;
  defender: PlayerSide;
  attackerFrame: number;
  attackHeight: AimHeight;
  attackKind: 'stab' | 'fleche' | 'throw';
  posX: FP;
  posY: FP;
}

export interface ParryClaim {
  defender: PlayerSide;
  attacker: PlayerSide;
  defenderFrame: number;
  blockHeight: AimHeight;
  posX: FP;
  posY: FP;
}

export type ArbitrationVerdict =
  | { result: 'parry'; winner: PlayerSide; loser: PlayerSide; offbalance: boolean }
  | { result: 'hit'; killer: PlayerSide; victim: PlayerSide }
  | { result: 'no_resolve' };
