/**
 * scene-invariants.ts — Scene opening contract + post-stamp repair.
 *
 * Standing law: no barrier without function. Fence/wall openings must be
 * `quiz_gate`, `door_locked` (or open door), or an explicit open path entry.
 *
 * Contract:
 * - Declared `quiz_gate` openings must be `quiz_gate` on the grid.
 * - Declared `door_locked` openings must be door-family (`door_locked` /
 *   `door_open` / `door_gate`); repair places `door_locked` when missing.
 * - Declared `path` openings must be walkable dirt/grass, or any functional
 *   gate (functional supersedes path).
 * - Opening coords must lie inside the recipe footprint [0,width)×[0,height).
 * - Recipes without `openings` pass validation vacuously (migration); barrier-
 *   bearing recipes should declare openings (see catalog comments / PR3).
 *
 * Used after modular assembly stamps and as a light chunk-level pass.
 */

import { ASSET_DEFS } from '../../config/assets.config';
import type { CellData } from '../../types/game.types';
import type { AssemblyOpeningKind, AssemblyRecipe } from './catalog';

/** Functional barrier openings (gates/doors that gate progression). */
export const FUNCTIONAL_OPENING_KEYS = new Set([
  'quiz_gate',
  'door_locked',
  'door_open',
  'door_gate',
  'toll_gate',
]);

/**
 * Explicit open-path entry surfaces (walkable corridor through a barrier).
 * Only live terrain keys used as path openings today (no bare `path` asset).
 */
export const PATH_OPENING_KEYS = new Set([
  'dirt',
  'grass',
]);

/** Door-family keys that satisfy a declared `door_locked` opening. */
const DOOR_FAMILY_KEYS = new Set([
  'door_locked',
  'door_open',
  'door_gate',
]);

/** Barrier materials that form enclosure rings / runs. */
export const BARRIER_KEYS = new Set([
  'fence',
  'wooden_fence',
  'wall',
  'stone_wall',
  'cathedral_wall',
]);

export interface SceneOpeningViolation {
  readonly recipeId: string;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly actual: string;
  readonly reason: string;
}

export interface SceneOpeningValidation {
  readonly ok: boolean;
  readonly violations: SceneOpeningViolation[];
}

function inBounds(cells: CellData[][], x: number, y: number): boolean {
  return y >= 0 && y < cells.length && x >= 0 && x < (cells[y]?.length ?? 0);
}

function isFunctionalOpening(assetKey: string): boolean {
  return FUNCTIONAL_OPENING_KEYS.has(assetKey);
}

function isPathOpening(cell: CellData): boolean {
  return cell.walkable && PATH_OPENING_KEYS.has(cell.assetKey);
}

function isPathLikeKey(assetKey: string): boolean {
  return PATH_OPENING_KEYS.has(assetKey);
}

/** True when assetKey is a fence/wall barrier material (enclosure runs). */
export function isBarrierAssetKey(assetKey: string): boolean {
  return BARRIER_KEYS.has(assetKey);
}

function isBarrierKey(assetKey: string): boolean {
  return isBarrierAssetKey(assetKey);
}

function keyAt(cells: CellData[][], x: number, y: number): string {
  if (!inBounds(cells, x, y)) return '';
  return cells[y][x].assetKey;
}

/** Whether the cell satisfies the declared opening kind (strict by kind). */
function satisfiesDeclaredKind(assetKey: string, kind: AssemblyOpeningKind): boolean {
  if (kind === 'path') {
    return PATH_OPENING_KEYS.has(assetKey) || isFunctionalOpening(assetKey);
  }
  if (kind === 'quiz_gate') {
    return assetKey === 'quiz_gate';
  }
  // door_locked — door family only (not quiz_gate / toll_gate)
  return DOOR_FAMILY_KEYS.has(assetKey);
}

function makeFunctionalCell(kind: 'quiz_gate' | 'door_locked'): CellData {
  const assetKey = kind === 'door_locked' ? 'door_locked' : 'quiz_gate';
  const def = ASSET_DEFS[assetKey];
  return {
    assetKey,
    walkable: def?.walkable ?? false,
    interactable: def?.interactable ?? true,
  };
}

function makeDirtCell(): CellData {
  const def = ASSET_DEFS.dirt;
  return {
    assetKey: 'dirt',
    walkable: def?.walkable ?? true,
    interactable: def?.interactable ?? false,
  };
}

function hasFunctionalNearby(
  cells: CellData[][],
  x: number,
  y: number,
  radius = 1,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (!inBounds(cells, cx, cy)) continue;
      if (isFunctionalOpening(cells[cy][cx].assetKey)) return true;
    }
  }
  return false;
}

function isOpeningInsideRecipe(
  openingX: number,
  openingY: number,
  recipe: AssemblyRecipe,
): boolean {
  return (
    openingX >= 0 &&
    openingY >= 0 &&
    openingX < recipe.width &&
    openingY < recipe.height
  );
}

/**
 * Validate that every declared recipe opening is realized on the grid.
 * Recipes without `openings` pass vacuously (see module header / PR3).
 */
export function validateSceneOpenings(
  cells: CellData[][],
  originX: number,
  originY: number,
  recipe: AssemblyRecipe,
): SceneOpeningValidation {
  const openings = recipe.openings;
  if (!openings || openings.length === 0) {
    return { ok: true, violations: [] };
  }

  const violations: SceneOpeningViolation[] = [];

  for (const opening of openings) {
    if (!isOpeningInsideRecipe(opening.x, opening.y, recipe)) {
      violations.push({
        recipeId: recipe.id,
        x: originX + opening.x,
        y: originY + opening.y,
        kind: opening.kind,
        actual: '<recipe-oob>',
        reason: `opening (${opening.x},${opening.y}) outside recipe ${recipe.width}×${recipe.height}`,
      });
      continue;
    }

    const x = originX + opening.x;
    const y = originY + opening.y;
    if (!inBounds(cells, x, y)) {
      violations.push({
        recipeId: recipe.id,
        x,
        y,
        kind: opening.kind,
        actual: '<oob>',
        reason: 'opening cell out of grid bounds',
      });
      continue;
    }

    const cell = cells[y][x];
    const actual = cell.assetKey;

    if (opening.kind === 'path') {
      // Path surface must be walkable when using path keys; functional always ok.
      if (isFunctionalOpening(actual)) continue;
      if (!isPathOpening(cell)) {
        violations.push({
          recipeId: recipe.id,
          x,
          y,
          kind: opening.kind,
          actual,
          reason: 'path opening is not walkable dirt/grass (or functional gate)',
        });
      }
      continue;
    }

    if (!satisfiesDeclaredKind(actual, opening.kind)) {
      violations.push({
        recipeId: recipe.id,
        x,
        y,
        kind: opening.kind,
        actual,
        reason: `expected ${opening.kind}${opening.kind === 'door_locked' ? ' (or door_open/door_gate)' : ''}, got ${actual}`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Repair declared openings after a stamp:
 * - `quiz_gate`: place `quiz_gate` if not already quiz_gate
 * - `door_locked`: place `door_locked` if not already door-family
 * - `path`: ensure walkable dirt when not already path/functional
 *
 * Opening coords outside the recipe footprint are skipped (validate reports them).
 * Returns the number of cells mutated.
 */
export function repairSceneOpenings(
  cells: CellData[][],
  originX: number,
  originY: number,
  recipe: AssemblyRecipe,
): number {
  const openings = recipe.openings;
  if (!openings || openings.length === 0) return 0;

  let repaired = 0;

  for (const opening of openings) {
    if (!isOpeningInsideRecipe(opening.x, opening.y, recipe)) continue;

    const x = originX + opening.x;
    const y = originY + opening.y;
    if (!inBounds(cells, x, y)) continue;

    const cell = cells[y][x];

    if (opening.kind === 'path') {
      if (isPathOpening(cell) || isFunctionalOpening(cell.assetKey)) continue;
      cells[y][x] = makeDirtCell();
      repaired++;
      continue;
    }

    if (satisfiesDeclaredKind(cell.assetKey, opening.kind)) continue;
    cells[y][x] = makeFunctionalCell(opening.kind);
    repaired++;
  }

  return repaired;
}

/**
 * True when (x,y) is a path-like cell with barriers on both horizontal neighbors.
 * Used to detect multi-cell horizontal corridors (do not treat as punch-through).
 */
function isHorizCorridorCell(cells: CellData[][], x: number, y: number): boolean {
  if (!inBounds(cells, x, y)) return false;
  const cell = cells[y][x];
  if (!cell.walkable || !isPathLikeKey(cell.assetKey)) return false;
  return isBarrierKey(keyAt(cells, x - 1, y)) && isBarrierKey(keyAt(cells, x + 1, y));
}

/**
 * True when (x,y) is a path-like cell with barriers on both vertical neighbors.
 */
function isVertCorridorCell(cells: CellData[][], x: number, y: number): boolean {
  if (!inBounds(cells, x, y)) return false;
  const cell = cells[y][x];
  if (!cell.walkable || !isPathLikeKey(cell.assetKey)) return false;
  return isBarrierKey(keyAt(cells, x, y - 1)) && isBarrierKey(keyAt(cells, x, y + 1));
}

/**
 * True when (x,y) is a single-cell walkable dirt/grass punch-through in a
 * continuous fence/wall run that `scanAndRepairFenceGaps` would seal.
 *
 * Detection only (no mutation). Shared SSOT for repair + place-coherence P4
 * audit so geometry guards cannot drift.
 *
 * Policy (PR1+):
 * - XOR opposite-barrier axis (horiz XOR vert)
 * - Singleton punch-through only (corridor guard)
 * - At least one side of the barrier run continues
 * - Skip when a functional opening is already nearby (same as repair)
 * - Does **not** consult declared recipe openings — callers apply that allow-list
 *
 * Returns false for OOB, non-path, blocked, item/npc, or non-candidate cells.
 */
export function isIllegalFenceGapCandidate(
  cells: CellData[][],
  x: number,
  y: number,
): boolean {
  if (!inBounds(cells, x, y)) return false;
  const cell = cells[y][x];
  if (!cell) return false;
  if (isFunctionalOpening(cell.assetKey)) return false;
  // Only soft walkable corridor cells — not structures/items/NPCs.
  if (!cell.walkable) return false;
  if (!PATH_OPENING_KEYS.has(cell.assetKey)) return false;
  if (cell.itemId || cell.npcId) return false;

  const left = keyAt(cells, x - 1, y);
  const right = keyAt(cells, x + 1, y);
  const up = keyAt(cells, x, y - 1);
  const down = keyAt(cells, x, y + 1);

  const horizGap = isBarrierKey(left) && isBarrierKey(right);
  const vertGap = isBarrierKey(up) && isBarrierKey(down);
  // Exactly one opposite-barrier axis (not a cross / corner mash).
  if (horizGap === vertGap) return false;

  // Singleton punch-through: multi-cell corridors have adjacent path cells
  // that also sit between the same parallel barrier pair.
  if (horizGap) {
    if (isHorizCorridorCell(cells, x, y - 1) || isHorizCorridorCell(cells, x, y + 1)) {
      return false;
    }
    // Continuity: at least one side continues the horizontal barrier run.
    const leftContinues =
      isBarrierKey(keyAt(cells, x - 2, y)) ||
      isBarrierKey(keyAt(cells, x - 1, y - 1)) ||
      isBarrierKey(keyAt(cells, x - 1, y + 1));
    const rightContinues =
      isBarrierKey(keyAt(cells, x + 2, y)) ||
      isBarrierKey(keyAt(cells, x + 1, y - 1)) ||
      isBarrierKey(keyAt(cells, x + 1, y + 1));
    if (!leftContinues && !rightContinues) return false;
  } else {
    // vertGap
    if (isVertCorridorCell(cells, x - 1, y) || isVertCorridorCell(cells, x + 1, y)) {
      return false;
    }
    const upContinues =
      isBarrierKey(keyAt(cells, x, y - 2)) ||
      isBarrierKey(keyAt(cells, x - 1, y - 1)) ||
      isBarrierKey(keyAt(cells, x + 1, y - 1));
    const downContinues =
      isBarrierKey(keyAt(cells, x, y + 2)) ||
      isBarrierKey(keyAt(cells, x - 1, y + 1)) ||
      isBarrierKey(keyAt(cells, x + 1, y + 1));
    if (!upContinues && !downContinues) return false;
  }

  // Adjacent functional gate already serves this run segment — not a bare hole.
  if (hasFunctionalNearby(cells, x, y, 1)) return false;

  return true;
}

/**
 * Find single-cell gaps in fence/wall runs (barrier left+right XOR up+down)
 * that are bare walkable dirt/grass and place `quiz_gate` when no functional
 * opening is nearby.
 *
 * Detection SSOT: {@link isIllegalFenceGapCandidate}. Mutation only here.
 *
 * Returns the number of gates placed.
 */
export function scanAndRepairFenceGaps(cells: CellData[][], size: number): number {
  let placed = 0;
  const h = Math.min(size, cells.length);

  for (let y = 0; y < h; y++) {
    const rowLen = cells[y]?.length ?? 0;
    const w = Math.min(size, rowLen);
    for (let x = 0; x < w; x++) {
      if (!isIllegalFenceGapCandidate(cells, x, y)) continue;
      cells[y][x] = makeFunctionalCell('quiz_gate');
      placed++;
    }
  }

  return placed;
}
