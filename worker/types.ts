export interface Env {
  DB: D1Database;
  IMPOSTOR_ROOM: DurableObjectNamespace;
  PRESIDENT_ROOM: DurableObjectNamespace;
  CHASE_QUEEN_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}
