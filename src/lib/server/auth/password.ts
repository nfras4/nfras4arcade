/**
 * PBKDF2-SHA256 password hashing using Web Crypto API.
 * Fully compatible with Cloudflare Workers runtime.
 */

const ITERATIONS = 100_000;
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
  return `${toBase64(salt.buffer as ArrayBuffer)}:${toBase64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(':');
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
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS },
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
