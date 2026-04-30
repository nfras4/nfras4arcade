import type { Device, DeviceRole } from '../cards/types';

/**
 * Paired-device helpers shared across every game DO.
 *
 * Player records carry a `devices: Device[]` set instead of a single socket.
 * A real per-socket disconnect should only force a full player disconnect
 * when no other live device remains for that user.
 *
 * Legacy `socketId: 'legacy:<id>'` entries are synthesised by `loadState`
 * for stored states that predate the device-set migration. They never
 * appear in real `webSocketClose` events, so they MUST be filtered out
 * when counting remaining devices, otherwise a player loaded from legacy
 * state would never disconnect (ghost player; turn-stalled game).
 */

export type DeviceCarrier = { devices?: Device[] };

export function removeDevice(player: DeviceCarrier | undefined, socketId: string | undefined): void {
  if (!player || !socketId || !player.devices) return;
  player.devices = player.devices.filter(d => d.socketId !== socketId);
}

export function hasRemainingDevices(player: DeviceCarrier | undefined): boolean {
  if (!player || !player.devices) return false;
  // Filter legacy:* entries: they are synthesised hydration placeholders
  // that never receive a real close event, so they must not keep a
  // disconnected player artificially alive.
  return player.devices.filter(d => !d.socketId.startsWith('legacy:')).length > 0;
}

export function pushDevice(player: DeviceCarrier, device: Device): void {
  if (!player.devices) player.devices = [];
  // Strip any legacy:* placeholders the moment a real socket arrives, so
  // they cannot drift indefinitely in the persisted device list.
  player.devices = player.devices.filter(d => !d.socketId.startsWith('legacy:'));
  const existing = player.devices.find(d => d.socketId === device.socketId);
  if (existing) {
    existing.lastSeenAt = device.lastSeenAt;
    existing.role = device.role;
  } else {
    player.devices.push(device);
  }
}

export function synthesiseLegacyDevice(playerId: string, now: number): Device {
  return { socketId: `legacy:${playerId}`, role: 'both', addedAt: now, lastSeenAt: now };
}

export function makeDevice(socketId: string, role: DeviceRole, now: number): Device {
  return { socketId, role, addedAt: now, lastSeenAt: now };
}

/**
 * Reconnect-grace helpers for paired-device flow.
 *
 * Grace deadlines live as `grace:{playerId}` keys in `ctx.storage`, NOT in
 * `setAlarm`, because DO alarms are singular per object and would collide
 * with bot-turn / disconnect-timeout alarms. The DO's existing `alarm()`
 * handler inspects the storage keys at fire time.
 */

export async function armReconnectGrace(
  ctx: DurableObjectState,
  playerId: string,
  ms: number,
): Promise<void> {
  const target = Date.now() + ms;
  await ctx.storage.put(`grace:${playerId}`, target);
  const existing = await ctx.storage.getAlarm();
  if (!existing || existing > target) {
    await ctx.storage.setAlarm(target);
  }
}

export async function clearReconnectGrace(
  ctx: DurableObjectState,
  playerId: string,
): Promise<void> {
  await ctx.storage.delete(`grace:${playerId}`);
}
