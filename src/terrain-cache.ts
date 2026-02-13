/**
 * terrain-cache.ts - Offscreen canvas caching for chunk base terrain.
 * Renders each chunk's base tiles once to an OffscreenCanvas, then blits
 * the cached image per frame instead of hundreds of individual tile draws.
 * 
 * Isometric 32x32 chunk with 64x32 tiles spans:
 *   Width:  ~2048px, Height: ~1024px
 * 
 * TODO: DOC - terrain cache strategy, invalidation, memory budget
 */

import { RENDER_CONFIG, WORLD_CONFIG } from './config/game.config';
import { ASSET_DEFS } from './config/assets.config';
import { getBiome } from './config/biomes.config';
import { getIsoTile } from './tiles';
import { getEmojiSprite } from './emoji-cache';
import type { ChunkData } from './gen';

// --- Chunk canvas cache ---

interface CachedChunkTerrain {
  canvas: HTMLCanvasElement;
  /** Isometric origin offset: world-space chunk origin in pre-rendered canvas */
  originX: number;
  originY: number;
  /** Generation stamp - invalidate if chunk is modified */
  stamp: number;
}

const chunkCache = new Map<string, CachedChunkTerrain>();
let cacheStamp = 0;

// Chunk content dimensions (computed from chunk size & tile dims)
const SIZE = WORLD_CONFIG.chunkSize; // 25 (5×5 world units)
const TW = RENDER_CONFIG.tileWidth;  // 64
const TH = RENDER_CONFIG.tileHeight; // 32
const HALF_TW = TW / 2;             // 32
const HALF_TH = TH / 2;             // 16

// Full-res chunk pixel dimensions (computed from chunk size)
const CHUNK_PX_W = (SIZE * 2) * HALF_TW + TW;
const CHUNK_PX_H = SIZE * 2 * HALF_TH + TH;

// Origin offset within the canvas (where local 0,0 maps to)
const ORIGIN_X = SIZE * HALF_TW;
const ORIGIN_Y = HALF_TH;

/**
 * Get or create cached terrain canvas for a chunk.
 * Only base-layer tiles (terrain) are cached; objects are drawn live.
 */
export function getCachedTerrain(chunkKey: string, chunk: ChunkData): CachedChunkTerrain {
  let entry = chunkCache.get(chunkKey);
  if (entry) return entry;

  // Create scaled-down offscreen canvas for this chunk's base terrain
  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_PX_W;
  canvas.height = CHUNK_PX_H;
  const ctx = canvas.getContext('2d')!;

  const biome = getBiome(chunk.biomeId);

  // Render base terrain tiles (at TCSCALE resolution)
  for (let cy = 0; cy < SIZE; cy++) {
    for (let cx = 0; cx < SIZE; cx++) {
      const cell = chunk.cells[cy][cx];
      const def = ASSET_DEFS[cell.assetKey];
      if (!def || def.layer !== 'base') continue;

      // Local isometric position within chunk canvas (full-res coords, ctx.scale handles it)
      const lsx = (cx - cy) * HALF_TW + ORIGIN_X;
      const lsy = (cx + cy) * HALF_TH + ORIGIN_Y;

      if (def.tileType) {
        const tileCanvas = getIsoTile(def.tileType);
        if (tileCanvas) {
          ctx.drawImage(tileCanvas, lsx - 32, lsy - 16);
        }
      } else {
        const sprite = getEmojiSprite(def.emoji, biome.tintHue);
        const size = sprite.width * def.scale;
        ctx.drawImage(sprite, lsx - size / 2, lsy - size / 2, size, size);
      }
    }
  }

  // --- Auto-tile transitions: subtle edge darkening at tile-type boundaries ---
  renderAutoTileTransitions(ctx, chunk);

  entry = {
    canvas,
    originX: ORIGIN_X,
    originY: ORIGIN_Y,
    stamp: cacheStamp++,
  };
  chunkCache.set(chunkKey, entry);
  return entry;
}

/**
 * Draw a cached chunk's terrain onto the main canvas.
 * Translates chunk world coordinates to screen position.
 */
export function drawCachedChunkTerrain(
  ctx: CanvasRenderingContext2D,
  chunkKey: string,
  chunk: ChunkData,
  cameraX: number,
  cameraY: number,
): void {
  const cached = getCachedTerrain(chunkKey, chunk);

  // Chunk's world-space origin (cell 0,0 of this chunk in grid coords)
  const chunkGX = chunk.chunkX * SIZE;
  const chunkGY = chunk.chunkY * SIZE;

  // Convert chunk origin from grid to screen coordinates
  const rx = chunkGX - cameraX;
  const ry = chunkGY - cameraY;
  const screenX = (rx - ry) * HALF_TW + RENDER_CONFIG.canvasWidth / 2;
  const screenY = (rx + ry) * HALF_TH + RENDER_CONFIG.canvasHeight / 3;

  // Offset by the pre-rendered canvas origin
  const destX = screenX - cached.originX;
  const destY = screenY - cached.originY;

  // Quick bounds check: skip if entirely off screen
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  if (destX + CHUNK_PX_W < 0 || destX > cw ||
      destY + CHUNK_PX_H < 0 || destY > ch) {
    return;
  }

  ctx.drawImage(cached.canvas, destX, destY);
}

// ─── Auto-Tile Transitions ───────────────────────────────────
// Draws subtle edge darkening where adjacent cells have different base tile types.
// Applied to the terrain cache so it renders once, not per-frame.

/** Color for transition edge overlays (semi-transparent dark) */
const TRANSITION_ALPHA = 0.12;

function getBaseTileType(chunk: ChunkData, cx: number, cy: number): string | null {
  if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) return null;
  const cell = chunk.cells[cy][cx];
  const def = ASSET_DEFS[cell.assetKey];
  if (!def || def.layer !== 'base') return null;
  return def.tileType ?? def.emoji ?? cell.assetKey;
}

function renderAutoTileTransitions(
  ctx: CanvasRenderingContext2D,
  chunk: ChunkData,
): void {
  ctx.save();
  ctx.globalAlpha = TRANSITION_ALPHA;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;

  for (let cy = 0; cy < SIZE; cy++) {
    for (let cx = 0; cx < SIZE; cx++) {
      const myType = getBaseTileType(chunk, cx, cy);
      if (!myType) continue;

      const lsx = (cx - cy) * HALF_TW + ORIGIN_X;
      const lsy = (cx + cy) * HALF_TH + ORIGIN_Y;

      // Check 4 cardinal neighbors; draw edge segment where type differs
      // Isometric diamond edges: top-right(+1,0), bottom-right(0,+1), bottom-left(-1,0), top-left(0,-1)
      const neighbors = [
        { dx: 1, dy: 0 },  // east neighbor → top-right edge
        { dx: 0, dy: 1 },  // south neighbor → bottom-right edge
        { dx: -1, dy: 0 }, // west neighbor → bottom-left edge
        { dx: 0, dy: -1 }, // north neighbor → top-left edge
      ];

      for (let ni = 0; ni < 4; ni++) {
        const nbType = getBaseTileType(chunk, cx + neighbors[ni].dx, cy + neighbors[ni].dy);
        if (nbType === null || nbType === myType) continue;

        // Draw the isometric diamond edge between this cell and the differing neighbor
        ctx.beginPath();
        switch (ni) {
          case 0: // east → top-right edge: top to right
            ctx.moveTo(lsx, lsy - HALF_TH);
            ctx.lineTo(lsx + HALF_TW, lsy);
            break;
          case 1: // south → bottom-right edge: right to bottom
            ctx.moveTo(lsx + HALF_TW, lsy);
            ctx.lineTo(lsx, lsy + HALF_TH);
            break;
          case 2: // west → bottom-left edge: bottom to left
            ctx.moveTo(lsx, lsy + HALF_TH);
            ctx.lineTo(lsx - HALF_TW, lsy);
            break;
          case 3: // north → top-left edge: left to top
            ctx.moveTo(lsx - HALF_TW, lsy);
            ctx.lineTo(lsx, lsy - HALF_TH);
            break;
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * Invalidate a chunk's cached terrain (e.g. when chunk content changes).
 */
export function invalidateChunkTerrain(chunkKey: string): void {
  chunkCache.delete(chunkKey);
}

/**
 * Clear all cached terrain (e.g. when viewport resizes significantly).
 */
export function clearTerrainCache(): void {
  chunkCache.clear();
}

/**
 * Number of cached chunks (for debug display).
 */
export function getTerrainCacheSize(): number {
  return chunkCache.size;
}
