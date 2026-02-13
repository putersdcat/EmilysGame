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
import { getIsoTile, getGrassVariant } from './tiles';
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
  /** Local screen positions of water tiles for animated overlay */
  waterPositions: { lsx: number; lsy: number }[];
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
  const waterPositions: { lsx: number; lsy: number }[] = [];

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
        // Use grass variants for visual variety
        const tileCanvas = def.tileType === 'grass'
          ? getGrassVariant(chunk.chunkX * SIZE + cx, chunk.chunkY * SIZE + cy)
          : getIsoTile(def.tileType);
        if (tileCanvas) {
          ctx.drawImage(tileCanvas, lsx - 32, lsy - 16);
        }
        // Track water tile positions for animated overlay
        if (def.tileType === 'water') {
          waterPositions.push({ lsx, lsy });
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
    waterPositions,
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

  // Draw animated water wave overlays if chunk has water tiles
  if (cached.waterPositions.length > 0) {
    drawWaterOverlays(ctx, cached.waterPositions, destX, destY, waterAnimFrame);
  }
}

// ─── Animated Water Wave Overlay ──────────────────────────────
// Pre-rendered wave overlay frames blitted on top of cached water tiles.

const WATER_FRAME_COUNT = 4;
let waterAnimFrame = 0;
let waterFrameTimer = 0;

/** Pre-rendered wave overlay canvases (one per frame, 64x32 each). */
const waterOverlayFrames: HTMLCanvasElement[] = [];

/**
 * Build the 4-frame wave overlay sprites.
 * Each frame shifts the wave pattern by 25% of a wavelength.
 */
function buildWaterOverlayFrames(): void {
  for (let f = 0; f < WATER_FRAME_COUNT; f++) {
    const c = document.createElement('canvas');
    c.width = TW;   // 64
    c.height = TH;  // 32
    const cx = c.getContext('2d')!;

    // Clip to isometric diamond shape
    cx.beginPath();
    cx.moveTo(TW / 2, 0);       // top
    cx.lineTo(TW, TH / 2);      // right
    cx.lineTo(TW / 2, TH);      // bottom
    cx.lineTo(0, TH / 2);       // left
    cx.closePath();
    cx.clip();

    // Phase offset for this frame
    const phase = (f / WATER_FRAME_COUNT) * Math.PI * 2;

    // Draw 3 animated wave lines across the diamond
    cx.strokeStyle = 'rgba(255,255,255,0.35)';
    cx.lineWidth = 1.5;
    for (let row = 0; row < 3; row++) {
      const baseY = 8 + row * 10;
      cx.beginPath();
      for (let px = 0; px <= TW; px += 2) {
        const wy = baseY + Math.sin((px / 16) * Math.PI + phase + row * 1.2) * 2.5;
        if (px === 0) cx.moveTo(px, wy);
        else cx.lineTo(px, wy);
      }
      cx.stroke();
    }

    // Add subtle sparkle highlights
    cx.fillStyle = 'rgba(255,255,255,0.3)';
    const sparkleX = 16 + Math.cos(phase) * 12;
    const sparkleY = 12 + Math.sin(phase * 0.7) * 6;
    cx.beginPath();
    cx.arc(sparkleX, sparkleY, 1.5, 0, Math.PI * 2);
    cx.fill();
    const sparkle2X = 48 + Math.cos(phase + 2) * 10;
    const sparkle2Y = 20 + Math.sin(phase * 0.5 + 1) * 5;
    cx.beginPath();
    cx.arc(sparkle2X, sparkle2Y, 1, 0, Math.PI * 2);
    cx.fill();

    waterOverlayFrames.push(c);
  }
}

/**
 * Draw animated wave overlay at water tile positions.
 * Called during the live render pass (not cached).
 */
function drawWaterOverlays(
  ctx: CanvasRenderingContext2D,
  positions: { lsx: number; lsy: number }[],
  destX: number,
  destY: number,
  frame: number,
): void {
  if (waterOverlayFrames.length === 0) buildWaterOverlayFrames();
  const overlay = waterOverlayFrames[frame % WATER_FRAME_COUNT];
  for (let i = 0; i < positions.length; i++) {
    const wx = destX + positions[i].lsx - 32;
    const wy = destY + positions[i].lsy - 16;
    // Quick per-tile bounds check
    if (wx + TW < 0 || wx > RENDER_CONFIG.canvasWidth ||
        wy + TH < 0 || wy > RENDER_CONFIG.canvasHeight) continue;
    ctx.drawImage(overlay, wx, wy);
  }
}

/**
 * Advance the water animation frame. Call from game loop (throttled).
 */
export function tickWaterAnimation(): void {
  waterFrameTimer++;
  // Advance every 15 frames (~4fps wave animation at 60fps game)
  if (waterFrameTimer >= 15) {
    waterFrameTimer = 0;
    waterAnimFrame = (waterAnimFrame + 1) % WATER_FRAME_COUNT;
  }
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
