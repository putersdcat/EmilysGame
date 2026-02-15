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
import { getIsoTile, getGrassVariant, getDirtVariant, getRockVariant, getSandVariant, getStoneFloorVariant } from './tiles';
import { getEmojiSprite } from './emoji-cache';
import { cellJitter } from './utils';
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
export function getCachedTerrain(
  chunkKey: string,
  chunk: ChunkData,
  allChunks?: Map<string, ChunkData>,
): CachedChunkTerrain {
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

      // Global cell coords for tile variants and jitter (#82)
      const globalCX = chunk.chunkX * SIZE + cx;
      const globalCY = chunk.chunkY * SIZE + cy;

      if (def.tileType) {
        // Use tile variants for visual variety (grass/dirt/rock have multiple patterns)
        let tileCanvas: HTMLCanvasElement | undefined;
        if (def.tileType === 'grass') {
          tileCanvas = getGrassVariant(globalCX, globalCY);
        } else if (def.tileType === 'dirt') {
          tileCanvas = getDirtVariant(globalCX, globalCY);
        } else if (def.tileType === 'rock') {
          tileCanvas = getRockVariant(globalCX, globalCY);
        } else if (def.tileType === 'sand') {
          tileCanvas = getSandVariant(globalCX, globalCY);
        } else if (def.tileType === 'stone_floor') {
          tileCanvas = getStoneFloorVariant(globalCX, globalCY);
        } else {
          tileCanvas = getIsoTile(def.tileType);
        }
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
        // Deterministic sub-cell jitter for small props (#82)
        const jr = def.jitter ?? 0;
        const { dx: jdx, dy: jdy } = cellJitter(globalCX, globalCY, jr, HALF_TW, HALF_TH);
        ctx.drawImage(sprite, lsx + jdx - size / 2, lsy + jdy - size / 2, size, size);
      }
    }
  }

  // --- Auto-tile transitions: subtle edge darkening at tile-type boundaries ---
  // Pass allChunks for cross-chunk border transitions
  renderAutoTileTransitions(ctx, chunk, allChunks);

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
  allChunks?: Map<string, ChunkData>,
): void {
  const cached = getCachedTerrain(chunkKey, chunk, allChunks);

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
// Draws soft gradient edge blends where adjacent cells have different base tile types.
// Uses per-tile-type dominant colors to create smooth terrain transitions.
// Applied to the terrain cache so it renders once, not per-frame.
// TODO: DOC - auto-tile transition gradient blending algorithm
// TODO: DOC - per-pair blend rules, feather curves, noise-modulated edges (#84)

/** Dominant colors for each base tile type (used for gradient edge blending) */
const TILE_DOMINANT_COLORS: Record<string, string> = {
  grass: '#3CB43C',
  dirt: '#8B6914',
  rock: '#808080',
  water: '#2E6ECC',
  sand: '#D2B48C',
  stone_wall: '#909090',
  stone_floor: '#9A9080',
  bridge: '#8B4513',
  door_gate: '#8B4513',
  wooden_fence: '#A0522D',
};

// ─── Per-Pair Blend Rules (#84) ──────────────────────────────
// Configurable blend intensity per terrain pair.
// Keys are "typeA→typeB" (order-independent — lookup normalizes).

/** Blend rule for a specific terrain pair */
export interface BlendRule {
  /** Gradient opacity (0-1). Higher = more prominent blend */
  alpha: number;
  /** Blend reach as fraction of half-tile (0-1). Higher = wider gradient */
  depth: number;
  /** Number of gradient color stops for feather curve (2=linear, 3+=smoother) */
  featherStops: number;
  /** Noise amplitude for edge distortion (0 = straight edge, 0.3 = organic) */
  noiseAmp: number;
}

/** Default blend rule for pairs without explicit config */
const DEFAULT_BLEND: BlendRule = { alpha: 0.25, depth: 0.35, featherStops: 2, noiseAmp: 0 };

/** Per-pair blend config. Order-independent: getBlendRule normalizes keys. */
const BLEND_RULES: Record<string, BlendRule> = {
  // High-contrast land transitions — wider blends, more feathering
  'dirt→grass':        { alpha: 0.35, depth: 0.50, featherStops: 4, noiseAmp: 0.25 },
  'rock→grass':        { alpha: 0.30, depth: 0.45, featherStops: 3, noiseAmp: 0.20 },
  'sand→grass':        { alpha: 0.35, depth: 0.50, featherStops: 4, noiseAmp: 0.25 },
  'dirt→rock':         { alpha: 0.28, depth: 0.40, featherStops: 3, noiseAmp: 0.15 },
  'dirt→sand':         { alpha: 0.30, depth: 0.45, featherStops: 3, noiseAmp: 0.20 },
  'rock→sand':         { alpha: 0.28, depth: 0.40, featherStops: 3, noiseAmp: 0.15 },
  // Shore transitions — strong blends with foam
  'grass→water':       { alpha: 0.50, depth: 0.55, featherStops: 5, noiseAmp: 0.30 },
  'dirt→water':        { alpha: 0.45, depth: 0.50, featherStops: 4, noiseAmp: 0.25 },
  'sand→water':        { alpha: 0.45, depth: 0.55, featherStops: 5, noiseAmp: 0.30 },
  'rock→water':        { alpha: 0.40, depth: 0.45, featherStops: 3, noiseAmp: 0.20 },
  // Structure transitions — subtle, clean edges
  'stone_floor→grass': { alpha: 0.20, depth: 0.30, featherStops: 2, noiseAmp: 0.05 },
  'stone_floor→dirt':  { alpha: 0.18, depth: 0.28, featherStops: 2, noiseAmp: 0.05 },
  'stone_floor→sand':  { alpha: 0.20, depth: 0.30, featherStops: 2, noiseAmp: 0.05 },
};

/** Global blend intensity multiplier (0=off, 1=normal, 2=exaggerated). Tunable. */
export let blendIntensity = 1.0;

/** Set the global blend intensity multiplier. Invalidates terrain cache. */
export function setBlendIntensity(v: number): void {
  blendIntensity = Math.max(0, Math.min(2, v));
  clearTerrainCache();
}

/** Get the current global blend intensity (for debug display). */
export function getBlendIntensity(): number { return blendIntensity; }

/**
 * Look up the blend rule for a terrain pair (order-independent).
 * Falls back to DEFAULT_BLEND if no specific rule exists.
 */
function getBlendRule(typeA: string, typeB: string): BlendRule {
  return BLEND_RULES[`${typeA}→${typeB}`]
      ?? BLEND_RULES[`${typeB}→${typeA}`]
      ?? DEFAULT_BLEND;
}

/**
 * Deterministic blend noise for a cell edge.
 * Returns a value in [-1, 1] based on cell coords + edge direction.
 * Used to modulate blend depth for organic-looking edges.
 */
function blendNoise(cx: number, cy: number, edgeIdx: number): number {
  const h = ((cx * 374761393 + cy * 668265263 + edgeIdx * 1103515245) >>> 0);
  return (h / 2147483648) - 1; // [-1, 1]
}

/** Edge darkening line alpha (subtle definition line at boundary) */
const EDGE_LINE_ALPHA = 0.08;

function getBaseTileType(
  chunk: ChunkData,
  cx: number,
  cy: number,
  allChunks?: Map<string, ChunkData>,
): string | null {
  // In-bounds: look up directly in this chunk
  if (cx >= 0 && cy >= 0 && cx < SIZE && cy < SIZE) {
    const cell = chunk.cells[cy][cx];
    const def = ASSET_DEFS[cell.assetKey];
    if (!def || def.layer !== 'base') return null;
    return def.tileType ?? def.emoji ?? cell.assetKey;
  }

  // Out-of-bounds: look up in adjacent chunk (cross-chunk transition)
  if (!allChunks) return null;

  // Compute which neighbor chunk and remapped local cell
  let nbChunkX = chunk.chunkX;
  let nbChunkY = chunk.chunkY;
  let remappedCX = cx;
  let remappedCY = cy;

  if (cx < 0) { nbChunkX--; remappedCX = SIZE + cx; }
  else if (cx >= SIZE) { nbChunkX++; remappedCX = cx - SIZE; }
  if (cy < 0) { nbChunkY--; remappedCY = SIZE + cy; }
  else if (cy >= SIZE) { nbChunkY++; remappedCY = cy - SIZE; }

  const nbKey = `${nbChunkX},${nbChunkY}`;
  const nbChunk = allChunks.get(nbKey);
  if (!nbChunk) return null;

  // Bounds check the remapped coordinates
  if (remappedCX < 0 || remappedCY < 0 || remappedCX >= SIZE || remappedCY >= SIZE) return null;

  const cell = nbChunk.cells[remappedCY][remappedCX];
  const def = ASSET_DEFS[cell.assetKey];
  if (!def || def.layer !== 'base') return null;
  return def.tileType ?? def.emoji ?? cell.assetKey;
}

function getDominantColor(tileType: string): string | null {
  return TILE_DOMINANT_COLORS[tileType] ?? null;
}

/**
 * Check if a transition is water↔land (gets special shore treatment).
 */
function isShoreTransition(typeA: string, typeB: string): boolean {
  return (typeA === 'water') !== (typeB === 'water');
}

/**
 * Render soft gradient blends at tile-type boundaries within a chunk.
 * Enhanced with per-pair blend rules, multi-stop feathering, and
 * noise-modulated edges for organic transitions (#84).
 *
 * For each cell edge where adjacent tile types differ:
 * 1. Look up per-pair BlendRule for alpha, depth, feather, noise
 * 2. Draw gradient with multi-stop feather curve into this cell
 * 3. For water↔land edges, add extra shore/foam effect
 * 4. Draw subtle dark edge line for definition
 * 5. Corner blending for diagonal neighbors (bitmask-aware) (#47)
 */
function renderAutoTileTransitions(
  ctx: CanvasRenderingContext2D,
  chunk: ChunkData,
  allChunks?: Map<string, ChunkData>,
): void {
  // Edge directions: 0=east(+1,0), 1=south(0,+1), 2=west(-1,0), 3=north(0,-1)
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];

  // Global cell offset for noise continuity across chunks
  const gxOff = chunk.chunkX * SIZE;
  const gyOff = chunk.chunkY * SIZE;

  for (let cy = 0; cy < SIZE; cy++) {
    for (let cx = 0; cx < SIZE; cx++) {
      const myType = getBaseTileType(chunk, cx, cy);
      if (!myType) continue;

      const lsx = (cx - cy) * HALF_TW + ORIGIN_X;
      const lsy = (cx + cy) * HALF_TH + ORIGIN_Y;

      // --- Pass 1: Cardinal edge transitions ---
      for (let ni = 0; ni < 4; ni++) {
        const nbType = getBaseTileType(chunk, cx + DX[ni], cy + DY[ni], allChunks);
        if (nbType === null || nbType === myType) continue;

        const nbColor = getDominantColor(nbType);
        if (!nbColor) continue;

        const rule = getBlendRule(myType, nbType);
        const shore = isShoreTransition(myType, nbType);

        // Noise-modulated depth for organic edge shape
        const noise = blendNoise(gxOff + cx, gyOff + cy, ni);
        const depth = Math.max(0.1, rule.depth + noise * rule.noiseAmp);
        const alpha = rule.alpha * blendIntensity;

        if (alpha <= 0) continue;

        // Draw multi-stop feathered gradient: neighbor's color fading into this cell
        ctx.save();
        ctx.globalAlpha = alpha;

        // Clip to this cell's diamond to avoid bleeding into neighbors
        ctx.beginPath();
        ctx.moveTo(lsx, lsy - HALF_TH);       // top
        ctx.lineTo(lsx + HALF_TW, lsy);        // right
        ctx.lineTo(lsx, lsy + HALF_TH);        // bottom
        ctx.lineTo(lsx - HALF_TW, lsy);        // left
        ctx.closePath();
        ctx.clip();

        // Create gradient from edge toward center
        let gx0: number, gy0: number, gx1: number, gy1: number;

        switch (ni) {
          case 0: // east edge → gradient goes left
            gx0 = lsx + HALF_TW;           gy0 = lsy;
            gx1 = lsx + HALF_TW * (1 - depth); gy1 = lsy;
            break;
          case 1: // south edge → gradient goes up
            gx0 = lsx;           gy0 = lsy + HALF_TH;
            gx1 = lsx;           gy1 = lsy + HALF_TH * (1 - depth);
            break;
          case 2: // west edge → gradient goes right
            gx0 = lsx - HALF_TW;           gy0 = lsy;
            gx1 = lsx - HALF_TW * (1 - depth); gy1 = lsy;
            break;
          case 3: // north edge → gradient goes down
            gx0 = lsx;           gy0 = lsy - HALF_TH;
            gx1 = lsx;           gy1 = lsy - HALF_TH * (1 - depth);
            break;
          default:
            gx0 = gx1 = lsx; gy0 = gy1 = lsy;
        }

        const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        // Multi-stop feather curve: more stops = smoother rolloff
        const stops = rule.featherStops;
        for (let si = 0; si < stops; si++) {
          const t = si / (stops - 1); // 0..1
          // Smooth hermite curve: slow start, fast middle, slow end
          const opacity = 1 - (3 * t * t - 2 * t * t * t);
          const hexAlpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
          grad.addColorStop(t, nbColor + hexAlpha);
        }
        ctx.fillStyle = grad;

        // Fill the gradient across the clipped diamond
        ctx.fillRect(lsx - HALF_TW, lsy - HALF_TH, TW, TH);

        // Shore foam effect: white sparkle along water↔land edges
        if (shore && nbType === 'water') {
          ctx.globalAlpha = 0.2 * blendIntensity;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          switch (ni) {
            case 0:
              ctx.moveTo(lsx, lsy - HALF_TH);
              ctx.lineTo(lsx + HALF_TW, lsy);
              break;
            case 1:
              ctx.moveTo(lsx + HALF_TW, lsy);
              ctx.lineTo(lsx, lsy + HALF_TH);
              break;
            case 2:
              ctx.moveTo(lsx, lsy + HALF_TH);
              ctx.lineTo(lsx - HALF_TW, lsy);
              break;
            case 3:
              ctx.moveTo(lsx - HALF_TW, lsy);
              ctx.lineTo(lsx, lsy - HALF_TH);
              break;
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();

        // Subtle dark edge line for definition
        ctx.save();
        ctx.globalAlpha = EDGE_LINE_ALPHA;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        switch (ni) {
          case 0:
            ctx.moveTo(lsx, lsy - HALF_TH);
            ctx.lineTo(lsx + HALF_TW, lsy);
            break;
          case 1:
            ctx.moveTo(lsx + HALF_TW, lsy);
            ctx.lineTo(lsx, lsy + HALF_TH);
            break;
          case 2:
            ctx.moveTo(lsx, lsy + HALF_TH);
            ctx.lineTo(lsx - HALF_TW, lsy);
            break;
          case 3:
            ctx.moveTo(lsx - HALF_TW, lsy);
            ctx.lineTo(lsx, lsy - HALF_TH);
            break;
        }
        ctx.stroke();
        ctx.restore();
      }

      // --- Pass 2: Diagonal corner transitions (#47 bitmask-aware) ---
      const DIAG_DX = [1, 1, -1, -1];
      const DIAG_DY = [-1, 1, 1, -1];
      const FLANK_A_DX = [1, 1, -1, -1];
      const FLANK_A_DY = [0, 0, 0, 0];
      const FLANK_B_DX = [0, 0, 0, 0];
      const FLANK_B_DY = [-1, 1, 1, -1];
      const CORNER_X = [HALF_TW / 2, HALF_TW / 2, -HALF_TW / 2, -HALF_TW / 2];
      const CORNER_Y = [-HALF_TH / 2, HALF_TH / 2, HALF_TH / 2, -HALF_TH / 2];

      for (let di = 0; di < 4; di++) {
        const diagType = getBaseTileType(chunk, cx + DIAG_DX[di], cy + DIAG_DY[di], allChunks);
        if (diagType === null || diagType === myType) continue;

        const flankA = getBaseTileType(chunk, cx + FLANK_A_DX[di], cy + FLANK_A_DY[di], allChunks);
        const flankB = getBaseTileType(chunk, cx + FLANK_B_DX[di], cy + FLANK_B_DY[di], allChunks);
        if (flankA !== myType || flankB !== myType) continue;

        const diagColor = getDominantColor(diagType);
        if (!diagColor) continue;

        const rule = getBlendRule(myType, diagType);
        const cornerX = lsx + CORNER_X[di];
        const cornerY = lsy + CORNER_Y[di];
        const shore = isShoreTransition(myType, diagType);
        // Corner blends are subtler than edge blends
        const alpha = (shore ? rule.alpha * 0.6 : rule.alpha * 0.7) * blendIntensity;
        const radius = Math.min(HALF_TW, HALF_TH) * 0.5;

        if (alpha <= 0) continue;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Clip to diamond
        ctx.beginPath();
        ctx.moveTo(lsx, lsy - HALF_TH);
        ctx.lineTo(lsx + HALF_TW, lsy);
        ctx.lineTo(lsx, lsy + HALF_TH);
        ctx.lineTo(lsx - HALF_TW, lsy);
        ctx.closePath();
        ctx.clip();

        // Radial gradient at the corner point with feathering
        const grad = ctx.createRadialGradient(cornerX, cornerY, 0, cornerX, cornerY, radius);
        const stops = Math.max(2, rule.featherStops - 1);
        for (let si = 0; si < stops; si++) {
          const t = si / (stops - 1);
          const opacity = 1 - (3 * t * t - 2 * t * t * t);
          const hexAlpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
          grad.addColorStop(t, diagColor + hexAlpha);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(cornerX - radius, cornerY - radius, radius * 2, radius * 2);

        ctx.restore();
      }
    }
  }
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

/**
 * Estimated memory usage of all cached chunk terrain canvases (in MB).
 * Each cached canvas is CHUNK_PX_W × CHUNK_PX_H × 4 bytes (RGBA bitmap).
 */
export function getTerrainCacheMemoryMB(): number {
  const bytesPerChunk = CHUNK_PX_W * CHUNK_PX_H * 4;
  return (chunkCache.size * bytesPerChunk) / (1024 * 1024);
}

/** Maximum allowed cache memory in MB before eviction kicks in */
const MAX_CACHE_MB = 200;

/**
 * Evict cached chunks that are farthest from the player's current chunk.
 * Keeps chunks within `keepRadius` chunks of the player, evicts the rest
 * when total memory exceeds MAX_CACHE_MB.
 */
export function evictDistantChunks(playerChunkX: number, playerChunkY: number, keepRadius = 3): void {
  const memMB = getTerrainCacheMemoryMB();
  if (memMB <= MAX_CACHE_MB && chunkCache.size <= (keepRadius * 2 + 1) ** 2 + 4) return;

  const keysToEvict: string[] = [];
  for (const key of chunkCache.keys()) {
    const parts = key.split(',');
    const cx = parseInt(parts[0], 10);
    const cy = parseInt(parts[1], 10);
    const dx = Math.abs(cx - playerChunkX);
    const dy = Math.abs(cy - playerChunkY);
    if (dx > keepRadius || dy > keepRadius) {
      keysToEvict.push(key);
    }
  }

  for (const key of keysToEvict) {
    chunkCache.delete(key);
  }
}
