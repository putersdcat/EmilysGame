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
};
