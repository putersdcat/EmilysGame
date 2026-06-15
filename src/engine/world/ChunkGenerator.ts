/**
 * ChunkGenerator.ts — The chunk generation pipeline orchestrator.
 *
 * This module is the single entry point for generating a chunk. It exposes:
 *   - generateChunk(chunkX, chunkY) — async, uses LLM entropy (#4, #175)
 *   - generateChunkSync(chunkX, chunkY, borderConstraints?) — sync, deterministic
 *   - generateGridChunk(...) — internal pipeline coordinator (all 6 phases)
 *
 * B6 micro-slice 10.1 (#253): extracted from gen.ts. The pipeline is:
 *   Phase 1: buildPerlinBase (TerrainBuilder) — Perlin noise base terrain
 *   Phase 2: solveWorldUnitGrid (WorldUnitSolver) — AC-3 constraint propagation
 *   Phase 3: stampWorldUnitGrid (WorldUnitSolver) — stamp solved templates
 *   Phase 4: enforcePassability (Passability) — ensure walkability
 *   Phase 5: populateAnchors, clusterDecorations, scatterCollectibles, layCoinTrails,
 *            placeQuizGates, placeGatesInFenceRuns, promoteDoorGates, placeBonfires,
 *            applyEntropyCellFlags, addExtraObstacles (Populator/CollectibleScatterer/
 *            ObstacleSolver/EntropyCellFlags)
 *   Phase 6: balanceObstacles, rewardDeadEnds (ObstacleSolver)
 *   Phase 7: enforcePassability (re-enforce after population)
 *   Phase 8: validatePlayability (Validation) — playability report
 *
 * gen.ts is now a pure re-export facade — consumers (main.ts, tests) can
 * import from either 'engine/gen' or 'engine/world/ChunkGenerator'.
 *
 * Invariants protected:
 *   - #17 (edge contracts), #42 (traversal + corner governance + chain integrity)
 *   - #43 (quiz gates), #46 (playability + difficulty)
 *   - #98 (door_locked promotion), #101 (climate affinity)
 *   - #175 (entropy → biome bias), #223 (fence-run gates)
 *   - #261 (spatial coherence), #265 (determinism via seeded RNG only)
 *
 * @see WorldEngine-03-SolverPipeline.md
 * @see WorldEngine-05-PopulationAndProgression.md
 */

import { WORLD_CONFIG, getDifficulty } from '../../config/game.config';
import { type BiomeDef } from '../../config/biomes.config';
import {
  sha256,
  fastHash,
  asciiModulo,
  seededRandom,
} from '../utils';
import { expandEntropy } from '../llm';
import {
  getWordlist,
  getEntropyBuffer,
  getLastEntropyOutput,
  setLastEntropyOutput,
  appendEntropyRaw,
} from './Entropy';
import {
  getChunkClimate,
  selectBiomeCoherent,
  deriveMood,
  detectBiomeTransitions,
  type MoodProfile,
} from './BiomeSelector';
import { validatePlayability } from './Validation';
import { scatterCollectibles, layCoinTrails } from './CollectibleScatterer';
import { populateAnchors, clusterDecorations } from './Populator';
import { enforcePassability } from './Passability';
import {
  placeQuizGates,
  placeBonfires,
  placeGatesInFenceRuns,
  promoteDoorGates,
  addExtraObstacles,
  balanceObstacles,
  rewardDeadEnds,
} from './ObstacleSolver';
import { solveWorldUnitGrid, stampWorldUnitGrid } from './WorldUnitSolver';
import { WU_SIZE, GRID_DIM } from './WorldGrid';
import { buildPerlinBase } from './TerrainBuilder';
import { applyEntropyCellFlags } from './EntropyCellFlags';
import type {
  BorderConstraints,
  ChunkData,
  GridChunkResult,
} from '../../types/game.types';

// --- Chunk Generation (async + LLM) ---

/**
 * Generate a chunk asynchronously, using the LLM entropy pool to seed
 * biome selection, mood, and per-chunk variation (#4, #175).
 *
 * Pipeline:
 *   1. Hash chunk coords → wordlist pair index
 *   2. Expand entropy via LLM (or fall back to last entropy output)
 *   3. SHA-256 the entropy text → noiseSeed + featureSeed
 *   4. ASCII-sum → per-chunk biome bias
 *   5. Delegate to generateGridChunk for the actual cell building
 *   6. Wrap result in ChunkData with biome/climate/mood metadata
 */
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

/**
 * Generate a chunk synchronously without LLM calls. Used for:
 *   - Initial chunk generation when the LLM is not yet available
 *   - Regeneration when border constraints from neighbors change
 *   - Deterministic golden tests (#265)
 *
 * Seeds are derived from chunk coords + entropy buffer (for player-
 * influenced variation, #4). The entropy buffer is a snapshot of the
 * player's NPC chat history; if empty, a deterministic fallback is used.
 */
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
// GridChunkResult lives in src/types/game.types.ts (B4 / #253).

/**
 * Core pipeline coordinator: runs all 6 phases of chunk generation in order.
 *
 * Each phase reads from the cells grid (built by Phase 1) and the solver
 * grid (built by Phase 2), and may modify the cells grid in place. The
 * border edges from Phase 2 are returned to the caller for inter-chunk
 * stitching (#17).
 *
 * Determinism invariant: every random decision goes through a seeded RNG
 * derived from `featureSeed` (#265). Same seed → same output.
 */
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
  // The solver uses its module-level GRID_DIM constant (derived from
  // WORLD_CONFIG.chunkSize / worldUnitSize) which matches gen.ts's
  // local constant exactly. No gridDim parameter is required.
  const { grid, borderEdges } = solveWorldUnitGrid(biome, rng, borderConstraints, mood, biomeTransitions);

  // Phase 3: stamp solved templates onto cell grid
  // Pass gen.ts's WU_SIZE explicitly so the stamper is renderer-safe
  // (the module doesn't read WORLD_CONFIG.worldUnitSize directly).
  stampWorldUnitGrid(cells, grid, GRID_DIM, WU_SIZE);

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
