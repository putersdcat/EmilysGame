/**
 * iso-renderer.types.ts — Isometric Renderer 2.0 type integration prototype.
 *
 * Merge prototype from `experiment/isometric-2.0/src/types.ts`.
 * Demonstrates how the 2.0 experiment types integrate into the main codebase.
 *
 * MERGE STRATEGY: "Port types.ts → src/types/" (see GitHub Issue #201)
 *
 * KEY ADAPTATIONS required before full merge:
 *   1. `Camera` — v1 has {x,y}, v2 adds `zoom`. Resolve by extending v1's Camera here.
 *   2. `TileType` vs `TileKind` — v1 uses snake_case (stone_wall), v2 uses kebab-case (stone-wall).
 *      v2 splits base biome (TileKind) from feature nanos (NanoTileKind).
 *      Use `IsoTileKind` as the merge-safe name during transition.
 *   3. Tile scale — v1 renders 32×32 → 64×32 diamonds; v2 renders 128×128 → 256×128.
 *      This is a renderer replacement decision, not a types change.
 *
 * TODO: DOC — remove this file once full merge is complete; consolidate into existing
 *       type files. See issue #201 for migration plan.
 *
 * @see experiment/isometric-2.0/src/types.ts — source of truth during experiment
 */

// ─── Re-exported constants (from experiment, with v1-compatible names) ─────────

/** Logical pixel size of a single micro tile (128×128 px, 4× larger than v1's 32×32). */
export const ISO_MICRO_TILE_SIZE = 128;

/** Isometric diamond width after projection (256 px, 4× larger than v1's 64). */
export const ISO_DIAMOND_WIDTH = 256;

/** Isometric diamond height after projection (128 px, 4× larger than v1's 32). */
export const ISO_DIAMOND_HEIGHT = 128;

/** World Unit Chunk dimension: 5 tiles per side. */
export const ISO_CHUNK_TILES = 5;

/** Maximum Z-height for tiles (elevation range 0–12). */
export const ISO_MAX_Z = 12;

// ─── Camera ────────────────────────────────────────────────────────────────────

/**
 * IsoCamera: Extended camera type for the v2 renderer.
 * Extends v1's {x, y} with zoom support.
 *
 * MIGRATION: Replace v1's `Camera` in `src/render.ts` with this.
 * Short-term: cast from v1 Camera → IsoCamera with `zoom: 1.0`.
 */
export interface IsoCamera {
  /** World-space center X (grid/tile units). */
  x: number;
  /** World-space center Y (grid/tile units). */
  y: number;
  /** Zoom level: 1.0 = default (maps to v1 RENDER_CONFIG.zoom). */
  zoom: number;
}

// ─── Tile Kinds ────────────────────────────────────────────────────────────────

/**
 * IsoTileKind: Base biome terrain identifiers for the 2.0 renderer.
 * NOTE: Use kebab-case (not snake_case like v1's TileType).
 * v1 mapping: 'grass'→'grass', 'rock'→'rock', 'water'→'water', 'dirt'→'dirt'.
 * v1 feature types ('stone_wall', 'fence', etc.) → use IsoNanoTileKind instead.
 */
export type IsoTileKind =
  | 'grass'
  | 'dirt'
  | 'rock'
  | 'water'
  | 'sand'
  | 'dry-grass';           // no v1 equivalent — new in 2.0

/**
 * IsoNanoTileKind: Feature overlay kinds (formerly mixed into v1's TileType).
 * v1 mapping: 'stone_wall'→'stone-wall', 'wooden_fence'→'fence',
 *   'bridge'→'bridge', 'door_gate'→'gate'.
 */
export type IsoNanoTileKind =
  | 'fence'
  | 'stone-wall'
  | 'river'
  | 'river-bank'
  | 'bridge'
  | 'tall-grass'
  | 'gate'
  | 'troll-bridge'         // new — quiz-gated bridge (no v1 equivalent)
  | 'cathedral-wall'       // new — assembly feature
  | 'homestead-wall';      // new — assembly feature

/** Tile variant for continuous feature solver (19 connection variants). */
export type IsoFeatureVariant =
  | 'straight-h' | 'straight-v'
  | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br'
  | 'cross'
  | 'tee-t' | 'tee-r' | 'tee-b' | 'tee-l'
  | 'end-t' | 'end-r' | 'end-b' | 'end-l'
  | 'isolated'
  | 'diagonal-left' | 'diagonal-right' | 'vertex';

// ─── Walkability ───────────────────────────────────────────────────────────────

/**
 * IsoWalkableRule: Walkability rule for nano tiles.
 * 'always' / 'never' are static; 'conditional' gates on quiz/key state.
 * MIGRATION: Replaces v1's tile-level passability flags with a richer rule system.
 */
export type IsoWalkableRule =
  | { readonly type: 'always' }
  | { readonly type: 'never' }
  | { readonly type: 'conditional'; readonly conditionId: string };

// ─── MicroTile ─────────────────────────────────────────────────────────────────

/**
 * IsoMicroTile: The fundamental rendering unit in the 2.0 engine.
 * 128×128 logical pixel SVG → projects to a 256×128 isometric diamond.
 *
 * MIGRATION: Replaces v1's inline SVG tile objects (see src/tiles.ts).
 * Key differences:
 *   - SVG source is 128×128 (v1: 32×32)
 *   - Has explicit `z` elevation (v1: flat, z always 0)
 *   - Has optional `nanos` stack (v1: features baked into base tile kind)
 */
export interface IsoMicroTile {
  readonly kind: IsoTileKind;
  readonly z: number;
  readonly svg: string;
  readonly nanos?: IsoNanoTile[];
}

// ─── NanoTile ─────────────────────────────────────────────────────────────────

/** Z-extrusion direction for nano tile rendering. */
export type IsoNanoZMode = 'positive' | 'negative' | 'flat';

/**
 * IsoNanoTile: Modular feature overlay on a base IsoMicroTile.
 * Decouples feature/feature variant from base biome.
 * MIGRATION: Assets now in /assets/tiles/*.svg (not inline gen.ts SVG strings).
 */
export interface IsoNanoTile {
  readonly kind: IsoNanoTileKind;
  readonly zOffset: number;
  readonly zMode: IsoNanoZMode;
  readonly svg: string;
  readonly walkable: IsoWalkableRule;
  readonly blendEdges: boolean;
  readonly variant?: IsoFeatureVariant;
  /** Optional: side/front face texture SVG for drawExtrudedNano (walls). */
  readonly sideTextureSvg?: string;
  /** Optional: top face texture SVG for drawExtrudedNano (walls). */
  readonly topTextureSvg?: string;
}

/** Ordered stack of nano tiles on a single MicroTile. */
export type IsoNanoStack = readonly IsoNanoTile[];

// ─── WorldUnitChunk ────────────────────────────────────────────────────────────

/**
 * IsoWorldUnitChunk: 5×5 grid of IsoMicroTiles with baked canvas cache.
 * MIGRATION: New module (src/chunk.ts). No v1 equivalent — v1 bakes per-frame.
 * Add alongside existing src/main.ts loop once chunk.ts is ported.
 */
export interface IsoWorldUnitChunk {
  readonly cx: number;
  readonly cy: number;
  readonly tiles: readonly IsoMicroTile[];
  cachedCanvas: HTMLCanvasElement | null;
  dirty: boolean;
  walkableMap: boolean[];
}

// ─── SunState ─────────────────────────────────────────────────────────────────

/**
 * IsoSunState: Sun angle for dynamic shadows and rim lighting.
 * MIGRATION: New system — no v1 equivalent. Add to src/lighting.ts.
 * v1 uses simpler hardcoded shadow offsets (see src/shadows.ts).
 */
export interface IsoSunState {
  readonly azimuth: number;      // radians, 0=east
  readonly elevation: number;    // radians, π/2=overhead
  readonly shadowLength: number;
  readonly shadowAlpha: number;
  readonly rimIntensity: number;
}
