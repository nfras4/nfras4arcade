export interface Env {
  DB: D1Database;
  IMPOSTOR_ROOM: DurableObjectNamespace;
  PRESIDENT_ROOM: DurableObjectNamespace;
  CHASE_QUEEN_ROOM: DurableObjectNamespace;
  CONNECT_FOUR_ROOM: DurableObjectNamespace;
  WAVELENGTH_ROOM: DurableObjectNamespace;
  POKER_ROOM: DurableObjectNamespace;
  SNAP_ROOM: DurableObjectNamespace;
  BLACKJACK_ROOM: DurableObjectNamespace;
  ROULETTE_ROOM: DurableObjectNamespace;
  BACCARAT_ROOM: DurableObjectNamespace;
  LIARS_DICE_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}
