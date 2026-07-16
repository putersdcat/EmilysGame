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

import { RENDER_CONFIG, WORLD_CONFIG } from '../config/game.config';
import { ASSET_DEFS } from '../config/assets.config';
import { getBiome } from '../config/biomes.config';
import { getIsoTile, isTileType } from './tiles';
import { drawSeamlessTerrainTile, type SeamlessTerrainType } from '../asset-pipeline/world-tile-textures';
import { drawContinuousBiomeTransitions } from './biome-transition-overlays';
import { drawNanoStack, onSvgImagesLoaded } from './nano-tile';
import { getNanoStack, waterNano, waterStyleForTileType } from './nano-tile-defs';
import { getEmojiSprite } from '../asset-pipeline/emoji-cache';
import { cellJitter } from '../engine/utils';
import type { ChunkData } from '../types/game.types';
import type { IsoFeatureVariant as FeatureVariant } from '../types/iso-renderer.types';
import { variantFromConnections as sharedVariantFromConnections } from './tile-variants';
import { buildWalkableMap } from '../engine/iso2-solver';  // minor wire for #223 walkableMap on chunks with gates/fence (per AUTONOMOUS_LOOP.md + terrain cache prep)
// B3 micro-slice 8.6 (#253): WU_SIZE is sourced from WorldGrid.ts (the
// single source of truth shared with gen.ts, WorldUnitSolver.ts, and
// Populator.ts). The terrain cache uses it for pixel layout of the
// per-world-unit pre-rendered canvas.
import { WU_SIZE } from '../engine/world/WorldGrid';

// --- Chunk canvas cache ---

interface CachedWorldUnitTerrain {
  canvas: HTMLCanvasElement;
  /** Isometric origin offset: world-unit origin in pre-rendered canvas */
  originX: number;
  originY: number;
  /** Generation stamp - invalidate if chunk is modified */
  stamp: number;
  /** Local screen positions of legacy flat water tiles for animated overlay */
  waterPositions: { lsx: number; lsy: number }[];
  allImagesLoaded: boolean;
}

const chunkCache = new Map<string, CachedWorldUnitTerrain>();
let cacheStamp = 0;

/**
 * Optional bake-cost hook (wired from game boot-marks). Avoids rendering →
 * game import inversion; game registers noteTerrainBake at init.
 */
let _terrainBakeHook: ((ms: number) => void) | null = null;

/** Register a listener for WU terrain bake cost (ms). Pass null to clear. */
export function setTerrainBakeHook(hook: ((ms: number) => void) | null): void {
  _terrainBakeHook = hook;
}

/**
 * Drop incomplete provisional WU entries so the next draw re-bakes with
 * decoded SVGs. Debounced to one rAF so staggered SVG onloads do not
 * re-bake the visible set once per event. Prevents the thrash where
 * incomplete entries were never stored and every frame rebuilt the full
 * WU canvas until decode completed.
 */
let _dropIncompleteRaf = 0;
function scheduleDropIncompleteTerrainEntries(): void {
  if (_dropIncompleteRaf) return;
  _dropIncompleteRaf = requestAnimationFrame(() => {
    _dropIncompleteRaf = 0;
    for (const [key, entry] of chunkCache) {
      if (!entry.allImagesLoaded) chunkCache.delete(key);
    }
  });
}
onSvgImagesLoaded(scheduleDropIncompleteTerrainEntries);

// Chunk content dimensions (computed from chunk size & tile dims)
const SIZE = WORLD_CONFIG.chunkSize; // 25 (5×5 world units)
const TW = RENDER_CONFIG.tileWidth;  // 64
const TH = RENDER_CONFIG.tileHeight; // 32
const HALF_TW = TW / 2;             // 32
const HALF_TH = TH / 2;             // 16

// Full-res world-unit pixel dimensions. For an N×N grid of isometric cells,
// the bounding box is (2*(N-1)*halfW + fullW) by (2*(N-1)*halfH + fullH).
// (5×5 cells: 320×160 in iso projection at 64×32 per cell.)
// Whole 25×25 chunk canvases are too large for Iso 2.0 tiles, so cache WUs lazily.
const WU_PX_W = ((WU_SIZE - 1) * 2) * HALF_TW + TW;
const WU_PX_H = ((WU_SIZE - 1) * 2) * HALF_TH + TH;

// Origin offset within a WU canvas (where local 0,0 maps to). A 5×5 WU spans
// centers from -4..+4 half-widths, plus one extra half-width of diamond body on
// each side, so the origin must be WU_SIZE × halfW. Using (WU_SIZE-1) clipped
// the west diagonal edge and leaked dark base-color diamonds at WU boundaries.
const ORIGIN_X = WU_SIZE * HALF_TW;
const ORIGIN_Y = HALF_TH;

/**
 * Get or create cached terrain canvas for a chunk.
 * Only base-layer tiles (terrain) are cached; objects are drawn live.
 */
export function getCachedTerrain(
  chunkKey: string,
  chunk: ChunkData,
  allChunks?: Map<string, ChunkData>,
  startCX = 0,
  startCY = 0,
): CachedWorldUnitTerrain {
  const wuKey = `${chunkKey}:${startCX},${startCY}`;
  let entry = chunkCache.get(wuKey);
  // Return complete OR provisional incomplete entries — do not rebuild every
  // frame while SVGs decode (that thrash hung first frames post-menu).
  if (entry) return entry;

  const bakeStart = performance.now();

  // Create offscreen canvas for this 5×5 world-unit terrain slice.
  const canvas = document.createElement('canvas');
  canvas.width = WU_PX_W;
  canvas.height = WU_PX_H;
  const ctx = canvas.getContext('2d')!;
  // R1: No WU pre-fill. Each cell draws its own diamond (clipped to iso
  // outline). Adjacent WU canvases overlap so sub-pixel gaps can't form
  // WU-shaped patches, and the diamond corners of the WU bounding region
  // never leak as colored triangles.

  const biome = getBiome(chunk.biomeId);
  const waterPositions: { lsx: number; lsy: number }[] = [];
  let allImagesLoaded = true;

  const endCY = Math.min(SIZE, startCY + WU_SIZE);
  const endCX = Math.min(SIZE, startCX + WU_SIZE);

  // Pass 1 (R1 harden): grass diamond under EVERY cell in this WU — not only
  // non-base. Guarantees the 5×5 hull is fully covered before pass 2 paints
  // dirt/sand/water, so WU canvas corners never show as empty/dark triangles
  // when a base tile fails or is transparent mid-load.
  for (let cy = startCY; cy < endCY; cy++) {
    for (let cx = startCX; cx < endCX; cx++) {
      const localCX = cx - startCX;
      const localCY = cy - startCY;
      const lsx = (localCX - localCY) * HALF_TW + ORIGIN_X;
      const lsy = (localCX + localCY) * HALF_TH + ORIGIN_Y;
      const globalCX = chunk.chunkX * SIZE + cx;
      const globalCY = chunk.chunkY * SIZE + cy;
      drawSeamlessTerrainTile(ctx, 'grass', globalCX, globalCY, lsx, lsy);
    }
  }

  // Pass 2: render base terrain tiles for this WU only.
  for (let cy = startCY; cy < endCY; cy++) {
    for (let cx = startCX; cx < endCX; cx++) {
      const cell = chunk.cells[cy][cx];
      const def = ASSET_DEFS[cell.assetKey];
      if (!def || def.layer !== 'base') continue;

      // Local isometric position within chunk canvas (full-res coords, ctx.scale handles it)
      const localCX = cx - startCX;
      const localCY = cy - startCY;
      const lsx = (localCX - localCY) * HALF_TW + ORIGIN_X;
      const lsy = (localCX + localCY) * HALF_TH + ORIGIN_Y;

      // Global cell coords for tile variants and jitter (#82)
      const globalCX = chunk.chunkX * SIZE + cx;
      const globalCY = chunk.chunkY * SIZE + cy;

      if (def.tileType) {
        const waterStyle = waterStyleForTileType(def.tileType, chunk.biomeId);
        if (waterStyle) {
          // Native Iso 2.0 water is a negative-Z nano cut into a grass/shore base.
          drawSeamlessTerrainTile(ctx, 'grass', globalCX, globalCY, lsx, lsy);
          const variant = inferWaterVariant(chunk, cx, cy, allChunks);
          const waterStack = [waterNano(variant, -2, waterStyle, globalCX, globalCY)];
          const res = drawNanoStack(ctx, waterStack, lsx - HALF_TW, lsy - HALF_TH);
          if (!res.allImagesLoaded) allImagesLoaded = false;
          continue;
        }
        if (def.tileType === 'bridge') {
          drawSeamlessTerrainTile(ctx, 'grass', globalCX, globalCY, lsx, lsy);
          const waterVariant = inferWaterVariant(chunk, cx, cy, allChunks);
          const bridgeVariant = inferBridgeVariant(chunk, cx, cy, allChunks);
          const waterStyle = waterStyleForTileType('water', chunk.biomeId)!;
          const waterStack = [waterNano(waterVariant, -2, waterStyle, globalCX, globalCY)];
          const waterRes = drawNanoStack(ctx, waterStack, lsx - HALF_TW, lsy - HALF_TH);
          if (!waterRes.allImagesLoaded) allImagesLoaded = false;
          const bridgeStack = getNanoStack('bridge', bridgeVariant);
          if (bridgeStack) {
            const res = drawNanoStack(ctx, bridgeStack, lsx - HALF_TW, lsy - HALF_TH);
            if (!res.allImagesLoaded) allImagesLoaded = false;
          }
          continue;
        }
        const seamlessTypes: readonly SeamlessTerrainType[] = [
          'grass', 'dirt', 'rock', 'sand', 'stone_floor',
        ];
        if (seamlessTypes.includes(def.tileType as SeamlessTerrainType)) {
          drawSeamlessTerrainTile(
            ctx,
            def.tileType as SeamlessTerrainType,
            globalCX,
            globalCY,
            lsx,
            lsy,
          );
        } else if (isTileType(def.tileType)) {
          const tileCanvas = getIsoTile(def.tileType);
          if (tileCanvas) ctx.drawImage(tileCanvas, lsx - HALF_TW, lsy - HALF_TH);
        }
      } else {
        // Base-layer decorations (flowers, animals, tiny props) do not own a
        // terrain tileType, but they still need a ground diamond. Without this,
        // the transparent cell exposes the dark canvas clear/base colour as a
        // full green-black diamond in normal startup views (#277).
        drawSeamlessTerrainTile(ctx, 'grass', globalCX, globalCY, lsx, lsy);
        const sprite = getEmojiSprite(def.emoji, biome.tintHue);
        const size = sprite.width * def.scale;
        // Deterministic sub-cell jitter for small props (#82)
        const jr = def.jitter ?? 0;
        const { dx: jdx, dy: jdy } = cellJitter(globalCX, globalCY, jr, HALF_TW, HALF_TH);
        ctx.drawImage(sprite, lsx + jdx - size / 2, lsy + jdy - size / 2, size, size);
      }
    }
  }

  // --- D.8 broad biome transition wash (moisture/elevation noise) ---
  drawContinuousBiomeTransitions(ctx, chunk, {
    startCX, startCY, endCX, endCY,
    originX: ORIGIN_X,
    originY: ORIGIN_Y,
  });

  // --- Auto-tile transitions: subtle edge darkening at tile-type boundaries ---
  // Pass allChunks for cross-chunk border transitions
  renderAutoTileTransitions(ctx, chunk, allChunks, startCX, startCY, endCX, endCY);

  entry = {
    canvas,
    originX: ORIGIN_X,
    originY: ORIGIN_Y,
    stamp: cacheStamp++,
    waterPositions,
    allImagesLoaded,
  };
  // Always store — including provisional incomplete entries — so first frames
  // do not re-bake the same WU every rAF. onSvgImagesLoaded drops incomplete
  // keys so the next getCachedTerrain rebuilds with decoded images.
  chunkCache.set(wuKey, entry);
  _terrainBakeHook?.(performance.now() - bakeStart);
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
  // Minor walkableMap wire (using buildWalkableMap + nanos from getNanoStack for chunks with gates per AUTONOMOUS_LOOP.md + #223).
  // Ensures cache path has up-to-date map (resolveCondition flips for unlocked). Uses chunk.activeConditions if present for per-condition ids.
  ensureChunkWalkableMap(chunk);
  // Chunk's world-space origin (cell 0,0 of this chunk in grid coords)
  const chunkGX = chunk.chunkX * SIZE;
  const chunkGY = chunk.chunkY * SIZE;
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;

  for (let wy = 0; wy < SIZE; wy += WU_SIZE) {
    for (let wx = 0; wx < SIZE; wx += WU_SIZE) {
      const wuGX = chunkGX + wx;
      const wuGY = chunkGY + wy;
      const rx = wuGX - cameraX;
      const ry = wuGY - cameraY;
      const screenX = (rx - ry) * HALF_TW + cw / 2;
      const screenY = (rx + ry) * HALF_TH + ch / 3;
      const destX = screenX - ORIGIN_X;
      const destY = screenY - ORIGIN_Y;

      // Bounds check before cache creation; this is what keeps 144px tiles viable.
      if (destX + WU_PX_W < 0 || destX > cw || destY + WU_PX_H < 0 || destY > ch) continue;

      const cached = getCachedTerrain(chunkKey, chunk, allChunks, wx, wy);
      ctx.drawImage(cached.canvas, destX, destY);

      if (cached.waterPositions.length > 0) {
        drawWaterOverlays(ctx, cached.waterPositions, destX, destY, waterAnimFrame);
      }
    }
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
  water_clear_river: '#2E6ECC',
  water_muddy_creek: '#617845',
  water_deep_pond: '#174F78',
  water_marsh_water: '#356751',
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
  // Land-land blends must stay subtle; high alpha/depth reads as a hard
  // half-green/half-brown tile in normal gameplay (#277 visual stabilization).
  'dirt→grass':        { alpha: 0.14, depth: 0.26, featherStops: 4, noiseAmp: 0.08 },
  'rock→grass':        { alpha: 0.14, depth: 0.24, featherStops: 3, noiseAmp: 0.08 },
  'sand→grass':        { alpha: 0.16, depth: 0.28, featherStops: 4, noiseAmp: 0.08 },
  'dirt→rock':         { alpha: 0.13, depth: 0.24, featherStops: 3, noiseAmp: 0.06 },
  'dirt→sand':         { alpha: 0.14, depth: 0.26, featherStops: 3, noiseAmp: 0.07 },
  'rock→sand':         { alpha: 0.13, depth: 0.24, featherStops: 3, noiseAmp: 0.06 },
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

function isWaterBase(
  chunk: ChunkData,
  cx: number,
  cy: number,
  allChunks?: Map<string, ChunkData>,
): boolean {
  const tileType = getBaseTileType(chunk, cx, cy, allChunks);
  return tileType !== null && waterStyleForTileType(tileType, chunk.biomeId) !== null;
}

function inferWaterVariant(
  chunk: ChunkData,
  cx: number,
  cy: number,
  allChunks?: Map<string, ChunkData>,
): FeatureVariant {
  return sharedVariantFromConnections(
    isWaterBase(chunk, cx, cy - 1, allChunks),
    isWaterBase(chunk, cx + 1, cy, allChunks),
    isWaterBase(chunk, cx, cy + 1, allChunks),
    isWaterBase(chunk, cx - 1, cy, allChunks),
  );
}

function inferBridgeVariant(
  chunk: ChunkData,
  cx: number,
  cy: number,
  allChunks?: Map<string, ChunkData>,
): FeatureVariant {
  const vertical = isWaterBase(chunk, cx, cy - 1, allChunks) || isWaterBase(chunk, cx, cy + 1, allChunks);
  const horizontal = isWaterBase(chunk, cx - 1, cy, allChunks) || isWaterBase(chunk, cx + 1, cy, allChunks);
  // Bridge deck spans bank-to-bank, perpendicular to river flow.
  if (vertical && !horizontal) return 'straight-h';
  if (horizontal && !vertical) return 'straight-v';
  return 'straight-h';
}

function getDominantColor(tileType: string): string | null {
  return TILE_DOMINANT_COLORS[tileType] ?? null;
}

function isWaterTerrainType(tileType: string): boolean {
  return waterStyleForTileType(tileType, 0) !== null;
}

/**
 * Check if a transition is water↔land (gets special shore treatment).
 */
function isShoreTransition(typeA: string, typeB: string): boolean {
  return isWaterTerrainType(typeA) !== isWaterTerrainType(typeB);
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
  startCX: number = 0,
  startCY: number = 0,
  endCX: number = SIZE,
  endCY: number = SIZE,
): void {
  // Edge directions: 0=east(+1,0), 1=south(0,+1), 2=west(-1,0), 3=north(0,-1)
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];

  // Global cell offset for noise continuity across chunks
  const gxOff = chunk.chunkX * SIZE;
  const gyOff = chunk.chunkY * SIZE;

  for (let cy = startCY; cy < endCY; cy++) {
    for (let cx = startCX; cx < endCX; cx++) {
      const myType = getBaseTileType(chunk, cx, cy);
      if (!myType) continue;

      const localCX = cx - startCX;
      const localCY = cy - startCY;
      const lsx = (localCX - localCY) * HALF_TW + ORIGIN_X;
      const lsy = (localCX + localCY) * HALF_TH + ORIGIN_Y;

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
        if (shore && isWaterTerrainType(nbType)) {
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
  for (const key of chunkCache.keys()) {
    if (key === chunkKey || key.startsWith(`${chunkKey}:`)) chunkCache.delete(key);
  }
}

/**
 * Clear all cached terrain (e.g. when viewport resizes significantly).
 */
export function clearTerrainCache(): void {
  chunkCache.clear();
}

/**
 * Number of cached world-unit terrain slices (for debug display).
 */
export function getTerrainCacheSize(): number {
  return chunkCache.size;
}

/**
 * Estimated memory usage of all cached world-unit terrain canvases (in MB).
 * Each cached canvas is WU_PX_W × WU_PX_H × 4 bytes (RGBA bitmap).
 */
export function getTerrainCacheMemoryMB(): number {
  const bytesPerSlice = WU_PX_W * WU_PX_H * 4;
  return (chunkCache.size * bytesPerSlice) / (1024 * 1024);
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
    const chunkPart = key.split(':')[0];
    const parts = chunkPart.split(',');
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

// Minor wire for terrain-cache walkableMap integration (#223 gate/fence runs + quiz unlock):
// Uses buildWalkableMap + nanos from getNanoStack (mirrors water/bridge nano handling here).
// Chunks with gates now get/refresh walkableMap for consistency with iso2-solver (mechanics uses on-demand too).
// Ref AUTONOMOUS_LOOP.md vertical port + cache prep in WorldEngine-03.
export function ensureChunkWalkableMap(chunk: any): void {
  if (!chunk || (chunk.walkableMap && chunk.walkableMap.length >= 25)) return;
  try {
    const N = 25; // chunk size
    const nanosPerTile: any[] = new Array(N * N).fill([]);
    if (chunk.cells) {
      for (let ly = 0; ly < Math.min(N, chunk.cells.length); ly++) {
        for (let lx = 0; lx < Math.min(N, chunk.cells[ly].length); lx++) {
          const cell = chunk.cells[ly][lx];
          if (cell && cell.assetKey) {
            const stack = getNanoStack(cell.assetKey as any, 'straight-h'); // variant approx ok for map
            if (stack && stack.length) nanosPerTile[ly * N + lx] = stack;
          }
        }
      }
    }
    const conds = chunk.activeConditions || new Map([['quiz-gate', 'locked']]);
    const map = buildWalkableMap(nanosPerTile, conds);
    chunk.walkableMap = map;
  } catch { /* safe fallback */ }
}
