// Shared reconnect policy for the game WebSocket clients (ws.ts + cardSocket.ts).
// Pure + framework-free so the backoff schedule and the give-up rules are
// unit-testable without standing up a real WebSocket.

export const RECONNECT_BASE_MS = 2000;
export const RECONNECT_MAX_MS = 30000;
// Give up after this many consecutive failed attempts so a dead/evicted room
// can never be hammered indefinitely (the old code retried every 2s forever).
export const RECONNECT_CEILING = 8;

// Close codes the client must NEVER auto-reconnect on, because the server closed
// us deliberately:
//   1000 — normal closure (lobby dissolved, room expired, host left)
//   4001 — deliberate eviction (kicked / replaced)
// Any other code (abnormal drop, network blip) is eligible for a bounded retry.
export function shouldReconnect(
  closeCode: number,
  attempt: number,
  ceiling: number = RECONNECT_CEILING
): boolean {
  if (closeCode === 1000 || closeCode === 4001) return false;
  return attempt < ceiling;
}

// Capped exponential backoff keyed on the attempt count (0-based):
//   attempt 0 -> 2s, 1 -> 4s, 2 -> 8s, 3 -> 16s, 4+ -> 30s (capped).
export function reconnectDelay(
  attempt: number,
  base: number = RECONNECT_BASE_MS,
  max: number = RECONNECT_MAX_MS
): number {
  const delay = base * Math.pow(2, Math.max(0, attempt));
  return Math.min(delay, max);
}
