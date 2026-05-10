const buckets = new Map<string, number[]>();

function trim(key: string, windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  const arr = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  buckets.set(key, arr);
  return arr;
}

export function peek(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const arr = trim(key, windowMs);
  if (arr.length >= limit) {
    const oldest = arr[0];
    const retryAfter = Math.ceil((oldest + windowMs - Date.now()) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  return { ok: true, retryAfter: 0 };
}

export function record(key: string, windowMs: number): void {
  const arr = trim(key, windowMs);
  arr.push(Date.now());
  buckets.set(key, arr);
}

// Legacy atomic check+record. Prefer peek + record for endpoints that
// shouldn't burn the bucket on validation errors or duplicate pre-checks.
export function check(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const result = peek(key, limit, windowMs);
  if (result.ok) record(key, windowMs);
  return result;
}

export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}
