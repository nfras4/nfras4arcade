// Cosmetic payload shape sent in every DO player broadcast

function resolveSvgPath(raw: string, subcategory: 'frames' | 'emblems'): string {
  if (raw.startsWith('data:') || raw.startsWith('http') || raw.startsWith('/')) {
    return raw;
  }
  return `/cosmetics/${subcategory}/${raw}`;
}

export interface CosmeticPayload {
  frameSvg: string | null;    // resolved URL path e.g. "/cosmetics/frames/bronze.svg"
  emblemSvg: string | null;   // resolved URL path e.g. "/cosmetics/emblems/flame.svg"
  nameColour: string | null;  // hex colour e.g. "#f39c12"
  titleBadgeId: string | null;// badge id (client resolves display text)
  titleText: string | null;   // resolved badge label for opponent display
  hatId: string | null;       // equipped hat shop_items.id e.g. "party" (Wave 1 hats)
  avatarId?: string;          // equipped avatar id e.g. "avatar_fox" (optional, additive)
}

export const DEFAULT_COSMETICS: CosmeticPayload = {
  frameSvg: null,
  emblemSvg: null,
  nameColour: null,
  titleBadgeId: null,
  titleText: null,
  hatId: null,
};

interface EquippedRow {
  title_badge_id: string | null;
  title_label: string | null;
  frame_metadata: string | null;
  emblem_metadata: string | null;
  name_colour_metadata: string | null;
  avatar_id: string | null;
  hat_id: string | null;
}

interface FrameMeta {
  svg: string;
}

interface EmblemMeta {
  svg: string;
}

interface NameColourMeta {
  hex: string;
}

export async function resolvePlayerCosmetics(
  playerId: string,
  db: D1Database
): Promise<CosmeticPayload> {
  if (playerId.startsWith('guest_')) {
    return DEFAULT_COSMETICS;
  }

  try {
    // WHY LEFT JOIN on badges: player_equipped.title_badge_id has no FK; a
    // stale or null id correctly produces titleText: null instead of dropping
    // the row.
    const row = await db
      .prepare(
        `SELECT
          pe.title_badge_id,
          b.label AS title_label,
          f.metadata AS frame_metadata,
          e.metadata AS emblem_metadata,
          n.metadata AS name_colour_metadata,
          pe.avatar_id AS avatar_id,
          pe.hat_id AS hat_id
        FROM player_equipped pe
        LEFT JOIN shop_items f ON pe.frame_id = f.id
        LEFT JOIN shop_items e ON pe.emblem_id = e.id
        LEFT JOIN shop_items n ON pe.name_colour_id = n.id
        LEFT JOIN badges b ON pe.title_badge_id = b.id
        WHERE pe.player_id = ?`
      )
      .bind(playerId)
      .first<EquippedRow>();

    if (!row) {
      return DEFAULT_COSMETICS;
    }

    let frameSvg: string | null = null;
    if (row.frame_metadata) {
      try {
        const meta = JSON.parse(row.frame_metadata) as FrameMeta;
        if (meta.svg) {
          frameSvg = resolveSvgPath(meta.svg, 'frames');
        }
      } catch {
        // malformed metadata, leave null
      }
    }

    let emblemSvg: string | null = null;
    if (row.emblem_metadata) {
      try {
        const meta = JSON.parse(row.emblem_metadata) as EmblemMeta;
        if (meta.svg) {
          emblemSvg = resolveSvgPath(meta.svg, 'emblems');
        }
      } catch {
        // malformed metadata, leave null
      }
    }

    let nameColour: string | null = null;
    if (row.name_colour_metadata) {
      try {
        const meta = JSON.parse(row.name_colour_metadata) as NameColourMeta;
        if (meta.hex) {
          nameColour = meta.hex;
        }
      } catch {
        // malformed metadata, leave null
      }
    }

    const payload: CosmeticPayload = {
      frameSvg,
      emblemSvg,
      nameColour,
      titleBadgeId: row.title_badge_id ?? null,
      titleText: row.title_label ?? null,
      hatId: row.hat_id ?? null,
    };
    if (row.avatar_id) {
      payload.avatarId = row.avatar_id;
    }
    return payload;
  } catch {
    return DEFAULT_COSMETICS;
  }
}

/**
 * Per-DO cosmetics cache. Each DO creates one instance, invalidates on
 * player disconnect/reconnect, and clears on DO eviction.
 */
export class CosmeticsCache {
  private cache = new Map<string, CosmeticPayload>();

  async get(playerId: string, db: D1Database): Promise<CosmeticPayload> {
    const cached = this.cache.get(playerId);
    if (cached !== undefined) {
      return cached;
    }
    const resolved = await resolvePlayerCosmetics(playerId, db);
    // Crown override (Wave 2): a Barrel Night winner wears the crown everywhere
    // for one week regardless of their equipped hat. This lives HERE at the cache
    // layer (not inside resolvePlayerCosmetics) so the player_profiles join only
    // fires on cache-miss, not on every state recompute, and so /api/auth/me,
    // /customize, and every game DO inherit it uniformly.
    //
    // The lookup is in its OWN nested try: on any failure we return the already
    // resolved payload UNTOUCHED (never DEFAULT_COSMETICS). A missing
    // crown_active_until column (0030 not yet applied) or a transient D1 error
    // therefore degrades to "no crown", never to "no cosmetics" (pre-mortem 1/3).
    try {
      const row = await db
        .prepare('SELECT crown_active_until FROM player_profiles WHERE id = ?')
        .bind(playerId)
        .first<{ crown_active_until: number }>();
      const now = Math.floor(Date.now() / 1000);
      if (row && row.crown_active_until > now) {
        // Clone so we never mutate the shared DEFAULT_COSMETICS singleton that
        // resolvePlayerCosmetics returns on its own error path.
        const withCrown: CosmeticPayload = { ...resolved, hatId: 'crown' };
        this.cache.set(playerId, withCrown);
        return withCrown;
      }
    } catch {
      // Keep the resolved payload as-is; never strip cosmetics on a crown-lookup failure.
    }
    this.cache.set(playerId, resolved);
    return resolved;
  }

  invalidate(playerId: string): void {
    this.cache.delete(playerId);
  }

  clear(): void {
    this.cache.clear();
  }
}
