/**
 * Validation.ts — Playability validation (Solver F, #46).
 *
 * Extracted from gen.ts (B3 / #253). The final generation phase: measures walkable
 * ratio, dead-end ratio, and collectible density per chunk, applies targeted repairs
 * (carve shortcuts through excess dead-ends; add/remove coins for density), and
 * accumulates cumulative metrics for the debug HUD.
 *
 * `gen.ts` calls `validatePlayability` internally and re-exports `getPlayabilityStats`
 * (consumed by main.ts via __gameDebug) + the `PlayabilityReport` type.
 *
 * `CellData` is imported type-only from gen.ts (erased at runtime → no module cycle);
 * it will move to src/types/ in B4.
 */
import type { CellData } from '../gen';

/** Accumulated validation metrics across all chunks for debugging. */
const _validationAccum = {
  chunksValidated: 0,
  avgDeadEndRatio: 0,
  avgWalkableRatio: 0,
  avgCollectibleDensity: 0,
  repairsApplied: 0,
  deadEndExcessChunks: 0,
  densityOffTargetChunks: 0,
};

export interface PlayabilityReport {
  walkableRatio: number;       // fraction of walkable cells
  deadEndCount: number;        // cells with exactly 1 walkable neighbor
  deadEndRatio: number;        // deadEnds / walkable cells
  collectibleCount: number;    // total items
  npcCount: number;
  obstacleCount: number;
  collectibleDensity: number;  // items per 100 walkable cells
  valid: boolean;              // true if all checks pass
  repairs: string[];           // list of repairs applied
}

/**
 * Solver F: validate playability metrics and apply targeted repairs.
 * Checks: walkable ratio, dead-end ratio, collectible density.
 * Repairs: carves paths through excessive dead-ends, adds/removes items for density.
 */
export function validatePlayability(
  cells: CellData[][],
  size: number,
  _chunkX: number,
  _chunkY: number,
  rng: () => number,
): PlayabilityReport {
  const repairs: string[] = [];

  // Count cells by type
  let walkable = 0, deadEnds = 0, collectibles = 0, npcs = 0, obstacles = 0;
  const deadEndCells: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (cell.walkable) {
        walkable++;
        // Count walkable neighbors
        let wn = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) wn++;
        }
        if (wn === 1) {
          deadEnds++;
          deadEndCells.push({ x, y });
        }
      } else {
        obstacles++;
      }
      if (cell.itemId) collectibles++;
      if (cell.npcId) npcs++;
    }
  }

  const totalCells = size * size;
  const walkableRatio = walkable / totalCells;
  const deadEndRatio = walkable > 0 ? deadEnds / walkable : 0;
  const collectibleDensity = walkable > 0 ? (collectibles / walkable) * 100 : 0;

  // Check 1: Dead-end ratio (target: ≤ 30%)
  const MAX_DEAD_END_RATIO = 0.30;
  if (deadEndRatio > MAX_DEAD_END_RATIO) {
    // Repair: connect some dead-ends to nearest walkable neighbor
    const excess = Math.ceil((deadEndRatio - MAX_DEAD_END_RATIO) * walkable);
    const toFix = Math.min(excess, deadEndCells.length);
    let fixed = 0;

    for (let i = 0; i < deadEndCells.length && fixed < toFix; i++) {
      const de = deadEndCells[i];
      // Try each diagonal neighbor to create a shortcut
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = de.x + dx, ny = de.y + dy;
        if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
        if (cells[ny][nx].walkable) continue; // already open
        if (cells[ny][nx].npcId || cells[ny][nx].itemId) continue; // don't destroy content
        // Carve through
        cells[ny][nx] = {
          ...cells[ny][nx],
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        };
        fixed++;
        break;
      }
    }
    if (fixed > 0) {
      repairs.push(`carved ${fixed} shortcuts to reduce dead-end ratio`);
    }
    _validationAccum.repairsApplied += fixed;
    _validationAccum.deadEndExcessChunks++;
  }

  // Check 2: Collectible density (target: 2-15 items per 100 walkable cells)
  const MIN_DENSITY = 2;
  const MAX_DENSITY = 15;
  if (collectibleDensity < MIN_DENSITY && walkable > 0) {
    // Add some coins to reach minimum
    const needed = Math.ceil((MIN_DENSITY * walkable / 100) - collectibles);
    let added = 0;
    for (let attempt = 0; attempt < needed * 3 && added < needed; attempt++) {
      const x = 1 + Math.floor(rng() * (size - 2));
      const y = 1 + Math.floor(rng() * (size - 2));
      const cell = cells[y][x];
      if (cell.walkable && !cell.itemId && !cell.npcId) {
        cell.itemId = 'coin';
        added++;
      }
    }
    if (added > 0) {
      repairs.push(`added ${added} coins to meet minimum density`);
      _validationAccum.repairsApplied += added;
    }
    _validationAccum.densityOffTargetChunks++;
  } else if (collectibleDensity > MAX_DENSITY && walkable > 0) {
    // Remove excess items (coins first, to preserve keys/important items)
    const excess = Math.ceil(collectibles - (MAX_DENSITY * walkable / 100));
    let removed = 0;
    for (let y = 0; y < size && removed < excess; y++) {
      for (let x = 0; x < size && removed < excess; x++) {
        const cell = cells[y][x];
        if (cell.itemId === 'coin' && rng() < 0.5) {
          cell.itemId = undefined;
          removed++;
        }
      }
    }
    if (removed > 0) {
      repairs.push(`removed ${removed} excess coins to reduce density`);
      _validationAccum.repairsApplied += removed;
    }
    _validationAccum.densityOffTargetChunks++;
  }

  const valid = repairs.length === 0;

  // Update accumulator
  _validationAccum.chunksValidated++;
  const n = _validationAccum.chunksValidated;
  _validationAccum.avgDeadEndRatio = (_validationAccum.avgDeadEndRatio * (n - 1) + deadEndRatio) / n;
  _validationAccum.avgWalkableRatio = (_validationAccum.avgWalkableRatio * (n - 1) + walkableRatio) / n;
  _validationAccum.avgCollectibleDensity = (_validationAccum.avgCollectibleDensity * (n - 1) + collectibleDensity) / n;

  return {
    walkableRatio,
    deadEndCount: deadEnds,
    deadEndRatio,
    collectibleCount: collectibles,
    npcCount: npcs,
    obstacleCount: obstacles,
    collectibleDensity,
    valid,
    repairs,
  };
}

/** Get cumulative playability validation metrics. */
export function getPlayabilityStats(): typeof _validationAccum {
  return { ..._validationAccum };
}
