/**
 * PlaceCoherence.ts — Read-only audit for place-coherence invariants (P1–P7).
 *
 * Epic PR1: report violations only. Do **not** mutate cells here.
 * Repairs wire into ChunkGenerator in PR2 (`runPlaceCoherencePass`).
 *
 * Reuses scene-invariants vocabulary (functional openings, barrier keys,
 * declared openings). Does not invent new gate kinds.
 *
 * @see memories/repo/design-place-coherence-epic-2026-07-19.md
 */

import type { CellData } from '../../types/game.types';
import type { AssemblyOpening, AssemblyRecipe } from '../iso2-assemblies/catalog';
import {
  FUNCTIONAL_OPENING_KEYS,
  PATH_OPENING_KEYS,
  validateSceneOpenings,
  type SceneOpeningViolation,
} from '../iso2-assemblies/scene-invariants';
import { expectedWalkableDefault } from '../walkability-policy';

// ─── Shared key sets (mirror scene-invariants barrier vocabulary) ─────────

/** Barrier materials that form enclosure rings / runs. */
const BARRIER_KEYS = new Set([
  'fence',
  'wooden_fence',
  'wall',
  'stone_wall',
  'cathedral_wall',
]);

/** Contract families for walkable-policy audit (P3). */
const POLICY_CONTRACT_KEYS = new Set([
  'water',
  'bridge',
  'quiz_gate',
  'door_locked',
  'door_open',
  'door_gate',
  'toll_gate',
  'fence',
  'wall',
  'wooden_fence',
  'stone_wall',
  'cathedral_wall',
  'barricade',
]);

function isPolicyContractKey(assetKey: string): boolean {
  if (POLICY_CONTRACT_KEYS.has(assetKey)) return true;
  if (assetKey.startsWith('water_') && assetKey !== 'water_flask') return true;
  if (assetKey.startsWith('bridge_')) return true;
  if (assetKey.startsWith('wooden_fence')) return true;
  if (assetKey.startsWith('stone_wall')) return true;
  if (assetKey.startsWith('homestead_wall')) return true;
  return false;
}

// ─── Types ────────────────────────────────────────────────────────────────

export type PlaceCoherenceInvariant =
  | 'P1' // enclosure needs functional opening
  | 'P2' // declared openings match stamp
  | 'P3' // walkable === expectedWalkableDefault
  | 'P4' // no walkable hole in barrier run unless declared opening
  | 'P5' // draw gate (soft / deferred)
  | 'P6' // homestead south perimeter
  | 'P7'; // fixed-seed determinism / matrix stability

export interface PlaceCoherenceViolation {
  readonly invariant: PlaceCoherenceInvariant;
  readonly x: number;
  readonly y: number;
  readonly assetKey: string;
  readonly reason: string;
  readonly recipeId?: string;
}

export interface StampedRecipeRef {
  readonly recipe: AssemblyRecipe;
  readonly originX: number;
  readonly originY: number;
}

export interface PlaceCoherenceAuditMeta {
  readonly chunkX?: number;
  readonly chunkY?: number;
  /** Known recipe footprints on this grid (for P2). */
  readonly recipes?: readonly StampedRecipeRef[];
  /**
   * Declared opening absolute cells that may legally sit in a barrier run
   * as walkable path/functional (P4 allow-list). Built from recipes when
   * omitted.
   */
  readonly declaredOpeningCells?: ReadonlySet<string>;
}

export interface PlaceCoherenceCounts {
  readonly illegalFenceGaps: number;
  readonly openingMismatches: number;
  readonly walkablePolicyMismatches: number;
  readonly enclosureWithoutOpening: number;
  readonly total: number;
}

export interface PlaceCoherenceAuditResult {
  readonly violations: readonly PlaceCoherenceViolation[];
  readonly counts: PlaceCoherenceCounts;
  /** Scene-invariant opening failures (P2 raw). */
  readonly openingViolations: readonly SceneOpeningViolation[];
}

// ─── Grid helpers ─────────────────────────────────────────────────────────

function inBounds(cells: CellData[][], x: number, y: number): boolean {
  return y >= 0 && y < cells.length && x >= 0 && x < (cells[y]?.length ?? 0);
}

function keyAt(cells: CellData[][], x: number, y: number): string {
  if (!inBounds(cells, x, y)) return '';
  return cells[y][x].assetKey;
}

function isBarrierKey(assetKey: string): boolean {
  return BARRIER_KEYS.has(assetKey);
}

function isFunctionalOpening(assetKey: string): boolean {
  return FUNCTIONAL_OPENING_KEYS.has(assetKey);
}

function isPathLikeKey(assetKey: string): boolean {
  return PATH_OPENING_KEYS.has(assetKey);
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isHorizCorridorCell(cells: CellData[][], x: number, y: number): boolean {
  if (!inBounds(cells, x, y)) return false;
  const cell = cells[y][x];
  if (!cell.walkable || !isPathLikeKey(cell.assetKey)) return false;
  return isBarrierKey(keyAt(cells, x - 1, y)) && isBarrierKey(keyAt(cells, x + 1, y));
}

function isVertCorridorCell(cells: CellData[][], x: number, y: number): boolean {
  if (!inBounds(cells, x, y)) return false;
  const cell = cells[y][x];
  if (!cell.walkable || !isPathLikeKey(cell.assetKey)) return false;
  return isBarrierKey(keyAt(cells, x, y - 1)) && isBarrierKey(keyAt(cells, x, y + 1));
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

// ─── P4: illegal fence / wall gaps (audit-only twin of scanAndRepairFenceGaps)

/**
 * Find single-cell walkable dirt/grass punch-throughs in continuous fence/wall
 * runs that are **not** declared openings and have no nearby functional gate.
 *
 * Mirrors `scanAndRepairFenceGaps` detection (including corridor guards) but
 * never mutates the grid.
 */
export function findIllegalFenceGaps(
  cells: CellData[][],
  size?: number,
  declaredOpeningCells?: ReadonlySet<string>,
): PlaceCoherenceViolation[] {
  const violations: PlaceCoherenceViolation[] = [];
  const h = Math.min(size ?? cells.length, cells.length);

  for (let y = 0; y < h; y++) {
    const rowLen = cells[y]?.length ?? 0;
    const w = Math.min(size ?? rowLen, rowLen);
    for (let x = 0; x < w; x++) {
      const cell = cells[y][x];
      if (!cell) continue;
      if (isFunctionalOpening(cell.assetKey)) continue;
      if (!cell.walkable) continue;
      if (!PATH_OPENING_KEYS.has(cell.assetKey)) continue;
      if (cell.itemId || cell.npcId) continue;

      if (declaredOpeningCells?.has(cellKey(x, y))) continue;

      const left = keyAt(cells, x - 1, y);
      const right = keyAt(cells, x + 1, y);
      const up = keyAt(cells, x, y - 1);
      const down = keyAt(cells, x, y + 1);

      const horizGap = isBarrierKey(left) && isBarrierKey(right);
      const vertGap = isBarrierKey(up) && isBarrierKey(down);
      if (horizGap === vertGap) continue;

      if (horizGap) {
        if (isHorizCorridorCell(cells, x, y - 1) || isHorizCorridorCell(cells, x, y + 1)) {
          continue;
        }
        const leftContinues =
          isBarrierKey(keyAt(cells, x - 2, y)) ||
          isBarrierKey(keyAt(cells, x - 1, y - 1)) ||
          isBarrierKey(keyAt(cells, x - 1, y + 1));
        const rightContinues =
          isBarrierKey(keyAt(cells, x + 2, y)) ||
          isBarrierKey(keyAt(cells, x + 1, y - 1)) ||
          isBarrierKey(keyAt(cells, x + 1, y + 1));
        if (!leftContinues && !rightContinues) continue;
      } else {
        if (isVertCorridorCell(cells, x - 1, y) || isVertCorridorCell(cells, x + 1, y)) {
          continue;
        }
        const upContinues =
          isBarrierKey(keyAt(cells, x, y - 2)) ||
          isBarrierKey(keyAt(cells, x - 1, y - 1)) ||
          isBarrierKey(keyAt(cells, x + 1, y - 1));
        const downContinues =
          isBarrierKey(keyAt(cells, x, y + 2)) ||
          isBarrierKey(keyAt(cells, x - 1, y + 1)) ||
          isBarrierKey(keyAt(cells, x + 1, y + 1));
        if (!upContinues && !downContinues) continue;
      }

      // Functional nearby is a soft excuse for repair, but still a P4 hole
      // unless the cell itself is a declared opening. Report it so PR2 can
      // decide seal-vs-promote.
      if (hasFunctionalNearby(cells, x, y, 1)) {
        // Skip: adjacent gate already provides the functional opening for
        // this run segment (same as scanAndRepairFenceGaps skip).
        continue;
      }

      violations.push({
        invariant: 'P4',
        x,
        y,
        assetKey: cell.assetKey,
        reason: `walkable ${cell.assetKey} punch-through in barrier run (not a declared opening)`,
      });
    }
  }

  return violations;
}

// ─── P3: walkable policy agreement ────────────────────────────────────────

export function auditWalkablePolicy(
  cells: CellData[][],
  size?: number,
): PlaceCoherenceViolation[] {
  const violations: PlaceCoherenceViolation[] = [];
  const h = Math.min(size ?? cells.length, cells.length);

  for (let y = 0; y < h; y++) {
    const rowLen = cells[y]?.length ?? 0;
    const w = Math.min(size ?? rowLen, rowLen);
    for (let x = 0; x < w; x++) {
      const cell = cells[y][x];
      if (!cell) continue;
      if (!isPolicyContractKey(cell.assetKey)) continue;
      const expected = expectedWalkableDefault(cell.assetKey);
      if (cell.walkable !== expected) {
        violations.push({
          invariant: 'P3',
          x,
          y,
          assetKey: cell.assetKey,
          reason: `walkable=${cell.walkable} expected=${expected} for ${cell.assetKey}`,
        });
      }
    }
  }

  return violations;
}

// ─── P2: declared openings match stamps ───────────────────────────────────

export function auditRecipeOpenings(
  cells: CellData[][],
  recipes: readonly StampedRecipeRef[],
): { violations: PlaceCoherenceViolation[]; openingViolations: SceneOpeningViolation[] } {
  const violations: PlaceCoherenceViolation[] = [];
  const openingViolations: SceneOpeningViolation[] = [];

  for (const { recipe, originX, originY } of recipes) {
    const result = validateSceneOpenings(cells, originX, originY, recipe);
    for (const v of result.violations) {
      openingViolations.push(v);
      violations.push({
        invariant: 'P2',
        x: v.x,
        y: v.y,
        assetKey: v.actual,
        reason: v.reason,
        recipeId: v.recipeId,
      });
    }
  }

  return { violations, openingViolations };
}

// ─── P1 (scaffold): barrier components lacking any functional opening ─────

/**
 * Light enclosure heuristic (P1 scaffold): for each 4-connected component of
 * barrier cells, if the component has ≥8 cells (plausible ring) and no
 * functional opening touches the component (adjacent or on-component), flag
 * the component centroid as enclosure-without-opening.
 *
 * Soft / approximate — PR2 may refine; PR1 uses this for matrix reporting.
 */
export function auditEnclosuresWithoutOpening(
  cells: CellData[][],
  size?: number,
): PlaceCoherenceViolation[] {
  const h = Math.min(size ?? cells.length, cells.length);
  const w = h > 0 ? Math.min(size ?? (cells[0]?.length ?? 0), cells[0]?.length ?? 0) : 0;
  if (h === 0 || w === 0) return [];

  const visited = new Uint8Array(h * w);
  const idx = (x: number, y: number) => y * w + x;
  const violations: PlaceCoherenceViolation[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (visited[idx(x, y)]) continue;
      const startKey = keyAt(cells, x, y);
      if (!isBarrierKey(startKey)) {
        visited[idx(x, y)] = 1;
        continue;
      }

      // BFS component
      const qx: number[] = [x];
      const qy: number[] = [y];
      visited[idx(x, y)] = 1;
      let head = 0;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      let touchesFunctional = false;

      while (head < qx.length) {
        const cx = qx[head];
        const cy = qy[head];
        head++;
        sumX += cx;
        sumY += cy;
        count++;

        // Functional opening on/adjacent to barrier cell?
        for (let dy = -1; dy <= 1 && !touchesFunctional; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (!inBounds(cells, nx, ny)) continue;
            if (isFunctionalOpening(cells[ny][nx].assetKey)) {
              touchesFunctional = true;
              break;
            }
          }
        }

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (visited[idx(nx, ny)]) continue;
          if (!isBarrierKey(keyAt(cells, nx, ny))) continue;
          visited[idx(nx, ny)] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }

      // Small stubs / single walls are not enclosures.
      if (count < 8) continue;
      if (touchesFunctional) continue;

      const cx = Math.round(sumX / count);
      const cy = Math.round(sumY / count);
      violations.push({
        invariant: 'P1',
        x: cx,
        y: cy,
        assetKey: keyAt(cells, cx, cy) || 'fence',
        reason: `barrier component size=${count} has no adjacent functional opening`,
      });
    }
  }

  return violations;
}

// ─── P6 helpers (homestead south perimeter facts) ─────────────────────────

/** Absolute south-gate cell for starter homestead (origin 9,8 + rel 3,6). */
export const HOMESTEAD_SOUTH_GATE_ABS = { x: 12, y: 14 } as const;

/**
 * Relative south-row fence cells (y=6): fence at x≠3, quiz_gate at x=3.
 * Used by tests and auditHomesteadSouth.
 */
export function expectedHomesteadSouthRow(
  originX: number,
  originY: number,
): Array<{ x: number; y: number; assetKey: 'fence' | 'quiz_gate' }> {
  const y = originY + 6;
  const row: Array<{ x: number; y: number; assetKey: 'fence' | 'quiz_gate' }> = [];
  for (let rx = 0; rx < 7; rx++) {
    row.push({
      x: originX + rx,
      y,
      assetKey: rx === 3 ? 'quiz_gate' : 'fence',
    });
  }
  return row;
}

export function auditHomesteadSouth(
  cells: CellData[][],
  originX: number,
  originY: number,
): PlaceCoherenceViolation[] {
  const violations: PlaceCoherenceViolation[] = [];
  const expected = expectedHomesteadSouthRow(originX, originY);

  for (const exp of expected) {
    if (!inBounds(cells, exp.x, exp.y)) {
      violations.push({
        invariant: 'P6',
        x: exp.x,
        y: exp.y,
        assetKey: '<oob>',
        reason: `homestead south cell out of bounds; expected ${exp.assetKey}`,
      });
      continue;
    }
    const actual = cells[exp.y][exp.x].assetKey;
    if (actual !== exp.assetKey) {
      violations.push({
        invariant: 'P6',
        x: exp.x,
        y: exp.y,
        assetKey: actual,
        reason: `homestead south expected ${exp.assetKey}, got ${actual}`,
      });
    }
  }

  return violations;
}

// ─── Opening allow-list builder ───────────────────────────────────────────

export function buildDeclaredOpeningCells(
  recipes: readonly StampedRecipeRef[],
): Set<string> {
  const set = new Set<string>();
  for (const { recipe, originX, originY } of recipes) {
    const openings = recipe.openings as readonly AssemblyOpening[] | undefined;
    if (!openings) continue;
    for (const o of openings) {
      set.add(cellKey(originX + o.x, originY + o.y));
    }
  }
  return set;
}

// ─── Combined audit ───────────────────────────────────────────────────────

function emptyCounts(): PlaceCoherenceCounts {
  return {
    illegalFenceGaps: 0,
    openingMismatches: 0,
    walkablePolicyMismatches: 0,
    enclosureWithoutOpening: 0,
    total: 0,
  };
}

/**
 * Read-only place-coherence audit over a cell grid.
 *
 * PR1: no repairs. Callers (tests / future debug) consume violations + counts.
 * PR2 will add `runPlaceCoherencePass` that mutates stamps.
 */
export function auditPlaceCoherence(
  cells: CellData[][],
  meta: PlaceCoherenceAuditMeta = {},
): PlaceCoherenceAuditResult {
  const size = cells.length;
  const recipes = meta.recipes ?? [];
  const declared =
    meta.declaredOpeningCells ??
    (recipes.length > 0 ? buildDeclaredOpeningCells(recipes) : undefined);

  const p4 = findIllegalFenceGaps(cells, size, declared);
  const p3 = auditWalkablePolicy(cells, size);
  const p2 = auditRecipeOpenings(cells, recipes);
  const p1 = auditEnclosuresWithoutOpening(cells, size);

  const violations = [...p1, ...p2.violations, ...p3, ...p4];

  const counts: PlaceCoherenceCounts = {
    illegalFenceGaps: p4.length,
    openingMismatches: p2.violations.length,
    walkablePolicyMismatches: p3.length,
    enclosureWithoutOpening: p1.length,
    total: violations.length,
  };

  return {
    violations,
    counts: counts.total === 0 && violations.length === 0 ? emptyCounts() : counts,
    openingViolations: p2.openingViolations,
  };
}
