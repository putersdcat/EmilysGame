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

import { WORLD_CONFIG, getDifficulty } from '../config/game.config';
import { ASSET_DEFS } from '../config/assets.config';
import { type BiomeDef } from '../config/biomes.config';
import {
  sha256,
  fastHash,
  asciiModulo,
  seededRandom,
  PerlinNoise,
  weightedPick,
} from './utils';
import { expandEntropy } from './llm';
import {
  getWordlist,
  getEntropyBuffer,
  getLastEntropyOutput,
  setLastEntropyOutput,
  appendEntropyRaw,
} from './world/Entropy';
// Re-export the entropy pool public API so existing importers (main.ts, ui/ui.ts)
// keep importing it from './engine/gen' (B3 / #253 — extracted to world/Entropy.ts).
export {
  setWordlist,
  getWordlist,
  feedEntropy,
  getEntropyStats,
  restoreEntropyBuffer,
  getEntropyBuffer,
  getDirectionPair,
} from './world/Entropy';
import {
  getChunkClimate,
  selectBiomeCoherent,
  deriveMood,
  detectBiomeTransitions,
  type MoodProfile,
} from './world/BiomeSelector';
// Re-export biome selection / climate / mood public API + the MoodProfile type
// (B3 / #253 — extracted to world/BiomeSelector.ts). main.ts imports these from gen.
export {
  setBiomeNoiseSeed,
  getChunkClimate,
  selectBiomeCoherent,
  deriveMood,
  detectBiomeTransitions,
  type MoodProfile,
} from './world/BiomeSelector';
import { validatePlayability } from './world/Validation';
// Re-export playability validation (B3 / #253 — extracted to world/Validation.ts).
// getPlayabilityStats is consumed by main.ts; validatePlayability is called internally.
export { getPlayabilityStats, validatePlayability, type PlayabilityReport } from './world/Validation';
import { scatterCollectibles, layCoinTrails } from './world/CollectibleScatterer';
// Re-export collectible scattering (B3 / #253 — extracted to world/CollectibleScatterer.ts).
// scatterCollectibles + layCoinTrails are called internally by generateChunkSync below.
export { scatterCollectibles, layCoinTrails } from './world/CollectibleScatterer';
import { populateAnchors, clusterDecorations } from './world/Populator';
import { enforcePassability } from './world/Passability';
// Re-export content population (B3 / #253 — extracted to world/Populator.ts).
// populateAnchors + clusterDecorations are called internally by generateChunkSync below.
// scatterDecorations is legacy (kept for test compat); re-exported but not called here.
export { populateAnchors, clusterDecorations, scatterDecorations } from './world/Populator';
// Re-export passability enforcement + water debug (B3 / #253 — extracted to world/Passability.ts).
// enforcePassability is called internally by generateChunkSync (twice). getWaterDebugInfo is
// consumed by main.ts + ui/ui.ts via the gen.ts re-export.
export { enforcePassability, getWaterDebugInfo } from './world/Passability';
import { placeQuizGates, placeBonfires, placeGatesInFenceRuns, promoteDoorGates, addExtraObstacles, balanceObstacles, rewardDeadEnds } from './world/ObstacleSolver';
// Re-export obstacle solver + lock-key DAG debug (B3 / #253 — extracted to world/ObstacleSolver.ts).
// All phase fns are called internally by generateChunkSync (Phases 5.4 / 5.41 / 5.42 / 5.45 / 5.6 / 6 / 6.5).
// getLockKeyDebugInfo is consumed by main.ts + ui/ui.ts via the gen.ts re-export.
export { placeQuizGates, placeBonfires, placeGatesInFenceRuns, promoteDoorGates, addExtraObstacles, balanceObstacles, rewardDeadEnds, getLockKeyDebugInfo } from './world/ObstacleSolver';
// countWalkableNeighbors was moved to world/GridUtils.ts (slice 5). Re-export kept
// for backward compat (consumed via the public engine/gen surface by other tools/tests).
export { countWalkableNeighbors } from './world/GridUtils';
import { traversalCompatible, weightedSelectTemplate, findTerminator } from './world/WorldUnitSolver';
import {
  edgesCompatible,
  getAllRotations,
  BIOME_TEMPLATE_WEIGHTS,
  MICRO_TILE_DEFS,
  tileMatchesClimate,
  type EdgeTag,
  type RotatedTemplate,
  type Cardinal,
} from '../config/tiles.config';
import type { TileType } from '../rendering/tiles';

// --- Types ---

// `MoodProfile` moved to ./world/BiomeSelector.ts (B3 / #253) and is imported +
// re-exported above. ChunkData and the generation functions below use that type.

export interface CellData {
  assetKey: string;
  walkable: boolean;
  interactable: boolean;
  npcId?: string;
  npcFacing?: 'south' | 'north' | 'east' | 'west';  // NPC direction (#85)
  itemId?: string;
  resolved?: boolean;
}

/** Edge tags along each chunk border, one per world unit slot (GRID_DIM values). */
export interface ChunkBorderEdges {
  n: EdgeTag[];
  s: EdgeTag[];
  e: EdgeTag[];
  w: EdgeTag[];
  /** Traversal walkability per border position (#46) */
  nTraversal?: boolean[];
  sTraversal?: boolean[];
  eTraversal?: boolean[];
  wTraversal?: boolean[];
}

/** Constraints from already-generated neighboring chunks. */
export interface BorderConstraints {
  n?: EdgeTag[]; // south border Edge tags from chunk above
  s?: EdgeTag[]; // north border edge tags from chunk below
  e?: EdgeTag[]; // west border edge tags from chunk to the east
  w?: EdgeTag[]; // east border edge tags from chunk to the west
  /** Traversal continuity from neighbors (#46) */
  nTraversal?: boolean[];
  sTraversal?: boolean[];
  eTraversal?: boolean[];
  wTraversal?: boolean[];
}

export interface ChunkData {
  chunkX: number;
  chunkY: number;
  biomeId: number;
  /** Biome name for cross-chunk coherence queries */
  biomeName: string;
  cells: CellData[][];
  seed: string;
  generated: boolean;
  /** World unit grid border edges for inter-chunk stitching (#17) */
  borderEdges?: ChunkBorderEdges;
  /** Chunk-level climate derived from noise fields (#101) */
  climate?: { moisture: number; temperature: number };
  /** Mood profile derived from entropy seed (#46) */
  mood?: MoodProfile;
  /** Biome transition flags for border zones (#46) */
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean };
}

// --- Entropy State ---
// Moved to ./world/Entropy.ts (B3 / #253). The entropy pool + wordlist + direction
// pair helper now live there; the public API is re-exported above so importers are
// unaffected. Internal generation code below uses the imported accessors.

// --- Biome Selection / Climate / Mood ---
// Moved to ./world/BiomeSelector.ts (B3 / #253): setBiomeNoiseSeed, getChunkClimate,
// selectBiomeCoherent, deriveMood, detectBiomeTransitions, and the MoodProfile type.
// Imported + re-exported above so importers (main.ts) are unaffected.

// --- World Unit Grid Constants ---

const WU_SIZE = WORLD_CONFIG.worldUnitSize;
const GRID_DIM = WORLD_CONFIG.chunkSize / WU_SIZE;

// --- Chunk Generation (async + LLM) ---

export async function generateChunk(
  chunkX: number,
  chunkY: number,
): Promise<ChunkData> {
  const size = WORLD_CONFIG.chunkSize;

  const wordlist = getWordlist();
  const pairIndex = Math.abs(fastHash(`${chunkX},${chunkY}`)) % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';

  const entropyText = await expandEntropy(pair, getLastEntropyOutput());
  setLastEntropyOutput(entropyText);
  appendEntropyRaw(entropyText);

  const hashHex = await sha256(entropyText);
  const noiseSeed = fastHash(hashHex.slice(8, 16));
  const featureSeed = fastHash(hashHex.slice(16, 24));

  // #175: ASCII-sum of LLM entropy text → per-chunk biome bias (0–1)
  const entropyBias = asciiModulo(hashHex, 100) / 100;
  const biome = selectBiomeCoherent(chunkX, chunkY, entropyBias);
  const climate = getChunkClimate(chunkX, chunkY);
  const mood = deriveMood(entropyText);
  const biomeTransitions = detectBiomeTransitions(chunkX, chunkY, entropyBias);
  const { cells, borderEdges } = generateGridChunk(size, noiseSeed, featureSeed, biome, chunkX, chunkY, undefined, mood, biomeTransitions);

  return {
    chunkX, chunkY,
    biomeId: biome.id,
    biomeName: biome.name,
    cells, seed: entropyText, generated: true,
    borderEdges,
    climate,
    mood,
    biomeTransitions,
  };
}

// --- Chunk Generation (sync, no LLM) ---

export function generateChunkSync(
  chunkX: number,
  chunkY: number,
  borderConstraints?: BorderConstraints,
): ChunkData {
  const size = WORLD_CONFIG.chunkSize;

  const coordHash = fastHash(`chunk_${chunkX}_${chunkY}_sync`);
  const wordlist = getWordlist();
  const pairIndex = coordHash % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';
  // Salt with entropy pool for player-influenced variation (#4)
  const entropyBuffer = getEntropyBuffer();
  const entropySalt = entropyBuffer.length > 0
    ? `_e${fastHash(entropyBuffer) >>> 0}`
    : '';
  const seedText = `${pair}_${chunkX}_${chunkY}${entropySalt}`;

  const noiseSeed = fastHash(seedText);
  const featureSeed = fastHash(seedText + '_features');
  // #175: ASCII-sum of seed text → per-chunk biome bias (0–1)
  const entropyBias = asciiModulo(seedText, 100) / 100;
  const biome = selectBiomeCoherent(chunkX, chunkY, entropyBias);
  const climate = getChunkClimate(chunkX, chunkY);
  const mood = deriveMood(seedText);
  const biomeTransitions = detectBiomeTransitions(chunkX, chunkY, entropyBias);

  const { cells, borderEdges } = generateGridChunk(
    size, noiseSeed, featureSeed, biome, chunkX, chunkY, borderConstraints, mood, biomeTransitions,
  );

  return {
    chunkX, chunkY,
    biomeId: biome.id,
    biomeName: biome.name,
    cells, seed: seedText, generated: true,
    borderEdges,
    climate,
    mood,
    biomeTransitions,
  };
}

// --- Grid-based chunk generation (core pipeline) ---

interface GridChunkResult {
  cells: CellData[][];
  borderEdges: ChunkBorderEdges;
}

function generateGridChunk(
  size: number,
  noiseSeed: number,
  featureSeed: number,
  biome: BiomeDef,
  chunkX: number,
  chunkY: number,
  borderConstraints?: BorderConstraints,
  mood?: MoodProfile,
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean },
): GridChunkResult {
  const rng = seededRandom(featureSeed);
  const chunkDist = Math.abs(chunkX) + Math.abs(chunkY); // Manhattan distance from origin
  const difficulty = getDifficulty(chunkDist);

  // Phase 1: Perlin noise base terrain
  const cells = buildPerlinBase(size, noiseSeed, biome, chunkX, chunkY);

  // Phase 2: solve world unit grid (AC-3 constraint propagation)
  const { grid, borderEdges } = solveWorldUnitGrid(biome, rng, borderConstraints, mood, biomeTransitions);

  // Phase 3: stamp solved templates onto cell grid
  stampWorldUnitGrid(cells, grid);

  // Phase 4: enforce passability
  enforcePassability(cells, size, seededRandom(featureSeed + 99));

  // Phase 5: content population (anchors, decorations, collectibles)
  populateAnchors(cells, grid, biome, seededRandom(featureSeed + 200), difficulty);
  clusterDecorations(cells, size, biome, seededRandom(featureSeed + 300), chunkDist, difficulty);
  scatterCollectibles(cells, size, biome, seededRandom(featureSeed + 400), chunkDist, difficulty);
  layCoinTrails(cells, size, seededRandom(featureSeed + 450));

  // Phase 5.4: place quiz gates — convert some door_gate cells to quiz_gate (#43)
  placeQuizGates(cells, size, biome, seededRandom(featureSeed + 470), difficulty);

  // Phase 5.42: place gates at fence run openings for #223 conditional walk (AUTONOMOUS_LOOP.md).
  // Scans horiz/vert runs of fence assets (>=3), punches quiz_gate (conditional via woodenGateNano + iso2-solver isPointWalkableInTile/buildWalkableMap).
  // Complements template gates; creates openings in perimeters/fence lines. Default locked.
  // Skip for very central starting chunks (using chunkX/chunkY) so the player can move freely at game start (playability).
  // Features will appear in nearby chunks for exploration and the live gate/quiz mechanics per AUTONOMOUS_LOOP.md.
  if (Math.abs(chunkX) > 1 || Math.abs(chunkY) > 1) {
    placeGatesInFenceRuns(cells, size, seededRandom(featureSeed + 472), biome);
  }

  // Phase 5.41: convert remaining door_gate → door_locked (#98)
  // door_gate cells that weren't converted to quiz_gate need to become
  // door_locked so the mechanics system can resolve them with keys.
  promoteDoorGates(cells, size);

  // Phase 5.45: place bonfires for night-time local lighting (#67)
  placeBonfires(cells, size, biome, seededRandom(featureSeed + 475));

  // Phase 5.5: LLM entropy cell flags (binary char code overrides) (#4)
  applyEntropyCellFlags(cells, size, featureSeed, chunkX, chunkY, biome);

  // Phase 5.6: difficulty-scaled extra obstacles (#46)
  if (difficulty.extraObstacles > 0) {
    addExtraObstacles(cells, size, biome, seededRandom(featureSeed + 480), difficulty);
  }

  // Phase 6: balance obstacles (ensure keys exist before locks)
  balanceObstacles(cells, size, seededRandom(featureSeed + 500));

  // Phase 6.5: dead-end reward scan (Guarantee 2 - no unrewarded dead ends)
  rewardDeadEnds(cells, size, biome, seededRandom(featureSeed + 550));

  // Phase 7: re-enforce passability after population may have added non-walkable objects
  enforcePassability(cells, size, seededRandom(featureSeed + 600));

  // Phase 8: playability validation (Solver F) (#46)
  validatePlayability(cells, size, chunkX, chunkY, seededRandom(featureSeed + 700));

  return { cells, borderEdges };
}

// --- Phase 8: Playability Validation (Solver F) (#46) ---
// Moved to ./world/Validation.ts (B3 / #253). `validatePlayability` is imported above
// and called in generateGridChunk; `getPlayabilityStats` + `PlayabilityReport` are
// re-exported above.

// --- Phase 1: Perlin Noise Base Terrain ---

function buildPerlinBase(
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

// --- Phase 5.5: LLM Entropy Cell Flags (#4) ---
// Binary char code flags from entropy buffer/seed text.
// Per the design doc: convert text chars to binary, use bits as cell property flags.
// This creates subtle player-influenced variation: NPC chat → entropy pool → cell flags.

function applyEntropyCellFlags(
  cells: CellData[][],
  size: number,
  featureSeed: number,
  chunkX: number,
  chunkY: number,
  biome: BiomeDef,
): void {
  // Build a flag source string from entropy buffer + chunk seed
  const entropyBuffer = getEntropyBuffer();
  const flagSource = entropyBuffer.length > 0
    ? entropyBuffer.slice(-256)  // Use last 256 chars of pool
    : `fallback_${chunkX}_${chunkY}_${featureSeed}`;

  // Convert to byte array for bit extraction
  const flagBytes: number[] = [];
  for (let i = 0; i < flagSource.length; i++) {
    flagBytes.push(flagSource.charCodeAt(i));
  }
  if (flagBytes.length === 0) return;

  const rng = seededRandom(featureSeed + 777);
  let byteIdx = 0;

  // Scan cells and apply entropy-derived flags to a small percentage
  // (~10% of cells get entropy overrides - enough for subtle variation)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (rng() > 0.10) continue; // Only process ~10% of cells

      const cell = cells[y][x];
      if (!cell.walkable) continue; // Don't modify obstacles

      const byte = flagBytes[byteIdx % flagBytes.length];
      byteIdx++;

      // Bit 0: Spawn bonus collectible (coin/flower based on biome)
      if ((byte & 0x01) && !cell.itemId) {
        const collectibles = biome.id === 0 ? ['flower', 'coin'] :
                            biome.id === 1 ? ['mushroom', 'coin'] :
                            ['coin', 'gem'];
        const pick = collectibles[byte % collectibles.length];
        if (ASSET_DEFS[pick]) {
          cell.itemId = pick;
        }
      }

      // Bit 1: Mark cell as interactable (sign, decoration)
      if ((byte & 0x02) && rng() < 0.02) {
        // Very rare: entropy-placed signs with flavor text
        cell.interactable = true;
      }
    }
  }
}

// --- Phase 2: AC-3 World Unit Grid Solver (#17) ---
// TODO: DOC — AC-3 constraint propagation solver for world unit placement.
// Design: WorldEngine-02-EdgeContracts.md, Section 6.

interface WeightedCandidate {
  template: RotatedTemplate;
  weight: number;
}

/** Possibility set for each grid slot. Candidates shrink via propagation. */
interface SlotState {
  candidates: WeightedCandidate[];
  collapsed: RotatedTemplate | null;
}

/** An arc connects two adjacent slots along a specific direction pair. */
interface Arc {
  fromY: number;
  fromX: number;
  toY: number;
  toX: number;
  /** Which edge of 'from' faces 'to' */
  fromSide: Cardinal;
  /** Which edge of 'to' faces 'from' */
  toSide: Cardinal;
}

interface SolveResult {
  grid: (RotatedTemplate | null)[][];
  borderEdges: ChunkBorderEdges;
}

// --- AC-3 Solver Budget ---
const MAX_PROPAGATION_ITERATIONS = 1000;

// --- Traversal Continuity Check (#42) ---
// Moved to ./world/WorldUnitSolver.ts (B3 micro-slice 8.1 / #253).
// Imported above; used by propagateAC3, propagateAC3Partial, and collapse logic.

// --- Corner Governance (#42) ---
// At most 2 distinct surface types may meet at any corner junction point.

function getCornerSurface(cellType: string): string {
  return MICRO_TILE_DEFS[cellType as TileType]?.surface ?? 'grass';
}

function validateCornerGovernance(
  candidate: RotatedTemplate,
  gy: number,
  gx: number,
  slots: SlotState[][],
): boolean {
  // This slot participates in up to 4 corner junctions.
  // For each junction, collect surface types from collapsed neighbors + candidate.
  // Junction (jy, jx): top-left=SE, top-right=SW, bot-left=NE, bot-right=NW
  const checks: Array<{
    mySurface: string;
    neighbors: Array<{ sy: number; sx: number; corner: 'nw' | 'ne' | 'sw' | 'se' }>;
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
      if (sy < 0 || sy >= GRID_DIM || sx < 0 || sx >= GRID_DIM) continue;
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

function solveWorldUnitGrid(
  biome: BiomeDef,
  rng: () => number,
  borderConstraints?: BorderConstraints,
  mood?: MoodProfile,
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean },
): SolveResult {
  const allRotations = getAllRotations();
  const biomeCandidates = buildBiomeCandidatePool(biome, allRotations, mood, biomeTransitions);
  const fallback = findFallbackTemplate(allRotations);

  // Phase 2a: Initialize possibility sets
  const slots: SlotState[][] = [];
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
    applyBorderConstraints(slots, borderConstraints);
  }

  // Phase 2c: Build arc set and run initial AC-3 propagation
  const arcs = buildAllArcs();
  propagateAC3(slots, arcs);

  // Phase 2d: Collapse slots using MRV heuristic + propagation
  collapseAllMRV(slots, rng, fallback, arcs);

  // Build result grid
  const grid: (RotatedTemplate | null)[][] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    grid[gy] = [];
    for (let gx = 0; gx < GRID_DIM; gx++) {
      grid[gy][gx] = slots[gy][gx].collapsed;
    }
  }

  enforceChainIntegrity(grid, allRotations);
  const borderEdges = extractGridBorderEdges(grid);

  return { grid, borderEdges };
}

// --- Biome Candidate Pool ---

function buildBiomeCandidatePool(
  biome: BiomeDef,
  allRotations: Map<string, RotatedTemplate[]>,
  mood?: MoodProfile,
  biomeTransitions?: { n: boolean; s: boolean; e: boolean; w: boolean },
): WeightedCandidate[] {
  const pool: WeightedCandidate[] = [];
  const biomeWeights = BIOME_TEMPLATE_WEIGHTS[biome.name] ?? {};
  const hasTransition = biomeTransitions && (biomeTransitions.n || biomeTransitions.s || biomeTransitions.e || biomeTransitions.w);

  for (const [templateName, rotations] of allRotations.entries()) {
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

    // Floor to prevent zero weights
    weight = Math.max(0.005, weight);

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

// --- Border Constraints from Neighboring Chunks ---

function applyBorderConstraints(
  slots: SlotState[][],
  bc: BorderConstraints,
): void {
  // North border: our row 0 must match the south edge of the chunk above
  if (bc.n) {
    for (let gx = 0; gx < GRID_DIM && gx < bc.n.length; gx++) {
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
    const lastRow = GRID_DIM - 1;
    for (let gx = 0; gx < GRID_DIM && gx < bc.s.length; gx++) {
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
    for (let gy = 0; gy < GRID_DIM && gy < bc.w.length; gy++) {
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
    const lastCol = GRID_DIM - 1;
    for (let gy = 0; gy < GRID_DIM && gy < bc.e.length; gy++) {
      const requiredTag = bc.e[gy];
      const requiredTraversal = bc.eTraversal?.[gy];
      slots[gy][lastCol].candidates = slots[gy][lastCol].candidates.filter(
        c => edgesCompatible(c.template.edgeTags.e, requiredTag) &&
          (requiredTraversal === undefined || c.template.traversalChannels.e === requiredTraversal),
      );
    }
  }
}

// --- Arc Construction ---

const OPPOSITES: Record<Cardinal, Cardinal> = { n: 's', s: 'n', e: 'w', w: 'e' };

function buildAllArcs(): Arc[] {
  const arcs: Arc[] = [];
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      // Right neighbor
      if (gx + 1 < GRID_DIM) {
        arcs.push({ fromY: gy, fromX: gx, toY: gy, toX: gx + 1, fromSide: 'e', toSide: 'w' });
        arcs.push({ fromY: gy, fromX: gx + 1, toY: gy, toX: gx, fromSide: 'w', toSide: 'e' });
      }
      // Bottom neighbor
      if (gy + 1 < GRID_DIM) {
        arcs.push({ fromY: gy, fromX: gx, toY: gy + 1, toX: gx, fromSide: 's', toSide: 'n' });
        arcs.push({ fromY: gy + 1, fromX: gx, toY: gy, toX: gx, fromSide: 'n', toSide: 's' });
      }
    }
  }
  return arcs;
}

// --- AC-3 Constraint Propagation ---

function propagateAC3(slots: SlotState[][], allArcs: Arc[]): void {
  // Worklist: start with all arcs
  const queue: Arc[] = [...allArcs];
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

// --- Arcs Affected by a Specific Slot ---

function getArcsAffectedBy(
  gy: number, gx: number, allArcs: Arc[],
): Arc[] {
  return allArcs.filter(a => a.toY === gy && a.toX === gx);
}

// --- Slot Selection Priority ---
// Improved filling order: boundary-first → chain-continuation → MRV
// This ensures border consistency with neighbors, then extends chain features,
// then fills remaining slots by most-constrained heuristic.

/** Score a slot for collapse priority. Lower = collapse sooner. */
function slotPriority(gy: number, gx: number, slots: SlotState[][]): number {
  const slot = slots[gy][gx];
  if (slot.collapsed) return Infinity;
  const candidateCount = slot.candidates.length;
  if (candidateCount === 0) return -1; // Contradictions first (to degrade quickly)

  const isBorder = gy === 0 || gy === GRID_DIM - 1 || gx === 0 || gx === GRID_DIM - 1;
  const isCorner = (gy === 0 || gy === GRID_DIM - 1) && (gx === 0 || gx === GRID_DIM - 1);

  // Check if adjacent to an already-collapsed chain feature
  let adjacentToChain = false;
  const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dy, dx] of dirs) {
    const ny = gy + dy, nx = gx + dx;
    if (ny >= 0 && ny < GRID_DIM && nx >= 0 && nx < GRID_DIM) {
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

  // Priority tiers (lower number = higher priority):
  // Tier 0: contradictions (candidateCount === 0)  → handled above
  // Tier 1: corners (most constrained boundary)     → 1000 + MRV
  // Tier 2: border edges                            → 2000 + MRV
  // Tier 3: chain continuation (adjacent to chain)  → 3000 + MRV
  // Tier 4: interior MRV                            → 4000 + MRV
  let tier: number;
  if (isCorner) tier = 1000;
  else if (isBorder) tier = 2000;
  else if (adjacentToChain) tier = 3000;
  else tier = 4000;

  return tier + candidateCount;
}

// --- MRV Collapse with Boundary-First Priority ---

function collapseAllMRV(
  slots: SlotState[][],
  rng: () => number,
  fallback: RotatedTemplate | null,
  allArcs: Arc[],
): void {
  const totalSlots = GRID_DIM * GRID_DIM;

  for (let step = 0; step < totalSlots; step++) {
    // Find uncollapsed slot with best priority (boundary-first, then chain, then MRV)
    let bestY = -1, bestX = -1, bestPriority = Infinity;
    for (let gy = 0; gy < GRID_DIM; gy++) {
      for (let gx = 0; gx < GRID_DIM; gx++) {
        const slot = slots[gy][gx];
        if (slot.collapsed) continue;
        const priority = slotPriority(gy, gx, slots);
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
        validateCornerGovernance(c.template, bestY, bestX, slots),
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
    const propagationQueue: Arc[] = [];
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

/** Partial AC-3 propagation from a specific worklist. */
function propagateAC3Partial(
  slots: SlotState[][],
  queue: Arc[],
  allArcs: Arc[],
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

// `weightedSelectTemplate` moved to ./world/WorldUnitSolver.ts (B3 micro-slice 8.1 / #253).
// Imported at top of file; used by collapseAllMRV.

// --- Border Edge Extraction ---

function extractGridBorderEdges(
  grid: (RotatedTemplate | null)[][],
): ChunkBorderEdges {
  return {
    n: Array.from({ length: GRID_DIM }, (_, gx) => grid[0]?.[gx]?.edgeTags.n ?? 'open'),
    s: Array.from({ length: GRID_DIM }, (_, gx) => grid[GRID_DIM - 1]?.[gx]?.edgeTags.s ?? 'open'),
    e: Array.from({ length: GRID_DIM }, (_, gy) => grid[gy]?.[GRID_DIM - 1]?.edgeTags.e ?? 'open'),
    w: Array.from({ length: GRID_DIM }, (_, gy) => grid[gy]?.[0]?.edgeTags.w ?? 'open'),
    // Traversal walkability per border position (#46)
    nTraversal: Array.from({ length: GRID_DIM }, (_, gx) => grid[0]?.[gx]?.traversalChannels.n ?? true),
    sTraversal: Array.from({ length: GRID_DIM }, (_, gx) => grid[GRID_DIM - 1]?.[gx]?.traversalChannels.s ?? true),
    eTraversal: Array.from({ length: GRID_DIM }, (_, gy) => grid[gy]?.[GRID_DIM - 1]?.traversalChannels.e ?? true),
    wTraversal: Array.from({ length: GRID_DIM }, (_, gy) => grid[gy]?.[0]?.traversalChannels.w ?? true),
  };
}

// --- Chain Integrity (#42: uses chainPorts for precise chain edge detection) ---

function enforceChainIntegrity(
  grid: (RotatedTemplate | null)[][],
  allRotations: Map<string, RotatedTemplate[]>,
): void {
  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template) continue;

      // Use chainPorts for precise chain edge detection (#42)
      // Check exits first (must connect forward); fall back to entries for legacy
      const ports = template.chainPorts;
      const dirsToCheck = ports.exits.length > 0
        ? ports.exits
        : ports.entries;
      if (dirsToCheck.length === 0) continue;

      for (const dir of dirsToCheck) {
        const tag = template.edgeTags[dir];
        const nx = gx + (dir === 'e' ? 1 : dir === 'w' ? -1 : 0);
        const ny = gy + (dir === 's' ? 1 : dir === 'n' ? -1 : 0);

        const needsFix =
          nx < 0 || nx >= GRID_DIM || ny < 0 || ny >= GRID_DIM ||
          !grid[ny]?.[nx];

        if (needsFix && tag !== 'open') {
          const replacement = findTerminator(template.baseName, allRotations);
          if (replacement) {
            // Check that replacement is compatible with placed neighbors
            const nTag = gy > 0 && grid[gy - 1][gx] ? grid[gy - 1][gx]!.edgeTags.s : undefined;
            const wTag = gx > 0 && grid[gy][gx - 1] ? grid[gy][gx - 1]!.edgeTags.e : undefined;
            if (
              (!nTag || edgesCompatible(replacement.edgeTags.n, nTag)) &&
              (!wTag || edgesCompatible(replacement.edgeTags.w, wTag))
            ) {
              grid[gy][gx] = replacement;
            }
          }
        }
      }
    }
  }
}

// `findTerminator` moved to ./world/WorldUnitSolver.ts (B3 micro-slice 8.1 / #253).
// Imported at top of file; used by enforceChainIntegrity for recovery on dangling chains.

// --- Phase 3: Stamp Grid onto Cells ---
// (Phase 3 of generateGridChunk; called immediately after solveWorldUnitGrid.)
// Stamps the solved 5x5 RotatedTemplate grid into the concrete CellData grid.
// Micro-tile walkability from MICRO_TILE_DEFS takes precedence; falls back to ASSET_DEFS.

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
// `enforcePassability` and the file-local `validateWaterIntegrity` helper
// were moved to src/engine/world/Passability.ts (B3 / #253). The water
// debug state (`_lastWaterDebug`) and the public `getWaterDebugInfo()`
// getter also live with Passability; gen.ts re-exports the getter for
// API stability (consumed by main.ts and ui/ui.ts).

// --- Phase 5: Content Population ---
// `populateAnchors`, `clusterDecorations`, `scatterDecorations`, and their
// 6 private helpers (placeNpcAtCell / placeItemAtCell / placeDecorationAtCell
// / placeFeatureAtCell / isNearGate / hasAdjacentInteractable) were moved
// to src/engine/world/Populator.ts (B3 / #253). The shared
// `countWalkableNeighbors` helper moved to src/engine/world/GridUtils.ts
// (also used by the still-in-gen.ts ObstacleSolver slice 7 fns:
// addExtraObstacles, placeQuizGates). The public API is re-exported at
// the top of this file. The four biome lookup tables (BIOME_SCATTER_/
// ANCHOR_DECORATIONS, BIOME_NPC_POOL, NPC_ID_MAP) moved with Populator.

/**
 * Phase 5.4–6.5: Obstacle placement, balancing, and lock-key DAG validation
 * (Issue #98 — Solver D: No Softlocks) were moved to
 * src/engine/world/ObstacleSolver.ts (B3 / #253). The public API
 * (placeQuizGates, placeBonfires, placeGatesInFenceRuns, promoteDoorGates,
 * addExtraObstacles, balanceObstacles, rewardDeadEnds, getLockKeyDebugInfo)
 * is re-exported at the top of this file.
 *
 * Also moved: the `LockInfo` / `DAGResult` interfaces, the `_dagAccum`
 * module state, the embedded lock-key DAG algorithm (inline in
 * `balanceObstacles`), and the `FIRE_WEIGHTS` constant (inline in
 * `placeBonfires`).
 *
 * The shared `countWalkableNeighbors` helper is in world/GridUtils.ts
 * (slice 5) and is imported by ObstacleSolver directly.
 */
