// filepath: src/game/canvas-bootstrap.ts
// B5 micro-slice 11.35 (#268): canvas + responsive resize extracted from
// main.ts init(). Creates the canvas element, instantiates the
// IsometricRenderer, and wires up the responsive resize handler that
// reacts to viewport + sidebar-toggle events. Mutates RENDER_CONFIG
// (canvasWidth/Height) on resize — that field is intentionally mutable
// for the renderer to read each frame.
import { IsometricRenderer } from '../rendering/render';
import { RENDER_CONFIG } from '../config/game.config';
import { clearTerrainCache } from '../rendering/terrain-cache';
import { clearObjectCache } from '../rendering/render';
import { updateWasmConfig } from '../rendering/wasm-bridge';

/**
 * Set up the game canvas + renderer.
 *
 * Creates a <canvas> child of `#gameContainer`, instantiates the
 * `IsometricRenderer`, and installs the responsive resize handler
 * that fires on window resize and sidebar toggle. Returns the
 * constructed renderer so the caller can drive the per-frame loop.
 *
 * Resize behavior:
 *   - Internal resolution scales with `RENDER_CONFIG.renderScale`
 *   - Mutates `RENDER_CONFIG.canvasWidth/Height` (renderer reads each frame)
 *   - Updates WASM config + clears terrain + object caches when size changes
 *     (both caches depend on viewport size)
 */
export function setupCanvasAndRenderer(): IsometricRenderer {
  const container = document.getElementById('gameContainer');
  if (!container) throw new Error('Game container not found');

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const renderer = new IsometricRenderer(canvas);
  installResizeHandler(canvas);
  resizeCanvas(canvas);

  return renderer;
}

/**
 * Apply the current container size to the canvas + dependent caches.
 * Exported for tests / debug-api hooks that need to force a sync resize.
 */
function resizeCanvas(canvas: HTMLCanvasElement): void {
  const container = document.getElementById('gameContainer');
  if (!container) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  const scale = RENDER_CONFIG.renderScale;
  const rw = Math.round(w * scale);
  const rh = Math.round(h * scale);
  if (rw > 0 && rh > 0 && (rw !== canvas.width || rh !== canvas.height)) {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.imageRendering = 'pixelated';
    canvas.width = rw;
    canvas.height = rh;
    RENDER_CONFIG.canvasWidth = rw;
    RENDER_CONFIG.canvasHeight = rh;
    updateWasmConfig(rw, rh);
    clearTerrainCache(); // terrain cache depends on viewport
    clearObjectCache(); // object cell cache depends on chunk rendering
  }
}

/**
 * Install window-resize + sidebar-toggle listeners. Captures the canvas
 * in the resize closure so subsequent resizes reach the same element.
 */
function installResizeHandler(canvas: HTMLCanvasElement): void {
  const handler = () => resizeCanvas(canvas);
  window.addEventListener('resize', handler);
  // Also resize when sidebar toggles (after CSS transition settles)
  const sidebarToggle = document.getElementById('sidebarToggle');
  sidebarToggle?.addEventListener('click', () => {
    setTimeout(handler, 300);
  });
}
