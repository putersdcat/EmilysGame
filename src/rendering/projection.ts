/**
 * projection.ts — Isometric world→screen projection math.
 *
 * Pure functions, no allocations, no `this` dependency. Safe for the
 * render hot path. Extracted from `render.ts` in B6.2 (#269).
 *
 * The screen origin for the camera is (canvasWidth/2, canvasHeight/3) —
 * a slight downward shift that gives the world a horizon rather than
 * centering the player at exact pixel middle.
 */
import { RENDER_CONFIG } from '../config/game.config';
import type { Camera } from '../types/game.types';

/** Project world grid coords to screen pixel coords, offset by camera. */
export function gridToScreen(
  gx: number,
  gy: number,
  camera: Camera,
): { x: number; y: number } {
  const tw = RENDER_CONFIG.tileWidth;
  const th = RENDER_CONFIG.tileHeight;
  const rx = gx - camera.x;
  const ry = gy - camera.y;
  return {
    x: (rx - ry) * (tw / 2) + RENDER_CONFIG.canvasWidth / 2,
    y: (rx + ry) * (th / 2) + RENDER_CONFIG.canvasHeight / 3,
  };
}

/** Test if a screen point lies within the visible canvas (with margin). */
export function isVisible(sx: number, sy: number, margin = 64): boolean {
  return (
    sx > -margin &&
    sx < RENDER_CONFIG.canvasWidth + margin &&
    sy > -margin &&
    sy < RENDER_CONFIG.canvasHeight + margin
  );
}
