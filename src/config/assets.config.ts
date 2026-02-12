/**
 * config/assets.config.ts - Asset metadata definitions.
 * All game objects, tiles, and interactive elements defined here.
 * 
 * Each entry provides visual + behavioral metadata for world objects.
 * The renderer and gen systems reference these by key name.
 */

// ─── Types ───────────────────────────────────────────────────

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
}

// ─── Master Asset Library ────────────────────────────────────

export const ASSET_DEFS: Record<string, AssetDef> = {

  // --- Terrain (base ground types) ---
  grass: {
    emoji: '🌱', category: 'terrain', height: 0, layer: 'base',
    scale: 0.7, shadow: false, walkable: true, interactable: false,
    description: 'Short grass patch',
  },
  dirt: {
    emoji: '🟫', category: 'terrain', height: 0, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Dirt path tile',
  },
  sand: {
    emoji: '🟨', category: 'terrain', height: 0, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Sandy ground',
  },
  water: {
    emoji: '🌊', category: 'terrain', height: 0, layer: 'base',
    scale: 0.8, shadow: false, walkable: false, interactable: false,
    description: 'Water (impassable without bridge)',
  },
  stone_floor: {
    emoji: '⬜', category: 'terrain', height: 0, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Stone floor (cave/castle)',
  },

  // --- Plants (decorative, mostly walkable) ---
  flower: {
    emoji: '🌼', category: 'plant', height: 1, layer: 'base',
    scale: 0.6, shadow: false, walkable: true, interactable: false,
    description: 'Wildflower',
  },
  bush: {
    emoji: '🌿', category: 'plant', height: 3, layer: 'mid',
    scale: 0.9, shadow: true, walkable: false, interactable: false,
    description: 'Dense bush (blocks movement)',
  },
  tree: {
    emoji: '🌳', category: 'plant', height: 8, layer: 'high',
    scale: 1.2, shadow: true, walkable: false, interactable: false,
    description: 'Large tree',
  },
  mushroom: {
    emoji: '🍄', category: 'plant', height: 2, layer: 'mid',
    scale: 0.8, shadow: true, walkable: true, interactable: true,
    description: 'Collectible mushroom',
  },

  // --- Obstacles (block movement, may require items) ---
  rock: {
    emoji: '🪨', category: 'obstacle', height: 2, layer: 'mid',
    scale: 0.8, shadow: true, walkable: false, interactable: false,
    description: 'Boulder',
  },
  wall: {
    emoji: '🧱', category: 'obstacle', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: false,
    description: 'Brick wall segment',
  },
  door_locked: {
    emoji: '🔒', category: 'obstacle', height: 5, layer: 'high',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Locked door (needs key)',
  },
  barricade: {
    emoji: '🪵', category: 'obstacle', height: 3, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Wooden barricade (needs crowbar)',
  },
  toll_gate: {
    emoji: '🚧', category: 'obstacle', height: 4, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Toll gate (pay coins to pass)',
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
    description: 'Bridge over water',
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
    description: 'Gold coin',
  },
  key: {
    emoji: '🔑', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Key (unlocks doors)',
  },
  crowbar: {
    emoji: '🛠️', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Crowbar (removes barricades)',
  },
  potion: {
    emoji: '🧪', category: 'collectible', height: 1, layer: 'mid',
    scale: 0.6, shadow: false, walkable: true, interactable: true,
    description: 'Speed potion',
  },

  // --- NPCs ---
  npc_merchant: {
    emoji: '🧙', category: 'npc', height: 4, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Merchant NPC',
  },
  npc_villager: {
    emoji: '👤', category: 'npc', height: 4, layer: 'mid',
    scale: 1.0, shadow: true, walkable: false, interactable: true,
    description: 'Villager NPC (hints/quizzes)',
  },
  npc_guardian: {
    emoji: '🛡️', category: 'npc', height: 5, layer: 'high',
    scale: 1.1, shadow: true, walkable: false, interactable: true,
    description: 'Guardian NPC (quiz gate)',
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
