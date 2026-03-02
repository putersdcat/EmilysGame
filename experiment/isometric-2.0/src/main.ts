/**
 * main.ts — 2.0 Experiment: Entry point with canvas setup and game loop.
 * Orchestrates camera, input, chunk management, parallax, and rendering.
 * Uses viewport buffer + dirty-frame architecture for 60+ FPS.
 * TODO: DOC — startup flow, loop architecture, dirty-frame system
 */

import {
  type Camera,
  type SunState,
  type ParallaxLayer,
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  CHUNK_TILES,
  worldToIso,
  type WorldUnitChunk,
} from './types';
import { bakeChunk, generateDemoChunk, getChunkDrawPos, CHUNK_CANVAS_W, CHUNK_CANVAS_H } from './chunk';
import { loadAllAssets, getAssetLoadState } from './asset-loader';
import {
  createDefaultSunState,
  sunStateFromTime,
  renderParallaxLayers,
  createSkyLayer,
  createMountainLayer,
  createHillLayer,
  createCloudLayer,
} from './renderer';

// ─── Canvas Setup ────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const perfOverlay = document.getElementById('perf-overlay') as HTMLDivElement;

let _canvasDirty = true; // Force redraw after resize
function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  _canvasDirty = true;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─── Camera ──────────────────────────────────────────────────

const camera: Camera = { x: 2.5, y: 2.5, zoom: 0.75 };
let _prevCamX = NaN;
let _prevCamY = NaN;
let _prevZoom = NaN;

// ─── Sun & Time ──────────────────────────────────────────────

let _timeOfDay = 0.35; // Morning (0 = dawn, 0.5 = noon, 1 = dusk)
let _sunState: SunState = createDefaultSunState();
let _sunDirty = true; // True when sun changed (chunks need re-bake)

// ─── Parallax Layers ─────────────────────────────────────────

const _parallaxLayers: ParallaxLayer[] = [
  createSkyLayer(),
  createMountainLayer(),
  createHillLayer(),
  createCloudLayer(),
];

// ─── Input State ─────────────────────────────────────────────

const _keysDown = new Set<string>();
window.addEventListener('keydown', (e) => { _keysDown.add(e.key); });
window.addEventListener('keyup', (e) => { _keysDown.delete(e.key); });
function isKeyDown(key: string): boolean { return _keysDown.has(key); }

// ─── Chunk Management ────────────────────────────────────────

const VISIBLE_CHUNKS = 5;
const _chunks = new Map<string, WorldUnitChunk>();
let _anyChunkDirty = true;

function chunkKey(cx: number, cy: number): string { return `${cx},${cy}`; }

function ensureChunksAroundCamera(): boolean {
  const camChunkX = Math.floor(camera.x / CHUNK_TILES);
  const camChunkY = Math.floor(camera.y / CHUNK_TILES);
  const half = Math.floor(VISIBLE_CHUNKS / 2);
  let added = false;

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const cx = camChunkX + dx;
      const cy = camChunkY + dy;
      const key = chunkKey(cx, cy);
      if (!_chunks.has(key)) {
        _chunks.set(key, generateDemoChunk(cx, cy));
        added = true;
      }
    }
  }
  return added;
}

/** Mark all chunks as needing re-bake (e.g., when sun changes). */
function invalidateAllChunks(): void {
  for (const chunk of _chunks.values()) {
    chunk.dirty = true;
  }
  _anyChunkDirty = true;
}

// ─── Viewport Culling ────────────────────────────────────────

/** Check if a chunk's bounding box overlaps the viewport. */
function isChunkVisible(
  chunk: WorldUnitChunk,
  camIsoX: number,
  camIsoY: number,
  zoom: number,
  vpW: number,
  vpH: number,
): boolean {
  const { dx, dy } = getChunkDrawPos(chunk.cx, chunk.cy);
  const left = dx;
  const top = dy;
  const right = dx + CHUNK_CANVAS_W;
  const bottom = dy + CHUNK_CANVAS_H;

  const halfVpW = (vpW / 2) / zoom;
  const halfVpH = (vpH / 2) / zoom;
  const vpLeft = camIsoX - halfVpW;
  const vpRight = camIsoX + halfVpW;
  const vpTop = camIsoY - halfVpH;
  const vpBottom = camIsoY + halfVpH;

  return right > vpLeft && left < vpRight && bottom > vpTop && top < vpBottom;
}

// ─── Viewport Buffer ─────────────────────────────────────────
// When scene is dirty, composite to this buffer then blit to screen once.
// When idle, skip rendering entirely (canvas retains last frame).

let _vpBuffer: HTMLCanvasElement | null = null;
let _vpCtx: CanvasRenderingContext2D | null = null;
let _vpBufferW = 0;
let _vpBufferH = 0;

function ensureVpBuffer(w: number, h: number): CanvasRenderingContext2D {
  if (!_vpBuffer || _vpBufferW !== w || _vpBufferH !== h) {
    _vpBuffer = document.createElement('canvas');
    _vpBuffer.width = w;
    _vpBuffer.height = h;
    _vpCtx = _vpBuffer.getContext('2d')!;
    _vpBufferW = w;
    _vpBufferH = h;
  }
  return _vpCtx!;
}

// ─── Perf Tracking ───────────────────────────────────────────

let _lastTime = 0;
let _frameCount = 0;
let _fpsAccum = 0;
let _displayFps = 0;
let _visibleChunkCount = 0;
let _bakesThisSecond = 0;
let _displayBakes = 0;
let _skipsThisSecond = 0;
let _displaySkips = 0;
const FPS_UPDATE_INTERVAL = 500;

// ─── Game Loop ───────────────────────────────────────────────

function update(dt: number): boolean {
  let changed = false;
  const speed = 5 * dt;

  if (isKeyDown('w') || isKeyDown('ArrowUp'))    { camera.y -= speed; changed = true; }
  if (isKeyDown('s') || isKeyDown('ArrowDown'))  { camera.y += speed; changed = true; }
  if (isKeyDown('a') || isKeyDown('ArrowLeft'))  { camera.x -= speed; changed = true; }
  if (isKeyDown('d') || isKeyDown('ArrowRight')) { camera.x += speed; changed = true; }

  if (isKeyDown('+') || isKeyDown('=')) { camera.zoom = Math.min(3, camera.zoom + 0.02); changed = true; }
  if (isKeyDown('-'))                   { camera.zoom = Math.max(0.1, camera.zoom - 0.02); changed = true; }

  // Time-of-day controls: [ and ] to shift sun
  if (isKeyDown('[')) {
    _timeOfDay = Math.max(0.05, _timeOfDay - 0.3 * dt);
    _sunState = sunStateFromTime(_timeOfDay);
    _sunDirty = true;
    changed = true;
  }
  if (isKeyDown(']')) {
    _timeOfDay = Math.min(0.95, _timeOfDay + 0.3 * dt);
    _sunState = sunStateFromTime(_timeOfDay);
    _sunDirty = true;
    changed = true;
  }

  // Re-bake all chunks when sun angle changes
  if (_sunDirty) {
    invalidateAllChunks();
    _sunDirty = false;
  }

  if (ensureChunksAroundCamera()) changed = true;

  return changed;
}

/** Composite visible chunks to the viewport buffer. */
function compositeWorld(w: number, h: number): void {
  const zoom = camera.zoom;
  const camIso = worldToIso(camera.x, camera.y, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
  const vCtx = ensureVpBuffer(w, h);

  // Clear and draw parallax background
  renderParallaxLayers(vCtx, camIso.sx, camIso.sy, w, h, _parallaxLayers);

  // World rendering (camera-space)
  vCtx.save();
  vCtx.imageSmoothingEnabled = false;
  vCtx.translate(w / 2, h / 2);
  vCtx.scale(zoom, zoom);
  vCtx.translate(-camIso.sx, -camIso.sy);

  _visibleChunkCount = 0;
  let bakesThisFrame = 0;
  _anyChunkDirty = false;

  for (const chunk of _chunks.values()) {
    if (!isChunkVisible(chunk, camIso.sx, camIso.sy, zoom, w, h)) continue;
    _visibleChunkCount++;

    if (chunk.dirty || !chunk.cachedCanvas) {
      bakeChunk(chunk, _sunState);
      bakesThisFrame++;
      if (chunk.dirty) _anyChunkDirty = true;
    }

    if (!chunk.cachedCanvas) continue;
    const { dx, dy } = getChunkDrawPos(chunk.cx, chunk.cy);
    vCtx.drawImage(chunk.cachedCanvas, dx, dy);
  }
  _bakesThisSecond += bakesThisFrame;

  vCtx.restore();

  // HUD overlay on the buffer
  vCtx.fillStyle = 'rgba(255,255,255,0.4)';
  vCtx.font = '11px monospace';
  vCtx.fillText(
    `Camera: (${camera.x.toFixed(1)}, ${camera.y.toFixed(1)})  Zoom: ${camera.zoom.toFixed(2)}  Chunks: ${_visibleChunkCount}/${_chunks.size}  Sun: ${(_timeOfDay * 24).toFixed(1)}h  FPS: ${_displayFps}  Bakes/s: ${_displayBakes}  Skip%: ${_displaySkips}`,
    8, h - 10,
  );
}

// Render-time tracking (ms per actual composite frame)
let _renderTimeAccum = 0;
let _renderTimeCount = 0;
let _displayRenderMs = 0;

function render(): void {
  const w = canvas.width;
  const h = canvas.height;

  // Check if we need to redraw
  const cameraMoved = camera.x !== _prevCamX || camera.y !== _prevCamY || camera.zoom !== _prevZoom;
  const needsRedraw = cameraMoved || _canvasDirty || _anyChunkDirty;

  if (!needsRedraw) {
    _skipsThisSecond++;
    return; // Canvas retains last frame — do nothing
  }

  _prevCamX = camera.x;
  _prevCamY = camera.y;
  _prevZoom = camera.zoom;
  _canvasDirty = false;

  // Composite the full scene to viewport buffer, then blit to screen
  const t0 = performance.now();
  compositeWorld(w, h);

  // Single blit from viewport buffer to main canvas
  if (_vpBuffer) {
    ctx.drawImage(_vpBuffer, 0, 0);
  }
  const elapsed = performance.now() - t0;
  _renderTimeAccum += elapsed;
  _renderTimeCount++;
}

function gameLoop(timestamp: number): void {
  const dt = _lastTime ? Math.min((timestamp - _lastTime) / 1000, 0.1) : 0.016;
  _lastTime = timestamp;

  _frameCount++;
  _fpsAccum += dt;
  if (_fpsAccum >= FPS_UPDATE_INTERVAL / 1000) {
    _displayFps = Math.round(_frameCount / _fpsAccum);
    _displayBakes = _bakesThisSecond;
    const totalFrames = _frameCount;
    _displaySkips = totalFrames > 0 ? Math.round((_skipsThisSecond / totalFrames) * 100) : 0;
    _displayRenderMs = _renderTimeCount > 0 ? _renderTimeAccum / _renderTimeCount : 0;
    _frameCount = 0;
    _fpsAccum = 0;
    _bakesThisSecond = 0;
    _skipsThisSecond = 0;
    _renderTimeAccum = 0;
    _renderTimeCount = 0;
    perfOverlay.textContent = `FPS: ${_displayFps} | Render: ${_displayRenderMs.toFixed(1)}ms`;
  }

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// ─── Start ───────────────────────────────────────────────────

// Expose test API for Playwright and console debugging
// TODO: DOC — test API for camera, sun, forced render, perf metrics
interface TestAPI {
  setCamera: (x: number, y: number, zoom: number) => void;
  setSunTime: (t: number) => void;
  forceRender: () => void;
  getMetrics: () => {
    fps: number;
    renderMs: number;
    skip: number;
    bakes: number;
    chunks: number;
    visible: number;
  };
}

function createTestAPI(): TestAPI {
  return {
    setCamera(x: number, y: number, zoom: number) {
      camera.x = x; camera.y = y; camera.zoom = zoom;
      _canvasDirty = true;
    },
    setSunTime(t: number) {
      _timeOfDay = Math.max(0.05, Math.min(0.95, t));
      _sunState = sunStateFromTime(_timeOfDay);
      _sunDirty = true;
    },
    forceRender() {
      _canvasDirty = true;
      update(0);
      render();
    },
    getMetrics() {
      return {
        fps: _displayFps,
        renderMs: _displayRenderMs,
        skip: _displaySkips,
        bakes: _displayBakes,
        chunks: _chunks.size,
        visible: _visibleChunkCount,
      };
    },
  };
}

(window as unknown as Record<string, unknown>).__testAPI = createTestAPI();

async function boot(): Promise<void> {
  console.log('🔷 Isometric 2.0 Experiment — starting...');

  // Load tile assets before generating chunks
  const loadState = await loadAllAssets();
  const assetInfo = getAssetLoadState();
  console.log(`🔷 Assets: ${assetInfo.loaded}/${assetInfo.total} loaded`);

  // If some assets failed, log but continue (demo SVGs will be used as fallback)
  if (loadState.failed.length > 0) {
    console.warn('⚠️ Some assets failed to load, using fallback demo tiles for:', loadState.failed);
  }

  ensureChunksAroundCamera();
  requestAnimationFrame(gameLoop);
}

boot();
