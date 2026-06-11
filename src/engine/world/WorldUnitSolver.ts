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
 * Micro-slice 8.2 (added in this commit):
 *   - getCornerSurface
 *   - validateCornerGovernance (corner governance — ≤2 distinct surface types
 *     at any corner junction; only enforced when at least one neighbor is
 *     already collapsed)
 *
 * These are pure, stateless helpers used by the still-in-gen.ts AC-3 machinery.
 * The full solver (`solveWorldUnitGrid`, `stampWorldUnitGrid`, collapse,
 * propagation, border constraint application, chain integrity orchestration)
 * remains in gen.ts and will move in later micro-slices (8.3 → 8.6).
 *
 * `validateCornerGovernance` accepts a structural `SlotLike` type so the module
 * stays decoupled from the full `SlotState` type (which still lives in gen.ts
 * and moves in micro-slice 8.3). The function only reads `.collapsed.cornerCells`
 * from each slot, so the structural subset is sufficient.
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
import { MICRO_TILE_DEFS } from '../../config/tiles.config';

// --- Traversal Continuity Check (#42) ---
// When both edges are 'open' or 'path', traversal channels must match.
const TRAVERSAL_EDGE_TYPES = new Set<EdgeTag>(['open', 'path']);

export function traversalCompatible(
  a: RotatedTemplate,
  b: RotatedTemplate,
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
 * Structural subset of the gen.ts `SlotState` that this function actually reads.
 * Decouples the module from the full type (which moves in micro-slice 8.3).
 */
interface SlotLike {
  collapsed: { cornerCells: CornerCells } | null;
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
