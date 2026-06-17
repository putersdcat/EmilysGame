/**
 * render.ts - Isometric rendering engine with chunk-based world support.
 * Draws terrain, objects, sprites with depth sorting and camera tracking.
 * TODO: DOC - full rendering pipeline docs
 */

import { RENDER_CONFIG, WORLD_CONFIG } from '../config/game.config';
import { ASSET_DEFS } from '../config/assets.config';
import { getEmojiSprite } from '../asset-pipeline/emoji-cache';
import { getBiome } from '../config/biomes.config';
import { getIsoTile, type TileType } from './tiles';
import { getNanoStack, hasNanoRenderer } from './nano-tile-defs';
import { drawNanoStack } from './nano-tile';
import { drawCachedChunkTerrain } from './terrain-cache';
import type { ChunkData, Camera } from '../types/game.types';
import { cellJitter } from '../engine/utils';
import { FIRE_VARIANTS, getFireAnimation } from '../config/fire.config';
import { getShadowParams } from './shadows';
import { hasNpcSprite, getNpcSprite, type NpcFacing, type MouthState } from '../asset-pipeline/npc-sprites';
import {
  WCMD_TILE, WCMD_EMOJI, WCMD_SHADOW_EMOJI, WCMD_ITEM, WCMD_PLAYER,
  wasmBuildDrawCmds, isWasmReady,
} from './wasm-bridge';
import { hasAssetSprite, getAssetSprite, getFireFrame, FIRE_FRAME_COUNT } from '../asset-pipeline/asset-sprites';
import type { IsoFeatureVariant as FeatureVariant } from '../types/iso-renderer.types';
import { gridToScreen, isVisible } from './projection';
import { ShadowSpriteCache } from './shadow-cache';
import { getNpcMouthState, getHeadBob } from './mouth-animation';
import { drawDebugGrid as drawDebugGridImpl } from './debug-grid';
export { setDialogNpc } from './mouth-animation';
// B6.1 (#272): tile variant inference + object-cell cache extracted to tile-variants.ts
import { inferTileVariant, getObjectCells, clearObjectCache, invalidateObjectCache } from './tile-variants';
export { clearObjectCache, invalidateObjectCache };

// ─── Re-exports ──────────────────────────────────────────────
// Camera type moved to `src/types/game.types.ts` in B6.1 (#269) to dedup
// with `local-lights.ts`. Re-exported here for backward compatibility.
export type { Camera } from '../types/game.types';

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
// B6.4: state and helpers moved to src/rendering/mouth-animation.ts.
// The renderer imports `getNpcMouthState` / `getHeadBob` and re-exports
// `setDialogNpc` for the dialog code in main.ts.

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

// ─── Object Cell Cache & Variant Inference ──────────────────
// Moved to `./tile-variants.ts` in B6.1 (#272).
// See tile-variants.ts for: nanoConnectionFamily, sameFeatureNeighbor,
// variantFromConnections, inferTileVariant, getObjectCells,
// invalidateObjectCache, clearObjectCache.

// ─── Renderer ────────────────────────────────────────────────

// Monotonic frame counter — incremented at the top of every render call.
// Used to throttle animations (shadow cache, fire sprites) so we don't
// pay the per-frame sprite rebuild cost on every rAF tick.
let _renderFrameCount = 0;

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
    return gridToScreen(gx, gy, camera);
  }

  /** Check if screen pos is within visible canvas (with margin). */
  private isVisible(sx: number, sy: number, margin = 64): boolean {
    return isVisible(sx, sy, margin);
  }

  // --- Dynamic Shadow Sprite Cache (#83) ---
  // B6.3: state moved to ShadowSpriteCache class.
  private shadowCache = new ShadowSpriteCache();

  private getShadowSprite(scale: number): HTMLCanvasElement {
    return this.shadowCache.getShadowSprite(scale, _renderFrameCount);
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
  // B6.5: implementation moved to src/rendering/debug-grid.ts.
  // Method kept here as a thin delegation for any existing callers.

  /** Draw world-unit grid boundaries on visible chunks. F3 toggle. */
  public drawDebugGrid(
    chunks: Map<string, ChunkData>,
    camera: Camera,
  ): void {
    drawDebugGridImpl(this.ctx, chunks, camera);
  }

  /** Get the underlying canvas for UI overlays. */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getCtx(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
