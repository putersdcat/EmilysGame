/**
 * iso-geometry.ts — Bridge to the game engine coordinate system.
 *
 * Re-exports PURE constants and math from src/types.ts — no Canvas deps.
 * All values must stay in sync with the game engine.
 * DO NOT duplicate these constants locally in any AiTools file.
 *
 * Transform reference (from nano-tile.ts):
 *   Base tile (flat):  ctx.transform(1, 0.5, -1, 0.5, halfW, 0)   ← iso diamond
 *   Nano (upright):    ctx.transform(1, 0.5, 0,  1,   0,   0)    ← z-pinned billboard
 *
 * Coordinate layout for tile at (col, row):
 *   sx = (col - row) * HALF_W   (worldToIso x component)
 *   sy = (col + row) * HALF_H   (worldToIso y component)
 *   drawX = sx + originX - ISO_TILE_WIDTH  / 2   ← bounding box left edge
 *   drawY = sy + originY - ISO_TILE_HEIGHT / 2   ← bounding box top edge
 *   left-vertex = (drawX,          drawY + HALF_H)   ← nano z-pinned anchor
 *   top-vertex  = (drawX + HALF_W, drawY)
 *   right-vertex= (drawX + ISO_TILE_WIDTH, drawY + HALF_H)
 *   bottom-vertex=(drawX + HALF_W, drawY + ISO_TILE_HEIGHT) ← player ground point
 *
 * TODO: DOC
 */

// ─── Import from game engine (pure — no Canvas deps) ─────────
export {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  MICRO_TILE_SIZE,
  worldToIso,
} from '../src/types.js';

import { ISO_TILE_WIDTH, ISO_TILE_HEIGHT } from '../src/types.js';

/** Half-width of the iso tile diamond (= ISO_TILE_WIDTH / 2). */
export const HALF_W = ISO_TILE_WIDTH / 2;   // 128

/** Half-height of the iso tile diamond (= ISO_TILE_HEIGHT / 2). */
export const HALF_H = ISO_TILE_HEIGHT / 2;  // 64

/**
 * Visual height multiplier for nano Z rendering.
 * MUST stay in sync with nano-tile.ts: export const NANO_Z_SCALE = 12.
 * Controls how many pixels tall a zOffset=1 nano is.
 */
export const NANO_Z_SCALE = 12;  // nano-tile.ts:37

/**
 * Pixel sink depth per Z level for NEGATIVE nanos (rivers/trenches).
 * MUST stay in sync with tile.ts: Z_PX_PER_LEVEL = 4.
 */
export const Z_PX_PER_LEVEL = 4; // tile.ts

/** Minimum nano height in pixels — nano-tile.ts:MIN_NANO_HEIGHT. */
export const MIN_NANO_HEIGHT = 16;

/**
 * Compute bounding-box screen position for a tile at (col, row).
 * Equivalent to chunk.ts:  drawX = sx + ORIGIN_X - ISO_TILE_WIDTH/2
 *                           drawY = sy + padTop  - ISO_TILE_HEIGHT/2
 * @param col     world column
 * @param row     world row
 * @param originX canvas x where tile (0,0) top-vertex lands
 * @param originY canvas y where tile (0,0) top-vertex lands
 * @returns { drawX, drawY } — top-left of the 256×128 bounding box
 */
export function tileScreenPos(
  col: number, row: number,
  originX: number, originY: number,
): { drawX: number; drawY: number } {
  return {
    drawX: (col - row) * HALF_W + originX - HALF_W,  // = sx + originX - 128
    drawY: (col + row) * HALF_H + originY - HALF_H,  // = sy + originY - 64
  };
}

/**
 * Left vertex of the tile diamond — the anchor for drawPositiveNano().
 * Equivalent to (screenX, screenY + HALF_H) in nano-tile.ts.
 */
export function tileLeftVertex(
  col: number, row: number,
  originX: number, originY: number,
): { x: number; y: number } {
  return {
    x: (col - row) * HALF_W + originX - HALF_W,  // drawX
    y: (col + row) * HALF_H + originY,            // drawY + HALF_H
  };
}

/**
 * Center x and bottom-vertex y of the tile diamond.
 * Used for player sprite ground placement.
 * Bottom vertex = (drawX + HALF_W, drawY + ISO_TILE_HEIGHT)
 */
export function tileBottomVertex(
  col: number, row: number,
  originX: number, originY: number,
): { x: number; y: number } {
  return {
    x: (col - row) * HALF_W + originX,             // drawX + HALF_W = top/bottom center x
    y: (col + row) * HALF_H + originY + HALF_H,   // drawY + ISO_TILE_HEIGHT = bottom vertex y
  };
}
