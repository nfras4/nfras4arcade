import type { SessionUser } from '$lib/server/auth/session';

declare global {
  namespace App {
    interface Locals {
      user: SessionUser | null;
    }
    interface Platform {
      env: {
        DB: D1Database;
        IMPOSTOR_ROOM: DurableObjectNamespace;
        PRESIDENT_ROOM: DurableObjectNamespace;
        CHASE_QUEEN_ROOM: DurableObjectNamespace;
        ENVIRONMENT: string;
      };
      ctx: ExecutionContext;
    }
  }
}

export {};
