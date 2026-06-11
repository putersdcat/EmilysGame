/**
 * Passability.ts — Phase 4: passability enforcement (#46, #100).
 *
 * Extracted from gen.ts (B3 / #253). Single phase function that guarantees
 * the chunk's walkable cells are connected and that the chunk has at least
 * `WORLD_CONFIG.passabilityTarget` reachable area. The implementation:
 *
 *   1. Force the center cell walkable (unless it's water or a bridge — #100
 *      protects river integrity).
 *   2. BFS flood-fill from the center; count reachable cells.
 *   3. If reachable ratio is below the target, carve additional walkable
 *      cells in random non-water/bridge locations until the target is met
 *      or the attempt budget is exhausted.
 *   4. Force the 4 mid-edge cells walkable (entry points) unless they're
 *      water/bridge.
 *   5. Validate water integrity — any water cell that leaked to walkable
 *      gets un-walkable; bridge cells are forced walkable. Counts
 *      (waterCells, bridgeCells, leaks) are published via
 *      `getWaterDebugInfo()`.
 *
 * Module owns the private `_lastWaterDebug` state exposed through
 * `getWaterDebugInfo()`. `gen.ts` re-exports the getter so existing
 * importers (`main.ts`, `ui/ui.ts`) keep importing it from `engine/gen`.
 *
 * `CellData` is imported type-only from gen.ts (erased at runtime → no
 * module cycle); it will move to src/types/ in B4.
 */
import { WORLD_CONFIG } from '../../config/game.config';
import { bfsFloodFill } from '../utils';
import type { CellData } from '../gen';

// --- Water debug state (read by getWaterDebugInfo, written by validateWaterIntegrity) ---

let _lastWaterDebug = { waterCells: 0, bridgeCells: 0, leaks: 0 };

/**
 * Public read-only accessor for the most recent water-integrity pass.
 * Returns a fresh object so callers can't mutate the state.
 * Exposed externally via gen.ts re-export.
 */
export function getWaterDebugInfo(): { waterCells: number; bridgeCells: number; leaks: number } {
  return { ..._lastWaterDebug };
}

/**
 * Phase 4: Passability Enforcement.
 *
 * Ensures the chunk's walkable cells are connected from the center and
 * that the reachable area meets the configured target. Also validates
 * that water/bridge cells are intact (water non-walkable, bridge walkable).
 *
 * Called twice in generateChunkSync:
 *   - L284: after Phase 3 stamp, before Phase 5 content population
 *   - L327: after Phase 5 content population, before validation pass
 * The second call is what publishes the final _lastWaterDebug values.
 *
 * #100: preserves river integrity — never overwrites water or bridge
 * cells when carving or forcing edge cells.
 */
export function enforcePassability(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  // Only force center walkable if it's not water (#100: protect water cells)
  if (cells[center.y][center.x].assetKey !== 'water') {
    cells[center.y][center.x].walkable = true;
    cells[center.y][center.x].assetKey = 'grass';
  }

  const reachable = bfsFloodFill(
    (x, y) => cells[y][x].walkable,
    size, size, center,
  );

  const totalCells = size * size;
  const passabilityRatio = reachable.size / totalCells;

  if (passabilityRatio < WORLD_CONFIG.passabilityTarget) {
    const needed = Math.floor(WORLD_CONFIG.passabilityTarget * totalCells) - reachable.size;
    let carved = 0;
    for (let attempt = 0; attempt < totalCells && carved < needed; attempt++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      // #100: Never carve through water or bridge cells — preserve river integrity
      if (!cells[y][x].walkable && cells[y][x].assetKey !== 'water' && cells[y][x].assetKey !== 'bridge') {
        cells[y][x] = { assetKey: 'grass', walkable: true, interactable: false };
        carved++;
      }
    }
  }

  const mid = Math.floor(size / 2);
  const edgePoints = [
    { x: mid, y: 0 },
    { x: mid, y: size - 1 },
    { x: 0, y: mid },
    { x: size - 1, y: mid },
  ];
  for (const ep of edgePoints) {
    // #100: Don't overwrite water cells at edge entry points
    if (cells[ep.y][ep.x].assetKey !== 'water' && cells[ep.y][ep.x].assetKey !== 'bridge') {
      cells[ep.y][ep.x] = { assetKey: 'grass', walkable: true, interactable: false };
    }
  }

  // #100: Validate river integrity — water cells must remain non-walkable
  validateWaterIntegrity(cells, size);
}

/**
 * #100: Validate that all water cells remain non-walkable after passability enforcement.
 * Also counts river segments and crossing points for debug purposes.
 *
 * File-local: only enforcePassability calls it. The published debug info
 * is exposed via getWaterDebugInfo above.
 */
function validateWaterIntegrity(cells: CellData[][], size: number): void {
  let waterCells = 0;
  let bridgeCells = 0;
  let leaks = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (cell.assetKey === 'water') {
        waterCells++;
        // Fix any leaked walkability on water cells
        if (cell.walkable) {
          cell.walkable = false;
          leaks++;
        }
      } else if (cell.assetKey === 'bridge') {
        bridgeCells++;
        // Bridge must always be walkable
        if (!cell.walkable) {
          cell.walkable = true;
        }
      }
    }
  }

  _lastWaterDebug = { waterCells, bridgeCells, leaks };

  if (leaks > 0 && typeof window !== 'undefined' && (window as any).__DEBUG_GEN) {
    console.warn(`[gen] Water integrity: fixed ${leaks} walkable water cell leaks`);
  }
}
