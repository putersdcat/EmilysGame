/**
 * wasm/assembly/index.ts - WASM rendering math core (AssemblyScript)
 * Handles: grid-to-screen transforms, visibility culling, depth sorting.
 * Returns compact draw command buffer consumed by TS Canvas renderer.
 * Uses raw heap memory to ensure TS↔WASM pointer alignment.
 * TODO: DOC - WASM rendering pipeline, data layout, performance notes
 */

// === Draw command types (must match TS CMD_* constants) ===
const CMD_TILE: f32       = 0.0;
const CMD_EMOJI: f32      = 1.0;
const CMD_SHADOW_EMOJI: f32 = 2.0;
const CMD_ITEM: f32       = 3.0;
const CMD_PLAYER: f32     = 4.0;

// === Buffer layout constants ===
// Input cell: [gx, gy, assetIndex, layer, height, hasShadow, tileTypeIndex, scale, tintHue, hasItem, itemAssetIndex, itemScale]
const CELL_STRIDE: i32 = 12;

// Output cmd: [type, sx, sy, scale, tintHue, assetIndex, tileTypeIndex, sortKey, flags]
const CMD_STRIDE: i32 = 9;

// Max capacities
const MAX_CELLS: i32 = 4096;
const MAX_CMDS: i32 = 6000;

// Byte sizes for heap allocation
const CELL_BUF_BYTES: usize = <usize>(MAX_CELLS * CELL_STRIDE) << 2; // * 4 (f32)
const CMD_BUF_BYTES: usize  = <usize>(MAX_CMDS * CMD_STRIDE)  << 2; // * 4 (f32)
const SORT_KEYS_BYTES: usize = <usize>MAX_CMDS << 2;  // * 4 (f32)
const SORT_IDX_BYTES: usize  = <usize>MAX_CMDS << 2;  // * 4 (i32)

// === Config (set from TS at init) ===
let canvasWidth: f32 = 800.0;
let canvasHeight: f32 = 600.0;
let tileWidth: f32 = 64.0;
let tileHeight: f32 = 32.0;
let visMargin: f32 = 64.0;
let halfTW: f32 = 32.0;
let halfTH: f32 = 16.0;
let canvasHalfW: f32 = 400.0;
let canvasThirdH: f32 = 200.0;

// === Camera ===
let cameraX: f32 = 0.0;
let cameraY: f32 = 0.0;

// === Raw heap-allocated buffers (no managed object headers) ===
// These pointers are the EXACT byte offsets that TS Float32Array/Int32Array views use.
const cellBufPtr: usize = heap.alloc(CELL_BUF_BYTES);
const cmdBufPtr: usize  = heap.alloc(CMD_BUF_BYTES);
const sortKeysPtr: usize = heap.alloc(SORT_KEYS_BYTES);
const sortIdxPtr: usize  = heap.alloc(SORT_IDX_BYTES);

let cmdCount: i32 = 0;

// === Exported: buffer pointers for TS to write/read via Float32Array ===

export function getCellBufferPtr(): usize {
  return cellBufPtr;
}

export function getCmdBufferPtr(): usize {
  return cmdBufPtr;
}

export function getSortIndexPtr(): usize {
  return sortIdxPtr;
}

export function getCellStride(): i32 { return CELL_STRIDE; }
export function getCmdStride(): i32 { return CMD_STRIDE; }
export function getMaxCells(): i32 { return MAX_CELLS; }
export function getMaxCmds(): i32 { return MAX_CMDS; }

// === Config setters ===

export function setConfig(cw: f32, ch: f32, tw: f32, th: f32, margin: f32): void {
  canvasWidth = cw;
  canvasHeight = ch;
  tileWidth = tw;
  tileHeight = th;
  visMargin = margin;
  halfTW = tw / 2.0;
  halfTH = th / 2.0;
  canvasHalfW = cw / 2.0;
  canvasThirdH = ch / 3.0;
}

export function setCamera(cx: f32, cy: f32): void {
  cameraX = cx;
  cameraY = cy;
}

// === Inline helpers ===

// @ts-ignore: decorator
@inline
function gridToScreenX(gx: f32, gy: f32): f32 {
  return (gx - cameraX - gy + cameraY) * halfTW + canvasHalfW;
}

// @ts-ignore: decorator
@inline
function gridToScreenY(gx: f32, gy: f32): f32 {
  return (gx - cameraX + gy - cameraY) * halfTH + canvasThirdH;
}

// @ts-ignore: decorator
@inline
function isVisible(sx: f32, sy: f32): bool {
  return sx > -visMargin && sx < canvasWidth + visMargin
      && sy > -visMargin && sy < canvasHeight + visMargin;
}

// @ts-ignore: decorator
@inline
function pushCmd(
  type: f32, sx: f32, sy: f32, scale: f32, tint: f32,
  assetIdx: f32, tileTypeIdx: f32, sortKey: f32, flags: f32
): void {
  if (cmdCount >= MAX_CMDS) return;
  const byteOff: usize = <usize>(cmdCount * CMD_STRIDE) << 2; // * 4 bytes per f32
  store<f32>(cmdBufPtr + byteOff,      type);
  store<f32>(cmdBufPtr + byteOff + 4,  sx);
  store<f32>(cmdBufPtr + byteOff + 8,  sy);
  store<f32>(cmdBufPtr + byteOff + 12, scale);
  store<f32>(cmdBufPtr + byteOff + 16, tint);
  store<f32>(cmdBufPtr + byteOff + 20, assetIdx);
  store<f32>(cmdBufPtr + byteOff + 24, tileTypeIdx);
  store<f32>(cmdBufPtr + byteOff + 28, sortKey);
  store<f32>(cmdBufPtr + byteOff + 32, flags);

  store<f32>(sortKeysPtr + (<usize>cmdCount << 2), sortKey);
  store<i32>(sortIdxPtr + (<usize>cmdCount << 2), cmdCount);
  cmdCount++;
}

// === Main processing: transform, cull, build draw cmds ===

export function processCells(cellCount: i32): i32 {
  cmdCount = 0;
  const count: i32 = cellCount < MAX_CELLS ? cellCount : MAX_CELLS;

  for (let i: i32 = 0; i < count; i++) {
    const byteOff: usize = <usize>(i * CELL_STRIDE) << 2; // * 4 bytes per f32
    const gx: f32      = load<f32>(cellBufPtr + byteOff);
    const gy: f32      = load<f32>(cellBufPtr + byteOff + 4);
    const layer: f32   = load<f32>(cellBufPtr + byteOff + 12);
    const height: f32  = load<f32>(cellBufPtr + byteOff + 16);
    const shadow: f32  = load<f32>(cellBufPtr + byteOff + 20);
    const tileIdx: f32 = load<f32>(cellBufPtr + byteOff + 24);
    const scale: f32   = load<f32>(cellBufPtr + byteOff + 28);
    const tint: f32    = load<f32>(cellBufPtr + byteOff + 32);
    const hasItem: f32 = load<f32>(cellBufPtr + byteOff + 36);
    const itemScale: f32 = load<f32>(cellBufPtr + byteOff + 44);

    const sx: f32 = gridToScreenX(gx, gy);
    const sy: f32 = gridToScreenY(gx, gy);

    if (!isVisible(sx, sy)) continue;

    const assetIdx: f32 = load<f32>(cellBufPtr + byteOff + 8);
    const itemAssetIdx: f32 = load<f32>(cellBufPtr + byteOff + 40);

    if (layer < 0.5) {
      // Base terrain
      if (tileIdx >= 0.0) {
        pushCmd(CMD_TILE, sx, sy, scale, tint, assetIdx, tileIdx, gy, 0.0);
      } else {
        pushCmd(CMD_EMOJI, sx, sy, scale, tint, assetIdx, -1.0, gy, 0.0);
      }
    } else {
      // Elevated object
      const depthKey: f32 = gy + height * 0.4; // height bias: 0.4 per unit, matches JS path (#184)
      if (tileIdx >= 0.0) {
        pushCmd(CMD_TILE, sx, sy, scale, tint, assetIdx, tileIdx, depthKey, shadow);
      } else {
        const cmdType: f32 = shadow > 0.5 ? CMD_SHADOW_EMOJI : CMD_EMOJI;
        pushCmd(cmdType, sx, sy, scale, tint, assetIdx, -1.0, depthKey, shadow);
      }
    }

    // Item overlay
    if (hasItem > 0.5) {
      pushCmd(CMD_ITEM, sx, sy - 8.0, itemScale * 0.8, 0.0, itemAssetIdx, -1.0, gy + 0.05, 0.0);
    }
  }

  return cmdCount;
}

// === Add player command + sort all commands by depth ===

export function addPlayerAndSort(px: f32, py: f32, playerDir: f32): i32 {
  const sx: f32 = gridToScreenX(px, py);
  const sy: f32 = gridToScreenY(px, py);
  const flipFlag: f32 = playerDir < 0.0 ? 2.0 : 0.0;
  pushCmd(CMD_PLAYER, sx, sy, 1.0, 0.0, -1.0, -1.0, py + 0.3, flipFlag);

  // Insertion sort on sortIdx by sortKeys (good for ~500-2000 items)
  for (let i: i32 = 1; i < cmdCount; i++) {
    const keyOff: usize = <usize>i << 2;
    const key: f32 = load<f32>(sortKeysPtr + keyOff);
    const idx: i32 = load<i32>(sortIdxPtr + keyOff);
    let j: i32 = i - 1;
    while (j >= 0) {
      const jOff: usize = <usize>j << 2;
      const jKey: f32 = load<f32>(sortKeysPtr + jOff);
      if (jKey <= key) break;
      store<f32>(sortKeysPtr + jOff + 4, jKey);
      store<i32>(sortIdxPtr + jOff + 4, load<i32>(sortIdxPtr + jOff));
      j--;
    }
    const insertOff: usize = <usize>(j + 1) << 2;
    store<f32>(sortKeysPtr + insertOff, key);
    store<i32>(sortIdxPtr + insertOff, idx);
  }

  return cmdCount;
}

// === TS reads sorted commands via this index mapping ===

export function getSortedCmdIndex(i: i32): i32 {
  if (i < 0 || i >= cmdCount) return -1;
  return load<i32>(sortIdxPtr + (<usize>i << 2));
}

export function getCmdCount(): i32 {
  return cmdCount;
}

// === Simple benchmark function for testing ===

export function benchGridToScreen(iterations: i32, gx: f32, gy: f32): f32 {
  let sumX: f32 = 0.0;
  for (let i: i32 = 0; i < iterations; i++) {
    sumX += gridToScreenX(gx + <f32>i * 0.001, gy);
  }
  return sumX;
}

// === Debug: verify JS ↔ WASM shared memory alignment ===

/** Write a known value to cell buffer and return it */
export function testCellWrite(): f32 {
  store<f32>(cellBufPtr, 123.456);
  return load<f32>(cellBufPtr);
}

/** Read the first f32 from cell buffer (should match what JS wrote) */
export function testCellRead(): f32 {
  return load<f32>(cellBufPtr);
}

/** Read cell count and first visible cell debug info */
export function debugProcessCell(gx: f32, gy: f32): f32 {
  const sx = gridToScreenX(gx, gy);
  const sy = gridToScreenY(gx, gy);
  // Return packed: sx in high bits, visible flag in low bit
  if (isVisible(sx, sy)) return sx;
  return -999999.0; // Not visible
}
