/**
 * BiomeSelector.ts — Biome selection, chunk climate, and mood derivation.
 *
 * Extracted from gen.ts (B3 / #253). Owns the session biome/climate noise fields
 * and the deterministic mood system. Drives spatially-coherent biome regions
 * (WorldEngine-03 §4) — directly relevant to the biome-coherence visual work (#261).
 *
 * Intentional module-level state (see ARCHITECTURE.md §7): three lazily-built Perlin
 * noise instances sharing one session seed. `gen.ts` re-exports the public API so
 * existing importers (`main.ts`) keep importing from `engine/gen`. Dependencies are
 * one-directional (gen → BiomeSelector); `MoodProfile` is defined here and re-exported
 * by gen.ts for `ChunkData` and the generation functions that consume it.
 */
import { getBiome, type BiomeDef } from '../../config/biomes.config';
import { fastHash, PerlinNoise } from '../utils';

/** Mood category derived from entropy seed — biases template selection (#46) */
export interface MoodProfile {
  category: 'open' | 'river-heavy' | 'enclosed' | 'path-heavy' | 'fortified' | 'sparse';
  /** Weight modifiers for template categories. Applied additively to biome weights. */
  modifiers: Record<string, number>;
}

// --- Biome noise field ---
// Global biome noise - seeded once per session for consistent spatial biome map.
// Uses a very low frequency so biome regions span many chunks.
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
