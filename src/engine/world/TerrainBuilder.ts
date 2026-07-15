/**
 * TerrainBuilder.ts — Phase 1 of chunk generation: Perlin noise base terrain.
 *
 * Builds the initial CellData[][] grid from Perlin noise channels + biome
 * weights + climate affinity. This is the foundation that the AC-3 world
 * unit grid solver (WorldUnitSolver.ts) stamps onto in Phase 3.
 *
 * B5 micro-slice 9.1 (#253): extracted from gen.ts. The three functions
 * (buildPerlinBase, assignTerrainCell, findClimateCompatibleTile) form
 * a cohesive unit — they all operate on the base terrain layer before
 * any solver/population work happens.
 *
 * Invariants protected:
 *   - #101: climate-based tile affinity (biome-aware palette mapping)
 *   - #265: determinism via seeded Perlin noise (no Math.random())
 *   - #261: spatial coherence via low-frequency noise channels
 *
 * @see WorldEngine-04-RenderingPipeline.md (Phase 1: base terrain)
 */

import { WORLD_CONFIG } from '../../config/game.config';
import { ASSET_DEFS } from '../../config/assets.config';
import { type BiomeDef } from '../../config/biomes.config';
import { tileMatchesClimate } from '../../config/tiles.config';
import type { TileType } from '../../rendering/tiles';
import { PerlinNoise, weightedPick } from '../utils';
import { getChunkClimate } from './BiomeSelector';
import type { CellData } from '../../types/game.types';

// --- Phase 1: Perlin Noise Base Terrain ---

/** Base ground surfaces that participate in V1 patch-coherence (not flowers/animals). */
const CORE_SURFACES = new Set(['grass', 'dirt', 'sand', 'stone_floor', 'path']);
/** Surfaces that look wrong as single-cell salt and should join a neighbor patch. */
const SALT_PRONE = new Set(['dirt', 'sand']);

/**
 * Structural assetKeys that look wrong as lone posts (V1.3 chain-aware feel).
 * Barricades / locked doors are intentional single cells and are not listed.
 */
const ORPHAN_STRUCTURES = new Set(['fence', 'wooden_fence', 'wall', 'stone_wall']);

/** Roof tiles must only appear as part of authored assemblies (V3 S2). */
const ROOF_SHARDS = new Set([
  'starter_roof_left',
  'starter_roof_right',
  'starter_roof_ridge',
  'roof_thatch_slope_left',
  'roof_thatch_slope_right',
  'roof_thatch_ridge',
]);

function structureFamily(assetKey: string): 'fence' | 'wall' | null {
  if (
    assetKey === 'fence' ||
    assetKey === 'wooden_fence' ||
    assetKey.startsWith('wooden_fence_')
  ) {
    return 'fence';
  }
  if (
    assetKey === 'wall' ||
    assetKey === 'stone_wall' ||
    assetKey.startsWith('stone_wall_') ||
    assetKey === 'starter_wall_plaster'
  ) {
    return 'wall';
  }
  return null;
}

/**
 * Build the initial CellData[][] grid from Perlin noise channels.
 *
 * Three noise channels:
 *   1. density (freq 0.1) — terrain vs obstacle vs water classification
 *   2. terrainTypeNoise (freq 0.028) — spatially coherent terrain type selection
 *   3. obstacleTypeNoise (freq 0.04) — spatially coherent obstacle selection
 *
 * The low-frequency terrain channel replaces Math.random() so nearby cells
 * get the same terrain type → larger coherent patches (#261 coherence,
 * #265 determinism). V1 (2026-07-15) lowered terrain freq 0.04→0.028 and
 * runs {@link cohereSurfacePatches} to kill isolated dirt/sand salt cells.
 *
 * Climate affinity (#101): if the biome-weighted pick doesn't match the
 * chunk climate, try an alternative terrain that does. Falls back
 * gracefully if no climate-matching tile exists.
 */
export function buildPerlinBase(
  size: number,
  noiseSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
): CellData[][] {
  const perlin = new PerlinNoise(noiseSeed);
  // Second noise channel at lower frequency for spatially coherent terrain type selection.
  // This replaces Math.random() so nearby cells get the same terrain type → larger patches.
  const terrainTypeNoise = new PerlinNoise(noiseSeed + 7777);
  // Third channel for obstacle selection — deterministic + spatially coherent so obstacles
  // form patches instead of unseeded random scatter (#265 determinism, #261 coherence).
  const obstacleTypeNoise = new PerlinNoise(noiseSeed + 9999);
  const cells: CellData[][] = [];
  // #101: chunk climate for tile affinity scoring
  const climate = getChunkClimate(chunkX, chunkY);

  for (let y = 0; y < size; y++) {
    cells[y] = [];
    for (let x = 0; x < size; x++) {
      const gx = chunkX * size + x;
      const gy = chunkY * size + y;
      const density = perlin.noise100(gx * 0.1, gy * 0.1);
      // V1: 0.028 → larger coherent patches than 0.04 (less checkerboard salt)
      const typeNoise = terrainTypeNoise.noise100(gx * 0.028, gy * 0.028) / 100;
      const obstacleNoise = obstacleTypeNoise.noise100(gx * 0.04, gy * 0.04) / 100;
      cells[y][x] = assignTerrainCell(density, biome, typeNoise, climate, obstacleNoise);
    }
  }
  cohereSurfacePatches(cells, size);
  return cells;
}

/**
 * V1 surface language: reassign true salt cells (isolated dirt/sand) to the
 * majority neighboring core surface (usually grass).
 *
 * Rules (deliberately permissive for paths/shores):
 * - dirt: only rewrite when it has **zero** same-type neighbors (path ends OK)
 * - sand: rewrite when zero same-type neighbors **and** not next to water
 *   (shore rings keep; lone meadow sand dies)
 *
 * Safe to run after WU stamping. Deterministic two-pass (no mid-scan cascade).
 */
export function cohereSurfacePatches(cells: CellData[][], size: number): void {
  const rewrites: Array<{ x: number; y: number; assetKey: string }> = [];
  const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = cells[y][x].assetKey;
      if (!SALT_PRONE.has(key)) continue;

      let same = 0;
      let nextToWater = false;
      const neighborCounts = new Map<string, number>();
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nk = cells[ny][nx].assetKey;
        if (nk === key) same++;
        if (nk === 'water') nextToWater = true;
        if (CORE_SURFACES.has(nk)) {
          neighborCounts.set(nk, (neighborCounts.get(nk) ?? 0) + 1);
        }
      }

      // Dirt path ends (1 neighbor) are fine; only pure salt (0) rewrites
      if (key === 'dirt' && same >= 1) continue;
      // Sand shore rings / pairs stay; lone sand not touching water rewrites
      if (key === 'sand') {
        if (same >= 1) continue;
        if (nextToWater) continue;
      }

      let best = 'grass';
      let bestN = -1;
      for (const [nk, n] of neighborCounts) {
        if (nk === key) continue;
        if (n > bestN) {
          bestN = n;
          best = nk;
        }
      }
      if (best !== key) rewrites.push({ x, y, assetKey: best });
    }
  }

  for (const r of rewrites) {
    const def = ASSET_DEFS[r.assetKey];
    const prev = cells[r.y][r.x];
    cells[r.y][r.x] = {
      ...prev,
      assetKey: r.assetKey,
      walkable: def?.walkable ?? true,
      // Keep interactable if the cell still has an item/NPC; else follow new surface
      interactable: !!(prev.itemId || prev.npcId) || (def?.interactable ?? false),
    };
  }
}

/**
 * V1.3: remove lone fence/wall posts that are not part of a run (0 same-family
 * 4-neighbors). Continuous fence_row / wall_segment stamps keep their runs;
 * Perlin obstacle salt dies. Deterministic; rewrites to grass.
 */
export function removeOrphanStructures(cells: CellData[][], size: number): void {
  const rewrites: Array<{ x: number; y: number }> = [];
  const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = cells[y][x].assetKey;
      if (!ORPHAN_STRUCTURES.has(key)) continue;
      const fam = structureFamily(key);
      if (!fam) continue;

      let sameFamily = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (structureFamily(cells[ny][nx].assetKey) === fam) sameFamily++;
      }
      if (sameFamily === 0) rewrites.push({ x, y });
    }
  }

  const grassDef = ASSET_DEFS['grass'];
  for (const r of rewrites) {
    const prev = cells[r.y][r.x];
    // Don't erase if something gameplay-critical was attached
    if (prev.itemId || prev.npcId) continue;
    cells[r.y][r.x] = {
      assetKey: 'grass',
      walkable: grassDef?.walkable ?? true,
      interactable: grassDef?.interactable ?? false,
    };
  }
}

/**
 * V3: strip lone water cells (0 same-type neighbors) that read as accidental
 * tanks / salt pools. River runs and multi-cell ponds keep (same ≥ 1).
 * Rewrites to majority neighboring core surface (grass default).
 */
export function removeOrphanWater(cells: CellData[][], size: number): void {
  const rewrites: Array<{ x: number; y: number; assetKey: string }> = [];
  const dirs: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey !== 'water') continue;
      let same = 0;
      const neighborCounts = new Map<string, number>();
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nk = cells[ny][nx].assetKey;
        if (nk === 'water') same++;
        if (CORE_SURFACES.has(nk)) neighborCounts.set(nk, (neighborCounts.get(nk) ?? 0) + 1);
      }
      if (same >= 1) continue;

      let best = 'grass';
      let bestN = -1;
      for (const [nk, n] of neighborCounts) {
        if (n > bestN) {
          bestN = n;
          best = nk;
        }
      }
      rewrites.push({ x, y, assetKey: best });
    }
  }

  for (const r of rewrites) {
    const def = ASSET_DEFS[r.assetKey];
    const prev = cells[r.y][r.x];
    if (prev.itemId || prev.npcId) continue;
    cells[r.y][r.x] = {
      assetKey: r.assetKey,
      walkable: def?.walkable ?? true,
      interactable: def?.interactable ?? false,
    };
  }
}

/**
 * V3 S2: roofs are assembly-only. Strip any free-floating roof shard tiles
 * that may have been stamped by entropy/legacy weights (starter cottage uses
 * integrated nano roof, not these cell keys).
 */
export function stripOrphanRoofShards(cells: CellData[][], size: number): void {
  const grassDef = ASSET_DEFS['grass'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!ROOF_SHARDS.has(cells[y][x].assetKey)) continue;
      const prev = cells[y][x];
      if (prev.itemId || prev.npcId) continue;
      cells[y][x] = {
        assetKey: 'grass',
        walkable: grassDef?.walkable ?? true,
        interactable: grassDef?.interactable ?? false,
      };
    }
  }
}

/**
 * Assign a terrain cell based on density, biome, and noise.
 * #101: Climate affinity check — if the biome-weighted pick doesn't match
 * the chunk climate, try the alternative terrain to find one that does.
 * Falls back gracefully if no climate-matching tile exists.
 */
function assignTerrainCell(
  density: number,
  biome: BiomeDef,
  typeNoise: number,
  climate?: { moisture: number; temperature: number },
  obstacleNoise?: number,
): CellData {
  const { terrain, obstacle } = WORLD_CONFIG.density;

  if (density <= terrain.max) {
    let assetKey = weightedPick(biome.terrainWeights, typeNoise);
    // #101: climate-based tile affinity filtering
    if (climate && !tileMatchesClimate(assetKey as TileType, climate.moisture, climate.temperature)) {
      // Try a climate-compatible alternative from same biome terrain pool
      const altKey = findClimateCompatibleTile(biome.terrainWeights, climate);
      if (altKey) assetKey = altKey;
    }
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? true, interactable: false };
  } else if (density <= obstacle.max) {
    // #265: deterministic, spatially-coherent obstacle pick (was Math.random()).
    const assetKey = weightedPick(biome.obstacleWeights, obstacleNoise ?? typeNoise);
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? false, interactable: def?.interactable ?? false };
  } else {
    let assetKey = weightedPick(biome.terrainWeights, typeNoise);
    if (climate && !tileMatchesClimate(assetKey as TileType, climate.moisture, climate.temperature)) {
      const altKey = findClimateCompatibleTile(biome.terrainWeights, climate);
      if (altKey) assetKey = altKey;
    }
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? true, interactable: false };
  }
}

/**
 * Search biome terrain weights for a tile that matches the given climate.
 * Returns the first climate-compatible tile, or null if none match.
 * #101: biome-aware palette mapping via climate metadata.
 */
function findClimateCompatibleTile(
  terrainWeights: Record<string, number>,
  climate: { moisture: number; temperature: number },
): string | null {
  for (const key of Object.keys(terrainWeights)) {
    if (tileMatchesClimate(key as TileType, climate.moisture, climate.temperature)) {
      return key;
    }
  }
  return null; // No climate match → caller falls back to original pick
}
