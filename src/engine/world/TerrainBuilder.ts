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

/**
 * Build the initial CellData[][] grid from Perlin noise channels.
 *
 * Three noise channels:
 *   1. density (freq 0.1) — terrain vs obstacle vs water classification
 *   2. terrainTypeNoise (freq 0.04) — spatially coherent terrain type selection
 *   3. obstacleTypeNoise (freq 0.04) — spatially coherent obstacle selection
 *
 * The low-frequency channels (0.04) replace Math.random() so nearby cells
 * get the same terrain type → larger coherent patches (#261 coherence,
 * #265 determinism).
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
      // Low-frequency noise (0.04) → large coherent patches of same terrain type
      const typeNoise = terrainTypeNoise.noise100(gx * 0.04, gy * 0.04) / 100;
      const obstacleNoise = obstacleTypeNoise.noise100(gx * 0.04, gy * 0.04) / 100;
      cells[y][x] = assignTerrainCell(density, biome, typeNoise, climate, obstacleNoise);
    }
  }
  return cells;
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
