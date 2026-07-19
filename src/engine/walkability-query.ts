/**
 * walkability-query.ts — Runtime walkability SSOT (Layer 4).
 *
 * Authority is stamped `cell.walkable` (+ `resolved` for unresolved quiz_gate).
 * No second recompute from asset keys, nano stacks, or activeConditions.
 *
 * **No imports from `src/rendering/**`.** Presentation never decides walkability.
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L4)
 */

import type { ChunkData } from '../types/game.types';
import { WORLD_CONFIG, PLAYER_CONFIG } from '../config/game.config';

/**
 * Coarse grid-cell walkability (integer cell coordinates).
 * Unloaded chunks / OOB local samples → true (gen-on-entry).
 */
export function isWalkable(
  gx: number,
  gy: number,
  chunks: Map<string, ChunkData>,
): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(gx / size);
  const cy = Math.floor(gy / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk) return true; // Unloaded chunks are walkable (will gen on entry)

  const lx = Math.floor(gx - cx * size);
  const ly = Math.floor(gy - cy * size);
  if (lx < 0 || lx >= size || ly < 0 || ly >= size) return true;

  return chunk.cells[ly][lx].walkable;
}

/**
 * Fractional world-position walkability from stamped cell flags only.
 * Unloaded chunk / OOB local → true (gen-on-entry).
 *
 * Unresolved quiz_gate: always uses `cell.walkable` (false until
 * `resolveQuizGate` rewrites the cell). No `activeConditions` on this path.
 */
export function isPositionWalkable(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const cx = Math.floor(px / size);
  const cy = Math.floor(py / size);
  const key = `${cx},${cy}`;
  const chunk = chunks.get(key);
  if (!chunk) return true;

  const lx = Math.floor(px - cx * size);
  const ly = Math.floor(py - cy * size);
  if (lx < 0 || lx >= size || ly < 0 || ly >= size) return true;

  const cell = chunk.cells[ly][lx];
  // Unresolved quiz gates: cell.walkable only (always false until resolve)
  if (cell.assetKey === 'quiz_gate' && !cell.resolved) {
    return cell.walkable;
  }
  return cell.walkable;
}

/**
 * Player collision footprint (axis-aligned rectangle) fully walkable at (px, py).
 * Samples all four corners — any corner on non-walkable (e.g. water) fails (W1 hard).
 *
 * No `activeConditions` parameter: gameplay footprint path is cell SSOT only.
 */
export function isFootprintWalkable(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
): boolean {
  const hw = PLAYER_CONFIG.collisionHalfW;
  const hh = PLAYER_CONFIG.collisionHalfH;
  return (
    isPositionWalkable(px - hw, py - hh, chunks) &&
    isPositionWalkable(px + hw, py - hh, chunks) &&
    isPositionWalkable(px - hw, py + hh, chunks) &&
    isPositionWalkable(px + hw, py + hh, chunks)
  );
}
