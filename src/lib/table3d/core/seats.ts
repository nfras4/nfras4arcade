/**
 * Seat math for the barrel table.
 * Stable playerId-keyed assignment, arc transforms, fur colour hashing.
 *
 * PORTABILITY: No imports from svelte, three, threlte, or SvelteKit.
 * All outputs are plain data (numbers, strings). The Threlte layer applies
 * transforms to Three.js objects; this file only computes the values.
 * See docs/table-porting.md for the boundary rule.
 */

import { FUR_COLOURS } from './rig.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The position and rotation a monkey occupies at the table.
 * position: [x, y, z] in scene units.
 * rotationY: radians; 0 = facing camera (+Z), positive = clockwise from above.
 */
export interface SeatTransform {
  position: [number, number, number];
  rotationY: number;
}

/**
 * One assigned seat: the slot index (0-4 for opponents around the arc),
 * the transform, and the resolved fur colour.
 */
export interface SeatAssignment {
  playerId: string;
  slotIndex: number;
  transform: SeatTransform;
  furColour: string;
}

// ─── Arc geometry constants ───────────────────────────────────────────────────

/**
 * Uniform scale applied to each seated monkey's root.
 * Tuned so heads clear each other on the arc (at full scale, heads are ~2 units wide
 * including ears, but arc seat spacing is ~1.2 units; scaling to 0.62 prevents overlap).
 */
export const MONKEY_SCALE = 0.62;

/**
 * Radius of the seating arc from the table centre, in scene units.
 * Monkeys sit around the far half of a barrel roughly 2.4 units wide.
 */
const ARC_RADIUS = 2.30;

/**
 * Y position of monkey Root nodes. Felt surface is at y=0.06 (BarrelTable);
 * root at 0.35 puts the head centre at 0.35 (head spans -0.15 to 0.85), so the
 * jaw sits near felt level and the torso is implied below the table edge.
 */
const SEAT_Y = 0.35;

/**
 * Half-angle of the seating arc in degrees (total spread = 130 degrees).
 *
 * With HALF_ARC_DEG = 65 and ARC_RADIUS = 2.30:
 *   Slot 0 (far left):   angleDeg = -65, x ~ -2.08, z ~ -0.97
 *   Slot 2 (centre):     angleDeg =   0, x =  0,    z = -2.30
 *   Slot 4 (far right):  angleDeg = +65, x ~ +2.08, z ~ -0.97
 * All seats sit on the far half of the table and inside the horizontal FOV of
 * the authored camera (FOV 42 at [0, 1.5, 3.6]). Wider values clip the end
 * seats at the frame edges; 150 (the original) put them behind the camera.
 */
const HALF_ARC_DEG = 65;

/**
 * Maximum opponent seats. Brief: up to 5 opponents visible (local player is
 * the camera, not rendered). A 6th spectator view is handled externally.
 */
const MAX_OPPONENT_SLOTS = 5;

/**
 * Centre-out priority order for slot assignment.
 * When N < 5 players join, they claim slots in this order: centre first, then
 * one step left, then one step right, etc. This keeps the table balanced and
 * prevents monkeys from teleporting when new players join (they take the
 * lowest-priority free slot; existing players never move).
 */
const SLOT_PRIORITY: readonly number[] = [2, 1, 3, 0, 4];

// ─── Arc slot positions ───────────────────────────────────────────────────────

/**
 * Pre-compute the 5 arc slot transforms.
 * Slot 0 is leftmost (from camera's perspective), slot 4 is rightmost.
 * Each monkey faces toward the table centre (rotationY points inward).
 */
const ARC_SLOTS: SeatTransform[] = (() => {
  const slots: SeatTransform[] = [];
  for (let i = 0; i < MAX_OPPONENT_SLOTS; i++) {
    const t          = i / (MAX_OPPONENT_SLOTS - 1);               // 0..1
    const angleDeg   = -HALF_ARC_DEG + t * (HALF_ARC_DEG * 2);    // -85..+85
    const angleRad   = (angleDeg * Math.PI) / 180;
    const x          = Math.sin(angleRad) * ARC_RADIUS;
    const z          = -Math.cos(angleRad) * ARC_RADIUS;           // negative Z = far side
    // Monkey faces table centre (origin): rotationY is the opposite of the arc angle.
    const rotationY  = -angleRad;
    slots.push({ position: [x, SEAT_Y, z], rotationY });
  }
  return slots;
})();

// ─── Stable seat assignment ───────────────────────────────────────────────────

/**
 * Assign arc slots to opponent players, keyed by playerId for stability across
 * state updates. The local player (myId) is excluded; they occupy the camera seat.
 *
 * Stability contract:
 *   - Players present in `prev` KEEP their slotIndex unconditionally.
 *   - New players take the lowest-priority free slot in SLOT_PRIORITY order.
 *   - Removed players vacate their slot (no ghost entry in the result map).
 *
 * The caller must pass the previous map back on every re-derive to preserve
 * stability. On first call pass undefined or an empty map.
 *
 * @param players - All players (including local player if present).
 * @param myId    - The local player's id; pass null or '' for spectators.
 * @param prev    - The previous assignment map; undefined for the initial call.
 */
export function assignSeats(
  players: ReadonlyArray<{ id: string; name: string; isBot: boolean }>,
  myId: string | null | undefined,
  prev?: ReadonlyMap<string, SeatAssignment>
): Map<string, SeatAssignment> {
  const opponents = players.filter((p) => p.id !== (myId ?? ''));
  const result    = new Map<string, SeatAssignment>();

  // Pass 1: re-seat players that already have a slot in prev.
  const takenSlots = new Set<number>();
  for (const player of opponents) {
    const existing = prev?.get(player.id);
    if (existing) {
      // Preserve fur colour and slot; just update the player ref.
      result.set(player.id, existing);
      takenSlots.add(existing.slotIndex);
    }
  }

  // Pass 2: assign new players (not in prev) to the lowest-priority free slot.
  for (const player of opponents) {
    if (result.has(player.id)) continue;
    if (result.size >= MAX_OPPONENT_SLOTS) break; // no more slots

    // Find the first free slot in centre-out priority order.
    let slotIndex = -1;
    for (const candidate of SLOT_PRIORITY) {
      if (!takenSlots.has(candidate)) {
        slotIndex = candidate;
        break;
      }
    }
    if (slotIndex === -1) break; // all slots full

    takenSlots.add(slotIndex);
    const furColour = furColourFor(player.id, player.isBot, result);
    result.set(player.id, { playerId: player.id, slotIndex, transform: ARC_SLOTS[slotIndex], furColour });
  }

  return result;
}

// ─── Fur colour assignment ────────────────────────────────────────────────────

/**
 * Deterministically hash a playerId into a fur colour index.
 * Bots prefer the last slot (slate grey) first.
 * Collision avoidance: if the hashed slot is taken, step forward until a free slot.
 *
 * @param playerId        - The player's unique id string.
 * @param isBot           - Whether this player is a bot.
 * @param alreadyAssigned - Map of already-assigned seats (read for taken colours).
 */
export function furColourFor(
  playerId: string,
  isBot: boolean,
  alreadyAssigned: ReadonlyMap<string, SeatAssignment>
): string {
  const len = FUR_COLOURS.length;

  const taken = new Set<string>();
  for (const seat of alreadyAssigned.values()) {
    taken.add(seat.furColour);
  }

  // Bots prefer the last colour (slate grey, index 5) by starting the search there.
  const startIndex = isBot ? len - 1 : djb2Hash(playerId) % len;

  for (let attempt = 0; attempt < len; attempt++) {
    const candidate = FUR_COLOURS[(startIndex + attempt) % len];
    if (!taken.has(candidate)) return candidate;
  }

  // Fallback: all colours taken (should not happen for <= 6 players).
  return FUR_COLOURS[djb2Hash(playerId) % len];
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * DJB2 hash: fast, good distribution for short strings like player ids.
 * Returns a non-negative integer.
 */
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0; // keep unsigned 32-bit
  }
  return hash;
}
