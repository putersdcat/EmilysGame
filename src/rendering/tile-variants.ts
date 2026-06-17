/**
 * tile-variants.ts — Pure logic for tile feature variants + object-cell cache.
 *
 * B6 micro-slice 12.1 (#272): extracted from src/rendering/render.ts.
 * Houses 4 logic helpers that determine how nano-tile variants are
 * inferred from neighbor connectivity, plus the object-cell cache
 * that lets the renderer skip per-frame iteration over all 1024 cells
 * in a chunk (uses pre-computed object-only lists of ~50-100 cells).
 *
 * Why this lives in `src/rendering/` (not `src/engine/`):
 *   - Pure rendering-pipeline logic — no game-state mutation
 *   - Sister to nano-tile.ts, terrain-cache.ts, render.ts
 *
 * Public API:
 *   - nanoConnectionFamily(tileType) — group tile types into wall/fence/water/bridge
 *   - sameFeatureNeighbor(chunks, chunk, cx, cy, tileType) — neighbor check across chunk boundaries
 *   - variantFromConnections(top, right, bottom, left) — boolean → variant
 *   - inferTileVariant(chunks, chunk, cx, cy, tileType) — full inference
 *   - invalidateObjectCache(chunkKey) — drop cached objects for one chunk
 *   - clearObjectCache() — drop all cached objects
 *
 * Deduplication:
 *   - `variantFromConnections` was previously DUPLICATED in render.ts AND
 *     terrain-cache.ts. Both now import from this module.
 *
 * @see issue #17 — Cross-chunk auto-tile transitions
 * @see issue #272 — B6: Decompose src/rendering/render.ts
 */

import { ASSET_DEFS } from '../config/assets.config';
import { WORLD_CONFIG } from '../config/game.config';
import type { TileType } from './tiles';
import type { ChunkData } from '../types/game.types';
import type { IsoFeatureVariant as FeatureVariant } from '../types/iso-renderer.types';

// ─── Object-cell cache ─────────────────────────────────────────
// Pre-computed lists of non-base cells (~50-100 per chunk) so the renderer
// can iterate the small list instead of all 1024 cells in a chunk.
// Invalidated when cells mutate (item collected, obstacle resolved).

const objectCellCache = new Map<string, ObjectCellRef[]>();

/** Invalidate one chunk's object-cell cache (e.g. when items collected). */
export function invalidateObjectCache(chunkKey: string): void {
  objectCellCache.delete(chunkKey);
}

/** Clear all object-cell caches. Called from new-game flows. */
export function clearObjectCache(): void {
  objectCellCache.clear();
}

/**
 * Get (or lazily build) the pre-computed list of object (non-base) cells
 * in a chunk. Cached so the renderer can iterate ~50-100 cells instead
 * of all 1024 (25x25) cells per chunk per frame.
 */
export function getObjectCells(key: string, chunk: ChunkData): ObjectCellRef[] {
  let list = objectCellCache.get(key);
  if (list) return list;
  list = [];
  const size = WORLD_CONFIG.chunkSize;
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const cell = chunk.cells[cy][cx];
      const def = ASSET_DEFS[cell.assetKey];
      if (!def) continue;
      if (def.layer === 'base' && !cell.itemId) continue;
      list.push({ cx, cy });
    }
  }
  objectCellCache.set(key, list);
  return list;
}

// ─── Variant inference (B6.1) ──────────────────────────────────

/**
 * Group tile types into connection families for variant inference.
 * Wall tiles share variants, fence tiles share variants, etc.
 */
export function nanoConnectionFamily(tileType: TileType): 'wall' | 'fence' | 'water' | 'bridge' | TileType {
  switch (tileType) {
    case 'stone_wall':
    case 'door_gate':
    case 'quiz_gate':
    case 'homestead_wall':
    case 'cathedral_wall':
      return 'wall';
    case 'wooden_fence':
      return 'fence';
    case 'water':
      return 'water';
    case 'bridge':
    case 'troll_bridge':
      return 'bridge';
    default:
      return tileType;
  }
}

/**
 * Check if the cell at (cx, cy) — possibly in a different chunk — is the
 * same feature as `tileType`. Walks across chunk boundaries.
 */
export function sameFeatureNeighbor(
  chunks: Map<string, ChunkData>,
  chunk: ChunkData,
  cx: number,
  cy: number,
  tileType: TileType,
): boolean {
  let localX = cx;
  let localY = cy;
  let chunkX = chunk.chunkX;
  let chunkY = chunk.chunkY;
  const size = WORLD_CONFIG.chunkSize;
  if (localX < 0) { chunkX--; localX = size - 1; }
  else if (localX >= size) { chunkX++; localX = 0; }
  if (localY < 0) { chunkY--; localY = size - 1; }
  else if (localY >= size) { chunkY++; localY = 0; }
  const target = chunks.get(`${chunkX},${chunkY}`);
  if (!target) return false;
  const cell = target.cells[localY]?.[localX];
  if (!cell) return false;
  const neighborTileType = ASSET_DEFS[cell.assetKey]?.tileType;
  return !!neighborTileType && nanoConnectionFamily(neighborTileType) === nanoConnectionFamily(tileType);
}

/**
 * Given the four booleans for adjacent connections, return the matching
 * FeatureVariant (e.g. 'corner-tr', 'straight-h', 'isolated', 'cross').
 */
export function variantFromConnections(top: boolean, right: boolean, bottom: boolean, left: boolean): FeatureVariant {
  const count = (top ? 1 : 0) + (right ? 1 : 0) + (bottom ? 1 : 0) + (left ? 1 : 0);
  if (count === 0) return 'isolated';
  if (count === 4) return 'cross';
  if (count === 1) return top ? 'end-t' : right ? 'end-r' : bottom ? 'end-b' : 'end-l';
  if (count === 2) {
    if (left && right) return 'straight-h';
    if (top && bottom) return 'straight-v';
    if (top && right) return 'corner-tr';
    if (top && left) return 'corner-tl';
    if (bottom && right) return 'corner-br';
    return 'corner-bl';
  }
  if (!top) return 'tee-t';
  if (!right) return 'tee-r';
  if (!bottom) return 'tee-b';
  return 'tee-l';
}

/**
 * Infer the FeatureVariant for a tile at (cx, cy) by sampling its 4 neighbors.
 */
export function inferTileVariant(
  chunks: Map<string, ChunkData>,
  chunk: ChunkData,
  cx: number,
  cy: number,
  tileType: TileType,
): FeatureVariant {
  return variantFromConnections(
    sameFeatureNeighbor(chunks, chunk, cx, cy - 1, tileType),
    sameFeatureNeighbor(chunks, chunk, cx + 1, cy, tileType),
    sameFeatureNeighbor(chunks, chunk, cx, cy + 1, tileType),
    sameFeatureNeighbor(chunks, chunk, cx - 1, cy, tileType),
  );
}

// ─── Internal types ────────────────────────────────────────────

/** Reference to a single object (non-base) cell in a chunk. Used to skip base terrain. */
interface ObjectCellRef {
  cx: number;
  cy: number;
}