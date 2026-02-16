/**
 * config/items.config.ts - Item definitions for inventory system.
 * All collectible/usable items are defined here.
 */

export interface ItemDef {
  id: string;
  assetKey: string;     // References ASSET_DEFS key
  displayName: string;
  description: string;
  stackable: boolean;   // Can multiples stack in one slot?
  maxStack: number;     // Max per stack (1 for non-stackable)
  consumable: boolean;  // Destroyed on use?
  /** Effect applied on use (if applicable) */
  effect?: ItemEffect;
}

export interface ItemEffect {
  type: 'speed_boost' | 'reveal_map' | 'heal' | 'unlock' | 'remove_obstacle';
  duration?: number;     // Duration in ms (for timed effects)
  value?: number;        // Magnitude of effect
}

export const ITEM_DEFS: Record<string, ItemDef> = {
  coin: {
    id: 'coin',
    assetKey: 'coin',
    displayName: 'Gold Coin',
    description: 'Shiny gold coin. Used for trades and tolls.',
    stackable: true,
    maxStack: 999,
    consumable: true,
  },
  key: {
    id: 'key',
    assetKey: 'key',
    displayName: 'Bronze Key',
    description: 'Unlocks locked doors.',
    stackable: true,
    maxStack: 10,
    consumable: true,
    effect: { type: 'unlock' },
  },
  crowbar: {
    id: 'crowbar',
    assetKey: 'crowbar',
    displayName: 'Sturdy Crowbar',
    description: 'Pries open barricades and stuck things.',
    stackable: false,
    maxStack: 1,
    consumable: true,
    effect: { type: 'remove_obstacle' },
  },
  potion: {
    id: 'potion',
    assetKey: 'potion',
    displayName: 'Speed Potion',
    description: 'Temporarily boosts movement speed.',
    stackable: true,
    maxStack: 5,
    consumable: true,
    effect: { type: 'speed_boost', duration: 10000, value: 2.0 },
  },
  mushroom: {
    id: 'mushroom',
    assetKey: 'mushroom',
    displayName: 'Forest Mushroom',
    description: 'A tasty mushroom. Restores a little energy.',
    stackable: true,
    maxStack: 10,
    consumable: true,
    effect: { type: 'heal', value: 1 },
  },
  bandage: {
    id: 'bandage',
    assetKey: 'bandage',
    displayName: 'Bandage',
    description: 'Wraps minor injuries.',
    stackable: true,
    maxStack: 5,
    consumable: true,
    effect: { type: 'heal', value: 2 },
  },
  map_scroll: {
    id: 'map_scroll',
    assetKey: 'map_scroll',
    displayName: 'Map Scroll',
    description: 'Reveals nearby areas on the minimap.',
    stackable: true,
    maxStack: 3,
    consumable: true,
    effect: { type: 'reveal_map', value: 3 },
  },
  torch: {
    id: 'torch',
    assetKey: 'torch',
    displayName: 'Torch',
    description: 'A handheld light source. Provides warm light while in inventory.',
    stackable: true,
    maxStack: 5,
    consumable: false, // Passive light source — not consumed on use
    effect: { type: 'heal', value: 0 }, // Light is a passive inventory effect
  },
  snack: {
    id: 'snack',
    assetKey: 'snack',
    displayName: 'Trail Snack',
    description: 'A tasty snack that restores energy.',
    stackable: true,
    maxStack: 10,
    consumable: true,
    effect: { type: 'heal', value: 3 },
  },
  water: {
    id: 'water',
    assetKey: 'water',
    displayName: 'Fresh Water',
    description: 'A bottle of clean water. Restores hydration.',
    stackable: true,
    maxStack: 10,
    consumable: true,
    effect: { type: 'heal', value: 3 },
  },
  water_flask: {
    id: 'water_flask',
    assetKey: 'water_flask',
    displayName: 'Water Flask',
    description: 'A leather-wrapped flask of clean water. Restores hydration.',
    stackable: true,
    maxStack: 5,
    consumable: true,
    effect: { type: 'heal', value: 3 },
  },
  soap: {
    id: 'soap',
    assetKey: 'soap',
    displayName: 'Bar of Soap',
    description: 'Helps stay clean on the adventure.',
    stackable: true,
    maxStack: 5,
    consumable: true,
    effect: { type: 'heal', value: 5 },
  },
};
