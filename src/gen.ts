/**
 * gen.ts — World generation system (v2: grid-based world unit solver).
 *
 * Replaces random template stamping with structured 5x5 world unit grid filling.
 * Each chunk (25x25 cells) is a 5x5 grid of world unit slots, filled via
 * edge-contract-aware constraint selection.
 *
 * Design docs: WorldEngine-01 (Spatial Hierarchy), WorldEngine-03 (Solver Pipeline)
 * GitHub: #23 — Generation Pipeline Refactor
 *
 * TODO: DOC — document the grid solver algorithm and chain integrity rules
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
import {
  edgesCompatible,
  getAllRotations,
  BIOME_TEMPLATE_WEIGHTS,
  MICRO_TILE_DEFS,
  type EdgeTag,
  type RotatedTemplate,
  type Cardinal,
} from './config/tiles.config';
import type { TileType } from './tiles';

// --- Types ---

export interface CellData {
  assetKey: string;
  walkable: boolean;
  interactable: boolean;
  npcId?: string;
  itemId?: string;
  resolved?: boolean;
}

export interface ChunkData {
  chunkX: number;
  chunkY: number;
  biomeId: number;
  cells: CellData[][];
  seed: string;
  generated: boolean;
}

// --- Entropy State ---

let wordlist: string[] = [];
let lastEntropyOutput = '';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let entropyBuffer = '';

export function setWordlist(list: string[]): void {
  wordlist = list;
}

export function getWordlist(): string[] {
  return wordlist;
}

// --- Direction Pair ---

export function getDirectionPair(direction: string, rng: () => number): string {
  const table = DIRECTION_WORDS[direction] || DIRECTION_WORDS['right'];
  const verb = table.verbs[Math.floor(rng() * table.verbs.length)];
  const noun = table.nouns[Math.floor(rng() * table.nouns.length)];
  return `${verb} ${noun}`;
}

// --- World Unit Grid Constants ---

const WU_SIZE = WORLD_CONFIG.worldUnitSize;
const GRID_DIM = WORLD_CONFIG.chunkSize / WU_SIZE;

// --- Chunk Generation (async + LLM) ---

export async function generateChunk(
  chunkX: number,
  chunkY: number,
): Promise<ChunkData> {
  const size = WORLD_CONFIG.chunkSize;

  const pairIndex = Math.abs(fastHash(`${chunkX},${chunkY}`)) % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';

  const entropyText = await expandEntropy(pair, lastEntropyOutput);
  lastEntropyOutput = entropyText;
  entropyBuffer += entropyText;

  const hashHex = await sha256(entropyText);
  const biomeSeed = hexToInt(hashHex.slice(0, 8), WORLD_CONFIG.biomeCount - 1);
  const noiseSeed = fastHash(hashHex.slice(8, 16));
  const featureSeed = fastHash(hashHex.slice(16, 24));

  const biome = getBiome(biomeSeed);
  const cells = generateGridChunk(size, noiseSeed, featureSeed, biome, chunkX, chunkY);

  return {
    chunkX, chunkY,
    biomeId: biome.id,
    cells, seed: entropyText, generated: true,
  };
}

// --- Chunk Generation (sync, no LLM) ---

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

  const cells = generateGridChunk(size, noiseSeed, featureSeed, biome, chunkX, chunkY);

  return {
    chunkX, chunkY,
    biomeId: biome.id,
    cells, seed: seedText, generated: true,
  };
}

// --- Grid-based chunk generation (core pipeline) ---

function generateGridChunk(
  size: number,
  noiseSeed: number,
  featureSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
): CellData[][] {
  const rng = seededRandom(featureSeed);

  // Phase 1: Perlin noise base terrain
  const cells = buildPerlinBase(size, noiseSeed, biome, chunkX, chunkY);

  // Phase 2: solve world unit grid
  const grid = solveWorldUnitGrid(biome, rng);

  // Phase 3: stamp solved templates onto cell grid
  stampWorldUnitGrid(cells, grid);

  // Phase 4: enforce passability
  enforcePassability(cells, size, seededRandom(featureSeed + 99));

  return cells;
}

// --- Phase 1: Perlin Noise Base Terrain ---

function buildPerlinBase(
  size: number,
  noiseSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
): CellData[][] {
  const perlin = new PerlinNoise(noiseSeed);
  const cells: CellData[][] = [];

  for (let y = 0; y < size; y++) {
    cells[y] = [];
    for (let x = 0; x < size; x++) {
      const gx = chunkX * size + x;
      const gy = chunkY * size + y;
      const density = perlin.noise100(gx * 0.1, gy * 0.1);
      cells[y][x] = assignTerrainCell(density, biome);
    }
  }
  return cells;
}

function assignTerrainCell(density: number, biome: BiomeDef): CellData {
  const { terrain, obstacle } = WORLD_CONFIG.density;

  if (density <= terrain.max) {
    const assetKey = weightedPick(biome.terrainWeights, Math.random());
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? true, interactable: false };
  } else if (density <= obstacle.max) {
    const def = ASSET_DEFS['rock'];
    return { assetKey: 'rock', walkable: def?.walkable ?? false, interactable: false };
  } else {
    const assetKey = weightedPick(biome.terrainWeights, Math.random());
    const def = ASSET_DEFS[assetKey];
    return { assetKey, walkable: def?.walkable ?? true, interactable: false };
  }
}

// --- Phase 2: World Unit Grid Solver ---

interface WeightedCandidate {
  template: RotatedTemplate;
  weight: number;
}

interface SlotConstraints {
  n?: EdgeTag;
  w?: EdgeTag;
}

function solveWorldUnitGrid(
  biome: BiomeDef,
  rng: () => number,
): (RotatedTemplate | null)[][] {
  const allRotations = getAllRotations();
  const grid: (RotatedTemplate | null)[][] = [];

  const biomeCandidates = buildBiomeCandidatePool(biome, allRotations);
  const fallback = findFallbackTemplate(allRotations);

  for (let gy = 0; gy < GRID_DIM; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const constraints = getSlotConstraints(grid, gx, gy);
      const valid = filterByConstraints(biomeCandidates, constraints);

      if (valid.length > 0) {
        grid[gy][gx] = weightedSelectTemplate(valid, rng);
      } else {
        grid[gy][gx] = fallback;
      }
    }
  }

  enforceChainIntegrity(grid, allRotations);
  return grid;
}

function buildBiomeCandidatePool(
  biome: BiomeDef,
  allRotations: Map<string, RotatedTemplate[]>,
): WeightedCandidate[] {
  const pool: WeightedCandidate[] = [];
  const biomeWeights = BIOME_TEMPLATE_WEIGHTS[biome.name] ?? {};

  for (const [templateName, rotations] of allRotations.entries()) {
    const weight = biomeWeights[templateName] ?? 0.01;
    for (const rot of rotations) {
      pool.push({ template: rot, weight });
    }
  }
  return pool;
}

function findFallbackTemplate(
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) return meadowRots[0];
  return null;
}

function getSlotConstraints(
  grid: (RotatedTemplate | null)[][],
  gx: number,
  gy: number,
): SlotConstraints {
  const constraints: SlotConstraints = {};
  if (gy > 0 && grid[gy - 1][gx]) {
    constraints.n = grid[gy - 1][gx]!.edgeTags.s;
  }
  if (gx > 0 && grid[gy][gx - 1]) {
    constraints.w = grid[gy][gx - 1]!.edgeTags.e;
  }
  return constraints;
}

function filterByConstraints(
  candidates: WeightedCandidate[],
  constraints: SlotConstraints,
): WeightedCandidate[] {
  return candidates.filter(({ template }) => {
    if (constraints.n !== undefined) {
      if (!edgesCompatible(template.edgeTags.n, constraints.n)) return false;
    }
    if (constraints.w !== undefined) {
      if (!edgesCompatible(template.edgeTags.w, constraints.w)) return false;
    }
    return true;
  });
}

function weightedSelectTemplate(
  candidates: WeightedCandidate[],
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

// --- Chain Integrity ---

function enforceChainIntegrity(
  grid: (RotatedTemplate | null)[][],
  allRotations: Map<string, RotatedTemplate[]>,
): void {
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      const chainEdges = getChainEdges(template);
      if (chainEdges.length === 0) continue;

      for (const { dir, tag } of chainEdges) {
        const nx = gx + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0);
        const ny = gy + (dir === 's' ? 1 : dir === 'n' ? -1 : 0);

        const needsFix =
          nx < 0 || nx >= GRID_DIM || ny < 0 || ny >= GRID_DIM ||
          !grid[ny]?.[nx];

        if (needsFix && tag !== 'open') {
          const replacement = findTerminator(template.baseName, allRotations);
          if (replacement) {
            const constraints = getSlotConstraints(grid, gx, gy);
            if (
              (!constraints.n || edgesCompatible(replacement.edgeTags.n, constraints.n)) &&
              (!constraints.w || edgesCompatible(replacement.edgeTags.w, constraints.w))
            ) {
              grid[gy][gx] = replacement;
            }
          }
        }
      }
    }
  }
}

function getChainEdges(template: RotatedTemplate): Array<{ dir: Cardinal; tag: EdgeTag }> {
  const edges: Array<{ dir: Cardinal; tag: EdgeTag }> = [];
  const dirs: Cardinal[] = ['n', 's', 'e', 'w'];
  for (const dir of dirs) {
    const tag = template.edgeTags[dir];
    if (tag !== 'open') edges.push({ dir, tag });
  }
  return edges;
}

function findTerminator(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  if (baseName.startsWith('river_')) {
    const pondRots = allRotations.get('river_end_pond');
    if (pondRots && pondRots.length > 0) return pondRots[0];
  }
  const meadowRots = allRotations.get('meadow_base');
  if (meadowRots && meadowRots.length > 0) return meadowRots[0];
  return null;
}

// --- Phase 3: Stamp Grid onto Cells ---

function stampWorldUnitGrid(
  cells: CellData[][],
  grid: (RotatedTemplate | null)[][],
): void {
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      const baseX = gx * WU_SIZE;
      const baseY = gy * WU_SIZE;

      for (let ty = 0; ty < WU_SIZE; ty++) {
        for (let tx = 0; tx < WU_SIZE; tx++) {
          const cellKey = template.cells[ty]?.[tx];
          if (cellKey === null || cellKey === undefined) continue;

          const microDef = MICRO_TILE_DEFS[cellKey as TileType];
          const def = ASSET_DEFS[cellKey];
          cells[baseY + ty][baseX + tx] = {
            assetKey: cellKey,
            walkable: microDef?.walkable ?? def?.walkable ?? true,
            interactable: def?.interactable ?? false,
          };
        }
      }
    }
  }
}

// --- Phase 4: Passability Enforcement ---

function enforcePassability(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  cells[center.y][center.x].walkable = true;
  cells[center.y][center.x].assetKey = 'grass';

  const reachable = bfsFloodFill(
    (x, y) => cells[y][x].walkable,
    size, size, center,
  );

  const totalCells = size * size;
  const passabilityRatio = reachable.size / totalCells;

  if (passabilityRatio < WORLD_CONFIG.passabilityTarget) {
    const needed = Math.floor(WORLD_CONFIG.passabilityTarget * totalCells) - reachable.size;
    let carved = 0;
    for (let attempt = 0; attempt < totalCells && carved < needed; attempt++) {
      const x = Math.floor(rng() * size);
      const y = Math.floor(rng() * size);
      if (!cells[y][x].walkable) {
        cells[y][x] = { assetKey: 'grass', walkable: true, interactable: false };
        carved++;
      }
    }
  }

  const mid = Math.floor(size / 2);
  const edgePoints = [
    { x: mid, y: 0 },
    { x: mid, y: size - 1 },
    { x: 0, y: mid },
    { x: size - 1, y: mid },
  ];
  for (const ep of edgePoints) {
    cells[ep.y][ep.x] = { assetKey: 'grass', walkable: true, interactable: false };
  }
}

// --- Population Hooks (modular stubs) ---
// TODO: DOC — Population phase will be re-enabled once world building is stable.
// See WorldEngine-05-PopulationAndProgression.md for design.

export function populateAnchors(
  _cells: CellData[][],
  _grid: (RotatedTemplate | null)[][],
  _biome: BiomeDef,
  _rng: () => number,
): void {
  // TODO: Iterate over grid slots, find anchor points, spawn entities
}

export function balanceObstacles(
  _cells: CellData[][],
  _size: number,
  _rng: () => number,
): void {
  // TODO: Scan for locked doors/barricades and spawn matching keys/tools
}
