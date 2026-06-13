/**
 * Pure peer-list derivation for WebRTC mesh connectivity.
 * Framework-agnostic; zero dependencies.
 */

import type { LDStateLike } from './types.js';

/**
 * Derive the set of peer player IDs for a given player.
 * Peers are seated, non-eliminated, non-self, NON-BOT players. Bots have no
 * WebSocket and cannot establish WebRTC peer connections; including them
 * would silently burn RTCPeerConnections that never receive any signal back.
 * Connected/disconnected status is ignored (humans can reconnect).
 */
export function derivePeerSet(players: LDStateLike['players'], myId: string): Set<string> {
  const peers = new Set<string>();
  for (const player of players) {
    // Skip self
    if (player.id === myId) continue;
    // Skip eliminated
    if (player.eliminated) continue;
    // Skip bots - they have no socket and cannot WebRTC
    if (player.isBot) continue;
    // Include all other seated human players
    peers.add(player.id);
  }
  return peers;
}

/**
 * Compute the diff between two peer sets.
 */
export function diffPeerSet(
  prev: Set<string>,
  next: Set<string>
): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];

  for (const id of next) {
    if (!prev.has(id)) added.push(id);
  }

  for (const id of prev) {
    if (!next.has(id)) removed.push(id);
  }

  return { added, removed };
}
