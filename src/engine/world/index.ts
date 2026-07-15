/**
 * world/index.ts — Barrel re-exporting the engine/world/* modules.
 *
 * B3 micro-slice 8.6 (#253): the world/ layer now has 10 focused
 * modules (BiomeSelector, CollectibleScatterer, Entropy, GridUtils,
 * ObstacleSolver, Passability, Populator, Validation, WorldGrid,
 * WorldUnitSolver). This barrel gives consumers a single import
 * path for the public surface, e.g.:
 *
 *   import { WU_SIZE, GRID_DIM } from '../engine/world';
 *   import { buildAllArcs, propagateAC3 } from '../engine/world';
 *
 * The barrel does NOT re-export everything from each module — it
 * re-exports only the symbols that other layers (gen.ts, main.ts,
 * tests) need. Internal helpers stay file-private to each module.
 *
 * gen.ts continues to act as the world-gen facade (re-exports the
 * pipeline functions for backward compat with consumers that still
 * import from '../engine/gen'). New code should prefer importing
 * directly from this barrel.
 */

// --- World Grid Constants (8.6) ---
// Single source of truth for chunk grid dimensions.
export { WU_SIZE, GRID_DIM } from './WorldGrid';

// --- Biome Selection (slice 1) ---
export {
  setBiomeNoiseSeed,
  getChunkClimate,
  selectBiomeCoherent,
  deriveMood,
  detectBiomeTransitions,
  type MoodProfile,
} from './BiomeSelector';

// --- Validation (slice 3) ---
export { validatePlayability } from './Validation';

// --- Population (slice 5) ---
export {
  populateAnchors,
  clusterDecorations,
} from './Populator';

// --- Grid Utilities (slice 5) ---
export { countWalkableNeighbors } from './GridUtils';

// --- Passability (slice 6) ---
export { enforcePassability, getWaterDebugInfo } from './Passability';

// --- Obstacle Solver (slice 7) ---
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
} from './ObstacleSolver';

// --- Collectible Scatterer (slice 4) ---
export { scatterCollectibles, layCoinTrails } from './CollectibleScatterer';

// --- Terrain Builder (B5 / #253) ---
// Phase 1 of chunk generation: Perlin noise base terrain.
export { buildPerlinBase } from './TerrainBuilder';

// --- Chunk Generator (B6 / #253) ---
// The chunk generation pipeline orchestrator — generateChunk (async, LLM),
// generateChunkSync (sync, deterministic), and the internal pipeline
// coordinator. This is the single entry point for generating a chunk.
export { generateChunk, generateChunkSync } from './ChunkGenerator';

// --- Entropy Cell Flags (B5 / #253) ---
// Phase 5.5: LLM entropy → cell property variation (#4).
export { applyEntropyCellFlags } from './EntropyCellFlags';

// --- Entropy Pool (slice 0 + 8.1) ---
export {
  setWordlist,
  getWordlist,
  feedEntropy,
  getEntropyStats,
  restoreEntropyBuffer,
  getEntropyBuffer,
  getDirectionPair,
} from './Entropy';

// --- World Unit Solver (slice 8: 8.1-8.5) ---
// The AC-3 solver's public surface — orchestrator + MRV + arc
// construction + propagation + corner governance + chain integrity.
export {
  // pure helpers
  traversalCompatible,
  weightedSelectTemplate,
  findTerminator,
  // corner governance
  getCornerSurface,
  validateCornerGovernance,
  // AC-3 budget + arc construction + propagation
  MAX_PROPAGATION_ITERATIONS,
  OPPOSITES,
  buildAllArcs,
  propagateAC3,
  getArcsAffectedBy,
  propagateAC3Partial,
  // MRV collapse
  collapseAllMRV,
  // 8.5: top-level orchestrator + helpers
  buildBiomeCandidatePool,
  findFallbackTemplate,
  applyBorderConstraints,
  solveWorldUnitGrid,
  stampWorldUnitGrid,
  extractGridBorderEdges,
  enforceChainIntegrity,
  // 8.5: types
  type WeightedCandidate,
  type SlotState,
} from './WorldUnitSolver';
