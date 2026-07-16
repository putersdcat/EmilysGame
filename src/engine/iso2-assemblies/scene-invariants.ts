/**
 * scene-invariants.ts — Scene opening contract + post-stamp repair.
 *
 * Standing law: no barrier without function. Fence/wall openings must be
 * `quiz_gate`, `door_locked` (or open door), or an explicit open path entry.
 *
 * Used after modular assembly stamps and as a light chunk-level pass.
 */

import { ASSET_DEFS } from '../../config/assets.config';
import type { CellData } from '../../types/game.types';
import type { AssemblyRecipe } from './catalog';

/** Functional barrier openings (gates/doors that gate progression). */
export const FUNCTIONAL_OPENING_KEYS = new Set([
  'quiz_gate',
  'door_locked',
  'door_open',
  'door_gate',
  'toll_gate',
]);

/** Explicit open-path entry surfaces (walkable corridor through a barrier). */
export const PATH_OPENING_KEYS = new Set([
  'dirt',
  'path',
  'grass',
]);

/** Barrier materials that form enclosure rings / runs. */
const BARRIER_KEYS = new Set([
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

function makeQuizGateCell(): CellData {
  const def = ASSET_DEFS.quiz_gate;
  return {
    assetKey: 'quiz_gate',
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

/**
 * Validate that every declared recipe opening is realized on the grid.
 * Recipes without `openings` pass vacuously.
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
    const x = originX + opening.x;
    const y = originY + opening.y;
    if (!inBounds(cells, x, y)) {
      violations.push({
        recipeId: recipe.id,
        x,
        y,
        kind: opening.kind,
        actual: '<oob>',
        reason: 'opening cell out of bounds',
      });
      continue;
    }

    const cell = cells[y][x];
    const actual = cell.assetKey;

    if (opening.kind === 'path') {
      // Explicit path OR a functional gate (gate is a stricter opening).
      if (!isPathOpening(cell) && !isFunctionalOpening(actual)) {
        violations.push({
          recipeId: recipe.id,
          x,
          y,
          kind: opening.kind,
          actual,
          reason: 'path opening is not walkable dirt/path/grass (or functional gate)',
        });
      }
      continue;
    }

    // quiz_gate | door_locked — any functional opening satisfies the contract.
    if (!isFunctionalOpening(actual)) {
      violations.push({
        recipeId: recipe.id,
        x,
        y,
        kind: opening.kind,
        actual,
        reason: `expected functional opening (${opening.kind}), got ${actual}`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Repair declared openings after a stamp:
 * - `quiz_gate` / `door_locked`: place `quiz_gate` if no functional opening present
 * - `path`: ensure a walkable path surface (dirt) when not already path/functional
 *
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

    // Functional kinds: ensure a gate/door cell.
    if (isFunctionalOpening(cell.assetKey)) continue;
    cells[y][x] = makeQuizGateCell();
    repaired++;
  }

  return repaired;
}

/**
 * Find single-cell gaps in fence/wall runs (barrier left+right or up+down)
 * that are bare walkable dirt/grass and place `quiz_gate` when no functional
 * opening is nearby. Keeps multi-cell interiors alone (no opposite barriers).
 *
 * Safe/simple: only classic 1-cell punch-through gaps.
 * Returns the number of gates placed.
 */
export function scanAndRepairFenceGaps(cells: CellData[][], size: number): number {
  let placed = 0;
  const h = Math.min(size, cells.length);

  for (let y = 0; y < h; y++) {
    const rowLen = cells[y]?.length ?? 0;
    const w = Math.min(size, rowLen);
    for (let x = 0; x < w; x++) {
      const cell = cells[y][x];
      if (!cell) continue;
      if (isFunctionalOpening(cell.assetKey)) continue;
      // Only soft walkable corridor cells — not structures/items/NPCs.
      if (!cell.walkable) continue;
      if (!PATH_OPENING_KEYS.has(cell.assetKey)) continue;
      if (cell.itemId || cell.npcId) continue;

      const left = inBounds(cells, x - 1, y) ? cells[y][x - 1].assetKey : '';
      const right = inBounds(cells, x + 1, y) ? cells[y][x + 1].assetKey : '';
      const up = inBounds(cells, x, y - 1) ? cells[y - 1][x].assetKey : '';
      const down = inBounds(cells, x, y + 1) ? cells[y + 1][x].assetKey : '';

      const horizGap = BARRIER_KEYS.has(left) && BARRIER_KEYS.has(right);
      const vertGap = BARRIER_KEYS.has(up) && BARRIER_KEYS.has(down);
      if (!horizGap && !vertGap) continue;

      if (hasFunctionalNearby(cells, x, y, 1)) continue;

      cells[y][x] = makeQuizGateCell();
      placed++;
    }
  }

  return placed;
}
