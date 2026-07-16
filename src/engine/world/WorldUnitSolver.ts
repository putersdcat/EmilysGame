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
 * Micro-slice 8.5 (added — the top-level orchestration):
 *   - buildBiomeCandidatePool — build the per-biome weighted candidate
 *     pool with mood + biome-transition modifiers (#46)
 *   - findFallbackTemplate — pick the meadow_base rotation as the
 *     recovery template when a slot has no candidates (contradiction)
 *   - applyBorderConstraints — filter slot candidates against the
 *     already-solved edges of neighboring chunks (#17)
 *   - solveWorldUnitGrid — the top-level AC-3 world unit grid solver
 *     orchestrator (Phases 2a–2d). Initializes slots, applies border
 *     constraints, runs full AC-3 propagation, collapses via MRV,
 *     enforces chain integrity, extracts border edges, and returns
 *     the result. THIS IS THE PUBLIC FACE of the AC-3 solver.
 *   - stampWorldUnitGrid — Phase 3: write the solved 5×5 RotatedTemplate
 *     grid into the concrete CellData grid. Public (also called from
 *     gen.ts's generateGridChunk).
 *   - extractGridBorderEdges — extract per-position border EdgeTags
 *     + TraversalChannels for the chunk's n/s/e/w edges (used by
 *     downstream chunks to honor #17 edge contracts)
 *   - enforceChainIntegrity — replace dangling chain features (river
 *     ends, wall ends, path dead-ends) with appropriate terminators
 *     when they would otherwise leak off the chunk edge (#42)
 *   - type SolveResult (private) — the {grid, borderEdges} return type
 *     of solveWorldUnitGrid
 *
 * With 8.5, the AC-3 world unit grid solver surface is COMPLETE in this
 * module. The remaining gen.ts work is the chunk-generation pipeline
 * glue (generateGridChunk, generateChunkSync, generateChunk) plus the
 * LLM entropy cell-flag pass (applyEntropyCellFlags, #4).
 *
 * B4 micro-slice 8.8 (#253): `ChunkBorderEdges`, `BorderConstraints`,
 * and `CellData` are now imported directly from `src/types/game.types.ts`
 * (the single source of truth shared by engine, rendering, and game
 * layers). The structural `BorderLike` / `CellLike` subsets are gone.
 * The solver still uses structural `SlotLike` / `ArcLike` / `BiomeLike`
 * / `MoodLike` types for its private solver state — those are internal
 * to the AC-3 algorithm and don't cross layer boundaries.
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
import {
  MICRO_TILE_DEFS,
  edgesCompatible,
  getAllRotations,
  BIOME_TEMPLATE_WEIGHTS,
  oppositeDir,
  getTemplate,
} from '../../config/tiles.config';
import { ASSET_DEFS } from '../../config/assets.config';
import type { TileType } from '../../rendering/tiles';
// B3 micro-slice 8.6 (#253): GRID_DIM is now sourced from WorldGrid.ts
// (the single source of truth shared by gen.ts, Populator.ts, and
// terrain-cache.ts). The solver uses GRID_DIM directly for slot
// initialization + arc construction; stampWorldUnitGrid still takes
// wuSize as an explicit parameter (it doesn't need WU_SIZE elsewhere).
import { GRID_DIM } from './WorldGrid';
// B4 micro-slice 8.8 (#253): ChunkBorderEdges, BorderConstraints, and
// CellData now live in src/types/game.types.ts (the single source of
// truth shared by engine, rendering, and game layers). The solver
// imports them directly — no more structural subsets.
import type { ChunkBorderEdges, BorderConstraints, CellData } from '../../types/game.types';

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
  cornerCells: CornerCells;
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

/** Which authored chain family a dangling template belongs to, or null if
 * it isn't part of any chain (nothing to terminate). Shared by both the
 * single-connector (`findTerminatorCandidates`) and multi-way
 * (`findMultiWayTerminatorCandidates`, #4) selection paths so the
 * prefix rules only live in one place. */
type ChainFamily = 'river' | 'wall' | 'path';

/**
 * Resolve a template's chain family. Prefers the template's OWN declared
 * `chainType` (#4 fix) -- a pure name-prefix heuristic misses every THEMED
 * template whose name doesn't start with river_/wall_/path_ despite having
 * a real chainType set (treasure_alcove, castle_corridor, castle_hall,
 * beach_cove, fortified_passage, cave_tunnel_ns, and others -- found via a
 * real-pipeline sweep in gen-chain-integrity-boundary-audit.spec.ts: these
 * were silently un-resolvable and fell through to the bare meadow_base
 * fallback every time, which then frequently failed its own
 * north/west-neighbor compatibility check and left the original
 * multi-sided template dangling and completely unfixed).
 */
function resolveChainFamily(baseName: string): ChainFamily | null {
  const declared = getTemplate(baseName)?.chainType;
  if (declared === 'river' || declared === 'wall' || declared === 'path') return declared;
  if (declared === 'fence') {
    // 'fence' chain members have no dedicated multi-way/single-connector
    // terminator content today -- the only non-enclosure fence template
    // (fence_row) is itself a self-terminating straight run with no
    // authored fence_end/fence_corner/fence_t_junction sibling. Leave
    // unresolved (null) rather than guessing; the meadow_base fallback in
    // findTerminatorCandidates still applies exactly as before.
    return null;
  }

  // Fallback prefix heuristic (kept for hand-built RotatedTemplate
  // fixtures in tests that never went through WORLD_UNIT_TEMPLATES, so
  // getTemplate() would return undefined for them).
  if (baseName.startsWith('river_') || baseName.startsWith('shore_')) return 'river';
  if (baseName.startsWith('wall_') || baseName === 'guard_tower' || baseName === 'cave_fork') return 'wall';
  if (baseName.startsWith('dirt_path') || baseName.startsWith('path_')) return 'path';
  return null;
}

export function findTerminator(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
  dir?: Cardinal,
  dangling?: RotatedTemplate,
  offGridDirs?: readonly Cardinal[],
): RotatedTemplate | null {
  return findTerminatorCandidates(baseName, allRotations, dir, dangling, offGridDirs)[0] ?? null;
}

/**
 * Preference-ordered list of candidate terminator rotations for a dangling
 * chain feature, safest/most-preserving first. `enforceChainIntegrity`
 * tries each in turn against its real-neighbor compatibility check, since
 * a single "best-orientation" guess can still fail that check (e.g. it
 * avoids every off-grid direction but its connector doesn't land on the
 * ONE side with a real approaching chain) -- see #42 fix history
 * (2026-07-09, gen-chain-integrity-boundary-audit.spec.ts) for the full
 * writeup of why this needed to become a multi-candidate search.
 *
 * This is the SINGLE-connector path (collapses to a 1-sided _end/_dead_end
 * /_pond piece). For cells with 2-3 sides that must stay connected
 * (bends/T-junctions), see `findMultiWayTerminatorCandidates` (#4) --
 * using this single-connector function for those would silently discard
 * the cell's other still-valid connections.
 */
function findTerminatorCandidates(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
  dir?: Cardinal,
  dangling?: RotatedTemplate,
  offGridDirs?: readonly Cardinal[],
): RotatedTemplate[] {
  const family = resolveChainFamily(baseName);
  const terminatorName = family ? CHAIN_SHAPE_POOLS[family].single[0] : null;

  const candidates: RotatedTemplate[] = [];
  if (terminatorName) {
    const rots = allRotations.get(terminatorName);
    if (rots && rots.length > 0) {
      const safeDirs = offGridDirs && offGridDirs.length > 0 ? offGridDirs : (dir ? [dir] : []);
      const isSafe = (r: RotatedTemplate) => !safeDirs.some(d => r.edgeTags[d] !== 'open');
      const safeRots = rots.filter(isSafe);
      if (dir && dangling) {
        const into = oppositeDir(dir);
        const exactMatches = safeRots.filter(r => r.edgeTags[into] === dangling.edgeTags[into]);
        candidates.push(...exactMatches);
        candidates.push(...safeRots.filter(r => !exactMatches.includes(r)));
      } else {
        candidates.push(...safeRots);
      }
      if (!candidates.includes(rots[0])) candidates.push(rots[0]);
    }
  }

  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) candidates.push(meadowRots[0]);
  return candidates;
}

// --- Multi-way junction termination (#4 / Docs/VisionAlignmentAudit.md
// Finding #4, iso2-portback-plan.md "Phase 3b/6") ---
//
// `findTerminatorCandidates` above always collapses a dangling chain cell
// to a SINGLE-connector piece (river_end_pond / wall_end / path_dead_end).
// That's correct when only one side of the cell is a real chain port, but
// a bend/T-junction/crossroads cell has 2-4 non-open sides BY DESIGN, and
// replacing the whole cell with a 1-connector piece silently throws away
// its OTHER still-valid connections (they'd need to happen to land on the
// terminator's single connector by luck, or the connection is lost and
// the neighbor is left expecting a chain that no longer continues).
//
// The fix is NOT new authored content -- the multi-way shapes already
// exist (river_bend_ne/_nw, river_t_junction, wall_corner(_capped),
// wall_t_junction, path_bend_ne, path_t_junction) because they're used as
// ordinary AC-3 candidates during normal solving. This just teaches the
// termination step to reuse them: pick a same-family template whose
// non-open sides land EXACTLY on the sides that must stay connected
// (`keepDirs`), with every dangling side forced 'open'.

/** Authored template name pools per chain family, keyed by shape. Multiple
 * names can exist per shape for visual variety (e.g. river_bend_ne/_nw
 * both produce all 4 adjacent-pair rotations via `computeRotations`, just
 * with different in-tile art) -- querying every name in the pool widens
 * the rotation search for the final neighbor-compatibility check. */
const CHAIN_SHAPE_POOLS: Record<ChainFamily, { single: string[]; bend: string[]; straight: string[]; tJunction: string[] }> = {
  river: {
    single: ['river_end_pond'],
    bend: ['river_bend_ne', 'river_bend_nw'],
    straight: ['river_straight_ns', 'river_straight_ew'],
    tJunction: ['river_t_junction'],
  },
  wall: {
    single: ['wall_end'],
    bend: ['wall_corner', 'wall_corner_capped'],
    straight: ['wall_segment'],
    tJunction: ['wall_t_junction'],
  },
  path: {
    single: ['path_dead_end'],
    bend: ['path_bend_ne'],
    straight: ['dirt_path_ns', 'dirt_path_ew'],
    tJunction: ['path_t_junction'],
  },
};

function nonOpenSides(edges: RotatedTemplate['edgeTags']): Cardinal[] {
  return (['n', 's', 'e', 'w'] as Cardinal[]).filter(d => edges[d] !== 'open');
}

/** True iff `a` and `b` contain exactly the same cardinals (order-independent). */
function sameDirSet(a: readonly Cardinal[], b: readonly Cardinal[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every(d => setB.has(d));
}

/**
 * Candidate replacements for a chain cell with 2-3 sides that must stay
 * connected (`keepDirs`) while every side in `offGridDirs` (this cell's
 * own off-grid directions) becomes safely 'open'. Selects from the
 * bend/T-junction pool matching `keepDirs.length` (2 adjacent → bend, 2
 * opposite → straight-through, 3 → T-junction), never the 1-connector
 * pool -- callers should fall back to `findTerminatorCandidates` when
 * `keepDirs.length <= 1` or when this returns no candidates (e.g. the
 * cell's real north AND west neighbors demand two incompatible
 * connections simultaneously -- a genuine corner-piece gap, same
 * dual-conflicting-neighbor residual `findTerminatorCandidates` already
 * accepts as bounded-but-nonzero).
 */
function findMultiWayTerminatorCandidates(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
  keepDirs: readonly Cardinal[],
  offGridDirs: readonly Cardinal[],
): RotatedTemplate[] {
  const family = resolveChainFamily(baseName);
  if (!family || keepDirs.length < 2 || keepDirs.length > 3) return [];

  const pool = CHAIN_SHAPE_POOLS[family];
  let names: string[];
  if (keepDirs.length === 3) {
    names = pool.tJunction;
  } else {
    const [a, b] = keepDirs;
    names = oppositeDir(a) === b ? pool.straight : pool.bend;
  }

  const candidates: RotatedTemplate[] = [];
  for (const name of names) {
    const rots = allRotations.get(name);
    if (!rots) continue;
    for (const r of rots) {
      if (!sameDirSet(nonOpenSides(r.edgeTags), keepDirs)) continue;
      if (offGridDirs.some(d => r.edgeTags[d] !== 'open')) continue;
      candidates.push(r);
    }
  }
  return candidates;
}

// --- Corner Governance (#42) ---
// At most 2 distinct surface types may meet at any corner junction point.

/**
 * Surface type for a micro-tile at a corner cell.
 * Looks up the tile's surface metadata; defaults to 'grass' for null.
 */
export function getCornerSurface(cellType: string): string {
  return MICRO_TILE_DEFS[cellType as keyof typeof MICRO_TILE_DEFS]?.surface ?? 'grass';
}

/**
 * Structural subset of the gen.ts `SlotState` that the corner governance +
 * propagation + collapse helpers actually read.
 * Decouples the module from the full type.
 *
 * - `cornerCells` (on collapsed): used by corner governance (8.2)
 * - `edgeTags` (on collapsed): used by traversal check during propagation
 *   (the corner governance helper also reads cornerCells)
 * - `collapsed` is a full RotatedTemplate or null — the 8.5 orchestration
 *   (build the result grid, enforce chain integrity, extract border
 *   edges) needs the entire template, not just a subset
 * - `candidates[i].weight`: used by weighted selection during collapse (8.4)
 */
interface SlotLike {
  collapsed: RotatedTemplate | null;
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

// --- Biome Candidate Pool (#17 + #46) ---

/**
 * Structural subset of the gen.ts `BiomeDef` type that
 * buildBiomeCandidatePool needs. Keeps the module decoupled from the
 * full type (which lives in src/config/biomes.config.ts and is passed
 * through by gen.ts).
 */
interface BiomeLike {
  name: string;
}

/**
 * Structural subset of the gen.ts `MoodProfile` type that
 * buildBiomeCandidatePool reads. Only the modifiers map and the
 * category are accessed.
 */
interface MoodLike {
  category: string;
  modifiers: Record<string, number>;
}

interface CandidatePoolOptions {
  /** Central spawn chunks should stay meadow-readable; avoid heavy chains/structures. */
  safeZone?: boolean;
}

const SAFE_ZONE_TEMPLATE_ALLOW = new Set([
  'meadow_base', 'meadow_garden', 'dirt_clearing', 'mixed_terrain', 'forest_clearing',
  'dirt_path_ns', 'dirt_path_ew', 'path_bend_ne', 'path_t_junction', 'path_crossroads', 'path_dead_end',
  'rocky_outcrop',
  // Scene-first PR5: no free structure/enclosure WU templates in safe zone —
  // buildings + fences only via starter homestead + modular scene stamps.
]);

/**
 * Build the per-biome weighted candidate pool. Iterates over every
 * available template+rotation, assigns a base weight from
 * `BIOME_TEMPLATE_WEIGHTS[biome.name]`, then layers:
 *
 *   - Mood modifiers (#46): additive bias per template; for "sparse"
 *     mood, templates not explicitly boosted are penalized.
 *   - Biome transition: low-weight templates get a small boost when
 *     the chunk is at a biome border.
 *   - Floor at 0.005 to keep all weights positive.
 *
 * Returns a flat array (one entry per (template, rotation) pair, with
 * each entry carrying the same weight for all rotations of a given
 * template) so the downstream AC-3 / collapse passes can pick via
 * weightedSelectTemplate.
 */
export function buildBiomeCandidatePool(
  biome: BiomeLike,
  allRotations: Map<string, RotatedTemplate[]>,
  mood?: MoodLike,
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean },
  options?: CandidatePoolOptions,
): WeightedCandidate[] {
  const pool: WeightedCandidate[] = [];
  const biomeWeights = BIOME_TEMPLATE_WEIGHTS[biome.name] ?? {};
  const hasTransition = biomeTransitions && (biomeTransitions.n || biomeTransitions.s || biomeTransitions.e || biomeTransitions.w);

  for (const [templateName, rotations] of allRotations.entries()) {
    if (options?.safeZone && !SAFE_ZONE_TEMPLATE_ALLOW.has(templateName)) continue;
    // Explicit weight 0 = hard ban (scene-first free-structure ban). Must skip
    // before the 0.005 floor, or zeroed templates still leak into the pool.
    if (Object.prototype.hasOwnProperty.call(biomeWeights, templateName)
        && (biomeWeights[templateName] ?? 0) <= 0) {
      continue;
    }
    let weight = biomeWeights[templateName] ?? 0.01;

    // Apply mood modifiers (#46): additive bias from mood profile
    if (mood) {
      const mod = mood.modifiers[templateName];
      if (mod !== undefined) {
        weight += mod;
      } else if (mood.category === 'sparse') {
        // Sparse mood penalizes everything not explicitly boosted
        weight = Math.max(0.005, weight - 0.1);
      }
    }

    // Biome transition: slightly widen pool by boosting low-weight templates (#46)
    if (hasTransition && weight < 0.02) {
      weight += 0.01;
    }

    // Floor to prevent zero weights (only for non-banned entries)
    weight = Math.max(0.005, weight);

    for (const rot of rotations) {
      pool.push({ template: rot, weight });
    }
  }
  return pool;
}

/**
 * Pick the meadow_base rotation as the recovery template. Called by
 * solveWorldUnitGrid → collapseAllMRV when a slot has zero candidates
 * (contradiction after AC-3 + border constraints). The meadow is the
 * safest neutral fallback because it's the most common template and
 * has the simplest edge set.
 */
export function findFallbackTemplate(
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) return meadowRots[0];
  return null;
}

// --- Border Constraint Application (#17) ---

/**
 * Filter each border slot's candidate list against the already-solved
 * edges of the neighboring chunk. For each border direction (n/s/e/w)
 * that has a constraint, drop any candidate whose edgeTag on the
 * facing side is not edgesCompatible with the required tag, and whose
 * traversalChannel doesn't match if one was specified.
 *
 * Called from solveWorldUnitGrid (Phase 2b) before AC-3 propagation
 * so the solver starts from a state that's already consistent with
 * the neighbors' solved edges (#17 edge contracts).
 */
export function applyBorderConstraints(
  slots: SlotLike[][],
  bc: BorderConstraints,
  gridDim: number,
): void {
  // North border: our row 0 must match the south edge of the chunk above
  if (bc.n) {
    for (let gx = 0; gx < gridDim && gx < bc.n.length; gx++) {
      const requiredTag = bc.n[gx];
      const requiredTraversal = bc.nTraversal?.[gx];
      slots[0][gx].candidates = slots[0][gx].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.n, requiredTag) &&
          (requiredTraversal === undefined || c.template.traversalChannels.n === requiredTraversal),
      );
    }
  }
  // South border: our last row must match the north edge of the chunk below
  if (bc.s) {
    const lastRow = gridDim - 1;
    for (let gx = 0; gx < gridDim && gx < bc.s.length; gx++) {
      const requiredTag = bc.s[gx];
      const requiredTraversal = bc.sTraversal?.[gx];
      slots[lastRow][gx].candidates = slots[lastRow][gx].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.s, requiredTag) &&
          (requiredTraversal === undefined || c.template.traversalChannels.s === requiredTraversal),
      );
    }
  }
  // West border: our column 0 must match the east edge of the chunk to the left
  if (bc.w) {
    for (let gy = 0; gy < gridDim && gy < bc.w.length; gy++) {
      const requiredTag = bc.w[gy];
      const requiredTraversal = bc.wTraversal?.[gy];
      slots[gy][0].candidates = slots[gy][0].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.w, requiredTag) &&
          (requiredTraversal === undefined || c.template.traversalChannels.w === requiredTraversal),
      );
    }
  }
  // East border: our last column must match the west edge of the chunk to the right
  if (bc.e) {
    const lastCol = gridDim - 1;
    for (let gy = 0; gy < gridDim && gy < bc.e.length; gy++) {
      const requiredTag = bc.e[gy];
      const requiredTraversal = bc.eTraversal?.[gy];
      slots[gy][lastCol].candidates = slots[gy][lastCol].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.e, requiredTag) &&
          (requiredTraversal === undefined || c.template.traversalChannels.e === requiredTraversal),
      );
    }
  }
}

// --- AC-3 World Unit Grid Solver — Top-level Orchestration (#17) ---

/**
 * The return shape of `solveWorldUnitGrid`. Lives here (not in
 * gen.ts) because the solver is owned by this module.
 */
interface SolveResult {
  grid: (RotatedTemplate | null)[][];
  borderEdges: ChunkBorderEdges;
}

/**
 * Phase 2 of chunk generation: the AC-3 world unit grid solver
 * orchestrator. This is the public face of the AC-3 algorithm
 * implemented by 8.1–8.4 + this slice:
 *
 *   Phase 2a — initialize possibility sets
 *   Phase 2b — apply border constraints from neighboring chunks
 *   Phase 2c — build arc set and run full AC-3 propagation
 *   Phase 2d — collapse slots via MRV (which itself runs partial
 *              AC-3 propagation after each collapse)
 *   Phase 2e — enforce chain integrity (replace dangling chain
 *              features with terminators)
 *   Phase 2f — extract border edges for downstream chunks
 *
 * Returns the solved (RotatedTemplate | null)[][] grid and the
 * per-position border edge tags + traversal channels.
 *
 * Determinism invariant: every random decision here goes through
 * the passed-in `rng` (#265). Same seed → same output.
 */
export function solveWorldUnitGrid(
  biome: BiomeLike,
  rng: () => number,
  borderConstraints?: BorderConstraints,
  mood?: MoodLike,
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean },
  options?: CandidatePoolOptions,
): SolveResult {
  const allRotations = getAllRotations();
  const biomeCandidates = buildBiomeCandidatePool(biome, allRotations, mood, biomeTransitions, options);
  const fallback = findFallbackTemplate(allRotations);

  // Phase 2a: Initialize possibility sets
  const slots: SlotLike[][] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    slots[gy] = [];
    for (let gx = 0; gx < GRID_DIM; gx++) {
      slots[gy][gx] = {
        candidates: biomeCandidates.map(c => ({ ...c })),
        collapsed: null,
      };
    }
  }

  // Phase 2b: Apply border constraints from neighboring chunks
  if (borderConstraints) {
    applyBorderConstraints(slots, borderConstraints, GRID_DIM);
  }

  // Phase 2c: Build arc set and run initial AC-3 propagation
  const arcs = buildAllArcs(GRID_DIM);
  propagateAC3(slots, arcs);

  // Phase 2d: Collapse slots using MRV heuristic + propagation
  collapseAllMRV(slots, rng, fallback, arcs, GRID_DIM);

  // Build result grid
  const grid: (RotatedTemplate | null)[][] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx < GRID_DIM; gx++) {
      grid[gy][gx] = slots[gy][gx].collapsed;
    }
  }

  enforceChainIntegrity(grid, allRotations, GRID_DIM);
  const borderEdges = extractGridBorderEdges(grid, GRID_DIM);

  return { grid, borderEdges };
}

// --- Phase 3: Stamp Solved Grid onto Cells ---

function assetKeyForTemplateCell(cellKey: string): string {
  switch (cellKey) {
    case 'stone_wall': return 'wall';
    case 'wooden_fence': return 'fence';
    case 'door_gate': return 'door_locked';
    case 'troll_bridge': return 'toll_gate';
    case 'homestead_wall': return 'house';
    default: return cellKey;
  }
}

/**
 * Phase 3 of chunk generation: write the solved (RotatedTemplate|null)[][]
 * grid into the concrete CellData[][] grid. Each (gx, gy) world unit
 * template contributes a WU_SIZE × WU_SIZE block of cells.
 *
 * Micro-tile walkability from MICRO_TILE_DEFS takes precedence; falls
 * back to ASSET_DEFS. Cells without a template entry (template.cells
 * is null at that position) are left untouched.
 */
export function stampWorldUnitGrid(
  cells: CellData[][],
  grid: (RotatedTemplate | null)[][],
  gridDim: number,
  wuSize: number,
): void {
  for (let gy = 0; gy < gridDim; gy++) {
    for (let gx = 0; gx < gridDim; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      const baseX = gx * wuSize;
      const baseY = gy * wuSize;

      for (let ty = 0; ty < wuSize; ty++) {
        for (let tx = 0; tx < wuSize; tx++) {
          const cellKey = template.cells[ty]?.[tx];
          if (cellKey === null || cellKey === undefined) continue;

          const microDef = MICRO_TILE_DEFS[cellKey as TileType];
          const assetKey = assetKeyForTemplateCell(cellKey);
          const def = ASSET_DEFS[assetKey];
          cells[baseY + ty][baseX + tx] = {
            assetKey,
            walkable: microDef?.walkable ?? def?.walkable ?? true,
            interactable: def?.interactable ?? false,
          };
        }
      }
    }
  }
}

// --- Border Edge Extraction ---

/**
 * Extract per-position border EdgeTags + TraversalChannels for the
 * chunk's n/s/e/w edges. Each edge is an array of length GRID_DIM
 * (one entry per world unit slot along that border).
 *
 * Used by downstream chunks to honor #17 edge contracts — when a
 * neighbor requests a chunk, the constraint is the EdgeTag at the
 * facing border position, plus (optionally) the TraversalChannel
 * for continuous walkability (#42).
 */
export function extractGridBorderEdges(
  grid: (RotatedTemplate | null)[][],
  gridDim: number,
): ChunkBorderEdges {
  return {
    n: Array.from({ length: gridDim }, (_, gx) => grid[0]?.[gx]?.edgeTags.n ?? 'open'),
    s: Array.from({ length: gridDim }, (_, gx) => grid[gridDim - 1]?.[gx]?.edgeTags.s ?? 'open'),
    e: Array.from({ length: gridDim }, (_, gy) => grid[gy]?.[gridDim - 1]?.edgeTags.e ?? 'open'),
    w: Array.from({ length: gridDim }, (_, gy) => grid[gy]?.[0]?.edgeTags.w ?? 'open'),
    // Traversal walkability per border position (#46)
    nTraversal: Array.from({ length: gridDim }, (_, gx) => grid[0]?.[gx]?.traversalChannels.n ?? true),
    sTraversal: Array.from({ length: gridDim }, (_, gx) => grid[gridDim - 1]?.[gx]?.traversalChannels.s ?? true),
    eTraversal: Array.from({ length: gridDim }, (_, gy) => grid[gy]?.[gridDim - 1]?.traversalChannels.e ?? true),
    wTraversal: Array.from({ length: gridDim }, (_, gy) => grid[gy]?.[0]?.traversalChannels.w ?? true),
  };
}

// --- Chain Integrity (#42, extended #4) ---

/**
 * Walk every cell in the grid and check for chain features that
 * would dangle off the chunk border. For each chain feature with a
 * non-open exit at a position where the neighbor is missing (off-grid
 * or null), substitute an appropriate terminator (river_end_pond for
 * rivers, wall_end for walls, path_dead_end for paths, meadow_base
 * as the catch-all) -- or, when 2-3 of the cell's sides must stay
 * connected to real neighbors (a bend/T-junction cell), a matching
 * multi-way terminator (river_bend_ne/wall_corner/path_bend_ne,
 * river_t_junction/wall_t_junction/path_t_junction, or a straight-through
 * segment) so those other connections are preserved instead of discarded
 * (#4 -- see Docs/VisionAlignmentAudit.md Finding #4 /
 * iso2-portback-plan.md "Phase 3b/6" for the full writeup of why a
 * single-connector-only replacement silently broke multi-way shapes).
 *
 * The terminator must be edge-compatible with any already-placed
 * north/west neighbors — otherwise the chain would visually break
 * even at the chunk border.
 *
 * Called from solveWorldUnitGrid (Phase 2e). Grid dimension is
 * passed explicitly so the module stays decoupled from gen.ts's
 * GRID_DIM constant.
 */
export function enforceChainIntegrity(
  grid: (RotatedTemplate | null)[][],
  allRotations: Map<string, RotatedTemplate[]>,
  gridDim: number,
): void {
  for (let gy = 0; gy < gridDim; gy++) {
    for (let gx = 0; gx < gridDim; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      // Use chainPorts for precise chain edge detection (#42)
      // Check exits first (must connect forward); fall back to entries for legacy
      const ports = template.chainPorts;
      const dirsToCheck = ports.exits.length > 0
        ? ports.exits
        : ports.entries;
      if (dirsToCheck.length === 0) continue;

      // All off-grid directions for THIS cell (0-2 of them: 0 for an
      // interior cell, 1 for a mid-edge cell, 2 for a corner). Computed
      // once per cell -- doesn't depend on which direction is currently
      // being checked -- and passed to findTerminator so it can pick a
      // rotation whose connector avoids ALL of them, not just the one
      // direction this loop iteration happens to be processing.
      const cellOffGridDirs = (['n', 's', 'e', 'w'] as Cardinal[]).filter(d => {
        const dnx = gx + (d === 'e' ? 1 : d === 'w' ? -1 : 0);
        const dny = gy + (d === 's' ? 1 : d === 'n' ? -1 : 0);
        return dnx < 0 || dnx >= gridDim || dny < 0 || dny >= gridDim;
      });

      // #4 fix: compute the FULL set of dangling directions for this cell
      // up front -- a pure function of grid position/nullness that doesn't
      // depend on processing order -- instead of patching one direction at
      // a time. A bend/T-junction cell can have 2-3 simultaneously
      // non-open sides; fixing them one at a time (the old approach)
      // always replaced the whole cell with a 1-connector terminator on
      // the FIRST dangling direction found, discarding the cell's OTHER
      // still-valid connections regardless of how many there were.
      const needsFixDirs = dirsToCheck.filter(dir => {
        const nx = gx + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0);
        const ny = gy + (dir === 's' ? 1 : dir === 'n' ? -1 : 0);
        return nx < 0 || nx >= gridDim || ny < 0 || ny >= gridDim || !grid[ny]?.[nx];
      });
      if (needsFixDirs.length === 0) continue;

      const keepDirs = dirsToCheck.filter(d => !needsFixDirs.includes(d));
      const nTag = gy > 0 && grid[gy - 1][gx] ? grid[gy - 1][gx]!.edgeTags.s : undefined;
      const wTag = gx > 0 && grid[gy][gx - 1] ? grid[gy][gx - 1]!.edgeTags.e : undefined;
      const compatible = (r: RotatedTemplate) =>
        (!nTag || edgesCompatible(r.edgeTags.n, nTag)) &&
        (!wTag || edgesCompatible(r.edgeTags.w, wTag));

      let replacement: RotatedTemplate | undefined;
      if (keepDirs.length >= 2 && keepDirs.length <= 3) {
        // Multi-way path: 2-3 real sides to preserve (bend/T-junction).
        replacement = findMultiWayTerminatorCandidates(template.baseName, allRotations, keepDirs, cellOffGridDirs)
          .find(compatible);
      }
      if (!replacement) {
        // Single-connector path (0-1 real sides to preserve), OR the
        // multi-way search above found no compatible candidate (e.g. the
        // cell's real north AND west neighbors demand two DIFFERENT
        // non-open connections simultaneously -- a genuine corner-piece
        // gap, the same tiny dual-conflicting-neighbor residual this
        // function has always accepted as bounded-but-nonzero). Try
        // anyway so at least one dangling side gets closed rather than
        // leaving the cell completely untouched.
        const candidates = findTerminatorCandidates(template.baseName, allRotations, needsFixDirs[0], template, cellOffGridDirs);
        replacement = candidates.find(compatible);
      }
      if (replacement) {
        grid[gy][gx] = replacement;
      }
    }
  }
}

// --- Types (8.5) ---

/**
 * Structural shape of the gen.ts `WeightedCandidate` interface. The
 * full type is defined in gen.ts and re-exported through the
 * SlotLike structural subset (candidates[i] = { template, weight }).
 * This interface is kept here for documentation and as a type
 * narrowing target for the solver functions.
 */
export interface WeightedCandidate {
  template: RotatedTemplate;
  weight: number;
}

/**
 * Structural shape of the gen.ts `SlotState` interface. SlotLike
 * (file-private in this module) extends the same idea with just the
 * fields the solver functions actually read; this is the full-shape
 * alias for callers that want the canonical type.
 */
export interface SlotState {
  candidates: WeightedCandidate[];
  collapsed: RotatedTemplate | null;
}
