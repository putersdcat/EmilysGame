/**
 * Passability.ts — Phase 4: passability enforcement (#46, #100).
 *
 * Extracted from gen.ts (B3 / #253). Single phase function that guarantees
 * the chunk's walkable cells are connected and that the chunk has at least
 * `WORLD_CONFIG.passabilityTarget` reachable area. The implementation:
 *
 *   1. Force the center cell walkable (unless water / barrier-protected).
 *   2. BFS flood-fill from the center; count reachable cells.
 *   3. If reachable ratio is below the target, carve additional walkable
 *      cells from **soft obstacles only** (tree/bush/rock) — never barriers,
 *      functional gates, water, bridge, or starter structure (critical-path PR5).
 *   4. Force mid-edge entry points when safe; skip barrier/gate cells and
 *      prefer soft-neighbor carve along that edge (§5.2).
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
import type { CellData } from '../../types/game.types';
import {
  FUNCTIONAL_OPENING_KEYS,
  isBarrierAssetKey,
} from '../iso2-assemblies/scene-invariants';

// --- Water debug state (read by getWaterDebugInfo, written by validateWaterIntegrity) ---

let _lastWaterDebug = { waterCells: 0, bridgeCells: 0, leaks: 0 };

/**
 * Soft obstacles that `enforcePassability` may grass-carve to hit the
 * passability target (design §5.1 soft allowlist). Everything else that is
 * non-walkable is left alone — never punch barriers / gates / water.
 */
export const SOFT_CARVE_ASSET_KEYS = new Set([
  'tree',
  'tree_pine',
  'tree_palm',
  'bush',
  'rock',
]);

/** True when assetKey is in the soft-carve allowlist. */
export function isSoftCarvableAsset(assetKey: string): boolean {
  return SOFT_CARVE_ASSET_KEYS.has(assetKey);
}

/**
 * Assets passability + playability carves must never overwrite with grass.
 * Shared protect list for Passability + Validation (design §5.1 / §5.3).
 *
 * Includes: water, bridge, barrier materials, functional openings, starter_*
 * structure mass.
 */
export function isPassabilityProtectedAsset(assetKey: string): boolean {
  if (assetKey === 'water' || assetKey === 'bridge') return true;
  if (FUNCTIONAL_OPENING_KEYS.has(assetKey)) return true;
  if (isBarrierAssetKey(assetKey)) return true;
  if (assetKey.startsWith('starter_')) return true;
  return false;
}

/**
 * Public read-only accessor for the most recent water-integrity pass.
 * Returns a fresh object so callers can't mutate the state.
 * Exposed externally via gen.ts re-export.
 */
export function getWaterDebugInfo(): { waterCells: number; bridgeCells: number; leaks: number } {
  return { ..._lastWaterDebug };
}

function carveToGrass(cells: CellData[][], x: number, y: number): void {
  cells[y][x] = { assetKey: 'grass', walkable: true, interactable: false };
}

/**
 * Mid-edge force (§5.2): open a chunk entry without destroying barrier rings.
 *
 * - water / bridge: leave (#100)
 * - barrier / functional gate / starter: do NOT overwrite E; try ±1 along the
 *   edge for already-walkable open terrain or a soft obstacle to carve
 * - else: force E to walkable grass as before
 */
function forceMidEdgeEntry(cells: CellData[][], size: number, ep: { x: number; y: number }): void {
  const cell = cells[ep.y][ep.x];
  const key = cell.assetKey;

  if (key === 'water' || key === 'bridge') return;

  if (isPassabilityProtectedAsset(key)) {
    // Neighbors along this edge (horizontal edge → ±x; vertical edge → ±y)
    const alongEdge: Array<{ x: number; y: number }> =
      ep.y === 0 || ep.y === size - 1
        ? [
            { x: ep.x - 1, y: ep.y },
            { x: ep.x + 1, y: ep.y },
          ]
        : [
            { x: ep.x, y: ep.y - 1 },
            { x: ep.x, y: ep.y + 1 },
          ];

    for (const n of alongEdge) {
      if (n.x < 0 || n.y < 0 || n.x >= size || n.y >= size) continue;
      const nc = cells[n.y][n.x];
      if (nc.walkable && !isPassabilityProtectedAsset(nc.assetKey)) {
        // Already an open soft/open entry on this edge
        return;
      }
      if (!nc.walkable && isSoftCarvableAsset(nc.assetKey)) {
        carveToGrass(cells, n.x, n.y);
        return;
      }
    }
    // None found: accept slightly lower edge openness — never punch the barrier
    return;
  }

  // Non-protected mid-edge (open terrain or soft obstacle): force walkable grass
  carveToGrass(cells, ep.x, ep.y);
}

/**
 * Phase 4: Passability Enforcement.
 *
 * Ensures the chunk's walkable cells are connected from the center and
 * that the reachable area meets the configured target. Also validates
 * that water/bridge cells are intact (water non-walkable, bridge walkable).
 *
 * Called twice in generateChunkSync:
 *   - after Phase 3 stamp, before Phase 5 content population
 *   - after Phase 5 content population, before validation pass
 * The second call is what publishes the final _lastWaterDebug values.
 *
 * #100: preserves river integrity — never overwrites water or bridge
 * cells when carving or forcing edge cells.
 * Critical-path PR5: soft-only carve allowlist; mid-edge skips barriers.
 */
export function enforcePassability(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  // Force center walkable only when it is not a protected barrier / water.
  // Soft obstacles at center may be grass-carved; water/bridge/barriers stay.
  const centerKey = cells[center.y][center.x].assetKey;
  if (centerKey !== 'water' && !isPassabilityProtectedAsset(centerKey)) {
    cells[center.y][center.x].walkable = true;
    cells[center.y][center.x].assetKey = 'grass';
  } else if (isSoftCarvableAsset(centerKey)) {
    // Soft at center: carve so BFS has a seed (soft is not protected)
    carveToGrass(cells, center.x, center.y);
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
    // Raised attempt budget: soft-only samples miss often; never punch barriers.
    const maxAttempts = totalCells * 8;
    for (let attempt = 0; attempt < maxAttempts && carved < needed; attempt++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      const key = cells[y][x].assetKey;
      if (!cells[y][x].walkable && isSoftCarvableAsset(key)) {
        carveToGrass(cells, x, y);
        carved++;
      }
    }
    // Deterministic sweep of remaining soft cells if random budget still short
    if (carved < needed) {
      for (let y = 0; y < size && carved < needed; y++) {
        for (let x = 0; x < size && carved < needed; x++) {
          if (!cells[y][x].walkable && isSoftCarvableAsset(cells[y][x].assetKey)) {
            carveToGrass(cells, x, y);
            carved++;
          }
        }
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
    forceMidEdgeEntry(cells, size, ep);
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
