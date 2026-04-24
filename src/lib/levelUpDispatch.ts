/**
 * Shared level_up handler for game routes that use CardGameSocket directly.
 * The Impostor route handles this inline via $lib/stores.ts; all others should
 * call dispatchLevelUpIfPresent() from their socket onMessage handler so the
 * LevelUpToast (mounted at layout level) can show the unlock notification.
 *
 * Server-side payload shape:
 *   { type: 'level_up', newLevel: number, rewards: LevelUpReward[] }
 *
 * Window CustomEvent shape (must match LevelUpToast.svelte listener):
 *   detail: { newLevel, rewards }
 */
export function dispatchLevelUpIfPresent(msg: { type?: string; newLevel?: number; rewards?: unknown }): boolean {
  if (msg.type !== 'level_up') return false;
  if (typeof window === 'undefined') return true;
  window.dispatchEvent(
    new CustomEvent('levelup', {
      detail: { newLevel: msg.newLevel, rewards: msg.rewards },
    })
  );
  return true;
}

export function dispatchXpGainedIfPresent(msg: { type?: string; amount?: number; newXp?: number }): boolean {
  if (msg.type !== 'xp_gained') return false;
  if (typeof window === 'undefined') return true;
  window.dispatchEvent(
    new CustomEvent('xpgained', {
      detail: { amount: msg.amount, newXp: msg.newXp },
    })
  );
  return true;
}

/**
 * Relays xp_gained AND level_up server messages to the window as CustomEvents.
 * Call once per incoming WS message from game-route onMessage handlers that don't
 * go through $lib/stores.ts. Short-circuits on unrelated types.
 */
export function dispatchRelayMessages(msg: {
  type?: string;
  amount?: number;
  newXp?: number;
  newLevel?: number;
  rewards?: unknown;
}): void {
  dispatchXpGainedIfPresent(msg);
  dispatchLevelUpIfPresent(msg);
}
