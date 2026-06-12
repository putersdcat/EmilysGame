/**
 * WorldUnitSolver.ts — AC-3 world unit grid solver primitives (B3 / #253).
 *
 * Extracted from gen.ts (TemplateStamper / AC-3 solver surface — the highest-risk
 * remaining monolith piece after ObstacleSolver extraction).
 *
 * Micro-slice 8.1 (initial content):
 *   - traversalCompatible (#42)
 *   - weightedSelectTemplate
 *   - findTerminator
 *
 * Micro-slice 8.2 (added):
 *   - getCornerSurface
 *   - validateCornerGovernance (corner governance — ≤2 distinct surface types
 *     at any corner junction; only enforced when at least one neighbor is
 *     already collapsed)
 *
 * Micro-slice 8.3 (added):
 *   - MAX_PROPAGATION_ITERATIONS (constant — AC-3 budget cap)
 *   - OPPOSITES (constant — cardinal → opposite cardinal, used by slot
 *     priority and propagation)
 *   - buildAllArcs — constructs all pairwise arcs over the GRID_DIM × GRID_DIM
 *     slot grid (bidirectional, only between adjacent slots)
 *   - propagateAC3 — full AC-3 constraint propagation from an initial worklist
 *     of all arcs; revises slot candidates based on edge + traversal
 *     compatibility and re-enqueues dependent arcs
 *   - getArcsAffectedBy — filter arcs whose `to` is at (gy, gx)
 *   - propagateAC3Partial — partial AC-3 from a specific worklist (used by
 *     collapse after a slot is collapsed, to re-propagate from neighbors)
 *
 * These are pure, stateless helpers used by the still-in-gen.ts AC-3 machinery.
 * The full solver (`solveWorldUnitGrid`, `stampWorldUnitGrid`, collapse,
 * propagation orchestration, border constraint application, chain integrity
 * orchestration) remains in gen.ts and will move in later micro-slices
 * (8.4 → 8.6).
 *
 * `validateCornerGovernance` (8.2) and the propagation helpers (8.3) accept
 * structural `SlotLike` and `ArcLike` types so the module stays decoupled from
 * the full `SlotState` and `Arc` types (which still live in gen.ts and move
 * with micro-slice 8.4 / 8.5). The functions only read the fields they
 * actually need, so the structural subsets are sufficient.
 *
 * Re-exports are intentionally minimal; gen.ts imports directly for internal use.
 * No new public API surface is added to the engine/gen barrel at this time.
 *
 * Invariants protected: #17 (edge contracts), #42 (traversal continuity + corner
 * governance + chain integrity), #265 (determinism via seeded RNG only).
 *
 * TODO: DOC — when the full solver moves here, document the MRV + propagation
 * algorithm, corner governance rules, and fallback degradation strategy.
 */

import type { EdgeTag, Cardinal, RotatedTemplate, CornerCells } from '../../config/tiles.config';
import { MICRO_TILE_DEFS, edgesCompatible } from '../../config/tiles.config';

// --- Traversal Continuity Check (#42) ---
// When both edges are 'open' or 'path', traversal channels must match.
const TRAVERSAL_EDGE_TYPES = new Set<EdgeTag>(['open', 'path']);

/**
 * Structural subset of RotatedTemplate that traversalCompatible needs.
 * Accepts both full RotatedTemplate and partial types (e.g. a collapsed
 * slot) so callers don't have to construct full template objects just
 * to test continuity.
 */
interface EdgeProbe {
  edgeTags: RotatedTemplate['edgeTags'];
  traversalChannels: RotatedTemplate['traversalChannels'];
}

export function traversalCompatible(
  a: EdgeProbe,
  b: EdgeProbe,
  aSide: Cardinal,
  bSide: Cardinal,
): boolean {
  if (!TRAVERSAL_EDGE_TYPES.has(a.edgeTags[aSide]) || !TRAVERSAL_EDGE_TYPES.has(b.edgeTags[bSide])) {
    return true; // only enforce on open/path edges
  }
  return a.traversalChannels[aSide] === b.traversalChannels[bSide];
}

// --- Selection helper (used by MRV collapse) ---

export function weightedSelectTemplate(
  candidates: Array<{ template: RotatedTemplate; weight: number }>,
  rng: () => number,
): RotatedTemplate {
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng() * totalWeight;
  for (const c of candidates) {
    roll -= c.weight;
    if (roll <= 0) return c.template;
  }
  return candidates[candidates.length - 1].template;
}

// --- Chain termination recovery (#42) ---
// Used by enforceChainIntegrity when a chain feature would otherwise dangle
// at a chunk border or into an empty neighbor slot.

export function findTerminator(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  if (baseName.startsWith('river_')) {
    const pondRots = allRotations.get('river_end_pond');
    if (pondRots && pondRots.length > 0) return pondRots[0];
  }
  if (baseName.startsWith('wall_') || baseName === 'guard_tower') {
    const wallEndRots = allRotations.get('wall_end');
    if (wallEndRots && wallEndRots.length > 0) return wallEndRots[0];
  }
  if (baseName.startsWith('dirt_path') || baseName.startsWith('path_')) {
    const pathEndRots = allRotations.get('path_dead_end');
    if (pathEndRots && pathEndRots.length > 0) return pathEndRots[0];
  }
  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) return meadowRots[0];
  return null;
}

// --- Corner Governance (#42) ---
// At most 2 distinct surface types may meet at any corner junction point.

/**
 * Surface type for a micro-tile at a corner cell.
 * Looks up the tile's surface metadata; defaults to 'grass' when unknown.
 */
export function getCornerSurface(cellType: string): string {
  return MICRO_TILE_DEFS[cellType as keyof typeof MICRO_TILE_DEFS]?.surface ?? 'grass';
}

/**
 * Structural subset of the gen.ts `SlotState` that the corner governance +
 * propagation helpers actually read.
 * Decouples the module from the full type (which moves in micro-slice 8.4).
 *
 * - `cornerCells`: used by corner governance (8.2)
 * - `collapsed` (with `edgeTags`, `traversalChannels`, `cornerCells`) /
 *   `candidates`: used by AC-3 propagation (8.3)
 */
interface SlotLike {
  collapsed: { edgeTags: RotatedTemplate['edgeTags']; traversalChannels: RotatedTemplate['traversalChannels']; cornerCells: CornerCells } | null;
  candidates: Array<{ template: RotatedTemplate }>;
}

/**
 * Structural subset of the gen.ts `Arc` type that propagation helpers need.
 * Decouples the module from the full type (which moves in micro-slice 8.4).
 */
interface ArcLike {
  fromY: number;
  fromX: number;
  toY: number;
  toX: number;
  fromSide: Cardinal;
  toSide: Cardinal;
}

/**
 * Validate that placing `candidate` at grid position (gy, gx) would not
 * produce a corner junction with more than 2 distinct surface types.
 *
 * A slot participates in up to 4 corner junctions (one per corner of the
 * slot's bounding box). At each junction, the surfaces of:
 *   - the candidate being placed, and
 *   - any already-collapsed neighbor that shares that junction
 * are unioned. If the union exceeds 2 distinct surfaces AND at least one
 * neighbor is collapsed (otherwise no constraint is active yet), the
 * candidate is rejected for this position.
 */
export function validateCornerGovernance(
  candidate: RotatedTemplate,
  gy: number,
  gx: number,
  slots: SlotLike[][],
  gridDim: number,
): boolean {
  // This slot participates in up to 4 corner junctions.
  // For each junction, collect surface types from collapsed neighbors + candidate.
  // Junction (jy, jx): top-left=SE, top-right=SW, bot-left=NE, bot-right=NW
  const checks: Array<{
    mySurface: string;
    neighbors: Array<{ sy: number; sx: number; corner: keyof CornerCells }>;
  }> = [
    // This slot is top-left → contributes SE corner
    {
      mySurface: getCornerSurface(candidate.cornerCells.se),
      neighbors: [
        { sy: gy, sx: gx + 1, corner: 'sw' },
        { sy: gy + 1, sx: gx, corner: 'ne' },
        { sy: gy + 1, sx: gx + 1, corner: 'nw' },
      ],
    },
    // This slot is top-right → contributes SW corner
    {
      mySurface: getCornerSurface(candidate.cornerCells.sw),
      neighbors: [
        { sy: gy, sx: gx - 1, corner: 'se' },
        { sy: gy + 1, sx: gx - 1, corner: 'ne' },
        { sy: gy + 1, sx: gx, corner: 'nw' },
      ],
    },
    // This slot is bottom-left → contributes NE corner
    {
      mySurface: getCornerSurface(candidate.cornerCells.ne),
      neighbors: [
        { sy: gy - 1, sx: gx, corner: 'se' },
        { sy: gy - 1, sx: gx + 1, corner: 'sw' },
        { sy: gy, sx: gx + 1, corner: 'nw' },
      ],
    },
    // This slot is bottom-right → contributes NW corner
    {
      mySurface: getCornerSurface(candidate.cornerCells.nw),
      neighbors: [
        { sy: gy - 1, sx: gx - 1, corner: 'se' },
        { sy: gy - 1, sx: gx, corner: 'sw' },
        { sy: gy, sx: gx - 1, corner: 'ne' },
      ],
    },
  ];

  for (const check of checks) {
    const surfaces = new Set<string>([check.mySurface]);
    let hasCollapsedNeighbor = false;
    for (const { sy, sx, corner } of check.neighbors) {
      if (sy < 0 || sy >= gridDim || sx < 0 || sx >= gridDim) continue;
      const slot = slots[sy][sx];
      if (!slot.collapsed) continue;
      hasCollapsedNeighbor = true;
      surfaces.add(getCornerSurface(slot.collapsed.cornerCells[corner]));
    }
    // Only enforce if at least one neighbor is collapsed (otherwise no constraint yet)
    if (hasCollapsedNeighbor && surfaces.size > 2) return false;
  }
  return true;
}

// --- AC-3 Constraint Propagation (#17) ---

/**
 * AC-3 solver iteration budget. The propagation loop exits when either the
 * worklist empties (convergence) or this many revisions have been attempted.
 * Tuned to be small enough to avoid runaway, large enough to converge on
 * realistic 5x5 world unit grids with a few dozen templates.
 */
export const MAX_PROPAGATION_ITERATIONS = 1000;

/**
 * Cardinal → opposite cardinal. Used by slot priority (looking up the
 * edge that the collapsed neighbor faces us with) and by chain
 * terminator recovery (looking up the reverse direction to the dangling
 * exit).
 */
export const OPPOSITES: Record<Cardinal, Cardinal> = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * Build the complete arc set for a GRID_DIM × GRID_DIM world unit grid.
 * Each adjacent pair of slots gets two arcs (one in each direction) so
 * that propagation can revise either side. The grid dimension is passed
 * explicitly so the module is decoupled from the gen.ts GRID_DIM constant
 * (moves with micro-slice 8.5 / 8.6).
 */
export function buildAllArcs(gridDim: number): ArcLike[] {
  const arcs: ArcLike[] = [];
  for (let gy = 0; gy < gridDim; gy++) {
    for (let gx = 0; gx < gridDim; gx++) {
      // Right neighbor
      if (gx + 1 < gridDim) {
        arcs.push({ fromY: gy, fromX: gx, toY: gy, toX: gx + 1, fromSide: 'e', toSide: 'w' });
        arcs.push({ fromY: gy, fromX: gx + 1, toY: gy, toX: gx, fromSide: 'w', toSide: 'e' });
      }
      // Bottom neighbor
      if (gy + 1 < gridDim) {
        arcs.push({ fromY: gy, fromX: gx, toY: gy + 1, toX: gx, fromSide: 's', toSide: 'n' });
        arcs.push({ fromY: gy + 1, fromX: gx, toY: gy, toX: gx, fromSide: 'n', toSide: 's' });
      }
    }
  }
  return arcs;
}

/**
 * Full AC-3 constraint propagation from an initial worklist of all arcs.
 *
 * For each popped arc (Xk, Xm), revise Xk by removing any candidate that
 * has NO compatible candidate in Xm (edge-compatible AND traversal-
 * compatible, #42). If Xk's candidate set shrinks, re-enqueue every arc
 * pointing into Xk (except the one we just processed) so the new
 * information propagates outward.
 *
 * Convergence is guaranteed for finite-domain CSPs with an arc-consistency
 * algorithm — the loop exits when the worklist empties. The iteration
 * budget caps total work in pathological cases.
 */
export function propagateAC3(slots: SlotLike[][], allArcs: ArcLike[]): void {
  // Worklist: start with all arcs
  const queue: ArcLike[] = [...allArcs];
  let iterations = 0;

  while (queue.length > 0 && iterations < MAX_PROPAGATION_ITERATIONS) {
    iterations++;
    const arc = queue.shift()!;
    const fromSlot = slots[arc.fromY][arc.fromX];
    const toSlot = slots[arc.toY][arc.toX];

    // Skip if either is already collapsed
    if (fromSlot.collapsed || toSlot.collapsed) continue;

    // Revise: remove candidates from 'from' that have no compatible candidate in 'to'
    const before = fromSlot.candidates.length;
    fromSlot.candidates = fromSlot.candidates.filter(fc => {
      // At least one candidate in 'to' must be edge-compatible AND traversal-compatible (#42)
      return toSlot.candidates.some(tc =>
        edgesCompatible(fc.template.edgeTags[arc.fromSide], tc.template.edgeTags[arc.toSide])
        && traversalCompatible(fc.template, tc.template, arc.fromSide, arc.toSide),
      );
    });

    // If candidates were removed, re-enqueue arcs pointing TO this slot
    if (fromSlot.candidates.length < before) {
      for (const otherArc of allArcs) {
        if (otherArc.toY === arc.fromY && otherArc.toX === arc.fromX &&
            !(otherArc.fromY === arc.toY && otherArc.fromX === arc.toX)) {
          queue.push(otherArc);
        }
      }
    }
  }
}

/**
 * Return the subset of `allArcs` whose `to` is at (gy, gx).
 * Used after a slot is collapsed to find the dependent neighbors that
 * need re-propagation.
 */
export function getArcsAffectedBy(
  gy: number, gx: number, allArcs: ArcLike[],
): ArcLike[] {
  return allArcs.filter(a => a.toY === gy && a.toX === gx);
}

/**
 * Partial AC-3 propagation from a specific worklist. Same revise logic
 * as `propagateAC3` but starts from the supplied worklist (not all
 * arcs) and skips collapsed `to` slots by filtering the `from` slot
 * against the single collapsed value (instead of the candidate set).
 *
 * Used by the MRV collapse loop after picking a candidate for a slot:
 * the affected neighbors' candidates get filtered, then partial AC-3
 * propagates the consequence outward.
 */
export function propagateAC3Partial(
  slots: SlotLike[][],
  queue: ArcLike[],
  allArcs: ArcLike[],
): void {
  let iterations = 0;
  while (queue.length > 0 && iterations < MAX_PROPAGATION_ITERATIONS) {
    iterations++;
    const arc = queue.shift()!;
    const fromSlot = slots[arc.fromY][arc.fromX];
    const toSlot = slots[arc.toY][arc.toX];

    if (fromSlot.collapsed) continue;

    // If toSlot is collapsed, filter from against the single collapsed value
    // Includes traversal continuity check (#42)
    let changed = false;
    if (toSlot.collapsed) {
      const before = fromSlot.candidates.length;
      fromSlot.candidates = fromSlot.candidates.filter(fc =>
        edgesCompatible(fc.template.edgeTags[arc.fromSide], toSlot.collapsed!.edgeTags[arc.toSide])
        && traversalCompatible(fc.template, toSlot.collapsed!, arc.fromSide, arc.toSide),
      );
      changed = fromSlot.candidates.length < before;
    } else {
      const before = fromSlot.candidates.length;
      fromSlot.candidates = fromSlot.candidates.filter(fc =>
        toSlot.candidates.some(tc =>
          edgesCompatible(fc.template.edgeTags[arc.fromSide], tc.template.edgeTags[arc.toSide])
          && traversalCompatible(fc.template, tc.template, arc.fromSide, arc.toSide),
        ),
      );
      changed = fromSlot.candidates.length < before;
    }

    if (changed) {
      for (const otherArc of allArcs) {
        if (otherArc.toY === arc.fromY && otherArc.toX === arc.fromX &&
            !(otherArc.fromY === arc.toY && otherArc.fromX === arc.toX)) {
          queue.push(otherArc);
        }
      }
    }
  }
}
