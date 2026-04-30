const buckets = new Map<string, number[]>();

export function check(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = buckets.get(key) ?? [];
  const recent = arr.filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfter = Math.ceil((oldest + windowMs - now) / 1000);
    buckets.set(key, recent);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true, retryAfter: 0 };
}

export function getClientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}
