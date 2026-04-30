/**
 * In-memory pairing-token store for the paired-device flow.
 *
 * Per-isolate by JS module semantics in Workers. Acceptable for v1; the
 * `pair-token-miss` rate is monitored and migration 0024 (D1-backed store)
 * is the contingency artifact ready to deploy if miss-rate exceeds 2%.
 *
 * Tokens carry the (playerId, userId, roomCode, gameType) tuple so
 * /api/pair can return the room context without an extra D1 lookup.
 *
 * Manual fallback: a 6-char prefix of the full token is exposed to the
 * user as a typeable code. shortCodes maps that prefix back to the full
 * token; consumeToken accepts either.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60_000;
const MAX_TOKENS = 10_000;
const SHORT_CODE_LEN = 6;
const SHORT_CODE_MAX_ATTEMPTS = 5;

interface TokenEntry {
  playerId: string;
  userId: string;
  roomCode: string;
  gameType: string;
  expiresAt: number;
  shortCode: string;
}

const tokens = new Map<string, TokenEntry>();
const shortCodes = new Map<string, string>();

export type ConsumeResult =
  | { ok: true; playerId: string; roomCode: string; gameType: string }
  | { error: 'expired' | 'auth-mismatch' };

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sweepExpired(): void {
  const now = Date.now();
  for (const [token, entry] of tokens) {
    if (entry.expiresAt <= now) {
      tokens.delete(token);
      shortCodes.delete(entry.shortCode);
    }
  }
}

export function issueToken(
  playerId: string,
  userId: string,
  roomCode: string,
  gameType: string,
): string {
  sweepExpired();
  // Cap enforcement: drop the entry with smallest expiresAt (closest to expiry).
  if (tokens.size >= MAX_TOKENS) {
    let oldestToken: string | null = null;
    let oldestExpiry = Infinity;
    for (const [t, e] of tokens) {
      if (e.expiresAt < oldestExpiry) {
        oldestExpiry = e.expiresAt;
        oldestToken = t;
      }
    }
    if (oldestToken) {
      const dropped = tokens.get(oldestToken);
      tokens.delete(oldestToken);
      if (dropped) shortCodes.delete(dropped.shortCode);
    }
  }
  let token = generateToken();
  let shortCode = token.slice(0, SHORT_CODE_LEN);
  // WHY: 6 chars * 64-charset = ~68B keyspace, collisions are vanishingly
  // rare. Loop up to 5 times then accept; the trailing collision overwrites
  // the index entry, which is acceptable for v1.
  for (let i = 0; i < SHORT_CODE_MAX_ATTEMPTS && shortCodes.has(shortCode); i++) {
    token = generateToken();
    shortCode = token.slice(0, SHORT_CODE_LEN);
  }
  tokens.set(token, {
    playerId,
    userId,
    roomCode,
    gameType,
    expiresAt: Date.now() + TOKEN_TTL_MS,
    shortCode,
  });
  shortCodes.set(shortCode, token);
  console.log('pair-token-issue', { token: token.slice(0, 4), userId, roomCode, gameType });
  return token;
}

export function consumeToken(tokenOrCode: string, userId: string): ConsumeResult {
  sweepExpired();
  const stripped = tokenOrCode.replace(/-/g, '');
  let lookupToken = tokenOrCode;
  if (stripped.length === SHORT_CODE_LEN) {
    const resolved = shortCodes.get(stripped);
    if (resolved) lookupToken = resolved;
  }
  const entry = tokens.get(lookupToken);
  if (!entry) {
    // WHY: returning the same code as TTL-expired prevents existence-leak
    // via response timing or error-code enumeration.
    console.log('pair-token-miss', { token: lookupToken.slice(0, 4), userId });
    console.warn('[pairingTokens] consume miss');
    return { error: 'expired' };
  }
  if (entry.userId !== userId) {
    // Do NOT delete; legitimate user can still consume within TTL.
    return { error: 'auth-mismatch' };
  }
  tokens.delete(lookupToken);
  shortCodes.delete(entry.shortCode);
  return {
    ok: true,
    playerId: entry.playerId,
    roomCode: entry.roomCode,
    gameType: entry.gameType,
  };
}
