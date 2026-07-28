/**
 * fog.ts - Fog-of-war system for exploration discovery.
 * Tracks visited cells, renders darkness overlay on unexplored areas.
 * Integrates with flashlight (night = smaller reveal radius).
 * TODO: DOC - fog-of-war rendering, visited state persistence
 */

import { RENDER_CONFIG } from '../config/game.config';
import { getCycleProgress } from './lighting';
import type { Camera } from './render';

// ─── Config ─────────────────────────────────────────────────

const FOG_CONFIG = {
  /** Reveal radius during full daylight (grid cells) */
  dayRadius: 10,
  /** Reveal radius at night without flashlight */
  nightRadius: 4,
  /** Reveal radius at night with flashlight */
  flashlightRadius: 8,
  /** Fog darkness (0-1, 1=fully opaque) */
  fogAlpha: 0.75,
  /** Edge fade cells (gradient from revealed to fogged) */
  edgeFade: 2,
  /** Color of fog overlay */
  fogColor: [10, 10, 20] as readonly [number, number, number],
} as const;

// ─── State ──────────────────────────────────────────────────

// Visited cells stored as Set of "x,y" strings for O(1) lookup.
// Bitfield compression done at save/load boundary.
const visitedCells = new Set<string>();

// Offscreen canvas for fog compositing (avoids per-cell draw calls)
let fogCanvas: OffscreenCanvas | null = null;
let fogCtx: OffscreenCanvasRenderingContext2D | null = null;
let fogEnabled = false; // #139: default OFF — user can enable via options

// ─── Core API ───────────────────────────────────────────────

/** Check if a cell has been visited. */
function isVisited(x: number, y: number): boolean {
  return visitedCells.has(`${x},${y}`);
}

/** Get current reveal radius based on time of day and flashlight state. */
function getRevealRadius(flashlightOn: boolean): number {
  const t = getCycleProgress();
  // Night: 0.80-0.92
  const isNight = t >= 0.73;
  const isDusk = t >= 0.65 && t < 0.73;

  if (isNight) {
    return flashlightOn ? FOG_CONFIG.flashlightRadius : FOG_CONFIG.nightRadius;
  }
  if (isDusk) {
    // Smooth transition dusk→night
    const duskT = (t - 0.65) / 0.08;
    const nightR = flashlightOn ? FOG_CONFIG.flashlightRadius : FOG_CONFIG.nightRadius;
    return Math.round(FOG_CONFIG.dayRadius + (nightR - FOG_CONFIG.dayRadius) * duskT);
  }
  return FOG_CONFIG.dayRadius;
}

/**
 * Mark a circular area around (worldX, worldY) as visited.
 * Used by map_scroll consumable and by the normal fog expansion pass.
 * Works even when fog overlay is disabled so the minimap still fills in.
 */
export function revealFogAround(
  worldX: number,
  worldY: number,
  radius: number,
): number {
  const r = Math.max(1, Math.floor(radius));
  const r2 = r * r;
  const px = Math.floor(worldX);
  const py = Math.floor(worldY);
  let newly = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const key = `${px + dx},${py + dy}`;
      if (!visitedCells.has(key)) {
        visitedCells.add(key);
        newly++;
      }
    }
  }
  return newly;
}

/**
 * Expand visited set around the player position within the reveal radius.
 * Call once per game tick (not per frame).
 */
export function updateFog(
  playerX: number,
  playerY: number,
  flashlightOn: boolean,
): void {
  if (!fogEnabled) return;

  const radius = getRevealRadius(flashlightOn);
  revealFogAround(playerX, playerY, radius);
}

/**
 * Render fog-of-war overlay on the game canvas.
 * Draws darkness on unvisited cells within the viewport.
 * Call after scene render, before or after lighting (depending on desired look).
 */
export function renderFog(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
): void {
  if (!fogEnabled) return;

  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const tw = RENDER_CONFIG.tileWidth;
  const th = RENDER_CONFIG.tileHeight;

  // Ensure offscreen canvas
  if (!fogCanvas || fogCanvas.width !== cw || fogCanvas.height !== ch) {
    fogCanvas = new OffscreenCanvas(cw, ch);
    fogCtx = fogCanvas.getContext('2d');
  }
  if (!fogCtx) return;

  const fCtx = fogCtx;

  // Fill fog canvas with dark
  const [fr, fg, fb] = FOG_CONFIG.fogColor;
  fCtx.clearRect(0, 0, cw, ch);
  fCtx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${FOG_CONFIG.fogAlpha})`;
  fCtx.fillRect(0, 0, cw, ch);

  // Punch holes for visited cells using destination-out
  fCtx.globalCompositeOperation = 'destination-out';

  // Calculate visible grid range (expand by margin to cover edge fading)
  const margin = FOG_CONFIG.edgeFade + 2;
  // Inverse of gridToScreen: approximate grid bounds from screen corners
  // Screen center = camera position, isometric projection
  const halfW = cw / 2;
  const halfH = ch / 3; // y offset in gridToScreen is ch/3

  // Scan a generous grid range around the camera
  const gridRange = Math.ceil(Math.max(cw / tw, ch / th)) + margin;

  const camX = camera.x;
  const camY = camera.y;

  for (let dy = -gridRange; dy <= gridRange; dy++) {
    for (let dx = -gridRange; dx <= gridRange; dx++) {
      const gx = Math.round(camX) + dx;
      const gy = Math.round(camY) + dy;

      if (!isVisited(gx, gy)) continue;

      // Convert to screen space (same formula as renderer)
      const rx = gx - camX;
      const ry = gy - camY;
      const sx = (rx - ry) * (tw / 2) + halfW;
      const sy = (rx + ry) * (th / 2) + halfH;

      // Skip if far offscreen
      if (sx < -tw * 2 || sx > cw + tw * 2 || sy < -th * 2 || sy > ch + th * 2) continue;

      // Calculate alpha for edge fade
      let alpha = 1.0;
      const edgeFade = FOG_CONFIG.edgeFade;
      if (edgeFade > 0) {
        // Check if any unvisited neighbor exists nearby
        let minUnvisitedDist = edgeFade + 1;
        for (let edy = -edgeFade; edy <= edgeFade; edy++) {
          for (let edx = -edgeFade; edx <= edgeFade; edx++) {
            if (edx === 0 && edy === 0) continue;
            if (!isVisited(gx + edx, gy + edy)) {
              const d = Math.sqrt(edx * edx + edy * edy);
              if (d < minUnvisitedDist) minUnvisitedDist = d;
            }
          }
        }
        if (minUnvisitedDist <= edgeFade) {
          alpha = 0.5 + 0.5 * (minUnvisitedDist / edgeFade);
        }
      }

      // Draw a diamond (iso tile shape) to punch out visited area
      fCtx.globalAlpha = alpha;
      fCtx.beginPath();
      fCtx.moveTo(sx, sy - th / 2);
      fCtx.lineTo(sx + tw / 2, sy);
      fCtx.lineTo(sx, sy + th / 2);
      fCtx.lineTo(sx - tw / 2, sy);
      fCtx.closePath();
      fCtx.fill();
    }
  }

  // Reset
  fCtx.globalCompositeOperation = 'source-over';
  fCtx.globalAlpha = 1.0;

  // Blit fog onto game canvas
  ctx.drawImage(fogCanvas, 0, 0);
}

// ─── Toggle / Query ─────────────────────────────────────────

export function toggleFog(): void {
  fogEnabled = !fogEnabled;
}

export function isFogEnabled(): boolean {
  return fogEnabled;
}

export function setFogEnabled(en: boolean): void {
  fogEnabled = en;
}

/** Get the number of visited cells (for stats/debug). */
export function getVisitedCount(): number {
  return visitedCells.size;
}

// ─── Save / Load ────────────────────────────────────────────

/**
 * Export visited cells as a compact array of [x,y] pairs.
 * For save data. Chunk-relative bitfield would be smaller but this is simpler for now.
 */
export function serializeVisited(): number[][] {
  const result: number[][] = [];
  for (const key of visitedCells) {
    const [xs, ys] = key.split(',');
    result.push([parseInt(xs, 10), parseInt(ys, 10)]);
  }
  return result;
}

/**
 * Import visited cells from saved data.
 */
export function deserializeVisited(data: number[][]): void {
  visitedCells.clear();
  for (const [x, y] of data) {
    visitedCells.add(`${x},${y}`);
  }
}

// ─── Debug ──────────────────────────────────────────────────

export function getFogDebugInfo(): {
  enabled: boolean;
  visitedCount: number;
  revealRadius: number;
} {
  return {
    enabled: fogEnabled,
    visitedCount: visitedCells.size,
    revealRadius: getRevealRadius(false),
  };
}
