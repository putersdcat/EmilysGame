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
 *   Phase 4.5: layPathSkeleton (PathSkeleton) — early-chunk dirt corridor (scene-first P1)
 *   Phase 5: populateAnchors, clusterDecorations, scatterCollectibles, layCoinTrails,
 *            placeQuizGates, placeGatesInFenceRuns, promoteDoorGates, placeBonfires,
 *            maybePlaceCastleLandmark, applyEntropyCellFlags, addExtraObstacles
 *            (Populator/CollectibleScatterer/ObstacleSolver/EntropyCellFlags/iso2-assemblies)
 *   Phase 6: balanceObstacles, rewardDeadEnds (ObstacleSolver)
 *   Phase 7: enforcePassability (re-enforce after population)
 *   Phase 8: validatePlayability (Validation) — playability report
 *   Phase 9.5: runPlaceCoherencePass (PlaceCoherence) — LAST: seal illegal fence
 *              gaps + re-assert homestead after playability carves
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
  buildPerlinBase,
  cohereSurfacePatches,
  removeOrphanStructures,
  removeOrphanWater,
  stripOrphanRoofShards,
} from './TerrainBuilder';
import {
  placeQuizGates,
  sealTrivialQuizGateBypasses,
  ensureMinimumQuizGates,
  placeBonfires,
  placeGatesInFenceRuns,
  promoteDoorGates,
  addExtraObstacles,
  balanceObstacles,
  rewardDeadEnds,
} from './ObstacleSolver';
import { solveWorldUnitGrid, stampWorldUnitGrid } from './WorldUnitSolver';
import { WU_SIZE, GRID_DIM } from './WorldGrid';
import { applyEntropyCellFlags } from './EntropyCellFlags';
import {
  stampStarterHomestead,
  ensureSpawnClearance,
  maybePlaceCastleLandmark,
  maybePlaceModularScenes,
  scanAndRepairFenceGaps,
} from '../iso2-assemblies';
import { layPathSkeleton } from './PathSkeleton';
import { runPlaceCoherencePass } from './PlaceCoherence';
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
  const { grid, borderEdges } = solveWorldUnitGrid(
    biome,
    rng,
    borderConstraints,
    mood,
    biomeTransitions,
    { safeZone: chunkDist <= 1 },
  );

  // Phase 3: stamp solved templates onto cell grid
  // Pass gen.ts's WU_SIZE explicitly so the stamper is renderer-safe
  // (the module doesn't read WORLD_CONFIG.worldUnitSize directly).
  stampWorldUnitGrid(cells, grid, GRID_DIM, WU_SIZE);
  if (chunkX === 0 && chunkY === 0) stampStarterHomestead(cells);
  // Light scene-law pass: single-cell fence/wall dirt gaps → quiz_gate when
  // no functional opening is nearby. Origin-exempt (same policy as placeQuizGates):
  // starter homestead authors its own quiz_gate; avoid injecting extra origin gates.
  if (chunkX !== 0 || chunkY !== 0) {
    scanAndRepairFenceGaps(cells, size);
  }

  // Phase 3.5 (V1 surface language): kill lone dirt/sand salt left by Perlin
  // or WU stamps (path ends and water-adjacent sand shores are preserved).
  cohereSurfacePatches(cells, size);

  // Phase 4: enforce passability
  enforcePassability(cells, size, seededRandom(featureSeed + 99));

  // Phase 4.5 (scene-first P1): dirt path skeleton for early chunks (dist ≤ 2).
  // AFTER base terrain + passability so borders/center are walkable; BEFORE
  // population / modular scenes so corridors exist when farms/gates land.
  // ensureMinimumQuizGates (later) still guarantees ≥1 quiz_gate on the chunk.
  layPathSkeleton(cells, size, seededRandom(featureSeed + 150), chunkDist);

  // Phase 5: content population (anchors, decorations, collectibles)
  populateAnchors(cells, grid, biome, seededRandom(featureSeed + 200), difficulty);
  clusterDecorations(cells, size, biome, seededRandom(featureSeed + 300), chunkDist, difficulty);
  scatterCollectibles(cells, size, biome, seededRandom(featureSeed + 400), chunkDist, difficulty);

  // Phase 5.4–5.44: quiz/gate progression — skip entirely on origin so the
  // starter homestead stays free to explore; every other chunk teaches the loop.
  if (chunkX !== 0 || chunkY !== 0) {
    placeQuizGates(cells, size, biome, seededRandom(featureSeed + 470), difficulty);
    placeGatesInFenceRuns(cells, size, seededRandom(featureSeed + 472), biome);
    sealTrivialQuizGateBypasses(cells, size, biome, seededRandom(featureSeed + 473));
    ensureMinimumQuizGates(cells, size, biome, seededRandom(featureSeed + 474), 1);
  }

  // Phase 5.41: convert remaining door_gate → door_locked (#98)
  // door_gate cells that weren't converted to quiz_gate need to become
  // door_locked so the mechanics system can resolve them with keys.
  promoteDoorGates(cells, size);

  // Coin trails after gates/doors exist so breadcrumbs can lead to them
  layCoinTrails(cells, size, seededRandom(featureSeed + 450));

  // Phase 5.45: place bonfires for night-time local lighting (#67)
  placeBonfires(cells, size, biome, seededRandom(featureSeed + 475));

  // Phase 5.46: maybe place a rare castle-biome landmark (ruined cathedral or
  // castle keep) -- wires up previously-dead assembly content into real
  // generation for the first time (Slice E "Step 2", 2026-07-09). No-op for
  // every other biome and most eligible chunks; runs before the Phase 6-8
  // safety net so any repair the landmark needs still happens.
  maybePlaceCastleLandmark(cells, size, biome, chunkDist, seededRandom(featureSeed + 476));

  // Phase 5.47 (V2 visual): modular scene assemblies (farm, pond, gatehouse,
  // bridge, church-graveyard) by biome + rarity. At most one per chunk;
  // skips safe ring. Same pre-safety-net timing as castle landmarks.
  // stampAssemblyOntoCells already repairs declared openings.
  maybePlaceModularScenes(cells, size, biome, chunkDist, seededRandom(featureSeed + 477));

  // Phase 5.475: scene-law fence-gap repair after modular stamps (and any
  // WU fence rings left with bare dirt punch-throughs). Origin-exempt.
  if (chunkX !== 0 || chunkY !== 0) {
    scanAndRepairFenceGaps(cells, size);
  }

  // Phase 5.48: modular scenes can overwrite soft terrain that previously held
  // a minimum quiz_gate — re-assert non-origin density after stamps.
  if (chunkX !== 0 || chunkY !== 0) {
    ensureMinimumQuizGates(cells, size, biome, seededRandom(featureSeed + 478), 1);
  }

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

  // Phase 7.5 (V1): final surface cohere after entropy/obstacles may have
  // reintroduced lone dirt/sand salt cells.
  cohereSurfacePatches(cells, size);

  // Phase 7.6 (V1.3): kill lone fence/wall posts that are not part of a run.
  removeOrphanStructures(cells, size);

  // Phase 7.7 (V3): kill lone water salt + free-floating roof shards.
  removeOrphanWater(cells, size);
  stripOrphanRoofShards(cells, size);

  // Phase 7.8: final min quiz_gate pass AFTER every stamp/cleanup that could
  // have erased earlier gates (modular scenes, balance, cohere, etc.).
  if (chunkX !== 0 || chunkY !== 0) {
    ensureMinimumQuizGates(cells, size, biome, seededRandom(featureSeed + 790), 1);
  }

  // Phase 8: playability validation (Solver F) (#46)
  // May carve grass shortcuts through diagonal obstacles when dead-end ratio
  // is high — that can punch holes in fence runs / homestead south. Place
  // coherence must run AFTER this phase.
  validatePlayability(cells, size, chunkX, chunkY, seededRandom(featureSeed + 700));

  // Phase 9: guarantee the player's fixed spawn point is walkable (2026-07-09
  // fix). Runs after every earlier phase that could place blocking content
  // near spawn — see ensureSpawnClearance's doc comment.
  if (chunkX === 0 && chunkY === 0) ensureSpawnClearance(cells);

  // Phase 9.5 (place-coherence PR2): LAST stamp repair — after passability,
  // orphan strip, playability carves, and spawn clearance. Origin is NOT
  // exempt: re-assert homestead south (PR1 finding: late phases clobber
  // gate/flanks to grass). Seal illegal fence-run dirt gaps with quiz_gate
  // via scene-invariants helpers only. Nothing after this may rewrite cells.
  runPlaceCoherencePass(cells, { chunkX, chunkY });

  return { cells, borderEdges };
}
