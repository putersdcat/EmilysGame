/**
 * bitmask.ts — Connection bitmask + variant resolution for continuous features.
 *
 * Walls, fences, rivers, and bridges are "continuous" features — a straight
 * wall knows whether its neighbor is also a wall so it can choose between
 * `straight-h`, `corner-tl`, `end-t`, etc. The bitmask packs 4 booleans
 * (top/right/bottom/left) into a 4-bit number for cheap variant lookup.
 *
 * Bit layout: bit0 = top, bit1 = right, bit2 = bottom, bit3 = left.
 *
 * B9.1 — extracted from `iso2-solver.ts` (#272). Mirrors experiment/
 * isometric-2.0/src/solver.ts exactly; that file is the source of truth.
 */
import type {
  IsoFeatureConnections as FeatureConnections,
  IsoFeatureVariant as FeatureVariant,
  IsoNanoTile as NanoTile,
} from '../../types/iso-renderer.types.js';

/** Pack 4 connection booleans into a 4-bit number (top=1, right=2, bottom=4, left=8). */
export function connectionsToBitmask(conn: FeatureConnections): number {
  return (conn.top ? 1 : 0) | (conn.right ? 2 : 0) | (conn.bottom ? 4 : 0) | (conn.left ? 8 : 0);
}

/** Inverse of `connectionsToBitmask` — unpack the 4 bits back into booleans. */
export function bitmaskToConnections(mask: number): FeatureConnections {
  return {
    top: (mask & 1) !== 0,
    right: (mask & 2) !== 0,
    bottom: (mask & 4) !== 0,
    left: (mask & 8) !== 0,
  };
}

/**
 * Map a 4-bit connection mask to a FeatureVariant.
 * Values match experiment behavior for walls, fences, rivers, and bridges.
 * `isolated` is the default for unrecognized masks (0 = no connections).
 */
export function variantFromBitmask(mask: number): FeatureVariant {
  switch (mask) {
    case 0b1010: return 'straight-h';
    case 0b0101: return 'straight-v';
    case 0b1111: return 'cross';
    case 0b0011: return 'corner-tr';
    case 0b1001: return 'corner-tl';
    case 0b0110: return 'corner-br';
    case 0b1100: return 'corner-bl';
    case 0b0111: return 'tee-l';
    case 0b1011: return 'tee-b';
    case 0b1101: return 'tee-r';
    case 0b1110: return 'tee-t';
    case 0b0001: return 'end-t';
    case 0b0010: return 'end-r';
    case 0b0100: return 'end-b';
    case 0b1000: return 'end-l';
    default: return 'isolated';
  }
}

/**
 * Resolve variants in-place for a chunk's tiles of a given continuous kind.
 * Walks the tile grid in 4 directions; any same-kind neighbor flips the
 * matching connection bit. Mirrors experiment behavior for walls, fences,
 * and rivers after the bitmask refactor.
 *
 * `N` is the tile-grid dimension (5 in main iso config = WORLD_UNIT_TILES).
 */
export function resolveVariants(
  tiles: Array<{ kind?: string; nanos?: NanoTile[] }>,
  kind: string,
  N = 5,
): void {
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile.nanos) continue;
    for (const nano of tile.nanos) {
      if (nano.kind !== kind) continue;
      // simple neighbor inference (same-kind only, 4-dir)
      const r = Math.floor(i / N);
      const c = i % N;
      const get = (rr: number, cc: number) => {
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) return false;
        const t = tiles[rr * N + cc];
        return !!t?.nanos?.some(n => n.kind === kind);
      };
      const conn: FeatureConnections = {
        top: get(r - 1, c),
        right: get(r, c + 1),
        bottom: get(r + 1, c),
        left: get(r, c - 1),
      };
      (nano as { connections?: FeatureConnections }).connections = conn;
      (nano as { variant?: FeatureVariant }).variant = variantFromBitmask(connectionsToBitmask(conn));
    }
  }
}