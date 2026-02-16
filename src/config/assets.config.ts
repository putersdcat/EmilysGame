/**
 * config/assets.config.ts - Asset metadata definitions.
 * All game objects, tiles, and interactive elements defined here.
 * 
 * Each entry provides visual + behavioral metadata for world objects.
 * The renderer and gen systems reference these by key name.
 */

// ─── Types ───────────────────────────────────────────────────

import type { TileType } from '../tiles';

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
  tileType?: TileType;      // SVG tile type for ground rendering (if available)
  jitter?: number;           // 0-1 sub-cell placement jitter range (fraction of half-tile). 0 = centered. (#82)
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
  },
  tree: {
    emoji: '🌳', category: 'plant', height: 8, layer: 'high',
    scale: 1.6, shadow: true, walkable: false, interactable: false,
    description: 'Large deciduous tree',
  },
  tree_pine: {
    emoji: '🌲', category: 'plant', height: 9, layer: 'high',
    scale: 1.8, shadow: true, walkable: false, interactable: false,
    description: 'Tall pine tree',
  },
  tree_palm: {
    emoji: '🌴', category: 'plant', height: 7, layer: 'high',
    scale: 1.5, shadow: true, walkable: false, interactable: false,
    description: 'Palm tree',
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
  },
  wall: {
    emoji: '🧱', category: 'obstacle', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Brick wall segment', tileType: 'stone_wall',
  },
  door_locked: {
    emoji: '🔒', category: 'obstacle', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Locked door (needs key)', tileType: 'door_gate',
  },
  barricade: {
    emoji: '🪵', category: 'obstacle', height: 3, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Wooden barricade (needs crowbar)', tileType: 'wooden_fence',
  },
  toll_gate: {
    emoji: '🚧', category: 'obstacle', height: 4, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Toll gate (pay coins to pass)',
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
    description: 'Small house',
  },
  hut: {
    emoji: '🛖', category: 'obstacle', height: 6, layer: 'high',
    scale: 1.2, shadow: true, walkable: false, interactable: true,
    description: 'Rustic hut',
  },
  shop: {
    emoji: '🏪', category: 'obstacle', height: 7, layer: 'high',
    scale: 1.3, shadow: true, walkable: false, interactable: true,
    description: 'Small shop',
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
    description: 'Wooden fence segment',
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
