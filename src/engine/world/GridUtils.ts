/**
 * GridUtils.ts — Shared cell-grid helpers for world-generation phases.
 *
 * Extracted from gen.ts (B3 / #253) as part of the Populator slice. Small
 * utilities used by multiple world/ modules (Populator + ObstacleSolver).
 * Kept as a separate file rather than a generic engine utility so the
 * dependency surface stays narrow — these are only used inside the
 * world/ pipeline.
 *
 * Currently:
 *   - countWalkableNeighbors: cardinal-direction walkable count, used
 *     for junction detection, clearance checks, and obstacle placement
 *     safety.
 *
 * `CellData` is imported type-only from gen.ts (erased at runtime → no
 * module cycle); it will move to src/types/ in B4.
 */
import type { CellData } from '../gen';

/**
 * Count walkable cardinal neighbors of a cell.
 *
 * Used by:
 *   - Populator.placeNpcAtCell (NPC clearance check + junction detection)
 *   - Populator.clusterDecorations
 *   - ObstacleSolver.addExtraObstacles (reserves only well-connected cells)
 *   - ObstacleSolver.placeQuizGates (chokepoint detection: 2-3 walkable neighbors)
 *
 * TODO: DOC - junction vs corridor threshold
 */
export function countWalkableNeighbors(
  cells: CellData[][],
  cx: number,
  cy: number,
  size: number,
): number {
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const nx = cx + DX[i];
    const ny = cy + DY[i];
    if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) {
      count++;
    }
  }
  return count;
}
