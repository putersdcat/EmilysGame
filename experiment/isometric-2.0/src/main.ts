/**
 * main.ts — 2.0 Experiment: Entry point with canvas setup and game loop.
 * Orchestrates camera, input, chunk management, and rendering.
 * TODO: DOC — startup flow and loop architecture
 */

import {
  type Camera,
  ISO_TILE_WIDTH,
  ISO_TILE_HEIGHT,
  CHUNK_TILES,
  worldToIso,
  type WorldUnitChunk,
} from './types';
import { bakeChunk, generateDemoChunk, getChunkDrawPos } from './chunk';
import { loadAllAssets, getAssetLoadState } from './asset-loader';

// ─── Canvas Setup ────────────────────────────────────────────

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const perfOverlay = document.getElementById('perf-overlay') as HTMLDivElement;

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// ─── Camera ──────────────────────────────────────────────────

const camera: Camera = { x: 2.5, y: 2.5, zoom: 0.5 };

// ─── Input State ─────────────────────────────────────────────

const _keysDown = new Set<string>();
window.addEventListener('keydown', (e) => { _keysDown.add(e.key); });
window.addEventListener('keyup', (e) => { _keysDown.delete(e.key); });
function isKeyDown(key: string): boolean { return _keysDown.has(key); }

// ─── Chunk Management ────────────────────────────────────────

const VISIBLE_CHUNKS = 5;
const _chunks = new Map<string, WorldUnitChunk>();

function chunkKey(cx: number, cy: number): string { return `${cx},${cy}`; }

function ensureChunksAroundCamera(): void {
  const camChunkX = Math.floor(camera.x / CHUNK_TILES);
  const camChunkY = Math.floor(camera.y / CHUNK_TILES);
  const half = Math.floor(VISIBLE_CHUNKS / 2);

  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const cx = camChunkX + dx;
      const cy = camChunkY + dy;
      const key = chunkKey(cx, cy);
      if (!_chunks.has(key)) {
        _chunks.set(key, generateDemoChunk(cx, cy));
      }
    }
  }
}

// ─── Perf Tracking ───────────────────────────────────────────

let _lastTime = 0;
let _frameCount = 0;
let _fpsAccum = 0;
let _displayFps = 0;
const FPS_UPDATE_INTERVAL = 500;

// ─── Game Loop ───────────────────────────────────────────────

function update(dt: number): void {
  const speed = 5 * dt;
  if (isKeyDown('w') || isKeyDown('ArrowUp'))    camera.y -= speed;
  if (isKeyDown('s') || isKeyDown('ArrowDown'))  camera.y += speed;
  if (isKeyDown('a') || isKeyDown('ArrowLeft'))  camera.x -= speed;
  if (isKeyDown('d') || isKeyDown('ArrowRight')) camera.x += speed;

  if (isKeyDown('+') || isKeyDown('=')) camera.zoom = Math.min(3, camera.zoom + 0.02);
  if (isKeyDown('-'))                   camera.zoom = Math.max(0.1, camera.zoom - 0.02);

  ensureChunksAroundCamera();
}

function render(): void {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, w, h);
  ctx.save();

  // Camera transform
  const zoom = camera.zoom;
  const camIso = worldToIso(camera.x, camera.y, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-camIso.sx, -camIso.sy);

  // Render chunks
  for (const chunk of _chunks.values()) {
    if (chunk.dirty || !chunk.cachedCanvas) {
      bakeChunk(chunk);
    }
    if (!chunk.cachedCanvas) continue;

    const { dx, dy } = getChunkDrawPos(chunk.cx, chunk.cy);
    ctx.drawImage(chunk.cachedCanvas, dx, dy);
  }

  ctx.restore();

  // HUD overlay
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px monospace';
  ctx.fillText(
    `Camera: (${camera.x.toFixed(1)}, ${camera.y.toFixed(1)})  Zoom: ${camera.zoom.toFixed(2)}  Chunks: ${_chunks.size}  FPS: ${_displayFps}`,
    8, h - 10,
  );
}

function gameLoop(timestamp: number): void {
  const dt = _lastTime ? Math.min((timestamp - _lastTime) / 1000, 0.1) : 0.016;
  _lastTime = timestamp;

  _frameCount++;
  _fpsAccum += dt;
  if (_fpsAccum >= FPS_UPDATE_INTERVAL / 1000) {
    _displayFps = Math.round(_frameCount / _fpsAccum);
    _frameCount = 0;
    _fpsAccum = 0;
    perfOverlay.textContent = `FPS: ${_displayFps}`;
  }

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// ─── Start ───────────────────────────────────────────────────

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
