/**
 * nano-tile.ts — 2.0 Experiment: NanoTile rendering engine.
 * Z-pinned skew transforms, extrusions, and stack draw for feature overlays.
 * Nanos overlay on base biome MicroTiles for fences, walls, rivers, etc.
 *
 * Transform reference:
 *   Base tile (flat): ctx.transform(kx, ky, -kx, ky, halfW, 0)
 *   Nano (upright):   ctx.transform(kx, ky, 0, 1, 0, 0)
 * where kx = (ISO_TILE_WIDTH / 2) / MICRO_TILE_SIZE and
 * ky = (ISO_TILE_HEIGHT / 2) / MICRO_TILE_SIZE. With MICRO_TILE_SIZE=144,
 * this keeps the projected diamond at 256×128 while source-space math uses
 * clean 48 px nano cells.
 *
 * The upright shear pins vertical edges while the bottom edge follows the
 * iso angle (26.5°), creating a "standing billboard" aligned to the left
 * iso axis of the diamond grid.
 *
 * TODO: DOC — Z-pinned transform math, draw order, extrusion pipeline
 */

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  MICRO_TILE_SIZE,
  NANO_GRID,
  type FeatureConnections,
  type FeatureVariant,
  type FenceStyle,
  type NanoTile,
  type NanoStack,
  type SunState,
} from './types';
import { wallBounds } from './solver';
import { loadSvgImage, Z_PX_PER_LEVEL } from './tile';
import { computeShadowOffset } from './renderer';

// ─── Constants ───────────────────────────────────────────────

const HALF_W = ISO_TILE_WIDTH / 2;   // 128
const HALF_H = ISO_TILE_HEIGHT / 2;  // 64
const ISO_X_PER_SOURCE_PX = HALF_W / MICRO_TILE_SIZE;
const ISO_Y_PER_SOURCE_PX = HALF_H / MICRO_TILE_SIZE;
const NANO_CELL_SIZE = MICRO_TILE_SIZE / NANO_GRID;

/**
 * Visual height multiplier for nano Z rendering.
 * Base tile Z_PX_PER_LEVEL (4) is for subtle terrain elevation.
 * Nanos need larger scale for visible structural height.
 * Exported for use in computePadTop (chunk.ts) and assemblies preview.
 */
export const NANO_Z_SCALE = 12;

/** Minimum visible nano height in pixels. */
const MIN_NANO_HEIGHT = 16;

// ─── Types ───────────────────────────────────────────────────

/** Result of rendering a nano stack — cumulative sink depth for player offset. */
export interface NanoDrawResult {
  /** Total sink depth in pixels from negative-Z nanos. */
  sinkDepthPx: number;
  /** True only when every nano SVG image was loaded and drawn. */
  allImagesLoaded: boolean;
}

// ─── Utility ─────────────────────────────────────────────────

/**
 * Diamond clip path (mirrors tile.ts — see rendering.instructions.md on dedup).
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

function hash01(a: number, b: number, c: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
}

// ─── Positive Z Rendering ────────────────────────────────────

function connectionsFromVariant(variant: FeatureVariant | undefined): FeatureConnections {
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
    case 'tee-t':      return { top: false, right: true,  bottom: true,  left: true  };
    case 'tee-r':      return { top: true,  right: false, bottom: true,  left: true  };
    case 'tee-b':      return { top: true,  right: true,  bottom: false, left: true  };
    case 'tee-l':      return { top: true,  right: true,  bottom: true,  left: false };
    default:           return { top: false, right: false, bottom: false, left: false };
  }
}

function drawLineBetween(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
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

function drawFencePost(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number },
  height: number,
  style?: FenceStyle,
): void {
  const postW = style?.postWidth ?? 7;
  const postCap = style?.postCapHeight ?? 4;
  const postColor = style?.postColor ?? '#6f421d';
  const postShadow = style?.postShadow ?? '#4f2c12';
  const postHighlight = style?.postHighlight ?? '#b6752e';

  // Ground contact shadow/foot. This is deliberately drawn at the exact
  // projected fence point, so posts read as planted into the iso ground
  // plane instead of hovering above it.
  ctx.beginPath();
  ctx.ellipse(p.x + 1, p.y + 1, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fill();

  ctx.fillStyle = postShadow;
  ctx.fillRect(p.x - postW / 2 - 1, p.y - 2, postW + 2, 3);

  ctx.beginPath();
  ctx.moveTo(p.x + 3, p.y + 2);
  ctx.lineTo(p.x + 3, p.y - height + 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = postW + 2;
  ctx.lineCap = 'round';
  ctx.stroke();

  const grad = ctx.createLinearGradient(p.x - postW / 2, 0, p.x + postW / 2, 0);
  grad.addColorStop(0, postShadow);
  grad.addColorStop(0.45, postColor);
  grad.addColorStop(1, postShadow);
  ctx.fillStyle = grad;
  ctx.fillRect(p.x - postW / 2, p.y - height, postW, height);

  ctx.fillStyle = postHighlight;
  ctx.fillRect(p.x - postW / 2 - 1, p.y - height - postCap, postW + 2, postCap);
  ctx.strokeStyle = 'rgba(65,38,15,0.72)';
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - postW / 2 - 1, p.y - height - postCap, postW + 2, postCap);

  ctx.beginPath();
  ctx.moveTo(p.x - 2, p.y - 3);
  ctx.lineTo(p.x - 2, p.y - height + 3);
  ctx.strokeStyle = style?.bleachColor ?? 'rgba(224,157,68,0.52)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function fenceRailHeightFractions(style?: FenceStyle): readonly number[] {
  const count = style?.railCount ?? 2;
  const spread = style?.railSpread ?? 0.22;
  const center = 0.56;
  if (count === 1) return [center];
  if (count === 3) return [center + spread, center, center - spread];
  return [center + spread / 2, center - spread / 2];
}

function projectFencePoint(
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  z = 0,
): { x: number; y: number } {
  return {
    x: screenX + (x - y) * ISO_X_PER_SOURCE_PX + HALF_W,
    y: screenY + (x + y) * ISO_Y_PER_SOURCE_PX - z,
  };
}

function drawProceduralFenceNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): boolean {
  const height = Math.max(
    nano.zOffset * NANO_Z_SCALE,
    nano.kind === 'gate' ? 34 : MIN_NANO_HEIGHT,
  );
  const style = nano.fenceStyle;
  const railColor = style?.railColor ?? (nano.kind === 'gate' ? '#9a6829' : '#a06a26');
  const railDark = style?.railShadow ?? (nano.kind === 'gate' ? '#5a3519' : '#6a421d');
  const railHighlight = style?.railHighlight ?? '#bd7b30';
  const railWidth = style?.railThickness ?? 5;
  const arms = nano.connections ?? connectionsFromVariant(nano.variant);
  const postKeys = new Set<string>();
  const posts: Array<{ x: number; y: number }> = [];

  const addPost = (p: { x: number; y: number }) => {
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (postKeys.has(key)) return;
    postKeys.add(key);
    posts.push(p);
  };

  const addPostsOnSpan = (
    axis: 'x' | 'y',
    fixed: number,
    from: number,
    to: number,
  ) => {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    const addAt = (v: number) => {
      addPost(axis === 'x'
        ? projectFencePoint(screenX, screenY, v, fixed)
        : projectFencePoint(screenX, screenY, fixed, v));
    };

    addAt(min);
    for (let v = min; v <= max; v += NANO_CELL_SIZE) {
      if (v < min - 0.001 || v > max + 0.001) continue;
      addAt(v);
    }
    addAt(max);
  };

  ctx.save();
  ctx.lineJoin = 'round';

  const drawSegment = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    // Draw dark backing first, then the warm rail and a thin highlight.
    // Rails are intentionally round-ended so a run made from adjacent
    // micro tiles reads as one continuous wooden fence line.
    for (const frac of fenceRailHeightFractions(style)) {
      drawLineBetween(ctx, a, b, height * frac, railDark, railWidth + 2);
      drawLineBetween(ctx, a, b, height * (frac + 0.02), railColor, railWidth);
      drawLineBetween(ctx, a, b, height * (frac + 0.035), railHighlight, 1.2);
    }
  };

  const drawRaisedLine = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    aOffset: number,
    bOffset: number,
    strokeStyle: string,
    lineWidth: number,
  ) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - aOffset);
    ctx.lineTo(b.x, b.y - bOffset);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const drawGateLeaf = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    // Gate leaves are deliberately more graphic than ordinary fence rails:
    // two rails plus diagonal bracing make the tile read as a hinged gate
    // instead of a dense cluster of extra posts.
    const top = height * 0.72;
    const bottom = height * 0.42;
    drawLineBetween(ctx, a, b, top, railDark, railWidth + 2.5);
    drawLineBetween(ctx, a, b, bottom, railDark, railWidth + 2.5);
    drawLineBetween(ctx, a, b, top + 1.5, railColor, railWidth);
    drawLineBetween(ctx, a, b, bottom + 1.5, railColor, railWidth);
    drawRaisedLine(a, b, bottom, top, railDark, Math.max(3.5, railWidth - 0.5));
    drawRaisedLine(a, b, bottom + 1.5, top + 1.5, railHighlight, 1.4);
    drawRaisedLine(a, b, top, bottom, railDark, Math.max(3.5, railWidth - 0.5));
    drawRaisedLine(a, b, top + 1.5, bottom + 1.5, railHighlight, 1.4);
  };

  const drawPadlock = (p: { x: number; y: number }) => {
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
    ctx.strokeStyle = '#d3a923';
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, y - 1, 4.5, Math.PI, 0);
    ctx.strokeStyle = '#4a2c10';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  // Physical footprint: a fence is a THIN barrier running down the CENTER
  // nano lane of the parent 144px micro tile. Its post positions land on
  // the 48px nano-grid lines (0,48,96,144), so a fence can line up with
  // the same L0.5 spatial grammar as a 48px-thick stone wall.
  const centerCoord = NANO_CELL_SIZE * 1.5;
  const center = projectFencePoint(screenX, screenY, centerCoord, centerCoord);
  const left = projectFencePoint(screenX, screenY, 0, centerCoord);
  const right = projectFencePoint(screenX, screenY, MICRO_TILE_SIZE, centerCoord);
  const top = projectFencePoint(screenX, screenY, centerCoord, 0);
  const bottom = projectFencePoint(screenX, screenY, centerCoord, MICRO_TILE_SIZE);

  if (nano.kind === 'gate' && ((arms.left && arms.right) || (arms.top && arms.bottom))) {
    const horizontal = arms.left && arms.right;
    const start = horizontal ? left : top;
    const end = horizontal ? right : bottom;
    const split = center;
    addPost(start);
    addPost(end);

    if (style?.gateLeafMode === 'double') {
      addPost(split);
      drawGateLeaf(start, split);
      drawGateLeaf(split, end);
    } else {
      drawGateLeaf(start, end);
    }

    for (const post of posts) drawFencePost(ctx, post, height * (style?.postHeightScale ?? 0.96), style);

    drawPadlock(split);

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

  if (nano.kind === 'gate') {
    if (arms.left && arms.right) {
      const hingeA = projectFencePoint(screenX, screenY, MICRO_TILE_SIZE * 0.42, MICRO_TILE_SIZE / 2);
      const hingeB = projectFencePoint(screenX, screenY, MICRO_TILE_SIZE * 0.58, MICRO_TILE_SIZE / 2);
      drawLineBetween(ctx, hingeA, hingeB, height * 0.82, '#5a3519', 7);
      drawLineBetween(ctx, hingeA, hingeB, height * 0.57, '#b47a2c', 7);
      addPost(hingeA);
      addPost(hingeB);
    } else if (arms.top && arms.bottom) {
      const hingeA = projectFencePoint(screenX, screenY, MICRO_TILE_SIZE / 2, MICRO_TILE_SIZE * 0.42);
      const hingeB = projectFencePoint(screenX, screenY, MICRO_TILE_SIZE / 2, MICRO_TILE_SIZE * 0.58);
      drawLineBetween(ctx, hingeA, hingeB, height * 0.82, '#5a3519', 7);
      drawLineBetween(ctx, hingeA, hingeB, height * 0.57, '#b47a2c', 7);
      addPost(hingeA);
      addPost(hingeB);
    }
  }

  for (const post of posts) drawFencePost(ctx, post, height * (style?.postHeightScale ?? 0.96), style);

  if (nano.kind === 'gate') {
    drawPadlock(center);
  }

  ctx.restore();
  return true;
}

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
 *   Top-left: (screenX, screenY + HALF_H - drawH)
 *   Top-right: (screenX + HALF_W, screenY + HALF_H - drawH + HALF_H)
 *   Bottom-left: (screenX, screenY + HALF_H) = diamond left vertex
 *   Bottom-right: (screenX + HALF_W, screenY + HALF_H + HALF_H) = diamond bottom vertex
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
  // After shear, the bottom edge runs from left vertex to bottom vertex.
  ctx.translate(screenX, screenY + HALF_H);

  // Z-pinned shear: horizontal lines slope at iso angle (0.5),
  // vertical edges remain vertical — the "standing billboard" effect.
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);

  // Draw SVG extending upward from anchor.
  // y=0 is the ground line; negative y extends upward.
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

// ─── Negative Z Rendering ────────────────────────────────────

type ScreenPoint = { x: number; y: number };

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
  // Match WaterFamily clear-river geometry: 64px channel centered inside
  // the 144px micro tile. Faces are drawn along the CHANNEL banks, not the
  // whole tile diamond, mirroring the wall renderer's footprint-first logic.
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
    // Split around an intersecting vertical arm so crosses/tees become a
    // true plus-shaped trench instead of a square pond with walls through it.
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

/**
 * Draw a negative-Z nano (carve-out: river, trench, etc.).
 *
 * Rendered flat (iso projected like base tiles) with a downward offset
 * to create the "sunken" appearance. Clipped to the parent tile's diamond.
 * Blend edges add grass-to-water transitions only on exposed edges.
 *
 * Returns the effective sink depth in pixels for player sprite offset.
 */
export function drawNegativeNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): { sinkPx: number; loaded: boolean } {
  const img = loadSvgImage(nano.svg);
  if (!img) return { sinkPx: 0, loaded: false };

  const sinkPx = Math.abs(nano.zOffset) * Z_PX_PER_LEVEL;
  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;

  ctx.save();

  // Clip to parent tile's diamond to prevent bleed
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

  const connections = nano.connections ?? connectionsFromVariant(nano.variant);

  // Draw visible excavated side faces first. This is the negative-Z equivalent
  // of the wall renderer's side faces: without it, the lowered water texture
  // reads as a flat decal rather than a carved channel.
  drawSunkenCutFaces(ctx, cx, screenY, sinkPx, connections);

  // Flat iso projection (same as base tiles) shifted down by sink depth.
  // The shift moves the SVG content lower within the diamond, creating the
  // sunken plane effect (e.g., water surface below surrounding terrain).
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, screenY + sinkPx);
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);

  ctx.restore();

  // Exposed-edge inward blend: grass-colored gradient from each edge,
  // fading toward center — creates natural "bank" transition. Crucially,
  // do NOT blend connected river edges: doing so paints grass-coloured
  // bands across water seams in multi-tile river runs.
  if (nano.blendEdges) {
    const blendPx = 18;
    // Grass base color (semi-transparent for blend)
    const bankColor = 'rgba(58, 125, 68, 0.5)';
    const bankFade = 'rgba(58, 125, 68, 0)';
    ctx.save();
    clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

    // Top edge
    if (!connections.top) {
      let grad = ctx.createLinearGradient(cx, cy - HALF_H, cx, cy - HALF_H + blendPx);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }

    // Bottom edge
    if (!connections.bottom) {
      let grad = ctx.createLinearGradient(cx, cy + HALF_H, cx, cy + HALF_H - blendPx);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }

    // Left edge
    if (!connections.left) {
      let grad = ctx.createLinearGradient(cx - HALF_W, cy, cx - HALF_W + blendPx, cy);
      grad.addColorStop(0, bankColor);
      grad.addColorStop(1, bankFade);
      ctx.fillStyle = grad;
      ctx.fillRect(screenX, screenY, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
    }

    // Right edge
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

// ─── Flat Nano Rendering ─────────────────────────────────────

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
  const img = loadSvgImage(nano.svg);
  if (!img) return false;

  const cx = screenX + HALF_W;
  const cy = screenY + HALF_H;

  const drawBridgeDropFace = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    topYOffset: number,
    bottomYOffset: number,
    fill: string,
  ) => {
    const a = projectFlatIsoPoint(cx, screenY, x1, y1, topYOffset);
    const b = projectFlatIsoPoint(cx, screenY, x2, y2, topYOffset);
    const bd = projectFlatIsoPoint(cx, screenY, x2, y2, bottomYOffset);
    const ad = projectFlatIsoPoint(cx, screenY, x1, y1, bottomYOffset);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(bd.x, bd.y);
    ctx.lineTo(ad.x, ad.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(36, 23, 7, 0.58)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  ctx.save();
  clipDiamond(ctx, cx, cy, HALF_W, HALF_H);

  if (nano.kind === 'bridge' || nano.kind === 'troll-bridge') {
    const liftPx = Math.max(10, nano.zOffset * NANO_Z_SCALE);
    const lowerPlane = 8;

    // Contact shadow stays on the lower water plane; the deck itself is drawn
    // lifted above it. This makes bridge-over-river read as spanning depth.
    ctx.save();
    ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, screenY + lowerPlane);
    ctx.fillStyle = 'rgba(9, 8, 5, 0.34)';
    ctx.fillRect(14, 38, MICRO_TILE_SIZE - 28, 58);
    ctx.restore();

    // Two visible underside faces connect the raised deck to the lower water
    // plane. This is intentionally simple but makes the bridge read as a
    // physical slab spanning the carved channel instead of a flat decal.
    drawBridgeDropFace(14, 92, 114, 92, -liftPx, lowerPlane, 'rgba(76, 49, 14, 0.64)');
    drawBridgeDropFace(114, 36, 114, 92, -liftPx, lowerPlane, 'rgba(43, 29, 9, 0.68)');

    ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, screenY - liftPx);
    ctx.globalAlpha = 1;
    ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);
    ctx.restore();
    return true;
  }

  // Flat iso transform (identical to base tile projection)
  ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, screenY);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(img, 0, 0, MICRO_TILE_SIZE, MICRO_TILE_SIZE);

  ctx.restore();
  return true;
}

function isRoofNanoKind(kind: NanoTile['kind']): boolean {
  return kind === 'roof-slope-left' || kind === 'roof-slope-right' || kind === 'roof-ridge';
}

function drawClippedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pts: ReadonlyArray<{ x: number; y: number }>,
  alpha = 1,
): void {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, minX, minY, w, h);
  ctx.restore();
}

/** Draw a 48×48×48 wedge roof nano on the central 48×48 wall footprint. */
function drawRoofNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
): boolean {
  const img = loadSvgImage(nano.svg);
  if (!img) return false;
  const gableImg = nano.sideTextureSvg ? loadSvgImage(nano.sideTextureSvg) : null;

  const baseZ = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  const roofH = MIN_NANO_HEIGHT;
  const x0 = WALL_OFFSET;
  const x1 = WALL_OFFSET + WALL_THICKNESS;
  const y0 = WALL_OFFSET;
  const y1 = WALL_OFFSET + WALL_THICKNESS;
  const gableFallback = '#d8c7a5';

  const p = (tx: number, ty: number, z: number): { x: number; y: number } => ({
    x: screenX + (tx - ty) * ISO_X_PER_SOURCE_PX + HALF_W,
    y: screenY + (tx + ty) * ISO_Y_PER_SOURCE_PX - z,
  });

  // A roof slope is a cube-sized triangular prism over the centered nano wall
  // block: low edge at wall-top height, high edge one 48px cube higher.
  // Slope across Y so the hypotenuse face is visible from the current camera;
  // an X-axis slope projects nearly edge-on and reads as a thin sail.
  const highNorth = nano.kind !== 'roof-slope-right';
  const zNorth = highNorth ? baseZ + roofH : baseZ;
  const zSouth = highNorth ? baseZ : baseZ + roofH;

  const nw = p(x0, y0, zNorth);
  const sw = p(x0, y1, zSouth);
  const se = p(x1, y1, zSouth);
  const ne = p(x1, y0, zNorth);
  const nwBase = p(x0, y0, baseZ);
  const swBase = p(x0, y1, baseZ);
  const seBase = p(x1, y1, baseZ);
  const neBase = p(x1, y0, baseZ);

  ctx.save();
  ctx.lineJoin = 'round';

  if (nano.kind === 'roof-ridge') {
    const highA = highNorth ? nw : sw;
    const highB = highNorth ? ne : se;
    const dx = highB.x - highA.x;
    const dy = highB.y - highA.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ox = -dy / len * 4;
    const oy = dx / len * 4;
    const pts = [
      { x: highA.x + ox, y: highA.y + oy },
      { x: highA.x - ox, y: highA.y - oy },
      { x: highB.x - ox, y: highB.y - oy },
      { x: highB.x + ox, y: highB.y + oy },
    ];
    drawClippedImage(ctx, img, pts);
    ctx.strokeStyle = 'rgba(52,38,14,0.84)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(highA.x, highA.y);
    ctx.lineTo(highB.x, highB.y);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  // Visible vertical triangular end faces of the cut cube.
  const westTri = highNorth ? [nwBase, nw, swBase] : [nwBase, sw, swBase];
  const eastTri = highNorth ? [neBase, seBase, ne] : [neBase, ne, seBase];
  const roofVariant = nano.variant ?? 'isolated';
  const drawWestGable = roofVariant === 'isolated' || roofVariant === 'end-l';
  const drawEastGable = roofVariant === 'isolated' || roofVariant === 'end-r';
  const gableFaces = [
    ...(drawWestGable ? [westTri] : []),
    ...(drawEastGable ? [eastTri] : []),
  ];
  for (const tri of gableFaces) {
    ctx.beginPath();
    ctx.moveTo(tri[0].x, tri[0].y);
    ctx.lineTo(tri[1].x, tri[1].y);
    ctx.lineTo(tri[2].x, tri[2].y);
    ctx.closePath();
    if (gableImg) {
      ctx.save();
      ctx.clip();
      const minX = Math.min(tri[0].x, tri[1].x, tri[2].x);
      const minY = Math.min(tri[0].y, tri[1].y, tri[2].y);
      const maxX = Math.max(tri[0].x, tri[1].x, tri[2].x);
      const maxY = Math.max(tri[0].y, tri[1].y, tri[2].y);
      ctx.drawImage(gableImg, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
      ctx.restore();
    } else {
      ctx.fillStyle = gableFallback;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(66,49,20,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Hypotenuse/sloped roof face — this is the actual roof-textured cut face.
  const slopeFace = [nw, ne, se, sw];
  drawClippedImage(ctx, img, slopeFace);
  if (nano.kind === 'roof-slope-right') {
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.moveTo(slopeFace[0].x, slopeFace[0].y);
    for (let i = 1; i < slopeFace.length; i++) ctx.lineTo(slopeFace[i].x, slopeFace[i].y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(slopeFace[0].x, slopeFace[0].y);
  for (let i = 1; i < slopeFace.length; i++) ctx.lineTo(slopeFace[i].x, slopeFace[i].y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(66,49,20,0.82)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
  return true;
}

// ─── Extruded Nano Rendering ─────────────────────────────────

/**
 * Wall geometry constants — must stay in sync with solver.ts wallBounds().
 *
 * In tile-local space (144×144), the wall occupies a centered strip:
 *   Horizontal wall: x=0..144 (full length), y=48..96 (48px thickness)
 *   Vertical wall:   x=48..96 (48px thickness), y=0..144 (full length)
 *
 * WALL_OFFSET = distance from tile edge to the near wall face (camera side).
 * WALL_THICKNESS = wall width perpendicular to its run direction.
 *
 * NOTE: kept as documented constants — the v5 per-rect renderer derives
 * geometry directly from solver.wallBounds() rather than these values.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WALL_THICKNESS = 48;                                    // solver.ts W
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;  // solver.ts off = 48 when MICRO_TILE_SIZE=144

/**
 * Determine if a wall variant's PRIMARY run direction is vertical ("/" on screen).
 * Used by the legacy single-face extrusion path; the v5 per-rect renderer
 * does not call this. Kept for AiTools/game-tile-renderer.ts which still
 * mirrors the old approach.
 */
export function isVerticalWall(variant: FeatureVariant | undefined): boolean {
  switch (variant) {
    case 'straight-v':
    case 'end-t':
    case 'end-b':
    case 'corner-tr':
    case 'corner-br':
    case 'tee-r':       // top+bottom+left arms → primary run is vertical
    case 'tee-l':       // top+bottom+right arms → primary run is vertical
      return true;
    default:
      return false;     // straight-h, end-r, end-l, corner-tl, corner-bl, tee-t, tee-b, cross, isolated
  }
}

/**
 * Draw a nano with 3-face extrusion: front face + end cap + top cap.
 * Creates a proper isometric 3D box for thick structural nanos (stone walls).
 *
 * ═══ DUAL-ORIENTATION ISOMETRIC BOX GEOMETRY (v3) ═══
 *
 * Camera views from south-east (screen bottom) looking north-west (screen top).
 * Two orientations supported, determined by isVerticalWall(nano.variant):
 *
 * ┌───────────────────────────────────┬───────────────────────────────────┐
 * │ HORIZONTAL (\\ on screen)         │ VERTICAL (/ on screen)            │
 * │ Wall strip y=48..96              │ Wall strip x=48..96              │
 * │                                  │                                  │
 * │ Z-edge: tile(144, 96)            │ Z-edge: tile(96, 144)            │
 * │ screen (sX+170.7, sY+106.7)      │ screen (sX+85.3, sY+106.7)       │
 * │                                  │                                  │
 * │ Front: anchor(0, 96)             │ Front: anchor(96, 0)             │
 * │   matrix(1, 0.5, 0, 1)          │   matrix(-1, 0.5, 0, 1)         │
 * │   width=144, draws RIGHT+DOWN    │   width=144, draws LEFT+DOWN     │
 * │                                  │                                  │
 * │ Cap: anchor(144, 48)             │ Cap: anchor(48, 144)             │
 * │   matrix(-1, 0.5, 0, 1)         │   matrix(1, 0.5, 0, 1)          │
 * │   width=48, draws LEFT+DOWN      │   width=48, draws RIGHT+DOWN     │
 * │                                  │                                  │
 * │ Top: std iso at elevation        │ Top: std iso at elevation        │
 * └───────────────────────────────────┴───────────────────────────────────┘
 *
 * Key insight: front and cap SWAP their matrix signs between orientations.
 * Both cases: V-shape opens away from camera, solid faces toward player. ✓
 *
 * Draw order: end cap (further) → front (closer) → top cap (highest).
 *
 * @see isVerticalWall() for variant→orientation classification.
 * @see solver.ts wallBounds() for wall footprint geometry.
 * @see GitHub Issue #211 for derivation, geometric proofs, and fix history.
 */
export function drawExtrudedNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  sun?: SunState,
  /**
   * Optional: which of the 4 cardinal neighbor tiles also contains a wall
   * (any wall variant). Used to suppress end-cap ticks at tile boundaries
   * where the wall continues into the next tile. n=north (-y), s=south (+y),
   * e=east (+x), w=west (-x). When omitted (null), defaults to the within-tile
   * heuristic only.
   */
  neighborWalls?: { n: boolean; s: boolean; e: boolean; w: boolean },
): boolean {
  const hasExtrusion = nano.sideTextureSvg || nano.topTextureSvg
    || nano.topFaceTextureSvg || nano.southFaceTextureSvg || nano.eastFaceTextureSvg;
  if (!hasExtrusion) {
    return drawPositiveNano(ctx, nano, screenX, screenY, sun);
  }

  const drawH = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  let loaded = true;

  // ─── Per-rect extruded faces (v5 — single image, aligned-grout) ───
  //
  // ONE source image (sideTextureSvg) is used for BOTH side faces and the
  // top face via ctx.createPattern(). Pattern phase is anchored at a single
  // per-tile screen point (the bottom-front corner of the full diamond,
  // elevated by drawH) so:
  //
  //   • Every face of the same wall samples a CONSISTENT pattern → grout
  //     lines continue across rect boundaries within a tile (corner /
  //     tee variants don't show a seam between arms).
  //   • South face's TOP edge and top face's FRONT edge share source y=0
  //     → mortar lines wrap from side onto top across the wall-top edge.
  //   • Adjacent tiles re-derive the same anchor at world-tile-origin
  //     spacing, so pattern phase repeats every game-tile (144 source-px
  //     period divides evenly into the iso step) → no inter-tile seam.
  //
  // Rect occlusion: if another rect in the same variant abuts on the
  // south or east boundary, that face is hidden by the adjacent rect's
  // matching face; skip drawing it. This avoids overdraw and z-fighting
  // along internal arm joints.
  //
  // @see textures/stone-brick.ts for the texture image.
  // @see solver.ts wallBounds() for per-variant rect layout.
  // @see AiTools/game-tile-renderer.ts for the SVG-path mirror (separate code).

  const variant = nano.variant ?? 'straight-h';
  const { rects } = wallBounds(variant);

  function southOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.y === r.y + r.h
      && o.x < r.x + r.w && o.x + o.w > r.x);
  }
  function eastOccluded(r: { x: number; y: number; w: number; h: number }): boolean {
    return rects.some(o => o !== r && o.x === r.x + r.w
      && o.y < r.y + r.h && o.y + o.h > r.y);
  }
  // ENDFACE detection: a face is an END (header/cap) only when it is
  // GENUINELY EXPOSED at the terminal of a wall run. Three rules combine:
  //
  //  (A) WITHIN-TILE: no rect of this tile extends further in that
  //      direction, AND a rect extends in the OPPOSITE direction (so
  //      this isn't a side face along the wall's length).
  //
  //  (B) TILE-BOUNDARY: if the rect's edge sits on the tile boundary,
  //      check the neighbor tile in that direction. If the neighbor has
  //      a wall, the run continues — NOT an end. Without neighbor info,
  //      assume continuation (safer to under-tick than to bleed ticks
  //      into adjacent walls).
  //
  //  (C) CORE-IS-NOT-A-CAP: the central 48×48 "core" rect represents the
  //      interior wall pillar where arms join, not a cap. Its faces may
  //      be exposed when an arm is missing on that side (e.g. corner-tr
  //      has no bottom-arm so the core's south face is exposed grass-
  //      ward), but ticking it competes with the top winner-strip and
  //      reads as visual noise. Skip ticks on core rects.
  function isCoreRect(r: { x:number; y:number; w:number; h:number }): boolean {
    return r.w === WALL_THICKNESS && r.h === WALL_THICKNESS
        && r.x === WALL_OFFSET
        && r.y === WALL_OFFSET;
  }
  /**
   * Per-rect top texture orientation. MUST mirror the iter03 winner-takes-
   * strip logic in the TOP-FACE block below. End-cap ticks represent brick
   * HEADERS — only valid on faces perpendicular to the brick run direction.
   * Top runs V → bricks run N/S → headers face N/S → SOUTH-face ticks valid.
   * Top runs H → bricks run E/W → headers face E/W → EAST-face ticks valid.
   */
  function topIsV(r: { x:number; y:number; w:number; h:number }): boolean {
    const v = nano.variant;
    if (v === 'straight-v' || v === 'end-t' || v === 'end-b' || v === 'tee-l' || v === 'tee-r') return true;
    if (v === 'straight-h' || v === 'end-l' || v === 'end-r') return false;
    // H-winner variants: corner-*, tee-t, tee-b, cross.
    // Core is covered by the H winner strip; vertical arms (top-arm and
    // bottom-arm rects, identified by W-thick column at off, extending
    // above or below the core band) are V stubs.
    if (isCoreRect(r)) return false;
    const inHBand = r.x === WALL_OFFSET && r.w === WALL_THICKNESS;
    const aboveCore = r.y + r.h <= WALL_OFFSET;
    const belowCore = r.y >= WALL_OFFSET + WALL_THICKNESS;
    return inHBand && (aboveCore || belowCore);
  }
  function southIsEnd(r: { x: number; y: number; w: number; h: number }): boolean {
    // Physically: south ticks = brick headers, only valid when top above is V.
    if (!topIsV(r)) return false;
    if (r.y + r.h >= MICRO_TILE_SIZE) {
      return neighborWalls ? !neighborWalls.s : false;
    }
    const noSouth = !rects.some(o => o.y >= r.y + r.h && o.x < r.x + r.w && o.x + o.w > r.x);
    const hasNorth = rects.some(o => o.y + o.h <= r.y && o.x < r.x + r.w && o.x + o.w > r.x);
    return noSouth && hasNorth;
  }
  function eastIsEnd(r: { x: number; y: number; w: number; h: number }): boolean {
    // Physically: east ticks = brick headers, only valid when top above is H.
    if (topIsV(r)) return false;
    if (r.x + r.w >= MICRO_TILE_SIZE) {
      return neighborWalls ? !neighborWalls.e : false;
    }
    const noEast = !rects.some(o => o.x >= r.x + r.w && o.y < r.y + r.h && o.y + o.h > r.y);
    const hasWest = rects.some(o => o.x + o.w <= r.x && o.y < r.y + r.h && o.y + o.h > r.y);
    return noEast && hasWest;
  }
  function southUsesEndTexture(r: { x: number; y: number; w: number; h: number }): boolean {
    return !!endTextureSvg && (southIsEnd(r) || (nano.variant === 'isolated' && topIsV(r)));
  }
  function eastUsesEndTexture(r: { x: number; y: number; w: number; h: number }): boolean {
    return !!endTextureSvg && (eastIsEnd(r) || (nano.variant === 'isolated' && !topIsV(r)));
  }
  const isoX = (tx: number, ty: number) => screenX + (tx - ty) * ISO_X_PER_SOURCE_PX + HALF_W;
  const isoY = (tx: number, ty: number) => screenY + (tx + ty) * ISO_Y_PER_SOURCE_PX;

  // Shared pattern anchor (screen): bottom-front corner of the full tile
  // diamond, elevated by the wall height. All face pattern transforms
  // map source (0,0) → THIS screen point. (Math derivation in commit msg.)
  const ANCHOR_SX = screenX;                       // = isoX(0, 144)
  const ANCHOR_SY = screenY + HALF_H - drawH;      // = isoY(0, 144) - drawH

  const southTextureSvg = nano.southFaceTextureSvg ?? nano.sideTextureSvg;
  const eastTextureSvg = nano.eastFaceTextureSvg ?? nano.sideTextureSvg;
  const topTextureSvg = nano.topFaceTextureSvg ?? nano.topTextureSvg ?? nano.sideTextureSvg;
  const topVTextureSvg = nano.topFaceTextureSvgV ?? topTextureSvg;
  const endTextureSvg = nano.endFaceTextureSvg;

  function drawHeaderJoints(width: number, height: number, color: string, edgeCoord: number): void {
    // Physical exposed brick end: preserve the side face's existing
    // horizontal courses, then add only the header joint(s) in the first
    // top course. Phase comes from the same edge coordinate used to build
    // the side slice, so the added vertical grout aligns with the top row.
    const COURSE_PITCH = 8;
    const BRICK_PITCH = 24;
    const TICK_W = 2;
    const topEdgeCoord = Math.max(0, edgeCoord - COURSE_PITCH);
    const course = Math.floor(topEdgeCoord / COURSE_PITCH);
    const offset = (course & 1) ? BRICK_PITCH / 2 : 0;
    const y = -height + 1;
    for (let x = offset + BRICK_PITCH; x < width; x += BRICK_PITCH) {
      ctx.fillStyle = color;
      ctx.fillRect(x - TICK_W / 2, y, TICK_W, COURSE_PITCH - 2);
    }
  }

  function drawWeathering(face: 'south' | 'east' | 'top', width: number, height: number, x0: number, y0: number): void {
    const overlays = nano.weatheringOverlays;
    if (!overlays?.length) return;

    for (const overlay of overlays) {
      if (overlay.faces && !overlay.faces.includes(face)) continue;
      if (overlay.kind === 'snow' && face !== 'top') continue;
      if (overlay.intensity <= 0 || overlay.opacity <= 0) continue;

      const xMin = Math.floor(width * Math.max(0, Math.min(1, overlay.xRange?.[0] ?? 0)));
      const xMax = Math.ceil(width * Math.max(0, Math.min(1, overlay.xRange?.[1] ?? 1)));
      const yMin = Math.floor(height * Math.max(0, Math.min(1, overlay.yRange?.[0] ?? 0)));
      const yMax = Math.ceil(height * Math.max(0, Math.min(1, overlay.yRange?.[1] ?? 1)));
      const cell = overlay.kind === 'edge-wear' ? 6 : overlay.kind === 'snow' || overlay.kind === 'mud' ? 3 : 4;
      const maxSize = overlay.kind === 'snow' || overlay.kind === 'mud' ? 5 : overlay.kind === 'moss' ? 4 : 2;
      const threshold = Math.max(0, Math.min(1, overlay.intensity));
      const alpha = Math.max(0, Math.min(1, overlay.opacity));

      ctx.fillStyle = overlay.color;
      ctx.globalAlpha *= alpha;
      for (let y = yMin; y < yMax; y += cell) {
        for (let x = xMin; x < xMax; x += cell) {
          if (hash01(x + overlay.seed, y + overlay.seed * 3, overlay.seed ^ (face === 'top' ? 17 : face === 'south' ? 29 : 41)) > threshold) continue;
          if (overlay.kind === 'cracks') {
            if (hash01(x, y, overlay.seed + 101) > 0.34) continue;
            const len = 4 + Math.floor(hash01(x, overlay.seed + 103, y) * 8);
            const horizontal = hash01(y, overlay.seed + 107, x) > 0.38;
            ctx.fillRect(x0 + x, y0 + y, horizontal ? len : 1, horizontal ? 1 : len);
            if (hash01(x, y, overlay.seed + 109) > 0.55) ctx.fillRect(x0 + x + Math.floor(len / 2), y0 + y, 1, Math.max(2, Math.floor(len / 2)));
            continue;
          }
          const ox = Math.floor(hash01(x, y, overlay.seed + 11) * 2);
          const oy = Math.floor(hash01(y, x, overlay.seed + 23) * 2);
          const w = 1 + Math.floor(hash01(x, overlay.seed, y + 31) * maxSize);
          const h = 1 + Math.floor(hash01(y, overlay.seed, x + 43) * maxSize);
          ctx.fillRect(x0 + x + ox, y0 + y + oy, w, h);
        }
      }
      ctx.globalAlpha /= alpha;
    }
  }

  if (southTextureSvg || eastTextureSvg || topTextureSvg) {
    // Texture-level opt-out for brick-header-style end ticks. Default is
    // true (correct for brick textures); ancient-stone Voronoi sets false
    // because there is no regular course pitch to align the ticks to.
    const drawEndCapTicks = nano.endCapTicks !== false;
    const endCapTickColor = nano.endCapTickColor ?? '#1c1a17';

    const southImg = southTextureSvg ? loadSvgImage(southTextureSvg) : null;
    const eastImg = eastTextureSvg ? loadSvgImage(eastTextureSvg) : null;
    const topImg = topTextureSvg ? loadSvgImage(topTextureSvg) : null;
    const topVImg = topVTextureSvg ? loadSvgImage(topVTextureSvg) : topImg;
    const endImg = endTextureSvg ? loadSvgImage(endTextureSvg) : null;
    if (southImg && eastImg && topImg && topVImg) {
      const useFaceSlices = !!(nano.topFaceTextureSvg && nano.southFaceTextureSvg && nano.eastFaceTextureSvg);

      if (useFaceSlices) {
        // ── 3D material slice path ────────────────────────────────
        // Face-specific procedural materials (e.g. ancient-stone)
        // export three 144×144 slices from a shared periodic 3D source:
        //   top   = XY at wall-top height
        //   south = XZ at the south/front wall plane
        //   east  = YZ at the east/right wall plane
        //
        // Do NOT use CanvasPattern phase transforms here. Those project
        // independent 2D images onto each face and can drift at ridges.
        // Instead, crop by world-coordinate source rects:
        //   top:   src(x,y)       == world (x,y)
        //   south: src(x, zDown)  == world (x, TOP_Z - z)
        //   east:  src(y, zDown)  == world (y, TOP_Z - z)
        // This makes the top/south ridge at y=r.y+r.h and the top/east
        // ridge at x=r.x+r.w sample the same material line.
        for (const r of rects) {
          if (!southOccluded(r)) {
            const ex = isoX(r.x, r.y + r.h);
            const ey = isoY(r.x, r.y + r.h);
            const southPlane = r.y + r.h;
            const isEnd = southUsesEndTexture(r);
            const southPlaneSvg = isEnd
              ? (nano.endFaceTextureByPlane?.[southPlane] ?? endTextureSvg ?? nano.southFaceTextureByPlane?.[southPlane] ?? southTextureSvg)
              : (nano.southFaceTextureByPlane?.[southPlane] ?? southTextureSvg);
            const southPlaneImg = southPlaneSvg ? loadSvgImage(southPlaneSvg) ?? (isEnd ? endImg ?? southImg : southImg) : southImg;
            ctx.save();
            ctx.translate(ex, ey);
            ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);
            ctx.drawImage(southPlaneImg, r.x, 0, r.w, drawH, 0, -drawH, r.w, drawH);
            drawWeathering('south', r.w, drawH, 0, -drawH);
            if (drawEndCapTicks && isEnd && !endTextureSvg) {
              drawHeaderJoints(r.w, drawH, endCapTickColor, southPlane);
            }
            ctx.restore();
          }
          if (!eastOccluded(r)) {
            const ex = isoX(r.x + r.w, r.y);
            const ey = isoY(r.x + r.w, r.y);
            const eastPlane = r.x + r.w;
            const isEnd = eastUsesEndTexture(r);
            const eastPlaneSvg = isEnd
              ? (nano.endFaceTextureByPlane?.[eastPlane] ?? endTextureSvg ?? nano.eastFaceTextureByPlane?.[eastPlane] ?? eastTextureSvg)
              : (nano.eastFaceTextureByPlane?.[eastPlane] ?? eastTextureSvg);
            const eastPlaneImg = eastPlaneSvg ? loadSvgImage(eastPlaneSvg) ?? (isEnd ? endImg ?? eastImg : eastImg) : eastImg;
            ctx.save();
            ctx.translate(ex, ey);
            ctx.transform(-ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);
            ctx.drawImage(eastPlaneImg, r.y, 0, r.h, drawH, 0, -drawH, r.h, drawH);
            drawWeathering('east', r.h, drawH, 0, -drawH);
            if (!nano.faceSliceEqualLighting) {
              ctx.fillStyle = 'rgba(0,0,0,0.18)';
              ctx.fillRect(0, -drawH, r.h, drawH);
            }
            if (drawEndCapTicks && isEnd && !endTextureSvg) {
              drawHeaderJoints(r.h, drawH, endCapTickColor, eastPlane);
            }
            ctx.restore();
          }
        }

        const elevatedY = screenY - drawH;
        const cx = screenX + HALF_W;
        const W2 = WALL_THICKNESS; const off2 = WALL_OFFSET;
        type Rect = { x:number; y:number; w:number; h:number; v:boolean };
        const tops: Rect[] = [];
        if (variant === 'straight-h') {
          tops.push({ x: 0, y: off2, w: 144, h: W2, v: false });
        } else if (variant === 'straight-v') {
          tops.push({ x: off2, y: 0, w: W2, h: 144, v: true });
        } else if (variant === 'corner-br') {
          tops.push({ x: off2, y: off2, w: 144 - off2, h: W2, v: false });
          tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'corner-bl') {
          tops.push({ x: 0, y: off2, w: off2 + W2, h: W2, v: false });
          tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'corner-tr') {
          tops.push({ x: off2, y: off2, w: 144 - off2, h: W2, v: false });
          tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
        } else if (variant === 'corner-tl') {
          tops.push({ x: 0, y: off2, w: off2 + W2, h: W2, v: false });
          tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
        } else if (variant === 'tee-t' || variant === 'tee-b' || variant === 'cross') {
          tops.push({ x: 0, y: off2, w: 144, h: W2, v: false });
          if (variant === 'tee-b' || variant === 'cross') tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
          if (variant === 'tee-t' || variant === 'cross') tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'tee-l' || variant === 'tee-r') {
          tops.push({ x: off2, y: 0, w: W2, h: 144, v: true });
          if (variant === 'tee-l') tops.push({ x: off2 + W2, y: off2, w: off2, h: W2, v: false });
          else                     tops.push({ x: 0,         y: off2, w: off2, h: W2, v: false });
        } else {
          for (const r of rects) tops.push({ ...r, v: (variant === 'end-t' || variant === 'end-b') });
        }

        ctx.save();
        clipDiamond(ctx, cx, elevatedY + HALF_H, HALF_W, HALF_H);
        ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, elevatedY);
        for (const r of tops) {
          const img = r.v ? topVImg : topImg;
          ctx.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
          drawWeathering('top', r.w, r.h, r.x, r.y);
        }
        ctx.restore();

        return loaded;
      }

      // SIDE-SOUTH pattern — source axes (right=(1,0.5), down=(0,1)) match
      // the canvas shear used during south-face fill, so source-y=0 lies on
      // the wall-top sheared screen line.
      const sPattern = ctx.createPattern(southImg, 'repeat');
      // SIDE-EAST pattern — source axes (right=(-1,0.5), down=(0,1)) match
      // the canvas shear used during east-face fill.
      const ePattern = ctx.createPattern(eastImg, 'repeat');
      // TOP pattern — source axes (right=(1,0.5), down=(-1,0.5)) match the
      // canvas shear used during top fill. CRITICALLY this shares its
      // source-x axis with the SIDE-SOUTH pattern, so source-y=0 traces
      // the SAME screen line on both → mortar continuity across the
      // south-top edge.
      const tPattern = ctx.createPattern(topImg, 'repeat');

      if (sPattern && ePattern && tPattern) {
        // ── SIDE: south + east faces, per visible rect ───────────────
        for (const r of rects) {
          if (!southOccluded(r)) {
            const ex = isoX(r.x, r.y + r.h);
            const ey = isoY(r.x, r.y + r.h);
            // Pattern transform DERIVED:
            //   M_canvas (south) = (1, 0.5, 0, 1)
            //   For source-x → screen direction (1, 0.5) (along wall top
            //   edge), pattern linear part must be IDENTITY. Composing
            //   IDENTITY with the canvas shear gives source-x → screen
            //   (1, 0.5) ✓ and source-y → screen (0, 1) ✓ (gravity).
            //
            //   Previous version used (1, 0.5, 0, 1) for the linear part —
            //   that double-sheared the source so bricks ran at 45° down,
            //   instead of along the iso wall edge. This was the visible
            //   over-slant on the south face.
            //
            //   dx = ANCHOR_SX − ex       (canvas-local Δ for anchor)
            //   dy = (ANCHOR_SY − ey) − 0.5·dx   (canvas shear y-offset)
            const dx = (ANCHOR_SX - ex) / ISO_X_PER_SOURCE_PX;
            const dy = (ANCHOR_SY - ey) - ISO_Y_PER_SOURCE_PX * dx;
            sPattern.setTransform({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
            ctx.save();
            ctx.translate(ex, ey);
            ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);
            ctx.fillStyle = sPattern;
            ctx.fillRect(0, -drawH, r.w, drawH);
            // END-FACE: vertical mortar ticks descending from each course
            // line. PHYSICALLY VALID only when the top above this rect runs
            // V (bricks running N/S → headers face N/S). topIsV(r) gates
            // this — see southIsEnd(). Texture-level opt-out: irregular
            // masonry (e.g. ancient-stone Voronoi) sets nano.endCapTicks=
            // false because there is no regular course pitch and the ticks
            // read as black streaks instead of joints.
            if (drawEndCapTicks && southIsEnd(r)) {
              ctx.fillStyle = endCapTickColor;
              const COURSE_PITCH = 8;
              const TICK_DEPTH = 7;
              const TICK_W = 2;
              for (let x = COURSE_PITCH; x < r.w; x += COURSE_PITCH) {
                ctx.fillRect(x - TICK_W / 2, -drawH + 1, TICK_W, TICK_DEPTH);
              }
            }
            ctx.restore();
          }
          if (!eastOccluded(r)) {
            const ex = isoX(r.x + r.w, r.y);
            const ey = isoY(r.x + r.w, r.y);
            // East canvas shear is (-1, 0.5, 0, 1). To anchor pattern source
            // (0,0) at ANCHOR via this shear:
            //   dx = ex − ANCHOR_SX  (note: −1 sign on shear flips dx sign)
            //   dy = (ANCHOR_SY − ey) − 0.5·dx
            const dx = (ex - ANCHOR_SX) / ISO_X_PER_SOURCE_PX;
            const dy = (ANCHOR_SY - ey) - ISO_Y_PER_SOURCE_PX * dx;
            // Pattern axes IDENTITY in canvas-local; canvas shear already
            // gives source-x → screen (-1, 0.5) and source-y → screen (0,1).
            ePattern.setTransform({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });
            ctx.save();
            ctx.translate(ex, ey);
            ctx.transform(-ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, 0, 1, 0, 0);
            ctx.fillStyle = ePattern;
            ctx.fillRect(0, -drawH, r.h, drawH);
            // Directional shading: east receives less light → darken.
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.fillRect(0, -drawH, r.h, drawH);
            // END-FACE: course-aligned vertical mortar ticks (mirror).
            if (drawEndCapTicks && eastIsEnd(r)) {
              ctx.fillStyle = endCapTickColor;
              const COURSE_PITCH = 8;
              const TICK_DEPTH = 7;
              const TICK_W = 2;
              for (let x = COURSE_PITCH; x < r.h; x += COURSE_PITCH) {
                ctx.fillRect(x - TICK_W / 2, -drawH + 1, TICK_W, TICK_DEPTH);
              }
            }
            ctx.restore();
          }
        }

        // ── TOP: fill each rect (footprint) on the elevated diamond ──
        // The top canvas transform is matrix(kx, ky, -kx, ky, screenX+HALF_W,
        // elevatedY). In that frame, the ANCHOR screen point lands at
        // canvas-local (0, 144) — the back-left vertex of the diamond.
        // Pattern transform IDENTITY-with-translate (0, 144) makes source
        // (0,0) land there. Source-x axis maps via canvas shear to screen
        // (1, 0.5) — same as side-south's source-x → grout aligns.
        const elevatedY = screenY - drawH;
        const cx = screenX + HALF_W;
        // TOP pattern transform: orientation-dependent so brick rows
        // run ALONG the wall's primary length axis on the top face.
        //
        //   H-axis variants (wall extends along world-x, screen direction
        //   (1, 0.5)): pattern (1,0,0,1) → source-x → screen (1, 0.5) ✓
        //
        //   V-axis variants (wall extends along world-y, screen direction
        //   (-1, 0.5)): pattern (0,1,1,0) [transposed] composed with the
        //   top shear (1, 0.5, -1, 0.5) yields:
        //     source-x → canvas (0,1) → screen (-1, 0.5) ✓ along V-wall
        //     source-y → canvas (1,0) → screen (1, 0.5)   (course pitch)
        //
        // GROUT-RIDGE ALIGNMENT (iter14, derived):
        //
        //   Goal: at the wall's front-top ridge, top face samples the SAME
        //   source pixel the side face samples, AND the source-y axis on
        //   top runs INTO the wall (screen direction (-1, 0.5)).
        //
        //   Top frame: scaled shear (kx, ky, -kx, ky). For source-y → screen
        //   (-1, 0.5) we need pattern d-axis = (0, 1) → linear (1,0,0,1).
        //
        //   At the ridge corner of straight-h core (tile 48,96), top
        //   user-space coord is (48, 96). To keep the same source phase at
        //   the ridge under the scaled transform: e = WALL_OFFSET, f = 0.
        //
        //   For V wall: transposed (a=0,b=1,c=-1,d=0) for source-x → screen
        //   (-kx, ky) along V wall ridge; e=off+W, f=off (mirrored algebra).
        // ── TOP-FACE RECT BUILDER (corner/tee winner-takes-strip) ──
        //
        // The `rects` array above describes the wall FOOTPRINT (used for
        // side faces, occlusion tests, and end-cap detection). For the TOP
        // face we deliberately use a DIFFERENT decomposition because brick
        // courses on top must run ALONG the wall's length axis, and a
        // single tile can contain BOTH an H run and a V run (corners/tees).
        //
        // Picking one global pattern made the whole tile read in that one
        // orientation, so a corner-br tile drawn with H pattern showed
        // H bricks bending down through the V arm — looked like the top
        // texture wrapped around the corner like an L.
        //
        // Picking pattern per footprint-rect made each arm correct in
        // isolation but introduced TWO competing brick courses meeting at
        // the inside-corner core, with neither matching the neighbor tile.
        //
        // Solution: for each variant, declare a "winner" wall (the one
        // whose bricks pass STRAIGHT through the central core) and a
        // "loser" wall (the one whose top is just the stub of footprint
        // NOT covered by the winner strip). The winner strip extends from
        // tile edge to tile edge along its axis, swallowing the central
        // core. The loser stub gets the perpendicular pattern.
        //
        // For corner-br: winner = H (strip y ∈ [off, off+W], x ∈ [off, 144]).
        //                loser  = V (stub  x ∈ [off, off+W], y ∈ [off+W, 144]).
        //
        // The choice of "H wins" for all corners/tees/cross is arbitrary
        // but consistent: H wall reads as continuous straight-through
        // wherever it meets a V wall. The V wall then butts into it on
        // the neighbor tile (the V neighbor's own straight-v top draws
        // up to the shared tile boundary, where it meets the H winner).
        const W2 = WALL_THICKNESS; const off2 = WALL_OFFSET;
        type Rect = { x:number; y:number; w:number; h:number; v:boolean };
        const tops: Rect[] = [];
        // Two pattern transforms — kept here (not hoisted) because they
        // are only used by this block. See iter14 derivation comment above
        // for why H = (1,0,0,1, off,0) and V = (0,1,-1,0, off+W,off).
        const setH = () => tPattern.setTransform({ a: 1, b: 0, c: 0, d: 1, e: off2, f: 0 });
        const setV = () => tPattern.setTransform({ a: 0, b: 1, c: -1, d: 0, e: off2 + W2, f: off2 });
        // ── Rotation-invariant texture override ─────────────────────
        // For non-brick textures (e.g. Voronoi natural stone) the
        // 90°-rotation between H winner strip and V loser stub creates
        // a visible seam at inside corners — cells from the two
        // patterns don't match across the meeting line. When
        // topRotateWithAxis === false, ALL top rects use the H
        // transform; the source texture's rotational symmetry hides
        // the fact that V rects "should" run perpendicular.
        const rotateWithAxis = nano.topRotateWithAxis !== false;
        const setForRect = (v: boolean) => (v && rotateWithAxis) ? setV() : setH();
        if (variant === 'straight-h') {
          tops.push({ x: 0, y: off2, w: 144, h: W2, v: false });
        } else if (variant === 'straight-v') {
          tops.push({ x: off2, y: 0, w: W2, h: 144, v: true });
        } else if (variant === 'corner-br') {
          // H winner: core + right arm as one strip.
          // V loser:  bottom-arm stub only.
          tops.push({ x: off2, y: off2, w: 144 - off2, h: W2, v: false });
          tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'corner-bl') {
          tops.push({ x: 0, y: off2, w: off2 + W2, h: W2, v: false });
          tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'corner-tr') {
          tops.push({ x: off2, y: off2, w: 144 - off2, h: W2, v: false });
          tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
        } else if (variant === 'corner-tl') {
          tops.push({ x: 0, y: off2, w: off2 + W2, h: W2, v: false });
          tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
        } else if (variant === 'tee-t' || variant === 'tee-b' || variant === 'cross') {
          // H winner runs the full width of the tile; V stubs hang off
          // the core to whichever side(s) the variant calls for.
          tops.push({ x: 0, y: off2, w: 144, h: W2, v: false });
          if (variant === 'tee-b' || variant === 'cross') tops.push({ x: off2, y: 0, w: W2, h: off2, v: true });
          if (variant === 'tee-t' || variant === 'cross') tops.push({ x: off2, y: off2 + W2, w: W2, h: off2, v: true });
        } else if (variant === 'tee-l' || variant === 'tee-r') {
          // No H arm in these tees → V is the only continuous run, so it
          // wins. H stub on the side that has the arm.
          tops.push({ x: off2, y: 0, w: W2, h: 144, v: true });
          if (variant === 'tee-l') tops.push({ x: off2 + W2, y: off2, w: off2, h: W2, v: false });
          else                     tops.push({ x: 0,         y: off2, w: off2, h: W2, v: false });
        } else {
          // end-* and isolated — single rect, pattern matches the wall axis.
          for (const r of rects) tops.push({ ...r, v: (variant === 'end-t' || variant === 'end-b') });
        }

        ctx.save();
        clipDiamond(ctx, cx, elevatedY + HALF_H, HALF_W, HALF_H);
        ctx.transform(ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, -ISO_X_PER_SOURCE_PX, ISO_Y_PER_SOURCE_PX, cx, elevatedY);
        for (const r of tops) {
          if (r.v) setForRect(true); else setForRect(false);
          ctx.fillStyle = tPattern;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        // (Removed per-rect strokeRect overlay — it was a debug helper that
        // drew visible orange/black dividing lines on the top face between
        // adjacent footprint rects. The brick pattern alone provides the
        // visual definition we need.)
        ctx.restore();
      } else {
        loaded = false;
      }
    } else {
      loaded = false;
    }
  } else {
    // No dedicated side texture — fall back to billboard rendering
    if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) loaded = false;
  }

  // Note: the TOP face is drawn inside the side-pattern block above (it
  // shares the same image and pattern anchor for grout continuity). We
  // intentionally ignore nano.topTextureSvg here for stone-wall — it
  // remains used by the legacy SVG render path only (AiTools).

  return loaded;
}

// ─── Stack Rendering ─────────────────────────────────────────

/**
 * Draw a full nano stack for one tile.
 *
 * Nanos in NanoStack are assumed pre-sorted: negative Z first, then flat,
 * then positive (as per the NanoStack contract in types.ts).
 *
 * Returns cumulative sink depth for player sprite positioning.
 */
export function drawNanoStack(
  ctx: CanvasRenderingContext2D,
  nanos: NanoStack,
  screenX: number,
  screenY: number,
  sun?: SunState,
  /**
   * Optional neighbor-wall flags (n/s/e/w). Used by drawExtrudedNano to
   * suppress end-cap ticks at tile boundaries when the wall continues.
   */
  neighborWalls?: { n: boolean; s: boolean; e: boolean; w: boolean },
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
        if (isRoofNanoKind(nano.kind)) {
          if (!drawRoofNano(ctx, nano, screenX, screenY)) allImagesLoaded = false;
        } else if (nano.sideTextureSvg || nano.topTextureSvg || nano.topFaceTextureSvg || nano.southFaceTextureSvg || nano.eastFaceTextureSvg) {
          if (!drawExtrudedNano(ctx, nano, screenX, screenY, sun, neighborWalls)) allImagesLoaded = false;
        } else {
          if (!drawPositiveNano(ctx, nano, screenX, screenY, sun)) allImagesLoaded = false;
        }
        break;
    }
  }

  return { sinkDepthPx, allImagesLoaded };
}

// ─── Nano Shadow Rendering ───────────────────────────────────

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
  // Only positive nanos cast shadows
  if (nano.zMode !== 'positive' || nano.zOffset <= 0) return;

  const offset = computeShadowOffset(sun, nano.zOffset);
  const shadowScale = Math.min(nano.zOffset / 6, 1);

  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${sun.shadowAlpha * 0.5})`;

  // Shadow diamond centered on tile, offset by sun angle
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
