/**
 * nano-structure.ts — reusable projected-geometry helpers for authored Iso2 structures.
 *
 * These helpers keep cottage/castle/cathedral primitives on the nano renderer
 * path while sharing the same source-space projection, face clipping, texture
 * fills, and detail placement rules. Keep this module pure Canvas math: no game
 * state, no DOM, no asset config imports.
 */

import {
  ISO_DIAMOND_HEIGHT as ISO_TILE_HEIGHT,
  ISO_DIAMOND_WIDTH as ISO_TILE_WIDTH,
  ISO_MICRO_TILE_SIZE as MICRO_TILE_SIZE,
} from '../../types/iso-renderer.types';

export const STRUCT_HALF_W = ISO_TILE_WIDTH / 2;
export const STRUCT_HALF_H = ISO_TILE_HEIGHT / 2;
export const STRUCT_ISO_X_PER_SOURCE_PX = STRUCT_HALF_W / MICRO_TILE_SIZE;
export const STRUCT_ISO_Y_PER_SOURCE_PX = STRUCT_HALF_H / MICRO_TILE_SIZE;

export interface StructPoint3 { readonly x: number; readonly y: number; readonly z: number; }
export interface StructPoint2 { readonly x: number; readonly y: number; }
export type StructFace = readonly [StructPoint3, StructPoint3, StructPoint3, StructPoint3];
export type StructTri = readonly [StructPoint3, StructPoint3, StructPoint3];
export type SvgImageLoader = (svg: string) => HTMLImageElement | null;

export function projectStructPoint(screenX: number, screenY: number, p: StructPoint3): StructPoint2 {
  return {
    x: screenX + (p.x - p.y) * STRUCT_ISO_X_PER_SOURCE_PX + STRUCT_HALF_W,
    y: screenY + (p.x + p.y) * STRUCT_ISO_Y_PER_SOURCE_PX - p.z,
  };
}

export function pathStructFace(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  face: StructFace,
): void {
  const p0 = projectStructPoint(screenX, screenY, face[0]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < face.length; i++) {
    const p = projectStructPoint(screenX, screenY, face[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

export function strokeStructPath(
  ctx: CanvasRenderingContext2D,
  stroke = 'rgba(54,38,24,0.70)',
  width = 1.05,
): void {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function fillStructFace(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  face: StructFace,
  fill: string | CanvasGradient | CanvasPattern,
  stroke = 'rgba(54,38,24,0.70)',
): void {
  pathStructFace(ctx, screenX, screenY, face);
  ctx.fillStyle = fill;
  ctx.fill();
  strokeStructPath(ctx, stroke);
}

export function fillStructTri(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tri: StructTri,
  fill: string | CanvasPattern,
  stroke = 'rgba(54,38,24,0.70)',
): void {
  const p0 = projectStructPoint(screenX, screenY, tri[0]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < tri.length; i++) {
    const p = projectStructPoint(screenX, screenY, tri[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  strokeStructPath(ctx, stroke, 1);
}

export function fillTexturedStructFace(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  face: StructFace,
  textureSvg: string,
  _loadSvgImage: SvgImageLoader,
  fallback: string,
  stroke = 'rgba(54,38,24,0.70)',
): boolean {
  pathStructFace(ctx, screenX, screenY, face);
  ctx.save();
  ctx.clip();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p3 of face) {
    const p = projectStructPoint(screenX, screenY, p3);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  ctx.fillStyle = fallback;
  ctx.fillRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
  drawSafeMaterialMarks(ctx, textureSvg, minX, minY, maxX, maxY);
  ctx.restore();
  strokeStructPath(ctx, stroke);
  return true;
}

export function fillTexturedStructTri(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  tri: StructTri,
  textureSvg: string,
  _loadSvgImage: SvgImageLoader,
  fallback: string,
  stroke = 'rgba(54,38,24,0.70)',
): boolean {
  const p0 = projectStructPoint(screenX, screenY, tri[0]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < tri.length; i++) {
    const p = projectStructPoint(screenX, screenY, tri[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.save();
  ctx.clip();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p3 of tri) {
    const p = projectStructPoint(screenX, screenY, p3);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  ctx.fillStyle = fallback;
  ctx.fillRect(minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY));
  drawSafeMaterialMarks(ctx, textureSvg, minX, minY, maxX, maxY);
  ctx.restore();
  strokeStructPath(ctx, stroke, 1);
  return true;
}

function materialHash(seedText: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function drawSafeMaterialMarks(
  ctx: CanvasRenderingContext2D,
  textureSvg: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const seed = materialHash(textureSvg);
  const roofLike = textureSvg.includes('#a98a38') || textureSvg.includes('#80652d');
  const stoneLike = textureSvg.includes('#3a3634') || textureSvg.includes('#6d6458');
  const step = roofLike ? 7 : stoneLike ? 13 : 8;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = roofLike ? 1.2 : 0.9;
  ctx.globalAlpha = roofLike ? 0.34 : stoneLike ? 0.18 : 0.20;
  ctx.strokeStyle = roofLike
    ? 'rgba(80,52,18,0.72)'
    : stoneLike
      ? 'rgba(31,29,28,0.62)'
      : 'rgba(92,70,43,0.54)';

  for (let i = 0; i < 18; i++) {
    const a = ((seed >>> (i % 16)) & 15) / 15;
    const b = (((seed * (i + 3)) >>> 5) & 31) / 31;
    const x = minX + ((i * step + a * 13) % w);
    const y = minY + ((i * (step + 3) + b * 17) % h);
    ctx.beginPath();
    if (roofLike) {
      ctx.moveTo(x - 9, y - 3);
      ctx.lineTo(x + 13, y + 5);
    } else if (stoneLike) {
      // Short staggered courses read as masonry; avoid plus/cross marks that
      // look like debug overlays at normal zoom.
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 9, y + 1.5);
      if ((i & 1) === 0) {
        ctx.moveTo(x - 1, y - 5);
        ctx.lineTo(x - 1, y - 1);
      }
    } else {
      ctx.moveTo(x - 5, y - 4);
      ctx.lineTo(x + 6, y + 4);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFaceRectDetail(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  axis: 'south' | 'east',
  origin: StructPoint3,
  width: number,
  height: number,
  fill: string,
  stroke = 'rgba(38,26,16,0.74)',
): void {
  const right = axis === 'south'
    ? { x: origin.x + width, y: origin.y, z: origin.z }
    : { x: origin.x, y: origin.y + width, z: origin.z };
  const rightTop = { x: right.x, y: right.y, z: origin.z + height };
  const top = { x: origin.x, y: origin.y, z: origin.z + height };
  fillStructFace(ctx, screenX, screenY, [origin, right, rightTop, top], fill, stroke);
}

export function drawStructShadow(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha = 0.18,
): void {
  const p = projectStructPoint(screenX, screenY, { x, y, z: 0 });
  ctx.beginPath();
  ctx.ellipse(p.x + 2, p.y + 6, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(26,18,10,${alpha})`;
  ctx.fill();
}
