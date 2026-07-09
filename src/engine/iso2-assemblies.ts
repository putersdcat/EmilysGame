/**
 * iso2-assemblies.ts — lightweight main-game bridge for Iso 2.0 macro assemblies.
 *
 * Ports the experiment's first assembly layouts into the v1 ChunkData grid by
 * stamping existing asset keys. Rendering then goes through tileType→nano
 * descriptors, so this module stays data-oriented and avoids renderer logic.
 */

import { ASSET_DEFS } from '../config/assets.config';
import { type BiomeDef } from '../config/biomes.config';
import type { ChunkData, CellData } from '../types/game.types';
import { countWalkableNeighbors } from './world/GridUtils';
export { stampStarterHomestead, ensureSpawnClearance } from './iso2-assemblies/starter-homestead';

export type Iso2AssemblyId = 'homestead-small' | 'ruined-cathedral';

interface AssemblyPlacement {
  readonly x: number;
  readonly y: number;
  readonly assetKey: string;
  readonly itemId?: string;
  readonly npcId?: string;
}

const HOMESTEAD_SMALL: readonly AssemblyPlacement[] = [
  // 5×5 fence perimeter, gate on south edge, house core.
  { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' }, { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' },
  { x: 0, y: 1, assetKey: 'fence' }, { x: 4, y: 1, assetKey: 'fence' },
  { x: 0, y: 2, assetKey: 'fence' }, { x: 2, y: 2, assetKey: 'house' }, { x: 4, y: 2, assetKey: 'fence' },
  { x: 0, y: 3, assetKey: 'fence' }, { x: 4, y: 3, assetKey: 'fence' },
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'fence' }, { x: 2, y: 4, assetKey: 'door_locked' }, { x: 3, y: 4, assetKey: 'fence' }, { x: 4, y: 4, assetKey: 'fence' },
];

const RUINED_CATHEDRAL: readonly AssemblyPlacement[] = [
  // 3×5 ruined-column footprint with a tall central spire-ish wall.
  { x: 0, y: 0, assetKey: 'cathedral_wall' }, { x: 1, y: 0, assetKey: 'cathedral_wall' }, { x: 2, y: 0, assetKey: 'cathedral_wall' },
  { x: 0, y: 1, assetKey: 'cathedral_wall' }, { x: 2, y: 1, assetKey: 'cathedral_wall' },
  { x: 0, y: 2, assetKey: 'wall' },           { x: 2, y: 2, assetKey: 'wall' },
  { x: 0, y: 3, assetKey: 'stone_floor' },    { x: 1, y: 3, assetKey: 'stone_floor' }, { x: 2, y: 3, assetKey: 'stone_floor' },
  { x: 0, y: 4, assetKey: 'wall' },           { x: 2, y: 4, assetKey: 'wall' },
];

function makeCell(placement: AssemblyPlacement): CellData {
  const { assetKey } = placement;
  const def = ASSET_DEFS[assetKey];
  if (!def) throw new Error(`Unknown assembly asset: ${assetKey}`);
  return {
    assetKey,
    walkable: def.walkable,
    interactable: def.interactable,
    itemId: placement.itemId,
    npcId: placement.npcId,
    npcFacing: placement.npcId ? 'south' : undefined,
  };
}

function placementsFor(id: Iso2AssemblyId): readonly AssemblyPlacement[] {
  switch (id) {
    case 'homestead-small': return HOMESTEAD_SMALL;
    case 'ruined-cathedral': return RUINED_CATHEDRAL;
  }
}

/** Shared stamp loop — operates directly on a raw cell grid (out-of-bounds placements skipped). */
function stampAssemblyOntoCells(cells: CellData[][], id: Iso2AssemblyId, originX: number, originY: number): void {
  for (const p of placementsFor(id)) {
    const x = originX + p.x;
    const y = originY + p.y;
    if (y < 0 || y >= cells.length || x < 0 || x >= cells[y].length) continue;
    cells[y][x] = makeCell(p);
  }
}

/** Stamp an assembly into one already-loaded main-game chunk. Out-of-bounds placements are skipped. */
export function stampIso2Assembly(chunk: ChunkData, id: Iso2AssemblyId, originX: number, originY: number): void {
  stampAssemblyOntoCells(chunk.cells, id, originX, originY);
}

// --- Landmark placement (Slice E "Step 2", #iso2-portback) -----------------
//
// `stampIso2Assembly`/RUINED_CATHEDRAL above were fully built (Slice A port)
// but, until now, only ever invoked from the debug API
// (`window.__gameDebug.stampIso2Assembly`) -- never from real procedural
// generation. `castle_keep`/`cathedral_chapel` (single-cell nano "proof"
// assets, src/config/assets.config.ts) were ALSO never placed anywhere real.
// This closes that gap for the 'castle' biome only:
//   - no other biome has an authored landmark asset today (meadow already
//     has the starter homestead near spawn; forest/cave have none), and
//   - WorldEngine-05's biome-character section explicitly describes castle
//     as "structured rooms and corridors... best rewards behind the hardest
//     challenges", which matches a rare architectural landmark well.
// `cathedral_chapel` (the single-cell nano proof) is deliberately NOT wired
// here -- it thematically overlaps with RUINED_CATHEDRAL's multi-cell ruin
// (both are "a cathedral"), and picking a canonical design between the two
// is a product decision, not a safe unilateral call. `castle_keep` doesn't
// have that conflict (no other "keep" content exists), so it's used as the
// lower-footprint alternative to the ruin. See iso2-portback-plan.md's
// Slice E "Step 2" entry for the full writeup.

/** Terrain kinds a landmark is allowed to overwrite (mirrors ObstacleSolver's addExtraObstacles eligibility set). */
const LANDMARK_ELIGIBLE_TERRAIN = new Set(['grass', 'dirt', 'sand', 'stone_floor']);

/** Stay clear of chunk edges (cross-chunk border stitching lives in the outer ring). */
const LANDMARK_MARGIN = 3;

/** ~1 in 8 eligible castle-biome chunks gets a landmark -- rare, not a grid. */
const LANDMARK_CHANCE = 0.125;

/** Of the chunks that DO get a landmark, this fraction try the bigger ruin first. */
const CATHEDRAL_VS_KEEP_CHANCE = 0.4;

/** True if every cell in the w×h rect at (x,y) is plain, unoccupied terrain. */
function isFootprintClear(cells: CellData[][], x: number, y: number, w: number, h: number): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const cell = cells[y + dy]?.[x + dx];
      if (!cell || !LANDMARK_ELIGIBLE_TERRAIN.has(cell.assetKey) || cell.itemId || cell.npcId) return false;
    }
  }
  return true;
}

/** Collect every valid top-left origin for a w×h footprint, margin-clamped. */
function findClearFootprint(cells: CellData[][], size: number, w: number, h: number, rng: () => number): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = LANDMARK_MARGIN; y <= size - LANDMARK_MARGIN - h; y++) {
    for (let x = LANDMARK_MARGIN; x <= size - LANDMARK_MARGIN - w; x++) {
      if (isFootprintClear(cells, x, y, w, h)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Single clear cell with enough clearance that dropping a solid keep on it can't seal a corridor. */
function findClearSingleCell(cells: CellData[][], size: number, rng: () => number): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = LANDMARK_MARGIN; y < size - LANDMARK_MARGIN; y++) {
    for (let x = LANDMARK_MARGIN; x < size - LANDMARK_MARGIN; x++) {
      if (!isFootprintClear(cells, x, y, 1, 1)) continue;
      if (countWalkableNeighbors(cells, x, y, size) < 3) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Phase 5.x: maybe stamp a rare castle-biome landmark (ruined cathedral or
 * castle keep) using already-built, already-tested assembly content that
 * had no real placement call site before this. No-op for every other biome,
 * the starter safe zone, and (probabilistically) most eligible chunks --
 * see the module-header comment above for the full reasoning.
 *
 * Must run BEFORE the existing Phase 6/7/8 safety net (balanceObstacles /
 * enforcePassability / validatePlayability) so a landmark that happens to
 * land across a needed route still gets repaired the same way any other
 * Phase-5.x placement does.
 */
export function maybePlaceCastleLandmark(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  chunkDist: number,
  rng: () => number,
): void {
  if (biome.name !== 'castle') return;
  if (chunkDist <= 2) return; // keep landmarks out of the starter safe zone + its immediate ring
  if (rng() >= LANDMARK_CHANCE) return;

  if (rng() < CATHEDRAL_VS_KEEP_CHANCE) {
    const origin = findClearFootprint(cells, size, 3, 5, rng);
    if (origin) {
      stampAssemblyOntoCells(cells, 'ruined-cathedral', origin.x, origin.y);
      return;
    }
    // No clear 3x5 rect this chunk -- fall through and try the single-cell keep instead.
  }

  const spot = findClearSingleCell(cells, size, rng);
  if (!spot) return;
  const def = ASSET_DEFS.castle_keep;
  cells[spot.y][spot.x] = { assetKey: 'castle_keep', walkable: def.walkable, interactable: def.interactable };
}
