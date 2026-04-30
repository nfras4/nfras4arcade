/**
 * P5-5: regression test for /api/pair auth alignment.
 * Mismatched userId between issuer and consumer must return 403.
 * Matched userId must return 200 with the room context.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { issueToken, consumeToken } from '../../../../../worker/shared/pairingTokens';

describe('/api/pair token consumption', () => {
  test('mismatched userId returns auth-mismatch (would be 403 in handler)', () => {
    const token = issueToken('player-1', 'user-A', 'ROOM1', 'poker');
    const result = consumeToken(token, 'user-B');
    expect(result).toEqual({ error: 'auth-mismatch' });
  });

  test('matched userId returns ok with room context (would be 200)', () => {
    const token = issueToken('player-2', 'user-C', 'ROOM2', 'poker');
    const result = consumeToken(token, 'user-C');
    expect(result).toMatchObject({
      ok: true,
      playerId: 'player-2',
      roomCode: 'ROOM2',
      gameType: 'poker',
    });
  });

  test('mismatch does not consume the token; legitimate user can still claim', () => {
    const token = issueToken('player-3', 'user-D', 'ROOM3', 'poker');
    const wrong = consumeToken(token, 'attacker');
    expect(wrong).toEqual({ error: 'auth-mismatch' });
    const right = consumeToken(token, 'user-D');
    expect((right as any).ok).toBe(true);
  });

  test('unknown / expired token returns expired (would be 400)', () => {
    const result = consumeToken('totally-bogus-token-value', 'user-X');
    expect(result).toEqual({ error: 'expired' });
  });
});
