/**
 * footprints.ts — Sub-tile blocking geometry for walls and fences.
 *
 * Walls and fences are "exact" blockers: rather than blocking the whole
 * micro tile, they have a thickness (WALL_THICKNESS / FENCE_THICKNESS)
 * and a connection-aware arm layout. A straight-h wall has just the
 * left + right arms blocking; a corner-tl has top + left arms.
 *
 * The player position is queried as a fractional (colFrac, rowFrac) in
 * [0, 1] within the micro tile. `pointHitsWallFootprint` and
 * `pointHitsFenceFootprint` return true iff the point lies in any
 * blocking rectangle of the variant's footprint.
 *
 * Must stay in sync with wall geometry in `nano-tile.ts` and the
 * experiment solver.
 */
import { ISO_MICRO_TILE_SIZE as MICRO_TILE_SIZE } from '../../types/iso-renderer.types.js';
import type { IsoFeatureVariant as FeatureVariant } from '../../types/iso-renderer.types.js';

/** Wall arm thickness in micro-tile pixels (must match nano-tile.ts geometry). */
export const WALL_THICKNESS = 48;
/** Wall arm offset from the corner (so arms are centered on each side). */
export const WALL_OFFSET = (MICRO_TILE_SIZE - WALL_THICKNESS) / 2;
/** Fence thickness — thinner than walls so gates are passable when unlocked. */
export const FENCE_THICKNESS = 18;

/** Axis-aligned rectangle in micro-tile pixel coordinates. */
export interface FootprintRect {
  x: number; y: number; w: number; h: number;
}

/** Test whether a point lies inside an axis-aligned rectangle. */
export function rectContainsPoint(
  rect: FootprintRect,
  x: number,
  y: number,
): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/**
 * Compute the blocking rectangles for a wall of the given variant.
 * `isolated` returns a single center square; the connection variants
 * return the center square plus one arm per connected side.
 */
export function wallBounds(variant: FeatureVariant): { rects: FootprintRect[] } {
  const W = WALL_THICKNESS;
  const off = WALL_OFFSET;
  const rects: FootprintRect[] = [];
  const arms = { top: false, right: false, bottom: false, left: false };

  switch (variant) {
    case 'straight-h': arms.left = true; arms.right = true; break;
    case 'straight-v': arms.top = true; arms.bottom = true; break;
    case 'corner-tr': arms.top = true; arms.right = true; break;
    case 'corner-tl': arms.top = true; arms.left = true; break;
    case 'corner-br': arms.bottom = true; arms.right = true; break;
    case 'corner-bl': arms.bottom = true; arms.left = true; break;
    case 'cross': arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t': arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b': arms.left = arms.right = arms.top = true; break;
    case 'tee-r': arms.top = arms.bottom = arms.left = true; break;
    case 'tee-l': arms.top = arms.bottom = arms.right = true; break;
    case 'end-t': arms.top = true; break;
    case 'end-b': arms.bottom = true; break;
    case 'end-r': arms.left = true; break;
    case 'end-l': arms.right = true; break;
    default:
      rects.push({ x: off, y: off, w: W, h: W });
      return { rects };
  }

  rects.push({ x: off, y: off, w: W, h: W });
  if (arms.top) rects.push({ x: off, y: 0, w: W, h: off });
  if (arms.bottom) rects.push({ x: off, y: off + W, w: W, h: off });
  if (arms.left) rects.push({ x: 0, y: off, w: off, h: W });
  if (arms.right) rects.push({ x: off + W, y: off, w: off, h: W });
  return { rects };
}

/**
 * Like `wallBounds` but with a configurable thickness — used for fences
 * which are thinner (18px vs walls at 48px) so the player can squeeze
 * through unlocked gates.
 */
function footprintBounds(variant: FeatureVariant, thickness: number): { rects: FootprintRect[] } {
  const off = (MICRO_TILE_SIZE - thickness) / 2;
  const rects: FootprintRect[] = [];
  const arms = { top: false, right: false, bottom: false, left: false };

  switch (variant) {
    case 'straight-h': arms.left = true; arms.right = true; break;
    case 'straight-v': arms.top = true; arms.bottom = true; break;
    case 'corner-tr': arms.top = true; arms.right = true; break;
    case 'corner-tl': arms.top = true; arms.left = true; break;
    case 'corner-br': arms.bottom = true; arms.right = true; break;
    case 'corner-bl': arms.bottom = true; arms.left = true; break;
    case 'cross': arms.top = arms.right = arms.bottom = arms.left = true; break;
    case 'tee-t': arms.left = arms.right = arms.bottom = true; break;
    case 'tee-b': arms.left = arms.right = arms.top = true; break;
    case 'tee-r': arms.top = arms.bottom = arms.left = true; break;
    case 'tee-l': arms.top = arms.bottom = arms.right = true; break;
    case 'end-t': arms.top = true; break;
    case 'end-b': arms.bottom = true; break;
    case 'end-r': arms.left = true; break;
    case 'end-l': arms.right = true; break;
    default:
      rects.push({ x: off, y: off, w: thickness, h: thickness });
      return { rects };
  }

  rects.push({ x: off, y: off, w: thickness, h: thickness });
  if (arms.top) rects.push({ x: off, y: 0, w: thickness, h: off });
  if (arms.bottom) rects.push({ x: off, y: off + thickness, w: thickness, h: off });
  if (arms.left) rects.push({ x: 0, y: off, w: off, h: thickness });
  if (arms.right) rects.push({ x: off + thickness, y: off, w: off, h: thickness });
  return { rects };
}

/** Test whether a fractional point lies within a wall variant's blocking footprint. */
export function pointHitsWallFootprint(
  variant: FeatureVariant,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  const x = Math.max(0, Math.min(MICRO_TILE_SIZE, localColFrac * MICRO_TILE_SIZE));
  const y = Math.max(0, Math.min(MICRO_TILE_SIZE, localRowFrac * MICRO_TILE_SIZE));
  return wallBounds(variant).rects.some(rect => rectContainsPoint(rect, x, y));
}

/** Test whether a fractional point lies within a fence variant's blocking footprint. */
export function pointHitsFenceFootprint(
  variant: FeatureVariant,
  localColFrac: number,
  localRowFrac: number,
): boolean {
  const x = Math.max(0, Math.min(MICRO_TILE_SIZE, localColFrac * MICRO_TILE_SIZE));
  const y = Math.max(0, Math.min(MICRO_TILE_SIZE, localRowFrac * MICRO_TILE_SIZE));
  return footprintBounds(variant, FENCE_THICKNESS).rects.some(rect => rectContainsPoint(rect, x, y));
}