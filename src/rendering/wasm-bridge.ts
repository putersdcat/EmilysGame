/**
 * wasm-bridge.ts - Bridge between TypeScript renderer and WASM rendering core.
 * Manages WASM module lifecycle, data marshalling, and fallback to JS.
 * Uses raw heap pointers in WASM to avoid StaticArray header alignment issues.
 * TODO: DOC - WASM bridge architecture, data layout, fallback behavior
 */

import { RENDER_CONFIG, WORLD_CONFIG } from '../config/game.config';
import { ASSET_DEFS } from '../config/assets.config';
import { getBiome } from '../config/biomes.config';
import { ALL_TILE_TYPES, type TileType } from './tiles';
import type { ChunkData } from '../engine/gen';
import type { Camera } from './render';

// === WASM module interface (matches build/release.d.ts exports) ===
interface WasmExports {
  memory: WebAssembly.Memory;
  getCellBufferPtr(): number;
  getCmdBufferPtr(): number;
  getSortIndexPtr(): number;
  getCellStride(): number;
  getCmdStride(): number;
  getMaxCells(): number;
  getMaxCmds(): number;
  setConfig(cw: number, ch: number, tw: number, th: number, margin: number): void;
  setCamera(cx: number, cy: number): void;
  processCells(cellCount: number): number;
  addPlayerAndSort(px: number, py: number, playerDir: number): number;
  getSortedCmdIndex(i: number): number;
  getCmdCount(): number;
  benchGridToScreen(iterations: number, gx: number, gy: number): number;
}

// === Draw command types (must match WASM constants) ===
export const WCMD_TILE = 0;
export const WCMD_EMOJI = 1;
export const WCMD_SHADOW_EMOJI = 2;
export const WCMD_ITEM = 3;
export const WCMD_PLAYER = 4;

// === Draw command struct (read from WASM output) ===
export interface WasmDrawCmd {
  type: number;
  sx: number;
  sy: number;
  scale: number;
  tint: number;
  assetKey: string;     // Resolved from assetIndex
  tileType: TileType | null;  // Resolved from tileTypeIndex
  sortKey: number;
  flags: number;        // bit 0 = shadow, bit 1 = flipX
}

// === Asset index mapping (TS ↔ WASM) ===

// Build ordered arrays of asset keys and tile types for index-based lookup
const assetKeys: string[] = Object.keys(ASSET_DEFS);
const assetKeyToIndex: Map<string, number> = new Map();
for (let i = 0; i < assetKeys.length; i++) {
  assetKeyToIndex.set(assetKeys[i], i);
}

const tileTypeToIndex: Map<string, number> = new Map();
for (let i = 0; i < ALL_TILE_TYPES.length; i++) {
  tileTypeToIndex.set(ALL_TILE_TYPES[i], i);
}

function getAssetIndex(key: string): number {
  return assetKeyToIndex.get(key) ?? -1;
}

function getTileTypeIndex(tileType: TileType | undefined): number {
  if (!tileType) return -1;
  return tileTypeToIndex.get(tileType) ?? -1;
}

// === Cached chunk offsets (computed once, reused every frame) ===
let cachedChunkOffsets: { dcx: number; dcy: number }[] | null = null;
let cachedBufSize = -1;

function getChunkOffsets(buf: number): { dcx: number; dcy: number }[] {
  if (cachedChunkOffsets && buf === cachedBufSize) return cachedChunkOffsets;
  const offsets: { dcx: number; dcy: number }[] = [];
  for (let dcy = -buf; dcy <= buf; dcy++) {
    for (let dcx = -buf; dcx <= buf; dcx++) {
      offsets.push({ dcx, dcy });
    }
  }
  offsets.sort((a, b) =>
    (a.dcx * a.dcx + a.dcy * a.dcy) - (b.dcx * b.dcx + b.dcy * b.dcy)
  );
  cachedChunkOffsets = offsets;
  cachedBufSize = buf;
  return offsets;
}

// === Pre-allocated draw command pool (avoid per-frame GC) ===
const CMD_POOL_SIZE = 8192;
const cmdPool: WasmDrawCmd[] = [];
for (let i = 0; i < CMD_POOL_SIZE; i++) {
  cmdPool.push({ type: 0, sx: 0, sy: 0, scale: 0, tint: 0, assetKey: '', tileType: null, sortKey: 0, flags: 0 });
}
// Reusable result view (avoids new Array allocation)
let cmdResultBuf: WasmDrawCmd[] = [];

// === WASM Module State ===

let wasmModule: WasmExports | null = null;
let cellView: Float32Array | null = null;
let cmdView: Float32Array | null = null;
let sortView: Int32Array | null = null;
let cellStride = 12;
let cmdStride = 9;
let maxCells = 4096;
let wasmReady = false;

// === Load & Initialize ===

/**
 * Load the WASM rendering core module.
 * Returns true if loaded successfully, false if WASM unavailable.
 */
export async function initWasmRenderer(): Promise<boolean> {
  try {
    // Load the WASM module from public directory
    const response = await fetch('/wasm/release.wasm');
    if (!response.ok) {
      console.warn('[WASM] Failed to fetch WASM module:', response.status);
      return false;
    }

    const wasmBytes = await response.arrayBuffer();

    // AssemblyScript ESM bindings export an instantiate helper,
    // but we can also use raw WebAssembly API for more control
    const imports = {
      env: {
        abort: (_msg: number, _file: number, line: number, col: number) => {
          console.error(`[WASM] abort at ${line}:${col}`);
        },
      },
    };

    const { instance } = await WebAssembly.instantiate(wasmBytes, imports);
    const exports = instance.exports as unknown as WasmExports;

    // Validate exports
    if (!exports.setConfig || !exports.processCells || !exports.addPlayerAndSort) {
      console.warn('[WASM] Module missing required exports');
      return false;
    }

    wasmModule = exports;

    // Read buffer constants
    cellStride = exports.getCellStride();
    cmdStride = exports.getCmdStride();
    maxCells = exports.getMaxCells();

    // Set renderer config from TS constants
    exports.setConfig(
      RENDER_CONFIG.canvasWidth,
      RENDER_CONFIG.canvasHeight,
      RENDER_CONFIG.tileWidth,
      RENDER_CONFIG.tileHeight,
      64, // visibility margin
    );

    // Create typed array views into WASM memory
    rebuildViews();

    wasmReady = true;
    console.log('[WASM] Rendering core loaded successfully');
    return true;
  } catch (err) {
    console.warn('[WASM] Failed to load rendering core:', err);
    return false;
  }
}

/** Rebuild typed array views after memory growth */
function rebuildViews(): void {
  if (!wasmModule) return;
  const mem = wasmModule.memory;
  const cellPtr = wasmModule.getCellBufferPtr();
  const cmdPtr = wasmModule.getCmdBufferPtr();
  const sortPtr = wasmModule.getSortIndexPtr();

  cellView = new Float32Array(mem.buffer, cellPtr, maxCells * cellStride);
  cmdView = new Float32Array(mem.buffer, cmdPtr, wasmModule.getMaxCmds() * cmdStride);
  sortView = new Int32Array(mem.buffer, sortPtr, wasmModule.getMaxCmds());
}

/** Check if WASM renderer is loaded and ready */
export function isWasmReady(): boolean {
  return wasmReady && wasmModule !== null;
}

/** Update WASM viewport config after canvas resize */
export function updateWasmConfig(w: number, h: number): void {
  if (!wasmModule) return;
  wasmModule.setConfig(w, h, RENDER_CONFIG.tileWidth, RENDER_CONFIG.tileHeight, 64);
}

// === Main render pipeline: marshal data → WASM → read results ===

/**
 * Process visible chunks through WASM: transform, cull, sort.
 * Returns sorted draw commands ready for Canvas execution.
 * @param skipBaseTerrain - if true, skip base-layer cells (they're rendered from terrain cache)
 */
export function wasmBuildDrawCmds(
  chunks: Map<string, ChunkData>,
  camera: Camera,
  egoPos: { x: number; y: number },
  egoDir: number,
  skipBaseTerrain = false,
): WasmDrawCmd[] {
  if (!wasmModule || !cellView || !cmdView || !sortView) return [];

  // Ensure views are still valid (memory might have grown)
  if (cellView.buffer !== wasmModule.memory.buffer) {
    rebuildViews();
    if (!cellView || !cmdView || !sortView) return [];
  }

  // Set camera
  wasmModule.setCamera(camera.x, camera.y);

  // Marshal cell data into WASM input buffer
  // Process chunks from center outward so visible cells fill the buffer first
  const size = WORLD_CONFIG.chunkSize;
  const camCX = Math.floor(camera.x / size);
  const camCY = Math.floor(camera.y / size);
  const buf = WORLD_CONFIG.viewportBuffer; // matches chunk loading radius

  // Use cached chunk offsets (no per-frame alloc+sort)
  const chunkOffsets = getChunkOffsets(buf);

  let cellCount = 0;

  for (const { dcx, dcy } of chunkOffsets) {
    const key = `${camCX + dcx},${camCY + dcy}`;
    const chunk = chunks.get(key);
    if (!chunk) continue;
    const biome = getBiome(chunk.biomeId);

    for (let cy = 0; cy < size; cy++) {
      for (let cx = 0; cx < size; cx++) {
        if (cellCount >= maxCells) break;

        const cell = chunk.cells[cy][cx];
        const def = ASSET_DEFS[cell.assetKey];
        if (!def) continue;

        // Skip base-layer cells when terrain is cached (huge perf win)
        if (skipBaseTerrain && def.layer === 'base' && !cell.itemId) continue;

        const gx = chunk.chunkX * size + cx;
        const gy = chunk.chunkY * size + cy;

        const b = cellCount * cellStride;
        cellView[b]     = gx;
        cellView[b + 1] = gy;
        cellView[b + 2] = getAssetIndex(cell.assetKey);
        cellView[b + 3] = def.layer === 'base' ? 0 : 1;
        cellView[b + 4] = def.height;
        cellView[b + 5] = def.shadow ? 1 : 0;
        cellView[b + 6] = getTileTypeIndex(def.tileType);
        cellView[b + 7] = def.scale;
        cellView[b + 8] = biome.tintHue;
        cellView[b + 9] = cell.itemId ? 1 : 0;

        if (cell.itemId) {
          const itemDef = ASSET_DEFS[cell.itemId];
          cellView[b + 10] = itemDef ? getAssetIndex(cell.itemId) : -1;
          cellView[b + 11] = itemDef ? itemDef.scale : 0;
        } else {
          cellView[b + 10] = -1;
          cellView[b + 11] = 0;
        }

        cellCount++;
      }
      if (cellCount >= maxCells) break;
    }
  }

  // Process cells in WASM (transform, cull, build draw cmds)
  wasmModule.processCells(cellCount);

  // Add player and sort
  const totalCmds = wasmModule.addPlayerAndSort(egoPos.x, egoPos.y, egoDir);

  // Read sorted draw commands from WASM output (reuse pooled objects)
  const usable = Math.min(totalCmds, CMD_POOL_SIZE);
  cmdResultBuf.length = usable;
  for (let i = 0; i < usable; i++) {
    const cmdIdx = sortView[i];
    const b = cmdIdx * cmdStride;
    const assetIdx = Math.round(cmdView[b + 5]);
    const tileTypeIdx = Math.round(cmdView[b + 6]);
    const cmd = cmdPool[i];

    cmd.type = cmdView[b];
    cmd.sx = cmdView[b + 1];
    cmd.sy = cmdView[b + 2];
    cmd.scale = cmdView[b + 3];
    cmd.tint = cmdView[b + 4];
    cmd.assetKey = assetIdx >= 0 && assetIdx < assetKeys.length ? assetKeys[assetIdx] : '';
    cmd.tileType = tileTypeIdx >= 0 && tileTypeIdx < ALL_TILE_TYPES.length ? ALL_TILE_TYPES[tileTypeIdx] : null;
    cmd.sortKey = cmdView[b + 7];
    cmd.flags = cmdView[b + 8];
    cmdResultBuf[i] = cmd;
  }

  return cmdResultBuf;
}

// === Benchmark utility ===

export function wasmBenchmark(): { wasmMs: number; jsMs: number; speedup: string } | null {
  if (!wasmModule) return null;
  const iterations = 100000;

  // WASM benchmark
  const t0 = performance.now();
  wasmModule.benchGridToScreen(iterations, 16.0, 16.0);
  const wasmMs = performance.now() - t0;

  // JS benchmark (same math)
  const tw = RENDER_CONFIG.tileWidth;
  const camX = 16;
  const camY = 16;
  const t1 = performance.now();
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    const gx = 16 + i * 0.001;
    const rx = gx - camX;
    const ry = 16 - camY;
    sum += (rx - ry) * (tw / 2) + 400;
  }
  const jsMs = performance.now() - t1;

  const speedup = jsMs > 0 ? (jsMs / wasmMs).toFixed(1) : 'N/A';
  console.log(`[WASM] Benchmark: WASM=${wasmMs.toFixed(2)}ms JS=${jsMs.toFixed(2)}ms Speedup=${speedup}x (${iterations} iterations, sum=${sum.toFixed(0)})`);
  return { wasmMs, jsMs, speedup };
}
