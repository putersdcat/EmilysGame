/**
 * nano-roof.ts — D.10 sloped roof geometry port.
 *
 * Ported from experiment/isometric-2.0/src/nano-tile.ts drawRoofNano().
 * Adapter note: main passes loadSvgImage in from nano-tile.ts so this helper
 * does not import nano-tile.ts and create a renderer circular dependency.
 */

import {
  ISO_DIAMOND_WIDTH as ISO_TILE_WIDTH,
  ISO_DIAMOND_HEIGHT as ISO_TILE_HEIGHT,
  ISO_MICRO_TILE_SIZE as MICRO_TILE_SIZE,
  type IsoNanoTile as NanoTile,
} from '../types/iso-renderer.types';

const HALF_W = ISO_TILE_WIDTH / 2;
const HALF_H = ISO_TILE_HEIGHT / 2;
const ISO_X_PER_SOURCE_PX = HALF_W / MICRO_TILE_SIZE;
const ISO_Y_PER_SOURCE_PX = HALF_H / MICRO_TILE_SIZE;
const NANO_Z_SCALE = 12;
const MIN_NANO_HEIGHT = 16;
const WALL_THICKNESS = MICRO_TILE_SIZE / 3;
const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;

type RoofPoint = { x: number; y: number };
interface RoofGeometry {
  readonly highNorth: boolean;
  readonly nw: RoofPoint;
  readonly sw: RoofPoint;
  readonly se: RoofPoint;
  readonly ne: RoofPoint;
  readonly nwBase: RoofPoint;
  readonly swBase: RoofPoint;
  readonly seBase: RoofPoint;
  readonly neBase: RoofPoint;
}
export type SvgImageLoader = (svg: string) => HTMLImageElement | null;

export function isRoofNanoKind(kind: NanoTile['kind']): boolean {
  return kind === 'roof-slope-left' || kind === 'roof-slope-right' || kind === 'roof-ridge';
}

function drawClippedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pts: ReadonlyArray<RoofPoint>,
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

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(img, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
  ctx.restore();
}

function buildRoofGeometry(nano: NanoTile, screenX: number, screenY: number): RoofGeometry {
  const baseZ = Math.max(nano.zOffset * NANO_Z_SCALE, MIN_NANO_HEIGHT);
  const roofH = MIN_NANO_HEIGHT;
  const x0 = WALL_OFFSET;
  const x1 = WALL_OFFSET + WALL_THICKNESS;
  const y0 = WALL_OFFSET;
  const y1 = WALL_OFFSET + WALL_THICKNESS;
  const p = (tx: number, ty: number, z: number): RoofPoint => ({
    x: screenX + (tx - ty) * ISO_X_PER_SOURCE_PX + HALF_W,
    y: screenY + (tx + ty) * ISO_Y_PER_SOURCE_PX - z,
  });

  const highNorth = nano.kind !== 'roof-slope-right';
  const zNorth = highNorth ? baseZ + roofH : baseZ;
  const zSouth = highNorth ? baseZ : baseZ + roofH;
  return {
    highNorth,
    nw: p(x0, y0, zNorth),
    sw: p(x0, y1, zSouth),
    se: p(x1, y1, zSouth),
    ne: p(x1, y0, zNorth),
    nwBase: p(x0, y0, baseZ),
    swBase: p(x0, y1, baseZ),
    seBase: p(x1, y1, baseZ),
    neBase: p(x1, y0, baseZ),
  };
}

function strokeRoofLine(ctx: CanvasRenderingContext2D, a: RoofPoint, b: RoofPoint): void {
  ctx.strokeStyle = 'rgba(52,38,14,0.84)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawRidgeRoof(ctx: CanvasRenderingContext2D, img: HTMLImageElement, g: RoofGeometry): void {
  const highA = g.highNorth ? g.nw : g.sw;
  const highB = g.highNorth ? g.ne : g.se;
  const dx = highB.x - highA.x;
  const dy = highB.y - highA.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ox = -dy / len * 4;
  const oy = dx / len * 4;
  drawClippedImage(ctx, img, [
    { x: highA.x + ox, y: highA.y + oy },
    { x: highA.x - ox, y: highA.y - oy },
    { x: highB.x - ox, y: highB.y - oy },
    { x: highB.x + ox, y: highB.y + oy },
  ]);
  strokeRoofLine(ctx, highA, highB);
}

function fillGableFace(ctx: CanvasRenderingContext2D, tri: readonly RoofPoint[], gableImg: HTMLImageElement | null): void {
  ctx.beginPath();
  ctx.moveTo(tri[0]!.x, tri[0]!.y);
  ctx.lineTo(tri[1]!.x, tri[1]!.y);
  ctx.lineTo(tri[2]!.x, tri[2]!.y);
  ctx.closePath();
  if (gableImg) {
    ctx.save();
    ctx.clip();
    const minX = Math.min(tri[0]!.x, tri[1]!.x, tri[2]!.x);
    const minY = Math.min(tri[0]!.y, tri[1]!.y, tri[2]!.y);
    const maxX = Math.max(tri[0]!.x, tri[1]!.x, tri[2]!.x);
    const maxY = Math.max(tri[0]!.y, tri[1]!.y, tri[2]!.y);
    ctx.drawImage(gableImg, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
    ctx.restore();
  } else {
    ctx.fillStyle = '#d8c7a5';
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(66,49,20,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGables(ctx: CanvasRenderingContext2D, nano: NanoTile, g: RoofGeometry, gableImg: HTMLImageElement | null): void {
  const westTri = g.highNorth ? [g.nwBase, g.nw, g.swBase] : [g.nwBase, g.sw, g.swBase];
  const eastTri = g.highNorth ? [g.neBase, g.seBase, g.ne] : [g.neBase, g.ne, g.seBase];
  const variant = nano.variant ?? 'isolated';
  if (variant === 'isolated' || variant === 'end-l') fillGableFace(ctx, westTri, gableImg);
  if (variant === 'isolated' || variant === 'end-r') fillGableFace(ctx, eastTri, gableImg);
}

function strokeSlopeFace(ctx: CanvasRenderingContext2D, pts: readonly RoofPoint[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(66,49,20,0.82)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawSlopeRoof(ctx: CanvasRenderingContext2D, nano: NanoTile, img: HTMLImageElement, g: RoofGeometry): void {
  const slopeFace = [g.nw, g.ne, g.se, g.sw];
  drawClippedImage(ctx, img, slopeFace);
  if (nano.kind === 'roof-slope-right') {
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath();
    ctx.moveTo(slopeFace[0]!.x, slopeFace[0]!.y);
    for (let i = 1; i < slopeFace.length; i++) ctx.lineTo(slopeFace[i]!.x, slopeFace[i]!.y);
    ctx.closePath();
    ctx.fill();
  }
  strokeSlopeFace(ctx, slopeFace);
}

/** Draw a 48×48×48 wedge roof nano on the central 48×48 wall footprint. */
export function drawRoofNano(
  ctx: CanvasRenderingContext2D,
  nano: NanoTile,
  screenX: number,
  screenY: number,
  loadSvgImage: SvgImageLoader,
): boolean {
  const img = loadSvgImage(nano.svg);
  if (!img) return false;
  const gableImg = nano.sideTextureSvg ? loadSvgImage(nano.sideTextureSvg) : null;
  const geometry = buildRoofGeometry(nano, screenX, screenY);

  ctx.save();
  ctx.lineJoin = 'round';

  if (nano.kind === 'roof-ridge') {
    drawRidgeRoof(ctx, img, geometry);
    ctx.restore();
    return true;
  }

  drawGables(ctx, nano, geometry, gableImg);
  drawSlopeRoof(ctx, nano, img, geometry);

  ctx.restore();
  return true;
}
