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
import { getVariantSvg, stoneWallTopSvg, woodenFenceSvg, wallBounds } from '../src/solver.js';

// Single glue point: inject napi-canvas Image into engine SVG cache
import { injectSvgImage } from '../src/tile.js';

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  CHUNK_TILES,
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
  'stone-wall':     3.5,
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
  /** Raw SVG override — skips getVariantSvg lookup */
  svgOverride?: string;
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
      const top  = stoneWallTopSvg(variant);
      if (side) out.add(side);
      if (top)  out.add(top);
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
    const topSvg  = stoneWallTopSvg(variant);
    return {
      kind, zOffset, zMode, walkable, blendEdges: false,
      svg:            sideSvg,
      sideTextureSvg: sideSvg,
      topTextureSvg:  topSvg,
      variant,
      connections: conn,
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
  const drawItems: DrawItem[] = [
    ...positiveNanoEntries.map(e  => ({ kind: 'nano'   as const, depth: e.col + e.row,       entry: e  })),
    ...players.map(            p  => ({ kind: 'player' as const, depth: playerDepth(p),      player: p })),
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

/** Label helper with semi-opaque pill background for readability. */
function drawLayerLabel(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
  fontPx = 10,
): void {
  ctx.save();
  ctx.font = `bold ${fontPx}px sans-serif`;
  const metrics = ctx.measureText(text);
  const padX = 3;
  const padY = 2;
  const w = metrics.width + padX * 2;
  const h = fontPx + padY * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = color;
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x + padX, y - padY);
  ctx.restore();
}

/**
 * Overlay every world-geometry tier the engine actually uses, biggest → smallest:
 *   1. CHUNK boundary (5×5 micro tiles)        — cyan, thick
 *   2. MICRO TILE diamond (1 ISO_TILE)          — yellow
 *   3. NANO sub-cell (1/9 of micro, 3×3 grid)   — magenta, thin
 *   4. WALL FOOTPRINT rect (per solver.wallBounds, central 48/128 + arms) — orange
 * Plus a legend pinned to the top-left of the canvas.
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

  const COLOR_CHUNK = '#00e5ff'; // cyan
  const COLOR_MICRO = '#ffd400'; // yellow
  const COLOR_NANO  = '#ff3df0'; // magenta
  const COLOR_WALL  = '#ff8a00'; // orange

  // ── 1. CHUNK boundaries (CHUNK_TILES × CHUNK_TILES micro tiles) ──
  const chunkColMin = Math.floor(minCol / CHUNK_TILES);
  const chunkColMax = Math.floor(maxCol / CHUNK_TILES);
  const chunkRowMin = Math.floor(minRow / CHUNK_TILES);
  const chunkRowMax = Math.floor(maxRow / CHUNK_TILES);
  for (let cy = chunkRowMin; cy <= chunkRowMax; cy++) {
    for (let cx = chunkColMin; cx <= chunkColMax; cx++) {
      const c0 = cx * CHUNK_TILES;
      const r0 = cy * CHUNK_TILES;
      const c1 = c0 + CHUNK_TILES;
      const r1 = r0 + CHUNK_TILES;
      const W = worldToScreen(c0, r1, ox, oy);  // west vertex
      const N = worldToScreen(c0, r0, ox, oy);  // north vertex
      const E = worldToScreen(c1, r0, ox, oy);  // east vertex
      const S = worldToScreen(c1, r1, ox, oy);  // south vertex
      strokeIsoQuad(ctx, [W, N, E, S], COLOR_CHUNK, 3);
      drawLayerLabel(ctx, N.x + 4, N.y - 2, `CHUNK ${cx},${cy}`, COLOR_CHUNK, 11);
    }
  }

  // ── 2. MICRO TILE diamonds + 3. NANO sub-cells ──
  for (const e of entries) {
    const c = e.col;
    const r = e.row;
    // Micro diamond corners.
    const W = worldToScreen(c,     r + 1, ox, oy);
    const N = worldToScreen(c,     r,     ox, oy);
    const E = worldToScreen(c + 1, r,     ox, oy);
    const S = worldToScreen(c + 1, r + 1, ox, oy);
    strokeIsoQuad(ctx, [W, N, E, S], COLOR_MICRO, 1.25);

    // 3×3 nano grid (each sub-diamond is 1/9 of micro)
    for (let nr = 0; nr < 3; nr++) {
      for (let nc = 0; nc < 3; nc++) {
        const fc0 = c + nc / 3;
        const fr0 = r + nr / 3;
        const fc1 = c + (nc + 1) / 3;
        const fr1 = r + (nr + 1) / 3;
        const w = worldToScreen(fc0, fr1, ox, oy);
        const n = worldToScreen(fc0, fr0, ox, oy);
        const ee = worldToScreen(fc1, fr0, ox, oy);
        const s = worldToScreen(fc1, fr1, ox, oy);
        strokeIsoQuad(ctx, [w, n, ee, s], COLOR_NANO, 0.6, [3, 2]);
      }
    }

    // ── 4. WALL FOOTPRINT rects (only for wall-bearing entries) ──
    if (e.variant && EXTRUDED_KINDS.has(e.kind)) {
      const { rects } = wallBounds(e.variant);
      for (const rect of rects) {
        // wallBounds is in micro-tile pixel space [0..MICRO_TILE_SIZE]² →
        // convert to fractional col/row inside the tile.
        const fx0 = c + rect.x / MICRO_TILE_SIZE;
        const fy0 = r + rect.y / MICRO_TILE_SIZE;
        const fx1 = c + (rect.x + rect.w) / MICRO_TILE_SIZE;
        const fy1 = r + (rect.y + rect.h) / MICRO_TILE_SIZE;
        const wp = worldToScreen(fx0, fy1, ox, oy);
        const np = worldToScreen(fx0, fy0, ox, oy);
        const ep = worldToScreen(fx1, fy0, ox, oy);
        const sp = worldToScreen(fx1, fy1, ox, oy);
        strokeIsoQuad(ctx, [wp, np, ep, sp], COLOR_WALL, 1.4);
      }
    }
  }

  // Per-tile micro labels (drawn after grid so they sit on top).
  for (const e of entries) {
    const N = worldToScreen(e.col, e.row, ox, oy);
    drawLayerLabel(ctx, N.x + 2, N.y + 14, `m ${e.col},${e.row}`, COLOR_MICRO, 9);
  }

  // ── Legend (top-left) ──
  ctx.save();
  const legendX = 12;
  const legendY = 14;
  const lh = 16;
  const legend: Array<[string, string]> = [
    [COLOR_CHUNK, `CHUNK   (${CHUNK_TILES}\u00d7${CHUNK_TILES} micro tiles)`],
    [COLOR_MICRO, `MICRO   (1 iso tile = ${MICRO_TILE_SIZE}px world)`],
    [COLOR_NANO,  'NANO    (1/9 of micro = 3\u00d73 grid)'],
    [COLOR_WALL,  'WALL    (solver wallBounds rect)'],
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(legendX - 6, legendY - 12, 260, lh * legend.length + 10);
  ctx.font = 'bold 11px sans-serif';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < legend.length; i++) {
    const [color, label] = legend[i];
    const y = legendY + i * lh;
    ctx.fillStyle = color;
    ctx.fillRect(legendX, y - 4, 14, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, legendX + 22, y);
  }
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
