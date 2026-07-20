/**
 * gen.ts — World generation facade (re-exports only).
 *
 * B6 micro-slice 10.2 (#253): gen.ts is now a pure re-export facade.
 * All generation logic lives in `src/engine/world/`:
 *   - ChunkGenerator.ts — generateChunk, generateChunkSync, generateGridChunk
 *   - TerrainBuilder.ts — buildPerlinBase (Phase 1)
 *   - WorldUnitSolver.ts — solveWorldUnitGrid, stampWorldUnitGrid (Phases 2-3)
 *   - Passability.ts — enforcePassability, getWaterDebugInfo (Phases 4, 7)
 *   - Populator.ts — populateAnchors, clusterDecorations, scatterDecorations (Phase 5)
 *   - CollectibleScatterer.ts — scatterCollectibles, layCoinTrails (Phase 5)
 *   - ObstacleSolver.ts — placeQuizGates, placeBonfires, etc. (Phases 5.4-6.5)
 *   - EntropyCellFlags.ts — applyEntropyCellFlags (Phase 5.5)
 *   - Validation.ts — validatePlayability, getPlayabilityStats (Phase 8)
 *   - Entropy.ts — entropy pool + wordlist
 *   - BiomeSelector.ts — getChunkClimate, selectBiomeCoherent, deriveMood, etc.
 *   - GridUtils.ts — countWalkableNeighbors
 *   - WorldGrid.ts — WU_SIZE, GRID_DIM
 *
 * Consumers (main.ts, ui/ui.ts, tests) can import from either 'engine/gen'
 * (this facade) or directly from 'engine/world/<module>'. New code should
 * prefer importing from 'engine/world' barrel for new modules, or from
 * the specific module for legacy gen.ts re-exports.
 *
 * @see Docs/RefactoringPlan_11-06-26.md (Phase B)
 * @see Issue #253
 */

// --- Chunk Generation (pipeline) ---
export { generateChunk, generateChunkSync, setChunkGenObserver } from './world/ChunkGenerator';

// --- World Grid Constants ---
export { WU_SIZE, GRID_DIM } from './world/WorldGrid';

// --- Entropy Pool ---
export {
  setWordlist,
  getWordlist,
  feedEntropy,
  getEntropyStats,
  restoreEntropyBuffer,
  getEntropyBuffer,
  getDirectionPair,
} from './world/Entropy';

// --- Biome Selection / Climate / Mood ---
export {
  setBiomeNoiseSeed,
  getChunkClimate,
  selectBiomeCoherent,
  deriveMood,
  detectBiomeTransitions,
  type MoodProfile,
} from './world/BiomeSelector';

// --- Playability Validation ---
export { getPlayabilityStats, validatePlayability, type PlayabilityReport } from './world/Validation';

// --- Collectible Scattering ---
export { scatterCollectibles, layCoinTrails } from './world/CollectibleScatterer';

// --- Content Population ---
export { populateAnchors, clusterDecorations, scatterDecorations } from './world/Populator';

// --- Passability Enforcement ---
export { enforcePassability, getWaterDebugInfo } from './world/Passability';

// --- Obstacle Solver + Lock-Key DAG ---
export {
  placeQuizGates,
  sealTrivialQuizGateBypasses,
  ensureMinimumQuizGates,
  placeBonfires,
  placeGatesInFenceRuns,
  promoteDoorGates,
  addExtraObstacles,
  balanceObstacles,
  rewardDeadEnds,
  getLockKeyDebugInfo,
} from './world/ObstacleSolver';

// --- Grid Utilities ---
export { countWalkableNeighbors } from './world/GridUtils';
