/**
 * config/tiles.config.ts - Micro tile metadata and world unit templates.
 * Defines tile types with per-side edge vectors, traversal classes,
 * surface types, and structured 5x5 "world unit" patterns.
 *
 * Design doc: Docs/WorldEngine-01-SpatialHierarchy.md (Section 2)
 * GitHub: #22 — Enhanced Micro Tile Metadata & Per-Side Edge Vectors
 */

import type { TileType } from '../tiles';

// ─── Edge & Traversal Types ─────────────────────────────────

export type EdgeTag = 'open' | 'wall' | 'water' | 'fence';

/** Cardinal direction type used for edge queries */
export type Cardinal = 'n' | 's' | 'e' | 'w';

/** Per-side edge vector — each face declares what it connects to */
export interface EdgeVector {
  n: EdgeTag;
  s: EdgeTag;
  e: EdgeTag;
  w: EdgeTag;
}

/** Traversal class: how the player can move through this tile */
export type TraversalType = 'open' | 'blocked' | 'conditional' | 'hazardous';

/** Surface type for auto-tiling border blending */
export type SurfaceType = 'grass' | 'dirt' | 'stone' | 'water' | 'wood';

// ─── Micro Tile Metadata ─────────────────────────────────────

export interface MicroTileDef {
  type: TileType;
  walkable: boolean;
  /** @deprecated Use `edges` for per-side matching. Kept for backward compat. */
  edgeTag: EdgeTag;
  /** Per-side edge vectors for constraint-based matching */
  edges: EdgeVector;
  /** How the player traverses: open, blocked, conditional (needs item), hazardous */
  traversal: TraversalType;
  /** Surface type for auto-tiling transitions */
  surface: SurfaceType;
  height: number;          // 0 = flat ground, 1-5 = elevated
  connectable: boolean;    // Must connect to same-type neighbors (rivers, walls)
  /** Can decorations (flowers, rocks, etc.) spawn on this tile? */
  decorationEligible: boolean;
  /** Variation family for tile variants (e.g. 'grass' for grass_1, grass_2) */
  variationFamily: string;
  /** Index within the variation family (0 = base) */
  variationIndex: number;
  description: string;
}

export const MICRO_TILE_DEFS: Record<TileType, MicroTileDef> = {
  grass: {
    type: 'grass', walkable: true, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'open', surface: 'grass', height: 0,
    connectable: false, decorationEligible: true,
    variationFamily: 'grass', variationIndex: 0,
    description: 'Grass ground',
  },
  dirt: {
    type: 'dirt', walkable: true, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'open', surface: 'dirt', height: 0,
    connectable: false, decorationEligible: true,
    variationFamily: 'dirt', variationIndex: 0,
    description: 'Dirt path',
  },
  rock: {
    type: 'rock', walkable: false, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'blocked', surface: 'stone', height: 2,
    connectable: false, decorationEligible: false,
    variationFamily: 'rock', variationIndex: 0,
    description: 'Boulder obstacle',
  },
  water: {
    type: 'water', walkable: false, edgeTag: 'water',
    edges: { n: 'water', s: 'water', e: 'water', w: 'water' },
    traversal: 'hazardous', surface: 'water', height: 0,
    connectable: true, decorationEligible: false,
    variationFamily: 'water', variationIndex: 0,
    description: 'Water (impassable)',
  },
  stone_wall: {
    type: 'stone_wall', walkable: false, edgeTag: 'wall',
    edges: { n: 'wall', s: 'wall', e: 'wall', w: 'wall' },
    traversal: 'blocked', surface: 'stone', height: 4,
    connectable: true, decorationEligible: false,
    variationFamily: 'wall', variationIndex: 0,
    description: 'Stone wall segment',
  },
  bridge: {
    type: 'bridge', walkable: true, edgeTag: 'water',
    edges: { n: 'open', s: 'open', e: 'water', w: 'water' },
    traversal: 'open', surface: 'wood', height: 1,
    connectable: false, decorationEligible: false,
    variationFamily: 'bridge', variationIndex: 0,
    description: 'Bridge over water',
  },
  door_gate: {
    type: 'door_gate', walkable: false, edgeTag: 'wall',
    edges: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    traversal: 'conditional', surface: 'wood', height: 4,
    connectable: false, decorationEligible: false,
    variationFamily: 'gate', variationIndex: 0,
    description: 'Locked gate in wall (needs key)',
  },
  wooden_fence: {
    type: 'wooden_fence', walkable: false, edgeTag: 'fence',
    edges: { n: 'fence', s: 'fence', e: 'fence', w: 'fence' },
    traversal: 'blocked', surface: 'wood', height: 2,
    connectable: true, decorationEligible: false,
    variationFamily: 'fence', variationIndex: 0,
    description: 'Wooden fence segment',
  },
};

// ─── Edge Compatibility ──────────────────────────────────────
// Which EdgeTag pairs can sit adjacent? Symmetric table.
// Design doc: Docs/WorldEngine-02-EdgeContracts.md

const EDGE_COMPAT: Record<EdgeTag, Set<EdgeTag>> = {
  open:  new Set<EdgeTag>(['open', 'fence']),     // open can touch open or fence
  wall:  new Set<EdgeTag>(['wall', 'open']),       // walls can abut walls or open
  water: new Set<EdgeTag>(['water', 'open']),      // water can touch water or shore (open)
  fence: new Set<EdgeTag>(['fence', 'open']),      // fences can touch fences or open
};

/** Check if two edge tags are compatible when placed adjacent */
export function edgesCompatible(a: EdgeTag, b: EdgeTag): boolean {
  return EDGE_COMPAT[a]?.has(b) ?? false;
}

/** Get the opposite cardinal direction */
export function oppositeDir(dir: Cardinal): Cardinal {
  switch (dir) {
    case 'n': return 's';
    case 's': return 'n';
    case 'e': return 'w';
    case 'w': return 'e';
  }
}

/** Check if two micro tiles can be placed adjacent given placement direction */
export function tilesCompatible(
  tileA: TileType,
  tileB: TileType,
  dirAtoB: Cardinal,
): boolean {
  const defA = MICRO_TILE_DEFS[tileA];
  const defB = MICRO_TILE_DEFS[tileB];
  if (!defA || !defB) return false;
  const edgeA = defA.edges[dirAtoB];
  const edgeB = defB.edges[oppositeDir(dirAtoB)];
  return edgesCompatible(edgeA, edgeB);
}

/** Get the edge tag of a micro tile on a specific side */
export function getMicroEdge(tileType: TileType, side: Cardinal): EdgeTag {
  return MICRO_TILE_DEFS[tileType]?.edges[side] ?? 'open';
}

// ─── World Unit Templates (5×5) ──────────────────────────────
// Each template is a 5×5 grid of asset keys.
// null = "don't override" (keep existing cell from Perlin gen).
// These stamps are overlaid on Perlin-generated terrain.
// Design doc: Docs/WorldEngine-01-SpatialHierarchy.md (Section 3)

/** Template category for solver weighting */
export type TemplateCategory = 'structural' | 'natural' | 'transitional';

/** Anchor point within a template for feature/NPC/item placement */
export interface AnchorPoint {
  x: number;        // Column (0-4) within the 5×5 grid
  y: number;        // Row (0-4) within the 5×5 grid
  role: 'npc' | 'item' | 'decoration' | 'feature';
}

export interface WorldUnitTemplate {
  name: string;
  /** 5×5 grid [row][col]. null means keep existing cell. */
  cells: (string | null)[][];
  /** Edge compatibility tags for neighbor matching */
  edgeTags: EdgeVector;
  /** Can be rotated 90° increments? */
  rotatable: boolean;
  /** Ends a feature chain? (pond, rock pile) */
  terminator: boolean;
  /** Feature chain type for linking */
  chainType?: 'river' | 'wall' | 'fence';
  /** Minimum passability this template leaves (fraction walkable in 5×5) */
  minPassability: number;
  /** Movement channels: lists of {x,y} waypoints that guarantee walkable paths through the unit */
  movementChannels?: Array<Array<{ x: number; y: number }>>;
  /** Anchor points for population (NPCs, items, decorations) */
  anchors?: AnchorPoint[];
  /** Biomes that prefer this template (empty = all biomes) */
  biomeAffinity?: string[];
  /** Template category for solver weighting */
  category?: TemplateCategory;
}

/** A concrete rotation of a template, pre-computed at load time */
export interface RotatedTemplate {
  /** Reference to the base template name */
  baseName: string;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation: number;
  /** Rotated 5×5 grid */
  cells: (string | null)[][];
  /** Rotated edge tags */
  edgeTags: EdgeVector;
  /** Rotated movement channels */
  movementChannels?: Array<Array<{ x: number; y: number }>>;
  /** Rotated anchors */
  anchors?: AnchorPoint[];
}

// Helper: create a 5×5 grid filled with a value
function fill5x5(val: string | null): (string | null)[][] {
  return Array.from({ length: 5 }, () => Array(5).fill(val));
}

/** Rotate a 5×5 grid 90° clockwise */
function rotateGrid90(grid: (string | null)[][]): (string | null)[][] {
  const size = grid.length;
  const out: (string | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[x][size - 1 - y] = grid[y][x];
    }
  }
  return out;
}

/** Rotate edge tags 90° clockwise: n→e, e→s, s→w, w→n */
function rotateEdges90(edges: EdgeVector): EdgeVector {
  return { n: edges.w, e: edges.n, s: edges.e, w: edges.s };
}

/** Rotate a point 90° clockwise within a 5×5 grid */
function rotatePoint90(p: { x: number; y: number }, size = 5): { x: number; y: number } {
  return { x: size - 1 - p.y, y: p.x };
}

/** Pre-compute all rotation variants for a template */
export function computeRotations(template: WorldUnitTemplate): RotatedTemplate[] {
  const variants: RotatedTemplate[] = [];
  let cells = template.cells;
  let edges = template.edgeTags;
  let channels = template.movementChannels;
  let anchors = template.anchors;

  for (let r = 0; r < 4; r++) {
    const deg = r * 90;
    if (r === 0 || template.rotatable) {
      variants.push({
        baseName: template.name,
        rotation: deg,
        cells: cells.map(row => [...row]),
        edgeTags: { ...edges },
        movementChannels: channels?.map(ch => ch.map(p => ({ ...p }))),
        anchors: anchors?.map(a => ({ ...a })),
      });
    }
    // Rotate for next iteration
    cells = rotateGrid90(cells);
    edges = rotateEdges90(edges);
    channels = channels?.map(ch => ch.map(p => rotatePoint90(p)));
    anchors = anchors?.map(a => ({
      ...a,
      ...rotatePoint90({ x: a.x, y: a.y }),
    }));
  }
  return variants;
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
    category: 'natural',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],  // N-S through center
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],  // E-W through center
    ],
    anchors: [
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 3, role: 'decoration' },
      { x: 2, y: 2, role: 'item' },
    ],
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
    category: 'natural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 0, y: 4 }],  // W-side walkable corridor
      [{ x: 4, y: 0 }, { x: 4, y: 4 }],  // E-side walkable corridor
    ],
    anchors: [
      { x: 0, y: 2, role: 'decoration' },
      { x: 4, y: 2, role: 'decoration' },
    ],
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
    category: 'natural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],  // N-side walkable corridor
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],  // S-side walkable corridor
    ],
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
    category: 'natural',
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
    category: 'natural',
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
    category: 'natural',
    anchors: [{ x: 2, y: 2, role: 'feature' }],
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
    category: 'structural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],  // N-side corridor
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],  // S-side corridor
    ],
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
    category: 'structural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],  // N-side
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],  // S-side
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],  // Through gate
    ],
    anchors: [{ x: 2, y: 2, role: 'feature' }],
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
    category: 'transitional',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 4 }],  // Through bridge N-S
    ],
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
    category: 'transitional',
    movementChannels: [
      [{ x: 0, y: 2 }, { x: 2, y: 2 }, { x: 4, y: 2 }],  // Through bridge E-W
    ],
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
    category: 'structural',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 2 }],  // Enter through N opening
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'item' },
    ],
  },

  // ─────────── New templates (#24: Template Library Expansion) ───────────

  // --- Dirt clearing (dirt center with grass border) ---
  {
    name: 'dirt_clearing',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'item' },
    ],
  },

  // --- Rocky outcrop (rocks clustered in center, open edges) ---
  {
    name: 'rocky_outcrop',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'rock', 'grass', 'rock', 'grass'],
      ['grass', 'grass', 'rock', 'grass', 'grass'],
      ['grass', 'rock', 'grass', 'rock', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 0.8,
    category: 'natural',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
    ],
  },

  // --- Dirt path N-S (path running north-south) ---
  {
    name: 'dirt_path_ns',
    cells: [
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 0, y: 2, role: 'decoration' },
      { x: 4, y: 2, role: 'decoration' },
    ],
  },

  // --- Dirt path E-W (path running east-west) ---
  {
    name: 'dirt_path_ew',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['dirt', 'dirt', 'dirt', 'dirt', 'dirt'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    movementChannels: [
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
  },

  // --- River T-junction (water from N, S, and E) ---
  {
    name: 'river_t_junction',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'water', 'water'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'water', e: 'water', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.68,
    category: 'natural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 0, y: 4 }],  // W-side walkable
    ],
  },

  // --- River crossroads (4-way water intersection) ---
  {
    name: 'river_crossroads',
    cells: [
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['water', 'water', 'water', 'water', 'water'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
      ['grass', 'grass', 'water', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'water', e: 'water', w: 'water' },
    rotatable: false,
    terminator: false,
    chainType: 'river',
    minPassability: 0.64,
    category: 'natural',
    anchors: [
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 0, role: 'decoration' },
      { x: 0, y: 4, role: 'decoration' },
      { x: 4, y: 4, role: 'decoration' },
    ],
  },

  // --- Wall corner (wall bends from S to E) ---
  {
    name: 'wall_corner',
    cells: [
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, 'stone_wall', 'stone_wall', 'stone_wall'],
      [null, null, 'stone_wall', null, null],
      [null, null, 'stone_wall', null, null],
    ],
    edgeTags: { n: 'open', s: 'wall', e: 'wall', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.76,
    category: 'structural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],  // N corridor
      [{ x: 0, y: 4 }, { x: 0, y: 0 }],  // W corridor
    ],
  },

  // --- Wall end cap (terminates a wall) ---
  {
    name: 'wall_end',
    cells: [
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, 'stone_wall', 'stone_wall', 'stone_wall'],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'open' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.88,
    category: 'structural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],
    ],
  },

  // --- Guard tower (stone enclosure with door) ---
  {
    name: 'guard_tower',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'grass', 'grass', 'grass', 'stone_wall'],
      ['stone_wall', 'grass', 'grass', 'grass', 'stone_wall'],
      ['stone_wall', 'grass', 'grass', 'grass', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'wall', s: 'wall', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.36,
    category: 'structural',
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 2 }],  // Enter through door
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 1, role: 'item' },
    ],
  },

  // --- Rock cluster (dense rock formation) ---
  {
    name: 'rock_cluster',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'rock', 'rock', 'rock', 'grass'],
      ['grass', 'rock', 'rock', 'rock', 'grass'],
      ['grass', 'rock', 'rock', 'rock', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 0.64,
    category: 'natural',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 0, y: 4 }],
      [{ x: 4, y: 0 }, { x: 4, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
    ],
  },
];

// ─── Template Selection ──────────────────────────────────────

/** Biome-specific template weights. Higher = more likely to spawn. */
export const BIOME_TEMPLATE_WEIGHTS: Record<string, Record<string, number>> = {
  meadow: {
    meadow_base: 0.3,
    dirt_clearing: 0.12,
    dirt_path_ns: 0.08,
    dirt_path_ew: 0.08,
    river_straight_ns: 0.1,
    river_straight_ew: 0.1,
    river_bend_ne: 0.06,
    river_bend_nw: 0.06,
    river_end_pond: 0.06,
    river_t_junction: 0.03,
    river_crossroads: 0.01,
    bridge_ns: 0.04,
    bridge_ew: 0.04,
    fence_enclosure: 0.08,
    rocky_outcrop: 0.05,
    wall_gate: 0.02,
    wall_segment: 0.01,
    wall_corner: 0.01,
    wall_end: 0.01,
  },
  forest: {
    meadow_base: 0.15,
    dirt_clearing: 0.08,
    rocky_outcrop: 0.1,
    rock_cluster: 0.08,
    dirt_path_ns: 0.06,
    dirt_path_ew: 0.06,
    river_straight_ns: 0.1,
    river_straight_ew: 0.1,
    river_bend_ne: 0.08,
    river_bend_nw: 0.08,
    river_end_pond: 0.08,
    river_t_junction: 0.04,
    bridge_ns: 0.06,
    bridge_ew: 0.06,
    wall_segment: 0.03,
    wall_gate: 0.03,
    fence_enclosure: 0.04,
  },
  cave: {
    rock_cluster: 0.15,
    rocky_outcrop: 0.12,
    wall_segment: 0.15,
    wall_gate: 0.1,
    wall_corner: 0.08,
    wall_end: 0.05,
    guard_tower: 0.06,
    river_straight_ns: 0.06,
    river_straight_ew: 0.06,
    river_end_pond: 0.04,
    bridge_ns: 0.03,
    bridge_ew: 0.03,
    dirt_path_ns: 0.04,
    dirt_path_ew: 0.04,
  },
  castle: {
    wall_segment: 0.18,
    wall_gate: 0.14,
    wall_corner: 0.1,
    wall_end: 0.06,
    guard_tower: 0.1,
    fence_enclosure: 0.08,
    dirt_clearing: 0.06,
    dirt_path_ns: 0.05,
    dirt_path_ew: 0.05,
    rocky_outcrop: 0.04,
    river_straight_ns: 0.03,
    river_straight_ew: 0.03,
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

// ─── Pre-computed Rotation Cache ─────────────────────────────
// Built lazily on first access. Maps template name → RotatedTemplate[]

let _rotationCache: Map<string, RotatedTemplate[]> | null = null;

/** Get all rotation variants for all templates (lazy-built, cached) */
export function getAllRotations(): Map<string, RotatedTemplate[]> {
  if (_rotationCache) return _rotationCache;
  _rotationCache = new Map();
  for (const template of WORLD_UNIT_TEMPLATES) {
    _rotationCache.set(template.name, computeRotations(template));
  }
  return _rotationCache;
}

/** Get all rotation variants for a specific template */
export function getTemplateRotations(name: string): RotatedTemplate[] {
  const cache = getAllRotations();
  return cache.get(name) ?? [];
}

/**
 * Select a random rotation variant of a template.
 * Returns null if template not found.
 */
export function selectRotation(name: string, rng: () => number): RotatedTemplate | null {
  const rots = getTemplateRotations(name);
  if (rots.length === 0) return null;
  return rots[Math.floor(rng() * rots.length)];
}

/**
 * Get all template variants (all templates × all rotations) that match
 * the given edge constraint on a specific side.
 */
export function getCompatibleVariants(
  side: Cardinal,
  requiredTag: EdgeTag,
): RotatedTemplate[] {
  const all = getAllRotations();
  const results: RotatedTemplate[] = [];
  for (const rots of all.values()) {
    for (const rot of rots) {
      if (edgesCompatible(rot.edgeTags[side], requiredTag)) {
        results.push(rot);
      }
    }
  }
  return results;
}
