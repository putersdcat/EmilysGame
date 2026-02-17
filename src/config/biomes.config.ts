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

export const BIOME_DEFS: BiomeDef[] = [
  {
    id: 0,
    name: 'meadow',
    displayName: 'Sunny Meadow',
    baseColor: '#1a5c1a',
    terrainWeights: {
      grass: 0.45, flower: 0.06, flower_pink: 0.04, flower_red: 0.04,
      dirt: 0.1, sand: 0.03,
      // #58 new plants & animals
      tulip: 0.03, clover: 0.03, wheat: 0.04, sunflower: 0.02,
      chicken: 0.04, sheep: 0.03, cow: 0.02, pig: 0.02, duck: 0.02, rabbit: 0.02, dog: 0.01,
    },
    obstacleWeights: { rock: 0.15, bush: 0.25, tree: 0.12, tree_pine: 0.12, tree_palm: 0.12, fence: 0.06, house: 0.06, hut: 0.04, campfire: 0.04, shop: 0.04, shop_general: 0.03, shop_snack: 0.03 },
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
    terrainWeights: {
      grass: 0.38, dirt: 0.25, sand: 0.03, flower: 0.04, flower_pink: 0.02, mushroom: 0.02,
      // #58 forest additions
      clover: 0.03, maple_leaf: 0.03, seedling: 0.02, wilted_flower: 0.01,
      rabbit: 0.04, fox: 0.03, deer: 0.04, horse: 0.02, dog: 0.01,
      sparkle: 0.01, stump: 0.02,
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
    terrainWeights: {
      stone_floor: 0.6, dirt: 0.15, water: 0.08,
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
    terrainWeights: {
      stone_floor: 0.5, dirt: 0.08, grass: 0.06, sand: 0.14,
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


