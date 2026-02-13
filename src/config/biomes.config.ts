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
    terrainWeights: { grass: 0.6, flower: 0.1, flower_pink: 0.05, flower_red: 0.05, dirt: 0.15, sand: 0.05 },
    obstacleWeights: { rock: 0.2, bush: 0.35, tree: 0.15, tree_pine: 0.15, tree_palm: 0.15 },
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
    terrainWeights: { grass: 0.3, flower: 0.03, flower_pink: 0.02, dirt: 0.2, mushroom: 0.1, bush: 0.35 },
    obstacleWeights: { tree: 0.3, tree_pine: 0.3, bush: 0.2, rock: 0.1, barricade: 0.1 },
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
    terrainWeights: { stone_floor: 0.7, dirt: 0.2, water: 0.1 },
    obstacleWeights: { rock: 0.5, wall: 0.3, door_locked: 0.15, toll_gate: 0.05 },
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
    terrainWeights: { stone_floor: 0.6, dirt: 0.1, grass: 0.1, sand: 0.2 },
    obstacleWeights: { wall: 0.4, door_locked: 0.25, barricade: 0.15, toll_gate: 0.1, rock: 0.1 },
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

/** Lookup biome by name */
export function getBiomeByName(name: string): BiomeDef | undefined {
  return BIOME_DEFS.find((b) => b.name === name);
}
