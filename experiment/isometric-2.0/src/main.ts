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
  type MicroTile,
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
import { solveChunkFeatures, resolveAllConditions, isPointWalkableInTile, type NeighborLookup } from './solver';
import {
  createPlayerState,
  preloadPlayerSprites,
  updatePlayer,
  updatePlayerSink,
  updateCameraFollow,
  drawPlayer,
  drawOccludingNanos,
} from './player';

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

const camera: Camera = { x: 8, y: 8, zoom: 0.75 };
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

// ─── Player ──────────────────────────────────────────────────

const _player = createPlayerState(8, 8); // Start at tile (8, 8) — near walls/fences

// ─── Chunk Management ────────────────────────────────────────

const VISIBLE_CHUNKS = 5;
const _chunks = new Map<string, WorldUnitChunk>();
let _anyChunkDirty = true;

function chunkKey(cx: number, cy: number): string { return `${cx},${cy}`; }

/** Cross-chunk neighbor lookup for the solver. */
const _neighborLookup: NeighborLookup = (worldCol: number, worldRow: number) => {
  const cx = Math.floor(worldCol / CHUNK_TILES);
  const cy = Math.floor(worldRow / CHUNK_TILES);
  const chunk = _chunks.get(chunkKey(cx, cy));
  if (!chunk) return null;
  const localCol = ((worldCol % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
  const localRow = ((worldRow % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
  return chunk.tiles[localRow * CHUNK_TILES + localCol] ?? null;
};

function ensureChunksAroundCamera(): boolean {
  const camChunkX = Math.floor(camera.x / CHUNK_TILES);
  const camChunkY = Math.floor(camera.y / CHUNK_TILES);
  const half = Math.floor(VISIBLE_CHUNKS / 2);
  let added = false;
  const newKeys = new Set<string>();

  // Phase 1: Generate raw chunks
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const cx = camChunkX + dx;
      const cy = camChunkY + dy;
      const key = chunkKey(cx, cy);
      if (!_chunks.has(key)) {
        _chunks.set(key, generateDemoChunk(cx, cy));
        newKeys.add(key);
        added = true;
      }
    }
  }

  // Phase 2: Solve features on new chunks + re-solve neighbors of new chunks
  if (added) {
    // Collect keys that need solving: new chunks + their direct neighbors
    const solveKeys = new Set<string>(newKeys);
    for (const nk of newKeys) {
      const [ncx, ncy] = nk.split(',').map(Number);
      // Mark cardinal neighbors for re-solve (cross-chunk connections may have changed)
      for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const adjKey = chunkKey(ncx + ddx, ncy + ddy);
        if (_chunks.has(adjKey)) solveKeys.add(adjKey);
      }
    }

    for (const key of solveKeys) {
      const chunk = _chunks.get(key);
      if (!chunk) continue;
      const solved = solveChunkFeatures(chunk, _neighborLookup);
      _chunks.set(key, solved);
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
let _dirtyChunksThisFrame = 0;
let _bakesThisSecond = 0;
let _displayBakes = 0;
let _skipsThisSecond = 0;
let _displaySkips = 0;
let _showDebugHud = true;
const FPS_UPDATE_INTERVAL = 500;

// ─── Game Loop ───────────────────────────────────────────────

/** Tile lookup for player sink-depth queries (cross-chunk). */
function getTileAt(worldCol: number, worldRow: number): MicroTile | null {
  const cx = Math.floor(worldCol / CHUNK_TILES);
  const cy = Math.floor(worldRow / CHUNK_TILES);
  const chunk = _chunks.get(chunkKey(cx, cy));
  if (!chunk) return null;
  const lc = ((worldCol % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
  const lr = ((worldRow % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
  return chunk.tiles[lr * CHUNK_TILES + lc] ?? null;
}

/** Chunk lookup for occlusion nano re-draws. */
function getChunkAt(cx: number, cy: number): WorldUnitChunk | null {
  return _chunks.get(chunkKey(cx, cy)) ?? null;
}

/** Check walkability at a world position. Returns true if walkable, false if blocked, null if no data. */
function _isWalkableAt(col: number, row: number): boolean | null {
  const cx = Math.floor(col / CHUNK_TILES);
  const cy = Math.floor(row / CHUNK_TILES);
  const chunk = _chunks.get(chunkKey(cx, cy));
  if (!chunk || chunk.walkableMap.length === 0) return null;
  const lc = Math.floor((((col % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES));
  const lr = Math.floor((((row % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES));
  const tile = chunk.tiles[lr * CHUNK_TILES + lc];
  if (!tile) return chunk.walkableMap[lr * CHUNK_TILES + lc] ?? null;

  const localColFrac = ((col % 1) + 1) % 1;
  const localRowFrac = ((row % 1) + 1) % 1;
  return isPointWalkableInTile(tile, chunk.activeConditions, localColFrac, localRowFrac);
}

function update(dt: number): boolean {
  let changed = false;

  // Player movement via WASD/arrows — per-axis collision with boundary clamping.
  // Uses separate col/row checks so the player can slide along walls during
  // diagonal movement, and clamps to tile boundaries for symmetric collision
  // from all approach directions.
  const prevCol = _player.worldCol;
  const prevRow = _player.worldRow;
  const playerMoved = updatePlayer(_player, _keysDown, dt);
  if (playerMoved) {
    const newCol = _player.worldCol;
    const newRow = _player.worldRow;

    // Reset to previous position — we'll re-apply each axis independently
    _player.worldCol = prevCol;
    _player.worldRow = prevRow;

    // --- Col axis ---
    if (newCol !== prevCol) {
      const wCol = _isWalkableAt(newCol, prevRow);
      if (wCol === false) {
        // Blocked — clamp to tile boundary
        const blocked = Math.floor(newCol);
        _player.worldCol = (newCol > prevCol)
          ? blocked - 0.0001  // moving east → stop at west edge of blocked tile
          : blocked + 1.0;    // moving west → stop at east edge of blocked tile
        // Safety: verify clamped position is walkable (edge-case)
        if (_isWalkableAt(_player.worldCol, prevRow) === false) {
          _player.worldCol = prevCol;
        }
      } else {
        _player.worldCol = newCol;
      }
    }

    // --- Row axis (using potentially updated col) ---
    if (newRow !== prevRow) {
      const wRow = _isWalkableAt(_player.worldCol, newRow);
      if (wRow === false) {
        const blocked = Math.floor(newRow);
        _player.worldRow = (newRow > prevRow)
          ? blocked - 0.0001  // moving south → stop at north edge of blocked tile
          : blocked + 1.0;    // moving north → stop at south edge of blocked tile
        if (_isWalkableAt(_player.worldCol, _player.worldRow) === false) {
          _player.worldRow = prevRow;
        }
      } else {
        _player.worldRow = newRow;
      }
    }

    const moved = _player.worldCol !== prevCol || _player.worldRow !== prevRow;
    _player.moving = moved;
    if (moved) {
      updatePlayerSink(_player, getTileAt);
      changed = true;
    }
  }

  // U key: unlock all conditions on visible chunks (debug shortcut)
  if (_keysDown.has('u') || _keysDown.has('U')) {
    _keysDown.delete('u'); _keysDown.delete('U'); // consume
    for (const chunk of _chunks.values()) {
      if (chunk.activeConditions.size > 0) {
        resolveAllConditions(chunk);
        const key = chunkKey(chunk.cx, chunk.cy);
        _chunks.set(key, { ...chunk }); // trigger re-bake
      }
    }
    changed = true;
  }

  // F3 key: toggle debug HUD visibility (canvas overlay)
  // NOTE: 'd' was previously used but conflicts with WASD east movement
  if (_keysDown.has('F3')) {
    _keysDown.delete('F3');
    _showDebugHud = !_showDebugHud;
    changed = true;
  }

  // Camera follows player with smooth lerp
  updateCameraFollow(camera, _player);
  changed = true; // Camera always potentially dirty from lerp

  // Zoom controls (still on +/-)
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
  _dirtyChunksThisFrame = 0;
  let bakesThisFrame = 0;
  _anyChunkDirty = false;

  for (const chunk of _chunks.values()) {
    if (!isChunkVisible(chunk, camIso.sx, camIso.sy, zoom, w, h)) continue;
    _visibleChunkCount++;

    if (chunk.dirty || !chunk.cachedCanvas) {
      _dirtyChunksThisFrame++;
    }

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

  // ── Draw player character (after chunks, before occlusion overlay) ──
  drawPlayer(vCtx, _player, _sunState);

  // ── Redraw positive nanos that should occlude the player ──
  drawOccludingNanos(vCtx, _player, getChunkAt, _sunState);

  vCtx.restore();

  if (_showDebugHud) {
    vCtx.fillStyle = 'rgba(255,255,255,0.4)';
    vCtx.font = '11px monospace';
    vCtx.fillText(
      `Camera: (${camera.x.toFixed(1)}, ${camera.y.toFixed(1)})  Zoom: ${camera.zoom.toFixed(2)}  Chunks: ${_visibleChunkCount}/${_chunks.size}  Dirty: ${_dirtyChunksThisFrame}  Sun: ${(_timeOfDay * 24).toFixed(1)}h  FPS: ${_displayFps}  Frame: ${_displayRenderMs.toFixed(1)}ms  Bakes/s: ${_displayBakes}  Skip%: ${_displaySkips}`,
      8, h - 10,
    );
  }
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
  /** Inspect a tile at world coordinates. Returns kind, variant, connections, z. */
  getTile: (worldCol: number, worldRow: number) => {
    kind: string; z: number; variant?: string;
    connections?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
    nanos?: { kind: string; zMode: string; zOffset: number }[];
  } | null;
  /** Get current player state. */
  getPlayer: () => { col: number; row: number; facing: string; sinkPx: number; moving: boolean };
  /** Set player position directly. */
  setPlayer: (col: number, row: number) => void;
  /** Inject a key press directly into _keysDown for automated testing. */
  simulateKey: (key: string, down: boolean) => void;
  /** Run update() with the given dt in seconds — needed because forceRender uses dt=0. */
  tickUpdate: (dt: number) => void;
  /** Get walkable status at a world tile. */
  getWalkable: (worldCol: number, worldRow: number) => boolean | null;
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
    getTile(worldCol: number, worldRow: number) {
      const cx = Math.floor(worldCol / CHUNK_TILES);
      const cy = Math.floor(worldRow / CHUNK_TILES);
      const chunk = _chunks.get(`${cx},${cy}`);
      if (!chunk) return null;
      const lc = ((worldCol % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
      const lr = ((worldRow % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
      const tile = chunk.tiles[lr * CHUNK_TILES + lc];
      if (!tile) return null;
      return {
        kind: tile.kind,
        z: tile.z,
        variant: tile.variant,
        connections: tile.connections,
        nanos: tile.nanos?.map(n => ({ kind: n.kind, zMode: n.zMode, zOffset: n.zOffset, walkableType: n.walkable?.type ?? 'undefined', variant: n.variant ?? 'none', hasSide: !!n.sideTextureSvg, hasTop: !!n.topTextureSvg, svgLen: n.svg?.length ?? 0 })),
      };
    },
    getPlayer() {
      return {
        col: _player.worldCol,
        row: _player.worldRow,
        facing: _player.facing,
        sinkPx: _player.sinkDepthPx,
        moving: _player.moving,
      };
    },
    setPlayer(col: number, row: number) {
      _player.worldCol = col;
      _player.worldRow = row;
      updatePlayerSink(_player, getTileAt);
      _canvasDirty = true;
    },
    simulateKey(key: string, down: boolean) {
      if (down) _keysDown.add(key);
      else _keysDown.delete(key);
    },
    tickUpdate(dt: number) {
      update(dt);
      _canvasDirty = true;
    },
    getWalkable(worldCol: number, worldRow: number) {
      const cx = Math.floor(worldCol / CHUNK_TILES);
      const cy = Math.floor(worldRow / CHUNK_TILES);
      const chunk = _chunks.get(`${cx},${cy}`);
      if (!chunk || chunk.walkableMap.length === 0) return null;
      const lc = ((worldCol % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
      const lr = ((worldRow % CHUNK_TILES) + CHUNK_TILES) % CHUNK_TILES;
      return chunk.walkableMap[lr * CHUNK_TILES + lc] ?? null;
    },
  };
}

(window as unknown as Record<string, unknown>).__testAPI = createTestAPI();

async function boot(): Promise<void> {
  console.log('🔷 Isometric 2.0 Experiment — starting...');

  // Pre-load player sprites
  preloadPlayerSprites();

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
