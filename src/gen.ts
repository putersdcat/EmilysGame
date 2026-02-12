/**
 * gen.ts - World generation system.
 * Converts LLM entropy into chunk data via hashing and Perlin noise.
 * Enforces playability rules (BFS passability, item/obstacle balance).
 */

import { WORLD_CONFIG } from './config/game.config';
import { ASSET_DEFS } from './config/assets.config';
import { getBiome, type BiomeDef } from './config/biomes.config';
import {
  sha256,
  fastHash,
  hexToInt,
  asciiModulo,
  seededRandom,
  PerlinNoise,
  bfsFloodFill,
  weightedPick,
} from './utils';
import { expandEntropy } from './llm';
import { DIRECTION_WORDS } from './config/entropy.config';

// ─── Types ───────────────────────────────────────────────────

export interface CellData {
  assetKey: string;       // Key into ASSET_DEFS
  walkable: boolean;
  interactable: boolean;
  npcId?: string;         // NPC persona ID (if NPC cell)
  itemId?: string;        // Collectible item ID
  resolved?: boolean;     // True if obstacle has been solved
}

export interface ChunkData {
  chunkX: number;         // Chunk grid coordinate
  chunkY: number;
  biomeId: number;
  cells: CellData[][];    // [y][x] 2D array, size = chunkSize × chunkSize
  seed: string;           // The entropy string used to generate this chunk
  generated: boolean;
}

// ─── Entropy State ───────────────────────────────────────────

/** Session wordlist (filled on game init from LLM or fallback) */
let wordlist: string[] = [];
let lastEntropyOutput = '';
let entropyBuffer = '';

export function setWordlist(list: string[]): void {
  wordlist = list;
}

export function getWordlist(): string[] {
  return wordlist;
}

// ─── Direction → Pair Mapping ────────────────────────────────

/**
 * Get a verb-noun pair from the player's movement direction.
 * Direction: 'up' | 'down' | 'left' | 'right'
 */
export function getDirectionPair(direction: string, rng: () => number): string {
  const table = DIRECTION_WORDS[direction] || DIRECTION_WORDS['right'];
  const verb = table.verbs[Math.floor(rng() * table.verbs.length)];
  const noun = table.nouns[Math.floor(rng() * table.nouns.length)];
  return `${verb} ${noun}`;
}

// ─── Chunk Generation ────────────────────────────────────────

/**
 * Generate a chunk at (chunkX, chunkY) using entropy from the wordlist.
 * This is the main entry point for world generation.
 *
 * Process:
 * 1. Pick wordlist pair based on chunk coords
 * 2. Expand pair to nonsense sentence via LLM (or fallback)
 * 3. Hash sentence to numerical seeds
 * 4. Use Perlin noise + seeds to build density map
 * 5. Assign cell types from biome weights
 * 6. Place features (NPCs, chests, collectibles)
 * 7. Enforce playability rules (BFS passability, key/door balance)
 */
export async function generateChunk(
  chunkX: number,
  chunkY: number,
): Promise<ChunkData> {
  const size = WORLD_CONFIG.chunkSize;

  // Step 1: Pick wordlist pair for this chunk
  const pairIndex = Math.abs(fastHash(`${chunkX},${chunkY}`)) % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';

  // Step 2: Expand via LLM (async, with fallback)
  const entropyText = await expandEntropy(pair, lastEntropyOutput);
  lastEntropyOutput = entropyText;
  entropyBuffer += entropyText;

  // Step 3: Hash to numerical seeds
  const hashHex = await sha256(entropyText);
  const biomeSeed = hexToInt(hashHex.slice(0, 8), WORLD_CONFIG.biomeCount - 1);
  const noiseSeed = fastHash(hashHex.slice(8, 16));
  const featureSeed = fastHash(hashHex.slice(16, 24));

  // Step 4: Determine biome
  const biome = getBiome(biomeSeed);

  // Step 5: Build chunk using Perlin + biome weights
  const cells = buildChunkCells(size, noiseSeed, featureSeed, biome, chunkX, chunkY);

  // Step 6: Enforce playability
  enforcePassability(cells, size, seededRandom(featureSeed));
  balanceObstacles(cells, size, seededRandom(noiseSeed + 1));

  return {
    chunkX,
    chunkY,
    biomeId: biome.id,
    cells,
    seed: entropyText,
    generated: true,
  };
}

/**
 * Synchronous chunk generation (no LLM, for immediate needs).
 * Uses only the wordlist + hashing, no LLM expansion.
 */
export function generateChunkSync(
  chunkX: number,
  chunkY: number,
): ChunkData {
  const size = WORLD_CONFIG.chunkSize;

  const coordHash = fastHash(`chunk_${chunkX}_${chunkY}_sync`);
  const pairIndex = coordHash % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';
  const seedText = `${pair}_${chunkX}_${chunkY}`;

  const noiseSeed = fastHash(seedText);
  const featureSeed = fastHash(seedText + '_features');
  const biomeSeed = asciiModulo(pair, WORLD_CONFIG.biomeCount);
  const biome = getBiome(biomeSeed);

  const cells = buildChunkCells(size, noiseSeed, featureSeed, biome, chunkX, chunkY);
  enforcePassability(cells, size, seededRandom(featureSeed));
  balanceObstacles(cells, size, seededRandom(noiseSeed + 1));

  return {
    chunkX,
    chunkY,
    biomeId: biome.id,
    cells,
    seed: seedText,
    generated: true,
  };
}

// ─── Cell Building ───────────────────────────────────────────

function buildChunkCells(
  size: number,
  noiseSeed: number,
  featureSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
): CellData[][] {
  const perlin = new PerlinNoise(noiseSeed);
  const rng = seededRandom(featureSeed);
  const cells: CellData[][] = [];

  for (let y = 0; y < size; y++) {
    cells[y] = [];
    for (let x = 0; x < size; x++) {
      // Global coords for noise continuity across chunks
      const gx = chunkX * size + x;
      const gy = chunkY * size + y;

      // Get density from Perlin (0-100)
      const density = perlin.noise100(gx * 0.1, gy * 0.1);

      cells[y][x] = assignCell(density, biome, rng);
    }
  }

  // Place features (NPCs, chests, collectibles) sparsely
  placeFeatures(cells, size, biome, rng);

  return cells;
}

function assignCell(
  density: number,
  biome: BiomeDef,
  rng: () => number,
): CellData {
  const { terrain, obstacle, feature: _feat } = WORLD_CONFIG.density;

  if (density <= terrain.max) {
    // Open terrain
    const assetKey = weightedPick(biome.terrainWeights, rng());
    const def = ASSET_DEFS[assetKey];
    return {
      assetKey,
      walkable: def?.walkable ?? true,
      interactable: def?.interactable ?? false,
    };
  } else if (density <= obstacle.max) {
    // Obstacle
    const assetKey = weightedPick(biome.obstacleWeights, rng());
    const def = ASSET_DEFS[assetKey];
    return {
      assetKey,
      walkable: def?.walkable ?? false,
      interactable: def?.interactable ?? false,
    };
  } else {
    // Feature slot (will be populated by placeFeatures or left as terrain)
    const assetKey = weightedPick(biome.terrainWeights, rng());
    const def = ASSET_DEFS[assetKey];
    return {
      assetKey,
      walkable: def?.walkable ?? true,
      interactable: def?.interactable ?? false,
    };
  }
}

// ─── Feature Placement ───────────────────────────────────────

function placeFeatures(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
): void {
  // Scatter collectibles and NPCs based on biome rates
  const collectibleCount = Math.floor(size * biome.collectibleRate * 0.5);
  const npcCount = Math.max(1, Math.floor(3 * biome.npcRate));

  // Place collectibles on walkable cells
  let placed = 0;
  for (let attempt = 0; attempt < size * size && placed < collectibleCount; attempt++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    if (cells[y][x].walkable && !cells[y][x].itemId) {
      const featureKey = weightedPick(biome.featureWeights, rng());
      const def = ASSET_DEFS[featureKey];
      if (def?.category === 'collectible') {
        cells[y][x].itemId = featureKey;
        cells[y][x].interactable = true;
        placed++;
      } else if (def?.category === 'interactive') {
        cells[y][x] = {
          assetKey: featureKey,
          walkable: def.walkable,
          interactable: def.interactable,
        };
        placed++;
      }
    }
  }

  // Place NPCs on walkable cells
  let npcsPlaced = 0;
  for (let attempt = 0; attempt < size * size && npcsPlaced < npcCount; attempt++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    if (cells[y][x].walkable && !cells[y][x].npcId && !cells[y][x].itemId) {
      const featureKey = weightedPick(biome.featureWeights, rng());
      const def = ASSET_DEFS[featureKey];
      if (def?.category === 'npc') {
        cells[y][x] = {
          assetKey: featureKey,
          walkable: false,
          interactable: true,
          npcId: featureKey === 'npc_merchant'
            ? 'merchant_default'
            : featureKey === 'npc_guardian'
              ? 'guardian_default'
              : 'villager_default',
        };
        npcsPlaced++;
      }
    }
  }
}

// ─── Playability Enforcement ─────────────────────────────────

function enforcePassability(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  // Check BFS reachability from center
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };

  // Ensure center is walkable
  cells[center.y][center.x].walkable = true;
  cells[center.y][center.x].assetKey = 'grass';

  const reachable = bfsFloodFill(
    (x, y) => cells[y][x].walkable,
    size,
    size,
    center,
  );

  const totalCells = size * size;
  const passabilityRatio = reachable.size / totalCells;

  // If below target, carve paths
  if (passabilityRatio < WORLD_CONFIG.passabilityTarget) {
    const needed = Math.floor(WORLD_CONFIG.passabilityTarget * totalCells) - reachable.size;
    let carved = 0;

    for (let attempt = 0; attempt < totalCells && carved < needed; attempt++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      if (!cells[y][x].walkable) {
        cells[y][x] = {
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        };
        carved++;
      }
    }
  }

  // Ensure edges have entry points (N/S/E/W midpoints)
  const mid = Math.floor(size / 2);
  const edgePoints = [
    { x: mid, y: 0 },           // North entry
    { x: mid, y: size - 1 },    // South entry
    { x: 0, y: mid },           // West entry
    { x: size - 1, y: mid },    // East entry
  ];

  for (const ep of edgePoints) {
    cells[ep.y][ep.x] = {
      assetKey: 'grass',
      walkable: true,
      interactable: false,
    };
  }
}

function balanceObstacles(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  // For each locked door, ensure a key exists somewhere walkable
  const lockedDoors: Array<{ x: number; y: number }> = [];
  const barricades: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'door_locked') lockedDoors.push({ x, y });
      if (cells[y][x].assetKey === 'barricade') barricades.push({ x, y });
    }
  }

  // Spawn keys for locked doors
  for (const _door of lockedDoors) {
    spawnItemNear(cells, size, 'key', rng);
  }

  // Spawn crowbars for barricades
  for (const _barr of barricades) {
    spawnItemNear(cells, size, 'crowbar', rng);
  }
}

function spawnItemNear(
  cells: CellData[][],
  size: number,
  itemId: string,
  rng: () => number,
): void {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    if (cells[y][x].walkable && !cells[y][x].itemId && !cells[y][x].npcId) {
      cells[y][x].itemId = itemId;
      cells[y][x].interactable = true;
      return;
    }
  }
}
