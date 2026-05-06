/**
 * canvas-renderer.ts — Node.js Canvas2D game engine renderer for MCP visual tools.
 *
 * Issue #213: Canvas-native renderer so MCP tools call the ACTUAL engine draw
 * functions (drawExtrudedNano etc.) rather than reimplementing geometry in SVG.
 *
 * Architecture:
 *   SVG textures → @napi-rs/canvas loadImage() → injectSvgImage() seeds engine cache
 *   → drawNanoStack() called with native canvas ctx → PNG buffer returned
 *
 * Why napi-canvas works: @napi-rs/canvas Image objects are duck-type compatible
 * with HTMLImageElement for ctx.drawImage(). After await loadImage() resolves,
 * img.complete === true, so loadSvgImage() finds it immediately (no frame wait).
 *
 * Source of truth: any change to nano-tile.ts draw functions auto-propagates here.
 *
 * TODO: DOC — contract: preloadTextures must be awaited before any draw call
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { SKRSContext2D } from '@napi-rs/canvas';

// Game engine draw entry point — handles all zModes (positive/negative/flat/extruded)
import { drawNanoStack } from '../src/nano-tile.js';

// Texture generators — same functions the browser uses
import { getVariantSvg, woodenFenceSvg, wallBounds } from '../src/solver.js';

// Single glue point: inject napi-canvas Image into engine SVG cache
import { injectSvgImage } from '../src/tile.js';

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  WORLD_UNIT_TILES,
  MACRO_UNIT_TILES,
  NANO_GRID,
  MICRO_TILE_SIZE,
  type NanoTile,
  type NanoTileKind,
  type NanoZMode,
  type FeatureVariant,
  type FeatureConnections,
  type WalkableRule,
} from '../src/types.js';

// ─── Local geometry constants ─────────────────────────────────

const HALF_W = ISO_TILE_WIDTH / 2;   // 128
const HALF_H = ISO_TILE_HEIGHT / 2;  // 64

// ─── Nano metadata maps ───────────────────────────────────────

/** Z offset defaults per kind (matches NANO_Z in scene-registry.ts) */
const NANO_Z: Partial<Record<string, number>> = {
  'stone-wall':     4,
  'cathedral-wall': 6,
  'homestead-wall': 3,
  'fence':          2,
  'gate':           2,
  'troll-bridge':   1,
  'bridge':         0,
  'river':          2,
  'river-bank':     1,
  'tall-grass':     0,
};

const NANO_ZMODE: Partial<Record<string, NanoZMode>> = {
  'stone-wall':     'positive',
  'cathedral-wall': 'positive',
  'homestead-wall': 'positive',
  'fence':          'positive',
  'gate':           'positive',
  'troll-bridge':   'positive',
  'bridge':         'flat',
  'river':          'negative',
  'river-bank':     'flat',
  'tall-grass':     'flat',
};

const NANO_WALKABLE: Partial<Record<string, boolean>> = {
  'stone-wall': false, 'cathedral-wall': false, 'homestead-wall': false,
  'fence': false, 'gate': true, 'troll-bridge': true, 'bridge': true,
  'river': false, 'river-bank': true, 'tall-grass': true,
};

/** Kinds that use sideTextureSvg + topTextureSvg path in drawNanoStack → drawExtrudedNano */
const EXTRUDED_KINDS = new Set(['stone-wall', 'cathedral-wall', 'homestead-wall']);

/** Terrain kinds: drawn as procedural diamond fills, no SVG */
const TERRAIN_COLORS: Record<string, string> = {
  grass:       '#4a7c4e',
  dirt:        '#8b6f47',
  rock:        '#6b6b6b',
  water:       '#1e6b8c',
  sand:        '#c2a05a',
  'dry-grass': '#8b7a32',
};

// ─── Public types ─────────────────────────────────────────────

export interface CanvasSceneEntry {
  kind: string;
  col: number;
  row: number;
  variant?: FeatureVariant;
  zOffset?: number;
  connections?: FeatureConnections;
  /** Raw SVG override — skips getVariantSvg lookup. For extruded kinds, this overrides the SIDE texture only. */
  svgOverride?: string;
  /**
   * Optional override for the wall TOP texture (extruded kinds only).
   * Pass any 128×128 self-tileable brick SVG (textures/README.md
   * contract). When supplied, the wall top is patterned from this image
   * via stoneWallTopSvg(variant, topSvgOverride). When omitted, the
   * canonical StoneBrick top texture is used.
   */
  topSvgOverride?: string;
  /** Optional top/XY material slice for Canvas extrusions. Falls back to topSvgOverride/svgOverride. */
  topFaceSvgOverride?: string;
  /** Optional south/XZ material slice for Canvas extrusions. Falls back to svgOverride. */
  southFaceSvgOverride?: string;
  /** Optional east/YZ material slice for Canvas extrusions. Falls back to svgOverride. */
  eastFaceSvgOverride?: string;
  /** Optional south/XZ material slices keyed by wall-y plane. */
  southFaceSvgByPlane?: Readonly<Record<number, string>>;
  /** Optional east/YZ material slices keyed by wall-x plane. */
  eastFaceSvgByPlane?: Readonly<Record<number, string>>;
  /** Keep explicit face-slice colors equal across top/side edges. */
  faceSliceEqualLighting?: boolean;
  /**
   * Whether stoneWallTopSvg draws its rectangular grout outline on the
   * top face. Defaults to true (correct for brick textures). Set false
   * for non-brick textures (e.g. ancient-stone Voronoi).
   */
  topOutline?: boolean;
  /**
   * When true (default), wall TOP face uses an axis-aware pattern
   * transform per rect (H rects → H pattern, V rects → V pattern).
   * Set false for rotation-invariant textures (e.g. ancient-stone
   * Voronoi) so all top rects share the H transform — eliminates the
   * 90°-rotation seam at inside corners. Forwarded to NanoTile.
   */
  topRotateWithAxis?: boolean;
  /**
   * When true (default), exposed wall ends draw brick-header-style
   * vertical mortar TICKS on the south/east end faces. Set false for
   * irregular-masonry textures (e.g. ancient-stone Voronoi) where the
   * ticks read as black streaks instead of joints. Forwarded to NanoTile.
   */
  endCapTicks?: boolean;
}

/**
 * CanvasPlayerEntry — placement of a player avatar.
 *
 * CANONICAL ANCHOR (Iso 2.0): the player sprite renders CENTERED inside
 * one nano-tile patch (1/9 of a micro-tile). A micro-tile is a 3×3 grid
 * of nano-tiles indexed (nanoCol, nanoRow) ∈ {0,1,2} × {0,1,2} where
 *   nanoCol=0  is the WEST  nano column (back-left in iso)
 *   nanoCol=2  is the EAST  nano column (front-right in iso)
 *   nanoRow=0  is the NORTH nano row    (back-right in iso)
 *   nanoRow=2  is the SOUTH nano row    (front-left in iso)
 *
 * The sprite's feet anchor at the SOUTH vertex of the chosen nano patch
 * (not the micro tile), so movement and visual depth are nano-granular.
 *
 * Backwards compatibility: if `nanoCol` / `nanoRow` are omitted, the
 * sprite anchors at the south vertex of the (col,row) micro tile (the
 * legacy behaviour used by older harnesses).
 */
export interface CanvasPlayerEntry {
  /** Micro-tile column. Integer expected; fractional values still work but skip nano snapping. */
  col: number;
  /** Micro-tile row. Integer expected; fractional values still work but skip nano snapping. */
  row: number;
  /** Optional label tag rendered above the head. */
  label?: string;
  /** Nano sub-cell column inside the micro tile (0=W, 1=center, 2=E). */
  nanoCol?: 0 | 1 | 2;
  /** Nano sub-cell row inside the micro tile (0=N, 1=center, 2=S). */
  nanoRow?: 0 | 1 | 2;
}

export interface CanvasSceneOptions {
  width?: number;
  height?: number;
  debug?: boolean;
  /** Overlay world geometry layers (chunk / micro / nano / wall-rect) with labels. */
  geometryLayers?: boolean;
  background?: string;
  players?: CanvasPlayerEntry[];
}

export interface CanvasRenderResult {
  png: Buffer;
  width: number;
  height: number;
  renderTimeMs: number;
}

// ─── Texture collection & preloading ─────────────────────────

/**
 * Collect all unique SVG strings needed for the given entries.
 */
function collectSvgStrings(entries: CanvasSceneEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    if (TERRAIN_COLORS[e.kind]) continue;  // terrain — no SVG
    const variant  = e.variant  ?? 'straight-h';
    const zOffset  = e.zOffset  ?? NANO_Z[e.kind] ?? 2;
    const conn     = e.connections ?? variantToConnections(variant);
    const kind     = e.kind as NanoTileKind;

    if (EXTRUDED_KINDS.has(e.kind)) {
      const side = e.svgOverride ?? getVariantSvg(kind, variant, conn, zOffset, e.col, e.row);
      const top  = e.topFaceSvgOverride ?? e.topSvgOverride ?? side;
      const south = e.southFaceSvgOverride ?? side;
      const east = e.eastFaceSvgOverride ?? side;
      if (side) out.add(side);
      if (top)  out.add(top);
      if (south) out.add(south);
      if (east) out.add(east);
      for (const svg of Object.values(e.southFaceSvgByPlane ?? {})) out.add(svg);
      for (const svg of Object.values(e.eastFaceSvgByPlane ?? {})) out.add(svg);
    } else {
      const svg = e.svgOverride
        ?? getVariantSvg(kind, variant, conn, zOffset, e.col, e.row)
        ?? ((e.kind === 'fence' || e.kind === 'gate') ? woodenFenceSvg(variant) : null);
      if (svg) out.add(svg);
    }
  }
  return out;
}

/**
 * Pre-load every SVG into engine's image cache via napi-canvas.
 * MUST be awaited before calling drawNanoStack. Non-fatal on individual failure.
 */
async function preloadTextures(svgs: Set<string>): Promise<void> {
  await Promise.all([...svgs].map(async (svg) => {
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    try {
      const img = await loadImage(dataUri);
      // img.complete is true after loadImage resolves (no async browser delay needed)
      injectSvgImage(svg, img as unknown as HTMLImageElement);
    } catch (err) {
      console.warn(`[canvas-renderer] SVG preload failed: ${String(err).slice(0, 120)}`);
    }
  }));
}

// ─── NanoTile builder ─────────────────────────────────────────

/** Returns null for terrain kinds (they use drawTerrainTile instead). */
function buildNanoTile(e: CanvasSceneEntry): NanoTile | null {
  if (TERRAIN_COLORS[e.kind]) return null;

  const variant = e.variant  ?? 'straight-h';
  const zOffset = e.zOffset  ?? NANO_Z[e.kind] ?? 2;
  const conn    = e.connections ?? variantToConnections(variant);
  const zMode   = NANO_ZMODE[e.kind] ?? 'positive';
  const walkable: WalkableRule = (NANO_WALKABLE[e.kind] ?? true)
    ? { type: 'always' }
    : { type: 'never' };
  const kind = e.kind as NanoTileKind;

  if (EXTRUDED_KINDS.has(e.kind)) {
    const sideSvg = e.svgOverride ?? getVariantSvg(kind, variant, conn, zOffset, e.col, e.row) ?? '';
    // Top texture: prefer explicit topSvgOverride, otherwise reuse the
    // side SVG so a re-textured wall (e.g. red clinker) stays self-
    // consistent. Falls back to canonical StoneBrick when both are
    // empty (unreachable in practice — extruded kinds always supply a
    // side via getVariantSvg).
    const topSvg  = e.topFaceSvgOverride ?? e.topSvgOverride ?? sideSvg;
    return {
      kind, zOffset, zMode, walkable, blendEdges: false,
      svg:            sideSvg,
      sideTextureSvg: sideSvg,
      topTextureSvg:  topSvg,
      topFaceTextureSvg: e.topFaceSvgOverride,
      southFaceTextureSvg: e.southFaceSvgOverride,
      eastFaceTextureSvg: e.eastFaceSvgOverride,
      southFaceTextureByPlane: e.southFaceSvgByPlane,
      eastFaceTextureByPlane: e.eastFaceSvgByPlane,
      faceSliceEqualLighting: e.faceSliceEqualLighting,
      variant,
      connections: conn,
      topRotateWithAxis: e.topRotateWithAxis,
      endCapTicks: e.endCapTicks,
    };
  }

  const svg = e.svgOverride
    ?? getVariantSvg(kind, variant, conn, zOffset, e.col, e.row)
    ?? ((e.kind === 'fence' || e.kind === 'gate') ? woodenFenceSvg(variant) : '');

  return {
    kind, zOffset, zMode, walkable, blendEdges: false,
    svg: svg ?? '',
    variant,
    connections: conn,
  };
}

// ─── Coordinate helpers ───────────────────────────────────────

interface ScreenPos { screenX: number; screenY: number; }

function tilePos(col: number, row: number, ox: number, oy: number): ScreenPos {
  return {
    screenX: ox + (col - row) * HALF_W - HALF_W,
    screenY: oy + (col + row) * HALF_H - HALF_H,
  };
}

/**
 * Compute canvas origin so all tiles + players fit centred in the canvas.
 * The formula is symmetric with tilePos() above.
 */
function computeOrigin(
  entries: CanvasSceneEntry[],
  players: CanvasPlayerEntry[],
  width: number,
  height: number,
  nanoHeadroom = HALF_H,
): { ox: number; oy: number } {
  const cols = [...entries.map(e => e.col), ...players.map(p => p.col)];
  const rows = [...entries.map(e => e.row), ...players.map(p => p.row)];
  if (cols.length === 0) return { ox: width / 2, oy: height / 2 };

  const minCol = Math.min(...cols), maxCol = Math.max(...cols);
  const minRow = Math.min(...rows), maxRow = Math.max(...rows);

  // Centre of iso bounding box at origin = 0
  const sxMid = ((minCol - maxRow) + (maxCol + 1 - (minRow + 1) + 2)) * HALF_W / 2;
  const syMid = ((minCol + minRow) + (maxCol + maxRow + 2)) * HALF_H / 2;

  return {
    ox: Math.round(width  / 2 - sxMid + HALF_W),
    oy: Math.round(height / 2 - syMid + HALF_H + nanoHeadroom),
  };
}

// ─── Terrain tile draw ────────────────────────────────────────

function drawTerrainTile(ctx: SKRSContext2D, col: number, row: number, kind: string, ox: number, oy: number): void {
  const { screenX: sx, screenY: sy } = tilePos(col, row, ox, oy);
  const base = TERRAIN_COLORS[kind] ?? '#666666';

  // Subtle noise per-tile
  const dv = ((col * 7 + row * 13) & 0x1f) - 16;
  const r = Math.max(0, Math.min(255, parseInt(base.slice(1, 3), 16) + dv));
  const g = Math.max(0, Math.min(255, parseInt(base.slice(3, 5), 16) + (dv >> 1)));
  const b = parseInt(base.slice(5, 7), 16);

  ctx.beginPath();
  ctx.moveTo(sx + HALF_W, sy);                   // top
  ctx.lineTo(sx + ISO_TILE_WIDTH, sy + HALF_H);  // right
  ctx.lineTo(sx + HALF_W, sy + ISO_TILE_HEIGHT); // bottom
  ctx.lineTo(sx, sy + HALF_H);                   // left
  ctx.closePath();
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// ─── Debug overlay ────────────────────────────────────────────

function drawDebugDiamond(ctx: SKRSContext2D, col: number, row: number, walkable: boolean, ox: number, oy: number): void {
  const { screenX: sx, screenY: sy } = tilePos(col, row, ox, oy);
  ctx.beginPath();
  ctx.moveTo(sx + HALF_W, sy);
  ctx.lineTo(sx + ISO_TILE_WIDTH, sy + HALF_H);
  ctx.lineTo(sx + HALF_W, sy + ISO_TILE_HEIGHT);
  ctx.lineTo(sx, sy + HALF_H);
  ctx.closePath();
  ctx.fillStyle = walkable ? 'rgba(0,220,0,0.14)' : 'rgba(220,20,20,0.2)';
  ctx.fill();
  ctx.strokeStyle = walkable ? 'rgba(0,200,0,0.55)' : 'rgba(200,0,0,0.65)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ─── Player sprite ────────────────────────────────────────────

function drawPlayerSprite(
  ctx: SKRSContext2D,
  col: number,
  row: number,
  label: string | undefined,
  ox: number,
  oy: number,
  nanoCol?: 0 | 1 | 2,
  nanoRow?: 0 | 1 | 2,
): void {
  // Effective foot world coords. With nano snapping, feet land at the
  // CENTER of the chosen 1/3 × 1/3 nano patch within the micro tile
  // (col, row). This keeps the avatar visually centered in its nano cell
  // regardless of which side of the cell faces a wall — without this,
  // anchoring at the patch's south vertex made north/west wall-huggers
  // look much farther from the wall than south/east huggers, because the
  // sprite body rises northward off the foot point.
  // Without snapping, feet land at the south vertex of the whole micro
  // tile (legacy behaviour).
  let footWorldCol: number;
  let footWorldRow: number;
  if (nanoCol !== undefined && nanoRow !== undefined) {
    footWorldCol = col + (nanoCol + 0.5) / 3;
    footWorldRow = row + (nanoRow + 0.5) / 3;
  } else {
    footWorldCol = col + 1;
    footWorldRow = row + 1;
  }
  const px = ox + (footWorldCol - footWorldRow) * HALF_W;
  // -HALF_H aligns to the diamond south-vertex (matches legacy
  // tilePos(...) + HALF_W/ISO_TILE_HEIGHT anchor used before nano-snap.)
  const py = oy + (footWorldCol + footWorldRow) * HALF_H - HALF_H;

  const bodyH = 28, bodyW = 12, headR = 7;
  const bodyTop = py - bodyH;

  // Drop shadow
  ctx.beginPath();
  ctx.ellipse(px, py, 8, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  // Body
  ctx.fillStyle = '#3a6fd8';
  ctx.fillRect(px - bodyW / 2, bodyTop, bodyW, bodyH);

  // Head
  ctx.beginPath();
  ctx.arc(px, bodyTop - headR, headR, 0, Math.PI * 2);
  ctx.fillStyle = '#e8c9a0';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // Label tag
  if (label) {
    const tagY = bodyTop - headR * 2 - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(px - 16, tagY - 12, 32, 13);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label.slice(0, 5), px, tagY);
  }
}

// ─── Public: single tile render ──────────────────────────────

/**
 * Render one nano tile kind + variant PNG using the actual game engine.
 * Primary tool for per-kind visual validation.
 */
export async function renderNanoTile(
  kind: string,
  opts: {
    variant?: FeatureVariant;
    zOffset?: number;
    connections?: FeatureConnections;
    width?: number;
    height?: number;
    background?: string;
  } = {},
): Promise<CanvasRenderResult> {
  const t0      = Date.now();
  const width   = opts.width  ?? 320;
  const height  = opts.height ?? 320;
  const bg      = opts.background ?? '#0d1117';
  const entry: CanvasSceneEntry = { kind, col: 0, row: 0, ...opts };

  await preloadTextures(collectSvgStrings([entry]));

  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext('2d') as SKRSContext2D;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Centre tile
  const screenX = Math.round(width  / 2 - HALF_W);
  const screenY = Math.round(height / 2 - HALF_H);

  // Ghost footprint diamond
  ctx.beginPath();
  ctx.moveTo(screenX + HALF_W, screenY);
  ctx.lineTo(screenX + ISO_TILE_WIDTH, screenY + HALF_H);
  ctx.lineTo(screenX + HALF_W, screenY + ISO_TILE_HEIGHT);
  ctx.lineTo(screenX, screenY + HALF_H);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (TERRAIN_COLORS[kind]) {
    drawTerrainTile(ctx, 0, 0, kind, screenX + HALF_W, screenY + HALF_H);
  } else {
    const nano = buildNanoTile(entry);
    if (nano) {
      // Pass through drawNanoStack — it dispatches to the correct draw function.
      drawNanoStack(ctx as unknown as CanvasRenderingContext2D, [nano], screenX, screenY);
    }
  }

  return { png: canvas.toBuffer('image/png'), width, height, renderTimeMs: Date.now() - t0 };
}

// ─── Public: scene render ────────────────────────────────────

/**
 * Render a multi-tile scene PNG using the actual game engine draw functions.
 * Painter's order: terrain → negative nanos → flat nanos → positive nanos → players.
 * Pixel-identical to browser output because the engine code is called directly.
 */
export async function renderNanoScene(
  entries: CanvasSceneEntry[],
  opts: CanvasSceneOptions = {},
): Promise<CanvasRenderResult> {
  const t0      = Date.now();
  const width   = opts.width   ?? 900;
  const height  = opts.height  ?? 600;
  const debug          = opts.debug          ?? false;
  const geometryLayers = opts.geometryLayers ?? false;
  const players = opts.players ?? [];
  const bg      = opts.background ?? '#1a1f2b';

  await preloadTextures(collectSvgStrings(entries));

  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext('2d') as SKRSContext2D;
  const nctx   = ctx as unknown as CanvasRenderingContext2D;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const { ox, oy } = computeOrigin(entries, players, width, height);

  // Sort all entries back-to-front by painter's key col+row
  const sorted = [...entries].sort((a, b) => (a.col + a.row) - (b.col + b.row));
  const terrain = sorted.filter(e => TERRAIN_COLORS[e.kind]);
  const nanos   = sorted.filter(e => !TERRAIN_COLORS[e.kind]);

  // ── Pass 1: terrain ──────────────────────────────────────────
  for (const e of terrain) {
    drawTerrainTile(ctx, e.col, e.row, e.kind, ox, oy);
  }

  // ── Pass 2: debug walkability overlay over terrain ───────────
  if (debug) {
    for (const e of terrain) drawDebugDiamond(ctx, e.col, e.row, true, ox, oy);
  }

  // ── Pass 3a: negative + flat nanos ───────────────────────────
  for (const zMode of ['negative', 'flat'] as NanoZMode[]) {
    for (const e of nanos) {
      const zm = NANO_ZMODE[e.kind] ?? 'positive';
      if (zm !== zMode) continue;
      const nano = buildNanoTile(e);
      if (!nano) continue;
      const { screenX, screenY } = tilePos(e.col, e.row, ox, oy);
      if (debug) drawDebugDiamond(ctx, e.col, e.row, NANO_WALKABLE[e.kind] ?? true, ox, oy);
      drawNanoStack(nctx, [nano], screenX, screenY);
    }
  }

  // ── Pass 3b: positive nanos + players — depth-sorted together ──
  // Players get +0.5 so they appear in front of same-depth tile features.
  type DrawItem =
    | { kind: 'nano';   depth: number; entry: CanvasSceneEntry }
    | { kind: 'player'; depth: number; player: CanvasPlayerEntry };

  const positiveNanoEntries = nanos.filter(e => (NANO_ZMODE[e.kind] ?? 'positive') === 'positive');
  const playerDepth = (p: CanvasPlayerEntry): number => {
    // Sort by foot world position so nano-snapped sprites layer correctly.
    if (p.nanoCol !== undefined && p.nanoRow !== undefined) {
      return (p.col + (p.nanoCol + 0.5) / 3) + (p.row + (p.nanoRow + 0.5) / 3);
    }
    return p.col + p.row + 0.5;
  };
  // Iso painter's-algorithm depth for an extruded (positive-z) nano entry.
  //
  // CRITICAL: the wall's extruded geometry occupies the CENTER of its
  // host micro tile (the center row of the 3×3 nano grid for a horizontal
  // straight, the center column for a vertical straight, etc.) — NOT the
  // back corner. Using `col + row` as the sort key was wrong: it placed
  // the wall too far back in the paint order, so a player nano-snapped
  // to an interior-side patch of the SAME micro (e.g. nano (1,0) of the
  // south-wall micro = the north-of-wall patch) ended up with a larger
  // depth and got painted ON TOP of the wall it should be hidden behind.
  //
  // The wall's footprint actually extends through the full micro, so its
  // centroid is at (col+0.5, row+0.5) → depth = col + row + 1. With this
  // key:
  //   * a player on the FAR (back) side of a wall in its own micro
  //     (toward smaller col+row) gets a SMALLER depth → painted first →
  //     wall correctly occludes their lower body.
  //   * a player on the NEAR (front) side of a wall in its own micro
  //     (toward larger col+row) gets a LARGER depth → painted last →
  //     player correctly stands in front of the wall.
  //   * wall-vs-wall and wall-vs-terrain ordering is preserved (the
  //     +1 shift is uniform across all positive nanos).
  const nanoDepth = (e: CanvasSceneEntry): number => e.col + e.row + 1;
  const drawItems: DrawItem[] = [
    ...positiveNanoEntries.map(e  => ({ kind: 'nano'   as const, depth: nanoDepth(e),    entry: e  })),
    ...players.map(            p  => ({ kind: 'player' as const, depth: playerDepth(p), player: p })),
  ].sort((a, b) => a.depth - b.depth);

  for (const item of drawItems) {
    if (item.kind === 'nano') {
      const nano = buildNanoTile(item.entry);
      if (!nano) continue;
      const { screenX, screenY } = tilePos(item.entry.col, item.entry.row, ox, oy);
      if (debug) drawDebugDiamond(ctx, item.entry.col, item.entry.row, NANO_WALKABLE[item.entry.kind] ?? true, ox, oy);
      const nb = computeWallNeighbors(item.entry, entries);
      drawNanoStack(nctx, [nano], screenX, screenY, undefined, nb);
    } else {
      drawPlayerSprite(ctx, item.player.col, item.player.row, item.player.label, ox, oy, item.player.nanoCol, item.player.nanoRow);
    }
  }

  // ── Pass 4: world-geometry layer overlay (chunk → micro → nano → wall-rect) ──
  if (geometryLayers) {
    drawGeometryLayers(ctx, entries, ox, oy);
  }

  return { png: canvas.toBuffer('image/png'), width, height, renderTimeMs: Date.now() - t0 };
}

// ─── Utility ──────────────────────────────────────────────────

/**
 * Inspect the 4 cardinal neighbor cells of `entry` in the scene `entries`
 * and report whether each contains an EXTRUDED wall (any variant).
 * Used to suppress end-cap ticks at tile boundaries where the wall continues.
 */
function computeWallNeighbors(
  entry: CanvasSceneEntry,
  entries: readonly CanvasSceneEntry[],
): { n: boolean; s: boolean; e: boolean; w: boolean } {
  const has = (col: number, row: number): boolean =>
    entries.some(e => e.col === col && e.row === row && EXTRUDED_KINDS.has(e.kind));
  return {
    n: has(entry.col,     entry.row - 1),
    s: has(entry.col,     entry.row + 1),
    e: has(entry.col + 1, entry.row),
    w: has(entry.col - 1, entry.row),
  };
}

// ─── Geometry-layer debug overlay ─────────────────────────────

/**
 * World (col,row, possibly fractional) → screen (px,py).
 * Mirrors the isometric projection used by tilePos() / drawPlayerSprite().
 */
function worldToScreen(wc: number, wr: number, ox: number, oy: number): { x: number; y: number } {
  return {
    x: ox + (wc - wr) * HALF_W,
    y: oy + (wc + wr) * HALF_H - HALF_H,
  };
}

/** Stroke a 4-corner iso quad (corners in [W,N,E,S] or any closed order). */
function strokeIsoQuad(
  ctx: SKRSContext2D,
  pts: ReadonlyArray<{ x: number; y: number }>,
  color: string,
  lineWidth: number,
  dash?: number[],
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dash) (ctx as unknown as CanvasRenderingContext2D).setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** Build the 4 iso-diamond corners (W,N,E,S) for a world rect [c0..c1] × [r0..r1]. */
function isoDiamondCorners(
  c0: number, r0: number, c1: number, r1: number,
  ox: number, oy: number,
): Array<{ x: number; y: number }> {
  return [
    worldToScreen(c0, r1, ox, oy), // W
    worldToScreen(c0, r0, ox, oy), // N
    worldToScreen(c1, r0, ox, oy), // E
    worldToScreen(c1, r1, ox, oy), // S
  ];
}

/** Label helper with semi-opaque pill background for readability. */
function drawLayerLabel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  fontPx = 11,
): void {
  ctx.save();
  ctx.font = `bold ${fontPx}px sans-serif`;
  const metrics = ctx.measureText(text);
  const padX = 4;
  const padY = 2;
  const w = metrics.width + padX * 2;
  const h = fontPx + padY * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = color;
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x + padX, y - padY);
  ctx.restore();
}

/**
 * Overlay every world-geometry tier the engine actually uses, biggest → smallest.
 *
 * Canonical hierarchy (Docs/WorldEngine-01-SpatialHierarchy.md):
 *   L2  MACRO TILE       — 5×5 World Unit Tiles  (= 25×25 micro tiles)  cyan, very thick
 *   L1  WORLD UNIT TILE  — 5×5 Micro Tiles                              lime, thick
 *   L0  MICRO TILE       — 1 iso diamond                                yellow
 *   L0.5 NANO TILE       — 3×3 sub-grid OVERLAY of one Micro            magenta dashed
 *
 * Wall footprint rects (orange) are drawn on top as a render-pipeline aid
 * — they are NOT a spatial tier; they are solver output for the L0.5 wall
 * nano kind.
 */
function drawGeometryLayers(
  ctx: SKRSContext2D,
  entries: readonly CanvasSceneEntry[],
  ox: number,
  oy: number,
): void {
  if (entries.length === 0) return;

  const cols = entries.map(e => e.col);
  const rows = entries.map(e => e.row);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);

  // Bright distinct colors, biggest tier → smallest.
  const COLOR_MACRO = '#00e5ff'; // cyan      L2
  const COLOR_WORLD = '#7cff3f'; // lime      L1
  const COLOR_MICRO = '#ffd400'; // yellow    L0
  const COLOR_NANO  = '#ff3df0'; // magenta   L0.5
  const COLOR_WALL  = '#ff8a00'; // orange    (wall solver footprint, not a tier)

  // ── L2: MACRO TILE boundaries ────────────────────────────────
  // A macro spans MACRO_UNIT_TILES × WORLD_UNIT_TILES micros per side.
  const MACRO_MICROS = MACRO_UNIT_TILES * WORLD_UNIT_TILES;
  const macroColMin = Math.floor(minCol / MACRO_MICROS);
  const macroColMax = Math.floor(maxCol / MACRO_MICROS);
  const macroRowMin = Math.floor(minRow / MACRO_MICROS);
  const macroRowMax = Math.floor(maxRow / MACRO_MICROS);
  for (let my = macroRowMin; my <= macroRowMax; my++) {
    for (let mx = macroColMin; mx <= macroColMax; mx++) {
      const c0 = mx * MACRO_MICROS;
      const r0 = my * MACRO_MICROS;
      const c1 = c0 + MACRO_MICROS;
      const r1 = r0 + MACRO_MICROS;
      strokeIsoQuad(ctx, isoDiamondCorners(c0, r0, c1, r1, ox, oy), COLOR_MACRO, 4);
      const N = worldToScreen(c0, r0, ox, oy);
      // L2 label sits ABOVE the L1 label at the same vertex.
      drawLayerLabel(ctx, N.x + 6, N.y - 22, `L2 MACRO ${mx},${my}`, COLOR_MACRO, 14);
    }
  }

  // ── L1: WORLD UNIT TILE boundaries ───────────────────────────
  const wuColMin = Math.floor(minCol / WORLD_UNIT_TILES);
  const wuColMax = Math.floor(maxCol / WORLD_UNIT_TILES);
  const wuRowMin = Math.floor(minRow / WORLD_UNIT_TILES);
  const wuRowMax = Math.floor(maxRow / WORLD_UNIT_TILES);
  for (let wy = wuRowMin; wy <= wuRowMax; wy++) {
    for (let wx = wuColMin; wx <= wuColMax; wx++) {
      const c0 = wx * WORLD_UNIT_TILES;
      const r0 = wy * WORLD_UNIT_TILES;
      const c1 = c0 + WORLD_UNIT_TILES;
      const r1 = r0 + WORLD_UNIT_TILES;
      strokeIsoQuad(ctx, isoDiamondCorners(c0, r0, c1, r1, ox, oy), COLOR_WORLD, 2.5);
      const N = worldToScreen(c0, r0, ox, oy);
      drawLayerLabel(ctx, N.x + 4, N.y - 2, `L1 WU ${wx},${wy}`, COLOR_WORLD, 12);
    }
  }

  // ── L0: MICRO TILE diamonds + L0.5 NANO 3×3 sub-grid ─────────
  for (const e of entries) {
    const c = e.col;
    const r = e.row;
    strokeIsoQuad(ctx, isoDiamondCorners(c, r, c + 1, r + 1, ox, oy), COLOR_MICRO, 1.25);

    // L0.5 nano grid
    for (let nr = 0; nr < NANO_GRID; nr++) {
      for (let nc = 0; nc < NANO_GRID; nc++) {
        const fc0 = c + nc / NANO_GRID;
        const fr0 = r + nr / NANO_GRID;
        const fc1 = c + (nc + 1) / NANO_GRID;
        const fr1 = r + (nr + 1) / NANO_GRID;
        strokeIsoQuad(ctx, isoDiamondCorners(fc0, fr0, fc1, fr1, ox, oy), COLOR_NANO, 0.6, [3, 2]);
      }
    }

    // Wall solver footprint (NOT a spatial tier — solver output for the L0.5 wall kind)
    if (e.variant && EXTRUDED_KINDS.has(e.kind)) {
      const { rects } = wallBounds(e.variant);
      for (const rect of rects) {
        const fx0 = c + rect.x / MICRO_TILE_SIZE;
        const fy0 = r + rect.y / MICRO_TILE_SIZE;
        const fx1 = c + (rect.x + rect.w) / MICRO_TILE_SIZE;
        const fy1 = r + (rect.y + rect.h) / MICRO_TILE_SIZE;
        strokeIsoQuad(ctx, isoDiamondCorners(fx0, fy0, fx1, fy1, ox, oy), COLOR_WALL, 1.4);
      }
    }
  }

  // Per-tile micro labels (drawn after grid so they sit on top).
  for (const e of entries) {
    const N = worldToScreen(e.col, e.row, ox, oy);
    drawLayerLabel(ctx, N.x + 2, N.y + 16, `L0 m ${e.col},${e.row}`, COLOR_MICRO, 9);
  }

  // ── Schematic inset: L2 → L1 → L0 → L0.5 nesting at proportional scale ──
  // Drawn in the bottom-right corner. The actual L2 iso footprint is too
  // large (25 micros = ~6400px wide) to fit alongside a useful L0/L0.5
  // view, so we show their proportional nesting as a flat schematic.
  drawHierarchyInset(ctx, COLOR_MACRO, COLOR_WORLD, COLOR_MICRO, COLOR_NANO);

  // ── Legend (top-left, opaque box, large font) ────────────────
  // Note: @napi-rs/canvas collapses multi-space runs in fillText, so we
  // use a single space between the tier label and its description and
  // size the box from explicit measurements per-row.
  const legend: Array<[string, string]> = [
    [COLOR_MACRO, `L2 MACRO TILE \u2014 ${MACRO_UNIT_TILES}\u00d7${MACRO_UNIT_TILES} World Units (= ${MACRO_MICROS}\u00d7${MACRO_MICROS} micros)`],
    [COLOR_WORLD, `L1 WORLD UNIT TILE \u2014 ${WORLD_UNIT_TILES}\u00d7${WORLD_UNIT_TILES} Micro Tiles`],
    [COLOR_MICRO, `L0 MICRO TILE \u2014 atomic cell (1 iso diamond, ${MICRO_TILE_SIZE}px world)`],
    [COLOR_NANO,  `L0.5 NANO TILE \u2014 ${NANO_GRID}\u00d7${NANO_GRID} sub-grid OVERLAY of a Micro`],
    [COLOR_WALL,  'wall solver footprint (not a tier \u2014 L0.5 wall geometry)'],
  ];
  ctx.save();
  const padX = 14, padY = 12;
  const lh = 24;
  const fontPx = 14;
  ctx.font = `bold ${fontPx}px sans-serif`;
  let maxTextW = 0;
  for (const [, label] of legend) {
    maxTextW = Math.max(maxTextW, ctx.measureText(label).width);
  }
  const swatchW = 26, swatchGap = 12;
  // Clamp to a generous minimum to defend against measureText under-reporting
  // on @napi-rs/canvas when fonts are not embedded.
  const safeTextW = Math.max(maxTextW, 540);
  const boxW = padX * 2 + swatchW + swatchGap + safeTextW;
  const boxH = padY * 2 + lh * legend.length;
  const boxX = 18;
  const boxY = 36; // leave room above for the title strip
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, boxH - 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let i = 0; i < legend.length; i++) {
    const [color, label] = legend[i];
    const y = boxY + padY + lh / 2 + i * lh;
    ctx.fillStyle = color;
    ctx.fillRect(boxX + padX, y - 7, swatchW, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, boxX + padX + swatchW + swatchGap, y);
  }
  // Title strip above the box.
  ctx.fillStyle = COLOR_MACRO;
  ctx.font = 'bold 14px sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText('WORLD ENGINE \u2014 SPATIAL HIERARCHY (biggest \u2192 smallest)', boxX, boxY - 4);
  ctx.restore();
}

// ─── Hierarchy inset schematic ─────────────────────────────────

/**
 * Bottom-right inset diagram showing the four-tier nesting at
 * proportional scale: an L2 macro (5×5 grid of L1 World Units),
 * one of those L1 cells expanded into a 5×5 grid of L0 Micro Tiles,
 * and one of those L0 cells expanded into a 3×3 grid of L0.5 Nano patches.
 *
 * This is a flat (non-iso) schematic — its purpose is to make the
 * tier relationships unambiguous, not to replicate iso geometry.
 */
function drawHierarchyInset(
  ctx: SKRSContext2D,
  colorMacro: string,
  colorWorld: string,
  colorMicro: string,
  colorNano: string,
): void {
  ctx.save();
  const canvas = ctx.canvas as unknown as { width: number; height: number };
  const cellPx = 16; // L0 micro cell size in the inset
  const wuPx   = cellPx * WORLD_UNIT_TILES;             // 80px per L1
  const macroPx = wuPx * MACRO_UNIT_TILES;              // 400px per L2

  // Position the inset in the bottom-right with margin for the nano callout
  // on the LEFT side and the textual annotations BELOW.
  const margin = 24;
  const annotationH = 100;
  const x0 = canvas.width  - macroPx - margin;
  const y0 = canvas.height - macroPx - margin - annotationH;

  // Title above the inset.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Hierarchy (proportional schematic)', x0, y0 - 8);

  // L2: outer cyan box (the full macro tile).
  ctx.fillStyle = 'rgba(0,229,255,0.06)';
  ctx.fillRect(x0, y0, macroPx, macroPx);
  ctx.strokeStyle = colorMacro;
  ctx.lineWidth = 4;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, macroPx - 1, macroPx - 1);

  // L1 grid INSIDE L2 (lime). Skip i=0 and i=MACRO_UNIT_TILES so the cyan
  // L2 border drawn above is not painted over.
  ctx.strokeStyle = colorWorld;
  ctx.lineWidth = 2;
  for (let i = 1; i < MACRO_UNIT_TILES; i++) {
    ctx.beginPath();
    ctx.moveTo(x0 + i * wuPx + 0.5, y0);
    ctx.lineTo(x0 + i * wuPx + 0.5, y0 + macroPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0,             y0 + i * wuPx + 0.5);
    ctx.lineTo(x0 + macroPx,   y0 + i * wuPx + 0.5);
    ctx.stroke();
  }
  // Re-stroke the L2 outer border to guarantee it sits ON TOP of the lime grid.
  ctx.strokeStyle = colorMacro;
  ctx.lineWidth = 4;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, macroPx - 1, macroPx - 1);

  // Highlight one L1 cell (centre) and expand it: draw L0 micro grid (yellow).
  const wuX = 2, wuY = 2;
  const wuLeft = x0 + wuX * wuPx;
  const wuTop  = y0 + wuY * wuPx;
  ctx.fillStyle = 'rgba(124,255,63,0.18)';
  ctx.fillRect(wuLeft, wuTop, wuPx, wuPx);
  ctx.strokeStyle = colorMicro;
  ctx.lineWidth = 1;
  for (let i = 0; i <= WORLD_UNIT_TILES; i++) {
    ctx.beginPath();
    ctx.moveTo(wuLeft + i * cellPx + 0.5, wuTop);
    ctx.lineTo(wuLeft + i * cellPx + 0.5, wuTop + wuPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wuLeft,         wuTop + i * cellPx + 0.5);
    ctx.lineTo(wuLeft + wuPx,  wuTop + i * cellPx + 0.5);
    ctx.stroke();
  }

  // Highlight one L0 cell inside the highlighted L1 and explode it
  // into the 3×3 nano grid (magenta) with a callout box to the side.
  const microX = 2, microY = 2;
  const microLeft = wuLeft + microX * cellPx;
  const microTop  = wuTop  + microY * cellPx;
  ctx.fillStyle = 'rgba(255,212,0,0.35)';
  ctx.fillRect(microLeft, microTop, cellPx, cellPx);
  ctx.strokeStyle = colorMicro;
  ctx.lineWidth = 2;
  ctx.strokeRect(microLeft + 0.5, microTop + 0.5, cellPx - 1, cellPx - 1);

  // Nano callout box: a 3×3 grid blown up to 90×90 to the LEFT of the macro.
  const nanoBigPx = 30; // each nano patch in callout
  const nanoBoxSize = nanoBigPx * NANO_GRID; // 90
  const nanoBoxX = x0 - nanoBoxSize - 30;
  const nanoBoxY = y0 + macroPx - nanoBoxSize;
  // Connector line from highlighted L0 cell to nano callout box.
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(microLeft, microTop + cellPx / 2);
  ctx.lineTo(nanoBoxX + nanoBoxSize, nanoBoxY + nanoBoxSize / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Nano grid cells (3×3) with patch labels.
  ctx.fillStyle = 'rgba(255,61,240,0.10)';
  ctx.fillRect(nanoBoxX, nanoBoxY, nanoBoxSize, nanoBoxSize);
  ctx.strokeStyle = colorNano;
  ctx.lineWidth = 2;
  for (let i = 0; i <= NANO_GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(nanoBoxX + i * nanoBigPx + 0.5, nanoBoxY);
    ctx.lineTo(nanoBoxX + i * nanoBigPx + 0.5, nanoBoxY + nanoBoxSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nanoBoxX,                 nanoBoxY + i * nanoBigPx + 0.5);
    ctx.lineTo(nanoBoxX + nanoBoxSize,   nanoBoxY + i * nanoBigPx + 0.5);
    ctx.stroke();
  }
  // Label nano patches NW/N/NE/W/C/E/SW/S/SE.
  const patchLabels = ['NW','N','NE','W','C','E','SW','S','SE'];
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = colorNano;
  for (let nr = 0; nr < NANO_GRID; nr++) {
    for (let nc = 0; nc < NANO_GRID; nc++) {
      const cx = nanoBoxX + nc * nanoBigPx + nanoBigPx / 2;
      const cy = nanoBoxY + nr * nanoBigPx + nanoBigPx / 2;
      ctx.fillText(patchLabels[nr * NANO_GRID + nc], cx, cy);
    }
  }
  ctx.textAlign = 'left';

  // Tier annotations BELOW the inset (two columns, fits inside canvas).
  const ax = x0;
  const ay = y0 + macroPx + 12;
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillStyle = colorMacro; ctx.fillText(`L2  Macro Tile`,                 ax,         ay);
  ctx.fillStyle = '#ffffff';   ctx.fillText(`= ${MACRO_UNIT_TILES}\u00d7${MACRO_UNIT_TILES} World Units (= ${MACRO_UNIT_TILES * WORLD_UNIT_TILES}\u00d7${MACRO_UNIT_TILES * WORLD_UNIT_TILES} Micros)`, ax + 130, ay);
  ctx.fillStyle = colorWorld; ctx.fillText(`L1  World Unit Tile`,            ax,         ay + 20);
  ctx.fillStyle = '#ffffff';   ctx.fillText(`= ${WORLD_UNIT_TILES}\u00d7${WORLD_UNIT_TILES} Micro Tiles`,                 ax + 160, ay + 20);
  ctx.fillStyle = colorMicro; ctx.fillText(`L0  Micro Tile`,                 ax,         ay + 40);
  ctx.fillStyle = '#ffffff';   ctx.fillText(`= atomic cell (1 iso diamond)`,                                     ax + 130, ay + 40);
  ctx.fillStyle = colorNano;  ctx.fillText(`L0.5 Nano Tile`,                 ax,         ay + 60);
  ctx.fillStyle = '#ffffff';   ctx.fillText(`= ${NANO_GRID}\u00d7${NANO_GRID} sub-grid OVERLAY of one Micro`,    ax + 130, ay + 60);

  ctx.restore();
}

function variantToConnections(variant: FeatureVariant): FeatureConnections {
  switch (variant) {
    case 'straight-h': return { top: false, right: true,  bottom: false, left: true  };
    case 'straight-v': return { top: true,  right: false, bottom: true,  left: false };
    case 'cross':      return { top: true,  right: true,  bottom: true,  left: true  };
    case 'end-r':      return { top: false, right: true,  bottom: false, left: false };
    case 'end-l':      return { top: false, right: false, bottom: false, left: true  };
    case 'end-t':      return { top: true,  right: false, bottom: false, left: false };
    case 'end-b':      return { top: false, right: false, bottom: true,  left: false };
    case 'corner-tr':  return { top: true,  right: true,  bottom: false, left: false };
    case 'corner-tl':  return { top: true,  right: false, bottom: false, left: true  };
    case 'corner-br':  return { top: false, right: true,  bottom: true,  left: false };
    case 'corner-bl':  return { top: false, right: false, bottom: true,  left: true  };
    case 'tee-t':      return { top: true,  right: true,  bottom: false, left: true  };
    case 'tee-r':      return { top: true,  right: true,  bottom: true,  left: false };
    case 'tee-b':      return { top: false, right: true,  bottom: true,  left: true  };
    case 'tee-l':      return { top: true,  right: false, bottom: true,  left: true  };
    default:           return { top: true,  right: true,  bottom: true,  left: true  };
  }
}
