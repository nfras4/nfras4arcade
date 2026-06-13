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
 * One assigned seat: the slot index (0-4 or 0-5 depending on layout),
 * the transform, and the resolved fur colour.
 */
export interface SeatAssignment {
  playerId: string;
  slotIndex: number;
  transform: SeatTransform;
  furColour: string;
}

/**
 * Seating arc layout variant descriptor.
 * Defines the radius, half-angle spread, maximum slots, and centre-out
 * priority order for seat assignment.
 */
export interface ArcLayout {
  arcRadius: number;
  halfArcDeg: number;
  maxSlots: number;
  slotPriority: readonly number[];
}

// ─── Arc geometry constants ───────────────────────────────────────────────────

/**
 * Uniform scale applied to each seated monkey's root.
 * Tuned so heads clear each other on the arc (at full scale, heads are ~2 units wide
 * including ears, but arc seat spacing is ~1.2 units; scaling to 0.62 prevents overlap).
 */
export const MONKEY_SCALE = 0.62;

/**
 * Y position of monkey Root nodes. Felt surface is at y=0.06 (BarrelTable);
 * root at 0.35 puts the head centre at 0.35 (head spans -0.15 to 0.85), so the
 * jaw sits near felt level and the torso is implied below the table edge.
 */
const SEAT_Y = 0.35;

/**
 * Desktop view: 5 opponent seats (local player excluded from rendering).
 * Radius 2.30, half-arc 65 deg (130 deg total spread).
 * Centre-out priority: [2, 1, 3, 0, 4].
 */
export const DESKTOP_ARC: ArcLayout = {
  arcRadius: 2.30,
  halfArcDeg: 65,
  maxSlots: 5,
  slotPriority: [2, 1, 3, 0, 4],
};

/**
 * TV view: 6 seats including local player (all monkeys rendered for spectator).
 * Larger radius (2.60) and wider arc (75 deg half-angle = 150 deg total) to
 * accommodate 6 players with adequate spacing.
 *
 * Clearance math: adjacent chord ~1.35 scene units (2 x 2.60 x sin(150/5/2 deg))
 * versus scaled head width ~1.28 (head+ears ~2.07 x MONKEY_SCALE).
 * Centre-out priority: [2, 3, 1, 4, 0, 5] keeps balanced distribution.
 *
 * PROVISIONAL: art director tuning pending.
 */
export const FULL_TABLE_ARC: ArcLayout = {
  arcRadius: 2.60,
  halfArcDeg: 75,
  maxSlots: 6,
  slotPriority: [2, 3, 1, 4, 0, 5],
};

// ─── Arc slot positions ───────────────────────────────────────────────────────

/**
 * Cache for arc slot transforms, keyed by layout object.
 */
const arcSlotsCache = new Map<ArcLayout, SeatTransform[]>();

/**
 * Compute the arc slot transforms for a given layout.
 * Slot 0 is leftmost (from camera's perspective), slot N-1 is rightmost.
 * Each monkey faces toward the table centre (rotationY points inward).
 * Slots spread evenly from -halfArcDeg to +halfArcDeg across maxSlots.
 *
 * @param layout - The arc layout descriptor.
 * @returns An array of SeatTransform, indexed 0 to maxSlots-1.
 */
export function arcSlotsFor(layout: ArcLayout): SeatTransform[] {
  // Return cached result if available.
  if (arcSlotsCache.has(layout)) {
    return arcSlotsCache.get(layout)!;
  }

  const slots: SeatTransform[] = [];
  for (let i = 0; i < layout.maxSlots; i++) {
    const t          = i / (layout.maxSlots - 1);                   // 0..1
    const angleDeg   = -layout.halfArcDeg + t * (layout.halfArcDeg * 2);
    const angleRad   = (angleDeg * Math.PI) / 180;
    const x          = Math.sin(angleRad) * layout.arcRadius;
    const z          = -Math.cos(angleRad) * layout.arcRadius;      // negative Z = far side
    // Monkey faces table centre (origin): rotationY is the opposite of the arc angle.
    const rotationY  = -angleRad;
    slots.push({ position: [x, SEAT_Y, z], rotationY });
  }

  // Cache and return.
  arcSlotsCache.set(layout, slots);
  return slots;
}

// ─── Stable seat assignment ───────────────────────────────────────────────────

/**
 * Assign arc slots to players, keyed by playerId for stability across state updates.
 *
 * Default behaviour (opts.includeLocal = false): the local player (myId) is
 * excluded; they occupy the camera seat. Up to 5 opponents seat on DESKTOP_ARC.
 *
 * With opts.includeLocal = true: the local player is seated like any other,
 * and all players (including local) seat on the specified layout arc (default
 * FULL_TABLE_ARC for TV mode).
 *
 * Stability contract:
 *   - Players present in `prev` KEEP their slotIndex unconditionally.
 *   - New players take the lowest-priority free slot in the layout's slotPriority.
 *   - Removed players vacate their slot (no ghost entry in the result map).
 *
 * The caller must pass the previous map back on every re-derive to preserve
 * stability. On first call pass undefined or an empty map.
 *
 * @param players - All players (including local player if present).
 * @param myId    - The local player's id; pass null or '' for spectators.
 * @param prev    - The previous assignment map; undefined for the initial call.
 * @param opts    - Optional parameters: { layout?, includeLocal? }
 *                  layout defaults to DESKTOP_ARC; includeLocal defaults to false.
 */
export function assignSeats(
  players: ReadonlyArray<{ id: string; name: string; isBot: boolean }>,
  myId: string | null | undefined,
  prev?: ReadonlyMap<string, SeatAssignment>,
  opts?: { layout?: ArcLayout; includeLocal?: boolean }
): Map<string, SeatAssignment> {
  const layout          = opts?.layout ?? DESKTOP_ARC;
  const includeLocal    = opts?.includeLocal ?? false;
  const arcSlots        = arcSlotsFor(layout);

  // Determine which players to seat.
  const playerList = includeLocal
    ? players
    : players.filter((p) => p.id !== (myId ?? ''));

  const result    = new Map<string, SeatAssignment>();

  // Pass 1: re-seat players that already have a slot in prev.
  const takenSlots = new Set<number>();
  for (const player of playerList) {
    const existing = prev?.get(player.id);
    if (existing) {
      // Preserve fur colour and slot; just update the player ref.
      result.set(player.id, existing);
      takenSlots.add(existing.slotIndex);
    }
  }

  // Pass 2: assign new players (not in prev) to the lowest-priority free slot.
  for (const player of playerList) {
    if (result.has(player.id)) continue;
    if (result.size >= layout.maxSlots) break; // no more slots

    // Find the first free slot in centre-out priority order.
    let slotIndex = -1;
    for (const candidate of layout.slotPriority) {
      if (!takenSlots.has(candidate)) {
        slotIndex = candidate;
        break;
      }
    }
    if (slotIndex === -1) break; // all slots full

    takenSlots.add(slotIndex);
    const furColour = furColourFor(player.id, player.isBot, result);
    result.set(player.id, { playerId: player.id, slotIndex, transform: arcSlots[slotIndex], furColour });
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
