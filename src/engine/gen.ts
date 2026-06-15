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
// 8.5 (#253): top-level solver orchestration (biome pool, border constraints,
// stamp, chain integrity, border extraction, MRV orchestrator) all live in
// WorldUnitSolver.ts. gen.ts only needs the two public orchestrator
// functions for the generateGridChunk pipeline; the other 5 helpers
// (buildBiomeCandidatePool, findFallbackTemplate, applyBorderConstraints,
// extractGridBorderEdges, enforceChainIntegrity) are file-private inside
// the module and called only by solveWorldUnitGrid.
// `findTerminator`, `buildAllArcs`, `propagateAC3`, `collapseAllMRV` (8.1-8.4)
// are also no longer imported here — they're called internally by the
// orchestrator `solveWorldUnitGrid` inside WorldUnitSolver.ts.
import { solveWorldUnitGrid, stampWorldUnitGrid } from './world/WorldUnitSolver';
// B3 micro-slice 8.6 (#253): WU_SIZE + GRID_DIM are imported from
// WorldGrid.ts (the single source of truth shared with
// WorldUnitSolver.ts, Populator.ts, and terrain-cache.ts) and
// re-exported for backward compat with consumers that still
// `import { WU_SIZE, GRID_DIM } from '../engine/gen'`.
import { WU_SIZE, GRID_DIM } from './world/WorldGrid';
// B5 micro-slice 9.1 (#253): buildPerlinBase moved to
// ./world/TerrainBuilder.ts (Phase 1: Perlin noise base terrain).
import { buildPerlinBase } from './world/TerrainBuilder';

// Re-export for backward compat — pre-8.6 consumers (e.g. tests) that
// import WU_SIZE / GRID_DIM from gen.ts continue to work.
export { WU_SIZE, GRID_DIM } from './world/WorldGrid';

// --- Types ---
// B4 micro-slice 8.7+8.8 (#253): CellData, ChunkBorderEdges, BorderConstraints,
// ChunkData, and GridChunkResult live in src/types/game.types.ts (the single
// source of truth shared by engine, rendering, and game layers). gen.ts
// imports them below; consumers import directly from game.types.ts.
// `MoodProfile` lives in ./world/BiomeSelector.ts (B3 / #253) and is
// imported + re-exported above; game.types.ts re-imports it for ChunkData.
import type {
  CellData,
  BorderConstraints,
  ChunkData,
  GridChunkResult,
} from '../types/game.types';

// --- Entropy State ---
// Moved to ./world/Entropy.ts (B3 / #253). The entropy pool + wordlist + direction
// pair helper now live there; the public API is re-exported above so importers are
// unaffected. Internal generation code below uses the imported accessors.

// --- Biome Selection / Climate / Mood ---
// Moved to ./world/BiomeSelector.ts (B3 / #253): setBiomeNoiseSeed, getChunkClimate,
// selectBiomeCoherent, deriveMood, detectBiomeTransitions, and the MoodProfile type.
// Imported + re-exported above so importers (main.ts) are unaffected.

// --- World Unit Grid Constants ---
// B3 micro-slice 8.6 (#253): WU_SIZE + GRID_DIM moved to WorldGrid.ts.
// They are imported at the top of this file and re-exported for backward
// compat (legacy consumers that `import { WU_SIZE, GRID_DIM } from '../engine/gen'`).
// Do NOT redeclare them here — they come from WorldGrid.ts.

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
// GridChunkResult moved to src/types/game.types.ts (B4 / #253); imported above.

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

// --- Phase 8: Playability Validation (Solver F) (#46) ---
// Moved to ./world/Validation.ts (B3 / #253). `validatePlayability` is imported above
// and called in generateGridChunk; `getPlayabilityStats` + `PlayabilityReport` are
// re-exported above.

// --- Phase 1: Perlin Noise Base Terrain ---
// B5 micro-slice 9.1 (#253): buildPerlinBase + assignTerrainCell +
// findClimateCompatibleTile moved to ./world/TerrainBuilder.ts.
// gen.ts imports buildPerlinBase above and calls it from generateGridChunk.

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
//
// B3 micro-slice 8.5 (#253): the full Phase 2 orchestrator and the helpers
// (biome candidate pool, border-constraint application, MRV/AC-3 collapse,
// chain-integrity enforcement, border-edge extraction, and the Phase 3
// cell stamper) all moved to ./world/WorldUnitSolver.ts. gen.ts is now
// just the Phases 1/4/5/6 orchestrator: build base terrain, solve, stamp,
// enforce passability, populate, place obstacles/collectibles/bonfires,
// apply entropy flags.
//
// The `WeightedCandidate` and `SlotState` types live inside
// WorldUnitSolver.ts as the solver's internal types; consumers that
// previously imported them from gen.ts should import from
// `engine/world/WorldUnitSolver` instead.

// --- AC-3 Solver Budget ---
// `MAX_PROPAGATION_ITERATIONS` lives in ./world/WorldUnitSolver.ts (8.3 / #253).

// --- Traversal Continuity Check (#42) ---
// `traversalCompatible` lives in ./world/WorldUnitSolver.ts (8.1 / #253).

// --- Corner Governance (#42) ---
// `getCornerSurface` + `validateCornerGovernance` live in
// ./world/WorldUnitSolver.ts (8.2 / #253).

// --- Arc Construction + AC-3 Constraint Propagation ---
// `OPPOSITES`, `buildAllArcs`, `propagateAC3`, and `getArcsAffectedBy` all
// live in ./world/WorldUnitSolver.ts (8.3 / #253).

// --- Slot Selection Priority + MRV Collapse ---
// `slotPriority` and `collapseAllMRV` live in ./world/WorldUnitSolver.ts
// (8.4 / #253).

/** Partial AC-3 propagation from a specific worklist. */
// `propagateAC3Partial` lives in ./world/WorldUnitSolver.ts (8.3 / #253).

// `weightedSelectTemplate` lives in ./world/WorldUnitSolver.ts (8.1 / #253).

// `findTerminator` lives in ./world/WorldUnitSolver.ts (8.1 / #253); used
// by `enforceChainIntegrity` for recovery on dangling chains.

// --- Phase 3: Stamp Grid onto Cells ---
// (Phase 3 of generateGridChunk; called immediately after solveWorldUnitGrid.)
// B3 micro-slice 8.5 (#253): `stampWorldUnitGrid` lives in
// ./world/WorldUnitSolver.ts; gen.ts calls it with (cells, grid, GRID_DIM, WU_SIZE).

// --- Phase 4: Passability Enforcement ---
// `enforcePassability` and the file-local `validateWaterIntegrity` helper
// were moved to src/engine/world/Passability.ts (B3 / #253). The water
// debug state (`_lastWaterDebug`) and the public `getWaterDebugInfo()`
// getter also live with Passability; gen.ts re-exports the getter for
// API stability (consumed by main.ts and ui/ui.ts).

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
