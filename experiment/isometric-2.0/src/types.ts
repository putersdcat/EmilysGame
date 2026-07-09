/**
 * types.ts — 2.0 Experiment: Core type definitions for the isometric renderer.
 * All interfaces follow the same naming conventions as the main Emily's Game codebase.
 * TODO: DOC — full type reference for merge guide
 */

// ─── Constants ───────────────────────────────────────────────
//
// Spatial hierarchy (see Docs/WorldEngine-01-SpatialHierarchy.md):
//
//   L2  Macro Tile      — 5 × 5 World Unit Tiles (= 25 × 25 micro tiles)
//   L1  World Unit Tile — 5 × 5 Micro Tiles
//   L0  Micro Tile      — atomic terrain / collision cell (1 iso diamond)
//   L0.5 Nano Tile      — 3 × 3 sub-grid OVERLAY of one Micro Tile
//                         (does NOT enlarge the micro footprint; subdivides it)
//
// These constants are the single source of truth for every grid math
// operation in the engine. Renamed from the legacy `CHUNK_*` family in
// alignment with the world-engine spec; the `WorldUnitChunk` interface
// retains the "chunk" word because it is the *runtime baked* container
// of an L1 World Unit Tile (it carries cachedCanvas + walkableMap).

/** Logical pixel size of a single micro tile (source SVG viewport).
 *
 *  Value chosen as 144 so it divides cleanly by NANO_GRID=3 → nano cell = 48 px.
 *  The 48 px figure is also WALL_THICKNESS in the wall geometry, so every
 *  spatial unit in the engine is an integer multiple of 48 px:
 *    micro = 144 = 3 × nano(48) = 3 × wall_thickness
 *    chunk (L1) = 5 × micro = 720
 *  Earlier value (128) gave nano = 42.667 — fractional pixels everywhere. */
export const MICRO_TILE_SIZE = 144;

/** Width of the isometric diamond after projection (2:1 ratio). */
export const ISO_TILE_WIDTH = 256;

/** Height of the isometric diamond after projection (2:1 ratio). */
export const ISO_TILE_HEIGHT = 128;

/** Nano sub-grid resolution per micro tile (3 × 3 patches per L0.5 overlay). */
export const NANO_GRID = 3;

/** L1: Number of micro tiles per side in a World Unit Tile (a.k.a. chunk). */
export const WORLD_UNIT_TILES = 5;

/** L1: Logical pixel size of a World Unit Tile (WORLD_UNIT_TILES × MICRO_TILE_SIZE). */
export const WORLD_UNIT_SIZE = WORLD_UNIT_TILES * MICRO_TILE_SIZE;

/** L2: Number of World Unit Tiles per side in a Macro Tile. */
export const MACRO_UNIT_TILES = 5;

/** L2: Number of micro tiles per side spanned by a Macro Tile (= MACRO × WORLD_UNIT). */
export const MACRO_UNIT_MICROS = MACRO_UNIT_TILES * WORLD_UNIT_TILES;

/** Maximum Z-height value for tiles (0–12 range). */
export const MAX_Z_HEIGHT = 12;

/** Height map resolution per tile (8×8 grid for slope data). */
export const HEIGHTMAP_RES = 8;

// ─── Edge & Blend ────────────────────────────────────────────

/** Cardinal edge directions for blend masks. */
export type EdgeDirection = 'top' | 'right' | 'bottom' | 'left';

/**
 * Per-edge blend mask. Each edge stores a normalized 0–1 alpha array
 * across the edge's span (e.g., 8 samples). Used for seamless blending
 * between adjacent tiles.
 */
export interface EdgeMask {
  /** Blend samples (0=transparent, 1=opaque) for this edge. */
  readonly samples: readonly number[];
}

/** Full set of edge blend masks for one tile. */
export interface EdgeMasks {
  readonly top: EdgeMask;
  readonly right: EdgeMask;
  readonly bottom: EdgeMask;
  readonly left: EdgeMask;
}

// ─── Tile Types ──────────────────────────────────────────────

/** Continuous feature connection flags for solver use. */
export interface FeatureConnections {
  readonly top: boolean;
  readonly right: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
}

/** Tile variant identifier for continuous features (walls, fences, etc.). */
export type FeatureVariant =
  | 'straight-h'     // Horizontal straight
  | 'straight-v'     // Vertical straight
  | 'corner-tl'      // Corner top-left
  | 'corner-tr'      // Corner top-right
  | 'corner-bl'      // Corner bottom-left
  | 'corner-br'      // Corner bottom-right
  | 'cross'          // Four-way intersection
  | 'tee-t'          // T-junction (top open)
  | 'tee-r'          // T-junction (right open)
  | 'tee-b'          // T-junction (bottom open)
  | 'tee-l'          // T-junction (left open)
  | 'end-t'          // Dead end facing top
  | 'end-r'          // Dead end facing right
  | 'end-b'          // Dead end facing bottom
  | 'end-l'          // Dead end facing left
  | 'isolated'       // No connections
  | 'diagonal-left'  // Diagonal piece (top-right to bottom-left)
  | 'diagonal-right' // Diagonal piece (top-left to bottom-right)
  | 'vertex';        // Vertex/corner post

/** Base biome terrain identifiers (pure landscape, no features). */
export type BiomeKind =
  | 'grass'
  | 'dirt'
  | 'rock'
  | 'water'
  | 'sand'
  | 'dry-grass';

/**
 * TileKind: Equivalent to BiomeKind after the nano-tile migration.
 * Feature types ('stone-wall', 'fence', etc.) now live in NanoTileKind.
 */
export type TileKind = BiomeKind;

/** Feature / overlay kinds for nano tiles (sit on top of base biome). */
export type NanoTileKind =
  | 'fence'
  | 'stone-wall'
  | 'river'
  | 'river-bank'
  | 'bridge'
  | 'tall-grass'
  | 'gate'
  | 'troll-bridge'
  | 'cathedral-wall'
  | 'homestead-wall'
  | 'roof-slope-left'
  | 'roof-slope-right'
  | 'roof-ridge';

/**
 * MicroTile: The fundamental rendering unit.
 * 144×144 logical pixels → projects to a 256×128 isometric diamond.
 */
export interface MicroTile {
  /** Terrain/feature type. */
  readonly kind: TileKind;

  /** Z-height value (0–MAX_Z_HEIGHT). Lifts the tile in draw order. */
  readonly z: number;

  /**
   * Optional 8×8 height map for sub-tile slope data.
   * Values are normalized 0–1 within the tile's z range.
   * Row-major: heightMap[row * HEIGHTMAP_RES + col].
   */
  readonly heightMap?: readonly number[];

  /** Edge blend masks for seamless blending with neighbours. */
  readonly edgeMasks: EdgeMasks;

  /** SVG source string (128×128 viewBox). */
  readonly svg: string;

  /**
   * Optional SVG path data string used for path-based shadows.
   * If present, shadows use this geometry instead of generic shapes.
   */
  readonly shadowPath?: string;

  /** For continuous features: which neighbours this tile connects to. */
  readonly connections?: FeatureConnections;

  /** For continuous features: selected variant piece. */
  readonly variant?: FeatureVariant;

  /** Nano-tile augmentation overlays (max 3, sorted neg-Z first). */
  readonly nanos?: NanoStack;
}

// ─── Nano Tile Types ─────────────────────────────────────────

/** Z-extrusion direction for nano tile rendering. */
export type NanoZMode = 'positive' | 'negative' | 'flat';

/** Walkability rule: always passable, never passable, or quiz/key gated. */
export type WalkableRule =
  | { readonly type: 'always' }
  | { readonly type: 'never' }
  | { readonly type: 'conditional'; readonly conditionId: string };

/**
 * NanoTile: Modular overlay on a base biome MicroTile.
 * Enables continuous features, height simulation, and dynamic elements
 * without altering the base biome layer.
 */
export interface NanoTile {
  readonly kind: NanoTileKind;
  /** Positive = upright barrier (fence); negative = carve-out (river). */
  readonly zOffset: number;
  readonly zMode: NanoZMode;
  /** SVG source: 128×32 for thin (fence), 128×128 for tall (spire). */
  readonly svg: string;
  readonly walkable: WalkableRule;
  /** Alpha gradient at base/top edge for blending into biome. */
  readonly blendEdges: boolean;
  /** Optional horizontal cap SVG for extrusion top face. */
  readonly topTextureSvg?: string;
  /** Optional vertical fill SVG for extrusion side face. */
  readonly sideTextureSvg?: string;
  /** Optional Canvas extrusion material slice for the top/XY face. */
  readonly topFaceTextureSvg?: string;
  /** Optional Canvas extrusion material slice for V-axis top strips. */
  readonly topFaceTextureSvgV?: string;
  /** Optional Canvas extrusion material slice for the south/XZ face. */
  readonly southFaceTextureSvg?: string;
  /** Optional Canvas extrusion material slice for the east/YZ face. */
  readonly eastFaceTextureSvg?: string;
  /** Optional Canvas extrusion material slice for exposed wall end faces. */
  readonly endFaceTextureSvg?: string;
  /** Optional south/XZ slices keyed by world-y plane (0,48,96,144). */
  readonly southFaceTextureByPlane?: Readonly<Record<number, string>>;
  /** Optional east/YZ slices keyed by world-x plane (0,48,96,144). */
  readonly eastFaceTextureByPlane?: Readonly<Record<number, string>>;
  /** Optional exposed end-face slices keyed by wall plane (0,48,96,144). */
  readonly endFaceTextureByPlane?: Readonly<Record<number, string>>;
  /** Optional render-time weathering overlays applied with actual face dimensions. */
  readonly weatheringOverlays?: readonly NanoWeatheringOverlay[];
  /** When true, do not darken one face after drawing explicit face slices. */
  readonly faceSliceEqualLighting?: boolean;
  /** Optional color for exposed end-cap/header grout ticks. */
  readonly endCapTickColor?: string;
  /** Feature variants this SVG covers (for solver). */
  readonly variants?: readonly FeatureVariant[];
  /** SVG path data for shadow silhouette. */
  readonly shadowPath?: string;
  /** Optional procedural fence/gate construction + material style. */
  readonly fenceStyle?: FenceStyle;
  /** Resolved per-tile water material palette (D.6 water-family). Drives negative-Z river/pond rendering. */
  readonly waterStyle?: import('./textures/water-family').WaterStyle;
  /** Solver-resolved connection flags. */
  readonly connections?: FeatureConnections;
  /** Solver-resolved variant piece. */
  readonly variant?: FeatureVariant;
  /**
   * When true (default), the wall TOP face uses an axis-aware pattern
   * transform — H wall rects use the H transform (bricks running E/W),
   * V wall rects use the V transform (bricks running N/S). Correct for
   * brick textures whose orientation should match the wall length axis.
   *
   * When false, ALL top rects use the H pattern transform. Correct for
   * rotation-invariant textures (Voronoi natural stone) — kills the
   * 90°-rotation seam where an H winner strip meets a V loser stub
   * inside corner/tee tiles. The visual cost is that V walls have stones
   * "running" in the H direction on top, but cells have no clear
   * direction, so this is invisible.
   */
  readonly topRotateWithAxis?: boolean;
  /**
   * When true (default), exposed wall ends draw vertical course-aligned
   * mortar TICKS on the south/east end faces (the dark `#1c1a17` notches
   * representing brick-header joints). Correct for brick textures whose
   * end caps are visually a row of stacked headers.
   *
   * When false, no end-face ticks are drawn. Correct for irregular
   * masonry textures (e.g. ancient-stone Voronoi) where there is no
   * regular course pitch and the ticks read as black streaks instead of
   * stone joints.
   */
  readonly endCapTicks?: boolean;
}

export interface NanoWeatheringOverlay {
  readonly kind: 'moss' | 'dirt' | 'dust' | 'mud' | 'soot' | 'edge-wear' | 'snow' | 'cracks';
  readonly color: string;
  readonly intensity: number;
  readonly opacity: number;
  readonly seed: number;
  readonly faces?: readonly ('south' | 'east' | 'top')[];
  /** 0..1 y-range over the actual rendered face. Vertical faces: top→bottom. Top faces: local north→south. */
  readonly yRange?: readonly [number, number];
  /** 0..1 x-range over the actual rendered face. */
  readonly xRange?: readonly [number, number];
}

export type FenceConstructionKind = 'post-and-rail' | 'split-rail' | 'picket' | 'wattle';
export type FenceGateKind = 'farm' | 'picket' | 'wattle';
export type FenceLeafMode = 'single' | 'double';

export interface FenceWeathering {
  readonly sunBleach: number;
  readonly moss: number;
  readonly grime: number;
  readonly cracks: number;
}

export interface FenceStyle {
  readonly id: string;
  readonly construction: FenceConstructionKind;
  readonly gateKind: FenceGateKind;
  readonly gateLeafMode: FenceLeafMode;
  readonly postColor: string;
  readonly postShadow: string;
  readonly postHighlight: string;
  readonly railColor: string;
  readonly railShadow: string;
  readonly railHighlight: string;
  readonly hardwareColor: string;
  readonly bleachColor: string;
  readonly mossColor: string;
  readonly grimeColor: string;
  readonly crackColor: string;
  readonly postWidth: number;
  readonly postCapHeight: number;
  readonly postHeightScale: number;
  readonly railThickness: number;
  readonly railSpread: number;
  readonly railCount: 1 | 2 | 3;
  readonly midSpanPosts: boolean;
  readonly picketSpacing?: number;
  readonly weaveSpacing?: number;
  readonly sag: number;
  readonly roughness: number;
  readonly weathering: FenceWeathering;
}

/**
 * NanoStack: Ordered stack of nano tiles on a single micro tile.
 * Max 3 nanos: sorted negative-Z first, then flat, then positive.
 * Renderer enforces draw order.
 */
export type NanoStack = readonly NanoTile[];

// ─── Player State ────────────────────────────────────────────

/** Cardinal facing direction for player sprite selection. */
export type FacingDirection = 'n' | 's' | 'e' | 'w';

/** Player walk animation frame index. */
export type AnimFrame = 0 | 1 | 2;

/**
 * PlayerState: Mutable player position, facing, animation, and nano interaction.
 * worldCol/worldRow are fractional for sub-tile movement.
 * sinkDepthPx is set by the nano system when standing on negative-Z tiles (rivers, trenches).
 */
export interface PlayerState {
  worldCol: number;
  worldRow: number;
  facing: FacingDirection;
  animFrame: AnimFrame;
  /** Pixel offset from negative-Z nanos — player sprite shifts down. */
  sinkDepthPx: number;
  /** Pixel offset from base tile Z elevation — player sprite shifts up. */
  tileZPx: number;
  /** True when WASD is active this frame. Drives walk animation. */
  moving: boolean;
}

// ─── World Unit Chunk (L1 runtime container) ─────────────────

/**
 * WorldUnitChunk: A baked, runtime container for one L1 World Unit Tile —
 * a 5×5 grid of MicroTiles with cachedCanvas + walkableMap. Loading,
 * culling, and bake caching all happen at this granularity.
 * (See Docs/WorldEngine-01-SpatialHierarchy.md for the L0/L0.5/L1/L2 spec.)
 */
export interface WorldUnitChunk {
  /** World-Unit grid coordinate (NOT pixel-space, NOT micro-space). */
  readonly cx: number;
  readonly cy: number;

  /**
   * 5×5 micro-tile grid, row-major: tiles[row * WORLD_UNIT_TILES + col].
   * Length always === WORLD_UNIT_TILES * WORLD_UNIT_TILES.
   */
  readonly tiles: readonly MicroTile[];

  /**
   * Pre-rendered composite canvas for the entire World Unit (nullable until baked).
   * Width/height match the isometric bounding box of the 5×5 grid.
   */
  cachedCanvas: HTMLCanvasElement | null;

  /** True when cached canvas needs re-bake (e.g., tile changed). */
  dirty: boolean;

  /**
   * Active conditions on this World Unit (troll-bridge quiz answers, gate unlocks).
   * Key: conditionId string (e.g., 'quiz:gate-20-4').
   * Value: 'locked' | 'unlocked'.
   * Mutated by resolveCondition() — NOT readonly.
   */
  activeConditions: Map<string, 'locked' | 'unlocked'>;

  /**
   * Cached walkable map for fast collision queries.
   * WORLD_UNIT_TILES * WORLD_UNIT_TILES boolean flags (row-major).
   * Recomputed by buildWalkableMap() after each solver pass.
   */
  walkableMap: boolean[];
}

// ─── Camera ──────────────────────────────────────────────────

/** Camera state for viewport positioning. */
export interface Camera {
  /** World-space center X (grid units). */
  x: number;
  /** World-space center Y (grid units). */
  y: number;
  /** Zoom level (1.0 = default). */
  zoom: number;
}

// ─── Parallax ────────────────────────────────────────────────

/** Single parallax background layer. */
export interface ParallaxLayer {
  /** Layer depth factor (0 = stationary background, 1 = moves with camera). */
  readonly depth: number;
  /** Render callback: draws this layer at the given offset. */
  readonly render: (ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, width: number, height: number) => void;
}

// ─── Sun / Lighting ──────────────────────────────────────────

/** Sun angle for shadow and rim lighting calculations. */
export interface SunState {
  /** Azimuth angle in radians (0 = east, π/2 = south, π = west, 3π/2 = north). */
  readonly azimuth: number;
  /** Elevation angle in radians (0 = horizon, π/2 = directly overhead). */
  readonly elevation: number;
  /** Shadow length multiplier (longer at low elevations). */
  readonly shadowLength: number;
  /** Shadow opacity (0–1). */
  readonly shadowAlpha: number;
  /** Rim lighting intensity (0–1). */
  readonly rimIntensity: number;
}

// ─── Draw Commands (zero-alloc render pipeline) ──────────────

/** Draw command type constants. */
export const DCMD_TILE = 0;
export const DCMD_SHADOW = 1;
export const DCMD_FEATURE = 2;
export const DCMD_RIM = 3;

/** A single draw command in the render queue. */
export interface DrawCommand {
  /** Sort key: y + z * 0.5 for depth ordering. */
  sortKey: number;
  /** Command type (DCMD_* constant). */
  type: number;
  /** Screen X position. */
  sx: number;
  /** Screen Y position. */
  sy: number;
  /** Source canvas/image to blit (pre-rendered tile). */
  source: HTMLCanvasElement | null;
  /** Extra data: shadow alpha, rim color, etc. */
  param: number;
}

// ─── Asset Metadata (loaded from .json companion files) ──────

/** Metadata JSON format for a tile asset. */
export interface TileAssetMeta {
  /** Tile kind identifier. */
  readonly kind: TileKind;
  /** Z-height (0–MAX_Z_HEIGHT). */
  readonly z: number;
  /** Optional 8×8 height map array. */
  readonly heightMap?: readonly number[];
  /** Edge blend mask data. */
  readonly edgeMasks: {
    readonly top: readonly number[];
    readonly right: readonly number[];
    readonly bottom: readonly number[];
    readonly left: readonly number[];
  };
  /** Optional SVG path for shadow projection. */
  readonly shadowPath?: string;
  /** Feature connections (for continuous features). */
  readonly connections?: {
    readonly top: boolean;
    readonly right: boolean;
    readonly bottom: boolean;
    readonly left: boolean;
  };
  /** Feature variant. */
  readonly variant?: FeatureVariant;
}

/** Metadata JSON format for a nano tile asset. */
export interface NanoAssetMeta {
  readonly kind: NanoTileKind;
  readonly zOffset: number;
  readonly zMode: NanoZMode;
  readonly walkable: WalkableRule;
  readonly blendEdges: boolean;
  readonly topTexturePath?: string;
  readonly sideTexturePath?: string;
  readonly variants?: readonly FeatureVariant[];
  readonly shadowPath?: string;
}

// ─── Macro Assemblies (multi-tile structures) ────────────────

/** Single tile placement within a macro assembly. */
export interface AssemblyTilePlacement {
  /** Column offset relative to assembly origin. */
  readonly col: number;
  /** Row offset relative to assembly origin. */
  readonly row: number;
  /** Nano stack for this tile position. */
  readonly nanos: NanoStack;
}

/** Multi-tile / multi-chunk structure descriptor (homestead, cathedral, etc.). */
export interface MacroAssembly {
  /** Unique assembly identifier (e.g., 'homestead-small', 'cathedral'). */
  readonly id: string;
  /** Width in tiles. */
  readonly widthTiles: number;
  /** Height in tiles. */
  readonly heightTiles: number;
  /** Tile placements relative to assembly origin. */
  readonly placements: readonly AssemblyTilePlacement[];
}

// ─── World Coordinate Helpers ────────────────────────────────

/** Convert world grid (col, row) to isometric screen coordinates. */
export function worldToIso(col: number, row: number, tileW: number, tileH: number): { sx: number; sy: number } {
  return {
    sx: (col - row) * (tileW / 2),
    sy: (col + row) * (tileH / 2),
  };
}

/** Convert screen coordinates back to world grid (approximate, for picking). */
export function isoToWorld(sx: number, sy: number, tileW: number, tileH: number): { col: number; row: number } {
  const halfW = tileW / 2;
  const halfH = tileH / 2;
  return {
    col: (sx / halfW + sy / halfH) / 2,
    row: (sy / halfH - sx / halfW) / 2,
  };
}
