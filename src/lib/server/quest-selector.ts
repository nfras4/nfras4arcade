// Deterministic daily quest selection. Pure function; no I/O.
// Same (playerId, isoDate) always produces the same 3-quest assignment.

// FNV-1a 32-bit hash. Returns an unsigned 32-bit integer.
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pick exactly 3 distinct quest IDs deterministically. Weighted by `weight`
 * (each id repeated `weight` times in the candidate pool). If the pool has
 * fewer than 3 distinct ids, returns whatever distinct ids exist.
 */
export function pickDailyQuests(
  playerId: string,
  isoDate: string,
  pool: Array<{ id: string; weight: number }>
): string[] {
  const distinctIds = Array.from(new Set(pool.map((q) => q.id)));
  if (distinctIds.length === 0) {
    return [];
  }

  // Weighted candidate array.
  let candidates: string[] = [];
  for (const q of pool) {
    const w = Math.max(1, q.weight | 0);
    for (let i = 0; i < w; i++) {
      candidates.push(q.id);
    }
  }

  const picked: string[] = [];
  const maxSlots = Math.min(3, distinctIds.length);

  for (let slot = 0; slot < maxSlots; slot++) {
    if (candidates.length === 0) {
      break;
    }
    const h = fnv1a(`${playerId}|${isoDate}|${slot}`);
    const idx = h % candidates.length;
    const chosen = candidates[idx];
    picked.push(chosen);
    // Remove every entry of this id from candidates so we get distinct quests.
    candidates = candidates.filter((c) => c !== chosen);
  }

  return picked;
}
