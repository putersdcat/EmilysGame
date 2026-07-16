/**
 * iso2-assemblies.ts — lightweight main-game bridge for Iso 2.0 macro assemblies.
 *
 * Ports experiment + V2 modular scene recipes into the ChunkData grid by
 * stamping existing asset keys. Rendering goes through tileType→nano
 * descriptors, so this module stays data-oriented.
 *
 * V2 (2026-07-15): modular catalog (farm, pond, gatehouse, bridge, church)
 * + `maybePlaceModularScenes` wired from ChunkGenerator (not debug-only).
 */

import { ASSET_DEFS } from '../config/assets.config';
import { type BiomeDef } from '../config/biomes.config';
import type { ChunkData, CellData } from '../types/game.types';
import { countWalkableNeighbors } from './world/GridUtils';
import {
  ASSEMBLY_RECIPES,
  type AssemblyPlacement,
  type AssemblyRecipe,
} from './iso2-assemblies/catalog';
import { repairSceneOpenings } from './iso2-assemblies/scene-invariants';

export { stampStarterHomestead, ensureSpawnClearance } from './iso2-assemblies/starter-homestead';
export type {
  AssemblyOpening,
  AssemblyOpeningKind,
  AssemblyPlacement,
  AssemblyRecipe,
} from './iso2-assemblies/catalog';
export {
  FUNCTIONAL_OPENING_KEYS,
  PATH_OPENING_KEYS,
  repairSceneOpenings,
  scanAndRepairFenceGaps,
  validateSceneOpenings,
} from './iso2-assemblies/scene-invariants';
export type {
  SceneOpeningValidation,
  SceneOpeningViolation,
} from './iso2-assemblies/scene-invariants';

export type Iso2AssemblyId =
  | 'homestead-small'
  | 'ruined-cathedral'
  | 'fenced-farm'
  | 'pond-clearing'
  | 'gatehouse'
  | 'bridge-crossing'
  | 'church-graveyard';

// ─── Legacy / landmark blueprints (Slice A) ───────────────────────────────

const HOMESTEAD_SMALL: readonly AssemblyPlacement[] = [
  { x: 0, y: 0, assetKey: 'fence' }, { x: 1, y: 0, assetKey: 'fence' }, { x: 2, y: 0, assetKey: 'fence' }, { x: 3, y: 0, assetKey: 'fence' }, { x: 4, y: 0, assetKey: 'fence' },
  { x: 0, y: 1, assetKey: 'fence' }, { x: 4, y: 1, assetKey: 'fence' },
  { x: 0, y: 2, assetKey: 'fence' }, { x: 2, y: 2, assetKey: 'house' }, { x: 4, y: 2, assetKey: 'fence' },
  { x: 0, y: 3, assetKey: 'fence' }, { x: 4, y: 3, assetKey: 'fence' },
  { x: 0, y: 4, assetKey: 'fence' }, { x: 1, y: 4, assetKey: 'fence' }, { x: 2, y: 4, assetKey: 'door_locked' }, { x: 3, y: 4, assetKey: 'fence' }, { x: 4, y: 4, assetKey: 'fence' },
];

const RUINED_CATHEDRAL: readonly AssemblyPlacement[] = [
  { x: 0, y: 0, assetKey: 'cathedral_wall' }, { x: 1, y: 0, assetKey: 'cathedral_wall' }, { x: 2, y: 0, assetKey: 'cathedral_wall' },
  { x: 0, y: 1, assetKey: 'cathedral_wall' }, { x: 2, y: 1, assetKey: 'cathedral_wall' },
  { x: 0, y: 2, assetKey: 'wall' }, { x: 2, y: 2, assetKey: 'wall' },
  { x: 0, y: 3, assetKey: 'stone_floor' }, { x: 1, y: 3, assetKey: 'stone_floor' }, { x: 2, y: 3, assetKey: 'stone_floor' },
  { x: 0, y: 4, assetKey: 'wall' }, { x: 2, y: 4, assetKey: 'wall' },
];

const LEGACY_RECIPES: Record<'homestead-small' | 'ruined-cathedral', AssemblyRecipe> = {
  'homestead-small': {
    id: 'homestead-small',
    width: 5,
    height: 5,
    placements: HOMESTEAD_SMALL,
    openings: [{ x: 2, y: 4, kind: 'door_locked' }],
  },
  'ruined-cathedral': { id: 'ruined-cathedral', width: 3, height: 5, placements: RUINED_CATHEDRAL },
};

function recipeFor(id: Iso2AssemblyId): AssemblyRecipe {
  if (id === 'homestead-small' || id === 'ruined-cathedral') return LEGACY_RECIPES[id];
  const r = ASSEMBLY_RECIPES[id];
  if (!r) throw new Error(`Unknown Iso2 assembly id: ${id}`);
  return r;
}

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

/** Shared stamp loop — out-of-bounds placements skipped; openings repaired after stamp. */
export function stampAssemblyOntoCells(
  cells: CellData[][],
  id: Iso2AssemblyId,
  originX: number,
  originY: number,
): void {
  const recipe = recipeFor(id);
  for (const p of recipe.placements) {
    const x = originX + p.x;
    const y = originY + p.y;
    if (y < 0 || y >= cells.length || x < 0 || x >= cells[y].length) continue;
    cells[y][x] = makeCell(p);
  }
  // Scene law: declared openings must be functional gates or explicit paths.
  repairSceneOpenings(cells, originX, originY, recipe);
}

/** Stamp an assembly into one already-loaded main-game chunk. */
export function stampIso2Assembly(
  chunk: ChunkData,
  id: Iso2AssemblyId,
  originX: number,
  originY: number,
): void {
  stampAssemblyOntoCells(chunk.cells, id, originX, originY);
}

// --- Landmark placement (Slice E "Step 2") ---------------------------------

const LANDMARK_ELIGIBLE_TERRAIN = new Set(['grass', 'dirt', 'sand', 'stone_floor']);
const LANDMARK_MARGIN = 3;
const LANDMARK_CHANCE = 0.125;
const CATHEDRAL_VS_KEEP_CHANCE = 0.4;

/** Hard structures that modular scenes must never overwrite. */
const MODULAR_BLOCKING = new Set([
  'water', 'wall', 'fence', 'wooden_fence', 'stone_wall', 'door_locked', 'door_open',
  'door_gate', 'quiz_gate', 'toll_gate', 'barricade', 'bridge', 'house', 'hut',
  'shop', 'campfire', 'bonfire', 'chest', 'sign', 'rock', 'tree', 'tree_pine',
  'tree_palm', 'bush', 'cathedral_wall', 'castle_keep', 'starter_cottage',
]);

function isFootprintClear(cells: CellData[][], x: number, y: number, w: number, h: number): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const cell = cells[y + dy]?.[x + dx];
      if (!cell || !LANDMARK_ELIGIBLE_TERRAIN.has(cell.assetKey) || cell.itemId || cell.npcId) return false;
    }
  }
  return true;
}

/**
 * Modular scenes may overwrite soft walkable decoration (flowers, wheat,
 * chickens, etc.) — meadow Perlin fills those heavily, so requiring bare
 * grass/dirt made farms never land. Still never stomps structures/items.
 */
function isModularFootprintClear(cells: CellData[][], x: number, y: number, w: number, h: number): boolean {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const cell = cells[y + dy]?.[x + dx];
      if (!cell || cell.itemId || cell.npcId) return false;
      if (MODULAR_BLOCKING.has(cell.assetKey)) return false;
      if (cell.assetKey.startsWith('shop_') || cell.assetKey.startsWith('wooden_fence')) return false;
      // Non-walkable leftovers (unknown solids) are blocked
      if (!cell.walkable && cell.assetKey !== 'grass') return false;
    }
  }
  return true;
}

function findClearFootprint(
  cells: CellData[][],
  size: number,
  w: number,
  h: number,
  rng: () => number,
): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = LANDMARK_MARGIN; y <= size - LANDMARK_MARGIN - h; y++) {
    for (let x = LANDMARK_MARGIN; x <= size - LANDMARK_MARGIN - w; x++) {
      if (isFootprintClear(cells, x, y, w, h)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

function findClearSingleCell(
  cells: CellData[][],
  size: number,
  rng: () => number,
): { x: number; y: number } | null {
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
 * Rare castle-biome landmark (ruined cathedral or castle keep).
 * No-op for other biomes / starter ring.
 */
export function maybePlaceCastleLandmark(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  chunkDist: number,
  rng: () => number,
): void {
  if (biome.name !== 'castle') return;
  if (chunkDist <= 2) return;
  if (rng() >= LANDMARK_CHANCE) return;

  if (rng() < CATHEDRAL_VS_KEEP_CHANCE) {
    const origin = findClearFootprint(cells, size, 3, 5, rng);
    if (origin) {
      stampAssemblyOntoCells(cells, 'ruined-cathedral', origin.x, origin.y);
      return;
    }
  }

  const spot = findClearSingleCell(cells, size, rng);
  if (!spot) return;
  const def = ASSET_DEFS.castle_keep;
  cells[spot.y][spot.x] = {
    assetKey: 'castle_keep',
    walkable: def.walkable,
    interactable: def.interactable,
  };
}

// --- V2 modular scenes (meadow / forest / castle) --------------------------

/** Overall chance a non-origin chunk attempts a modular scene stamp (S5: slightly higher structure language). */
const MODULAR_SCENE_CHANCE = 0.34;

/**
 * Per-biome weighted recipe table. Weights are relative among candidates
 * for that biome; only one scene is stamped per successful chance roll.
 */
const BIOME_SCENE_WEIGHTS: Record<string, Partial<Record<Iso2AssemblyId, number>>> = {
  meadow: {
    'fenced-farm': 0.40,
    'pond-clearing': 0.25,
    'bridge-crossing': 0.20,
    'church-graveyard': 0.15,
  },
  forest: {
    'pond-clearing': 0.45,
    'bridge-crossing': 0.35,
    'church-graveyard': 0.20,
  },
  castle: {
    gatehouse: 0.55,
    'church-graveyard': 0.25,
    'bridge-crossing': 0.20,
  },
};

function weightedPickId(
  weights: Partial<Record<Iso2AssemblyId, number>>,
  rng: () => number,
): Iso2AssemblyId | null {
  const entries = Object.entries(weights) as Array<[Iso2AssemblyId, number]>;
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const [id, w] of entries) {
    roll -= w;
    if (roll <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

/**
 * Phase 5.x (V2): stamp at most one modular scene assembly into this chunk.
 * Skips origin safe ring (chunkDist ≤ 1). Castle still uses
 * {@link maybePlaceCastleLandmark} separately for rare big landmarks.
 *
 * If the weighted pick cannot find a clear footprint, remaining weighted
 * candidates are tried (so a huge farm does not silently waste the roll).
 *
 * Returns the placed assembly id, or null if nothing stamped (for tests).
 */
export function maybePlaceModularScenes(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  chunkDist: number,
  rng: () => number,
): Iso2AssemblyId | null {
  if (chunkDist <= 1) return null;
  const weights = BIOME_SCENE_WEIGHTS[biome.name];
  if (!weights) return null;
  if (rng() >= MODULAR_SCENE_CHANCE) return null;

  const primary = weightedPickId(weights, rng);
  if (!primary) return null;

  // Try primary first, then other candidates by descending weight.
  const ordered = Object.entries(weights)
    .sort((a, b) => b[1]! - a[1]!)
    .map(([id]) => id as Iso2AssemblyId);
  const tryOrder = [primary, ...ordered.filter((id) => id !== primary)];

  for (const id of tryOrder) {
    const recipe = recipeFor(id);
    const origin = findModularFootprint(cells, size, recipe.width, recipe.height, rng);
    if (!origin) continue;
    stampAssemblyOntoCells(cells, id, origin.x, origin.y);
    return id;
  }
  return null;
}

function findModularFootprint(
  cells: CellData[][],
  size: number,
  w: number,
  h: number,
  rng: () => number,
): { x: number; y: number } | null {
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = LANDMARK_MARGIN; y <= size - LANDMARK_MARGIN - h; y++) {
    for (let x = LANDMARK_MARGIN; x <= size - LANDMARK_MARGIN - w; x++) {
      if (isModularFootprintClear(cells, x, y, w, h)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}

/** Test helper: list modular recipe ids available for a biome. */
export function modularSceneIdsForBiome(biomeName: string): Iso2AssemblyId[] {
  const w = BIOME_SCENE_WEIGHTS[biomeName];
  if (!w) return [];
  return Object.keys(w) as Iso2AssemblyId[];
}
