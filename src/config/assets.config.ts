/**
 * config/assets.config.ts - Asset metadata definitions.
 * All game objects, tiles, and interactive elements defined here.
 * 
 * Each entry provides visual + behavioral metadata for world objects.
 * The renderer and gen systems reference these by key name.
 */

// ─── Types ───────────────────────────────────────────────────

import type { TileType } from '../rendering/tiles';

export type ObjectCategory = 'terrain' | 'plant' | 'obstacle' | 'interactive' | 'collectible' | 'npc' | 'ego';
export type DrawLayer = 'base' | 'mid' | 'high' | 'overlay';

export interface AssetDef {
  emoji: string;            // Emoji fallback character
  category: ObjectCategory;
  height: number;           // 0-10, for depth sorting / occlusion
  layer: DrawLayer;
  scale: number;            // 0.5-2.0 render scale multiplier
  shadow: boolean;          // Draw ground shadow?
  walkable: boolean;        // Can the player walk through this?
  interactable: boolean;    // Can the player interact (Space)?
  description: string;      // Short tooltip / dev reference
  /** Base tile or Iso2 nano tile key. Some Iso2-only keys are handled by nano-tile-defs, not tiles.ts. */
  tileType?: TileType | string;
  jitter?: number;           // 0-1 sub-cell placement jitter range (fraction of half-tile). 0 = centered. (#82)
  /** Hazard damage on collision (#137). 0/undefined = safe, >0 = deterministic injury. */
  hazardDamage?: number;
  /** Short label for injury feedback messages (#137). */
  hazardLabel?: string;
  /** Fraction (0-1) of sprite height that acts as occluder base (#181).
   *  0 or undefined = no occlusion. E.g. 0.4 means bottom 40% of sprite clips over player. */
  occluderRatio?: number;
}

// ─── Master Asset Library ────────────────────────────────────

export const ASSET_DEFS: Record<string, AssetDef> = {

  // --- Terrain (base ground types) ---
  grass: {
    emoji: '🌱', category: 'terrain', height: 0, layer: 'base',
    scale: 0.7, shadow: false, walkable: true, interactable: false,
    description: 'Short grass patch', tileType: 'grass',
  },
  dirt: {
    emoji: '🟫', category: 'terrain', height: 0, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Dirt path tile', tileType: 'dirt',
  },
  sand: {
    emoji: '🟨', category: 'terrain', height: 0, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Sandy ground', tileType: 'sand',
  },
  water: {
    emoji: '🌊', category: 'terrain', height: 0, layer: 'base',
    scale: 0.8, shadow: false, walkable: false, interactable: false,
    description: 'Water (impassable without bridge)', tileType: 'water',
  },
  stone_floor: {
    emoji: '⬜', category: 'terrain', height: 0, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Stone floor (cave/castle)', tileType: 'stone_floor',
  },

  // --- Plants (decorative, mostly walkable) ---
  flower: {
    emoji: '🌼', category: 'plant', height: 1, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Wildflower', jitter: 0.35,
  },
  flower_pink: {
    emoji: '🌸', category: 'plant', height: 1, layer: 'base',
    scale: 0.55, shadow: false, walkable: true, interactable: false,
    description: 'Cherry blossom', jitter: 0.35,
  },
  flower_red: {
    emoji: '🌺', category: 'plant', height: 1, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Red hibiscus', jitter: 0.35,
  },
  sunflower: {
    emoji: '🌻', category: 'plant', height: 2, layer: 'base',
    scale: 0.65, shadow: false, walkable: true, interactable: false,
    description: 'Sunflower', jitter: 0.25,
  },
  bush: {
    emoji: '🌿', category: 'plant', height: 3, layer: 'mid',
    scale: 0.9, shadow: true, walkable: false, interactable: false,
    description: 'Dense bush (blocks movement)',
    occluderRatio: 0.35,
  },
  tree: {
    emoji: '🌳', category: 'plant', height: 8, layer: 'high',
    scale: 1.6, shadow: true, walkable: false, interactable: false,
    description: 'Large deciduous tree',
    occluderRatio: 0.35,
  },
  tree_pine: {
    emoji: '🌲', category: 'plant', height: 9, layer: 'high',
    scale: 1.8, shadow: true, walkable: false, interactable: false,
    description: 'Tall pine tree',
    occluderRatio: 0.3,
  },
  tree_palm: {
    emoji: '🌴', category: 'plant', height: 7, layer: 'high',
    scale: 1.5, shadow: true, walkable: false, interactable: false,
    description: 'Palm tree',
    occluderRatio: 0.3,
  },
  tall_plant: {
    emoji: '🪾', category: 'plant', height: 3, layer: 'mid',
    scale: 0.7, shadow: false, walkable: true, interactable: false,
    description: 'Tall ornamental plant',
  },
  stump: {
    emoji: '🪵', category: 'plant', height: 1, layer: 'base',
    scale: 0.5, shadow: false, walkable: true, interactable: false,
    description: 'Tree stump', jitter: 0.20,
  },
  mushroom: {
    emoji: '🍄', category: 'plant', height: 0, layer: 'base',
    scale: 0.35, shadow: false, walkable: true, interactable: true,
    description: 'Tiny mushroom cluster', jitter: 0.35,
  },

  // --- Obstacles (block movement, may require items) ---
  rock: {
    emoji: '🪨', category: 'obstacle', height: 2, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: false,
    description: 'Boulder', tileType: 'rock',
    hazardDamage: 0.5, hazardLabel: 'a sharp rock',
  },
  wall: {
    emoji: '🧱', category: 'obstacle', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Brick wall segment', tileType: 'stone_wall',
    occluderRatio: 0.6,
  },
  starter_foundation: {
    emoji: '⬜', category: 'obstacle', height: 3, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Starter cottage foundation stone', tileType: 'stone_wall_cottage_foundation',
    occluderRatio: 0.35,
  },
  starter_wall_plaster: {
    emoji: '🏠', category: 'obstacle', height: 8, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Starter cottage plaster/timber wall', tileType: 'starter_homestead_wall_plaster',
    occluderRatio: 0.65,
  },
  starter_cottage: {
    emoji: '🏠', category: 'obstacle', height: 7, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Starter cottage nano geometry with 45-degree roof and player-scale front door', tileType: 'starter_cottage',
    occluderRatio: 0.55,
  },
  castle_keep: {
    emoji: '🏰', category: 'obstacle', height: 9, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Single-cell castle keep nano geometry proof', tileType: 'castle_keep',
    occluderRatio: 0.70,
  },
  cathedral_chapel: {
    emoji: '⛪', category: 'obstacle', height: 9, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Single-cell cathedral chapel nano geometry proof', tileType: 'cathedral_chapel',
    occluderRatio: 0.70,
  },
  starter_roof_left: {
    emoji: '🛖', category: 'obstacle', height: 8, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Starter cottage thatch roof left slope', tileType: 'starter_roof_thatch_slope_left',
    occluderRatio: 0.55,
  },
  starter_roof_right: {
    emoji: '🛖', category: 'obstacle', height: 8, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Starter cottage thatch roof right slope', tileType: 'starter_roof_thatch_slope_right',
    occluderRatio: 0.55,
  },
  starter_roof_ridge: {
    emoji: '🛖', category: 'obstacle', height: 9, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Starter cottage thatch roof ridge', tileType: 'starter_roof_thatch_ridge',
    occluderRatio: 0.55,
  },
  door_locked: {
    emoji: '🔒', category: 'obstacle', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Locked door (needs key)', tileType: 'door_gate',
    occluderRatio: 0.6,
  },
  barricade: {
    emoji: '🪵', category: 'obstacle', height: 3, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Wooden barricade (needs crowbar)', tileType: 'wooden_fence',
    hazardDamage: 0.3, hazardLabel: 'a splintery barricade',
  },
  toll_gate: {
    emoji: '🚧', category: 'obstacle', height: 4, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Toll gate (pay coins to pass)', tileType: 'troll_bridge',
  },
  quiz_gate: {
    emoji: '❓', category: 'obstacle', height: 4, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Quiz gate (answer a question to pass)', tileType: 'quiz_gate',
  },

  // --- Interactive objects ---
  chest: {
    emoji: '📦', category: 'interactive', height: 2, layer: 'mid',
    scale: 0.9, shadow: true, walkable: false, interactable: true,
    description: 'Treasure chest (contains items)',
  },
  sign: {
    emoji: '🪧', category: 'interactive', height: 3, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: true,
    description: 'Readable sign post',
    occluderRatio: 0.4,
  },
  bridge: {
    emoji: '🌉', category: 'interactive', height: 1, layer: 'base',
    scale: 1.0, shadow: false, walkable: true, interactable: false,
    description: 'Bridge over water', tileType: 'bridge',
  },
  bonfire: {
    emoji: '🔥', category: 'interactive', height: 3, layer: 'mid',
    scale: 0.9, shadow: true, walkable: false, interactable: false,
    description: 'Bonfire (emits local light at night)',
  },
  door_open: {
    emoji: '🚪', category: 'interactive', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: true, interactable: false,
    description: 'Unlocked/open door',
    occluderRatio: 0.5,
  },

  // --- Collectibles ---
  coin: {
    emoji: '💰', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Gold coin', jitter: 0.20,
  },
  key: {
    emoji: '🔑', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Key (unlocks doors)', jitter: 0.15,
  },
  crowbar: {
    emoji: '🛠️', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Crowbar (removes barricades)', jitter: 0.15,
  },
  potion: {
    emoji: '🧪', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Speed potion', jitter: 0.15,
  },
  bandage: {
    emoji: '🩹', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.55, shadow: false, walkable: true, interactable: true,
    description: 'Healing bandage', jitter: 0.15,
  },
  snack: {
    emoji: '🍫', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.55, shadow: false, walkable: true, interactable: true,
    description: 'Trail snack bar', jitter: 0.15,
  },
  water_flask: {
    emoji: '🫗', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Water flask for hydration', jitter: 0.15,
  },
  soap: {
    emoji: '🧼', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.5, shadow: false, walkable: true, interactable: true,
    description: 'Bar of soap for cleanliness', jitter: 0.15,
  },
  torch: {
    emoji: '🔦', category: 'collectible', height: 2, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Handheld torch', jitter: 0.10,
  },
  map_scroll: {
    emoji: '🗺️', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.55, shadow: false, walkable: true, interactable: true,
    description: 'Map scroll revealing nearby areas', jitter: 0.15,
  },

  // --- NPCs ---
  npc_merchant: {
    emoji: '🧙', category: 'npc', height: 4, layer: 'mid',
    scale: 0.85, shadow: true, walkable: false, interactable: true,
    description: 'Merchant NPC',
  },
  npc_villager: {
    emoji: '👤', category: 'npc', height: 4, layer: 'mid',
    scale: 0.85, shadow: true, walkable: false, interactable: true,
    description: 'Villager NPC (hints/quizzes)',
  },
  npc_guardian: {
    emoji: '🛡️', category: 'npc', height: 5, layer: 'high',
    scale: 0.9, shadow: true, walkable: false, interactable: true,
    description: 'Guardian NPC (quiz gate)',
  },
  npc_cat: {
    emoji: '🐈', category: 'npc', height: 2, layer: 'mid',
    scale: 0.65, shadow: true, walkable: false, interactable: true,
    description: 'Friendly cat (pet me!)',
  },
  npc_black_cat: {
    emoji: '🐈\u200D⬛', category: 'npc', height: 2, layer: 'mid',
    scale: 0.65, shadow: true, walkable: false, interactable: true,
    description: 'Mysterious black cat',
  },

  // --- Farm Animals (ambient decoration, walkable) (#58) ---
  chicken: {
    emoji: '🐔', category: 'plant', height: 1, layer: 'base',
    scale: 0.5, shadow: false, walkable: true, interactable: false,
    description: 'Chicken pecking around', jitter: 0.20,
  },
  rooster: {
    emoji: '🐓', category: 'plant', height: 1, layer: 'base',
    scale: 0.55, shadow: false, walkable: true, interactable: false,
    description: 'Rooster strutting', jitter: 0.20,
  },
  pig: {
    emoji: '🐖', category: 'plant', height: 2, layer: 'base',
    scale: 0.6, shadow: true, walkable: true, interactable: false,
    description: 'Pig rooting around',
  },
  cow: {
    emoji: '🐄', category: 'plant', height: 3, layer: 'mid',
    scale: 0.75, shadow: true, walkable: true, interactable: false,
    description: 'Cow grazing',
  },
  sheep: {
    emoji: '🐑', category: 'plant', height: 2, layer: 'base',
    scale: 0.6, shadow: true, walkable: true, interactable: false,
    description: 'Fluffy sheep',
  },
  goat: {
    emoji: '🐐', category: 'plant', height: 2, layer: 'base',
    scale: 0.6, shadow: true, walkable: true, interactable: false,
    description: 'Playful goat',
  },
  rabbit: {
    emoji: '🐇', category: 'plant', height: 1, layer: 'base',
    scale: 0.4, shadow: false, walkable: true, interactable: false,
    description: 'Wild rabbit', jitter: 0.25,
  },
  duck: {
    emoji: '🦆', category: 'plant', height: 1, layer: 'base',
    scale: 0.5, shadow: false, walkable: true, interactable: false,
    description: 'Duck waddling', jitter: 0.20,
  },
  fox: {
    emoji: '🦊', category: 'plant', height: 2, layer: 'mid',
    scale: 0.55, shadow: true, walkable: true, interactable: false,
    description: 'Sly fox',
  },
  deer: {
    emoji: '🦌', category: 'plant', height: 3, layer: 'mid',
    scale: 0.7, shadow: true, walkable: true, interactable: false,
    description: 'Graceful deer',
  },
  horse: {
    emoji: '🐎', category: 'plant', height: 4, layer: 'mid',
    scale: 0.8, shadow: true, walkable: true, interactable: false,
    description: 'Horse galloping',
  },
  dog: {
    emoji: '🐕', category: 'plant', height: 2, layer: 'base',
    scale: 0.55, shadow: true, walkable: true, interactable: false,
    description: 'Friendly dog',
  },

  // --- Additional Plants (#58) ---
  tulip: {
    emoji: '🌷', category: 'plant', height: 1, layer: 'base',
    scale: 0.5, shadow: false, walkable: true, interactable: false,
    description: 'Tulip', jitter: 0.30,
  },
  clover: {
    emoji: '🍀', category: 'plant', height: 0, layer: 'base',
    scale: 0.4, shadow: false, walkable: true, interactable: false,
    description: 'Lucky clover patch', jitter: 0.35,
  },
  wheat: {
    emoji: '🌾', category: 'plant', height: 2, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Wheat sheaf', jitter: 0.20,
  },
  cactus: {
    emoji: '🌵', category: 'plant', height: 4, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: false,
    description: 'Prickly cactus (blocks movement)',
    hazardDamage: 1.0, hazardLabel: 'a prickly cactus',
  },
  seedling: {
    emoji: '🌱', category: 'plant', height: 0, layer: 'base',
    scale: 0.35, shadow: false, walkable: true, interactable: false,
    description: 'Tiny seedling', jitter: 0.35,
  },
  wilted_flower: {
    emoji: '🥀', category: 'plant', height: 1, layer: 'base',
    scale: 0.45, shadow: false, walkable: true, interactable: false,
    description: 'Wilted rose', jitter: 0.30,
  },
  maple_leaf: {
    emoji: '🍁', category: 'plant', height: 0, layer: 'base',
    scale: 0.35, shadow: false, walkable: true, interactable: false,
    description: 'Fallen maple leaf', jitter: 0.35,
  },

  // --- Structure emojis (#58) ---
  house: {
    emoji: '🏠', category: 'obstacle', height: 8, layer: 'high',
    scale: 1.4, shadow: true, walkable: false, interactable: true,
    description: 'Small house', tileType: 'homestead_wall',
  },
  hut: {
    emoji: '🛖', category: 'obstacle', height: 6, layer: 'high',
    scale: 1.2, shadow: true, walkable: false, interactable: true,
    description: 'Rustic hut', tileType: 'homestead_wall',
  },
  shop: {
    emoji: '🏪', category: 'obstacle', height: 7, layer: 'high',
    scale: 1.3, shadow: true, walkable: false, interactable: true,
    description: 'Small shop', tileType: 'homestead_wall',
  },
  cathedral_wall: {
    emoji: '⛪', category: 'obstacle', height: 12, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Ruined cathedral wall section', tileType: 'cathedral_wall',
    occluderRatio: 0.75,
  },
  // Themed shop variants (#112 Phase 2)
  shop_general: {
    emoji: '🏬', category: 'obstacle', height: 7, layer: 'high',
    scale: 1.3, shadow: true, walkable: false, interactable: true,
    description: 'General Store — sells everything an adventurer needs',
  },
  shop_snack: {
    emoji: '🍿', category: 'obstacle', height: 6, layer: 'high',
    scale: 1.1, shadow: true, walkable: false, interactable: true,
    description: 'Snack Stand — tasty treats and refreshments',
  },
  shop_trading: {
    emoji: '🛒', category: 'obstacle', height: 7, layer: 'high',
    scale: 1.2, shadow: true, walkable: false, interactable: true,
    description: 'Trading Post — barter your finds for supplies',
  },
  fence: {
    emoji: '🚧', category: 'obstacle', height: 2, layer: 'mid',
    scale: 0.7, shadow: false, walkable: false, interactable: true,
    description: 'Wooden fence segment', tileType: 'wooden_fence',
  },

  // --- Effects & particles (#58) ---
  sparkle: {
    emoji: '✨', category: 'plant', height: 0, layer: 'overlay',
    scale: 0.4, shadow: false, walkable: true, interactable: false,
    description: 'Magical sparkle', jitter: 0.35,
  },
  outhouse: {
    emoji: '🚽', category: 'interactive', height: 6, layer: 'high',
    scale: 1.1, shadow: true, walkable: false, interactable: true,
    description: 'Outhouse — restores cleanliness via hygiene quiz',
  },
  campfire: {
    emoji: '🔥', category: 'interactive', height: 2, layer: 'mid',
    scale: 0.7, shadow: true, walkable: false, interactable: true,
    description: 'Small campfire',
  },
  biomass_fire: {
    emoji: '🔥', category: 'interactive', height: 3, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: false,
    description: 'Smoldering biomass pile (greenish glow)',
  },

  // Biome-specific NPCs (Doc 05 §4.2)
  npc_farmer: {
    emoji: '👨\u200D🌾', category: 'npc', height: 4, layer: 'mid',
    scale: 0.85, shadow: true, walkable: false, interactable: true,
    description: 'Meadow farmer',
  },
  npc_beekeeper: {
    emoji: '🐝', category: 'npc', height: 3, layer: 'mid',
    scale: 0.75, shadow: true, walkable: false, interactable: true,
    description: 'Beekeeper with honey to share',
  },
  npc_ranger: {
    emoji: '🏹', category: 'npc', height: 4, layer: 'mid',
    scale: 0.85, shadow: true, walkable: false, interactable: true,
    description: 'Forest ranger',
  },
  npc_hermit: {
    emoji: '🧔', category: 'npc', height: 4, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: true,
    description: 'Forest hermit with wisdom',
  },
  npc_miner: {
    emoji: '⛏️', category: 'npc', height: 4, layer: 'mid',
    scale: 0.85, shadow: true, walkable: false, interactable: true,
    description: 'Cave miner',
  },
  npc_ghost: {
    emoji: '👻', category: 'npc', height: 4, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: true,
    description: 'Castle ghost with secrets',
  },
  npc_knight: {
    emoji: '⚔️', category: 'npc', height: 5, layer: 'high',
    scale: 0.9, shadow: true, walkable: false, interactable: true,
    description: 'Castle knight',
  },
};

// ─── Obstacle Templates ──────────────────────────────────────
// Defines which item resolves which obstacle.
// Used by mechanics.ts for interaction logic.

export interface ObstacleTemplate {
  obstacleAsset: string;   // Key in ASSET_DEFS
  requiredItem: string;    // Key in ASSET_DEFS (collectible)
  resolvedAsset: string;   // What it becomes after solving
  coinCost?: number;       // For toll gates
  description: string;
}

export const OBSTACLE_TEMPLATES: ObstacleTemplate[] = [
  {
    obstacleAsset: 'door_locked',
    requiredItem: 'key',
    resolvedAsset: 'door_open',
    description: 'Use key to unlock door',
  },
  {
    obstacleAsset: 'barricade',
    requiredItem: 'crowbar',
    resolvedAsset: 'grass',
    description: 'Use crowbar to clear barricade',
  },
  {
    obstacleAsset: 'toll_gate',
    requiredItem: 'coin',
    resolvedAsset: 'grass',
    coinCost: 10,
    description: 'Pay 10 coins to pass toll',
  },
];

// Quiz gate asset key — resolved via quiz, not inventory items.
// Handled separately from OBSTACLE_TEMPLATES in mechanics.ts.
export const QUIZ_GATE_ASSET = 'quiz_gate';
export const QUIZ_GATE_RESOLVED = 'door_open';
