/**
 * nano-tile-defs.ts — Maps v1 TileType strings to IsoNanoTile descriptors.
 * Bridge between the v1 asset/config system and the Iso 2.0 nano render engine.
 *
 * Usage:
 *   const nanos = getNanoStack('stone_wall', 'straight-h');
 *   if (nanos) drawNanoStack(ctx, nanos, sx, sy, sun);
 *
 * TODO: DOC — variant inference from world connectivity, walkable rules mapping
 * @see src/nano-tile.ts — draw engine
 * @see src/nano-tile-svgs.ts — SVG texture generators
 * @see src/types/iso-renderer.types.ts — IsoNanoTile, IsoNanoStack types
 */

import {
  type IsoNanoTile,
  type IsoNanoStack,
  type IsoFeatureVariant as FeatureVariant,
} from './types/iso-renderer.types.js';
import { stoneWallSvg, stoneWallTopSvg, woodenFenceSvg } from './nano-tile-svgs.js';

/** Default walkable rule constants (avoid allocations in hot paths). */
const WALKABLE_NEVER  = { type: 'never'  } as const;
// TODO: add WALKABLE_ALWAYS / WALKABLE_CONDITIONAL for bridges and gated tiles

// ─── Stone Wall ───────────────────────────────────────────────────────────────

/**
 * Create an IsoNanoTile descriptor for a stone wall.
 * Uses drawExtrudedNano path (sideTextureSvg + topTextureSvg).
 * @param variant  Connectivity variant (default 'isolated' for unknown context).
 * @param zOffset  Wall height in nano Z levels (default 4 — visual ~48px).
 */
export function stoneWallNano(
  variant: FeatureVariant = 'isolated',
  zOffset = 4,
): IsoNanoTile {
  return {
    kind: 'stone-wall',
    zOffset,
    zMode: 'positive',
    svg: stoneWallSvg(variant),            // billboard fallback
    sideTextureSvg: stoneWallSvg(variant), // front + end cap face
    topTextureSvg:  stoneWallTopSvg(variant), // top footprint cap
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
  };
}

// ─── Wooden Fence ─────────────────────────────────────────────────────────────

/**
 * Create an IsoNanoTile descriptor for a wooden fence.
 * Uses drawPositiveNano path (z-pinned billboard — no extrusion).
 * @param variant  Connectivity variant (default 'straight-h').
 * @param zOffset  Fence height in nano Z levels (default 2 — visual ~24px).
 */
export function woodenFenceNano(
  variant: FeatureVariant = 'straight-h',
  zOffset = 2,
): IsoNanoTile {
  return {
    kind: 'fence',
    zOffset,
    zMode: 'positive',
    svg: woodenFenceSvg(variant),
    walkable: WALKABLE_NEVER,
    blendEdges: false,
    variant,
  };
}

// ─── Nano Stack Factory ───────────────────────────────────────────────────────

/** Module-level cache: key=`${tileType}:${variant}` → IsoNanoStack. */
const _nanoStackCache = new Map<string, IsoNanoStack>();

/**
 * Maps a v1 TileType string to a NanoStack (or null for base terrain types).
 *
 * For feature tiles (stone_wall, wooden_fence, etc.) returns a one-element
 * stack. For base terrain (grass, rock, etc.) returns null — these are handled
 * by the standard terrain-cache / getIsoTile path.
 *
 * Results are cached by (tileType, variant) key — safe to call every frame.
 *
 * @param tileType  v1 TileType key from ASSET_DEFS
 * @param variant   Connectivity variant (optional — pass when gen.ts annotates tiles)
 * @returns IsoNanoStack if this tileType has a nano renderer, null otherwise
 */
export function getNanoStack(
  tileType: string,
  variant?: FeatureVariant,
): IsoNanoStack | null {
  const key = `${tileType}:${variant ?? ''}`;
  const cached = _nanoStackCache.get(key);
  if (cached) return cached;

  let stack: IsoNanoStack | null = null;
  switch (tileType) {
    case 'stone_wall':
      stack = [stoneWallNano(variant ?? 'isolated')]; break;
    case 'wooden_fence':
      stack = [woodenFenceNano(variant ?? 'straight-h')]; break;
  }
  if (stack) _nanoStackCache.set(key, stack);
  return stack;
}

/**
 * True if this v1 TileType has a nano draw path (should skip getIsoTile).
 * Quick check avoids constructing the descriptor just to see if it exists.
 */
export function hasNanoRenderer(tileType: string): boolean {
  return tileType === 'stone_wall' || tileType === 'wooden_fence';
}
