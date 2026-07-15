/**
 * config/biomes.config.ts - Biome definitions and generation weights.
 * Each biome controls terrain distribution, colors, and feature probabilities.
 */

export interface BiomeDef {
  id: number;
  name: string;
  displayName: string;
  baseColor: string;        // Ground fill color override
  /** Relative weights for terrain fill (must sum roughly to 1.0) */
  terrainWeights: Record<string, number>;
  /** Relative weights for obstacle placement */
  obstacleWeights: Record<string, number>;
  /** Relative weights for feature/interactive placement */
  featureWeights: Record<string, number>;
  /** Collectible spawn rate multiplier (1.0 = normal) */
  collectibleRate: number;
  /** NPC spawn rate multiplier */
  npcRate: number;
  /** Ambient tint applied to emojis (CSS filter hue-rotate degrees) */
  tintHue: number;
  description: string;
}

/** Terrain surface ids used by D.8 continuous biome-transition overlays. */
export type BiomeTransitionSurface = 'grass' | 'dirt' | 'sand' | 'stone_floor';

export interface BiomeTransitionRule {
  readonly id: string;
  readonly surface: BiomeTransitionSurface;
  readonly color: string;
  /** Moisture range [min, max] where this surface influence appears. */
  readonly moisture: readonly [number, number];
  /** Elevation range [min, max] where this surface influence appears. */
  readonly elevation: readonly [number, number];
  /** Max overlay alpha used by the terrain-cache D.8 pass. */
  readonly maxAlpha: number;
}

/**
 * D.8 continuous biome-transition ladder. Dirt is the "mud" midpoint between
 * meadow grass and dry sand; stone_floor is the high-elevation rocky endpoint.
 */
export const BIOME_TRANSITION_RULES = [
  { id: 'grass-meadow', surface: 'grass', color: '#3CB43C', moisture: [0.36, 1.00], elevation: [0.00, 0.58], maxAlpha: 0.035 },
  { id: 'mud-dirt', surface: 'dirt', color: '#7A5A2A', moisture: [0.28, 0.76], elevation: [0.05, 0.66], maxAlpha: 0.070 },
  { id: 'dry-sand', surface: 'sand', color: '#D2B48C', moisture: [0.00, 0.42], elevation: [0.00, 0.64], maxAlpha: 0.075 },
  { id: 'high-stone', surface: 'stone_floor', color: '#9A9080', moisture: [0.00, 0.82], elevation: [0.56, 1.00], maxAlpha: 0.070 },
] as const satisfies readonly BiomeTransitionRule[];

export const BIOME_DEFS: BiomeDef[] = [
  {
    id: 0,
    name: 'meadow',
    displayName: 'Sunny Meadow',
    baseColor: '#1a5c1a',
    // V1 surface + S5 density (2026-07-15): grass-first meadow. No sand salt.
    // Animals are NOT Perlin terrain salt (they read as emoji clutter at FOV
    // zoom-out) — rare animals live in farm assemblies + decoration clusters.
    terrainWeights: {
      grass: 0.72, flower: 0.05, flower_pink: 0.03, flower_red: 0.02,
      dirt: 0.05,
      tulip: 0.02, clover: 0.02, wheat: 0.02, sunflower: 0.02,
      // Trace weights keep farm-animal keys alive (rare salt; main home is farm assembly)
      chicken: 0.005, sheep: 0.005, cow: 0.005, pig: 0.005, rabbit: 0.005, duck: 0.005,
    },
    // quiz_gate > 0 so placeQuizGates runs in meadow (was hard-disabled at 0 —
    // left entire safe-zone biomes with no knowledge gates). Low weight keeps
    // tutorial meadow gentle but teaches the core solve-to-pass loop.
    obstacleWeights: { rock: 0.15, bush: 0.25, tree: 0.12, tree_pine: 0.12, tree_palm: 0.12, fence: 0.06, quiz_gate: 0.04, house: 0.06, hut: 0.04, campfire: 0.04, shop: 0.04, shop_general: 0.03, shop_snack: 0.03 },
    featureWeights: { chest: 0.15, sign: 0.1, npc_villager: 0.15, coin: 0.6 },
    collectibleRate: 1.0,
    npcRate: 1.0,
    tintHue: 0,
    description: 'Open grassland with wildflowers. Easy difficulty.',
  },
  {
    id: 1,
    name: 'forest',
    displayName: 'Deep Forest',
    baseColor: '#0f3d0f',
    // V1 + S5: forest floor grass/dirt; wildlife rare (assemblies/scatter).
    terrainWeights: {
      grass: 0.48, dirt: 0.28, flower: 0.03, flower_pink: 0.02, mushroom: 0.03,
      clover: 0.02, maple_leaf: 0.02, seedling: 0.02, wilted_flower: 0.01,
      stump: 0.03, sparkle: 0.01,
      rabbit: 0.01, fox: 0.01, deer: 0.01,
    },
    obstacleWeights: { tree: 0.25, tree_pine: 0.25, bush: 0.2, rock: 0.1, barricade: 0.05, quiz_gate: 0.05, hut: 0.05, campfire: 0.04, biomass_fire: 0.01, shop_snack: 0.02, shop_trading: 0.02 },
    featureWeights: { chest: 0.2, npc_merchant: 0.1, npc_villager: 0.1, coin: 0.4, mushroom: 0.2 },
    collectibleRate: 0.8,
    npcRate: 0.7,
    tintHue: 15,
    description: 'Dense woodland. Moderate difficulty, more obstacles.',
  },
  {
    id: 2,
    name: 'cave',
    displayName: 'Crystal Cavern',
    baseColor: '#2a2a3d',
    // V3: no Perlin water salt — water only via river/pond chain templates /
    // modular pond scenes (avoids square "tank" salt pools underground).
    terrainWeights: {
      stone_floor: 0.68, dirt: 0.15,
      // #58 cave additions
      mushroom: 0.05, seedling: 0.02, sparkle: 0.03, maple_leaf: 0.02,
      rabbit: 0.02, fox: 0.01, wilted_flower: 0.02,
    },
    obstacleWeights: { rock: 0.38, wall: 0.22, door_locked: 0.1, toll_gate: 0.05, quiz_gate: 0.08, bush: 0.05, campfire: 0.06, cactus: 0.06 },
    featureWeights: { chest: 0.3, npc_guardian: 0.15, coin: 0.3, key: 0.15, potion: 0.1 },
    collectibleRate: 1.2,
    npcRate: 0.5,
    tintHue: 220,
    description: 'Underground cave system. Harder obstacles, better loot.',
  },
  {
    id: 3,
    name: 'castle',
    displayName: 'Ruined Castle',
    baseColor: '#3d2a2a',
    // V1: ruin dust is sparse dirt/sand patches, not sand-dominant salt.
    terrainWeights: {
      stone_floor: 0.55, dirt: 0.12, grass: 0.08, sand: 0.05,
      // #58 castle additions
      sparkle: 0.04, wilted_flower: 0.03, maple_leaf: 0.03,
      goat: 0.02, horse: 0.03, dog: 0.02, rooster: 0.02, chicken: 0.03,
    },
    obstacleWeights: { wall: 0.28, door_locked: 0.16, barricade: 0.1, toll_gate: 0.07, quiz_gate: 0.12, rock: 0.08, fence: 0.06, house: 0.06, shop: 0.03, shop_general: 0.02, shop_trading: 0.02, campfire: 0.03 },
    featureWeights: { chest: 0.25, npc_guardian: 0.2, npc_merchant: 0.1, coin: 0.25, key: 0.1, potion: 0.1 },
    collectibleRate: 1.5,
    npcRate: 0.8,
    tintHue: 340,
    description: 'Crumbling fortress. Hardest difficulty, best rewards.',
  },
];

/** Lookup biome by id */
export function getBiome(id: number): BiomeDef {
  return BIOME_DEFS[id % BIOME_DEFS.length];
}


