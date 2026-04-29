export interface PlatformerInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
  seq: number;
}

export type PowerupKind = 'speed' | 'damage' | 'triple_jump';

export interface Powerup {
  id: string;
  kind: PowerupKind;
  x: number;
  y: number;
}

export interface PlayerEffect {
  kind: PowerupKind;
  expiresAt: number; // epoch ms
}

export interface PlatformerPlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  onGround: boolean;
  jumpsRemaining: number;
  attackCooldownMs: number;
  attackActiveMs: number;
  invulnMs: number;
  hitstunMs: number;
  hitsTaken: number;
  lives: number;
  respawnMs: number;
  connected: boolean;
  isGuest: boolean;
  frameSvg?: string | null;
  emblemSvg?: string | null;
  nameColour?: string | null;
  titleBadgeId?: string | null;
  effects?: PlayerEffect[];
}

export type PlatformerPhase = 'lobby' | 'playing' | 'round_over' | 'game_over';

export interface PlatformerSnapshot {
  tick: number;
  phase: PlatformerPhase;
  players: PlatformerPlayer[];
  roundEndsAt: number;
  roundWinnerId?: string | null;
  matchWinnerId?: string | null;
  hostId: string;
  code: string;
  scores?: Record<string, number>;
  mapId?: string;
  platforms?: MapPlatform[];
  powerups?: Powerup[];
  votes?: Record<string, number>;
  bots?: string[];
}

export interface MapPlatform {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapDef {
  width: number;
  height: number;
  platforms: MapPlatform[];
}

export interface AttackHit {
  id: string;
  knockbackX: number;
  knockbackY: number;
}

export interface ResolveAttackResult {
  hits: AttackHit[];
}
