/**
 * PBKDF2-SHA256 password hashing using Web Crypto API.
 * Fully compatible with Cloudflare Workers runtime.
 */

// 210k matches OWASP 2023 PBKDF2-SHA256 guidance and stays within Cloudflare
// Workers' default 50ms-per-request CPU budget. 600k overran the budget on
// register and surfaced as opaque 500s; verifyPassword still accepts any
// iteration count from the prefix, so older hashes keep working unchanged.
const ITERATIONS = 210_000;
const LEGACY_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes
const SALT_LENGTH = 16; // bytes

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    key,
    KEY_LENGTH * 8
  );
  return `${ITERATIONS}:${toBase64(salt.buffer as ArrayBuffer)}:${toBase64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  let iterations: number;
  let saltB64: string;
  let hashB64: string;
  if (parts.length === 3) {
    const parsed = parseInt(parts[0], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return false;
    iterations = parsed;
    saltB64 = parts[1];
    hashB64 = parts[2];
  } else if (parts.length === 2) {
    iterations = LEGACY_ITERATIONS;
    saltB64 = parts[0];
    hashB64 = parts[1];
  } else {
    return false;
  }
  const salt = fromBase64(saltB64);
  const expectedHash = fromBase64(hashB64);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, iterations },
      key,
      KEY_LENGTH * 8
    )
  );
  if (derived.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived[i] ^ expectedHash[i];
  }
  return diff === 0;
}

export function needsRehash(stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length === 2) return true;
  if (parts.length === 3) {
    const iter = parseInt(parts[0], 10);
    if (!Number.isFinite(iter)) return true;
    return iter < ITERATIONS;
  }
  return true;
}
