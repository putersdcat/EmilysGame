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
import { getVariantSvg, stoneWallTopSvg, woodenFenceSvg } from '../src/solver.js';

// Single glue point: inject napi-canvas Image into engine SVG cache
import { injectSvgImage } from '../src/tile.js';

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
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
  // drawH = zOffset * 12.  stone-wall: height = depth = WALL_THICKNESS*0.5 = 48*0.5 = 24px → zOffset=2
  'stone-wall':     2,
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

export interface CanvasPlayerEntry {
  col: number;
  row: number;
  label?: string;
}

export interface CanvasSceneOptions {
  width?: number;
  height?: number;
  debug?: boolean;
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

function drawPlayerSprite(ctx: SKRSContext2D, col: number, row: number, label: string | undefined, ox: number, oy: number): void {
  const { screenX: sx, screenY: sy } = tilePos(col, row, ox, oy);
  // Anchor at bottom vertex of diamond
  const px = sx + HALF_W;
  const py = sy + ISO_TILE_HEIGHT;

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
  const debug   = opts.debug   ?? false;
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
  const drawItems: DrawItem[] = [
    ...positiveNanoEntries.map(e  => ({ kind: 'nano'   as const, depth: e.col + e.row,       entry: e  })),
    ...players.map(            p  => ({ kind: 'player' as const, depth: p.col + p.row + 0.5, player: p })),
  ].sort((a, b) => a.depth - b.depth);

  for (const item of drawItems) {
    if (item.kind === 'nano') {
      const nano = buildNanoTile(item.entry);
      if (!nano) continue;
      const { screenX, screenY } = tilePos(item.entry.col, item.entry.row, ox, oy);
      if (debug) drawDebugDiamond(ctx, item.entry.col, item.entry.row, NANO_WALKABLE[item.entry.kind] ?? true, ox, oy);
      drawNanoStack(nctx, [nano], screenX, screenY);
    } else {
      drawPlayerSprite(ctx, item.player.col, item.player.row, item.player.label, ox, oy);
    }
  }

  return { png: canvas.toBuffer('image/png'), width, height, renderTimeMs: Date.now() - t0 };
}

// ─── Utility ──────────────────────────────────────────────────

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
