/**
 * config/tiles.config.ts - Micro tile metadata and world unit templates.
 * Defines tile types with per-side edge vectors, traversal classes,
 * surface types, and structured 5x5 "world unit" patterns.
 *
 * Design doc: Docs/WorldEngine-01-SpatialHierarchy.md (Section 2)
 * GitHub: #22 — Enhanced Micro Tile Metadata & Per-Side Edge Vectors
 */

import type { TileType } from '../rendering/tiles';

// ─── Edge & Traversal Types ─────────────────────────────────

export type EdgeTag = 'open' | 'wall' | 'water' | 'fence' | 'path' | 'shore' | 'gate' | 'wall-cap' | 'fence-post';

/** Cardinal direction type used for edge queries */
export type Cardinal = 'n' | 's' | 'e' | 'w';

/** Per-side edge vector — each face declares what it connects to */
export interface EdgeVector {
  n: EdgeTag;
  s: EdgeTag;
  e: EdgeTag;
  w: EdgeTag;
}

/** Per-side traversal channel: does a walkable path exist across this edge? (#42) */
export type TraversalChannels = { n: boolean; s: boolean; e: boolean; w: boolean };

/** Corner cell types at the 4 corners of a 5×5 grid (#42) */
export type CornerCells = { nw: string; ne: string; sw: string; se: string };

/** Chain entry/exit port declarations for chain integrity (#42) */
export interface ChainPorts { entries: Cardinal[]; exits: Cardinal[] }

/** Traversal class: how the player can move through this tile */
export type TraversalType = 'open' | 'blocked' | 'conditional' | 'hazardous';

/** Surface type for auto-tiling border blending */
export type SurfaceType = 'grass' | 'dirt' | 'stone' | 'water' | 'wood' | 'sand';

// ─── Climate & LOD (#101) ────────────────────────────────────

/** Normalized moisture/temperature bands for biome affinity */
export interface ClimateBand {
  /** Moisture range [min, max], normalized 0-1. 0 = arid, 1 = saturated */
  moisture: [number, number];
  /** Temperature range [min, max], normalized 0-1. 0 = frozen, 1 = scorching */
  temperature: [number, number];
}

/** LOD level for rendering detail decisions */
export type LODLevel = 'detail' | 'standard' | 'simplified' | 'minimal';

/** Default climate: any biome can use this tile */
export const DEFAULT_CLIMATE: ClimateBand = { moisture: [0, 1], temperature: [0, 1] };

// ─── Biome Palette Mapping (#101) ────────────────────────────

/** Color palette for biome-specific tile rendering */
export interface BiomePalette {
  primary: string;    // main fill hex
  secondary: string;  // accent/shadow hex
  accent: string;     // highlight hex
}

/** Biome → SurfaceType → palette override.
 *  When a tile is rendered in a biome, look up its surface type here. */
export const BIOME_PALETTES: Record<string, Partial<Record<SurfaceType, BiomePalette>>> = {
  meadow: {
    grass: { primary: '#55AA44', secondary: '#448833', accent: '#88CC66' },
    dirt:  { primary: '#B08040', secondary: '#8A6030', accent: '#D0A060' },
  },
  forest: {
    grass: { primary: '#2D6B1E', secondary: '#1F4F14', accent: '#3D8B2E' },
    dirt:  { primary: '#6B4226', secondary: '#4A2E1A', accent: '#8B5A36' },
  },
  desert: {
    sand:  { primary: '#E8C868', secondary: '#C8A848', accent: '#F8D888' },
    stone: { primary: '#C8B080', secondary: '#A89060', accent: '#D8C090' },
    dirt:  { primary: '#D4A050', secondary: '#B48830', accent: '#E4B060' },
  },
  tundra: {
    grass: { primary: '#9BAAAB', secondary: '#7B8A8B', accent: '#BBCCCD' },
    stone: { primary: '#8899AA', secondary: '#6879AA', accent: '#AAB9CC' },
    water: { primary: '#5588AA', secondary: '#3366AA', accent: '#88BBDD' },
  },
  swamp: {
    grass: { primary: '#4A6B3A', secondary: '#3A5B2A', accent: '#5A7B4A' },
    water: { primary: '#3D5A3A', secondary: '#2D4A2A', accent: '#4D6A4A' },
    dirt:  { primary: '#5A4A30', secondary: '#4A3A20', accent: '#6A5A40' },
  },
};

/** Look up a biome-specific palette for a surface type.
 *  Returns undefined if no override exists (use default rendering). */
export function getBiomePalette(biome: string, surface: SurfaceType): BiomePalette | undefined {
  return BIOME_PALETTES[biome]?.[surface];
}

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
  /** Climate band describing moisture/temperature affinity (#101) */
  climate?: ClimateBand;
  /** LOD level for render detail decisions (#101) */
  lod?: LODLevel;
}

export const MICRO_TILE_DEFS: Record<TileType, MicroTileDef> = {
  grass: {
    type: 'grass', walkable: true, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'open', surface: 'grass', height: 0,
    connectable: false, decorationEligible: true,
    variationFamily: 'grass', variationIndex: 0,
    description: 'Grass ground',
    climate: { moisture: [0.3, 0.9], temperature: [0.2, 0.8] },
    lod: 'standard',
  },
  dirt: {
    type: 'dirt', walkable: true, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'open', surface: 'dirt', height: 0,
    connectable: false, decorationEligible: true,
    variationFamily: 'dirt', variationIndex: 0,
    description: 'Dirt path',
    climate: { moisture: [0.1, 0.7], temperature: [0.1, 0.9] },
    lod: 'standard',
  },
  rock: {
    type: 'rock', walkable: false, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'blocked', surface: 'stone', height: 2,
    connectable: false, decorationEligible: false,
    variationFamily: 'rock', variationIndex: 0,
    description: 'Boulder obstacle',
    climate: { moisture: [0, 1], temperature: [0, 1] },
    lod: 'detail',
  },
  water: {
    type: 'water', walkable: false, edgeTag: 'water',
    edges: { n: 'water', s: 'water', e: 'water', w: 'water' },
    traversal: 'hazardous', surface: 'water', height: 0,
    connectable: true, decorationEligible: false,
    variationFamily: 'water', variationIndex: 0,
    description: 'Water (impassable)',
    climate: { moisture: [0.6, 1.0], temperature: [0.1, 0.9] },
    lod: 'standard',
  },
  sand: {
    type: 'sand', walkable: true, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'open', surface: 'sand', height: 0,
    connectable: false, decorationEligible: true,
    variationFamily: 'sand', variationIndex: 0,
    description: 'Sandy terrain',
    climate: { moisture: [0, 0.3], temperature: [0.5, 1.0] },
    lod: 'standard',
  },
  stone_wall: {
    type: 'stone_wall', walkable: false, edgeTag: 'wall',
    edges: { n: 'wall', s: 'wall', e: 'wall', w: 'wall' },
    traversal: 'blocked', surface: 'stone', height: 4,
    connectable: true, decorationEligible: false,
    variationFamily: 'wall', variationIndex: 0,
    description: 'Stone wall segment',
    climate: { moisture: [0, 1], temperature: [0, 1] },
    lod: 'detail',
  },
  bridge: {
    type: 'bridge', walkable: true, edgeTag: 'water',
    edges: { n: 'open', s: 'open', e: 'water', w: 'water' },
    traversal: 'open', surface: 'wood', height: 1,
    connectable: false, decorationEligible: false,
    variationFamily: 'bridge', variationIndex: 0,
    description: 'Bridge over water',
    climate: { moisture: [0.5, 1.0], temperature: [0.1, 0.9] },
    lod: 'detail',
  },
  door_gate: {
    type: 'door_gate', walkable: false, edgeTag: 'wall',
    edges: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    traversal: 'conditional', surface: 'wood', height: 4,
    connectable: false, decorationEligible: false,
    variationFamily: 'gate', variationIndex: 0,
    description: 'Locked gate in wall (needs key)',
    climate: { moisture: [0, 1], temperature: [0, 1] },
    lod: 'detail',
  },
  wooden_fence: {
    type: 'wooden_fence', walkable: false, edgeTag: 'fence',
    edges: { n: 'fence', s: 'fence', e: 'fence', w: 'fence' },
    traversal: 'blocked', surface: 'wood', height: 2,
    connectable: true, decorationEligible: false,
    variationFamily: 'fence', variationIndex: 0,
    description: 'Wooden fence segment',
    climate: { moisture: [0, 1], temperature: [0.1, 0.9] },
    lod: 'standard',
  },
  quiz_gate: {
    type: 'quiz_gate', walkable: false, edgeTag: 'gate',
    edges: { n: 'gate', s: 'gate', e: 'wall', w: 'wall' },
    traversal: 'conditional', surface: 'stone', height: 3,
    connectable: true, decorationEligible: false,
    variationFamily: 'gate', variationIndex: 1,
    description: 'Quiz gate — answer a question to pass',
    climate: { moisture: [0, 1], temperature: [0, 1] },
    lod: 'detail',
  },
  troll_bridge: {
    type: 'troll_bridge', walkable: false, edgeTag: 'gate',
    edges: { n: 'open', s: 'open', e: 'water', w: 'water' },
    traversal: 'conditional', surface: 'wood', height: 2,
    connectable: false, decorationEligible: false,
    variationFamily: 'bridge', variationIndex: 1,
    description: 'Quiz-gated troll bridge',
    climate: { moisture: [0.5, 1.0], temperature: [0.1, 0.9] },
    lod: 'detail',
  },
  homestead_wall: {
    type: 'homestead_wall', walkable: false, edgeTag: 'wall',
    edges: { n: 'wall', s: 'wall', e: 'wall', w: 'wall' },
    traversal: 'blocked', surface: 'wood', height: 6,
    connectable: true, decorationEligible: false,
    variationFamily: 'homestead', variationIndex: 0,
    description: 'Timber-frame homestead wall module',
    climate: { moisture: [0, 1], temperature: [0.1, 0.9] },
    lod: 'detail',
  },
  cathedral_wall: {
    type: 'cathedral_wall', walkable: false, edgeTag: 'wall',
    edges: { n: 'wall', s: 'wall', e: 'wall', w: 'wall' },
    traversal: 'blocked', surface: 'stone', height: 8,
    connectable: true, decorationEligible: false,
    variationFamily: 'cathedral', variationIndex: 0,
    description: 'Dark ruined cathedral wall module',
    climate: { moisture: [0, 1], temperature: [0, 1] },
    lod: 'detail',
  },
  stone_floor: {
    type: 'stone_floor', walkable: true, edgeTag: 'open',
    edges: { n: 'open', s: 'open', e: 'open', w: 'open' },
    traversal: 'open', surface: 'stone', height: 0,
    connectable: false, decorationEligible: true,
    variationFamily: 'stone_floor', variationIndex: 0,
    description: 'Stone flagstone floor',
    climate: { moisture: [0, 1], temperature: [0, 1] },
    lod: 'standard',
  },
};

// ─── Edge Compatibility ──────────────────────────────────────
// Which EdgeTag pairs can sit adjacent? Symmetric table.
// Design doc: Docs/WorldEngine-02-EdgeContracts.md

const EDGE_COMPAT: Record<EdgeTag, Set<EdgeTag>> = {
  open:  new Set<EdgeTag>(['open', 'fence', 'path', 'shore', 'gate', 'wall-cap', 'fence-post']),
  wall:  new Set<EdgeTag>(['wall', 'open', 'gate', 'wall-cap']),
  water: new Set<EdgeTag>(['water', 'shore']),
  fence: new Set<EdgeTag>(['fence', 'open', 'fence-post']),
  path:  new Set<EdgeTag>(['path', 'open', 'gate']),
  shore: new Set<EdgeTag>(['shore', 'water', 'open']),
  gate:  new Set<EdgeTag>(['gate', 'wall', 'open', 'path']),
  'wall-cap':   new Set<EdgeTag>(['wall-cap', 'open', 'wall', 'gate']),
  'fence-post': new Set<EdgeTag>(['fence-post', 'open', 'fence']),
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

/** Connectivity class: how this template participates in feature chains */
export type ConnectivityClass =
  | 'standalone'    // No chain connections (meadow, clearing, rocky outcrop)
  | 'river-chain'   // Connects via water edges (river straight, bend, T-junction)
  | 'wall-chain'    // Connects via wall edges (wall segment, corner, gate)
  | 'fence-chain'   // Connects via fence edges (fence enclosure)
  | 'path-chain'    // Connects via path edges (dirt path, crossroads)
  | 'terminal'      // Ends a chain (pond, wall end, path dead-end)
  | 'enclosure'     // Self-contained structure (guard tower, fence enclosure)
  | 'crossing'      // Bridges between chain types (bridge over river)
  ;

/** Typed anchor roles for feature/NPC/item placement (#101 expanded) */
export type AnchorRole =
  | 'npc'         // NPC spawn point
  | 'item'        // Collectible item
  | 'decoration'  // Visual-only decoration
  | 'feature'     // Gameplay feature (quiz gate, chest, etc.)
  | 'quest'       // Quest objective marker
  | 'merchant'    // Trading NPC position
  | 'waypoint'    // Navigation waypoint / fast-travel
  | 'spawn'       // Player/entity spawn point
  | 'landmark'    // Named location marker
  | 'puzzle'      // Puzzle element anchor
  ;

/** Anchor point within a template for feature/NPC/item placement */
export interface AnchorPoint {
  x: number;        // Column (0-4) within the 5×5 grid
  y: number;        // Row (0-4) within the 5×5 grid
  role: AnchorRole;
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
  chainType?: 'river' | 'wall' | 'fence' | 'path';
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
  /** Connectivity class for chain management */
  connectivity?: ConnectivityClass;
  /** LOD level for this template (#101) */
  lod?: LODLevel;
  /** Template-level climate preference (#101) */
  climate?: ClimateBand;
  /** Per-side walkable traversal indicators (auto-computed from cells if omitted) (#42) */
  traversalChannels?: TraversalChannels;
  /** Chain port declarations (auto-computed from edgeTags + chainType if omitted) (#42) */
  chainPorts?: ChainPorts;
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
  /** Per-side walkable traversal channels (#42) */
  traversalChannels: TraversalChannels;
  /** Corner cell types at the 4 corners (#42) */
  cornerCells: CornerCells;
  /** Chain entry/exit port declarations (#42) */
  chainPorts: ChainPorts;
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

/** Rotate traversal channels 90° CW (#42) */
function rotateTraversalChannels90(tc: TraversalChannels): TraversalChannels {
  return { n: tc.w, e: tc.n, s: tc.e, w: tc.s };
}

/** Rotate corner cells 90° CW (#42): NW←SW, NE←NW, SE←NE, SW←SE */
function rotateCornerCells90(cc: CornerCells): CornerCells {
  return { nw: cc.sw, ne: cc.nw, se: cc.ne, sw: cc.se };
}

/** Rotate chain ports 90° CW (#42) */
function rotateChainPorts90(cp: ChainPorts): ChainPorts {
  const rot = (d: Cardinal): Cardinal => {
    switch (d) { case 'n': return 'e'; case 'e': return 's'; case 's': return 'w'; case 'w': return 'n'; }
  };
  return { entries: cp.entries.map(rot), exits: cp.exits.map(rot) };
}

/** Compute traversal channels from a 5×5 cell grid (#42).
 *  A side has a traversal channel if any border cell is walkable. */
export function computeTraversalChannels(cells: (string | null)[][]): TraversalChannels {
  const isWalkable = (cell: string | null): boolean => {
    if (cell === null) return true; // null = inherit terrain, assume walkable
    return MICRO_TILE_DEFS[cell as TileType]?.walkable ?? false;
  };
  return {
    n: cells[0].some(c => isWalkable(c)),
    s: cells[4].some(c => isWalkable(c)),
    w: cells.some(row => isWalkable(row[0])),
    e: cells.some(row => isWalkable(row[4])),
  };
}

/** Extract corner cell types from a 5×5 grid (#42). Defaults to 'grass' for null. */
export function computeCornerCells(cells: (string | null)[][]): CornerCells {
  return {
    nw: cells[0][0] ?? 'grass',
    ne: cells[0][4] ?? 'grass',
    sw: cells[4][0] ?? 'grass',
    se: cells[4][4] ?? 'grass',
  };
}

/** Compute chain entry/exit ports from edge tags and chain type (#42). */
export function computeChainPorts(
  edges: EdgeVector,
  chainType?: string,
  terminator = false,
): ChainPorts {
  if (!chainType) return { entries: [], exits: [] };
  const dirs: Cardinal[] = ['n', 's', 'e', 'w'];
  const chainDirs = dirs.filter(d => edges[d] !== 'open');
  if (terminator) {
    return { entries: chainDirs, exits: [] };
  }
  return { entries: chainDirs, exits: chainDirs };
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
  // Auto-compute new edge-contract fields (#42)
  let tc = template.traversalChannels ?? computeTraversalChannels(template.cells);
  let cc = computeCornerCells(template.cells);
  let cp = template.chainPorts ?? computeChainPorts(template.edgeTags, template.chainType, template.terminator);

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
        traversalChannels: { ...tc },
        cornerCells: { ...cc },
        chainPorts: { entries: [...cp.entries], exits: [...cp.exits] },
      });
    }
    // Rotate for next iteration
    cells = rotateGrid90(cells);
    edges = rotateEdges90(edges);
    tc = rotateTraversalChannels90(tc);
    cc = rotateCornerCells90(cc);
    cp = rotateChainPorts90(cp);
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
    connectivity: 'standalone',
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
    connectivity: 'river-chain',
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
    connectivity: 'river-chain',
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
    connectivity: 'river-chain',
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
    connectivity: 'river-chain',
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
    connectivity: 'terminal',
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
    connectivity: 'wall-chain',
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
    edgeTags: { n: 'gate', s: 'gate', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.8,
    category: 'structural',
    connectivity: 'wall-chain',
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
    connectivity: 'crossing',
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
    connectivity: 'crossing',
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
    connectivity: 'enclosure',
    movementChannels: [
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
    connectivity: 'standalone',
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
    connectivity: 'standalone',
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
    edgeTags: { n: 'path', s: 'path', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'path',
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'path-chain',
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
    edgeTags: { n: 'open', s: 'open', e: 'path', w: 'path' },
    rotatable: true,
    terminator: false,
    chainType: 'path',
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'path-chain',
    movementChannels: [
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
  },

  // --- Path bend NE (dirt bends from N to E) ---
  {
    name: 'path_bend_ne',
    cells: [
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'dirt', 'dirt'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'path', s: 'open', e: 'path', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'path',
    minPassability: 0.88,
    category: 'natural',
    connectivity: 'path-chain',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 4, role: 'decoration' },
    ],
  },

  // --- Path T-junction (dirt from N, S, and E) ---
  {
    name: 'path_t_junction',
    cells: [
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'dirt', 'dirt'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
    ],
    edgeTags: { n: 'path', s: 'path', e: 'path', w: 'open' },
    rotatable: true,
    terminator: false,
    chainType: 'path',
    minPassability: 0.84,
    category: 'natural',
    connectivity: 'path-chain',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 2, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 0, y: 2, role: 'decoration' },
    ],
  },

  // --- Path crossroads (4-way dirt intersection) ---
  {
    name: 'path_crossroads',
    cells: [
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['dirt', 'dirt', 'dirt', 'dirt', 'dirt'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
    ],
    edgeTags: { n: 'path', s: 'path', e: 'path', w: 'path' },
    rotatable: false,
    terminator: false,
    chainType: 'path',
    minPassability: 0.84,
    category: 'natural',
    connectivity: 'path-chain',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 0, role: 'decoration' },
      { x: 0, y: 4, role: 'decoration' },
      { x: 4, y: 4, role: 'decoration' },
      { x: 2, y: 2, role: 'item' },
    ],
  },

  // --- Path dead-end (terminates a path with a small clearing) ---
  {
    name: 'path_dead_end',
    cells: [
      ['grass', 'grass', 'dirt', 'grass', 'grass'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'path', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: true,
    chainType: 'path',
    minPassability: 0.84,
    category: 'natural',
    connectivity: 'terminal',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'item' },
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 1, role: 'decoration' },
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
    connectivity: 'river-chain',
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
    connectivity: 'river-chain',
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
    connectivity: 'wall-chain',
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
    connectivity: 'terminal',
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
    connectivity: 'enclosure',
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
    connectivity: 'standalone',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 0, y: 4 }],
      [{ x: 4, y: 0 }, { x: 4, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
    ],
  },

  // ─────────── Shore / Transition Templates ───────────────────

  // --- Shore N (water at top, grass at bottom — transition piece) ---
  {
    name: 'shore_n',
    cells: [
      ['water', 'water', 'water', 'water', 'water'],
      ['water', 'water', 'water', 'water', 'water'],
      ['sand', 'sand', 'sand', 'sand', 'sand'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'water', s: 'open', e: 'shore', w: 'shore' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.6,
    category: 'transitional',
    connectivity: 'river-chain',
    movementChannels: [
      [{ x: 0, y: 3 }, { x: 4, y: 3 }],  // walk along beach
    ],
    anchors: [
      { x: 2, y: 3, role: 'decoration' },
    ],
  },

  // --- Shore corner NE (water top-right, land bottom-left) ---
  {
    name: 'shore_corner_ne',
    cells: [
      ['water', 'water', 'water', 'water', 'water'],
      ['water', 'water', 'water', 'water', 'water'],
      ['sand', 'sand', 'sand', 'water', 'water'],
      ['grass', 'grass', 'sand', 'sand', 'water'],
      ['grass', 'grass', 'grass', 'sand', 'water'],
    ],
    edgeTags: { n: 'water', s: 'shore', e: 'water', w: 'shore' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.36,
    category: 'transitional',
    connectivity: 'river-chain',
    movementChannels: [
      [{ x: 0, y: 3 }, { x: 2, y: 4 }],
    ],
  },

  // ─────────── Biome-Specific Templates ───────────────────────

  // --- Forest clearing (trees surrounding a dirt patch) ---
  {
    name: 'forest_clearing',
    cells: [
      [null, null, null, null, null],
      [null, 'dirt', 'dirt', 'dirt', null],
      [null, 'dirt', 'dirt', 'dirt', null],
      [null, 'dirt', 'dirt', 'dirt', null],
      [null, null, null, null, null],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['forest', 'meadow'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Cave tunnel N-S (rock walls with center passage) ---
  {
    name: 'cave_tunnel_ns',
    cells: [
      ['rock', 'rock', 'dirt', 'rock', 'rock'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['rock', 'rock', 'dirt', 'rock', 'rock'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.48,
    category: 'structural',
    connectivity: 'wall-chain',
    biomeAffinity: ['cave'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'item' },
    ],
  },

  // --- Cave chamber (larger rock-walled room) ---
  {
    name: 'cave_chamber',
    cells: [
      ['rock', 'rock', 'dirt', 'rock', 'rock'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['dirt', 'dirt', 'dirt', 'dirt', 'dirt'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['rock', 'rock', 'dirt', 'rock', 'rock'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 0.52,
    category: 'structural',
    connectivity: 'standalone',
    biomeAffinity: ['cave'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'feature' },
    ],
  },

  // --- Castle courtyard (walled on 3 sides, open south) ---
  {
    name: 'castle_courtyard',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'wall', s: 'wall', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'enclosure',
    biomeAffinity: ['castle'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 1, role: 'feature' },
      { x: 1, y: 3, role: 'decoration' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Castle corridor (wall-lined hallway) ---
  {
    name: 'castle_corridor',
    cells: [
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.6,
    category: 'structural',
    connectivity: 'wall-chain',
    biomeAffinity: ['castle', 'cave'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
    ],
  },

  // --- Sandy patch (sand terrain zone - used for beaches/desert) ---
  {
    name: 'sandy_patch',
    cells: [
      ['grass', 'grass', 'sand', 'grass', 'grass'],
      ['grass', 'sand', 'sand', 'sand', 'grass'],
      ['sand', 'sand', 'sand', 'sand', 'sand'],
      ['grass', 'sand', 'sand', 'sand', 'grass'],
      ['grass', 'grass', 'sand', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'item' },
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Mixed terrain (grass/dirt natural variation) ---
  {
    name: 'mixed_terrain',
    cells: [
      ['grass', 'dirt', 'grass', 'dirt', 'grass'],
      ['dirt', 'grass', 'dirt', 'grass', 'dirt'],
      ['grass', 'dirt', 'grass', 'dirt', 'grass'],
      ['dirt', 'grass', 'dirt', 'grass', 'dirt'],
      ['grass', 'dirt', 'grass', 'dirt', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'decoration' },
    ],
  },

  // --- Meadow Garden (flower rows with item in center) ---
  {
    name: 'meadow_garden',
    cells: [
      ['grass', 'dirt', 'grass', 'dirt', 'grass'],
      ['dirt', 'grass', 'dirt', 'grass', 'dirt'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['dirt', 'grass', 'dirt', 'grass', 'dirt'],
      ['grass', 'dirt', 'grass', 'dirt', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 1, role: 'decoration' },
      { x: 1, y: 3, role: 'decoration' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Small Lake (water center, shore edges at 4 sides) ---
  {
    name: 'lake',
    cells: [
      ['grass', 'sand', 'sand', 'sand', 'grass'],
      ['sand', 'water', 'water', 'water', 'sand'],
      ['sand', 'water', 'water', 'water', 'sand'],
      ['sand', 'water', 'water', 'water', 'sand'],
      ['grass', 'sand', 'sand', 'sand', 'grass'],
    ],
    edgeTags: { n: 'shore', s: 'shore', e: 'shore', w: 'shore' },
    rotatable: false,
    terminator: true,
    minPassability: 0.48,
    category: 'natural',
    connectivity: 'standalone',
    anchors: [
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 0, role: 'decoration' },
      { x: 0, y: 4, role: 'item' },
      { x: 4, y: 4, role: 'decoration' },
    ],
  },

  // --- Forest Dense (heavily treed, limited passage) ---
  {
    name: 'forest_dense',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'dirt',  'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 0.6,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['forest'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 0, role: 'decoration' },
      { x: 0, y: 4, role: 'decoration' },
      { x: 4, y: 4, role: 'decoration' },
      { x: 2, y: 2, role: 'item' },
      { x: 1, y: 2, role: 'npc' },
    ],
  },

  // --- Cave Dead End (rocks surround a feature spot) ---
  {
    name: 'cave_dead_end',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'dirt', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'wall', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'enclosure',
    biomeAffinity: ['cave'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 1 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Castle Hall (grand hall with wall sides, open N-S) ---
  {
    name: 'castle_hall',
    cells: [
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.6,
    category: 'structural',
    connectivity: 'wall-chain',
    biomeAffinity: ['castle', 'cave'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Ruins (partially destroyed wall, atmospheric) ---
  {
    name: 'ruins',
    cells: [
      ['stone_wall', 'dirt', 'dirt', 'grass', 'grass'],
      ['stone_wall', 'stone_floor', 'dirt', 'grass', 'grass'],
      ['dirt', 'stone_floor', 'stone_floor', 'dirt', 'grass'],
      ['grass', 'dirt', 'stone_floor', 'stone_wall', 'stone_wall'],
      ['grass', 'grass', 'dirt', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'wall', w: 'open' },
    rotatable: true,
    terminator: false,
    minPassability: 0.68,
    category: 'structural',
    connectivity: 'standalone',
    biomeAffinity: ['castle', 'cave', 'forest'],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Gatehouse: walled enclosure with single gate entrance ---
  {
    name: 'gatehouse',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'wall', s: 'gate', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'standalone',
    biomeAffinity: ['castle', 'cave'],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 2, role: 'feature' },
      { x: 3, y: 2, role: 'item' },
    ],
  },

  // --- Fortified passage: walled corridor with gate openings at both ends ---
  {
    name: 'fortified_passage',
    cells: [
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'dirt', 'dirt', 'dirt', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'gate', s: 'gate', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'wall-chain',
    biomeAffinity: ['castle', 'cave'],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'item' },
      { x: 3, y: 3, role: 'item' },
    ],
  },

  // --- Fenced yard with gate: pastoral enclosure ---
  {
    name: 'fenced_yard',
    cells: [
      ['wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'wooden_fence', 'door_gate', 'wooden_fence', 'wooden_fence'],
    ],
    edgeTags: { n: 'fence', s: 'gate', e: 'fence', w: 'fence' },
    rotatable: true,
    terminator: true,
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow', 'forest'],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 3, role: 'item' },
    ],
  },

  // ─────────── New Templates (#44: World Unit Library Expansion) ───────────

  // --- Treasure Alcove (small stone room with loot anchors) ---
  {
    name: 'treasure_alcove',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'dirt', 'stone_wall', 'stone_wall'],
      [null, null, null, null, null],
    ],
    edgeTags: { n: 'wall', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.24,
    category: 'structural',
    connectivity: 'terminal',
    biomeAffinity: ['cave', 'castle'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 3 }, { x: 2, y: 1 }],
    ],
    anchors: [
      { x: 1, y: 1, role: 'item' },
      { x: 2, y: 1, role: 'feature' },
      { x: 3, y: 1, role: 'item' },
      { x: 2, y: 2, role: 'decoration' },
    ],
  },

  // --- Market Square (open stone plaza with NPC spots) ---
  {
    name: 'market_square',
    cells: [
      ['dirt', 'dirt', 'stone_floor', 'dirt', 'dirt'],
      ['dirt', 'stone_floor', 'stone_floor', 'stone_floor', 'dirt'],
      ['stone_floor', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_floor'],
      ['dirt', 'stone_floor', 'stone_floor', 'stone_floor', 'dirt'],
      ['dirt', 'dirt', 'stone_floor', 'dirt', 'dirt'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow', 'castle'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 1, y: 1, role: 'npc' },
      { x: 3, y: 1, role: 'npc' },
      { x: 2, y: 2, role: 'feature' },
      { x: 1, y: 3, role: 'decoration' },
      { x: 3, y: 3, role: 'decoration' },
    ],
  },

  // --- Spiral Path (winding trail for exploration) ---
  {
    name: 'spiral_path',
    cells: [
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
      ['grass', 'grass', 'grass', 'dirt', 'grass'],
      ['grass', 'dirt', 'grass', 'dirt', 'grass'],
      ['grass', 'dirt', 'grass', 'grass', 'grass'],
      ['grass', 'dirt', 'dirt', 'dirt', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 4 }, { x: 3, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'item' },
      { x: 1, y: 2, role: 'decoration' },
    ],
  },

  // --- River Island (grass island surrounded by water) ---
  {
    name: 'river_island',
    cells: [
      ['water', 'water', 'water', 'water', 'water'],
      ['water', 'sand', 'grass', 'sand', 'water'],
      ['water', 'grass', 'grass', 'grass', 'water'],
      ['water', 'sand', 'grass', 'sand', 'water'],
      ['water', 'water', 'water', 'water', 'water'],
    ],
    edgeTags: { n: 'water', s: 'water', e: 'water', w: 'water' },
    rotatable: false,
    terminator: true,
    chainType: 'river',
    minPassability: 0.28,
    category: 'natural',
    connectivity: 'terminal',
    anchors: [
      { x: 2, y: 2, role: 'feature' },
      { x: 1, y: 2, role: 'item' },
      { x: 3, y: 2, role: 'decoration' },
    ],
  },

  // --- Wall T-junction (wall branching into T-shape) ---
  {
    name: 'wall_t_junction',
    cells: [
      [null, null, 'stone_wall', null, null],
      [null, null, 'stone_wall', null, null],
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      [null, null, null, null, null],
      [null, null, null, null, null],
    ],
    edgeTags: { n: 'wall', s: 'open', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.72,
    category: 'structural',
    connectivity: 'wall-chain',
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 0, y: 4 }],  // W corridor
      [{ x: 4, y: 0 }, { x: 4, y: 4 }],  // E corridor
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],  // S corridor
    ],
  },

  // --- Stone Plaza (formal stone tile area) ---
  {
    name: 'stone_plaza',
    cells: [
      ['stone_floor', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_floor'],
      ['stone_floor', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_floor'],
      ['stone_floor', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_floor'],
      ['stone_floor', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_floor'],
      ['stone_floor', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_floor'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['castle', 'cave'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 0, role: 'decoration' },
      { x: 0, y: 4, role: 'decoration' },
      { x: 4, y: 4, role: 'decoration' },
    ],
  },

  // --- Water Garden (pond with landscape) ---
  {
    name: 'water_garden',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'sand', 'sand', 'sand', 'grass'],
      ['grass', 'sand', 'water', 'sand', 'grass'],
      ['grass', 'sand', 'sand', 'sand', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 0.96,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 0, y: 4 }],
      [{ x: 4, y: 0 }, { x: 4, y: 4 }],
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],
    ],
    anchors: [
      { x: 0, y: 0, role: 'decoration' },
      { x: 4, y: 0, role: 'decoration' },
      { x: 0, y: 4, role: 'decoration' },
      { x: 4, y: 4, role: 'decoration' },
    ],
  },

  // --- Cave Fork (tunnel that branches) ---
  {
    name: 'cave_fork',
    cells: [
      ['rock', 'rock', 'dirt', 'rock', 'rock'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['rock', 'dirt', 'dirt', 'dirt', 'dirt'],
      ['rock', 'dirt', 'dirt', 'dirt', 'rock'],
      ['rock', 'rock', 'dirt', 'rock', 'rock'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'wall' },
    rotatable: true,
    terminator: false,
    chainType: 'wall',
    minPassability: 0.48,
    category: 'structural',
    connectivity: 'wall-chain',
    biomeAffinity: ['cave'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
      [{ x: 2, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'item' },
    ],
  },

  // --- Castle Throne Room (grand stone room with throne spot) ---
  {
    name: 'castle_throne',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_floor', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['stone_wall', 'stone_wall', 'door_gate', 'stone_wall', 'stone_wall'],
    ],
    edgeTags: { n: 'wall', s: 'gate', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'enclosure',
    biomeAffinity: ['castle'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 1 }],
    ],
    anchors: [
      { x: 2, y: 1, role: 'npc' },
      { x: 1, y: 2, role: 'decoration' },
      { x: 3, y: 2, role: 'decoration' },
      { x: 2, y: 3, role: 'item' },
    ],
  },

  // ─────────── Wall Termination Templates (wall-cap edges) ────

  // --- Wall Bastion (wall terminates with room, opens south) ---
  {
    name: 'wall_bastion',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'stone_wall', 'stone_wall'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'stone_wall'],
      ['grass', 'stone_floor', 'stone_floor', 'stone_floor', 'grass'],
      ['grass', 'grass', 'stone_floor', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'wall', s: 'open', e: 'wall-cap', w: 'wall-cap' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.48,
    category: 'structural',
    connectivity: 'terminal',
    biomeAffinity: ['castle', 'cave'],
    movementChannels: [
      [{ x: 2, y: 2 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 1, role: 'decoration' },
    ],
  },

  // --- Wall Corner Capped (L-shaped wall with capped ends) ---
  {
    name: 'wall_corner_capped',
    cells: [
      ['stone_wall', 'stone_wall', 'stone_wall', 'grass', 'grass'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'grass', 'grass'],
      ['stone_wall', 'stone_floor', 'stone_floor', 'stone_floor', 'grass'],
      ['grass', 'grass', 'stone_floor', 'stone_floor', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'wall-cap', s: 'open', e: 'open', w: 'wall-cap' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.52,
    category: 'structural',
    connectivity: 'terminal',
    biomeAffinity: ['castle', 'cave', 'forest'],
    movementChannels: [
      [{ x: 2, y: 2 }, { x: 2, y: 4 }],
      [{ x: 2, y: 2 }, { x: 4, y: 2 }],
    ],
    anchors: [
      { x: 1, y: 1, role: 'decoration' },
      { x: 3, y: 3, role: 'item' },
    ],
  },

  // ─────────── Fence Templates (fence-post edges) ─────────────

  // --- Fenced Garden (enclosed by fences with post termination) ---
  {
    name: 'fenced_garden',
    cells: [
      ['grass', 'wooden_fence', 'wooden_fence', 'wooden_fence', 'grass'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['wooden_fence', 'grass', 'grass', 'grass', 'wooden_fence'],
      ['grass', 'wooden_fence', 'grass', 'wooden_fence', 'grass'],
    ],
    edgeTags: { n: 'fence-post', s: 'fence-post', e: 'fence-post', w: 'fence-post' },
    rotatable: false,
    terminator: true,
    chainType: 'fence',
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'enclosure',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 1 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'feature' },
      { x: 1, y: 2, role: 'decoration' },
      { x: 3, y: 2, role: 'decoration' },
    ],
  },

  // --- Fence Row (fence line with post terminators at ends) ---
  {
    name: 'fence_row',
    cells: [
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
      ['grass', 'grass', 'grass', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'fence-post', w: 'fence-post' },
    rotatable: true,
    terminator: true,
    chainType: 'fence',
    minPassability: 0.8,
    category: 'structural',
    connectivity: 'fence-chain',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 0, y: 0 }, { x: 4, y: 0 }],
      [{ x: 0, y: 4 }, { x: 4, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 0, role: 'decoration' },
      { x: 2, y: 4, role: 'decoration' },
    ],
  },

  // --- Beach Cove (sand + water + shore transition) ---
  {
    name: 'beach_cove',
    cells: [
      ['grass', 'grass', 'sand', 'sand', 'sand'],
      ['grass', 'sand', 'sand', 'sand', 'water'],
      ['sand', 'sand', 'sand', 'water', 'water'],
      ['sand', 'sand', 'water', 'water', 'water'],
      ['sand', 'water', 'water', 'water', 'water'],
    ],
    edgeTags: { n: 'shore', s: 'water', e: 'water', w: 'shore' },
    rotatable: true,
    terminator: false,
    chainType: 'river',
    minPassability: 0.4,
    category: 'transitional',
    connectivity: 'river-chain',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 0, y: 2 }, { x: 2, y: 0 }],
    ],
    anchors: [
      { x: 1, y: 1, role: 'decoration' },
      { x: 2, y: 1, role: 'item' },
    ],
  },

  // --- Sand Path (sandy trail through grass) ---
  {
    name: 'sand_path',
    cells: [
      ['grass', 'grass', 'sand', 'grass', 'grass'],
      ['grass', 'sand', 'sand', 'sand', 'grass'],
      ['grass', 'sand', 'sand', 'grass', 'grass'],
      ['grass', 'grass', 'sand', 'sand', 'grass'],
      ['grass', 'grass', 'sand', 'grass', 'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    minPassability: 1.0,
    category: 'natural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],
    ],
    anchors: [
      { x: 2, y: 2, role: 'decoration' },
    ],
  },

  // ─────────── Themed Structure Templates (#99) ───────────────

  // --- Homestead Compound (fenced farmyard with gate, inner yard) ---
  // Inspired by Stardew Valley farm layouts — a cozy enclosure with animals and farmer NPC
  {
    name: 'homestead_compound',
    cells: [
      ['wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence', 'wooden_fence'],
      ['wooden_fence', 'dirt',         'grass',        'dirt',         'wooden_fence'],
      ['wooden_fence', 'grass',        'dirt',         'grass',        'wooden_fence'],
      ['wooden_fence', 'dirt',         'grass',        'dirt',         'wooden_fence'],
      ['wooden_fence', 'wooden_fence', 'door_gate',    'wooden_fence', 'wooden_fence'],
    ],
    edgeTags: { n: 'fence', s: 'gate', e: 'fence', w: 'fence' },
    rotatable: true,
    terminator: true,
    chainType: 'fence',
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'enclosure',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 2 }],  // Enter through gate to center
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },        // Farmer or beekeeper
      { x: 1, y: 1, role: 'item' },        // Harvest pickup
      { x: 3, y: 1, role: 'decoration' },  // Crop / flower
      { x: 1, y: 3, role: 'decoration' },  // Hay bale / plant
      { x: 3, y: 3, role: 'item' },        // Coin / produce
    ],
  },

  // --- Seller Cart Yard (merchant stall at a crossroads clearing) ---
  // Inspired by Zelda merchant spots / RPG roadside vendors
  {
    name: 'seller_cart_yard',
    cells: [
      ['grass',        'grass',        'dirt',         'grass',        'grass'],
      ['grass',        'dirt',         'dirt',         'dirt',         'grass'],
      ['dirt',         'dirt',         'stone_floor',  'dirt',         'dirt'],
      ['grass',        'dirt',         'dirt',         'dirt',         'grass'],
      ['grass',        'grass',        'dirt',         'grass',        'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: false,
    terminator: false,
    minPassability: 1.0,
    category: 'structural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow', 'forest', 'castle'],
    movementChannels: [
      [{ x: 2, y: 0 }, { x: 2, y: 4 }],  // N-S through center
      [{ x: 0, y: 2 }, { x: 4, y: 2 }],  // E-W through center
    ],
    anchors: [
      { x: 2, y: 2, role: 'npc' },        // Merchant — always a merchant
      { x: 1, y: 1, role: 'item' },        // Wares on display left
      { x: 3, y: 1, role: 'item' },        // Wares on display right
      { x: 1, y: 3, role: 'decoration' },  // Cart decoration
      { x: 3, y: 3, role: 'decoration' },  // Barrel / crate
    ],
  },

  // --- Outhouse (small hygiene recovery structure) (#110 Phase 2) ---
  // Cozy clearing with outhouse — interact for hygiene quiz + cleanliness restore
  {
    name: 'outhouse_clearing',
    cells: [
      ['grass',        'grass',        'grass',        'grass',        'grass'],
      ['grass',        'dirt',         'outhouse',     'dirt',         'grass'],
      ['grass',        'dirt',         'dirt',         'dirt',         'grass'],
      ['grass',        'dirt',         'dirt',         'dirt',         'grass'],
      ['grass',        'grass',        'dirt',         'grass',        'grass'],
    ],
    edgeTags: { n: 'open', s: 'open', e: 'open', w: 'open' },
    rotatable: true,
    terminator: false,
    minPassability: 0.8,
    category: 'structural',
    connectivity: 'standalone',
    biomeAffinity: ['meadow', 'forest'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 2 }],  // Approach from south
    ],
    anchors: [
      { x: 1, y: 3, role: 'decoration' }, // Flower / bush
      { x: 3, y: 3, role: 'decoration' }, // Barrel / sign
    ],
  },

  // --- Inn Compound (walled social hub with multiple rooms) ---
  // Inspired by Elder Scrolls taverns / RPG inn layouts — larger footprint
  {
    name: 'inn_compound',
    cells: [
      ['stone_wall',   'stone_wall',   'stone_wall',   'stone_wall',   'stone_wall'],
      ['stone_wall',   'stone_floor',  'stone_floor',  'stone_floor',  'stone_wall'],
      ['stone_wall',   'stone_floor',  'stone_floor',  'stone_floor',  'stone_wall'],
      ['stone_wall',   'stone_floor',  'stone_floor',  'stone_floor',  'stone_wall'],
      ['stone_wall',   'stone_wall',   'door_gate',    'stone_wall',   'stone_wall'],
    ],
    edgeTags: { n: 'wall', s: 'gate', e: 'wall', w: 'wall' },
    rotatable: true,
    terminator: true,
    chainType: 'wall',
    minPassability: 0.36,
    category: 'structural',
    connectivity: 'enclosure',
    biomeAffinity: ['meadow', 'forest', 'castle'],
    movementChannels: [
      [{ x: 2, y: 4 }, { x: 2, y: 1 }],  // Enter through door
    ],
    anchors: [
      { x: 2, y: 1, role: 'npc' },        // Innkeeper
      { x: 1, y: 2, role: 'feature' },     // Fireplace / hearth
      { x: 3, y: 2, role: 'decoration' },  // Table
      { x: 1, y: 3, role: 'item' },        // Food / potion
      { x: 3, y: 3, role: 'decoration' },  // Bench
    ],
  },
];

// ─── Template Selection ──────────────────────────────────────

/** Biome-specific template weights. Higher = more likely to spawn. */
export const BIOME_TEMPLATE_WEIGHTS: Record<string, Record<string, number>> = {
  meadow: {
    meadow_base: 0.18,
    meadow_garden: 0.06,
    dirt_clearing: 0.08,
    mixed_terrain: 0.05,
    sandy_patch: 0.04,
    forest_clearing: 0.04,
    lake: 0.03,
    dirt_path_ns: 0.07,
    dirt_path_ew: 0.07,
    path_bend_ne: 0.03,
    path_t_junction: 0.02,
    path_crossroads: 0.01,
    path_dead_end: 0.02,
    river_straight_ns: 0.04,
    river_straight_ew: 0.04,
    river_bend_ne: 0.02,
    river_bend_nw: 0.02,
    river_end_pond: 0.03,
    river_t_junction: 0.01,
    river_crossroads: 0.005,
    shore_n: 0.02,
    shore_corner_ne: 0.01,
    bridge_ns: 0.02,
    bridge_ew: 0.02,
    fence_enclosure: 0.05,
    rocky_outcrop: 0.03,
    wall_gate: 0.01,
    wall_segment: 0.01,
    wall_corner: 0.005,
    wall_end: 0.005,
    fenced_yard: 0.03,
    market_square: 0.04,
    spiral_path: 0.03,
    water_garden: 0.03,
    wall_bastion: 0.02,
    wall_corner_capped: 0.02,
    fenced_garden: 0.03,
    fence_row: 0.03,
    beach_cove: 0.02,
    sand_path: 0.03,
    // #99 Themed Structures
    homestead_compound: 0.05,
    seller_cart_yard: 0.04,
    inn_compound: 0.03,
    // #110 Outhouse
    outhouse_clearing: 0.03,
  },
  forest: {
    meadow_base: 0.05,
    dirt_clearing: 0.05,
    forest_clearing: 0.09,
    forest_dense: 0.08,
    mixed_terrain: 0.05,
    rocky_outcrop: 0.06,
    rock_cluster: 0.05,
    lake: 0.03,
    ruins: 0.03,
    dirt_path_ns: 0.06,
    dirt_path_ew: 0.06,
    path_bend_ne: 0.04,
    path_t_junction: 0.03,
    path_crossroads: 0.02,
    path_dead_end: 0.04,
    river_straight_ns: 0.05,
    river_straight_ew: 0.05,
    river_bend_ne: 0.03,
    river_bend_nw: 0.03,
    river_end_pond: 0.04,
    river_t_junction: 0.02,
    shore_n: 0.02,
    shore_corner_ne: 0.01,
    bridge_ns: 0.03,
    bridge_ew: 0.03,
    wall_segment: 0.02,
    wall_gate: 0.02,
    fence_enclosure: 0.03,
    fenced_yard: 0.02,
    spiral_path: 0.03,
    water_garden: 0.03,
    river_island: 0.02,
    wall_bastion: 0.02,
    wall_corner_capped: 0.02,
    fenced_garden: 0.02,
    fence_row: 0.02,
    beach_cove: 0.02,
    // #99 Themed Structures
    homestead_compound: 0.04,
    seller_cart_yard: 0.03,
    inn_compound: 0.03,
    // #110 Outhouse
    outhouse_clearing: 0.02,
  },
  cave: {
    rock_cluster: 0.08,
    rocky_outcrop: 0.06,
    cave_tunnel_ns: 0.10,
    cave_chamber: 0.09,
    cave_dead_end: 0.06,
    castle_corridor: 0.05,
    castle_hall: 0.05,
    ruins: 0.03,
    wall_segment: 0.09,
    wall_gate: 0.06,
    wall_corner: 0.05,
    wall_end: 0.04,
    guard_tower: 0.05,
    river_straight_ns: 0.04,
    river_straight_ew: 0.04,
    river_end_pond: 0.03,
    bridge_ns: 0.02,
    bridge_ew: 0.02,
    dirt_path_ns: 0.03,
    dirt_path_ew: 0.03,
    path_bend_ne: 0.02,
    path_dead_end: 0.02,
    gatehouse: 0.05,
    fortified_passage: 0.04,
    treasure_alcove: 0.05,
    stone_plaza: 0.04,
    cave_fork: 0.05,
    wall_t_junction: 0.03,
    wall_bastion: 0.04,
    wall_corner_capped: 0.04,
  },
  castle: {
    wall_segment: 0.09,
    wall_gate: 0.07,
    wall_corner: 0.06,
    wall_end: 0.03,
    guard_tower: 0.06,
    castle_courtyard: 0.07,
    castle_corridor: 0.07,
    castle_hall: 0.07,
    ruins: 0.04,
    fence_enclosure: 0.04,
    dirt_clearing: 0.03,
    cave_chamber: 0.03,
    cave_dead_end: 0.03,
    dirt_path_ns: 0.05,
    dirt_path_ew: 0.05,
    path_bend_ne: 0.03,
    path_t_junction: 0.02,
    path_crossroads: 0.01,
    path_dead_end: 0.03,
    rocky_outcrop: 0.02,
    river_straight_ns: 0.02,
    river_straight_ew: 0.02,
    shore_n: 0.01,
    gatehouse: 0.06,
    fortified_passage: 0.05,
    treasure_alcove: 0.04,
    stone_plaza: 0.05,
    market_square: 0.03,
    castle_throne: 0.05,
    wall_t_junction: 0.03,
    wall_bastion: 0.05,
    wall_corner_capped: 0.04,
    fenced_garden: 0.02,
    // #99 Themed Structures
    seller_cart_yard: 0.03,
    inn_compound: 0.04,
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

// ─── Schema Validation & Helpers (#101) ──────────────────────

/** Valid anchor roles for runtime validation */
const VALID_ANCHOR_ROLES: ReadonlySet<AnchorRole> = new Set([
  'npc', 'item', 'decoration', 'feature',
  'quest', 'merchant', 'waypoint', 'spawn', 'landmark', 'puzzle',
]);

/** Validate a ClimateBand: both ranges must be [0,1] with min <= max */
export function isValidClimate(c: ClimateBand): boolean {
  const [mMin, mMax] = c.moisture;
  const [tMin, tMax] = c.temperature;
  return mMin >= 0 && mMax <= 1 && mMin <= mMax
      && tMin >= 0 && tMax <= 1 && tMin <= tMax;
}

/** Normalize a MicroTileDef, filling in missing climate/LOD defaults */
export function normalizeTileDef(def: MicroTileDef): MicroTileDef {
  return {
    ...def,
    climate: def.climate ?? { ...DEFAULT_CLIMATE },
    lod: def.lod ?? 'standard',
  };
}

/** Validate an anchor point role is in the known set */
export function isValidAnchorRole(role: string): role is AnchorRole {
  return VALID_ANCHOR_ROLES.has(role as AnchorRole);
}

/** Validate a WorldUnitTemplate's metadata integrity.
 *  Returns an array of error strings (empty = valid). */
export function validateTemplate(tmpl: WorldUnitTemplate): string[] {
  const errors: string[] = [];
  if (!tmpl.name) errors.push('Template missing name');
  if (!tmpl.cells || tmpl.cells.length !== 5) {
    errors.push(`Template "${tmpl.name}": cells must be a 5×5 grid (got ${tmpl.cells?.length ?? 0} rows)`);
  } else {
    for (let r = 0; r < 5; r++) {
      if (!tmpl.cells[r] || tmpl.cells[r].length !== 5) {
        errors.push(`Template "${tmpl.name}": row ${r} must have 5 columns`);
      }
    }
  }
  if (tmpl.anchors) {
    for (const a of tmpl.anchors) {
      if (a.x < 0 || a.x > 4 || a.y < 0 || a.y > 4) {
        errors.push(`Template "${tmpl.name}": anchor (${a.x},${a.y}) out of 5×5 bounds`);
      }
      if (!isValidAnchorRole(a.role)) {
        errors.push(`Template "${tmpl.name}": unknown anchor role "${a.role}"`);
      }
    }
  }
  if (tmpl.climate && !isValidClimate(tmpl.climate)) {
    errors.push(`Template "${tmpl.name}": invalid climate band`);
  }
  return errors;
}

/** Validate all MICRO_TILE_DEFS. Returns array of error strings. */
export function validateAllTileDefs(): string[] {
  const errors: string[] = [];
  for (const [key, def] of Object.entries(MICRO_TILE_DEFS)) {
    if (def.climate && !isValidClimate(def.climate)) {
      errors.push(`MicroTileDef "${key}": invalid climate band`);
    }
    if (def.lod && !['detail', 'standard', 'simplified', 'minimal'].includes(def.lod)) {
      errors.push(`MicroTileDef "${key}": unknown LOD level "${def.lod}"`);
    }
  }
  return errors;
}

/** Check if a tile fits within a given climate (e.g., chunk-level moisture/temp).
 *  Returns true if the tile's climate band overlaps the target. */
export function tileMatchesClimate(
  tileType: TileType,
  moisture: number,
  temperature: number,
): boolean {
  const def = MICRO_TILE_DEFS[tileType];
  if (!def) return false;
  const c = def.climate ?? DEFAULT_CLIMATE;
  return moisture >= c.moisture[0] && moisture <= c.moisture[1]
      && temperature >= c.temperature[0] && temperature <= c.temperature[1];
}

/** Get the LOD level for a tile type. Returns 'standard' as default. */
export function getTileLOD(tileType: TileType): LODLevel {
  return MICRO_TILE_DEFS[tileType]?.lod ?? 'standard';
}

/** Filter tiles to those matching a specific LOD level or "better" */
export function tilesAtLOD(level: LODLevel): TileType[] {
  const LOD_ORDER: LODLevel[] = ['detail', 'standard', 'simplified', 'minimal'];
  const threshold = LOD_ORDER.indexOf(level);
  return (Object.keys(MICRO_TILE_DEFS) as TileType[]).filter(t => {
    const tileLod = MICRO_TILE_DEFS[t]?.lod ?? 'standard';
    return LOD_ORDER.indexOf(tileLod) <= threshold;
  });
}
