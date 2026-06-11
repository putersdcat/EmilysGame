/**
 * WorldUnitSolver.ts — AC-3 world unit grid solver primitives (B3 / #253).
 *
 * Extracted from gen.ts (TemplateStamper / AC-3 solver surface — the highest-risk
 * remaining monolith piece after ObstacleSolver extraction).
 *
 * Micro-slice 8.1 (this file's initial content):
 *   - Pure, stateless helpers for traversal compatibility (#42), weighted selection,
 *     and chain-terminator recovery.
 *   - These have no mutable module state, no side effects, and minimal coupling.
 *   - Goal: reduce gen.ts surface safely, prove the extraction pattern for the
 *     larger solver state machine (SlotState/Arc/MRV/propagation) in later micro-slices.
 *
 * The full solver (`solveWorldUnitGrid`, `stampWorldUnitGrid`, collapse, propagation,
 * border constraint application, chain integrity orchestration) remains in gen.ts
 * for this bounded micro-slice to keep risk minimal.
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

import type { EdgeTag, Cardinal, RotatedTemplate } from '../../config/tiles.config';

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
