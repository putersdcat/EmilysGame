/**
 * render.ts - Isometric rendering engine with chunk-based world support.
 * Draws terrain, objects, sprites with depth sorting and camera tracking.
 * TODO: DOC - full rendering pipeline docs
 */

import { RENDER_CONFIG, WORLD_CONFIG } from './config/game.config';
import { ASSET_DEFS } from './config/assets.config';
import { getBiome } from './config/biomes.config';
import type { ChunkData } from './gen';

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

  // --- Drawing Primitives ---

  private drawGroundFill(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, RENDER_CONFIG.canvasWidth, RENDER_CONFIG.canvasHeight);
  }

  private drawShadow(sx: number, sy: number, scale: number): void {
    this.ctx.fillStyle = `rgba(0,0,0,${RENDER_CONFIG.shadowAlpha})`;
    this.ctx.beginPath();
    this.ctx.ellipse(
      sx, sy + 18,
      scale * RENDER_CONFIG.shadowScale.width,
      scale * RENDER_CONFIG.shadowScale.height,
      0, 0, Math.PI * 2,
    );
    this.ctx.fill();
  }

  private drawEmoji(emoji: string, sx: number, sy: number, scale: number, tint = 0): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(scale, scale);
    ctx.font = `bold ${RENDER_CONFIG.emojiSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hue = tint ? `hue-rotate(${tint}deg) ` : '';
    ctx.filter = `${hue}brightness(${RENDER_CONFIG.emojiBrightness}) saturate(${RENDER_CONFIG.emojiSaturation})`;
    ctx.fillText(emoji, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
  }

  public drawSprite(
    img: HTMLImageElement,
    sx: number,
    sy: number,
    scale: number,
    flipX: boolean,
  ): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(sx, sy);
    if (flipX) ctx.scale(-1, 1);
    const size = RENDER_CONFIG.spriteSize * scale;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
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

    // Data-driven draw commands (no closures - reduces GC pressure)
    const drawCmds: DrawCmd[] = [];
    const size = WORLD_CONFIG.chunkSize;

    // Iterate ONLY visible chunks (viewport culling)
    const camCX = Math.floor(camera.x / size);
    const camCY = Math.floor(camera.y / size);
    const buf = WORLD_CONFIG.viewportBuffer + 1; // +1 for safety margin

    for (let dcy = -buf; dcy <= buf; dcy++) {
      for (let dcx = -buf; dcx <= buf; dcx++) {
        const key = `${camCX + dcx},${camCY + dcy}`;
        const chunk = chunks.get(key);
        if (!chunk) continue;
        const biome = getBiome(chunk.biomeId);

        for (let cy = 0; cy < size; cy++) {
          for (let cx = 0; cx < size; cx++) {
            const cell = chunk.cells[cy][cx];
            const gx = chunk.chunkX * size + cx;
            const gy = chunk.chunkY * size + cy;
            const { x: sx, y: sy } = this.gridToScreen(gx, gy, camera);

            if (!this.isVisible(sx, sy)) continue;

            const def = ASSET_DEFS[cell.assetKey];
            if (!def) continue;

            // Base terrain is always drawn at sortKey = gy (flat)
            if (def.layer === 'base') {
              drawCmds.push({
                sortKey: gy,
                type: CMD_EMOJI,
                emoji: def.emoji,
                sx, sy,
                scale: def.scale,
                tint: biome.tintHue,
              });
            } else {
              // Elevated objects with optional shadow
              const depthKey = gy + def.height * 0.1;
              drawCmds.push({
                sortKey: depthKey,
                type: def.shadow ? CMD_SHADOW_EMOJI : CMD_EMOJI,
                emoji: def.emoji,
                sx, sy,
                scale: def.scale,
                tint: biome.tintHue,
                shadow: def.shadow,
              });
            }

            // Draw collectible overlay if present
            if (cell.itemId) {
              const itemDef = ASSET_DEFS[cell.itemId];
              if (itemDef) {
                drawCmds.push({
                  sortKey: gy + 0.05,
                  type: CMD_ITEM,
                  emoji: itemDef.emoji,
                  sx, sy: sy - 8,
                  scale: itemDef.scale * 0.8,
                  tint: 0,
                });
              }
            }
          }
        }
      }
    }

    // Player draw command
    const { x: esx, y: esy } = this.gridToScreen(egoPos.x, egoPos.y, camera);
    drawCmds.push({
      sortKey: egoPos.y + 0.3, // Slightly above ground objects
      type: CMD_PLAYER,
      emoji: '🧑', // Fallback
      sx: esx,
      sy: esy,
      scale: 1.0,
      tint: 0,
      img: egoImg,
      flipX: egoDir < 0,
    });

    // Sort by depth
    drawCmds.sort((a, b) => a.sortKey - b.sortKey);

    // Execute all draw commands (no closures!)
    for (const cmd of drawCmds) {
      switch (cmd.type) {
        case CMD_EMOJI:
          this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
          break;
        case CMD_SHADOW_EMOJI:
          this.drawShadow(cmd.sx, cmd.sy, cmd.scale);
          this.drawEmoji(cmd.emoji, cmd.sx, cmd.sy, cmd.scale, cmd.tint);
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
      }
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

  /** Get the underlying canvas for UI overlays. */
  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getCtx(): CanvasRenderingContext2D {
    return this.ctx;
  }
}
