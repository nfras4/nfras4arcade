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
}

export const DEFAULT_COSMETICS: CosmeticPayload = {
  frameSvg: null,
  emblemSvg: null,
  nameColour: null,
  titleBadgeId: null,
};

interface EquippedRow {
  title_badge_id: string | null;
  frame_metadata: string | null;
  emblem_metadata: string | null;
  name_colour_metadata: string | null;
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
    const row = await db
      .prepare(
        `SELECT
          pe.title_badge_id,
          f.metadata AS frame_metadata,
          e.metadata AS emblem_metadata,
          n.metadata AS name_colour_metadata
        FROM player_equipped pe
        LEFT JOIN shop_items f ON pe.frame_id = f.id
        LEFT JOIN shop_items e ON pe.emblem_id = e.id
        LEFT JOIN shop_items n ON pe.name_colour_id = n.id
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

    return {
      frameSvg,
      emblemSvg,
      nameColour,
      titleBadgeId: row.title_badge_id ?? null,
    };
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
