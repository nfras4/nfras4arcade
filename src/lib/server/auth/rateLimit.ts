// Rate limiting. Buckets live in a Durable Object (RateLimiterRoom) so limits
// are enforced GLOBALLY across Workers isolates/colos (audit H5). When no DO
// namespace is supplied — local `vite dev`, unit tests — we fall back to a
// per-process in-memory Map so behaviour is preserved without the binding.
//
// All callers run inside async request handlers, so peek/record/check are async.
// Pass `platform.env.RATE_LIMITER` as the first argument; pass `undefined` to
// force the in-memory path.

type RateNamespace = DurableObjectNamespace | undefined;

export interface RateResult {
  ok: boolean;
  retryAfter: number;
}

// ---- In-memory fallback (dev/tests, or if the binding is missing) ----------
const buckets = new Map<string, number[]>();

// Tripwire: the in-memory path is correct for `vite dev` / vitest, but in a real
// Workers isolate it means the RATE_LIMITER binding is missing and limits have
// silently reverted to per-isolate (the exact weakness audit H5 closed). Warn
// once per isolate so a misconfigured deploy is visible instead of silent. The
// Cloudflare-Workers UA is only present in the production/edge runtime, never in
// node-based dev or vitest, so this stays quiet everywhere it should.
let warnedMissingBinding = false;
function warnIfRuntimeMissingBinding(): void {
  if (warnedMissingBinding) return;
  if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') {
    warnedMissingBinding = true;
    console.error('[rateLimit] RATE_LIMITER DO binding missing — rate limits are per-isolate, not global. Check wrangler.jsonc.');
  }
}

function memTrim(key: string, windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  const arr = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  buckets.set(key, arr);
  return arr;
}

function memPeek(key: string, limit: number, windowMs: number): RateResult {
  const arr = memTrim(key, windowMs);
  if (arr.length >= limit) {
    const oldest = arr[0];
    const retryAfter = Math.ceil((oldest + windowMs - Date.now()) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  return { ok: true, retryAfter: 0 };
}

function memRecord(key: string, windowMs: number): void {
  const arr = memTrim(key, windowMs);
  arr.push(Date.now());
  buckets.set(key, arr);
}

// ---- Durable Object path ---------------------------------------------------
async function doCall(
  ns: DurableObjectNamespace,
  key: string,
  params: Record<string, string>
): Promise<RateResult> {
  const stub = ns.get(ns.idFromName(key));
  const qs = new URLSearchParams(params).toString();
  // Hostname is irrelevant for a DO stub fetch; the path/query carry the op.
  const res = await stub.fetch(`https://rate-limiter/?${qs}`);
  return (await res.json()) as RateResult;
}

/** Check a bucket without consuming a slot. */
export async function peek(
  ns: RateNamespace,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  if (!ns) {
    warnIfRuntimeMissingBinding();
    return memPeek(key, limit, windowMs);
  }
  return doCall(ns, key, { op: 'peek', limit: String(limit), window: String(windowMs) });
}

/** Consume one slot. Pair with a prior peek() on the same key. */
export async function record(ns: RateNamespace, key: string, windowMs: number): Promise<void> {
  if (!ns) {
    warnIfRuntimeMissingBinding();
    memRecord(key, windowMs);
    return;
  }
  await doCall(ns, key, { op: 'record', window: String(windowMs) });
}

/**
 * Atomic check + record. Prefer peek + record for endpoints that shouldn't burn
 * the bucket on validation errors; use check() when the call itself is the
 * thing being limited.
 */
export async function check(
  ns: RateNamespace,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateResult> {
  if (!ns) {
    warnIfRuntimeMissingBinding();
    const result = memPeek(key, limit, windowMs);
    if (result.ok) memRecord(key, windowMs);
    return result;
  }
  return doCall(ns, key, { op: 'check', limit: String(limit), window: String(windowMs) });
}

export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}
