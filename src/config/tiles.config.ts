/**
 * config/tiles.config.ts - Micro tile metadata and world unit templates.
 * Defines tile types with walkability, edge tags, and structured 5x5
 * "world unit" patterns for rivers, walls, gates, bridges.
 * TODO: DOC - tile hierarchy and template placement rules
 */

import type { TileType } from '../tiles';

// ─── Micro Tile Metadata ─────────────────────────────────────

export type EdgeTag = 'open' | 'wall' | 'water' | 'fence';

export interface MicroTileDef {
  type: TileType;
  walkable: boolean;
  edgeTag: EdgeTag;        // What this tile contributes to edge matching
  height: number;          // 0 = flat ground, 1-5 = elevated
  connectable: boolean;    // Must connect to same-type neighbors (rivers, walls)
  description: string;
}

export const MICRO_TILE_DEFS: Record<TileType, MicroTileDef> = {
  grass:        { type: 'grass',        walkable: true,  edgeTag: 'open',  height: 0, connectable: false, description: 'Grass ground' },
  dirt:         { type: 'dirt',         walkable: true,  edgeTag: 'open',  height: 0, connectable: false, description: 'Dirt path' },
  rock:         { type: 'rock',         walkable: false, edgeTag: 'open',  height: 2, connectable: false, description: 'Boulder obstacle' },
  water:        { type: 'water',        walkable: false, edgeTag: 'water', height: 0, connectable: true,  description: 'Water (impassable)' },
  stone_wall:   { type: 'stone_wall',   walkable: false, edgeTag: 'wall',  height: 4, connectable: true,  description: 'Stone wall segment' },
  bridge:       { type: 'bridge',       walkable: true,  edgeTag: 'water', height: 1, connectable: false, description: 'Bridge over water' },
  door_gate:    { type: 'door_gate',    walkable: false, edgeTag: 'wall',  height: 4, connectable: false, description: 'Locked gate in wall' },
  wooden_fence: { type: 'wooden_fence', walkable: false, edgeTag: 'fence', height: 2, connectable: true,  description: 'Wooden fence segment' },
};

// ─── World Unit Templates (5×5) ──────────────────────────────
// Each template is a 5×5 grid of asset keys.
// null = "don't override" (keep existing cell from Perlin gen).
// These stamps are overlaid on Perlin-generated terrain.

export interface WorldUnitTemplate {
  name: string;
  /** 5×5 grid [row][col]. null means keep existing cell. */
  cells: (string | null)[][];
  /** Edge compatibility tags for neighbor matching */
  edgeTags: { n: EdgeTag; s: EdgeTag; e: EdgeTag; w: EdgeTag };
  /** Can be rotated 90° increments? */
  rotatable: boolean;
  /** Ends a feature chain? (pond, rock pile) */
  terminator: boolean;
  /** Feature chain type for linking */
  chainType?: 'river' | 'wall' | 'fence';
  /** Minimum passability this template leaves (fraction walkable in 5×5) */
  minPassability: number;
}

// Helper: create a 5×5 grid filled with a value
function fill5x5(val: string | null): (string | null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(val));
}

export const WORLD_UNIT_TEMPLATES: WorldUnitTemplate[] = [
  // --- Meadow base (all grass, default filler) ---
  {
    name: 'meadow_base',
    cells: fill5x5('grass'),
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
  },

  // --- River straight N-S (water in center column) ---
  {
    name: 'river_straight_ns',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'water', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.8,
  },

  // --- River straight E-W (water in center row) ---
  {
    name: 'river_straight_ew',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['water', 'water', 'water', 'water', 'water'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'water', w: 'water' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.8,
  },

  // --- River bend NE (water bends from N to E) ---
  {
    name: 'river_bend_ne',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'water', 'water'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'open', e: 'water', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.72,
  },

  // --- River bend NW (water bends from N to W) ---
  {
    name: 'river_bend_nw',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['water', 'water', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'open', e: 'open', w: 'water' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.72,
  },

  // --- River end / Pond (terminates a river) ---
  {
    name: 'river_end_pond',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'water', 'water', 'water', 'grass'],
      ['grass', 'water', 'water', 'water', 'grass'],
      ['grass', 'water', 'water', 'water', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: true,
    chainType: 'river',
    minPassability: 0.52,
  },

  // --- Wall segment (stone wall across center row) ---
  {
    name: 'wall_segment',
    cells: [
      [null, null, null, null, null],
      [null, null, null, null, null],
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.8,
  },

  // --- Wall with gate (wall row with door in center) ---
  {
    name: 'wall_gate',
    cells: [
      [null, null, null, null, null],
      [null, null, null, null, null],
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.8,
  },

  // --- Bridge over river N-S (bridge in center of water column) ---
  {
    name: 'bridge_ns',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'bridge', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'water', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.84,
  },

  // --- Bridge over river E-W ---
  {
    name: 'bridge_ew',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['water', 'water', 'bridge', 'water', 'water'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'water', w: 'water' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.84,
  },

  // --- Wooden fence enclosure (square fence with opening) ---
  {
    name: 'fence_enclosure',
    cells: [
      ['wooden_fence', 'wooden_fence', 'grass', 'wooden_fence', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence'],
    ],
    edgeTags: { n: 'fence', s: 'fence', e: 'fence', w: 'fence' },
    rotatable: true,
    terminator: true,
    chainType: 'fence',
    minPassability: 0.36,
  },
];

// ─── Template Selection ──────────────────────────────────────

/** Biome-specific template weights. Higher = more likely to spawn. */
export const BIOME_TEMPLATE_WEIGHTS: Record<string, Record<string, number>> = {
  meadow: {
    river_straight_ns: 0.15,
    river_straight_ew: 0.15,
    river_bend_ne: 0.08,
    river_bend_nw: 0.08,
    river_end_pond: 0.08,
    bridge_ns: 0.06,
    bridge_ew: 0.06,
    fence_enclosure: 0.1,
    wall_gate: 0.03,
    wall_segment: 0.02,
  },
  forest: {
    river_straight_ns: 0.12,
    river_straight_ew: 0.12,
    river_bend_ne: 0.1,
    river_bend_nw: 0.1,
    river_end_pond: 0.1,
    bridge_ns: 0.08,
    bridge_ew: 0.08,
    wall_segment: 0.05,
    wall_gate: 0.05,
    fence_enclosure: 0.05,
  },
  cave: {
    wall_segment: 0.2,
    wall_gate: 0.15,
    river_straight_ns: 0.08,
    river_straight_ew: 0.08,
    river_end_pond: 0.06,
    bridge_ns: 0.04,
    bridge_ew: 0.04,
  },
  castle: {
    wall_segment: 0.25,
    wall_gate: 0.2,
    fence_enclosure: 0.1,
    river_straight_ns: 0.04,
    river_straight_ew: 0.04,
  },
};

/**
 * Select a template name from biome-specific weights.
 * Returns null if no template should be placed (weighted chance).
 */
export function selectTemplate(biomeName: string, rng: () => number): string | null {
  const weights = BIOME_TEMPLATE_WEIGHTS[biomeName];
  if (!weights) return null;

  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);

  // 40% chance of placing any template at all
  if (rng() > 0.4) return null;

  let roll = rng() * totalWeight;
  for (const [name, w] of entries) {
    roll -= w;
    if (roll <= 0) return name;
  }
  return entries[entries.length - 1][0];
}

/**
 * Get template definition by name.
 */
export function getTemplate(name: string): WorldUnitTemplate | undefined {
  return WORLD_UNIT_TEMPLATES.find((t) => t.name === name);
}
