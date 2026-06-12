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
 * Micro-slice 8.4 (added):
 *   - collapseAllMRV — the MRV-with-priority-tiers collapse loop. Selects
 *     the next uncollapsed slot by priority (corners → borders → chain
 *     continuation → interior MRV), picks a weighted candidate filtered
 *     through corner governance, then triggers partial AC-3 propagation
 *     to the affected neighbors. See 8.4 notes for the structural-type
 *     decoupling.
 *
 * These are pure, stateless helpers used by the still-in-gen.ts AC-3 machinery.
 * The full solver (`solveWorldUnitGrid`, `stampWorldUnitGrid`,
 * border-constraint application, chain integrity orchestration) remains in
 * gen.ts and will move in later micro-slices (8.5 → 8.6).
 *
 * `validateCornerGovernance` (8.2), the propagation helpers (8.3), and
 * `collapseAllMRV` (8.4) accept structural `SlotLike` and `ArcLike` types so
 * the module stays decoupled from the full `SlotState` and `Arc` types
 * (which still live in gen.ts and move with micro-slice 8.5). The functions
 * only read the fields they actually need, so the structural subsets are
 * sufficient.
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
 * propagation + collapse helpers actually read.
 * Decouples the module from the full type (which moves in micro-slice 8.5).
 *
 * - `cornerCells`: used by corner governance (8.2)
 * - `collapsed` (with `edgeTags`, `traversalChannels`, `cornerCells`) /
 *   `candidates`: used by AC-3 propagation (8.3) and MRV collapse (8.4)
 * - `candidates[i].weight`: used by weighted selection during collapse (8.4)
 */
interface SlotLike {
  collapsed: { edgeTags: RotatedTemplate['edgeTags']; traversalChannels: RotatedTemplate['traversalChannels']; cornerCells: CornerCells } | null;
  candidates: Array<{ template: RotatedTemplate; weight: number }>;
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

// --- MRV Collapse with Boundary-First Priority (#17) ---

/**
 * Collapse every slot in the grid using MRV with a four-tier priority:
 *
 *   Tier 0: contradictions (candidateCount === 0) — handled inline
 *   Tier 1: corners (most constrained boundary)     → 1000 + MRV
 *   Tier 2: border edges                            → 2000 + MRV
 *   Tier 3: chain continuation (adjacent to chain)  → 3000 + MRV
 *   Tier 4: interior MRV                            → 4000 + MRV
 *
 * The boundary-first priority ensures chunk borders agree with neighbors
 * (edge-contract consistency, #17) before we extend chain features inward,
 * and only then fill the interior with the most-constrained heuristic.
 *
 * For each picked slot:
 *   1. Filter candidates through corner governance (#42); fall back to the
 *      unfiltered set if governance rejects all.
 *   2. Pick one via weightedSelectTemplate.
 *   3. If the slot had no candidates at all (contradiction), use the
 *      fallback template passed in by the caller (recovery strategy 1).
 *   4. Find the affected arcs (whose `to` is the collapsed slot), filter
 *      each neighbor's candidates against the collapsed value, then run
 *      partial AC-3 propagation from the affected queue to spread the
 *      consequence outward.
 *
 * The function accepts structural SlotLike / ArcLike types so it can be
 * called from gen.ts (which still owns the full SlotState / Arc types)
 * without coupling this module to them. The gridDim parameter replaces
 * the local GRID_DIM constant that lives in gen.ts.
 */
export function collapseAllMRV(
  slots: SlotLike[][],
  rng: () => number,
  fallback: RotatedTemplate | null,
  allArcs: ArcLike[],
  gridDim: number,
): void {
  const totalSlots = gridDim * gridDim;

  for (let step = 0; step < totalSlots; step++) {
    // Find uncollapsed slot with best priority (boundary-first, then chain, then MRV)
    let bestY = -1, bestX = -1, bestPriority = Infinity;
    for (let gy = 0; gy < gridDim; gy++) {
      for (let gx = 0; gx < gridDim; gx++) {
        const slot = slots[gy][gx];
        if (slot.collapsed) continue;
        const priority = slotPriority(gy, gx, slots, gridDim);
        if (priority < bestPriority) {
          bestPriority = priority;
          bestY = gy;
          bestX = gx;
        }
      }
    }

    if (bestY < 0) break; // All collapsed

    const slot = slots[bestY][bestX];

    // Collapse: pick from candidates (weighted) with corner governance (#42)
    if (slot.candidates.length > 0) {
      // Filter by corner governance first; fall back to unfiltered if all rejected
      const governed = slot.candidates.filter(c =>
        validateCornerGovernance(c.template, bestY, bestX, slots, gridDim),
      );
      slot.collapsed = weightedSelectTemplate(
        governed.length > 0 ? governed : slot.candidates, rng,
      );
    } else {
      // Contradiction: use fallback (recovery strategy 1: degrade)
      slot.collapsed = fallback;
    }
    slot.candidates = [];

    // After collapsing, propagate constraints from this slot's neighbors
    // Re-enqueue arcs involving this slot's neighbors
    const affectedArcs = getArcsAffectedBy(bestY, bestX, allArcs);
    // For each neighbor of the collapsed slot, filter their candidates
    for (const arc of affectedArcs) {
      const neighborSlot = slots[arc.fromY][arc.fromX];
      if (neighborSlot.collapsed) continue;

      const oppSide = OPPOSITES[arc.fromSide];
      if (slot.collapsed) {
        neighborSlot.candidates = neighborSlot.candidates.filter(c =>
          edgesCompatible(c.template.edgeTags[arc.fromSide], slot.collapsed!.edgeTags[oppSide])
          && traversalCompatible(c.template, slot.collapsed!, arc.fromSide, oppSide),
        );
      }
    }

    // Run AC-3 from the affected neighbors outward
    const propagationQueue: ArcLike[] = [];
    for (const arc of affectedArcs) {
      if (!slots[arc.fromY][arc.fromX].collapsed) {
        // Re-enqueue arcs pointing to the affected neighbor
        for (const otherArc of allArcs) {
          if (otherArc.toY === arc.fromY && otherArc.toX === arc.fromX) {
            propagationQueue.push(otherArc);
          }
        }
      }
    }
    propagateAC3Partial(slots, propagationQueue, allArcs);
  }
}

/**
 * Score a slot for collapse priority. Lower = collapse sooner.
 * Mirrors the tier ordering in `collapseAllMRV`.
 *
 * Returns -1 for contradictions (zero candidates) so they get processed
 * first, degrading quickly rather than continuing to refine a doomed
 * position.
 */
function slotPriority(gy: number, gx: number, slots: SlotLike[][], gridDim: number): number {
  const slot = slots[gy][gx];
  if (slot.collapsed) return Infinity;
  const candidateCount = slot.candidates.length;
  if (candidateCount === 0) return -1; // Contradictions first (to degrade quickly)

  const isBorder = gy === 0 || gy === gridDim - 1 || gx === 0 || gx === gridDim - 1;
  const isCorner = (gy === 0 || gy === gridDim - 1) && (gx === 0 || gx === gridDim - 1);

  // Check if adjacent to an already-collapsed chain feature
  let adjacentToChain = false;
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dy, dx] of dirs) {
    const ny = gy + dy, nx = gx + dx;
    if (ny >= 0 && ny < gridDim && nx >= 0 && nx < gridDim) {
      const neighbor = slots[ny][nx];
      if (neighbor.collapsed) {
        // Check if neighbor has non-open edges facing us (chain connection)
        const nEdges = neighbor.collapsed.edgeTags;
        const facing = dy === -1 ? 'n' : dy === 1 ? 's' : dx === -1 ? 'w' : 'e';
        const oppFacing = OPPOSITES[facing];
        if (nEdges[oppFacing] !== 'open') {
          adjacentToChain = true;
          break;
        }
      }
    }
  }

  // Priority tiers (lower number = higher priority)
  let tier: number;
  if (isCorner) tier = 1000;
  else if (isBorder) tier = 2000;
  else if (adjacentToChain) tier = 3000;
  else tier = 4000;

  return tier + candidateCount;
}
