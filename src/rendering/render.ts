/**
 * render.ts - Isometric rendering engine with chunk-based world support.
 * Draws terrain, objects, sprites with depth sorting and camera tracking.
 * TODO: DOC - full rendering pipeline docs
 */

import { RENDER_CONFIG, WORLD_CONFIG } from '../config/game.config';
import { ASSET_DEFS } from '../config/assets.config';
import { getEmojiSprite } from '../emoji-cache';
import { getBiome } from '../config/biomes.config';
import { getIsoTile, type TileType } from './tiles';
import { getNanoStack, hasNanoRenderer } from './nano-tile-defs';
import { drawNanoStack } from './nano-tile';
import { drawCachedChunkTerrain } from './terrain-cache';
import type { ChunkData } from '../gen';
import { cellJitter } from '../utils';
import { FIRE_VARIANTS, getFireAnimation } from '../config/fire.config';
import { getTileLOD } from '../config/tiles.config';
import { getShadowParams } from './shadows';
import { hasNpcSprite, getNpcSprite, type NpcFacing, type MouthState } from '../npc-sprites';
import {
  WCMD_TILE, WCMD_EMOJI, WCMD_SHADOW_EMOJI, WCMD_ITEM, WCMD_PLAYER,
  wasmBuildDrawCmds, isWasmReady,
} from './wasm-bridge';
import { hasAssetSprite, getAssetSprite, getFireFrame, FIRE_FRAME_COUNT } from '../asset-sprites';
import type { IsoFeatureVariant as FeatureVariant } from '../types/iso-renderer.types';

// ─── Types ───────────────────────────────────────────────────

export interface Camera {
  x: number;   // World-space center X (grid units)
  y: number;   // World-space center Y (grid units)
}

// Draw command types for zero-closure rendering
const CMD_EMOJI = 0;
const CMD_SHADOW_EMOJI = 1;
const CMD_PLAYER = 2;
const CMD_ITEM = 3;
const CMD_TILE = 4;
const CMD_NPC = 5;  // Paper-cut NPC sprite (#85)

interface DrawCmd {
  sortKey: number;
  type: number;        // CMD_* constant
  emoji: string;
  sx: number;
  sy: number;
  scale: number;
  tint: number;
  // Player-specific fields (reused for flexibility)
  img?: HTMLImageElement | null;
  flipX?: boolean;
  shadow?: boolean;
  // Tile-specific fields
  tileType?: TileType;
  tileVariant?: FeatureVariant;
  // NPC sprite fields (#85)
  npcImg?: HTMLImageElement | null;
  npcFlipX?: boolean;
  // SVG asset sprite (#115)
  assetCanvas?: HTMLCanvasElement | null;
}

// ─── NPC Mouth Animation (#113) ─────────────────────────────
// Terrence-and-Philip style mouth flapping during dialog.
// Module-level state — zero allocation in hot path.
const MOUTH_CYCLE: MouthState[] = ['closed', 'open', 'wide', 'open'];
const MOUTH_FRAME_MS = 180; // ms per mouth frame
let _dialogNpcId: string | null = null;    // npcId of NPC currently in dialog
let _mouthCycleIdx = 0;                     // index into MOUTH_CYCLE
let _mouthLastTick = 0;                     // timestamp of last mouth advance
let _headBobPhase = 0;                      // head bob oscillation phase (radians)

/** Set the NPC currently speaking (pass null when dialog closes). */
export function setDialogNpc(npcId: string | null): void {
  _dialogNpcId = npcId;
  _mouthCycleIdx = 0;
  _mouthLastTick = performance.now();
  _headBobPhase = 0;
}

/** Get current mouth state for the given NPC cell (hot path — no alloc). */
function getNpcMouthState(cellNpcId: string | undefined): MouthState {
  if (!cellNpcId || cellNpcId !== _dialogNpcId) return 'closed';
  // Advance mouth cycle based on elapsed time
  const now = performance.now();
  const elapsed = now - _mouthLastTick;
  if (elapsed >= MOUTH_FRAME_MS) {
    const steps = Math.floor(elapsed / MOUTH_FRAME_MS);
    _mouthCycleIdx = (_mouthCycleIdx + steps) % MOUTH_CYCLE.length;
    _mouthLastTick = now - (elapsed % MOUTH_FRAME_MS); // keep remainder
  }
  return MOUTH_CYCLE[_mouthCycleIdx];
}

/** Get head bob Y offset for speaking NPC (1-2px vertical oscillation). */
function getHeadBob(cellNpcId: string | undefined): number {
  if (!cellNpcId || cellNpcId !== _dialogNpcId) return 0;
  _headBobPhase += 0.05; // advance per render call
  return Math.sin(_headBobPhase) * 1.5; // ±1.5px
}

// Pre-allocated DrawCmd pool for JS render path (avoids GC pressure)
const JS_CMD_POOL_SIZE = 8192;
const jsPool: DrawCmd[] = [];
for (let i = 0; i < JS_CMD_POOL_SIZE; i++) {
  jsPool.push({ sortKey: 0, type: 0, emoji: '', sx: 0, sy: 0, scale: 0, tint: 0 });
}
// Sort index array (pre-allocated, sorted in-place each frame)
const jsSortIdx: number[] = [];
for (let i = 0; i < JS_CMD_POOL_SIZE; i++) jsSortIdx.push(i);
let jsPoolIdx = 0;

// ─── Occluder Tracking (#181) ────────────────────────────────
// Pre-allocated pool of occluder references for partial-hide pass.
// Tall objects (trees, walls) can partially clip over the player
// when the player walks just south of them.
const MAX_OCCLUDERS = 64;
interface OccluderRef {
  sx: number; sy: number;     // screen position
  gy: number;                 // grid Y (for proximity check)
  scale: number;              // draw scale
  ratio: number;              // bottom fraction that occludes (0-1)
  sortKey: number;            // depth key (for player comparison)
  assetCanvas: HTMLCanvasElement | null; // SVG sprite (if available)
  emoji: string;              // emoji fallback
  tint: number;               // biome tint
}
const occluderPool: OccluderRef[] = [];
for (let i = 0; i < MAX_OCCLUDERS; i++) {
  occluderPool.push({ sx: 0, sy: 0, gy: 0, scale: 0, ratio: 0, sortKey: 0, assetCanvas: null, emoji: '', tint: 0 });
}
let occluderCount = 0;

// ─── Object Cell Cache ──────────────────────────────────────
// Pre-computed sparse list of non-base cells per chunk.
// Instead of iterating all 1024 cells per chunk per frame,
// we iterate only ~50-100 non-base objects. Huge perf win.
interface ObjectCellRef { cx: number; cy: number; }
let _renderFrameCount = 0;
const objectCellCache = new Map<string, ObjectCellRef[]>();

function getObjectCells(key: string, chunk: ChunkData): ObjectCellRef[] {
  let list = objectCellCache.get(key);
  if (list) return list;
  list = [];
  const size = WORLD_CONFIG.chunkSize;
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const cell = chunk.cells[cy][cx];
      const def = ASSET_DEFS[cell.assetKey];
      if (!def) continue;
      if (def.layer === 'base' && !cell.itemId) continue;
      list.push({ cx, cy });
    }
  }
  objectCellCache.set(key, list);
  return list;
}

function nanoConnectionFamily(tileType: TileType): 'wall' | 'fence' | 'water' | 'bridge' | TileType {
  switch (tileType) {
    case 'stone_wall':
    case 'door_gate':
    case 'quiz_gate':
    case 'homestead_wall':
    case 'cathedral_wall':
      return 'wall';
    case 'wooden_fence':
      return 'fence';
    case 'water':
      return 'water';
    case 'bridge':
    case 'troll_bridge':
      return 'bridge';
    default:
      return tileType;
  }
}

function sameFeatureNeighbor(
  chunks: Map<string, ChunkData>,
  chunk: ChunkData,
  cx: number,
  cy: number,
  tileType: TileType,
): boolean {
  let localX = cx;
  let localY = cy;
  let chunkX = chunk.chunkX;
  let chunkY = chunk.chunkY;
  const size = WORLD_CONFIG.chunkSize;
  if (localX < 0) { chunkX--; localX = size - 1; }
  else if (localX >= size) { chunkX++; localX = 0; }
  if (localY < 0) { chunkY--; localY = size - 1; }
  else if (localY >= size) { chunkY++; localY = 0; }
  const target = chunks.get(`${chunkX},${chunkY}`);
  if (!target) return false;
  const cell = target.cells[localY]?.[localX];
  if (!cell) return false;
  const neighborTileType = ASSET_DEFS[cell.assetKey]?.tileType;
  return !!neighborTileType && nanoConnectionFamily(neighborTileType) === nanoConnectionFamily(tileType);
}

function variantFromConnections(top: boolean, right: boolean, bottom: boolean, left: boolean): FeatureVariant {
  const count = (top ? 1 : 0) + (right ? 1 : 0) + (bottom ? 1 : 0) + (left ? 1 : 0);
  if (count === 0) return 'isolated';
  if (count === 4) return 'cross';
  if (count === 1) return top ? 'end-t' : right ? 'end-r' : bottom ? 'end-b' : 'end-l';
  if (count === 2) {
    if (left && right) return 'straight-h';
    if (top && bottom) return 'straight-v';
    if (top && right) return 'corner-tr';
    if (top && left) return 'corner-tl';
    if (bottom && right) return 'corner-br';
    return 'corner-bl';
  }
  if (!top) return 'tee-t';
  if (!right) return 'tee-r';
  if (!bottom) return 'tee-b';
  return 'tee-l';
}

function inferTileVariant(
  chunks: Map<string, ChunkData>,
  chunk: ChunkData,
  cx: number,
  cy: number,
  tileType: TileType,
): FeatureVariant {
  return variantFromConnections(
    sameFeatureNeighbor(chunks, chunk, cx, cy - 1, tileType),
    sameFeatureNeighbor(chunks, chunk, cx + 1, cy, tileType),
    sameFeatureNeighbor(chunks, chunk, cx, cy + 1, tileType),
    sameFeatureNeighbor(chunks, chunk, cx - 1, cy, tileType),
  );
}

/** Invalidate a chunk's object cache (e.g. when items collected, obstacles resolved) */
export function invalidateObjectCache(chunkKey: string): void {
  objectCellCache.delete(chunkKey);
}

/** Clear all object cell caches */
export function clearObjectCache(): void {
  objectCellCache.clear();
}

// ─── Renderer ────────────────────────────────────────────────

export class IsometricRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D canvas context');
    this.ctx = context;
    this.canvas = canvas;
    canvas.width = RENDER_CONFIG.canvasWidth;
    canvas.height = RENDER_CONFIG.canvasHeight;
  }

  /** Convert grid coords → screen pixel coords, offset by camera. */
  public gridToScreen(gx: number, gy: number, camera: Camera): { x: number; y: number } {
    const tw = RENDER_CONFIG.tileWidth;
    const th = RENDER_CONFIG.tileHeight;
    // Relative to camera
    const rx = gx - camera.x;
    const ry = gy - camera.y;
    return {
      x: (rx - ry) * (tw / 2) + RENDER_CONFIG.canvasWidth / 2,
      y: (rx + ry) * (th / 2) + RENDER_CONFIG.canvasHeight / 3,
    };
  }

  /** Check if screen pos is within visible canvas (with margin). */
  private isVisible(sx: number, sy: number, margin = 64): boolean {
    return (
      sx > -margin &&
      sx < RENDER_CONFIG.canvasWidth + margin &&
      sy > -margin &&
      sy < RENDER_CONFIG.canvasHeight + margin
    );
  }

  // --- Dynamic Shadow Sprite Cache ---
  // Pre-rendered shadow ellipses, angle baked in from dynamic shadow system (#83).
  // Cache invalidated when sun angle changes >15° — happens roughly every ~30s.
  private shadowCache = new Map<number, HTMLCanvasElement>();
  private _shadowAngle = 0.26;   // current baked angle (radians)
  private _shadowStretch = 1.0;  // current baked stretch multiplier

  private getShadowSprite(scale: number): HTMLCanvasElement {
    const params = getShadowParams(_renderFrameCount);

    // Invalidate cache if shadow angle or stretch changed significantly
    if (Math.abs(params.angle - this._shadowAngle) > 0.25 ||
        Math.abs(params.stretch - this._shadowStretch) > 0.15) {
      this.shadowCache.clear();
      this._shadowAngle = params.angle;
      this._shadowStretch = params.stretch;
    }

    // Quantize scale to reduce cache entries (0.1 increments)
    const qScale = Math.round(scale * 10) / 10;
    let cached = this.shadowCache.get(qScale);
    if (cached) return cached;
    const rw = Math.ceil(qScale * RENDER_CONFIG.shadowScale.width);
    const rh = Math.ceil(qScale * RENDER_CONFIG.shadowScale.height);
    // Elongate shadow based on dynamic stretch factor
    const stretchX = Math.ceil(rw * (1.0 + this._shadowStretch * 0.3));
    // Canvas large enough for rotated ellipse
    const maxDim = Math.max(stretchX, rh) * 2 + 8;
    cached = document.createElement('canvas');
    cached.width = maxDim;
    cached.height = maxDim;
    const sctx = cached.getContext('2d')!;
    // Fill solid black; opacity controlled at draw time via globalAlpha
    sctx.fillStyle = 'rgb(0,0,0)';
    sctx.beginPath();
    sctx.ellipse(maxDim / 2, maxDim / 2, stretchX, rh, this._shadowAngle, 0, Math.PI * 2);
    sctx.fill();
    this.shadowCache.set(qScale, cached);
    return cached;
  }

  // --- Drawing Primitives ---

  private drawGroundFill(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, RENDER_CONFIG.canvasWidth, RENDER_CONFIG.canvasHeight);
  }

  /** Draw a pre-rendered isometric tile at screen position.
   *  Nano-capable tiles now draw at native Iso 2.0 scale (256×128 diamond). */
  private drawTile(tileType: TileType, sx: number, sy: number, variant?: FeatureVariant): void {
    const nanos = getNanoStack(tileType, variant);
    if (nanos) {
      this.ctx.save();
      this.ctx.translate(sx - RENDER_CONFIG.tileWidth / 2, sy - RENDER_CONFIG.tileHeight / 2);
      drawNanoStack(this.ctx, nanos, 0, 0);
      this.ctx.restore();
      return;
    }
    const tileCanvas = getIsoTile(tileType);
    if (tileCanvas) {
      this.ctx.drawImage(tileCanvas, sx - RENDER_CONFIG.tileWidth / 2, sy - RENDER_CONFIG.tileHeight / 2);
    }
  }

  /** Draw dynamic shadow driven by time-of-day + weather (#83). */
  private drawShadow(sx: number, sy: number, scale: number): void {
    const params = getShadowParams(_renderFrameCount);
    if (!params.enabled) return;
    const sprite = this.getShadowSprite(scale);
    // Dynamic offset from sun angle/length computation
    const ox = params.dx * scale;
    const oy = params.dy * scale;
    this.ctx.globalAlpha = params.opacity;
    this.ctx.drawImage(sprite, sx - sprite.width / 2 + ox, sy - sprite.height / 2 + oy);
    this.ctx.globalAlpha = 1.0;
  }

  private drawEmoji(emoji: string, sx: number, sy: number, scale: number, tint = 0): void {
    const sprite = getEmojiSprite(emoji, tint);
    const size = sprite.width * scale;
    this.ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
  }

  /** Draw a pre-rendered SVG asset sprite (#115). Same positioning as drawEmoji. */
  private drawAssetCanvas(sprite: HTMLCanvasElement, sx: number, sy: number, scale: number): void {
    const size = sprite.width * scale;
    this.ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
  }

  public drawSprite(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    scale: number,
    flipX: boolean,
  ): void {
    const ctx = this.ctx;
    const size = RENDER_CONFIG.spriteSize * scale;
    if (flipX) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx - size / 2, sy - size / 2, size, size);
    }
  }

  // --- Main Render ---

  /**
   * Render visible chunks around camera position.
   * @param chunks - Map of "cx,cy" → ChunkData
   * @param camera - Current camera center
   * @param egoPos - Player grid position
   * @param egoDir - 1 = right, -1 = left
   * @param egoImg - Current sprite frame
   */
  public render(
    chunks: Map<string, ChunkData>,
    camera: Camera,
    egoPos: { x: number; y: number },
    egoDir: number,
    egoImg: HTMLImageElement | null,
  ): void {
    // Background fill based on center chunk biome
    const centerKey = `${Math.floor(camera.x / WORLD_CONFIG.chunkSize)},${Math.floor(camera.y / WORLD_CONFIG.chunkSize)}`;
    const centerChunk = chunks.get(centerKey);
    const bgColor = centerChunk
      ? getBiome(centerChunk.biomeId).baseColor
      : RENDER_CONFIG.baseColor;
    this.drawGroundFill(bgColor);

    // --- Layer 1: cached base terrain (one drawImage per chunk) ---
    // Data-driven draw commands using pre-allocated pool (no per-frame alloc)
    jsPoolIdx = 0;
    occluderCount = 0;   // reset occluder tracking (#181)
    _renderFrameCount++;
    const size = WORLD_CONFIG.chunkSize;
    const maxCmds = RENDER_CONFIG.maxDrawCmds; // draw call budget for graceful degradation

    // Iterate ONLY visible chunks (viewport culling)
    const camCX = Math.floor(camera.x / size);
    const camCY = Math.floor(camera.y / size);
    const buf = WORLD_CONFIG.viewportBuffer; // matches chunk loading radius

    for (let dcy = -buf; dcy <= buf; dcy++) {
      for (let dcx = -buf; dcx <= buf; dcx++) {
        const key = `${camCX + dcx},${camCY + dcy}`;
        const chunk = chunks.get(key);
        if (!chunk) continue;

        // Blit cached terrain for this chunk
        drawCachedChunkTerrain(this.ctx, key, chunk, camera.x, camera.y, chunks);

        if (jsPoolIdx >= maxCmds) continue; // budget exhausted, skip objects (terrain still drawn)

        const biome = getBiome(chunk.biomeId);

        // Use pre-computed object cell list (~50-100 per chunk vs 1024)
        const objCells = getObjectCells(key, chunk);
        for (let oi = 0; oi < objCells.length && jsPoolIdx < maxCmds; oi++) {
          const { cx, cy } = objCells[oi];
          const cell = chunk.cells[cy][cx];
          const def = ASSET_DEFS[cell.assetKey];

          const isBase = def && def.layer === 'base';

          // Cell mutations may make stale cache entries (item collected → now base-only)
          if (!def || (isBase && !cell.itemId)) continue;

          const gx = chunk.chunkX * size + cx;
          const gy = chunk.chunkY * size + cy;
          const { x: sx, y: sy } = this.gridToScreen(gx, gy, camera);
          // Deterministic sub-cell jitter for small props (#82)
          const jr = def ? (def.jitter ?? 0) : 0;
          const { dx: jdx, dy: jdy } = cellJitter(gx, gy, jr);
          const jsx = sx + jdx;
          const jsy = sy + jdy;

          if (!this.isVisible(jsx, jsy)) continue;

          // Draw elevated (non-base) objects
          if (!isBase) {
            // Sort key: cell base Y + half-cell for center anchor + height bias.
            // height * 0.4 means a height=4 wall sorts 1.6 rows "deeper",
            // correctly occluding objects/player within ~1.6 grid rows south. (#184)
            const depthKey = gy + 0.5 + def.height * 0.4;
            // Fire animation: scale pulse + vertical wobble (#81)
            const fireVariant = FIRE_VARIANTS[cell.assetKey];
            let drawScale = def.scale;
            let drawSy = jsy;
            if (fireVariant) {
              const fa = getFireAnimation(fireVariant, gx, gy, _renderFrameCount);
              drawScale *= fa.scaleMultiplier;
              drawSy += fa.dyOffset;
            }

            // NPC paper-cut sprite path (#85)
            if (def.category === 'npc' && hasNpcSprite(cell.assetKey)) {
              // Determine facing: stored on cell if set, else face toward player
              const facing: NpcFacing = (cell.npcFacing as NpcFacing) || 'south';
              // Mouth animation: cycle during active dialog (#113)
              const mouth: MouthState = getNpcMouthState(cell.npcId);
              const headBob = getHeadBob(cell.npcId);
              const npcImg = getNpcSprite(cell.assetKey, facing, mouth);
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey;
              cmd.type = CMD_NPC;
              cmd.emoji = def.emoji; // fallback
              cmd.sx = jsx; cmd.sy = drawSy + headBob; cmd.scale = drawScale; cmd.tint = 0;
              cmd.shadow = def.shadow;
              cmd.npcImg = npcImg;
              cmd.npcFlipX = facing === 'west';
              cmd.assetCanvas = null;
            } else if (def.tileType && hasNanoRenderer(def.tileType)) {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey; cmd.type = CMD_TILE; cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = drawSy; cmd.scale = drawScale; cmd.tint = biome.tintHue;
              cmd.tileType = def.tileType; cmd.shadow = def.shadow;
              cmd.tileVariant = inferTileVariant(chunks, chunk, cx, cy, def.tileType);
              cmd.assetCanvas = null;
            } else if (hasAssetSprite(cell.assetKey)) {
              // SVG asset sprite path (#115) — priority over tileType for objects
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey;
              cmd.type = def.shadow ? CMD_SHADOW_EMOJI : CMD_EMOJI;
              cmd.emoji = def.emoji; // fallback
              cmd.sx = jsx; cmd.sy = drawSy; cmd.scale = drawScale; cmd.tint = biome.tintHue;
              cmd.shadow = def.shadow;
              // Resolve sprite at build time: fire frames or static asset
              if (fireVariant) {
                const phase = Math.abs(Math.floor(gx * 13 + gy * 29));
                const fi = (Math.floor(_renderFrameCount / fireVariant.frameDuration) + phase) % FIRE_FRAME_COUNT;
                cmd.assetCanvas = getFireFrame(cell.assetKey, fi) ?? null;
              } else {
                cmd.assetCanvas = getAssetSprite(cell.assetKey, biome.tintHue, gx, gy) ?? null;
              }
            } else if (def.tileType) {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey; cmd.type = CMD_TILE; cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = drawSy; cmd.scale = drawScale; cmd.tint = biome.tintHue;
              cmd.tileType = def.tileType; cmd.shadow = def.shadow;
              cmd.tileVariant = inferTileVariant(chunks, chunk, cx, cy, def.tileType);
              cmd.assetCanvas = null;
            } else {
              const cmd = jsPool[jsPoolIdx++];
              cmd.sortKey = depthKey;
              cmd.type = def.shadow ? CMD_SHADOW_EMOJI : CMD_EMOJI;
              cmd.emoji = def.emoji;
              cmd.sx = jsx; cmd.sy = drawSy; cmd.scale = drawScale; cmd.tint = biome.tintHue;
              cmd.shadow = def.shadow;
              cmd.assetCanvas = null;
            }

            // Track occluder objects near the player for partial-hide pass (#181)
            const occRatio = def.occluderRatio;
            if (occRatio && occRatio > 0 && occluderCount < MAX_OCCLUDERS) {
              // Only track objects within ±2 grid units of the player
              const dyGY = egoPos.y - gy;
              const dxGX = egoPos.x - gx;
              if (dyGY > -0.5 && dyGY < 2.0 && dxGX > -2.0 && dxGX < 2.0) {
                const occ = occluderPool[occluderCount++];
                occ.sx = jsx; occ.sy = drawSy;
                occ.gy = gy; occ.scale = drawScale;
                occ.ratio = occRatio;
                occ.sortKey = depthKey;
                // Resolve the asset canvas or emoji for re-draw
                if (hasAssetSprite(cell.assetKey)) {
                  occ.assetCanvas = getAssetSprite(cell.assetKey, biome.tintHue, gx, gy) ?? null;
                } else {
                  occ.assetCanvas = null;
                }
                occ.emoji = def.emoji;
                occ.tint = biome.tintHue;
              }
            }
          }

          // Draw collectible overlay if present (on any cell layer)
          // Items sit ON the ground (no vertical lift) — prevents floating appearance
          if (cell.itemId) {
            const itemDef = ASSET_DEFS[cell.itemId];
            if (itemDef) {
              const cmd = jsPool[jsPoolIdx++];
              // Item jitter uses item's own jitter range (#82)
              const ijr = itemDef.jitter ?? 0;
              const { dx: ijdx, dy: ijdy } = cellJitter(gx, gy, ijr);
              cmd.sortKey = gy + 0.05; cmd.type = CMD_ITEM; cmd.emoji = itemDef.emoji;
              cmd.sx = sx + ijdx; cmd.sy = sy - 2 + ijdy; cmd.scale = itemDef.scale * 0.7; cmd.tint = 0;
            }
          }
        }
      }
    }

    // Player draw command
    const { x: esx, y: esy } = this.gridToScreen(egoPos.x, egoPos.y, camera);
    {
      const cmd = jsPool[jsPoolIdx++];
      cmd.sortKey = egoPos.y + 0.3;
      cmd.type = CMD_PLAYER;
      cmd.emoji = '🧑';
      cmd.sx = esx; cmd.sy = esy;
      cmd.scale = 1.0; cmd.tint = 0;
      cmd.img = egoImg;
      cmd.flipX = egoDir < 0;
    }

    // Sort only the active portion using pre-allocated index array
    for (let i = 0; i < jsPoolIdx; i++) jsSortIdx[i] = i;
    const count = jsPoolIdx;
    const pool = jsPool;
    // In-place insertion sort for small counts (avoids slice allocation)
    // With object cell cache, count is typically 100-500 — insertion sort is fine
    for (let i = 1; i < count; i++) {
      const tmp = jsSortIdx[i];
      const key = pool[tmp].sortKey;
      let j = i - 1;
      while (j >= 0 && pool[jsSortIdx[j]].sortKey > key) {
        jsSortIdx[j + 1] = jsSortIdx[j];
        j--;
      }
      jsSortIdx[j + 1] = tmp;
    }

    // Execute all draw commands (no closures!)
    for (let ci = 0; ci < count; ci++) {
      const cmd = pool[jsSortIdx[ci]];
      switch (cmd.type) {
        case CMD_TILE:
          if (cmd.shadow) this.drawShadow(cmd.sx, cmd.sy, cmd.scale);
          if (cmd.tileType) this.drawTile(cmd.tileType, cmd.sx, cmd.sy, cmd.tileVariant);
          break;
        case CMD_EMOJI:
          if (cmd.assetCanvas) {
            this.drawAssetCanvas(cmd.assetCanvas, cmd.sx, cmd.sy, cmd.scale);
          } else {
            this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          }
          break;
        case CMD_SHADOW_EMOJI:
          this.drawShadow(cmd.sx, cmd.sy, cmd.scale);
          if (cmd.assetCanvas) {
            this.drawAssetCanvas(cmd.assetCanvas, cmd.sx, cmd.sy, cmd.scale);
          } else {
            this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          }
          break;
        case CMD_ITEM:
          this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          break;
        case CMD_PLAYER:
          this.drawShadow(cmd.sx, cmd.sy, 1.0);
          if (cmd.img) {
            this.drawSprite(cmd.img, cmd.sx, cmd.sy, cmd.scale, cmd.flipX ?? false);
          } else {
            this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          }
          break;
        case CMD_NPC:
          // Paper-cut NPC sprite with emoji fallback (#85)
          if (cmd.shadow) this.drawShadow(cmd.sx, cmd.sy, cmd.scale);
          if (cmd.npcImg) {
            this.drawSprite(cmd.npcImg, cmd.sx, cmd.sy - 8, cmd.scale, cmd.npcFlipX ?? false);
          } else {
            this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          }
          break;
      }
    }

    // ─── Occluder Re-draw Pass (#181) ────────────────────────────
    // Re-draw the bottom portion of tracked occluder objects ON TOP of the player
    // to create partial-hiding behind tall objects (trees, walls).
    // Only activates when the player is slightly south of the occluder (in front but close).
    const playerSortKey = egoPos.y + 0.3;
    const occCtx = this.ctx;
    for (let oi = 0; oi < occluderCount; oi++) {
      const occ = occluderPool[oi];
      // Only re-draw if player is "in front" (higher sortKey) but close
      if (playerSortKey <= occ.sortKey) continue;
      // For standard 48px base emoji/asset sprites, compute actual draw size
      const spriteSize = occ.assetCanvas
        ? occ.assetCanvas.width * occ.scale
        : 48 * occ.scale;
      // Occluder region: bottom (ratio) fraction of the sprite
      const clipTop = occ.sy - spriteSize / 2 + spriteSize * (1.0 - occ.ratio);
      const clipH = spriteSize * occ.ratio;
      const clipLeft = occ.sx - spriteSize / 2;
      occCtx.save();
      occCtx.beginPath();
      occCtx.rect(clipLeft, clipTop, spriteSize, clipH);
      occCtx.clip();
      if (occ.assetCanvas) {
        this.drawAssetCanvas(occ.assetCanvas, occ.sx, occ.sy, occ.scale);
      } else {
        this.drawEmoji(occ.emoji, occ.sx, occ.sy, occ.scale, occ.tint);
      }
      occCtx.restore();
    }
  }

  // === WASM Rendering Path ===

  /**
   * Render using WASM-computed draw commands.
   * WASM handles: coordinate transforms, visibility culling, depth sorting.
   * TS handles: actual Canvas API draw calls (putImage, fillText, drawImage).
   */
  public renderWasm(
    chunks: Map<string, ChunkData>,
    camera: Camera,
    egoPos: { x: number; y: number },
    egoDir: number,
    egoImg: HTMLImageElement | null,
  ): void {
    // Background fill
    const size = WORLD_CONFIG.chunkSize;
    const centerKey = `${Math.floor(camera.x / size)},${Math.floor(camera.y / size)}`;
    const centerChunk = chunks.get(centerKey);
    const bgColor = centerChunk
      ? getBiome(centerChunk.biomeId).baseColor
      : RENDER_CONFIG.baseColor;
    this.drawGroundFill(bgColor);

    // --- Layer 1: cached base terrain (one drawImage per chunk) ---
    const camCX = Math.floor(camera.x / size);
    const camCY = Math.floor(camera.y / size);
    const buf = WORLD_CONFIG.viewportBuffer; // matches chunk loading radius
    for (let dcy = -buf; dcy <= buf; dcy++) {
      for (let dcx = -buf; dcx <= buf; dcx++) {
        const key = `${camCX + dcx},${camCY + dcy}`;
        const chunk = chunks.get(key);
        if (!chunk) continue;
        drawCachedChunkTerrain(this.ctx, key, chunk, camera.x, camera.y, chunks);
      }
    }

    // --- Layer 2: objects + player via WASM (sorted, skip base terrain) ---
    const cmds = wasmBuildDrawCmds(chunks, camera, egoPos, egoDir, true);

    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      const hasShadow = (cmd.flags & 1) !== 0;
      const flipX = (cmd.flags & 2) !== 0;

      switch (cmd.type) {
        case WCMD_TILE: {
          // Skip base terrain tiles (already cached); draw elevated tiles
          const tileDef = cmd.assetKey ? ASSET_DEFS[cmd.assetKey] : null;
          if (tileDef && tileDef.layer === 'base') break; // cached
          if (hasShadow) this.drawShadow(cmd.sx, cmd.sy, cmd.scale);
          if (cmd.tileType) this.drawTile(cmd.tileType, cmd.sx, cmd.sy);
          break;
        }
        case WCMD_EMOJI: {
          const def = cmd.assetKey ? ASSET_DEFS[cmd.assetKey] : null;
          if (def) {
            if (def.layer === 'base') break; // base emoji terrain is also cached
            // SVG asset sprite (#115) — use default variant in WASM path
            const sprite = cmd.assetKey ? getAssetSprite(cmd.assetKey, cmd.tint) : undefined;
            if (sprite) {
              this.drawAssetCanvas(sprite, cmd.sx, cmd.sy, cmd.scale);
            } else {
              this.drawEmoji(def.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
            }
          }
          break;
        }
        case WCMD_SHADOW_EMOJI: {
          this.drawShadow(cmd.sx, cmd.sy, cmd.scale);
          const def2 = cmd.assetKey ? ASSET_DEFS[cmd.assetKey] : null;
          if (def2) {
            const sprite2 = cmd.assetKey ? getAssetSprite(cmd.assetKey, cmd.tint) : undefined;
            if (sprite2) {
              this.drawAssetCanvas(sprite2, cmd.sx, cmd.sy, cmd.scale);
            } else {
              this.drawEmoji(def2.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
            }
          }
          break;
        }
        case WCMD_ITEM: {
          const itemDef = cmd.assetKey ? ASSET_DEFS[cmd.assetKey] : null;
          if (itemDef) this.drawEmoji(itemDef.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          break;
        }
        case WCMD_PLAYER:
          this.drawShadow(cmd.sx, cmd.sy, 1.0);
          if (egoImg) {
            this.drawSprite(egoImg, cmd.sx, cmd.sy, cmd.scale, flipX);
          } else {
            this.drawEmoji('🧑', cmd.sx, cmd.sy, cmd.scale, 0);
          }
          break;
      }
    }
  }

  /**
   * Main render entry point: uses WASM path if available, falls back to JS.
   * When showDebug=true, draws world-unit template grid overlay after scene.
   */
  public renderAuto(
    chunks: Map<string, ChunkData>,
    camera: Camera,
    egoPos: { x: number; y: number },
    egoDir: number,
    egoImg: HTMLImageElement | null,
    showDebug = false,
  ): void {
    if (RENDER_CONFIG.useWasmRenderer && isWasmReady()) {
      this.renderWasm(chunks, camera, egoPos, egoDir, egoImg);
    } else {
      this.render(chunks, camera, egoPos, egoDir, egoImg);
    }
    // Debug overlay: world unit grid boundaries (after all scene layers)
    if (showDebug) {
      this.drawDebugGrid(chunks, camera);
    }
  }

  /** Draw a simple text overlay (for HUD, debug, etc.) */
  public drawText(text: string, x: number, y: number, color = '#fff', size = 14): void {
    this.ctx.save();
    this.ctx.font = `${size}px monospace`;
    this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this.ctx.fillRect(x - 4, y - size, this.ctx.measureText(text).width + 8, size + 6);
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  // ─── Debug Grid Overlay ────────────────────────────────────
  // Draws world unit boundaries (every worldUnitSize cells) as isometric grid lines.
  // TODO: DOC - debug overlay rendering, toggle via F3

  /**
   * Draw world-unit grid boundaries on visible chunks.
   * Shows the 5×5 template grid structure within each 25×25 chunk.
   */
  public drawDebugGrid(
    chunks: Map<string, ChunkData>,
    camera: Camera,
  ): void {
    const ctx = this.ctx;
    const chunkSize = WORLD_CONFIG.chunkSize;
    const wuSize = WORLD_CONFIG.worldUnitSize;
    const camCX = Math.floor(camera.x / chunkSize);
    const camCY = Math.floor(camera.y / chunkSize);
    const buf = WORLD_CONFIG.viewportBuffer;

    ctx.save();
    ctx.globalAlpha = 0.35;

    for (let dcy = -buf; dcy <= buf; dcy++) {
      for (let dcx = -buf; dcx <= buf; dcx++) {
        const key = `${camCX + dcx},${camCY + dcy}`;
        const chunk = chunks.get(key);
        if (!chunk) continue;

        const baseGX = chunk.chunkX * chunkSize;
        const baseGY = chunk.chunkY * chunkSize;

        // Draw world unit grid lines (vertical lines in grid space = iso diagonals)
        for (let wu = 0; wu <= chunkSize; wu += wuSize) {
          const isChunkBorder = wu === 0 || wu === chunkSize;
          ctx.strokeStyle = isChunkBorder ? '#ff0' : '#0ff';
          ctx.lineWidth = isChunkBorder ? 2 : 1;

          // "Vertical" grid line at x=wu (from y=0 to y=chunkSize)
          ctx.beginPath();
          const v0 = this.gridToScreen(baseGX + wu, baseGY, camera);
          const v1 = this.gridToScreen(baseGX + wu, baseGY + chunkSize, camera);
          ctx.moveTo(v0.x, v0.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.stroke();

          // "Horizontal" grid line at y=wu (from x=0 to x=chunkSize)
          ctx.beginPath();
          const h0 = this.gridToScreen(baseGX, baseGY + wu, camera);
          const h1 = this.gridToScreen(baseGX + chunkSize, baseGY + wu, camera);
          ctx.moveTo(h0.x, h0.y);
          ctx.lineTo(h1.x, h1.y);
          ctx.stroke();
        }

        // Label world units with their coordinates
        ctx.font = '10px monospace';
        ctx.fillStyle = '#0ff';
        ctx.globalAlpha = 0.6;
        const gridDim = chunkSize / wuSize;
        for (let wy = 0; wy < gridDim; wy++) {
          for (let wx = 0; wx < gridDim; wx++) {
            const centerGX = baseGX + wx * wuSize + wuSize / 2;
            const centerGY = baseGY + wy * wuSize + wuSize / 2;
            const { x: lx, y: ly } = this.gridToScreen(centerGX, centerGY, camera);
            if (this.isVisible(lx, ly)) {
              ctx.fillText(`${wx},${wy}`, lx - 8, ly + 3);
            }
          }
        }

        // #101: LOD tag overlay — show LOD level of the center cell per world unit
        ctx.font = '8px monospace';
        ctx.globalAlpha = 0.7;
        for (let wy = 0; wy < gridDim; wy++) {
          for (let wx = 0; wx < gridDim; wx++) {
            const cellX = wx * wuSize + Math.floor(wuSize / 2);
            const cellY = wy * wuSize + Math.floor(wuSize / 2);
            if (cellY < chunk.cells.length && cellX < chunk.cells[0].length) {
              const cell = chunk.cells[cellY][cellX];
              const lod = getTileLOD(cell.assetKey as TileType);
              const centerGX = baseGX + wx * wuSize + wuSize / 2;
              const centerGY = baseGY + wy * wuSize + wuSize / 2;
              const { x: lx, y: ly } = this.gridToScreen(centerGX, centerGY, camera);
              if (this.isVisible(lx, ly)) {
                // LOD color coding: detail=green, standard=cyan, simplified=yellow, minimal=red
                const lodColors: Record<string, string> = {
                  detail: '#0f0', standard: '#0ff', simplified: '#ff0', minimal: '#f00',
                };
                ctx.fillStyle = lodColors[lod] ?? '#888';
                ctx.fillText(`L:${lod.slice(0, 3)}`, lx - 8, ly + 12);
              }
            }
          }
        }

        // #101: Chunk climate overlay — show moisture/temperature for this chunk
        if (chunk.climate) {
          const topGX = baseGX;
          const topGY = baseGY;
          const { x: cx, y: cy } = this.gridToScreen(topGX + chunkSize / 2, topGY + 1, camera);
          if (this.isVisible(cx, cy)) {
            ctx.font = '9px monospace';
            ctx.fillStyle = '#ffa';
            ctx.globalAlpha = 0.8;
            const m = chunk.climate.moisture.toFixed(2);
            const t = chunk.climate.temperature.toFixed(2);
            ctx.fillText(`M:${m} T:${t}`, cx - 25, cy - 4);
          }
        }

        ctx.globalAlpha = 0.35;
      }
    }
    ctx.restore();
  }

  /** Get the underlying canvas for UI overlays. */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getCtx(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
