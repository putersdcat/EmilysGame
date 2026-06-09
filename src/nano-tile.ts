/**
 * nano-tile.ts — NanoTile rendering engine (ported from experiment/isometric-2.0).
 * Z-pinned skew transforms, extrusions, and stack draw for feature overlays.
 * Nanos overlay on base biome MicroTiles for fences, walls, rivers, etc.
 *
 * Transform reference:
 *   Base tile (flat): ctx.transform(1, 0.5, -1, 0.5, halfW, 0)
 *   Nano (upright):   ctx.transform(1, 0.5, 0, 1, 0, 0)
 *
 * The upright shear pins vertical edges while the bottom edge follows the
 * iso angle (26.5°), creating a "standing billboard" aligned to the left
 * iso axis of the diamond grid.
 *
 * TODO: DOC — Z-pinned transform math, draw order, extrusion pipeline
 *
 * @see experiment/isometric-2.0/src/nano-tile.ts — original experiment source
 * @see src/types/iso-renderer.types.ts — type definitions
 */

import {
  ISO_DIAMOND_WIDTH as ISO_TILE_WIDTH,
  ISO_DIAMOND_HEIGHT as ISO_TILE_HEIGHT,
  ISO_MICRO_TILE_SIZE as MICRO_TILE_SIZE,
  type IsoFeatureConnections as FeatureConnections,
  type IsoFeatureVariant as FeatureVariant,
  type IsoNanoTile as NanoTile,
  type IsoNanoStack as NanoStack,
  type IsoSunState as SunState,
} from './types/iso-renderer.types.js';
import { wallBounds } from './nano-tile-svgs';

// ─── SVG Image Cache ─────────────────────────────────────────────────────────
// Inlined from experiment/isometric-2.0/src/tile.ts for standalone portability.

const _svgImageCache = new Map<string, HTMLImageElement>();

/**
 * Inject a pre-loaded image into the SVG cache (used by Node.js/napi-rs canvas adapter).
 * Without this, loadSvgImage() performs browser-side async load.
 */
export function injectSvgImage(svg: string, img: HTMLImageElement): void {
  _svgImageCache.set(svg, img);
}

/**
 * Load or retrieve a cached HTMLImageElement for the given SVG string.
 * Browser: async blob URL → synchronous drawImage once loaded.
 * Node (AiTools): pre-populated via injectSvgImage().
 */
export function loadSvgImage(svg: string): HTMLImageElement | null {
  let img = _svgImageCache.get(svg);
  if (img) return img;

  // Browser async load — schedules decode, returns null on first call.
  img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  _svgImageCache.set(svg, img);
  return img.complete ? img : null;
}

// ─── Shadow Utility ──────────────────────────────────────────────────────────
// Inlined from experiment/isometric-2.0/src/renderer.ts (computeShadowOffset).

/** Reusable 2D offset for shadow projection (avoid alloc in hot path). */
const _shadowOffset = { dx: 0, dy: 0 };

/** Compute shadow pixel offset from sun state and tile Z-height.
 *  @param sun  Current sun position/parameters.
 *  @param z    Z-offset in nano levels.
 *  @returns    Mutable singleton (copy before storing).
 */
export function computeShadowOffset(sun: SunState, z: number): { dx: number; dy: number } {
  const zPx = z * Z_PX_PER_LEVEL;
  const len = zPx * sun.shadowLength;
  _shadowOffset.dx = -Math.cos(sun.azimuth) * len;
  _shadowOffset.dy = -Math.sin(sun.azimuth) * len * 0.5; // foreshorten for iso
  return _shadowOffset;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Pixels sunk/raised per terrain Z level (subtle elevation). */
export const Z_PX_PER_LEVEL = 4;

const HALF_W = ISO_TILE_WIDTH / 2;   // 128
const HALF_H = ISO_TILE_HEIGHT / 2;  // 64
const ISO_X_PER_SOURCE_PX = HALF_W / MICRO_TILE_SIZE;
const ISO_Y_PER_SOURCE_PX = HALF_H / MICRO_TILE_SIZE;

/**
 * Visual height multiplier for nano Z rendering.
 * Base tile Z_PX_PER_LEVEL (4) provides subtle terrain elevation.
 * Nanos use a larger scale for visible structural height.
 * Exported for chunk.ts (computePadTop) and assembly preview.
 */
export const NANO_Z_SCALE = 12;

/** Minimum visible nano height in pixels. */
const MIN_NANO_HEIGHT = 16;
const WALL_THICKNESS = MICRO_TILE_SIZE / 3;
const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;

type ScreenPoint = { x: number; y: number };

// ─── Types ───────────────────────────────────────────────────────────────────

/** Result of rendering a nano stack — cumulative sink depth for player offset. */
export interface NanoDrawResult {
  /** Total sink depth in pixels from negative-Z nanos. */
  sinkDepthPx: number;
  /** True only when every nano SVG image was loaded and drawn. */
  allImagesLoaded: boolean;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Diamond clip path.
 * Clips rendering to the iso diamond shape at (cx, cy) with half-dims (hw, hh).
 */
function clipDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  hw: number, hh: number,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.clip();
}

function connectionsFromVariant(variant: FeatureVariant | undefined): FeatureConnections {
  switch (variant) {
    case 'straight-h': return { top: false, right: true, bottom: false, left: true };
    case 'straight-v': return { top: true, right: false, bottom: true, left: false };
    case 'cross': return { top: true, right: true, bottom: true, left: true };
    case 'end-r': return { top: false, right: true, bottom: false, left: false };
    case 'end-l': return { top: false, right: false, bottom: false, left: true };
    case 'end-t': return { top: true, right: false, bottom: false, left: false };
    case 'end-b': return { top: false, right: false, bottom: true, left: false };
    case 'corner-tr': return { top: true, right: true, bottom: false, left: false };
    case 'corner-tl': return { top: true, right: false, bottom: false, left: true };
    case 'corner-br': return { top: false, right: true, bottom: true, left: false };
    case 'corner-bl': return { top: false, right: false, bottom: true, left: true };
    case 'tee-t': return { top: false, right: true, bottom: true, left: true };
    case 'tee-r': return { top: true, right: false, bottom: true, left: true };
    case 'tee-b': return { top: true, right: true, bottom: false, left: true };
    case 'tee-l': return { top: true, right: true, bottom: true, left: false };
    default: return { top: false, right: false, bottom: false, left: false };
  }
}

function drawLineBetween(
  ctx: CanvasRenderingContext2D,
  a: ScreenPoint,
  b: ScreenPoint,
  yOffset: number,
  strokeStyle: string,
  lineWidth: number,
): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - yOffset);
  ctx.lineTo(b.x, b.y - yOffset);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function projectFencePoint(
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  z = 0,
): ScreenPoint {
  return {
    x: screenX + (x - y) * ISO_X_PER_SOURCE_PX + HALF_W,
    y: screenY + (x + y) * ISO_Y_PER_SOURCE_PX - z,
  };
}

function drawFencePost(ctx: CanvasRenderingContext2D, p: ScreenPoint, height: number, gate = false): void {
  const postW = gate ? 8 : 6;
  const postColor = gate ? '#7a4d1a' : '#6f5c48';
  const postShadow = gate ? '#4f2c12' : '#433528';
  const postHighlight = gate ? '#b6752e' : '#a08f77';

  ctx.beginPath();
  ctx.ellipse(p.x + 1, p.y + 1, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fill();

  ctx.fillStyle = postShadow;
  ctx.fillRect(p.x - postW / 2 - 1, p.y - 2, postW + 2, 3);

  const grad = ctx.createLinearGradient(p.x - postW / 2, 0, p.x + postW / 2, 0);
  grad.addColorStop(0, postShadow);
  grad.addColorStop(0.45, postColor);
  grad.addColorStop(1, postShadow);
  ctx.fillStyle = grad;
  ctx.fillRect(p.x - postW / 2, p.y - height, postW, height);

  ctx.fillStyle = postHighlight;
  ctx.fillRect(p.x - postW / 2 - 1, p.y - height - 4, postW + 2, 4);
  ctx.strokeStyle = 'rgba(65,38,15,0.72)';
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - postW / 2 - 1, p.y - height - 4, postW + 2, 4);

  ctx.beginPath();
  ctx.moveTo(p.x - 2, p.y - 3);
  ctx.lineTo(p.x - 2, p.y - height + 3);
  ctx.strokeStyle = 'rgba(224,157,68,0.42)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawProceduralFenceNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): boolean {
  const gate = nano.kind === 'gate';
  const height = Math.max(nano.zOffset * NANO_Z_SCALE, gate ? 34 : MIN_NANO_HEIGHT);
  const arms = nano.connections ?? connectionsFromVariant(nano.variant);
  const postKeys = new Set<string>();
  const posts: ScreenPoint[] = [];
  const railColor = gate ? '#9a6829' : '#7a6852';
  const railDark = gate ? '#5a3519' : '#493a2c';
  const railHighlight = gate ? '#bd7b30' : '#aa987f';
  const railWidth = gate ? 6 : 5;

  const addPost = (p: ScreenPoint) => {
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (postKeys.has(key)) return;
    postKeys.add(key);
    posts.push(p);
  };
  const drawSegment = (a: ScreenPoint, b: ScreenPoint) => {
    for (const frac of [0.68, 0.46]) {
      drawLineBetween(ctx, a, b, height * frac, railDark, railWidth + 2);
      drawLineBetween(ctx, a, b, height * (frac + 0.02), railColor, railWidth);
      drawLineBetween(ctx, a, b, height * (frac + 0.035), railHighlight, 1.2);
    }
  };
  const drawGateLeaf = (a: ScreenPoint, b: ScreenPoint) => {
    const top = height * 0.72;
    const bottom = height * 0.42;
    drawLineBetween(ctx, a, b, top, railDark, railWidth + 2.5);
    drawLineBetween(ctx, a, b, bottom, railDark, railWidth + 2.5);
    drawLineBetween(ctx, a, b, top + 1.5, railColor, railWidth);
    drawLineBetween(ctx, a, b, bottom + 1.5, railColor, railWidth);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - bottom);
    ctx.lineTo(b.x, b.y - top);
    ctx.moveTo(a.x, a.y - top);
    ctx.lineTo(b.x, b.y - bottom);
    ctx.strokeStyle = railDark;
    ctx.lineWidth = Math.max(3.5, railWidth - 0.5);
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  const drawPadlock = (p: ScreenPoint) => {
    const y = p.y - height * 0.62;
    ctx.save();
    ctx.fillStyle = '#d3a923';
    ctx.strokeStyle = '#4a2c10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(p.x - 6, y - 1, 12, 10, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, y - 1, 4.5, Math.PI, 0);
    ctx.strokeStyle = '#4a2c10';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  };
  const addPostsOnSpan = (axis: 'x' | 'y', fixed: number, from: number, to: number) => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const addAt = (v: number) => addPost(axis === 'x'
      ? projectFencePoint(screenX, screenY, v, fixed)
      : projectFencePoint(screenX, screenY, fixed, v));
    addAt(min);
    for (let v = min + WALL_THICKNESS; v < max; v += WALL_THICKNESS) addAt(v);
    addAt(max);
  };

  ctx.save();
  ctx.lineJoin = 'round';

  const centerCoord = WALL_THICKNESS * 1.5;
  const center = projectFencePoint(screenX, screenY, centerCoord, centerCoord);
  const left = projectFencePoint(screenX, screenY, 0, centerCoord);
  const right = projectFencePoint(screenX, screenY, MICRO_TILE_SIZE, centerCoord);
  const top = projectFencePoint(screenX, screenY, centerCoord, 0);
  const bottom = projectFencePoint(screenX, screenY, centerCoord, MICRO_TILE_SIZE);

  if (gate && ((arms.left && arms.right) || (arms.top && arms.bottom))) {
    const horizontal = arms.left && arms.right;
    const start = horizontal ? left : top;
    const end = horizontal ? right : bottom;
    addPost(start);
    addPost(center);
    addPost(end);
    drawGateLeaf(start, center);
    drawGateLeaf(center, end);
    for (const post of posts) drawFencePost(ctx, post, height * 0.96, gate);
    drawPadlock(center);
    ctx.restore();
    return true;
  }

  if (arms.left && arms.right) {
    drawSegment(left, right);
    addPostsOnSpan('x', centerCoord, 0, MICRO_TILE_SIZE);
  } else {
    if (arms.left) {
      drawSegment(left, center);
      addPostsOnSpan('x', centerCoord, 0, centerCoord);
    }
    if (arms.right) {
      drawSegment(center, right);
      addPostsOnSpan('x', centerCoord, centerCoord, MICRO_TILE_SIZE);
    }
  }

  if (arms.top && arms.bottom) {
    drawSegment(top, bottom);
    addPostsOnSpan('y', centerCoord, 0, MICRO_TILE_SIZE);
  } else {
    if (arms.top) {
      drawSegment(top, center);
      addPostsOnSpan('y', centerCoord, 0, centerCoord);
    }
    if (arms.bottom) {
      drawSegment(center, bottom);
      addPostsOnSpan('y', centerCoord, centerCoord, MICRO_TILE_SIZE);
    }
  }

  if (!arms.left && !arms.right && !arms.top && !arms.bottom) addPost(center);
  for (const post of posts) drawFencePost(ctx, post, height * 0.96, gate);
  if (gate) drawPadlock(center);

  ctx.restore();
  return true;
}

// ─── Positive Z Rendering ────────────────────────────────────────────────────

/**
 * Draw a positive-Z nano (upright barrier: fence, wall, etc.).
 *
 * Uses Z-pinned shear: `transform(1, 0.5, 0, 1)` — bottom edge follows iso angle,
 * vertical edges stay vertical, creating "standing" appearance.
 *
 * Anchored at tile diamond's left vertex. Width = MICRO_TILE_SIZE spans the
 * left-to-bottom diamond edge. Height derived from zOffset × NANO_Z_SCALE.
 *
 * Layout after transform:
 *   Bottom-left: (screenX, screenY + HALF_H) = diamond left vertex
 *   Bottom-right: (screenX + 128, screenY + HALF_H + 64) = diamond bottom vertex
 */
export function drawPositiveNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  _sun?: SunState,
): boolean {
  if (nano.kind === 'fence' || nano.kind === 'gate') {
    return drawProceduralFenceNano(ctx, nano, screenX, screenY);
  }

  const img = loadSvgImage(nano.svg);
  if (!img) return false;

  const drawH = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);

  ctx.save();

  // Anchor at left vertex of the tile diamond.
  ctx.translate(screenX, screenY + HALF_H);

  // Z-pinned shear: horizontal lines slope at iso angle (0.5),
  // vertical edges remain vertical — the "standing billboard" effect.
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);

  // Draw SVG extending upward from anchor.
  ctx.drawImage(img, 0, -drawH, MICRO_TILE_SIZE, drawH);

  // Blend edge: soft alpha fade at bottom for ground integration
  if (nano.blendEdges) {
    const grad = ctx.createLinearGradient(0, 0, 0, -drawH);
    grad.addColorStop(0, 'rgba(0,0,0,0.12)');
    grad.addColorStop(0.25, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, -drawH, MICRO_TILE_SIZE, drawH);
  }

  ctx.restore();
  return true;
}

// ─── Negative Z Rendering ────────────────────────────────────────────────────

function projectFlatIsoPoint(
  cx: number,
  tileTopY: number,
  sourceX: number,
  sourceY: number,
  yOffset = 0,
): ScreenPoint {
  return {
    x: cx + (sourceX - sourceY) * ISO_X_PER_SOURCE_PX,
    y: tileTopY + yOffset + (sourceX + sourceY) * ISO_Y_PER_SOURCE_PX,
  };
}

function drawProjectedCutFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  tileTopY: number,
  sinkPx: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fill: string,
): void {
  if (Math.hypot(x2 - x1, y2 - y1) < 2) return;

  const drop = Math.max(11, sinkPx * 1.55);
  const a = projectFlatIsoPoint(cx, tileTopY, x1, y1, 0);
  const b = projectFlatIsoPoint(cx, tileTopY, x2, y2, 0);
  const bd = projectFlatIsoPoint(cx, tileTopY, x2, y2, drop);
  const ad = projectFlatIsoPoint(cx, tileTopY, x1, y1, drop);

  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(bd.x, bd.y);
  ctx.lineTo(ad.x, ad.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.strokeStyle = 'rgba(18, 27, 18, 0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ad.x, ad.y);
  ctx.lineTo(bd.x, bd.y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(149, 128, 72, 0.30)';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const strata = (t: number, color: string) => {
    const ax = a.x + (ad.x - a.x) * t;
    const ay = a.y + (ad.y - a.y) * t;
    const bx = b.x + (bd.x - b.x) * t;
    const by = b.y + (bd.y - b.y) * t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };

  strata(0.38, 'rgba(171, 148, 79, 0.18)');
  strata(0.70, 'rgba(15, 25, 15, 0.22)');
}

function drawCutFaceSegments(
  ctx: CanvasRenderingContext2D,
  cx: number,
  tileTopY: number,
  sinkPx: number,
  horizontal: boolean,
  fixedA: number,
  fixedB: number,
  start: number,
  end: number,
  gapStart: number | null,
  gapEnd: number | null,
  fill: string,
): void {
  const draw = (a: number, b: number) => {
    if (b - a < 3) return;
    if (horizontal) drawProjectedCutFace(ctx, cx, tileTopY, sinkPx, a, fixedA, b, fixedB, fill);
    else drawProjectedCutFace(ctx, cx, tileTopY, sinkPx, fixedA, a, fixedB, b, fill);
  };

  if (gapStart === null || gapEnd === null) {
    draw(start, end);
    return;
  }

  draw(start, Math.max(start, gapStart));
  draw(Math.min(end, gapEnd), end);
}

function drawSunkenCutFaces(
  ctx: CanvasRenderingContext2D,
  cx: number,
  tileTopY: number,
  sinkPx: number,
  connections: FeatureConnections,
): void {
  const channelW = 64;
  const off = (MICRO_TILE_SIZE - channelW) / 2;
  const lip = 5;
  const outerMin = -lip;
  const outerMax = MICRO_TILE_SIZE + lip;
  const low = off - lip;
  const high = off + channelW + lip;
  const hasH = connections.left || connections.right;
  const hasV = connections.top || connections.bottom;
  const hStart = connections.left ? outerMin : off;
  const hEnd = connections.right ? outerMax : off + channelW;
  const vStart = connections.top ? outerMin : off;
  const vEnd = connections.bottom ? outerMax : off + channelW;

  if (hasH) {
    const gapA = hasV ? low : null;
    const gapB = hasV ? high : null;
    drawCutFaceSegments(ctx, cx, tileTopY, sinkPx, true, low, low, hStart, hEnd, gapA, gapB, 'rgba(73, 78, 39, 0.76)');
    drawCutFaceSegments(ctx, cx, tileTopY, sinkPx, true, high, high, hStart, hEnd, gapA, gapB, 'rgba(42, 54, 34, 0.78)');
    if (!connections.left) drawProjectedCutFace(ctx, cx, tileTopY, sinkPx, hStart, low, hStart, high, 'rgba(60, 64, 36, 0.74)');
    if (!connections.right) drawProjectedCutFace(ctx, cx, tileTopY, sinkPx, hEnd, low, hEnd, high, 'rgba(39, 50, 33, 0.80)');
  }

  if (hasV) {
    const gapA = hasH ? low : null;
    const gapB = hasH ? high : null;
    drawCutFaceSegments(ctx, cx, tileTopY, sinkPx, false, low, low, vStart, vEnd, gapA, gapB, 'rgba(58, 65, 37, 0.76)');
    drawCutFaceSegments(ctx, cx, tileTopY, sinkPx, false, high, high, vStart, vEnd, gapA, gapB, 'rgba(79, 72, 40, 0.76)');
    if (!connections.top) drawProjectedCutFace(ctx, cx, tileTopY, sinkPx, low, vStart, high, vStart, 'rgba(68, 70, 38, 0.74)');
    if (!connections.bottom) drawProjectedCutFace(ctx, cx, tileTopY, sinkPx, low, vEnd, high, vEnd, 'rgba(45, 56, 35, 0.78)');
  }
}

function drawProceduralRiverWater(ctx: CanvasRenderingContext2D, connections: FeatureConnections): void {
  const channelW = 64;
  const off = (MICRO_TILE_SIZE - channelW) / 2;
  const over = 30;
  const hasH = connections.left || connections.right;
  const hasV = connections.top || connections.bottom;
  const hStart = connections.left ? -over : off;
  const hEnd = connections.right ? MICRO_TILE_SIZE + over : off + channelW;
  const vStart = connections.top ? -over : off;
  const vEnd = connections.bottom ? MICRO_TILE_SIZE + over : off + channelW;
  const shallow = '#2b86a8';
  const mid = '#1b638f';
  const deep = 'rgba(13, 52, 95, 0.36)';
  const foam = 'rgba(168, 217, 232, 0.20)';

  const fillHChannel = (x: number, y: number, w: number, h: number) => {
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, 'rgba(63,81,46,0.34)');
    grad.addColorStop(0.18, shallow);
    grad.addColorStop(0.50, mid);
    grad.addColorStop(0.82, shallow);
    grad.addColorStop(1, 'rgba(63,81,46,0.26)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = deep;
    ctx.fillRect(x, off + 16, w, channelW - 32);
  };
  const fillVChannel = (x: number, y: number, w: number, h: number) => {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(63,81,46,0.34)');
    grad.addColorStop(0.18, shallow);
    grad.addColorStop(0.50, mid);
    grad.addColorStop(0.82, shallow);
    grad.addColorStop(1, 'rgba(63,81,46,0.26)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = deep;
    ctx.fillRect(off + 16, y, channelW - 32, h);
  };

  ctx.save();
  if (hasH) fillHChannel(hStart, off - 4, hEnd - hStart, channelW + 8);
  if (hasV) fillVChannel(off - 4, vStart, channelW + 8, vEnd - vStart);

  if (hasH && hasV) {
    ctx.fillStyle = 'rgba(27,99,143,0.64)';
    ctx.fillRect(off - 4, off - 4, channelW + 8, channelW + 8);
    const g = ctx.createRadialGradient(72, 68, 4, 72, 72, 34);
    g.addColorStop(0, 'rgba(168,217,232,0.16)');
    g.addColorStop(1, 'rgba(27,99,143,0)');
    ctx.fillStyle = g;
    ctx.fillRect(off - 4, off - 4, channelW + 8, channelW + 8);
  }

  ctx.strokeStyle = foam;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  if (hasH) {
    for (let x = hStart + 18; x < hEnd - 10; x += 34) {
      ctx.beginPath();
      ctx.moveTo(x, off + 18 + ((x / 17) % 4));
      ctx.quadraticCurveTo(x + 10, off + 14, x + 22, off + 18);
      ctx.stroke();
    }
  }
  if (hasV) {
    for (let y = vStart + 18; y < vEnd - 10; y += 34) {
      ctx.beginPath();
      ctx.moveTo(off + 18 + ((y / 17) % 4), y);
      ctx.quadraticCurveTo(off + 14, y + 10, off + 18, y + 22);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Draw a negative-Z nano (carve-out: river, trench, etc.).
 *
 * Rendered flat (iso projected like base tiles) with a downward offset
 * to create the "sunken" appearance. Clipped to the parent tile's diamond.
 *
 * Returns the effective sink depth in pixels for player sprite offset.
 */
export function drawNegativeNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): { sinkPx: number; loaded: boolean } {
  const img = nano.kind === 'river' ? null : loadSvgImage(nano.svg);
  if (nano.kind !== 'river' && !img) return { sinkPx: 0, loaded: false };

  const sinkPx = Math.abs(nano.zOffset) * Z_PX_PER_LEVEL;
  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;

  const connections = nano.connections ?? connectionsFromVariant(nano.variant);

  ctx.save();

  // Clip cut faces to the parent tile's diamond; connected water itself is
  // drawn unclipped below so it can flow across source tile boundaries.
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);
  if (nano.kind === 'river') {
    drawSunkenCutFaces(ctx, cx, screenY, sinkPx, connections);
  }
  ctx.restore();

  ctx.save();
  if (nano.kind !== 'river') {
    clipDiamond(ctx, cx, cy, HALF_W, HALF_H);
  }

  // Flat iso projection (same as base tiles) shifted down by sink depth.
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, screenY + sinkPx);
  if (nano.kind === 'river') {
    drawProceduralRiverWater(ctx, connections);
  } else {
    ctx.drawImage(img!, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);
  }

  ctx.restore();

  // Exposed-edge inward blend for natural banks. Do not blend connected
  // river edges, or grass-coloured bars appear across multi-tile joins.
  if (nano.blendEdges) {
    const blendPx = 18;
    const bankColor = 'rgba(58, 125, 68, 0.5)';
    const bankFade  = 'rgba(58, 125, 68, 0)';

    ctx.save();
    clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

    if (!connections.top) {
      let grad = ctx.createLinearGradient(cx, cy - HALF_H, cx, cy - HALF_H + blendPx);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }
    if (!connections.bottom) {
      let grad = ctx.createLinearGradient(cx, cy + HALF_H, cx, cy + HALF_H - blendPx);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }
    if (!connections.left) {
      let grad = ctx.createLinearGradient(cx - HALF_W, cy, cx - HALF_W + blendPx, cy);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }
    if (!connections.right) {
      const grad = ctx.createLinearGradient(cx + HALF_W, cy, cx + HALF_W - blendPx, cy);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }

    ctx.restore();
  }

  return { sinkPx, loaded: true };
}

// ─── Flat Nano Rendering ─────────────────────────────────────────────────────

function bridgeSpansVertical(nano: NanoTile): boolean {
  const conn = nano.connections ?? connectionsFromVariant(nano.variant);
  if ((conn.top || conn.bottom) && !(conn.left || conn.right)) return true;
  if ((conn.left || conn.right) && !(conn.top || conn.bottom)) return false;
  return nano.variant === 'straight-v' || nano.variant === 'end-t' || nano.variant === 'end-b';
}

function drawProceduralBridgeNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): boolean {
  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;
  const verticalSpan = bridgeSpansVertical(nano);
  const center = MICRO_TILE_SIZE / 2;
  const start = 14;
  const end = MICRO_TILE_SIZE - 14;
  const widthHalf = 28;
  const archH = Math.max(18, nano.zOffset * NANO_Z_SCALE + 8);
  const segments = 10;
  const isTroll = nano.kind === 'troll-bridge';
  const plankColors = isTroll
    ? ['#6a4810', '#7d5817', '#573707', '#8a631d']
    : ['#8b6418', '#9b7622', '#765113'];

  const zAt = (axis: number): number => {
    const t = Math.max(0, Math.min(1, (axis - start) / (end - start)));
    return Math.sin(Math.PI * t) * archH;
  };
  const project = (axis: number, side: number, extraZ = 0): ScreenPoint => {
    const z = zAt(axis) + extraZ;
    const x = verticalSpan ? center + side : axis;
    const y = verticalSpan ? axis : center + side;
    return projectFlatIsoPoint(cx, screenY, x, y, -z);
  };
  const ground = (axis: number, side: number): ScreenPoint => {
    const x = verticalSpan ? center + side : axis;
    const y = verticalSpan ? axis : center + side;
    return projectFlatIsoPoint(cx, screenY, x, y, 6);
  };
  const poly = (pts: readonly ScreenPoint[], fill: string, stroke = 'rgba(44,27,7,0.62)') => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  const strokeCurve = (side: number, zLift: number, color: string, width: number) => {
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const axis = start + (end - start) * (i / segments);
      const p = project(axis, side, zLift);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  ctx.save();
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

  poly([
    ground(center - 28, -widthHalf + 4),
    ground(center - 28, widthHalf - 4),
    ground(center + 28, widthHalf - 4),
    ground(center + 28, -widthHalf + 4),
  ], 'rgba(8, 6, 3, 0.28)', 'rgba(0,0,0,0)');

  for (let i = 0; i < segments; i++) {
    const a0 = start + (end - start) * (i / segments);
    const a1 = start + (end - start) * ((i + 1) / segments);
    poly([project(a0, -widthHalf), project(a1, -widthHalf), ground(a1, -widthHalf), ground(a0, -widthHalf)], 'rgba(88, 56, 15, 0.62)');
    poly([project(a0, widthHalf), project(a1, widthHalf), ground(a1, widthHalf), ground(a0, widthHalf)], 'rgba(47, 31, 9, 0.68)');
  }

  for (let i = 0; i < segments; i++) {
    const a0 = start + (end - start) * (i / segments) + 1.5;
    const a1 = start + (end - start) * ((i + 1) / segments) - 1.5;
    poly([
      project(a0, -widthHalf + 3, 1.5),
      project(a0, widthHalf - 3, 1.5),
      project(a1, widthHalf - 3, 1.5),
      project(a1, -widthHalf + 3, 1.5),
    ], plankColors[i % plankColors.length], 'rgba(58, 36, 8, 0.72)');
  }

  strokeCurve(-widthHalf - 2, 9, isTroll ? '#4e3008' : '#7a4f10', 5.5);
  strokeCurve(widthHalf + 2, 9, isTroll ? '#3d2607' : '#6b430d', 5.5);
  strokeCurve(-widthHalf - 2, 12, isTroll ? '#8b6218' : '#b1842b', 1.4);
  strokeCurve(widthHalf + 2, 12, isTroll ? '#765016' : '#a17424', 1.4);

  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const axis = start + (end - start) * t;
    for (const side of [-widthHalf - 2, widthHalf + 2]) {
      const foot = project(axis, side, 0);
      const top = project(axis, side, 18);
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(top.x, top.y);
      ctx.strokeStyle = side < 0 ? '#7a4c10' : '#503109';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(top.x, top.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#a87922';
      ctx.fill();
    }
  }

  if (isTroll) {
    const p = project(center, -4, 34);
    ctx.fillStyle = 'rgba(91, 54, 14, 0.96)';
    ctx.fillRect(p.x - 18, p.y - 10, 36, 18);
    ctx.strokeStyle = '#2a1805';
    ctx.strokeRect(p.x - 18, p.y - 10, 36, 18);
    ctx.fillStyle = '#ffd66b';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TROLL', p.x, p.y - 2);
  }

  ctx.restore();
  return true;
}

/**
 * Draw a flat nano overlay (zMode='flat', e.g., tall grass decal).
 * Same iso projection as base tiles, semi-transparent to show base through.
 */
function drawFlatNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): boolean {
  if (nano.kind === 'bridge' || nano.kind === 'troll-bridge') {
    return drawProceduralBridgeNano(ctx, nano, screenX, screenY);
  }

  const img = loadSvgImage(nano.svg);
  if (!img) return false;

  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;

  ctx.save();
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

  // Flat iso transform (identical to base tile projection)
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, screenY);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);

  ctx.restore();
  return true;
}

// ─── Extruded Nano Rendering ─────────────────────────────────────────────────

/**
 * Wall geometry constants — must stay in sync with solver.ts wallBounds().
 *
 * In tile-local space (128×128), the wall occupies a centered strip:
 *   Horizontal wall: x=0..128 (full length), y=40..88 (48px thickness)
 *   Vertical wall:   x=40..88 (48px thickness), y=0..128 (full length)
 *
 * WALL_OFFSET = distance from tile edge to the near wall face (camera side).
 * WALL_THICKNESS = wall width perpendicular to its run direction.
 */
// Removed unused wall geometry constants

/**
 * Returns true when the nano variant represents a wall running along the
 * vertical iso axis (/ on screen), as opposed to horizontal (\ on screen).
 *
 * Used by drawExtrudedNano to select the correct face matrix orientation.
 * Exported for AiTools game-tile-renderer.ts.
 */
export function isVerticalWall(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-v':
    case 'corner-tl':
    case 'corner-tr':
    case 'corner-br':
    case 'tee-r':
    case 'tee-l':
      return true;
    default:
      return false;
  }
}

/**
 * Returns true when the narrow end-cap face should be rendered for this variant.
 *
 * Mid-run tiles (straight-h, straight-v) and 4-way crossing tiles (cross)
 * connect on BOTH ends — no exposed terminus face. Drawing a cap here creates
 * disconnected-post artifacts in long runs.
 *
 * @see experiment Issue #211 — end-cap chaining fix derivation.
 * Exported so AiTools game-tile-renderer.ts can share the same logic.
 */
export function shouldDrawEndCap(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-h':
    case 'straight-v':
    case 'cross':
      return false;
    default:
      return true;
  }
}

/**
 * Draw a nano with 3-face extrusion: front face + end cap + top cap.
 * Creates a proper isometric 3D box for thick structural nanos (stone walls).
 *
 * ═══ DUAL-ORIENTATION ISOMETRIC BOX GEOMETRY (v3) ═══
 *
 * Camera views from south-east looking north-west.
 * Two orientations, determined by isVerticalWall(nano.variant):
 *
 * ┌─────────────────────────────────────┬─────────────────────────────────────┐
 * │ HORIZONTAL (\ on screen)            │ VERTICAL (/ on screen)              │
 * │ Wall strip y=40..88                 │ Wall strip x=40..88                 │
 * │ Z-edge: tile(128,88) → screen       │ Z-edge: tile(88,128) → screen       │
 * │ Front: anchor(0, 88), mat(1,0.5)    │ Front: anchor(88, 0), mat(-1,0.5)   │
 * │ Cap:   anchor(128,40), mat(-1,0.5)  │ Cap:   anchor(40,128), mat(1,0.5)   │
 * └─────────────────────────────────────┴─────────────────────────────────────┘
 *
 * Key insight: front and cap SWAP matrix signs between orientations.
 * Draw order: end cap → front → top cap.
 *
 * @see experiment/isometric-2.0/src/nano-tile.ts — original with full proof.
 * @see GitHub Issue #211 — derivation and geometric proofs.
 */
export function drawExtrudedNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  sun?: SunState,
): boolean {
  const hasExtrusion = nano.sideTextureSvg || nano.topTextureSvg
    || nano.topFaceTextureSvg || nano.southFaceTextureSvg || nano.eastFaceTextureSvg;
  if (!hasExtrusion) {
    return drawPositiveNano(ctx, nano, screenX, screenY, sun);
  }

  const drawH = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  let loaded = true;

  const southTextureSvg = nano.southFaceTextureSvg ?? nano.sideTextureSvg;
  const eastTextureSvg = nano.eastFaceTextureSvg ?? nano.sideTextureSvg;
  const topTextureSvg = nano.topFaceTextureSvg ?? nano.topTextureSvg ?? nano.sideTextureSvg;
  const topVTextureSvg = nano.topFaceTextureSvgV ?? topTextureSvg;

  const southImg = southTextureSvg ? loadSvgImage(southTextureSvg) : null;
  const eastImg = eastTextureSvg ? loadSvgImage(eastTextureSvg) : null;
  const topImg = topTextureSvg ? loadSvgImage(topTextureSvg) : null;
  const topVImg = topVTextureSvg ? loadSvgImage(topVTextureSvg) : topImg;
  if (!southImg || !eastImg || !topImg || !topVImg) return false;

  const variant = nano.variant ?? 'isolated';
  const { rects } = wallBounds(variant);

  const isoX = (tx: number, ty: number) => screenX + (tx - ty) * ISO_X_PER_SOURCE_PX + HALF_W;
  const isoY = (tx: number, ty: number) => screenY + (tx + ty) * ISO_Y_PER_SOURCE_PX;

  function southOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.y === r.y + r.h && o.x < r.x + r.w && o.x + o.w > r.x);
  }

  function eastOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.x === r.x + r.w && o.y < r.y + r.h && o.y + o.h > r.y);
  }
  function isCoreRect(r: { x: number; y: number; w: number; h: number }): boolean {
    return r.w === WALL_THICKNESS && r.h === WALL_THICKNESS
      && r.x === WALL_OFFSET && r.y === WALL_OFFSET;
  }
  function topIsV(r: { x: number; y: number; w: number; h: number }): boolean {
    const v = nano.variant;
    if (v === 'straight-v' || v === 'end-t' || v === 'end-b' || v === 'tee-l' || v === 'tee-r') return true;
    if (v === 'straight-h' || v === 'end-l' || v === 'end-r') return false;
    if (nano.topRotateWithAxis === false) return false;
    if (isCoreRect(r)) return false;
    const inVBand = r.x === WALL_OFFSET && r.w === WALL_THICKNESS;
    const aboveCore = r.y + r.h <= WALL_OFFSET;
    const belowCore = r.y >= WALL_OFFSET + WALL_THICKNESS;
    return inVBand && (aboveCore || belowCore);
  }

  // Draw visible vertical faces first. South and east faces match the
  // experiment's footprint-rect approach, rather than stretching one full
  // 144px texture strip across every variant.
  for (const r of rects) {
    if (!southOccluded(r)) {
      const ex = isoX(r.x, r.y + r.h);
      const ey = isoY(r.x, r.y + r.h);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);
      ctx.drawImage(southImg, r.x, 0, r.w, Math.min(MICRO_TILE_SIZE, drawH), 0, -drawH, r.w, drawH);
      ctx.restore();
    }

    if (!eastOccluded(r)) {
      const ex = isoX(r.x + r.w, r.y);
      const ey = isoY(r.x + r.w, r.y);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.transform(-ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);
      ctx.drawImage(eastImg, r.y, 0, r.h, Math.min(MICRO_TILE_SIZE, drawH), 0, -drawH, r.h, drawH);
      if (!nano.faceSliceEqualLighting) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, -drawH, r.h, drawH);
      }
      ctx.restore();
    }
  }

  // Draw footprint top cap at elevated position, using only the actual wall
  // rects so corners/tees/crosses stop looking like full-tile checkerboards.
  const elevatedY = screenY - drawH;
  const cx = screenX + HALF_W;
  ctx.save();
  clipDiamond(ctx, cx, elevatedY + HALF_H, HALF_W, HALF_H);
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, elevatedY);
  for (const r of rects) {
    const img = topIsV(r) ? topVImg : topImg;
    ctx.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
  }
  ctx.restore();

  return loaded;
}

// ─── Stack Rendering ─────────────────────────────────────────────────────────

/**
 * Draw a full nano stack for one tile.
 *
 * Nanos are assumed pre-sorted: negative Z first, then flat, then positive
 * (per the NanoStack sort contract — see types.ts).
 *
 * Returns cumulative sink depth for player sprite positioning.
 */
export function drawNanoStack(
  ctx: CanvasRenderingContext2D,
  nanos: NanoStack,
  screenX: number,
  screenY: number,
  sun?: SunState,
): NanoDrawResult {
  let sinkDepthPx = 0;
  let allImagesLoaded = true;

  for (const nano of nanos) {
    switch (nano.zMode) {
      case 'negative': {
        const res = drawNegativeNano(ctx, nano, screenX, screenY);
        sinkDepthPx += res.sinkPx;
        if (!res.loaded) allImagesLoaded = false;
        break;
      }
      case 'flat':
        if (!drawFlatNano(ctx, nano, screenX, screenY)) allImagesLoaded = false;
        break;
      case 'positive':
        if (nano.sideTextureSvg || nano.topTextureSvg || nano.topFaceTextureSvg || nano.southFaceTextureSvg || nano.eastFaceTextureSvg) {
          if (!drawExtrudedNano(ctx, nano, screenX, screenY, sun)) allImagesLoaded = false;
        } else {
          if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) allImagesLoaded = false;
        }
        break;
    }
  }

  return { sinkDepthPx, allImagesLoaded };
}

// ─── Nano Shadow Rendering ───────────────────────────────────────────────────

/**
 * Draw shadow for a positive-Z nano.
 * Projects a small diamond shadow based on nano's Z-offset and sun state.
 * Only positive nanos cast shadows (negative are sunken, flat are ground-level).
 */
export function drawNanoShadow(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  sun: SunState,
): void {
  if (nano.zMode !== 'positive' || nano.zOffset <= 0) return;

  const offset = computeShadowOffset(sun, nano.zOffset);
  const shadowScale = Math.min(nano.zOffset / 6, 1);

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.shadowAlpha * 0.5})`;

  const cx = screenX + HALF_W + offset.dx;
  const cy = screenY + HALF_H + offset.dy;
  const hw = HALF_W * 0.3 * (1 + shadowScale);
  const hh = HALF_H * 0.3 * (1 + shadowScale);

  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);
  ctx.lineTo(cx + hw, cy);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}
