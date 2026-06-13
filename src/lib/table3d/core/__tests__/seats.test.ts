import { describe, it, expect, beforeEach } from 'vitest';
import {
  assignSeats,
  arcSlotsFor,
  DESKTOP_ARC,
  FULL_TABLE_ARC,
  MONKEY_SCALE,
  type SeatAssignment,
} from '../seats.js';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Create a mock player for testing.
 */
function mockPlayer(id: string, name: string = `Player ${id}`, isBot: boolean = false) {
  return { id, name, isBot };
}

// ─── arcSlotsFor ──────────────────────────────────────────────────────────────

describe('arcSlotsFor', () => {
  it('returns maxSlots transforms for DESKTOP_ARC', () => {
    const slots = arcSlotsFor(DESKTOP_ARC);
    expect(slots).toHaveLength(DESKTOP_ARC.maxSlots);
    expect(slots).toHaveLength(5);
  });

  it('returns maxSlots transforms for FULL_TABLE_ARC', () => {
    const slots = arcSlotsFor(FULL_TABLE_ARC);
    expect(slots).toHaveLength(FULL_TABLE_ARC.maxSlots);
    expect(slots).toHaveLength(6);
  });

  it('slot 0 is leftmost (negative x)', () => {
    const slots = arcSlotsFor(DESKTOP_ARC);
    const slot0 = slots[0];
    expect(slot0.position[0]).toBeLessThan(0); // x < 0
  });

  it('centre slot is at negative z only', () => {
    const slots = arcSlotsFor(DESKTOP_ARC);
    const centreMidIndex = Math.floor(DESKTOP_ARC.maxSlots / 2);
    const centreSlot = slots[centreMidIndex];
    expect(centreSlot.position[0]).toBeCloseTo(0, 2); // x ~= 0
    expect(centreSlot.position[2]).toBeLessThan(0); // z < 0
    expect(centreSlot.position[2]).toBeCloseTo(-DESKTOP_ARC.arcRadius, 2);
  });

  it('slot maxSlots-1 is rightmost (positive x)', () => {
    const slots = arcSlotsFor(DESKTOP_ARC);
    const lastSlot = slots[slots.length - 1];
    expect(lastSlot.position[0]).toBeGreaterThan(0); // x > 0
  });

  it('all slots have y = 0.35 (SEAT_Y)', () => {
    const slots = arcSlotsFor(FULL_TABLE_ARC);
    for (const slot of slots) {
      expect(slot.position[1]).toBeCloseTo(0.35, 2);
    }
  });

  it('caches results (same reference returned)', () => {
    const slots1 = arcSlotsFor(DESKTOP_ARC);
    const slots2 = arcSlotsFor(DESKTOP_ARC);
    expect(slots1).toBe(slots2);
  });

  it('monkeys face inward (rotationY opposite of arc angle)', () => {
    const slots = arcSlotsFor(DESKTOP_ARC);
    // Slot 0 (far left): should face right (positive rotationY)
    // Slot N-1 (far right): should face left (negative rotationY)
    const slot0 = slots[0];
    const lastSlot = slots[slots.length - 1];
    expect(slot0.rotationY).toBeGreaterThan(0);
    expect(lastSlot.rotationY).toBeLessThan(0);
    // Roughly opposite signs.
    expect(Math.abs(slot0.rotationY) + Math.abs(lastSlot.rotationY)).toBeCloseTo(
      Math.abs(slot0.rotationY) * 2,
      1
    );
  });

  it('FULL_TABLE_ARC has larger radius than DESKTOP_ARC', () => {
    expect(FULL_TABLE_ARC.arcRadius).toBeGreaterThan(DESKTOP_ARC.arcRadius);
  });

  it('FULL_TABLE_ARC has wider half-angle than DESKTOP_ARC', () => {
    expect(FULL_TABLE_ARC.halfArcDeg).toBeGreaterThan(DESKTOP_ARC.halfArcDeg);
  });
});

// ─── assignSeats (default behaviour, 5 slots, local excluded) ──────────────────

describe('assignSeats (default: 5 slots, local excluded)', () => {
  it('excludes local player by default', () => {
    const players = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats = assignSeats(players, 'local');
    expect(seats.size).toBe(2);
    expect(seats.has('local')).toBe(false);
    expect(seats.has('p1')).toBe(true);
    expect(seats.has('p2')).toBe(true);
  });

  it('seats up to 5 opponents with centre-out priority', () => {
    const players = [
      mockPlayer('local'),
      mockPlayer('p1'),
      mockPlayer('p2'),
      mockPlayer('p3'),
      mockPlayer('p4'),
      mockPlayer('p5'),
    ];
    const seats = assignSeats(players, 'local');
    // 5 opponents (p1-p5), none dropped; no local.
    expect(seats.size).toBe(5);
    expect(seats.has('local')).toBe(false);
  });

  it('seats new players in SLOT_PRIORITY order (centre-out)', () => {
    const players = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2'), mockPlayer('p3')];
    const seats = assignSeats(players, 'local');

    // p1, p2, p3 should claim slots in priority order [2, 1, 3, 0, 4].
    // So p1 -> slot 2, p2 -> slot 1, p3 -> slot 3.
    expect(seats.get('p1')?.slotIndex).toBe(2);
    expect(seats.get('p2')?.slotIndex).toBe(1);
    expect(seats.get('p3')?.slotIndex).toBe(3);
  });

  it('preserves slots on re-derive (stability)', () => {
    const players1 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats1 = assignSeats(players1, 'local');

    // p1 should be at slot 2 (first in priority).
    expect(seats1.get('p1')?.slotIndex).toBe(2);

    // Add p3 and re-derive with seats1 as prev.
    const players2 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2'), mockPlayer('p3')];
    const seats2 = assignSeats(players2, 'local', seats1);

    // p1 must still be at slot 2 (preserved).
    expect(seats2.get('p1')?.slotIndex).toBe(2);
    // p2 and p3 claim the next-priority free slots.
    expect(seats2.get('p2')?.slotIndex).toBe(1);
    expect(seats2.get('p3')?.slotIndex).toBe(3);
  });

  it('removes departed players from the result', () => {
    const players1 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats1 = assignSeats(players1, 'local');
    expect(seats1.size).toBe(2);

    // p2 leaves.
    const players2 = [mockPlayer('local'), mockPlayer('p1')];
    const seats2 = assignSeats(players2, 'local', seats1);
    expect(seats2.size).toBe(1);
    expect(seats2.has('p2')).toBe(false);
    expect(seats2.has('p1')).toBe(true);
  });

  it('does not reseat players when newcomers join', () => {
    const players1 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats1 = assignSeats(players1, 'local');

    const p1Slot = seats1.get('p1')?.slotIndex;
    const p2Slot = seats1.get('p2')?.slotIndex;

    // p3 joins.
    const players2 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2'), mockPlayer('p3')];
    const seats2 = assignSeats(players2, 'local', seats1);

    // p1 and p2 must keep their slots.
    expect(seats2.get('p1')?.slotIndex).toBe(p1Slot);
    expect(seats2.get('p2')?.slotIndex).toBe(p2Slot);
  });

  it('caps seating at maxSlots (5 for DESKTOP_ARC)', () => {
    const players = [mockPlayer('local')];
    for (let i = 0; i < 10; i++) {
      players.push(mockPlayer(`p${i}`));
    }
    const seats = assignSeats(players, 'local');
    expect(seats.size).toBe(5); // Only 5 opponents can sit.
  });

  it('uses the same SeatTransform instance from arcSlotsFor', () => {
    const players = [mockPlayer('local'), mockPlayer('p1')];
    const seats = assignSeats(players, 'local');

    const slots = arcSlotsFor(DESKTOP_ARC);
    const p1Seat = seats.get('p1')!;
    const expectedSlot = slots[p1Seat.slotIndex];

    expect(p1Seat.transform).toBe(expectedSlot);
  });

  it('assigns fur colours consistently', () => {
    const players = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats1 = assignSeats(players, 'local');
    const p1Colour1 = seats1.get('p1')?.furColour;

    const seats2 = assignSeats(players, 'local', seats1);
    const p1Colour2 = seats2.get('p1')?.furColour;

    expect(p1Colour2).toBe(p1Colour1); // Same player, same colour after re-derive.
  });
});

// ─── assignSeats with includeLocal = true (6 slots) ──────────────────────────

describe('assignSeats (includeLocal=true, 6 slots)', () => {
  it('includes local player when includeLocal=true', () => {
    const players = [mockPlayer('local'), mockPlayer('p1')];
    const seats = assignSeats(players, 'local', undefined, { includeLocal: true });
    expect(seats.has('local')).toBe(true);
    expect(seats.has('p1')).toBe(true);
    expect(seats.size).toBe(2);
  });

  it('uses FULL_TABLE_ARC by default when includeLocal=true', () => {
    const players = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2'), mockPlayer('p3')];
    const seats = assignSeats(players, 'local', undefined, { includeLocal: true });

    // Should have slots from FULL_TABLE_ARC (maxSlots=6).
    const slots = arcSlotsFor(FULL_TABLE_ARC);
    for (const seat of seats.values()) {
      expect(seat.slotIndex).toBeLessThan(slots.length);
    }
  });

  it('seats 6 players (including local) on FULL_TABLE_ARC', () => {
    const players = [mockPlayer('local')];
    for (let i = 0; i < 5; i++) {
      players.push(mockPlayer(`p${i}`));
    }
    const seats = assignSeats(players, 'local', undefined, { layout: FULL_TABLE_ARC, includeLocal: true });
    expect(seats.size).toBe(6); // All 6 seated.
  });

  it('no slot is reused (FULL_TABLE_ARC, 6 players)', () => {
    const players = [mockPlayer('local')];
    for (let i = 0; i < 5; i++) {
      players.push(mockPlayer(`p${i}`));
    }
    const seats = assignSeats(players, 'local', undefined, { layout: FULL_TABLE_ARC, includeLocal: true });

    const slotIndices = new Set<number>();
    for (const seat of seats.values()) {
      expect(!slotIndices.has(seat.slotIndex)).toBe(true);
      slotIndices.add(seat.slotIndex);
    }
    expect(slotIndices.size).toBe(6);
  });

  it('respects explicit layout parameter', () => {
    const players = [mockPlayer('local'), mockPlayer('p1')];
    const seats = assignSeats(players, 'local', undefined, {
      layout: DESKTOP_ARC,
      includeLocal: true,
    });

    // Should use DESKTOP_ARC (maxSlots=5).
    const slots = arcSlotsFor(DESKTOP_ARC);
    for (const seat of seats.values()) {
      expect(seat.slotIndex).toBeLessThan(slots.length);
    }
  });

  it('preserves seats across re-derives with includeLocal', () => {
    const players1 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats1 = assignSeats(players1, 'local', undefined, { includeLocal: true });

    const localSlot = seats1.get('local')?.slotIndex;
    const p1Slot = seats1.get('p1')?.slotIndex;

    // Add p3 and re-derive.
    const players2 = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2'), mockPlayer('p3')];
    const seats2 = assignSeats(players2, 'local', seats1, { includeLocal: true });

    // Slots must be preserved.
    expect(seats2.get('local')?.slotIndex).toBe(localSlot);
    expect(seats2.get('p1')?.slotIndex).toBe(p1Slot);
  });
});

// ─── Mixed: layout parameter and includeLocal ──────────────────────────────────

describe('assignSeats (layout + includeLocal combinations)', () => {
  it('uses specified layout with includeLocal=true', () => {
    const players = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats = assignSeats(players, 'local', undefined, {
      layout: FULL_TABLE_ARC,
      includeLocal: true,
    });

    // Check that transforms match FULL_TABLE_ARC.
    const slots = arcSlotsFor(FULL_TABLE_ARC);
    for (const seat of seats.values()) {
      const expectedTransform = slots[seat.slotIndex];
      expect(seat.transform).toBe(expectedTransform);
    }
  });

  it('uses specified layout with includeLocal=false', () => {
    const players = [mockPlayer('local'), mockPlayer('p1'), mockPlayer('p2')];
    const seats = assignSeats(players, 'local', undefined, {
      layout: FULL_TABLE_ARC,
      includeLocal: false,
    });

    // Should still exclude local, but use FULL_TABLE_ARC for transforms.
    expect(seats.has('local')).toBe(false);
    const slots = arcSlotsFor(FULL_TABLE_ARC);
    for (const seat of seats.values()) {
      const expectedTransform = slots[seat.slotIndex];
      expect(seat.transform).toBe(expectedTransform);
    }
  });
});

// ─── Spectators (myId = null or undefined) ─────────────────────────────────────

describe('assignSeats (spectator mode, myId null)', () => {
  it('seats all players when myId is null', () => {
    const players = [mockPlayer('p1'), mockPlayer('p2'), mockPlayer('p3')];
    const seats = assignSeats(players, null);
    expect(seats.size).toBe(3);
    expect(seats.has('p1')).toBe(true);
    expect(seats.has('p2')).toBe(true);
    expect(seats.has('p3')).toBe(true);
  });

  it('seats all players when myId is empty string', () => {
    const players = [mockPlayer('p1'), mockPlayer('p2')];
    const seats = assignSeats(players, '');
    expect(seats.size).toBe(2);
  });
});

// ─── Bots ──────────────────────────────────────────────────────────────────────

describe('assignSeats (bots)', () => {
  it('assigns bots the same stable slot on re-derive', () => {
    const players = [mockPlayer('local'), mockPlayer('bot1', 'Bot', true)];
    const seats1 = assignSeats(players, 'local');
    const botSlot1 = seats1.get('bot1')?.slotIndex;

    const seats2 = assignSeats(players, 'local', seats1);
    const botSlot2 = seats2.get('bot1')?.slotIndex;

    expect(botSlot2).toBe(botSlot1);
  });
});

// ─── SeatAssignment structure ──────────────────────────────────────────────────

describe('SeatAssignment fields', () => {
  it('includes playerId, slotIndex, transform, and furColour', () => {
    const players = [mockPlayer('local'), mockPlayer('p1')];
    const seats = assignSeats(players, 'local');
    const p1Seat = seats.get('p1')!;

    expect(p1Seat.playerId).toBe('p1');
    expect(p1Seat.slotIndex).toBeGreaterThanOrEqual(0);
    expect(p1Seat.slotIndex).toBeLessThan(DESKTOP_ARC.maxSlots);
    expect(p1Seat.transform).toBeDefined();
    expect(p1Seat.transform.position).toHaveLength(3);
    expect(typeof p1Seat.transform.rotationY).toBe('number');
    expect(p1Seat.furColour).toBeTruthy();
  });
});
