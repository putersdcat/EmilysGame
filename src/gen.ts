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

import { WORLD_CONFIG, getDifficulty, type DifficultyProfile } from './config/game.config';
import { ASSET_DEFS } from './config/assets.config';
import { getBiome, type BiomeDef } from './config/biomes.config';
import {
  sha256,
  fastHash,
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
  tileMatchesClimate,
  type EdgeTag,
  type RotatedTemplate,
  type Cardinal,
} from './config/tiles.config';
import type { TileType } from './tiles';

// --- Types ---

/** Mood category derived from entropy seed — biases template selection (#46) */
export interface MoodProfile {
  category: 'open' | 'river-heavy' | 'enclosed' | 'path-heavy' | 'fortified' | 'sparse';
  /** Weight modifiers for template categories. Applied additively to biome weights. */
  modifiers: Record<string, number>;
}

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
// The entropy pool grows over the session as NPC chat words, quiz answers,
// and LLM outputs concatenate. It salts chunk generation for evolving worlds. (#4)

let wordlist: string[] = [];
let lastEntropyOutput = '';
let entropyBuffer = '';
let entropyFeedCount = 0; // Number of external feeds (NPC chat, quiz, etc.)

export function setWordlist(list: string[]): void {
  wordlist = list;
}

export function getWordlist(): string[] {
  return wordlist;
}

/**
 * Feed external text into the entropy pool.
 * Called when NPC dialog, quiz answers, or player chat occurs.
 * The text is appended to the growing entropy buffer, which salts
 * future chunk generation for evolving, player-influenced worlds. (#4)
 */
export function feedEntropy(text: string): void {
  if (!text || text.length === 0) return;
  entropyBuffer += text;
  entropyFeedCount++;
}

/** Get entropy pool stats for debug display. */
export function getEntropyStats(): { poolSize: number; feedCount: number; lastOutput: string } {
  return {
    poolSize: entropyBuffer.length,
    feedCount: entropyFeedCount,
    lastOutput: lastEntropyOutput.slice(0, 40),
  };
}

/** Restore entropy buffer from save data. feedCount approximated from buffer length. */
export function restoreEntropyBuffer(buffer: string): void {
  entropyBuffer = buffer || '';
  // Approximate feedCount from buffer (avg ~40 chars per feed)
  entropyFeedCount = entropyBuffer.length > 0 ? Math.max(1, Math.round(entropyBuffer.length / 40)) : 0;
}

/** Get entropy buffer for saving. */
export function getEntropyBuffer(): string {
  return entropyBuffer;
}

// --- Direction Pair ---

export function getDirectionPair(direction: string, rng: () => number): string {
  const table = DIRECTION_WORDS[direction] || DIRECTION_WORDS['right'];
  const verb = table.verbs[Math.floor(rng() * table.verbs.length)];
  const noun = table.nouns[Math.floor(rng() * table.nouns.length)];
  return `${verb} ${noun}`;
}

/**
 * Distance-based biome selection with spatial coherence via Perlin noise.
 * Uses a low-frequency Perlin noise field to create contiguous biome regions
 * instead of per-chunk random selection.
 *
 * The noise value selects from biomes available at the current distance tier,
 * producing smooth biome boundaries that feel natural.
 * TODO: DOC — biome coherence via Perlin noise field (WorldEngine-03 §4)
 */

// Global biome noise - seeded once per session for consistent spatial biome map.
// Uses a very low frequency (0.015) so biome regions span many chunks.
let _biomeNoise: PerlinNoise | null = null;
let _biomeNoiseSeed = 42;

/** Set seed for biome noise field (called at game start for session consistency) */
export function setBiomeNoiseSeed(seed: number): void {
  _biomeNoiseSeed = seed;
  _biomeNoise = null; // Reset so it reconstructs on next use
  _moistureNoise = null; // #101: reset climate noise too
  _tempNoise = null;
}

function getBiomeNoise(): PerlinNoise {
  if (!_biomeNoise) {
    _biomeNoise = new PerlinNoise(_biomeNoiseSeed);
  }
  return _biomeNoise;
}

// ─── Chunk-level climate from noise fields (#101) ────────────
// Derives moisture & temperature per chunk for biome-aware tile selection.
// Uses separate noise channels from biome selection so climate doesn't
// perfectly align with biome boundaries (creating natural variation).

let _moistureNoise: PerlinNoise | null = null;
let _tempNoise: PerlinNoise | null = null;

function getMoistureNoise(): PerlinNoise {
  if (!_moistureNoise) _moistureNoise = new PerlinNoise(_biomeNoiseSeed + 3141);
  return _moistureNoise;
}
function getTempNoise(): PerlinNoise {
  if (!_tempNoise) _tempNoise = new PerlinNoise(_biomeNoiseSeed + 2718);
  return _tempNoise;
}

/** Derive chunk-level climate (moisture + temperature in 0-1 range) from noise. */
export function getChunkClimate(chunkX: number, chunkY: number): { moisture: number; temperature: number } {
  const m = (getMoistureNoise().noise(chunkX * 0.06, chunkY * 0.06) + 1) / 2;
  const t = (getTempNoise().noise(chunkX * 0.05, chunkY * 0.05) + 1) / 2;
  return { moisture: m, temperature: t };
}

/**
 * Biome selection with spatial coherence.
 * - Low-frequency Perlin noise creates spatially coherent biome regions.
 * - Distance from origin gates which biomes are available (progression).
 * - Two noise channels (biome type + variation) create organic shapes.
 * - LLM entropy bias (#175) shifts thresholds so biome boundaries vary per-chunk.
 */
export function selectBiomeCoherent(chunkX: number, chunkY: number, entropyBias = 0.5): BiomeDef {
  const dist = Math.max(Math.abs(chunkX), Math.abs(chunkY));
  const noise = getBiomeNoise();

  // Two noise channels at different frequencies for organic boundaries
  const biomeVal = (noise.noise(chunkX * 0.08, chunkY * 0.08) + 1) / 2; // 0-1
  const subVal = (noise.noise(chunkX * 0.15 + 100, chunkY * 0.15 + 100) + 1) / 2; // 0-1

  // #175: LLM entropy shifts boundary thresholds (±0.075 max)
  const shift = (entropyBias - 0.5) * 0.15;

  // Build available biome pool based on distance (progression gating)
  if (dist <= 2) {
    // Safe zone: meadow only (unaffected by entropy)
    return getBiome(0);
  }

  if (dist <= 4) {
    // Meadow + forest transition zone
    // Use noise + entropy bias to create coherent meadow/forest boundary
    return getBiome((biomeVal + shift) < 0.65 ? 0 : 1);
  }

  if (dist <= 6) {
    // Meadow + forest + cave emerges
    const adjusted = biomeVal + shift;
    if (adjusted < 0.35) return getBiome(0);       // meadow
    if (adjusted < 0.70) return getBiome(1);        // forest
    return getBiome(2);                              // cave
  }

  // dist 7+: all biomes, noise-driven regions with entropy influence
  // Primary noise selects major biome, sub-noise adds variation at boundaries
  const combined = biomeVal * 0.7 + subVal * 0.3 + shift;
  if (combined < 0.20) return getBiome(0);       // meadow (~20%)
  if (combined < 0.50) return getBiome(1);        // forest (~30%)
  if (combined < 0.75) return getBiome(2);        // cave (~25%)
  return getBiome(3);                              // castle (~25%)
}

// --- Mood Profile System (#46) ---
// Derives a "mood" from the entropy seed that biases template selection weights.
// Deterministic: same seed → same mood.

const MOOD_CATEGORIES: MoodProfile['category'][] = [
  'open', 'river-heavy', 'enclosed', 'path-heavy', 'fortified', 'sparse',
];

/** Modifier tables per mood category. Values are additive to biome weights. */
const MOOD_MODIFIERS: Record<MoodProfile['category'], Record<string, number>> = {
  'open': {
    meadow_base: 0.3, forest_clearing: 0.2, dirt_clearing: 0.2,
  },
  'river-heavy': {
    river_straight_ns: 0.4, river_straight_ew: 0.4, river_bend_ne: 0.4, river_bend_nw: 0.4,
    river_end_pond: 0.4, river_t_junction: 0.4, river_crossroads: 0.4, river_island: 0.4,
    bridge_ns: 0.3, bridge_ew: 0.3,
    shore_n: 0.2, shore_corner_ne: 0.2,
    water_garden: 0.3,
  },
  'enclosed': {
    fence_enclosure: 0.3, fenced_yard: 0.3, fenced_garden: 0.3, fence_row: 0.3,
    wall_segment: 0.3, wall_gate: 0.3, wall_corner: 0.3, wall_end: 0.3,
    wall_bastion: 0.3, wall_corner_capped: 0.3,
  },
  'path-heavy': {
    dirt_path_ns: 0.4, dirt_path_ew: 0.4,
    path_bend_ne: 0.3, path_t_junction: 0.3, path_crossroads: 0.3, path_dead_end: 0.3,
    spiral_path: 0.3, sand_path: 0.3,
  },
  'fortified': {
    wall_segment: 0.4, wall_gate: 0.4, wall_corner: 0.4, wall_end: 0.4,
    guard_tower: 0.3, gatehouse: 0.3,
    fortified_passage: 0.3, wall_bastion: 0.3, wall_t_junction: 0.3,
  },
  'sparse': {
    meadow_base: 0.5, dirt_clearing: 0.3, sandy_patch: 0.2,
    // sparse applies a global -0.1 penalty handled in buildBiomeCandidatePool
  },
};

/**
 * Derive a mood profile from a seed string.
 * Uses character frequency analysis to deterministically select a mood category.
 */
export function deriveMood(seed: string): MoodProfile {
  if (!seed || seed.length === 0) {
    return { category: 'open', modifiers: { ...MOOD_MODIFIERS['open'] } };
  }

  // Character frequency analysis: count vowels, consonants, digits, symbols
  let vowels = 0, consonants = 0, digits = 0, symbols = 0;
  const vowelSet = new Set('aeiouAEIOU');
  const letterRe = /[a-zA-Z]/;

  for (let i = 0; i < seed.length; i++) {
    const ch = seed[i];
    if (vowelSet.has(ch)) vowels++;
    else if (letterRe.test(ch)) consonants++;
    else if (ch >= '0' && ch <= '9') digits++;
    else symbols++;
  }

  // Weight each category based on char frequency ratios
  const total = seed.length || 1;
  const vRatio = vowels / total;
  const cRatio = consonants / total;
  const dRatio = digits / total;
  const sRatio = symbols / total;

  // Score each mood
  const scores: number[] = [
    vRatio * 3 + 0.1,                                // open: vowel-heavy
    dRatio * 4 + sRatio * 2 + 0.05,                  // river-heavy: digits/symbols
    cRatio * 3 + sRatio + 0.05,                       // enclosed: consonant-heavy
    (vRatio + cRatio) * 2 + 0.1,                      // path-heavy: balanced letters
    cRatio * 2 + dRatio * 2 + 0.05,                   // fortified: consonants + digits
    sRatio * 3 + (1 - vRatio - cRatio) * 2 + 0.05,   // sparse: symbol-heavy
  ];

  // Add deterministic salt from hash to break ties and add variety
  const hash = fastHash(seed);
  for (let i = 0; i < scores.length; i++) {
    scores[i] += ((hash >>> (i * 5)) & 0x1F) / 31 * 0.3;
  }

  // Pick highest scoring category
  let bestIdx = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[bestIdx]) bestIdx = i;
  }

  const category = MOOD_CATEGORIES[bestIdx];
  return { category, modifiers: { ...MOOD_MODIFIERS[category] } };
}

// --- Biome Transition Detection (#46) ---

/**
 * Detect biome transitions by comparing the biome at (cx, cy) with its 4 neighbors.
 * Returns flags indicating which borders are transition zones.
 */
export function detectBiomeTransitions(
  cx: number, cy: number, entropyBias = 0.5,
): { n: boolean; s: boolean; e: boolean; w: boolean } {
  const myBiome = selectBiomeCoherent(cx, cy, entropyBias);
  return {
    n: selectBiomeCoherent(cx, cy - 1, entropyBias).id !== myBiome.id,
    s: selectBiomeCoherent(cx, cy + 1, entropyBias).id !== myBiome.id,
    e: selectBiomeCoherent(cx + 1, cy, entropyBias).id !== myBiome.id,
    w: selectBiomeCoherent(cx - 1, cy, entropyBias).id !== myBiome.id,
  };
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
  const pairIndex = coordHash % wordlist.length;
  const pair = wordlist[pairIndex] || 'obliterate quasar';
  // Salt with entropy pool for player-influenced variation (#4)
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
  placeGatesInFenceRuns(cells, size, seededRandom(featureSeed + 472), biome);

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

/** Accumulated validation metrics across all chunks for debugging. */
let _validationAccum = {
  chunksValidated: 0,
  avgDeadEndRatio: 0,
  avgWalkableRatio: 0,
  avgCollectibleDensity: 0,
  repairsApplied: 0,
  deadEndExcessChunks: 0,
  densityOffTargetChunks: 0,
};

export interface PlayabilityReport {
  walkableRatio: number;       // fraction of walkable cells
  deadEndCount: number;        // cells with exactly 1 walkable neighbor
  deadEndRatio: number;        // deadEnds / walkable cells
  collectibleCount: number;    // total items
  npcCount: number;
  obstacleCount: number;
  collectibleDensity: number;  // items per 100 walkable cells
  valid: boolean;              // true if all checks pass
  repairs: string[];           // list of repairs applied
}

/**
 * Solver F: validate playability metrics and apply targeted repairs.
 * Checks: walkable ratio, dead-end ratio, collectible density.
 * Repairs: carves paths through excessive dead-ends, adds/removes items for density.
 */
export function validatePlayability(
  cells: CellData[][],
  size: number,
  _chunkX: number,
  _chunkY: number,
  rng: () => number,
): PlayabilityReport {
  const repairs: string[] = [];

  // Count cells by type
  let walkable = 0, deadEnds = 0, collectibles = 0, npcs = 0, obstacles = 0;
  const deadEndCells: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (cell.walkable) {
        walkable++;
        // Count walkable neighbors
        let wn = 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) wn++;
        }
        if (wn === 1) {
          deadEnds++;
          deadEndCells.push({ x, y });
        }
      } else {
        obstacles++;
      }
      if (cell.itemId) collectibles++;
      if (cell.npcId) npcs++;
    }
  }

  const totalCells = size * size;
  const walkableRatio = walkable / totalCells;
  const deadEndRatio = walkable > 0 ? deadEnds / walkable : 0;
  const collectibleDensity = walkable > 0 ? (collectibles / walkable) * 100 : 0;

  // Check 1: Dead-end ratio (target: ≤ 30%)
  const MAX_DEAD_END_RATIO = 0.30;
  if (deadEndRatio > MAX_DEAD_END_RATIO) {
    // Repair: connect some dead-ends to nearest walkable neighbor
    const excess = Math.ceil((deadEndRatio - MAX_DEAD_END_RATIO) * walkable);
    const toFix = Math.min(excess, deadEndCells.length);
    let fixed = 0;

    for (let i = 0; i < deadEndCells.length && fixed < toFix; i++) {
      const de = deadEndCells[i];
      // Try each diagonal neighbor to create a shortcut
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = de.x + dx, ny = de.y + dy;
        if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
        if (cells[ny][nx].walkable) continue; // already open
        if (cells[ny][nx].npcId || cells[ny][nx].itemId) continue; // don't destroy content
        // Carve through
        cells[ny][nx] = {
          ...cells[ny][nx],
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        };
        fixed++;
        break;
      }
    }
    if (fixed > 0) {
      repairs.push(`carved ${fixed} shortcuts to reduce dead-end ratio`);
    }
    _validationAccum.repairsApplied += fixed;
    _validationAccum.deadEndExcessChunks++;
  }

  // Check 2: Collectible density (target: 2-15 items per 100 walkable cells)
  const MIN_DENSITY = 2;
  const MAX_DENSITY = 15;
  if (collectibleDensity < MIN_DENSITY && walkable > 0) {
    // Add some coins to reach minimum
    const needed = Math.ceil((MIN_DENSITY * walkable / 100) - collectibles);
    let added = 0;
    for (let attempt = 0; attempt < needed * 3 && added < needed; attempt++) {
      const x = 1 + Math.floor(rng() * (size - 2));
      const y = 1 + Math.floor(rng() * (size - 2));
      const cell = cells[y][x];
      if (cell.walkable && !cell.itemId && !cell.npcId) {
        cell.itemId = 'coin';
        added++;
      }
    }
    if (added > 0) {
      repairs.push(`added ${added} coins to meet minimum density`);
      _validationAccum.repairsApplied += added;
    }
    _validationAccum.densityOffTargetChunks++;
  } else if (collectibleDensity > MAX_DENSITY && walkable > 0) {
    // Remove excess items (coins first, to preserve keys/important items)
    const excess = Math.ceil(collectibles - (MAX_DENSITY * walkable / 100));
    let removed = 0;
    for (let y = 0; y < size && removed < excess; y++) {
      for (let x = 0; x < size && removed < excess; x++) {
        const cell = cells[y][x];
        if (cell.itemId === 'coin' && rng() < 0.5) {
          cell.itemId = undefined;
          removed++;
        }
      }
    }
    if (removed > 0) {
      repairs.push(`removed ${removed} excess coins to reduce density`);
      _validationAccum.repairsApplied += removed;
    }
    _validationAccum.densityOffTargetChunks++;
  }

  const valid = repairs.length === 0;

  // Update accumulator
  _validationAccum.chunksValidated++;
  const n = _validationAccum.chunksValidated;
  _validationAccum.avgDeadEndRatio = (_validationAccum.avgDeadEndRatio * (n - 1) + deadEndRatio) / n;
  _validationAccum.avgWalkableRatio = (_validationAccum.avgWalkableRatio * (n - 1) + walkableRatio) / n;
  _validationAccum.avgCollectibleDensity = (_validationAccum.avgCollectibleDensity * (n - 1) + collectibleDensity) / n;

  return {
    walkableRatio,
    deadEndCount: deadEnds,
    deadEndRatio,
    collectibleCount: collectibles,
    npcCount: npcs,
    obstacleCount: obstacles,
    collectibleDensity,
    valid,
    repairs,
  };
}

/** Get cumulative playability validation metrics. */
export function getPlayabilityStats(): typeof _validationAccum {
  return { ..._validationAccum };
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
  // Second noise channel at lower frequency for spatially coherent terrain type selection.
  // This replaces Math.random() so nearby cells get the same terrain type → larger patches.
  const terrainTypeNoise = new PerlinNoise(noiseSeed + 7777);
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
      cells[y][x] = assignTerrainCell(density, biome, typeNoise, climate);
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
    const assetKey = weightedPick(biome.obstacleWeights, Math.random());
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
// When both edges are 'open' or 'path', traversal channels must match.
const TRAVERSAL_EDGE_TYPES = new Set<EdgeTag>(['open', 'path']);

function traversalCompatible(
  a: RotatedTemplate,
  b: RotatedTemplate,
  aSide: Cardinal,
  bSide: Cardinal,
): boolean {
  if (!TRAVERSAL_EDGE_TYPES.has(a.edgeTags[aSide]) || !TRAVERSAL_EDGE_TYPES.has(b.edgeTags[bSide])) {
    return true; // only enforce on open/path edges
  }
  return a.traversalChannels[aSide] === b.traversalChannels[bSide];
}

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

function findTerminator(
  baseName: string,
  allRotations: Map<string, RotatedTemplate[]>,
): RotatedTemplate | null {
  if (baseName.startsWith('river_')) {
    const pondRots = allRotations.get('river_end_pond');
    if (pondRots && pondRots.length > 0) return pondRots[0];
  }
  if (baseName.startsWith('wall_') || baseName === 'guard_tower') {
    const wallEndRots = allRotations.get('wall_end');
    if (wallEndRots && wallEndRots.length > 0) return wallEndRots[0];
  }
  if (baseName.startsWith('dirt_path') || baseName.startsWith('path_')) {
    const pathEndRots = allRotations.get('path_dead_end');
    if (pathEndRots && pathEndRots.length > 0) return pathEndRots[0];
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
  // Only force center walkable if it's not water (#100: protect water cells)
  if (cells[center.y][center.x].assetKey !== 'water') {
    cells[center.y][center.x].walkable = true;
    cells[center.y][center.x].assetKey = 'grass';
  }

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
      // #100: Never carve through water or bridge cells — preserve river integrity
      if (!cells[y][x].walkable && cells[y][x].assetKey !== 'water' && cells[y][x].assetKey !== 'bridge') {
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
    // #100: Don't overwrite water cells at edge entry points
    if (cells[ep.y][ep.x].assetKey !== 'water' && cells[ep.y][ep.x].assetKey !== 'bridge') {
      cells[ep.y][ep.x] = { assetKey: 'grass', walkable: true, interactable: false };
    }
  }

  // #100: Validate river integrity — water cells must remain non-walkable
  validateWaterIntegrity(cells, size);
}

/**
 * #100: Validate that all water cells remain non-walkable after passability enforcement.
 * Also counts river segments and crossing points for debug purposes.
 */
let _lastWaterDebug = { waterCells: 0, bridgeCells: 0, leaks: 0 };
export function getWaterDebugInfo(): { waterCells: number; bridgeCells: number; leaks: number } {
  return { ..._lastWaterDebug };
}

function validateWaterIntegrity(cells: CellData[][], size: number): void {
  let waterCells = 0;
  let bridgeCells = 0;
  let leaks = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (cell.assetKey === 'water') {
        waterCells++;
        // Fix any leaked walkability on water cells
        if (cell.walkable) {
          cell.walkable = false;
          leaks++;
        }
      } else if (cell.assetKey === 'bridge') {
        bridgeCells++;
        // Bridge must always be walkable
        if (!cell.walkable) {
          cell.walkable = true;
        }
      }
    }
  }

  _lastWaterDebug = { waterCells, bridgeCells, leaks };

  if (leaks > 0 && typeof window !== 'undefined' && (window as any).__DEBUG_GEN) {
    console.warn(`[gen] Water integrity: fixed ${leaks} walkable water cell leaks`);
  }
}

// --- Phase 5: Content Population ---
// Places NPCs, items, decorations, and collectibles onto the generated terrain.
// Uses template anchor points + biome weights. See WorldEngine-05-PopulationAndProgression.md.

/** Biome-specific decoration palettes for SCATTER (must all be walkable!) */
const BIOME_SCATTER_DECORATIONS: Record<string, string[]> = {
  meadow:  ['flower', 'flower', 'flower_pink', 'flower_red', 'sunflower', 'mushroom', 'tall_plant', 'stump'],
  forest:  ['mushroom', 'mushroom', 'flower', 'flower_pink', 'tall_plant', 'stump', 'stump'],
  cave:    ['mushroom', 'mushroom', 'stump'],
  castle:  ['flower', 'flower_red', 'stump'],
};

/** Biome-specific decoration palettes for ANCHOR placement (may include non-walkable) */
const BIOME_ANCHOR_DECORATIONS: Record<string, string[]> = {
  meadow:  ['flower', 'flower_pink', 'flower_red', 'sunflower', 'bush', 'mushroom', 'tall_plant'],
  forest:  ['mushroom', 'bush', 'tree', 'tree_pine', 'tall_plant', 'stump'],
  cave:    ['rock', 'mushroom', 'stump'],
  castle:  ['wall', 'rock', 'tall_plant'],
};

/** Biome-specific NPC pools for anchor roles — includes biome-specific NPCs (Doc 05 §4.2) */
const BIOME_NPC_POOL: Record<string, string[]> = {
  meadow:  ['npc_villager', 'npc_merchant', 'npc_farmer', 'npc_beekeeper', 'npc_cat', 'npc_cat'],
  forest:  ['npc_villager', 'npc_merchant', 'npc_ranger', 'npc_hermit', 'npc_cat', 'npc_black_cat'],
  cave:    ['npc_guardian', 'npc_merchant', 'npc_miner', 'npc_miner', 'npc_black_cat'],
  castle:  ['npc_guardian', 'npc_guardian', 'npc_merchant', 'npc_knight', 'npc_ghost', 'npc_cat'],
};

/** NPC id mapping by asset key — default persona fallbacks */
const NPC_ID_MAP: Record<string, string> = {
  npc_merchant: 'merchant_default',
  npc_villager: 'villager_default',
  npc_guardian: 'guardian_default',
  npc_cat: 'cat_default',
  npc_black_cat: 'black_cat_default',
  npc_farmer: 'farmer_meadow',
  npc_beekeeper: 'beekeeper_meadow',
  npc_ranger: 'ranger_forest',
  npc_hermit: 'hermit_forest',
  npc_miner: 'miner_cave',
  npc_ghost: 'ghost_castle',
  npc_knight: 'knight_castle',
};

/**
 * Phase 5a: Place entities at template anchor points.
 * Each anchor role maps to a placement strategy:
 *   - 'npc'        → place an NPC from biome pool
 *   - 'item'       → place a collectible (coin, key, potion) based on biome feature weights
 *   - 'decoration' → place a biome-appropriate decorative object
 *   - 'feature'    → place a chest or sign (special interactive)
 *
 * NPC Cap (#104): Max 1 NPC per world unit (5×5 slot). When multiple NPC anchors
 * exist, the first eligible one wins. Priority: gate-adjacent > junction > pool.
 */
export function populateAnchors(
  cells: CellData[][],
  grid: (RotatedTemplate | null)[][],
  biome: BiomeDef,
  rng: () => number,
  difficulty?: DifficultyProfile,
): void {
  // #104: Track which world-unit slots already have an NPC placed
  const npcPlacedInUnit = new Set<string>();
  // Debug counters
  let npcAttempts = 0;
  let npcPlaced = 0;
  let npcDropped = 0;

  for (let gy = 0; gy < GRID_DIM; gy++) {
    for (let gx = 0; gx < GRID_DIM; gx++) {
      const template = grid[gy][gx];
      if (!template || !template.anchors) continue;

      const baseX = gx * WU_SIZE;
      const baseY = gy * WU_SIZE;
      const unitKey = `${gy},${gx}`;

      for (const anchor of template.anchors) {
        const cx = baseX + anchor.x;
        const cy = baseY + anchor.y;
        if (cy >= cells.length || cx >= cells[0].length) continue;

        const cell = cells[cy][cx];
        // Skip if cell is already occupied by a non-terrain object
        if (!cell.walkable && cell.assetKey !== 'grass' && cell.assetKey !== 'dirt') continue;

        switch (anchor.role) {
          case 'npc':
            npcAttempts++;
            // #104: enforce max-1 NPC per world unit
            if (npcPlacedInUnit.has(unitKey)) {
              npcDropped++;
              break;
            }
            if (placeNpcAtCell(cells, cx, cy, biome, rng, difficulty)) {
              npcPlacedInUnit.add(unitKey);
              npcPlaced++;
            }
            break;
          case 'item':
            placeItemAtCell(cells, cx, cy, biome, rng);
            break;
          case 'decoration':
            placeDecorationAtCell(cells, cx, cy, biome, rng);
            break;
          case 'feature':
            placeFeatureAtCell(cells, cx, cy, biome, rng);
            break;
          // #101: new anchor roles — fall through to decoration for now
          case 'merchant':
          case 'quest':
            // Merchant/quest anchors place NPCs when supported
            if (!npcPlacedInUnit.has(unitKey)) {
              if (placeNpcAtCell(cells, cx, cy, biome, rng, difficulty)) {
                npcPlacedInUnit.add(unitKey);
                npcPlaced++;
              }
            }
            break;
          case 'waypoint':
          case 'spawn':
          case 'landmark':
          case 'puzzle':
            // TODO: DOC — new anchor roles placeholder, treat as decoration
            placeDecorationAtCell(cells, cx, cy, biome, rng);
            break;
        }
      }
    }
  }

  // Debug logging for NPC population (#104)
  if (typeof window !== 'undefined' && (window as any).__DEBUG_GEN) {
    console.log(`[gen] NPC pop: ${npcPlaced} placed, ${npcDropped} dropped (cap), ${npcAttempts} attempts`);
  }
}

function placeNpcAtCell(
  cells: CellData[][], cx: number, cy: number,
  biome: BiomeDef, rng: () => number,
  difficulty?: DifficultyProfile,
): boolean {
  // Respect biome NPC rate (skip some NPCs at random)
  if (rng() > biome.npcRate * 0.3) return false; // ~30% chance per anchor × npcRate

  const size = cells.length;

  // Clearance check: don't place NPCs in narrow 1-cell corridors (Doc 05 §4.3)
  // Need at least 2 walkable cardinal neighbors to ensure player can pass
  const walkableNeighbors = countWalkableNeighbors(cells, cx, cy, size);
  if (walkableNeighbors < 2) return false;

  // Difficulty-aware NPC selection: higher guardianRatio biases toward guardians
  const guardianRatio = difficulty?.guardianRatio ?? 0.1;

  // Context-aware NPC selection (Doc 05 §4.1):
  // 1. Near gate/door → guardian (always)
  // 2. Random roll < guardianRatio → guardian (difficulty-scaled)
  // 3. At junction (3+ walkable neighbors) → merchant
  // 4. Otherwise → biome pool
  let npcAsset: string;

  if (isNearGate(cells, cx, cy, size)) {
    // Guards at gates — always
    npcAsset = 'npc_guardian';
  } else if (rng() < guardianRatio) {
    // Difficulty-scaled guardian spawn — more guardians at higher difficulty
    npcAsset = 'npc_guardian';
  } else if (walkableNeighbors >= 3) {
    // Merchants at junctions (3+ passable directions = junction)
    npcAsset = 'npc_merchant';
  } else {
    // Standard biome pool selection
    const pool = BIOME_NPC_POOL[biome.name] ?? ['npc_villager'];
    npcAsset = pool[Math.floor(rng() * pool.length)];
  }

  const npcId = NPC_ID_MAP[npcAsset] ?? 'villager_default';

  cells[cy][cx] = {
    assetKey: npcAsset,
    walkable: false,
    interactable: true,
    npcId,
  };
  return true;
}

/**
 * Count walkable cardinal neighbors of a cell (for junction/clearance detection).
 */
function countWalkableNeighbors(
  cells: CellData[][], cx: number, cy: number, size: number,
): number {
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let count = 0;
  for (let i = 0; i < 4; i++) {
    const nx = cx + DX[i];
    const ny = cy + DY[i];
    if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) {
      count++;
    }
  }
  return count;
}

/**
 * Check if a cell is near a gate/door (within 2 cells Manhattan distance).
 * Used to contextually place guardian NPCs near gates (Doc 05 §4.1).
 */
function isNearGate(
  cells: CellData[][], cx: number, cy: number, size: number,
): boolean {
  const GATE_ASSETS = ['door_locked', 'toll_gate', 'door_gate', 'quiz_gate'];
  const RANGE = 2;
  for (let dy = -RANGE; dy <= RANGE; dy++) {
    for (let dx = -RANGE; dx <= RANGE; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > RANGE) continue;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        if (GATE_ASSETS.includes(cells[ny][nx].assetKey)) return true;
      }
    }
  }
  return false;
}

function placeItemAtCell(
  cells: CellData[][], cx: number, cy: number,
  biome: BiomeDef, rng: () => number,
): void {
  // Use biome feature weights to pick item type
  const roll = rng();
  if (roll > biome.collectibleRate * 0.4) return; // ~40% × collectibleRate

  const fw = biome.featureWeights;
  const itemPool: Array<{ key: string; w: number }> = [];
  if (fw.coin) itemPool.push({ key: 'coin', w: fw.coin });
  if (fw.key) itemPool.push({ key: 'key', w: fw.key });
  if (fw.potion) itemPool.push({ key: 'potion', w: fw.potion });
  if (fw.mushroom) itemPool.push({ key: 'mushroom', w: fw.mushroom });

  if (itemPool.length === 0) {
    // Default: coins
    cells[cy][cx].itemId = 'coin';
    return;
  }

  const totalW = itemPool.reduce((s, e) => s + e.w, 0);
  let pick = rng() * totalW;
  for (const entry of itemPool) {
    pick -= entry.w;
    if (pick <= 0) {
      cells[cy][cx].itemId = entry.key;
      return;
    }
  }
  cells[cy][cx].itemId = itemPool[itemPool.length - 1].key;
}

function placeDecorationAtCell(
  cells: CellData[][], cx: number, cy: number,
  biome: BiomeDef, rng: () => number,
): void {
  // 60% chance to place a decoration at anchor
  if (rng() > 0.6) return;

  const palette = BIOME_ANCHOR_DECORATIONS[biome.name] ?? ['flower'];
  const deco = palette[Math.floor(rng() * palette.length)];
  const def = ASSET_DEFS[deco];
  if (!def) return;

  // Only place on walkable cells to avoid blocking movement
  if (!cells[cy][cx].walkable) return;

  cells[cy][cx] = {
    assetKey: deco,
    walkable: def.walkable,
    interactable: def.interactable,
  };
}

function placeFeatureAtCell(
  cells: CellData[][], cx: number, cy: number,
  _biome: BiomeDef, rng: () => number,
): void {
  // 12% chance for chest, 10% for sign, rest skip (tuned for less clutter)
  const roll = rng();
  if (roll < 0.12) {
    cells[cy][cx] = {
      assetKey: 'chest',
      walkable: false,
      interactable: true,
    };
  } else if (roll < 0.22) {
    cells[cy][cx] = {
      assetKey: 'sign',
      walkable: false,
      interactable: true,
    };
  }
  // else: leave cell as-is (not every feature anchor gets content)
}

/**
 * Phase 5.6: Difficulty-Scaled Extra Obstacles (#46)
 * Adds extraObstacles count of additional obstacle cells in walkable areas.
 * Uses biome obstacle weights for asset selection.
 * Protects passability by only placing in cells with 3+ walkable neighbors.
 */
function addExtraObstacles(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  difficulty: DifficultyProfile,
): void {
  const targetCount = difficulty.extraObstacles;
  if (targetCount <= 0) return;

  // Collect eligible walkable cells with enough clearance
  const eligible: Array<{ x: number; y: number }> = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only base terrain
      if (!['grass', 'dirt', 'sand', 'stone_floor'].includes(cell.assetKey)) continue;
      // Must have 3+ walkable neighbors so placing an obstacle won't block passage
      if (countWalkableNeighbors(cells, x, y, size) < 3) continue;
      eligible.push({ x, y });
    }
  }

  // Shuffle and place
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  let placed = 0;
  for (const spot of eligible) {
    if (placed >= targetCount) break;
    const assetKey = weightedPick(biome.obstacleWeights, rng());
    // Skip quiz_gate — those are placed in placeQuizGates
    if (assetKey === 'quiz_gate') continue;
    const def = ASSET_DEFS[assetKey];
    cells[spot.y][spot.x] = {
      assetKey,
      walkable: def?.walkable ?? false,
      interactable: def?.interactable ?? false,
    };
    placed++;
  }
}

/**
 * Phase 5.4: Quiz Gate Placement (#43)
 * Templates produce door_gate / door_locked / toll_gate cells, but never quiz_gate.
 * This phase converts some existing gate cells to quiz_gate based on biome weight,
 * AND places standalone quiz gates at chokepoints when biome config warrants it.
 * Runs after anchor population so it can see the full gate picture.
 */
/**
 * Phase 5.45: Place bonfires for night-time local lighting (#67)
 * 1-3 bonfires per chunk on walkable ground, spaced apart.
 * Bonfires don't appear in water or on existing non-walkable cells.
 */
function placeBonfires(
  cells: CellData[][],
  size: number,
  _biome: BiomeDef,
  rng: () => number,
): void {
  const target = 1 + Math.floor(rng() * 3); // 1-3 per chunk
  const MIN_SPACING = 6; // Minimum grid distance between bonfires
  const placed: Array<{ x: number; y: number }> = [];

  // Fire variant selection weights by biome (#81)
  const FIRE_WEIGHTS: Record<string, Array<{ key: string; weight: number }>> = {
    meadow:  [{ key: 'bonfire', weight: 0.5 }, { key: 'campfire', weight: 0.4 }, { key: 'biomass_fire', weight: 0.1 }],
    forest:  [{ key: 'bonfire', weight: 0.3 }, { key: 'campfire', weight: 0.3 }, { key: 'biomass_fire', weight: 0.4 }],
    cave:    [{ key: 'bonfire', weight: 0.6 }, { key: 'campfire', weight: 0.3 }, { key: 'biomass_fire', weight: 0.1 }],
    castle:  [{ key: 'bonfire', weight: 0.7 }, { key: 'campfire', weight: 0.2 }, { key: 'biomass_fire', weight: 0.1 }],
  };

  function pickFireVariant(): string {
    const weights = FIRE_WEIGHTS[_biome.name] || FIRE_WEIGHTS.meadow;
    const r = rng();
    let cumulative = 0;
    for (const w of weights) {
      cumulative += w.weight;
      if (r < cumulative) return w.key;
    }
    return 'bonfire';
  }

  // Safe-zone check: fire must be near a structure or NPC (#81)
  function isNearStructure(cx: number, cy: number): boolean {
    const radius = 4;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const ak = cells[ny][nx].assetKey;
        if (ak === 'house' || ak === 'hut' || ak === 'shop' || ak?.startsWith('shop_') || ak === 'fence' || ak === 'outhouse' ||
            cells[ny][nx].npcId) return true;
      }
    }
    return false;
  }

  // Collect candidate walkable cells away from edges
  const candidates: Array<{ x: number; y: number; nearStructure: boolean }> = [];
  for (let y = 3; y < size - 3; y++) {
    for (let x = 3; x < size - 3; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.assetKey === 'water' || cell.assetKey === 'bridge') continue;
      let walkableNeighbors = 0;
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nx = x + ddx, ny = y + ddy;
        if (ny >= 0 && ny < size && nx >= 0 && nx < size && cells[ny][nx].walkable) {
          walkableNeighbors++;
        }
      }
      if (walkableNeighbors >= 3) {
        candidates.push({ x, y, nearStructure: isNearStructure(x, y) });
      }
    }
  }

  // Sort: prefer structure-adjacent candidates first (#81 safe-zone rule)
  candidates.sort((a, b) => (b.nearStructure ? 1 : 0) - (a.nearStructure ? 1 : 0));

  // Shuffle within each group (structure-adjacent first, then non-adjacent)
  const split = candidates.findIndex(c => !c.nearStructure);
  const structureCands = split === -1 ? candidates : candidates.slice(0, split);
  const openCands = split === -1 ? [] : candidates.slice(split);
  for (const group of [structureCands, openCands]) {
    for (let i = group.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [group[i], group[j]] = [group[j], group[i]];
    }
  }
  const sortedCandidates = [...structureCands, ...openCands];

  // Place fires with spacing constraint
  for (const c of sortedCandidates) {
    if (placed.length >= target) break;
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < MIN_SPACING
    );
    if (tooClose) continue;

    const fireKey = pickFireVariant();
    cells[c.y][c.x] = {
      assetKey: fireKey,
      walkable: false,
      interactable: fireKey === 'campfire', // campfires are interactable
    };
    placed.push(c);
  }
}

function placeQuizGates(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  difficulty?: DifficultyProfile,
): void {
  const weight = biome.obstacleWeights['quiz_gate'] ?? 0;
  if (weight <= 0) return; // e.g. meadow has no quiz gates

  // Difficulty-scaled quiz frequency: at higher difficulty, spawn more quiz gates
  const quizFreqMult = difficulty?.quizGateFrequency ?? 1.0;
  const effectiveWeight = weight * quizFreqMult; // scale weight by difficulty tier

  // --- Strategy 1: Convert some existing gate-type obstacles to quiz_gate ---
  const CONVERTIBLE_GATES = ['door_gate', 'door_locked', 'toll_gate'];
  const existingGates: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (CONVERTIBLE_GATES.includes(cells[y][x].assetKey)) {
        existingGates.push({ x, y });
      }
    }
  }

  // Convert a proportion of existing gates to quiz gates.
  // Conversion rate = quiz_gate effectiveWeight / total gate-type weight (capped at 60%)
  const totalGateWeight = CONVERTIBLE_GATES.reduce(
    (s, k) => s + (biome.obstacleWeights[k] ?? 0), 0
  ) + effectiveWeight;
  const conversionRate = Math.min(0.6, effectiveWeight / Math.max(totalGateWeight, 0.01));

  // Shuffle existing gates and convert first N
  for (let i = existingGates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [existingGates[i], existingGates[j]] = [existingGates[j], existingGates[i]];
  }
  const numToConvert = Math.max(0, Math.round(existingGates.length * conversionRate));
  for (let i = 0; i < numToConvert; i++) {
    const g = existingGates[i];
    cells[g.y][g.x] = {
      assetKey: 'quiz_gate',
      walkable: false,
      interactable: true,
    };
  }

  // --- Strategy 2: Place standalone quiz gates at chokepoints ---
  // Target: ~1-2 quiz gates per chunk in forest, ~2-3 in cave, ~3-4 in castle
  // Difficulty-scaled: higher quizFrequency increases target count
  const alreadyPlaced = numToConvert;
  const targetTotal = Math.round(effectiveWeight * 30); // e.g. 0.05→1.5, 0.08→2.4, 0.15→4.5
  const remaining = Math.max(0, targetTotal - alreadyPlaced);
  if (remaining <= 0) return;

  // Find chokepoint candidates: walkable cells with ≤ 2 walkable neighbors
  // and at least 1 non-walkable neighbor (natural bottleneck)
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only place on simple terrain (grass, dirt, sand, stone_floor)
      if (!['grass', 'dirt', 'sand', 'stone_floor'].includes(cell.assetKey)) continue;

      const walkable = countWalkableNeighbors(cells, x, y, size);
      if (walkable < 2 || walkable > 3) continue; // 2-3 = corridor/chokepoint

      // Score: prefer cells at corridor ends (fewer walkable neighbors = better gate spot)
      candidates.push({ x, y, score: 4 - walkable + rng() * 0.5 });
    }
  }

  // Sort by score descending, place quiz gates at best spots
  candidates.sort((a, b) => b.score - a.score);
  let placed = 0;
  for (const c of candidates) {
    if (placed >= remaining) break;
    // Don't place too close to another quiz gate (min 4 cells apart)
    let tooClose = false;
    for (let dy = -4; dy <= 4 && !tooClose; dy++) {
      for (let dx = -4; dx <= 4 && !tooClose; dx++) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
          if (cells[ny][nx].assetKey === 'quiz_gate') tooClose = true;
        }
      }
    }
    if (tooClose) continue;

    cells[c.y][c.x] = {
      assetKey: 'quiz_gate',
      walkable: false,
      interactable: true,
    };
    placed++;
  }
}

/**
 * Phase 5b: Cluster-based decoration placement (WorldEngine-05 §6.2).
 * Creates natural-looking clusters of 3-7 decorations around center points,
 * with biome-appropriate variety within each cluster.
 * Target coverage: 15-25% of eligible cells, scaled by distance from origin.
 * TODO: DOC - decoration clustering algorithm details
 */
export function clusterDecorations(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  chunkDist: number = 0,
  difficulty?: DifficultyProfile,
): void {
  const palette = BIOME_SCATTER_DECORATIONS[biome.name] ?? ['flower'];

  // Distance-based density: closer to origin = more welcoming, further = sparser
  // Base coverage: 18-25% at origin, tapering to 10-15% at dist 7+
  const distFactor = Math.max(0.5, 1.0 - chunkDist * 0.06);
  // At high difficulty, obstacle density slightly increases decoration density
  // (more obstacles = more visual clutter = more challenging navigation)
  const obstacleMult = difficulty?.obstacleDensity ?? 1.0;
  const targetCoverage = (0.18 + rng() * 0.07) * distFactor * Math.min(obstacleMult, 1.5);

  // Gather eligible cells (walkable base terrain with no existing content)
  const eligible: Array<{ x: number; y: number }> = [];
  const eligibleSet = new Set<string>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' && cell.assetKey !== 'sand') continue;
      eligible.push({ x, y });
      eligibleSet.add(`${x},${y}`);
    }
  }

  if (eligible.length === 0) return;

  const targetCount = Math.floor(eligible.length * targetCoverage);
  let placed = 0;
  const usedCells = new Set<string>();

  // Shuffle eligible cells for random cluster center selection
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  // Pick cluster centers spaced 5-8 cells apart
  const clusterCenters: Array<{ x: number; y: number }> = [];
  const MIN_CLUSTER_SPACING = 5;

  for (const cell of eligible) {
    if (placed >= targetCount) break;

    // Check spacing from existing cluster centers
    let tooClose = false;
    for (const c of clusterCenters) {
      const dist = Math.abs(cell.x - c.x) + Math.abs(cell.y - c.y);
      if (dist < MIN_CLUSTER_SPACING) { tooClose = true; break; }
    }
    if (tooClose) continue;
    if (usedCells.has(`${cell.x},${cell.y}`)) continue;
    if (hasAdjacentInteractable(cells, cell.x, cell.y, size)) continue;

    clusterCenters.push(cell);

    // Generate cluster: 3-7 decorations within radius 2-4 of center
    const clusterSize = 3 + Math.floor(rng() * 5); // 3-7
    const radius = 2 + Math.floor(rng() * 3); // 2-4

    // Pick 2-3 decoration types for variety within this cluster
    const clusterTypes: string[] = [];
    const typeCount = 2 + Math.floor(rng() * 2); // 2-3 types
    for (let t = 0; t < typeCount; t++) {
      clusterTypes.push(palette[Math.floor(rng() * palette.length)]);
    }

    // Place decorations in cluster: denser at center, sparser at edges
    let clusterPlaced = 0;
    for (let attempt = 0; attempt < clusterSize * 3 && clusterPlaced < clusterSize; attempt++) {
      // Random offset within radius, biased toward center (triangular distribution)
      const angle = rng() * Math.PI * 2;
      const r = radius * Math.sqrt(rng()) * 0.8; // Sqrt bias = denser at center
      const dx = Math.round(Math.cos(angle) * r);
      const dy = Math.round(Math.sin(angle) * r);
      const px = cell.x + dx;
      const py = cell.y + dy;
      const key = `${px},${py}`;

      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      if (usedCells.has(key)) continue;
      if (!eligibleSet.has(key)) continue;
      if (hasAdjacentInteractable(cells, px, py, size)) continue;

      const deco = clusterTypes[Math.floor(rng() * clusterTypes.length)];
      const def = ASSET_DEFS[deco];
      if (!def || !def.walkable) continue;

      cells[py][px] = {
        assetKey: deco,
        walkable: true,
        interactable: def.interactable,
      };
      usedCells.add(key);
      clusterPlaced++;
      placed++;
    }
  }
}

/**
 * Phase 5b (legacy): Simple scatter decorations.
 * Kept for test compatibility — use clusterDecorations for production.
 */
export function scatterDecorations(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
): void {
  const palette = BIOME_SCATTER_DECORATIONS[biome.name] ?? ['flower'];
  // Target density: 8-15% of walkable base cells
  const targetRate = 0.08 + rng() * 0.07;

  // Gather eligible cells (walkable base terrain with no existing content)
  const eligible: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue;
      // Only decorate base terrain types
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' && cell.assetKey !== 'sand') continue;
      eligible.push({ x, y });
    }
  }

  // Shuffle eligible cells deterministically
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const count = Math.floor(eligible.length * targetRate);
  for (let i = 0; i < count && i < eligible.length; i++) {
    const { x, y } = eligible[i];
    const deco = palette[Math.floor(rng() * palette.length)];
    const def = ASSET_DEFS[deco];
    if (!def) continue;

    // Don't place next to NPCs or interactables (per design doc §6.4)
    if (hasAdjacentInteractable(cells, x, y, size)) continue;

    // Safety: scatter should only place walkable decorations
    if (!def.walkable) continue;

    cells[y][x] = {
      assetKey: deco,
      walkable: true,
      interactable: def.interactable,
    };
  }
}

/** Check if any adjacent cell has an NPC or interactable object */
function hasAdjacentInteractable(
  cells: CellData[][], x: number, y: number, size: number,
): boolean {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
    const n = cells[ny][nx];
    if (n.npcId || n.interactable) return true;
  }
  return false;
}

/**
 * Phase 5c: Scatter collectibles (coins) along walkable corridors.
 * Density follows biome collectibleRate, scaled by chunk distance.
 * Enforces minimum 3-cell spacing between same-type collectibles (Doc 05 §5.1).
 * Close to origin = generous (welcoming), far = rarer but more valuable.
 * Keys/crowbars handled in balanceObstacles.
 * TODO: DOC - distance-based collectible scaling
 */
export function scatterCollectibles(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
  chunkDist: number = 0,
  difficulty?: DifficultyProfile,
): void {
  // Distance scaling (Doc 05 §9.1):
  // dist 0: high density (1.5x), dist 1-2: normal, dist 3-5: 0.8x, dist 6+: 0.6x
  const distMultiplier = chunkDist === 0 ? 1.5
    : chunkDist <= 2 ? 1.0
    : chunkDist <= 5 ? 0.8
    : 0.6;

  // Apply difficulty collectible rate if available (stacks with distance curve)
  const diffMult = difficulty?.collectibleRate ?? 1.0;
  const effectiveMultiplier = distMultiplier * diffMult;

  // Coin density: ~2-4% of walkable base cells × collectibleRate × distance factor
  const baseRate = (0.02 + rng() * 0.02) * biome.collectibleRate * effectiveMultiplier;

  // Minimum spacing: 3 cells between same-type collectibles (Doc 05 §5.1)
  const MIN_SPACING = 3;
  const placed: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (!cell.walkable || cell.itemId || cell.npcId) continue;
      // Only place coins on walkable base terrain
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' && cell.assetKey !== 'sand'
          && cell.assetKey !== 'flower') continue;

      if (rng() < baseRate) {
        // Check minimum spacing from already-placed coins
        let tooClose = false;
        for (let i = placed.length - 1; i >= 0; i--) {
          const dx = Math.abs(x - placed[i].x);
          const dy = Math.abs(y - placed[i].y);
          // Early exit: if we've moved far enough in Y, no prior placement can be close
          if (dy > MIN_SPACING) break;
          if (dx + dy < MIN_SPACING) { tooClose = true; break; }
        }
        if (!tooClose) {
          cell.itemId = 'coin';
          placed.push({ x, y });
        }
      }
    }
  }
}

/**
 * Phase 5d: Lay coin trails along corridors toward features (Doc 05 §5.2).
 * Creates breadcrumb trails of coins (spaced 4-6 cells apart) leading
 * toward chests, NPCs, and gates — guiding exploration naturally.
 * TODO: DOC - coin trail pathfinding algorithm
 */
export function layCoinTrails(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  // Find feature targets (chests, signs, NPCs)
  const targets: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      if (cell.assetKey === 'chest' || cell.assetKey === 'sign' ||
          cell.npcId || cell.assetKey === 'door_locked' ||
          cell.assetKey === 'toll_gate') {
        targets.push({ x, y });
      }
    }
  }

  if (targets.length === 0) return;

  // Pick up to 3 targets to trail toward (avoid over-saturation)
  const trailTargets = targets.slice(0, Math.min(3, targets.length));

  for (const target of trailTargets) {
    // BFS backward from target to find walkable corridor path
    const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
    const path = findPathBFS(cells, size, center, target);
    if (!path || path.length < 8) continue; // Too short to trail

    // Place coins along path at spacing 4-6 cells, skip last 2 cells near target
    const spacing = 4 + Math.floor(rng() * 3); // 4-6
    for (let i = spacing; i < path.length - 2; i += spacing) {
      const { x, y } = path[i];
      const cell = cells[y][x];
      if (!cell.walkable || cell.itemId || cell.npcId) continue;
      // Only on base walkable terrain
      if (cell.assetKey !== 'grass' && cell.assetKey !== 'dirt' &&
          cell.assetKey !== 'sand' && cell.assetKey !== 'flower' &&
          cell.assetKey !== 'stone_floor') continue;
      // 70% chance per trail point (some natural gaps)
      if (rng() < 0.7) {
        cell.itemId = 'coin';
      }
    }
  }
}

/**
 * Simple BFS pathfinding between two points.
 * Returns path as array of {x,y} from start to end, or null if unreachable.
 */
function findPathBFS(
  cells: CellData[][],
  size: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Array<{ x: number; y: number }> | null {
  if (start.x === end.x && start.y === end.y) return [start];

  const visited = new Set<string>();
  const parent = new Map<string, string>();
  const queue: Array<{ x: number; y: number }> = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (visited.has(key)) continue;
      // Allow walking through anything for path tracing (coins go on walkable cells)
      const cell = cells[ny][nx];
      if (!cell.walkable && nx !== end.x && ny !== end.y) continue;
      visited.add(key);
      parent.set(key, `${curr.x},${curr.y}`);

      if (nx === end.x && ny === end.y) {
        // Reconstruct path
        const path: Array<{ x: number; y: number }> = [];
        let k = key;
        while (k) {
          const [px, py] = k.split(',').map(Number);
          path.unshift({ x: px, y: py });
          k = parent.get(k)!;
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null; // Unreachable
}

// ─── Lock-Key DAG System (Issue #98 — Solver D: No Softlocks) ────────────

/** Lock cell tracked during DAG validation */
interface LockInfo {
  x: number;
  y: number;
  assetKey: string;
  keyItem: string;
  layer: number;        // expansion layer this lock was resolved in (-1 = unresolved)
  keyPlaced: boolean;
  removed: boolean;
}

/** Result of the DAG validation pass, stored for debug overlay */
interface DAGResult {
  totalLocks: number;
  keysPlaced: number;
  locksRemoved: number;
  layers: number;
  dagValid: boolean;
  recoveryAttempts: number;
  chunksValidated: number;
}

// Module-level cumulative state for debug visibility across all chunks
let _dagAccum: DAGResult = {
  totalLocks: 0, keysPlaced: 0, locksRemoved: 0,
  layers: 0, dagValid: true, recoveryAttempts: 0, chunksValidated: 0,
};

/**
 * Phase 5.41: Convert remaining door_gate cells to door_locked (#98).
 * After placeQuizGates, any door_gate cells that weren't converted to quiz_gate
 * become door_locked so the mechanics system (OBSTACLE_TEMPLATES) can resolve them.
 * TODO: DOC - door_gate promotion rationale
 */
function promoteDoorGates(cells: CellData[][], size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'door_gate') {
        cells[y][x].assetKey = 'door_locked';
        cells[y][x].interactable = true;
      }
    }
  }
}

/**
 * Phase 5.42: Place quiz gates at openings in fence runs (ref #223 + AUTONOMOUS_LOOP.md).
 * Solver-style post-process: detects continuous fence segments (wooden_fence/fence/barricade),
 * replaces an interior cell with quiz_gate (walkable:false default; nano gets conditional 'quiz-gate').
 * Enables exact iso2 walk (isPointWalkableInTile fence footprint + cond unlock) and BFS.
 * Horizontal then vertical to catch perimeters.
 */
function placeGatesInFenceRuns(
  cells: CellData[][],
  size: number,
  rng: () => number,
  biome: BiomeDef,
): void {
  const w = biome.obstacleWeights ?? {};
  if ((w['quiz_gate'] ?? 0) <= 0 && (w['fence'] ?? 0) <= 0) return;
  const FENCE_ASSETS = ['wooden_fence', 'fence', 'barricade'];
  const GATE = 'quiz_gate';
  // Horizontal runs
  for (let y = 0; y < size; y++) {
    let start = -1;
    for (let x = 0; x <= size; x++) {
      const isF = x < size && FENCE_ASSETS.includes(cells[y][x]?.assetKey);
      if (isF && start < 0) start = x;
      if ((!isF || x === size) && start >= 0) {
        const len = x - start;
        if (len >= 3) {
          const off = Math.floor(rng() * (len - 2)) + 1; // vary gate pos in run interior
          const p = start + off;
          const c = cells[y][p];
          if (c && !c.npcId && !c.itemId) {
            cells[y][p] = { assetKey: GATE, walkable: false, interactable: true };
          }
        }
        start = -1;
      }
    }
  }
  // Vertical runs
  for (let x = 0; x < size; x++) {
    let start = -1;
    for (let y = 0; y <= size; y++) {
      const isF = y < size && FENCE_ASSETS.includes(cells[y]?.[x]?.assetKey);
      if (isF && start < 0) start = y;
      if ((!isF || y === size) && start >= 0) {
        const len = y - start;
        if (len >= 3) {
          const off = Math.floor(rng() * (len - 2)) + 1;
          const p = start + off;
          const c = cells[p]?.[x];
          if (c && !c.npcId && !c.itemId) {
            cells[p][x] = { assetKey: GATE, walkable: false, interactable: true };
          }
        }
        start = -1;
      }
    }
  }
}

/**
 * Phase 6: Lock-Key DAG Validation + Forward Key Placement
 * (Issue #98 — Solver D: No Softlocks)
 *
 * Layered reachability expansion guarantees no softlocks:
 * 1. BFS from center to find freely reachable region (stops at all locks)
 * 2. Identify boundary locks (locks directly adjacent to reachable region)
 * 3. Place keys for boundary locks in the reachable region
 * 4. "Open" those locks and expand the reachable region
 * 5. Repeat until no new locks are resolved
 * 6. Remove any locks that couldn't be resolved (recovery)
 * 7. Store DAG result for debug overlay
 *
 * Quiz gates are treated as passable (always solvable via quiz retry).
 * Toll gates are excluded (coins are scattered organically).
 * TODO: DOC - lock-key DAG algorithm, layered expansion proof
 */
export function balanceObstacles(
  cells: CellData[][],
  size: number,
  rng: () => number,
): void {
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };

  // Lock types that require item-based resolution
  const LOCK_KEYS: Record<string, string> = {
    door_locked: 'key',
    barricade: 'crowbar',
    // toll_gate excluded: coins are organic, not DAG-placed
  };

  // Identify all lock cells
  const allLocks: LockInfo[] = [];
  const lockSet = new Set<string>(); // "x,y" for BFS barrier lookup

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = cells[y][x];
      const keyItem = LOCK_KEYS[cell.assetKey];
      if (!keyItem) continue;
      // barricade must be interactable to count as a lock
      if (cell.assetKey === 'barricade' && !cell.interactable) continue;
      allLocks.push({
        x, y, assetKey: cell.assetKey,
        keyItem, layer: -1, keyPlaced: false, removed: false,
      });
      lockSet.add(`${x},${y}`);
    }
  }

  if (allLocks.length === 0) {
    _dagAccum.chunksValidated++;
    return;
  }

  // Quiz gates are soft barriers — passable for reachability
  const quizGates = new Set<string>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (cells[y][x].assetKey === 'quiz_gate') quizGates.add(`${x},${y}`);
    }
  }

  // BFS that stops at lock cells but passes through quiz gates
  const bfsStoppingAtLocks = (starts: Array<{ x: number; y: number }>): Set<string> => {
    const visited = new Set<string>();
    const queue = [...starts];
    for (const s of starts) visited.add(`${s.x},${s.y}`);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        if (lockSet.has(k)) continue;   // stop at item-locks
        const cell = cells[ny][nx];
        // passable: walkable cells OR quiz gates (always solvable)
        if (!cell.walkable && !quizGates.has(k)) continue;
        visited.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return visited;
  };

  const reachable = new Set<string>();
  let layer = 0;
  let keysPlaced = 0;
  let locksRemoved = 0;
  let recoveryAttempts = 0;

  // Layer 0: freely reachable from center (before any locks)
  for (const k of bfsStoppingAtLocks([center])) reachable.add(k);

  // Iterative expansion: resolve boundary locks layer by layer
  let changed = true;
  while (changed) {
    changed = false;

    // Find locks adjacent to the reachable frontier
    const boundaryLocks = allLocks.filter(lock => {
      if (lock.layer !== -1 || lock.removed) return false;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        if (reachable.has(`${lock.x + dx},${lock.y + dy}`)) return true;
      }
      return false;
    });

    if (boundaryLocks.length === 0) break;

    // For each boundary lock, place its key in the current reachable region
    for (const lock of boundaryLocks) {
      const candidates: Array<{ x: number; y: number; dist: number }> = [];
      for (const k of reachable) {
        const [px, py] = k.split(',').map(Number);
        const cell = cells[py][px];
        if (!cell.walkable || cell.itemId || cell.npcId) continue;
        const dist = Math.abs(px - center.x) + Math.abs(py - center.y);
        candidates.push({ x: px, y: py, dist });
      }

      if (candidates.length > 0) {
        // Place key closer to center (early in player's path)
        candidates.sort((a, b) => a.dist - b.dist);
        const poolSize = Math.max(1, Math.floor(candidates.length * 0.3));
        const pick = candidates[Math.floor(rng() * poolSize)];
        cells[pick.y][pick.x].itemId = lock.keyItem;
        lock.keyPlaced = true;
        lock.layer = layer;
        keysPlaced++;
      } else {
        // Recovery: no room for key → remove the lock entirely
        recoveryAttempts++;
        cells[lock.y][lock.x] = {
          ...cells[lock.y][lock.x],
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        };
        lock.removed = true;
        lock.layer = layer;
        locksRemoved++;
        lockSet.delete(`${lock.x},${lock.y}`);
      }
      changed = true;
    }

    // Expand reachable region through resolved/removed locks
    const newStarts = boundaryLocks
      .filter(l => l.keyPlaced || l.removed)
      .map(l => {
        lockSet.delete(`${l.x},${l.y}`); // no longer a barrier
        reachable.add(`${l.x},${l.y}`);
        return { x: l.x, y: l.y };
      });

    if (newStarts.length > 0) {
      for (const k of bfsStoppingAtLocks(newStarts)) reachable.add(k);
    }
    layer++;
  }

  // Cleanup: any remaining unresolved locks are unreachable from center
  for (const lock of allLocks) {
    if (lock.layer === -1 && !lock.removed) {
      recoveryAttempts++;
      cells[lock.y][lock.x] = {
        ...cells[lock.y][lock.x],
        assetKey: 'grass',
        walkable: true,
        interactable: false,
      };
      lock.removed = true;
      locksRemoved++;
    }
  }

  _dagAccum.totalLocks += allLocks.length;
  _dagAccum.keysPlaced += keysPlaced;
  _dagAccum.locksRemoved += locksRemoved;
  _dagAccum.layers = Math.max(_dagAccum.layers, layer);
  _dagAccum.recoveryAttempts += recoveryAttempts;
  _dagAccum.chunksValidated++;
  if (locksRemoved > 0) _dagAccum.dagValid = false;
}

/** Debug info for Lock-Key DAG (Issue #98) — cumulative across all chunks */
export function getLockKeyDebugInfo(): DAGResult {
  return { ..._dagAccum };
}

/**
 * Phase 6.5: Dead-End Reward Scanner (WorldEngine-05 §7.1, Guarantee 2).
 * Finds dead-end corridors (walkable cells with only 1 walkable neighbor)
 * and ensures each has at least one collectible or NPC.
 * "No Dead Ends Without Reward" — player should never be punished for exploring.
 * TODO: DOC - dead-end reward algorithm and collectible pools
 */
export function rewardDeadEnds(
  cells: CellData[][],
  size: number,
  biome: BiomeDef,
  rng: () => number,
): void {
  // Biome-appropriate dead-end reward pools (more valuable in harder biomes)
  const rewardPools: Record<string, string[]> = {
    meadow:  ['coin', 'coin', 'flower', 'mushroom'],
    forest:  ['coin', 'coin', 'mushroom', 'key'],
    cave:    ['coin', 'coin', 'coin', 'key', 'potion'],
    castle:  ['coin', 'coin', 'key', 'potion', 'potion'],
  };
  const pool = rewardPools[biome.name] ?? ['coin'];

  // Find dead-end cells: walkable cells with exactly 1 walkable orthogonal neighbor
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const cell = cells[y][x];
      if (!cell.walkable) continue;
      if (cell.itemId || cell.npcId) continue; // Already has content

      let walkableNeighbors = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && cells[ny][nx].walkable) {
          walkableNeighbors++;
        }
      }

      // Dead end = exactly 1 walkable neighbor (corridor terminus)
      if (walkableNeighbors === 1) {
        // 80% chance to place a reward (avoid feeling formulaic)
        if (rng() < 0.8) {
          const reward = pool[Math.floor(rng() * pool.length)];
          cell.itemId = reward;
        }
      }
    }
  }
}
