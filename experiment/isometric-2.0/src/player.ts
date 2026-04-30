/**
 * player.ts — 2.0 Experiment: Player character rendering, movement, and animation.
 * Simple 3-frame isometric character with WASD movement, sink effect,
 * and draw-order occlusion support.
 * TODO: DOC — player render pipeline, occlusion strategy, sink integration
 */

import {
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  WORLD_UNIT_TILES,
  worldToIso,
  type PlayerState,
  type AnimFrame,
  type MicroTile,
  type WorldUnitChunk,
} from './types';
import { Z_PX_PER_LEVEL } from './tile';
import { drawNanoStack } from './nano-tile';
import type { SunState } from './types';

// ─── Constants ───────────────────────────────────────────────

/** Player movement speed in tiles per second. */
const MOVE_SPEED = 3.0;

/** Camera lerp factor per frame (0-1). Higher = snappier. */
const CAM_LERP = 0.12;

/** Walk animation frame rate: switch frame every N game frames. */
const ANIM_FRAME_INTERVAL = 8;

/** Player sprite size on screen (pixels). */
const PLAYER_W = 64;
const PLAYER_H = 80;

/** How far below the sprite's bounding box the "feet" are positioned.
 *  Used for centering feet on the tile. */
const FEET_OFFSET_Y = PLAYER_H * 0.9;

// ─── Inline SVG Sprites ──────────────────────────────────────
// Minimal isometric character: head circle + body trapezoid + legs.
// 3 frames: idle, walk1 (left step), walk2 (right step).

const PLAYER_SVG_IDLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">
  <!-- Shadow -->
  <ellipse cx="32" cy="74" rx="18" ry="6" fill="rgba(0,0,0,0.25)"/>
  <!-- Left leg -->
  <rect x="22" y="52" width="8" height="18" rx="3" fill="#4a3728"/>
  <!-- Right leg -->
  <rect x="34" y="52" width="8" height="18" rx="3" fill="#3d2d1f"/>
  <!-- Body -->
  <path d="M20 28 Q20 52 24 56 L40 56 Q44 52 44 28 Q44 22 32 20 Q20 22 20 28Z" fill="#e74c3c"/>
  <!-- Belt -->
  <rect x="21" y="46" width="22" height="4" rx="2" fill="#7f4f24"/>
  <!-- Left arm -->
  <rect x="14" y="30" width="7" height="20" rx="3" fill="#e74c3c"/>
  <!-- Right arm -->
  <rect x="43" y="30" width="7" height="20" rx="3" fill="#c0392b"/>
  <!-- Head -->
  <circle cx="32" cy="16" r="12" fill="#fdbf60"/>
  <!-- Hair -->
  <path d="M22 12 Q22 4 32 4 Q42 4 42 12 Q42 8 32 8 Q22 8 22 12Z" fill="#8B4513"/>
  <!-- Eyes -->
  <circle cx="28" cy="15" r="1.5" fill="#333"/>
  <circle cx="36" cy="15" r="1.5" fill="#333"/>
  <!-- Mouth -->
  <path d="M29 20 Q32 22 35 20" stroke="#333" fill="none" stroke-width="1"/>
</svg>`;

const PLAYER_SVG_WALK1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">
  <!-- Shadow -->
  <ellipse cx="32" cy="74" rx="20" ry="6" fill="rgba(0,0,0,0.25)"/>
  <!-- Left leg (forward) -->
  <rect x="20" y="50" width="8" height="20" rx="3" fill="#4a3728" transform="rotate(-12, 24, 52)"/>
  <!-- Right leg (back) -->
  <rect x="36" y="50" width="8" height="20" rx="3" fill="#3d2d1f" transform="rotate(12, 40, 52)"/>
  <!-- Body (slight forward lean) -->
  <path d="M20 28 Q20 52 24 56 L40 56 Q44 52 44 28 Q44 22 32 20 Q20 22 20 28Z" fill="#e74c3c" transform="translate(-1, 0)"/>
  <!-- Belt -->
  <rect x="20" y="46" width="22" height="4" rx="2" fill="#7f4f24"/>
  <!-- Left arm (forward swing) -->
  <rect x="12" y="28" width="7" height="20" rx="3" fill="#e74c3c" transform="rotate(15, 15, 30)"/>
  <!-- Right arm (back swing) -->
  <rect x="43" y="28" width="7" height="20" rx="3" fill="#c0392b" transform="rotate(-15, 47, 30)"/>
  <!-- Head -->
  <circle cx="31" cy="16" r="12" fill="#fdbf60"/>
  <!-- Hair -->
  <path d="M21 12 Q21 4 31 4 Q41 4 41 12 Q41 8 31 8 Q21 8 21 12Z" fill="#8B4513"/>
  <!-- Eyes -->
  <circle cx="27" cy="15" r="1.5" fill="#333"/>
  <circle cx="35" cy="15" r="1.5" fill="#333"/>
  <!-- Mouth -->
  <path d="M28 20 Q31 22 34 20" stroke="#333" fill="none" stroke-width="1"/>
</svg>`;

const PLAYER_SVG_WALK2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 80">
  <!-- Shadow -->
  <ellipse cx="32" cy="74" rx="20" ry="6" fill="rgba(0,0,0,0.25)"/>
  <!-- Left leg (back) -->
  <rect x="20" y="50" width="8" height="20" rx="3" fill="#4a3728" transform="rotate(12, 24, 52)"/>
  <!-- Right leg (forward) -->
  <rect x="36" y="50" width="8" height="20" rx="3" fill="#3d2d1f" transform="rotate(-12, 40, 52)"/>
  <!-- Body (slight lean other way) -->
  <path d="M20 28 Q20 52 24 56 L40 56 Q44 52 44 28 Q44 22 32 20 Q20 22 20 28Z" fill="#e74c3c" transform="translate(1, 0)"/>
  <!-- Belt -->
  <rect x="22" y="46" width="22" height="4" rx="2" fill="#7f4f24"/>
  <!-- Left arm (back swing) -->
  <rect x="14" y="28" width="7" height="20" rx="3" fill="#e74c3c" transform="rotate(-15, 17, 30)"/>
  <!-- Right arm (forward swing) -->
  <rect x="45" y="28" width="7" height="20" rx="3" fill="#c0392b" transform="rotate(15, 49, 30)"/>
  <!-- Head -->
  <circle cx="33" cy="16" r="12" fill="#fdbf60"/>
  <!-- Hair -->
  <path d="M23 12 Q23 4 33 4 Q43 4 43 12 Q43 8 33 8 Q23 8 23 12Z" fill="#8B4513"/>
  <!-- Eyes -->
  <circle cx="29" cy="15" r="1.5" fill="#333"/>
  <circle cx="37" cy="15" r="1.5" fill="#333"/>
  <!-- Mouth -->
  <path d="M30 20 Q33 22 36 20" stroke="#333" fill="none" stroke-width="1"/>
</svg>`;

// ─── SVG Image Cache ─────────────────────────────────────────

const _spriteCache = new Map<string, HTMLImageElement>();

function getSpriteImage(svgSource: string): HTMLImageElement | null {
  const cached = _spriteCache.get(svgSource);
  if (cached) return cached.complete ? cached : null;

  const img = new Image();
  const blob = new Blob([svgSource], { type: 'image/svg+xml' });
  img.src = URL.createObjectURL(blob);
  _spriteCache.set(svgSource, img);
  return img.complete ? img : null;
}

/** Pre-load all player sprites at startup. */
export function preloadPlayerSprites(): void {
  getSpriteImage(PLAYER_SVG_IDLE);
  getSpriteImage(PLAYER_SVG_WALK1);
  getSpriteImage(PLAYER_SVG_WALK2);
}

// ─── Factory ─────────────────────────────────────────────────

/** Create initial player state at a world position. */
export function createPlayerState(col: number, row: number): PlayerState {
  return {
    worldCol: col,
    worldRow: row,
    facing: 's',
    animFrame: 0,
    sinkDepthPx: 0,
    tileZPx: 0,
    moving: false,
  };
}

// ─── Movement & Animation ────────────────────────────────────

let _animCounter = 0;

/**
 * Update player position from WASD/arrow input.
 * Returns true if player moved this frame.
 */
export function updatePlayer(
  player: PlayerState,
  keysDown: ReadonlySet<string>,
  dt: number,
): boolean {
  const speed = MOVE_SPEED * dt;
  let dx = 0;
  let dy = 0;

  if (keysDown.has('w') || keysDown.has('W') || keysDown.has('ArrowUp'))    dy -= speed;
  if (keysDown.has('s') || keysDown.has('S') || keysDown.has('ArrowDown'))  dy += speed;
  if (keysDown.has('a') || keysDown.has('A') || keysDown.has('ArrowLeft'))  dx -= speed;
  if (keysDown.has('d') || keysDown.has('D') || keysDown.has('ArrowRight')) dx += speed;

  player.moving = dx !== 0 || dy !== 0;

  if (player.moving) {
    player.worldCol += dx;
    player.worldRow += dy;

    // Determine facing from movement direction
    if (Math.abs(dy) > Math.abs(dx)) {
      player.facing = dy < 0 ? 'n' : 's';
    } else {
      player.facing = dx < 0 ? 'w' : 'e';
    }

    // Walk animation cycling
    _animCounter++;
    if (_animCounter >= ANIM_FRAME_INTERVAL) {
      _animCounter = 0;
      player.animFrame = ((player.animFrame % 2) + 1) as AnimFrame; // cycles 1 → 2 → 1 → 2
    }
  } else {
    player.animFrame = 0; // idle
    _animCounter = 0;
  }

  return player.moving;
}

/**
 * Update player sinkDepthPx from the nano stack on the current tile.
 * Call after movement, before rendering.
 */
export function updatePlayerSink(
  player: PlayerState,
  getTile: (col: number, row: number) => MicroTile | null,
): void {
  const tileCol = Math.floor(player.worldCol);
  const tileRow = Math.floor(player.worldRow);
  const tile = getTile(tileCol, tileRow);

  if (!tile || !tile.nanos) {
    // No nanos — just update tile Z elevation
    player.sinkDepthPx = 0;
    player.tileZPx = tile ? tile.z * Z_PX_PER_LEVEL : 0;
    return;
  }

  // Update tile Z elevation
  player.tileZPx = tile.z * Z_PX_PER_LEVEL;

  // Find the most negative zOffset among the tile's nanos
  let lowestZ = 0;
  for (const nano of tile.nanos) {
    if (nano.zMode === 'negative' && nano.zOffset < lowestZ) {
      lowestZ = nano.zOffset;
    }
  }

  player.sinkDepthPx = Math.abs(lowestZ) * Z_PX_PER_LEVEL;
}

// ─── Camera Follow ───────────────────────────────────────────

/** Smoothly lerp camera toward player position. */
export function updateCameraFollow(
  camera: { x: number; y: number },
  player: PlayerState,
): void {
  camera.x += (player.worldCol - camera.x) * CAM_LERP;
  camera.y += (player.worldRow - camera.y) * CAM_LERP;
}

// ─── Rendering ───────────────────────────────────────────────

/**
 * Get the sprite image for the current animation frame.
 */
function getPlayerSprite(frame: AnimFrame): HTMLImageElement | null {
  switch (frame) {
    case 0: return getSpriteImage(PLAYER_SVG_IDLE);
    case 1: return getSpriteImage(PLAYER_SVG_WALK1);
    case 2: return getSpriteImage(PLAYER_SVG_WALK2);
  }
}

/**
 * Draw the player character at the correct isometric screen position.
 *
 * @param ctx Canvas rendering context (in world/camera-space — after camera transform)
 * @param player Current player state
 * @param _sun Sun state for optional shadow casting
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  _sun?: SunState,
): void {
  const sprite = getPlayerSprite(player.animFrame);
  if (!sprite) return;

  // Convert world position to isometric screen coordinates
  const { sx, sy } = worldToIso(player.worldCol, player.worldRow, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);

  // Apply sink depth (feet dip into negative-Z tiles like rivers)
  // Apply tile Z elevation (feet rise on elevated tiles)
  const finalSy = sy + player.sinkDepthPx - player.tileZPx;

  // Position sprite so feet align with tile center
  const drawX = sx - PLAYER_W / 2;
  const drawY = finalSy - FEET_OFFSET_Y;

  ctx.save();

  // Flip horizontally for west-facing
  if (player.facing === 'w') {
    ctx.translate(sx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-sx, 0);
  }

  ctx.drawImage(sprite, drawX, drawY, PLAYER_W, PLAYER_H);
  ctx.restore();
}

/**
 * Get the isometric sort key for the player.
 * Used to interleave player draw with nano overlay redraws.
 */
export function getPlayerSortKey(player: PlayerState): number {
  return (player.worldRow + player.worldCol) + 0.5; // +0.5 to place between tile rows
}

// ─── Occlusion: Re-draw positive nanos in front of player ────

/**
 * Redraw positive nano overlays that should visually occlude the player.
 * Called AFTER drawing the player to composite occluding features on top.
 *
 * Strategy: For each tile in the player's vicinity that has positive nanos
 * and a higher sort key (in front of player in iso space), re-draw those nanos.
 * The double-draw is harmless for opaque elements and creates natural alpha
 * occlusion for fence gaps.
 *
 * @param ctx Canvas in camera-space (after camera transform)
 * @param player Current player state
 * @param chunkLookup Function to get a chunk by cx, cy
 * @param sun Current sun state
 */
export function drawOccludingNanos(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  chunkLookup: (cx: number, cy: number) => WorldUnitChunk | null,
  sun?: SunState,
): void {
  const playerSortKey = getPlayerSortKey(player);
  const pCol = Math.floor(player.worldCol);
  const pRow = Math.floor(player.worldRow);

  // Check a 5×5 area around player for nearby positive nanos
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const wc = pCol + dc;
      const wr = pRow + dr;
      const tileSortKey = (wr + wc) + 0.01 * wc;

      // Only redraw nanos that are IN FRONT of the player (higher sort key)
      if (tileSortKey <= playerSortKey) continue;

      // Look up the tile
      const cx = Math.floor(wc / WORLD_UNIT_TILES);
      const cy = Math.floor(wr / WORLD_UNIT_TILES);
      const chunk = chunkLookup(cx, cy);
      if (!chunk) continue;

      const localCol = ((wc % WORLD_UNIT_TILES) + WORLD_UNIT_TILES) % WORLD_UNIT_TILES;
      const localRow = ((wr % WORLD_UNIT_TILES) + WORLD_UNIT_TILES) % WORLD_UNIT_TILES;
      const tile = chunk.tiles[localRow * WORLD_UNIT_TILES + localCol];
      if (!tile?.nanos) continue;

      // Only care about positive nanos (fences, walls) that can occlude
      const positiveNanos = tile.nanos.filter(n => n.zMode === 'positive');
      if (positiveNanos.length === 0) continue;

      // Get screen position for this tile (world coords → iso)
      const { sx, sy } = worldToIso(wc, wr, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
      const zPx = tile.z * Z_PX_PER_LEVEL;

      // Draw the positive nanos at the tile's screen position
      // sx/sy are in world-iso space; the ctx is already in camera-space
      drawNanoStack(ctx, positiveNanos, sx - ISO_TILE_WIDTH / 2, sy - ISO_TILE_HEIGHT / 2 - zPx, sun);
    }
  }
}
