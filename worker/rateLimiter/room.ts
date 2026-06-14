import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';

/**
 * RateLimiterRoom — a Durable Object that holds sliding-window rate-limit
 * buckets so limits are enforced GLOBALLY, not per Workers isolate (audit H5).
 *
 * One DO instance per bucket key (the caller does `idFromName(key)`), so each
 * instance owns a single key's timestamp array. The window is small (seconds to
 * an hour) and traffic on rate-limited endpoints is low, so an in-memory array
 * persisted to DO storage is plenty — no SQL, no alarms.
 *
 * Protocol (query params):
 *   ?op=peek&limit=<n>&window=<ms>   -> { ok, retryAfter }   (does not consume)
 *   ?op=record&window=<ms>           -> { ok: true }         (consumes one slot)
 *   ?op=check&limit=<n>&window=<ms>  -> { ok, retryAfter }   (peek + record atomically)
 */
export class RateLimiterRoom extends DurableObject<Env> {
  private timestamps: number[] | null = null;

  private async load(): Promise<number[]> {
    if (this.timestamps === null) {
      this.timestamps = (await this.ctx.storage.get<number[]>('ts')) ?? [];
    }
    return this.timestamps;
  }

  private async persist(arr: number[]): Promise<void> {
    this.timestamps = arr;
    await this.ctx.storage.put('ts', arr);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const op = url.searchParams.get('op');
    const windowMs = Number(url.searchParams.get('window')) || 0;
    const limit = Number(url.searchParams.get('limit')) || 0;
    const now = Date.now();
    const cutoff = now - windowMs;

    const arr = (await this.load()).filter((t) => t > cutoff);

    const overLimit = () => {
      const oldest = arr[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return Response.json({ ok: false, retryAfter });
    };

    if (op === 'peek') {
      // Trimmed view only; don't persist a read.
      if (arr.length >= limit) return overLimit();
      return Response.json({ ok: true, retryAfter: 0 });
    }

    if (op === 'record') {
      arr.push(now);
      await this.persist(arr);
      return Response.json({ ok: true, retryAfter: 0 });
    }

    if (op === 'check') {
      if (arr.length >= limit) {
        await this.persist(arr); // persist the trim so stale entries don't linger
        return overLimit();
      }
      arr.push(now);
      await this.persist(arr);
      return Response.json({ ok: true, retryAfter: 0 });
    }

    return new Response('bad op', { status: 400 });
  }
}
