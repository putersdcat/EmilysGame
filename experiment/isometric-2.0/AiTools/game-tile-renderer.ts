/**
 * game-tile-renderer.ts — AiTools bridge to game engine SVG generators.
 *
 * ARCHITECTURE: This file is the canonical link between the game engine and AiTools.
 * It imports directly from the game src/ to generate tile SVGs using the SAME code
 * path the browser game uses, then wraps them in the correct isometric transforms
 * for rasterization via resvg.
 *
 * Supported kinds → render pathway:
 *
 *   stone-wall, cathedral-wall, homestead-wall   → buildExtrudedSvg()
 *     → 3-face SVG box (FRONT + CAP + TOP) replicating drawExtrudedNano() math
 *
 *   fence, gate, troll-bridge                    → buildBillboardSvg()
 *     → Z-pinned standing billboard wrapping the solver SVG
 *
 *   river, river-bank, bridge                    → buildNegativeSvg()
 *     → negative-Z iso flat projection (sunken)
 *
 *   tall-grass                                   → buildFlatNanoSvg()
 *     → flat iso overlay (semi-transparent)
 *
 * The extrusion geometry in buildExtrudedSvg() mirrors drawExtrudedNano() in
 * nano-tile.ts exactly — using identical matrix math and shouldDrawEndCap() from
 * the exported game source, so future geometry changes in the game auto-apply here.
 *
 * Usage (from MCP tool):
 *   const result = renderGameTile({ kind: 'stone-wall', variant: 'end-r', zOffset: 3 });
 *   // result.png is a Buffer ready for base64 encoding → MCP image response
 *
 * TODO: DOC — extend for animated tiles, custom assembly scenes
 */

import { getVariantSvg, woodenFenceSvg, stoneWallTopSvg, wallBounds, stoneWallSvg } from '../src/solver.js';
import type { FeatureVariant, FeatureConnections, NanoTileKind } from '../src/types.js';
import { renderSvg, type RenderResult } from './svg-renderer-tool.js';

// ─── Game engine constants ────────────────────────────────────
// Keep in sync with: nano-tile.ts (NANO_Z_SCALE, MIN_NANO_HEIGHT, WALL_OFFSET, WALL_THICKNESS)
// and tile.ts / chunk.ts (MICRO_TILE_SIZE, HALF_W, HALF_H).
const MICRO_TILE_SIZE = 128;
const HALF_W = 128;
const HALF_H = 64;
const WALL_OFFSET = 40;
const WALL_THICKNESS = 48;
/** Matches nano-tile.ts NANO_Z_SCALE. Keep in sync. */
const NANO_Z_SCALE = 12;
const MIN_NANO_HEIGHT = 16;

// ─── Helpers: mirrored from nano-tile.ts (keep in sync) ──────
// These are re-implemented here (not imported) because nano-tile.ts has
// Canvas 2D / browser deps that can't run in Node. The logic must stay
// identical — if you change nano-tile.ts, update these too.

/**
 * Returns true when the given variant needs a visible end cap.
 * MIRROR OF: nano-tile.ts shouldDrawEndCap() (exported from there for Canvas path).
 */
function shouldDrawEndCap(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'end-t': case 'end-r': case 'end-b': case 'end-l':
    case 'isolated':
    case 'corner-tl': case 'corner-tr': case 'corner-bl': case 'corner-br':
    case 'tee-t': case 'tee-r': case 'tee-b': case 'tee-l':
      return true;
    default:
      return false; // straight-h, straight-v, cross → no exposed terminus
  }
}

/**
 * Returns true when the variant runs along the vertical (/ on screen) axis.
 * MIRROR OF: nano-tile.ts isVerticalWall() (exported from there for Canvas path).
 */
function isVerticalWall(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-v':
    case 'end-t': case 'end-b':
    case 'corner-tr': case 'corner-br':
    case 'tee-r': case 'tee-l':
      return true;
    default:
      return false;
  }
}

// ─── Canvas dimensions for game tile renders ──────────────────
const TILE_CANVAS_W = 320;
const TILE_CANVAS_H = 320;
// Tile screen position: tile left vertex at (screenX, screenY + HALF_H)
const SCREEN_X = (TILE_CANVAS_W / 2) - HALF_W; // 32  — centered, tile left ver = 32
const SCREEN_Y = 150;                            // tile top diamond = (160, 150)
// Top of wall at max zOffset=8: SCREEN_Y - 8*NANO_Z_SCALE = 150-96=54 → fits in 320

// ─── Helpers ──────────────────────────────────────────────────

/** Encode an SVG string as a base64 data URI for use in <image href="...">. */
function svgToDataUri(svg: string): string {
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

/** Default fully-connected FeatureConnections (all sides connected). */
const ALL_CONNECTED: FeatureConnections = { top: true, right: true, bottom: true, left: true };
/** No connections (isolated). */
const NONE_CONNECTED: FeatureConnections = { top: false, right: false, bottom: false, left: false };

// ─── Extrusion SVG (stone-wall, cathedral-wall, homestead-wall) ───────────────

/**
 * Build a 3-face extruded SVG that exactly replicates drawExtrudedNano().
 *
 * The three faces (FRONT, CAP, TOP) use the same matrix(a,b,c,d,e,f) values as
 * ctx.translate(e,f) + ctx.transform(a,b,c,d,0,0) + ctx.drawImage(img, 0, -drawH, w, h)
 * in the Canvas 2D path, since SVG matrix() is identical to Canvas setTransform().
 *
 * The solver SVG textures (stoneWallSvg, stoneWallTopSvg) are embedded as
 * base64 data URIs in <image> elements, so resvg rasterizes them at the
 * correct geometry without any Canvas API dependency.
 *
 * Face draw order mirrors drawExtrudedNano():  CAP → FRONT → TOP
 *
 * @param sideSvg  - 128×128 SVG for FRONT + CAP faces (from stoneWallSvg / getVariantSvg)
 * @param topSvg   - 128×128 SVG for TOP face (from stoneWallTopSvg)
 * @param variant  - feature variant (used for cap/orientation logic)
 * @param zOffset  - Z height (matched to game NANO_Z_SCALE)
 * @param sX       - screen X offset for tile placement in output canvas
 * @param sY       - screen Y offset for tile placement in output canvas
 * @param canvasW  - output SVG canvas width
 * @param canvasH  - output SVG canvas height
 * @param background - background color string
 */
function buildExtrudedSvg(
  sideSvg: string,
  topSvg: string,
  variant: FeatureVariant,
  zOffset: number,
  sX: number,
  sY: number,
  canvasW: number,
  canvasH: number,
  background: string = 'transparent',
): string {
  const drawH = Math.max(zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  const sideHref = svgToDataUri(sideSvg);
  const topHref  = svgToDataUri(topSvg);
  const NE = WALL_OFFSET + WALL_THICKNESS; // = 88

  const vertical = isVerticalWall(variant);
  const hasCap   = shouldDrawEndCap(variant);

  // ── Per-orientation anchor points ────────────────────────────────────────────
  // Mirrors the anchor computation in drawExtrudedNano() exactly:
  //   HORIZONTAL (\ on screen): strip y=40..88
  //     frontX = sX + HALF_W - NE (= sX+40),  frontY = sY + NE/2 (= sY+44)
  //     capX   = sX + HALF_W + 128 - OFFSET (= sX+216), capY = sY + (128+40)/2 (= sY+84)
  //   VERTICAL (/ on screen): strip x=40..88
  //     frontX = sX + HALF_W + NE (= sX+216), frontY = sY + NE/2 (= sY+44)
  //     capX   = sX + HALF_W + OFFSET - 128 (= sX+40),  capY = sY + (40+128)/2 (= sY+84)
  let frontX: number, frontY: number;
  let capX: number, capY: number;
  let frontMat: 1 | -1;

  if (vertical) {
    frontX   = sX + HALF_W + NE;                             // sX + 216
    frontY   = sY + NE / 2;                                  // sY +  44
    capX     = sX + HALF_W + WALL_OFFSET - MICRO_TILE_SIZE;  // sX +  40
    capY     = sY + (WALL_OFFSET + MICRO_TILE_SIZE) / 2;     // sY +  84
    frontMat = -1; // front draws LEFT+DOWN (/ visual direction)
  } else {
    frontX   = sX + HALF_W - NE;                             // sX +  40
    frontY   = sY + NE / 2;                                  // sY +  44
    capX     = sX + HALF_W + MICRO_TILE_SIZE - WALL_OFFSET;  // sX + 216
    capY     = sY + (MICRO_TILE_SIZE + WALL_OFFSET) / 2;     // sY +  84
    frontMat = 1;  // front draws RIGHT+DOWN (\ visual direction)
  }

  // ── Top cap geometry ─────────────────────────────────────────────────────────
  // ISO projection at elevatedY = sY - drawH.
  // Mirrors:  ctx.transform(1, 0.5, -1, 0.5, cx, elevatedY)
  //           ctx.drawImage(topImg, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE)
  const cx         = sX + HALF_W;
  const elevatedY  = sY - drawH;
  // matrix(1, 0.5, -1, 0.5, cx, elevatedY) for image at (0,0) width 128 height 128

  // ── Diamond tile outline (ground reference) ───────────────────────────────────
  const dl = `${sX},${sY + HALF_H}`;                         // left vertex
  const dt = `${sX + HALF_W},${sY}`;                         // top vertex
  const dr = `${sX + HALF_W * 2},${sY + HALF_H}`;            // right vertex
  const db = `${sX + HALF_W},${sY + HALF_H * 2}`;            // bottom vertex

  const bgRect = background === 'transparent'
    ? ''
    : `<rect width="${canvasW}" height="${canvasH}" fill="${background}"/>`;

  const faces = buildExtrudedFacesAt(sideSvg, topSvg, variant, zOffset, sX, sY);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  ${bgRect}
  <!-- ground diamond reference -->
  <polygon points="${dl} ${dt} ${dr} ${db}" fill="rgba(60,80,60,0.18)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  ${faces}
</svg>`;
}

/**
 * Internal: build per-rect extruded face elements for an extruded nano.
 *
 * For each rect in solver.ts wallBounds(variant), emits two camera-facing
 * faces (south + east), skipping any face that is occluded by another rect
 * within the same tile (interior seams that would never be visible).
 *
 * This replaces the legacy single-front-face approach which over-rendered
 * "phantom brick" along the full 128px tile length and missed the second
 * arm of corner / tee variants entirely. With per-rect faces, every visible
 * exposed surface of the L / T / + footprint gets its own properly-sized
 * brick face, and corners look like solid 3D corners.
 *
 * The top cap continues to use stoneWallTopSvg, which already paints the
 * footprint as an L / T / + shape on the elevated diamond surface.
 *
 * Coordinates are relative to anchor (sX, sY) = tile bounding-box top-left.
 *
 * Iso projection (tile-local → screen, relative to (sX, sY)):
 *   sx = sX + tx - ty + HALF_W
 *   sy = sY + (tx + ty) / 2
 */
function buildExtrudedFacesAt(
  sideSvg: string,
  topSvg:  string,
  variant:  FeatureVariant,
  zOffset:  number,
  sX: number,
  sY: number,
): string {
  const drawH    = Math.max(zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  const sideHref = svgToDataUri(sideSvg);
  const topHref  = svgToDataUri(topSvg);

  const { rects } = wallBounds(variant);

  // Same-tile occlusion checks: a face is hidden if another rect abuts it directly.
  function southOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.y === r.y + r.h
      && o.x < r.x + r.w && o.x + o.w > r.x);
  }
  function eastOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.x === r.x + r.w
      && o.y < r.y + r.h && o.y + o.h > r.y);
  }

  // Iso project a tile-local (tx, ty) into bounding-box screen coords.
  const isoX = (tx: number, ty: number) => sX + tx - ty + HALF_W;
  const isoY = (tx: number, ty: number) => sY + (tx + ty) / 2;

  const faces: string[] = [];

  for (const r of rects) {
    // ── SOUTH (front) face: anchored at iso(r.x, r.y + r.h), width = r.w ──
    if (!southOccluded(r)) {
      const ex = isoX(r.x, r.y + r.h);
      const ey = isoY(r.x, r.y + r.h);
      faces.push(
        `<image href="${sideHref}" x="0" y="-${drawH}" width="${r.w}" height="${drawH}" ` +
        `transform="matrix(1,0.5,0,1,${ex},${ey})" preserveAspectRatio="none"/>`
      );
    }
    // ── EAST (right side) face: anchored at iso(r.x + r.w, r.y), width = r.h ──
    if (!eastOccluded(r)) {
      const ex = isoX(r.x + r.w, r.y);
      const ey = isoY(r.x + r.w, r.y);
      // East face is shaded slightly darker (less direct sun than south face)
      faces.push(
        `<image href="${sideHref}" x="0" y="-${drawH}" width="${r.h}" height="${drawH}" ` +
        `transform="matrix(-1,0.5,0,1,${ex},${ey})" preserveAspectRatio="none"/>`
      );
      faces.push(
        `<rect x="0" y="-${drawH}" width="${r.h}" height="${drawH}" fill="rgba(0,0,0,0.18)" ` +
        `transform="matrix(-1,0.5,0,1,${ex},${ey})"/>`
      );
    }
  }

  // ── Top cap: flat iso of stoneWallTopSvg at elevated height ──
  const cx        = sX + HALF_W;
  const elevatedY = sY - drawH;
  const topFace = `<image href="${topHref}" x="0" y="0" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" ` +
    `transform="matrix(1,0.5,-1,0.5,${cx},${elevatedY})" preserveAspectRatio="none"/>`;

  return faces.join('\n  ') + '\n  ' + topFace;
}

/**
 * Build the 3-face extruded face markup for use in scene assembly compositing.
 *
 * Returns ONLY the <image>/<rect> face elements — no outer <svg>, background, or
 * reference polygon. Coordinates are tile-local: tile bounding-box top-left = (0, 0).
 *
 * Designed for embedding inside a <g transform="translate(drawX, drawY)"> group in
 * wrapIsometricAssembly. The parent assembly SVG must not clip negativeY (walls
 * extend above y=0). Mark the AssemblyChainItem with renderMode: 'extruded' so the
 * assembly renderer knows to skip the z-pin transform and embed markup directly.
 *
 * @param kind      - NanoTileKind (stone-wall). cathedral-wall/homestead-wall: TODO
 * @param variant   - Feature variant. Default: 'straight-h'
 * @param zOffset   - Z height (used with NANO_Z_SCALE). Default: 4
 * @param connections - Optional explicit connections (inferred from variant if omitted)
 */
export function buildExtrudedFaceMarkup(
  kind: NanoTileKind | string,
  variant: FeatureVariant = 'straight-h',
  zOffset: number = 4,
  connections?: FeatureConnections,
): string {
  const conn = connections ?? inferConnections(variant);
  const sideSvg = getVariantSvg(kind as NanoTileKind, variant, conn, zOffset, 0, 0) ?? '';
  const topSvg  = stoneWallTopSvg(variant);
  // sX=0, sY=0 → tile bounding-box top-left is the coordinate origin
  return buildExtrudedFacesAt(sideSvg, topSvg, variant, zOffset, 0, 0);
}

// ─── Billboard SVG (fence, gate, troll-bridge) ────────────────

/**
 * Build a Z-pinned billboard SVG that replicates drawPositiveNano().
 *
 * Mirrors:  ctx.translate(screenX, screenY + HALF_H)
 *           ctx.transform(1, 0.5, 0, 1, 0, 0)
 *           ctx.drawImage(img, 0, -drawH, MICRO_TILE_SIZE, drawH)
 *
 * The result is then rasterized flat (no further SVG wrapping needed).
 */
function buildBillboardSvg(
  tileSvg: string,
  zOffset: number,
  sX: number,
  sY: number,
  canvasW: number,
  canvasH: number,
  background: string = 'transparent',
): string {
  const drawH = Math.max(zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  const href  = svgToDataUri(tileSvg);
  // Anchor: tile left vertex = (sX, sY + HALF_H)
  const anchorX = sX;
  const anchorY = sY + HALF_H;
  // matrix(1, 0.5, 0, 1, anchorX, anchorY) — Z-pinned shear
  const dl = `${sX},${sY + HALF_H}`;
  const dt = `${sX + HALF_W},${sY}`;
  const dr = `${sX + HALF_W * 2},${sY + HALF_H}`;
  const db = `${sX + HALF_W},${sY + HALF_H * 2}`;

  const bgRect = background === 'transparent'
    ? ''
    : `<rect width="${canvasW}" height="${canvasH}" fill="${background}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  ${bgRect}
  <polygon points="${dl} ${dt} ${dr} ${db}" fill="rgba(60,80,60,0.18)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <!-- Z-pinned billboard: matrix(1,0.5,0,1) shear from left vertex -->
  <image href="${href}" x="0" y="-${drawH}" width="${MICRO_TILE_SIZE}" height="${drawH}" transform="matrix(1,0.5,0,1,${anchorX},${anchorY})" preserveAspectRatio="none"/>
</svg>`;
}

// ─── Negative Z SVG (river, river-bank) ──────────────────────

/**
 * Build a negative-Z (sunken) flat iso SVG, replicating drawNegativeNano().
 *
 * Mirrors: ctx.transform(1, 0.5, -1, 0.5, cx, screenY + sinkPx)
 *          ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE)
 * Clipped to diamond via clip-path.
 */
function buildNegativeSvg(
  tileSvg: string,
  zOffset: number,
  sX: number,
  sY: number,
  canvasW: number,
  canvasH: number,
  background: string = 'transparent',
): string {
  const Z_PX_PER_LEVEL = 4; // matches tile.ts
  const sinkPx = Math.abs(zOffset) * Z_PX_PER_LEVEL;
  const href   = svgToDataUri(tileSvg);
  const cx     = sX + HALF_W;
  const cy     = sY + HALF_H;
  // Diamond clip corners
  const dl = `${sX},${cy}`;
  const dt = `${cx},${sY}`;
  const dr = `${sX + HALF_W * 2},${cy}`;
  const db = `${cx},${sY + HALF_H * 2}`;

  const bgRect = background === 'transparent'
    ? ''
    : `<rect width="${canvasW}" height="${canvasH}" fill="${background}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <defs>
    <clipPath id="diamond-clip">
      <polygon points="${dl} ${dt} ${dr} ${db}"/>
    </clipPath>
  </defs>
  ${bgRect}
  <polygon points="${dl} ${dt} ${dr} ${db}" fill="rgba(60,80,60,0.18)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <!-- Sunken flat iso: matrix(1,0.5,-1,0.5) shifted down by sinkPx -->
  <g clip-path="url(#diamond-clip)">
    <image href="${href}" x="0" y="0" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" transform="matrix(1,0.5,-1,0.5,${cx},${sY + sinkPx})" preserveAspectRatio="none"/>
  </g>
</svg>`;
}

// ─── Flat Nano SVG (tall-grass) ───────────────────────────────

/**
 * Build a flat iso overlay SVG (zMode='flat'), replicating drawFlatNano().
 * Semi-transparent so the base biome shows through.
 */
function buildFlatSvg(
  tileSvg: string,
  sX: number,
  sY: number,
  canvasW: number,
  canvasH: number,
  background: string = 'transparent',
): string {
  const href = svgToDataUri(tileSvg);
  const cx   = sX + HALF_W;
  const cy   = sY + HALF_H;
  const dl = `${sX},${cy}`;
  const dt = `${cx},${sY}`;
  const dr = `${sX + HALF_W * 2},${cy}`;
  const db = `${cx},${sY + HALF_H * 2}`;

  const bgRect = background === 'transparent'
    ? ''
    : `<rect width="${canvasW}" height="${canvasH}" fill="${background}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <defs>
    <clipPath id="diamond-clip">
      <polygon points="${dl} ${dt} ${dr} ${db}"/>
    </clipPath>
  </defs>
  ${bgRect}
  <polygon points="${dl} ${dt} ${dr} ${db}" fill="rgba(60,80,60,0.18)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  <g clip-path="url(#diamond-clip)" opacity="0.82">
    <image href="${href}" x="0" y="0" width="${MICRO_TILE_SIZE}" height="${MICRO_TILE_SIZE}" transform="matrix(1,0.5,-1,0.5,${cx},${sY})" preserveAspectRatio="none"/>
  </g>
</svg>`;
}

// ─── Public API ───────────────────────────────────────────────

/** Kinds that use 3-face extruded box rendering (sideTextureSvg + topTextureSvg path). */
const EXTRUDED_KINDS = new Set<string>(['stone-wall']);
/** Kinds that use standing Z-pinned billboard rendering (drawPositiveNano path, flat SVG panel). */
const BILLBOARD_KINDS = new Set<string>(['fence', 'gate', 'troll-bridge', 'bridge', 'cathedral-wall', 'homestead-wall']);
/** Kinds that use sunken flat iso rendering. */
const NEGATIVE_KINDS = new Set<string>(['river', 'river-bank']);
/** Kinds that use flat semi-transparent overlay rendering. */
const FLAT_KINDS = new Set<string>(['tall-grass']);

export interface GameTileRenderOptions {
  /** Feature variant. Defaults to 'straight-h' for walls/fences, 'straight-h' for river. */
  variant?: FeatureVariant;
  /** Z offset (height for positive nanos, depth for negative). Default: kind-appropriate. */
  zOffset?: number;
  /** Which sides are connected to a neighbor of the same kind. Controls rail/channel presence. */
  connections?: FeatureConnections;
  /** Output width. Default: TILE_CANVAS_W (320). */
  width?: number;
  /** Output height. Default: TILE_CANVAS_H (320). */
  height?: number;
  /** Background color. Default: '#0d1117' (dark). */
  background?: string;
  /** World col (affects procedural variation for tall-grass). Default: 0. */
  worldCol?: number;
  /** World row (affects procedural variation for tall-grass). Default: 0. */
  worldRow?: number;
}

/**
 * Build the final wrapped SVG string for a game tile kind + variant.
 * Uses the actual game engine SVG generators from solver.ts.
 * Wraps the result in the correct isometric projection for the kind.
 *
 * Throws if kind is unknown or getVariantSvg returns null.
 */
export function buildGameTileSvg(
  kind: NanoTileKind | string,
  options: GameTileRenderOptions = {},
): string {
  const variant    = options.variant ?? 'straight-h';
  const zOffset    = options.zOffset ?? defaultZOffset(kind);
  const connections = options.connections ?? inferConnections(variant);
  const canvasW    = options.width ?? TILE_CANVAS_W;
  const canvasH    = options.height ?? TILE_CANVAS_H;
  const bg         = options.background ?? '#0d1117';
  const worldCol   = options.worldCol ?? 0;
  const worldRow   = options.worldRow ?? 0;

  // Use SCREEN_X/SCREEN_Y scaled if canvas differs from defaults
  const sX = Math.round(canvasW  / 2 - HALF_W);
  const sY = Math.round(canvasH  * 0.47 - HALF_H);

  if (EXTRUDED_KINDS.has(kind)) {
    const sideSvg = getVariantSvg(kind as NanoTileKind, variant, connections, zOffset, worldCol, worldRow);
    if (!sideSvg) throw new Error(`getVariantSvg returned null for ${kind}/${variant}`);
    const topSvg = stoneWallTopSvg(variant);
    return buildExtrudedSvg(sideSvg, topSvg, variant, zOffset, sX, sY, canvasW, canvasH, bg);
  }

  if (BILLBOARD_KINDS.has(kind)) {
    const svg = getVariantSvg(kind as NanoTileKind, variant, connections, zOffset, worldCol, worldRow)
              ?? woodenFenceSvg(variant); // fallback for fence kinds
    return buildBillboardSvg(svg, zOffset, sX, sY, canvasW, canvasH, bg);
  }

  if (NEGATIVE_KINDS.has(kind)) {
    const svg = getVariantSvg(kind as NanoTileKind, variant, connections, zOffset, worldCol, worldRow);
    if (!svg) throw new Error(`getVariantSvg returned null for ${kind}/${variant}`);
    return buildNegativeSvg(svg, zOffset, sX, sY, canvasW, canvasH, bg);
  }

  if (FLAT_KINDS.has(kind)) {
    const svg = getVariantSvg(kind as NanoTileKind, variant, connections, zOffset, worldCol, worldRow);
    if (!svg) throw new Error(`getVariantSvg returned null for ${kind}/${variant}`);
    return buildFlatSvg(svg, sX, sY, canvasW, canvasH, bg);
  }

  throw new Error(`Unknown game tile kind: "${kind}". Supported: ${[...EXTRUDED_KINDS, ...BILLBOARD_KINDS, ...NEGATIVE_KINDS, ...FLAT_KINDS].join(', ')}`);
}

/**
 * Render a game tile kind + variant directly to a RenderResult PNG.
 * One-call path for the render_game_tile MCP tool.
 */
export function renderGameTile(
  kind: NanoTileKind | string,
  options: GameTileRenderOptions = {},
): RenderResult {
  const svg = buildGameTileSvg(kind, options);
  // Extruded walls generate a complete positioned SVG — render flat.
  // Billboard/negative/flat also generate positioned SVGs — render flat.
  const canvasW = options.width ?? TILE_CANVAS_W;
  const canvasH = options.height ?? TILE_CANVAS_H;
  return renderSvg(svg, { mode: 'flat', width: canvasW, height: canvasH });
}

// ─── Helpers ──────────────────────────────────────────────────

function defaultZOffset(kind: string): number {
  if (kind === 'stone-wall')                                 return 4; // extruded box
  if (kind === 'cathedral-wall' || kind === 'homestead-wall') return 4; // tall billboard structures
  if (kind === 'troll-bridge' || kind === 'bridge')          return 3; // bridge height over water
  if (kind === 'fence' || kind === 'gate')                   return 2;
  if (NEGATIVE_KINDS.has(kind))                              return 2;
  return 2;
}

/**
 * Infer FeatureConnections from a variant string.
 * Used when caller doesn't specify explicit connections.
 * Conservative: only marks sides connected if the variant arms in that direction.
 */
function inferConnections(variant: FeatureVariant): FeatureConnections {
  switch (variant) {
    case 'straight-h': return { top: false, right: true,  bottom: false, left: true  };
    case 'straight-v': return { top: true,  right: false, bottom: true,  left: false };
    case 'cross':      return ALL_CONNECTED;
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
    case 'isolated':   return NONE_CONNECTED;
    default:           return ALL_CONNECTED;
  }
}
