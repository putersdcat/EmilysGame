/**
 * PlaceCoherence.ts — Place-coherence audit (P1–P7) + post-pipeline repair pass.
 *
 * Epic PR1: read-only audit (`auditPlaceCoherence`, findIllegalFenceGaps, …).
 * Epic PR2: `runPlaceCoherencePass` mutates stamps after final gen phases —
 * re-asserts homestead openings, seals illegal fence/wall dirt gaps via
 * scene-invariants helpers (`scanAndRepairFenceGaps` / `repairSceneOpenings`).
 *
 * Critical-path PR4: seal policy is **matching barrier** (dominant neighbor),
 * not `quiz_gate`. Functional openings ≠ structural seal. Pass stays last
 * cell writer and MUST NOT call ensureMinimumQuizGates.
 *
 * Reuses scene-invariants vocabulary and gap detection SSOT
 * (`isIllegalFenceGapCandidate`, `BARRIER_KEYS`, functional/path keys).
 * Does not invent new gate kinds or touch nano / FOV / WorldUnitSolver.
 *
 * @see memories/repo/design-place-coherence-epic-2026-07-19.md
 * @see memories/repo/design-critical-path-recovery-2026-07-19.md §4
 */

import { ASSET_DEFS } from '../../config/assets.config';
import type { CellData } from '../../types/game.types';
import type { AssemblyOpening, AssemblyRecipe } from '../iso2-assemblies/catalog';
import {
  FUNCTIONAL_OPENING_KEYS,
  isBarrierAssetKey,
  isIllegalFenceGapCandidate,
  repairSceneOpenings,
  scanAndRepairFenceGaps,
  validateSceneOpenings,
  type SceneOpeningViolation,
} from '../iso2-assemblies/scene-invariants';
import {
  STARTER_HOMESTEAD_OPENINGS,
  STARTER_HOMESTEAD_ORIGIN,
  STARTER_HOMESTEAD_RECIPE,
} from '../iso2-assemblies/starter-homestead';
import {
  expectedWalkableDefault,
  PLACE_WALK_FAMILY_KEYS,
} from '../walkability-policy';

// ─── Contract families for walkable-policy audit (P3) ─────────────────────

/**
 * Exact keys beyond {@link PLACE_WALK_FAMILY_KEYS} that still get P3 audit
 * (structures not in the core place-family matrix but stamped in places).
 */
const POLICY_CONTRACT_EXTRAS = new Set(['cathedral_wall', 'barricade']);

const PLACE_WALK_FAMILY_KEY_SET = new Set<string>(PLACE_WALK_FAMILY_KEYS);

/**
 * Whether an assetKey is in the P3 walk-policy audit surface.
 * Derived from `PLACE_WALK_FAMILY_KEYS` (+ documented extras + material prefixes)
 * so the walk matrix and audit cannot silently drift.
 */
export function isPolicyContractKey(assetKey: string): boolean {
  if (PLACE_WALK_FAMILY_KEY_SET.has(assetKey)) return true;
  if (POLICY_CONTRACT_EXTRAS.has(assetKey)) return true;
  // Material variants of place-family keys
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

function isFunctionalOpening(assetKey: string): boolean {
  return FUNCTIONAL_OPENING_KEYS.has(assetKey);
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

// ─── P4: illegal fence / wall gaps (audit-only twin of scanAndRepairFenceGaps)

/**
 * Find single-cell walkable dirt/grass punch-throughs in continuous fence/wall
 * runs that are **not** declared openings.
 *
 * Detection SSOT: {@link isIllegalFenceGapCandidate} from scene-invariants
 * (same geometry + functional-nearby skip as `scanAndRepairFenceGaps`).
 * Never mutates the grid.
 *
 * Functional-nearby policy (aligned with repair): a dirt cell next to an
 * existing quiz_gate/door is **not** reported as P4 — the gate already serves
 * that run segment. Declared path openings without a nearby functional gate
 * are allow-listed only when present in `declaredOpeningCells`.
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
      if (!isIllegalFenceGapCandidate(cells, x, y)) continue;
      if (declaredOpeningCells?.has(cellKey(x, y))) continue;

      const cell = cells[y][x];
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
 * Light enclosure heuristic (P1 scaffold) for matrix reporting only.
 *
 * For each 4-connected component of barrier cells (`isBarrierAssetKey`):
 * if size ≥ 8 and no functional opening is adjacent/on-component, flag the
 * component centroid as enclosure-without-opening.
 *
 * **Known false-positive class (do not hard-fail on these in PR1):**
 * long linear fence runs, wall stubs, and incomplete rings of ≥8 barrier
 * cells with no gate also match — design allows “or is not an enclosure.”
 * Example: a straight 10-cell fence row with no opening is reported here
 * even though it is not a closed yard.
 *
 * **PR2:** require a stronger enclosure test (ring/loop heuristic or
 * interior walkable pocket) before hard-failing P1.
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
      if (!isBarrierAssetKey(startKey)) {
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
          if (!isBarrierAssetKey(keyAt(cells, nx, ny))) continue;
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

/** Relative south-gate opening from STARTER_HOMESTEAD_OPENINGS (sole quiz_gate). */
const HOMESTEAD_SOUTH_OPENING = STARTER_HOMESTEAD_OPENINGS[0]!;

/**
 * Absolute south-gate cell for starter homestead.
 * Derived from `STARTER_HOMESTEAD_ORIGIN` + sole opening (rel 4,8 → 13,16).
 * Stamp tests hard-lock the absolute (13,16) as regression (9×9 PR6).
 */
export const HOMESTEAD_SOUTH_GATE_ABS = {
  x: STARTER_HOMESTEAD_ORIGIN.x + HOMESTEAD_SOUTH_OPENING.x,
  y: STARTER_HOMESTEAD_ORIGIN.y + HOMESTEAD_SOUTH_OPENING.y,
} as const;

/**
 * Relative south-row fence cells (y=8 on 9×9): fence at x≠4, quiz_gate at x=4.
 * Used by tests and auditHomesteadSouth.
 */
export function expectedHomesteadSouthRow(
  originX: number,
  originY: number,
): Array<{ x: number; y: number; assetKey: 'fence' | 'quiz_gate' }> {
  const gateRelX = HOMESTEAD_SOUTH_OPENING.x;
  const gateRelY = HOMESTEAD_SOUTH_OPENING.y;
  const y = originY + gateRelY;
  const width = STARTER_HOMESTEAD_RECIPE.width;
  const row: Array<{ x: number; y: number; assetKey: 'fence' | 'quiz_gate' }> = [];
  for (let rx = 0; rx < width; rx++) {
    row.push({
      x: originX + rx,
      y,
      assetKey: rx === gateRelX ? 'quiz_gate' : 'fence',
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

/**
 * Read-only place-coherence audit over a cell grid.
 *
 * Does not mutate cells. Callers (tests / debug) consume violations + counts.
 * Mutating repair lives in {@link runPlaceCoherencePass}.
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
    counts,
    openingViolations: p2.openingViolations,
  };
}

// ─── Post-pipeline repair pass (PR2) ──────────────────────────────────────

/**
 * Module-level counters for the last {@link runPlaceCoherencePass} call.
 * Tests / optional debug may read these after `generateChunkSync`.
 */
export let coherenceRepairs = 0;
export let coherenceViolations = 0;

export function getPlaceCoherenceStats(): {
  coherenceRepairs: number;
  coherenceViolations: number;
} {
  return { coherenceRepairs, coherenceViolations };
}

function makeAssetCell(assetKey: string): CellData {
  const def = ASSET_DEFS[assetKey];
  return {
    assetKey,
    walkable: def?.walkable ?? false,
    interactable: def?.interactable ?? false,
  };
}

/**
 * Re-assert starter homestead south perimeter after late gen phases.
 *
 * Critical PR1 finding: full `generateChunkSync(0,0)` clobbered south fence /
 * gate (gate→grass, flanks→grass/flower). Restores the closed south row
 * (8× fence + sole quiz_gate on 9×9) from the recipe contract.
 *
 * Returns the number of cells mutated.
 */
export function reassertHomesteadSouthPerimeter(cells: CellData[][]): number {
  const ox = STARTER_HOMESTEAD_ORIGIN.x;
  const oy = STARTER_HOMESTEAD_ORIGIN.y;
  const expected = expectedHomesteadSouthRow(ox, oy);
  let repaired = 0;

  for (const exp of expected) {
    if (!inBounds(cells, exp.x, exp.y)) continue;
    const cell = cells[exp.y][exp.x];
    const def = ASSET_DEFS[exp.assetKey];
    const wantWalk = def?.walkable ?? false;
    const wantInteract = def?.interactable ?? false;
    if (
      cell.assetKey === exp.assetKey &&
      cell.walkable === wantWalk &&
      cell.interactable === wantInteract &&
      !cell.itemId &&
      !cell.npcId
    ) {
      continue;
    }
    cells[exp.y][exp.x] = makeAssetCell(exp.assetKey);
    repaired++;
  }

  return repaired;
}

/**
 * Collect recipe footprints for this chunk: caller-supplied modular stamps
 * plus the origin starter homestead when generating chunk (0,0).
 */
function collectRecipeFootprints(
  meta: { chunkX: number; chunkY: number; recipes?: StampedRecipeRef[] },
): StampedRecipeRef[] {
  const recipes: StampedRecipeRef[] = [...(meta.recipes ?? [])];
  if (meta.chunkX === 0 && meta.chunkY === 0) {
    const hasHomestead = recipes.some(
      (r) => r.recipe.id === STARTER_HOMESTEAD_RECIPE.id,
    );
    if (!hasHomestead) {
      recipes.push({
        recipe: STARTER_HOMESTEAD_RECIPE,
        originX: STARTER_HOMESTEAD_ORIGIN.x,
        originY: STARTER_HOMESTEAD_ORIGIN.y,
      });
    }
  }
  return recipes;
}

/**
 * Post-pipeline place-coherence pass: repair stamps only (no walkability
 * rewrite from render, no nano geometry, no new gate kinds).
 *
 * Responsibilities:
 * 1. Collect modular stamps + known origin homestead footprint.
 * 2. `repairSceneOpenings` for each registered recipe (P2 re-assert).
 * 3. Origin: re-assert homestead south perimeter (P6) — **not** origin-exempt.
 * 4. Fence-run scan: seal trivial dirt/grass punch-throughs with a **matching
 *    barrier** (dominant neighbor; fallback `fence`) via
 *    {@link scanAndRepairFenceGaps}. Functional openings ≠ structural seal —
 *    illegal linear gaps never become `quiz_gate`. Declared openings skipped.
 * 5. Emit `coherenceRepairs` / `coherenceViolations` module counters.
 * 6. MUST NOT call `ensureMinimumQuizGates` (PC is last writer; no quiz spam).
 *
 * Wire: absolute end of `generateGridChunk` — after `validatePlayability`
 * (which can carve grass through fence diagonals) and `ensureSpawnClearance`.
 */
export function runPlaceCoherencePass(
  cells: CellData[][],
  meta: { chunkX: number; chunkY: number; recipes?: StampedRecipeRef[] },
): { repairs: number; violations: SceneOpeningViolation[] } {
  const size = cells.length;
  const recipes = collectRecipeFootprints(meta);
  const declared = buildDeclaredOpeningCells(recipes);
  let repairs = 0;

  // 1–2. Re-assert declared openings for every registered footprint
  //    (modular stamps from scene registry + origin homestead).
  for (const { recipe, originX, originY } of recipes) {
    repairs += repairSceneOpenings(cells, originX, originY, recipe);
  }

  // 3. Origin homestead south perimeter (full row, not just the gate cell).
  //    Must run after late phases that clobber the stamp; must NOT be
  //    origin-exempt the way early scanAndRepairFenceGaps is.
  if (meta.chunkX === 0 && meta.chunkY === 0) {
    repairs += reassertHomesteadSouthPerimeter(cells);
    // Openings again in case south reassert raced with a prior partial fix.
    repairs += repairSceneOpenings(
      cells,
      STARTER_HOMESTEAD_ORIGIN.x,
      STARTER_HOMESTEAD_ORIGIN.y,
      STARTER_HOMESTEAD_RECIPE,
    );
  }

  // 4. Seal illegal single-cell dirt/grass gaps in barrier runs with matching
  //    barrier (not quiz_gate). Runs on **all** chunks including origin.
  //    Declared openings (incl. modular path openings) are skipped.
  repairs += scanAndRepairFenceGaps(cells, size, declared);

  // Re-assert recipe openings after seal for any residual mismatch.
  for (const { recipe, originX, originY } of recipes) {
    repairs += repairSceneOpenings(cells, originX, originY, recipe);
  }

  // Origin south once more after global seal (keep P6 hard-green).
  if (meta.chunkX === 0 && meta.chunkY === 0) {
    repairs += reassertHomesteadSouthPerimeter(cells);
  }

  // 5. Residual violations (should be empty for openings on registered recipes).
  const opening = auditRecipeOpenings(cells, recipes);
  const residualGaps = findIllegalFenceGaps(cells, size, declared);

  coherenceRepairs = repairs;
  coherenceViolations = opening.openingViolations.length + residualGaps.length;

  return {
    repairs,
    violations: opening.openingViolations,
  };
}
