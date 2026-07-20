/**
 * chunk-lifecycle.ts — Chunk loading + resolved-cell persistence.
 *
 * B5 micro-slice 11.14 (#268): extracted from main.ts. Bundles the 7
 * tightly-coupled functions that manage the player's chunk lifecycle
 * (load on move, collect border constraints from neighbors, apply
 * save-data resolved cells, serialize resolved cells on save).
 *
 * Module-level state moved from main.ts:
 *   - `_pendingResolved` — Map<chunkKey, ResolvedCell[]> for cells
 *     restored from save data, applied after chunk regeneration.
 *     Cleared on `resetGameState` (new game).
 *   - `_chunkQueue` — deferred non-player buffer-ring gens (critical-path PR3)
 *
 * Why this lives in `src/game/` (not `src/engine/`):
 *   - It's a high-level orchestration concern (save/load + chunk gen
 *     + UI feedback), not pure world-layer logic
 *   - Already-extracted pure-helper modules (ChunkGenerator, BorderConstraints)
 *     live in `src/engine/world/`
 *
 * Public API:
 *   - chunkKey(cx, cy) — string key helper
 *   - ensureChunksAround(state) — full-buffer SYNC (debug / rare; not hot path)
 *   - ensureChunksAroundBudgeted(state, opts?) — rAF hot path (player force + maxPerTick)
 *   - ensureChunksAroundYielding(state) — ASYNC UI/boot bulk load (double-rAF + N/M + yield)
 *   - enqueueMissingBufferChunks(state) — enqueue missing ring coords (boundary)
 *   - collectBorderConstraints(chunks, cx, cy) — read edge tags from neighbors
 *   - setPendingResolvedCells(cells) — store cells from save data
 *   - applyResolvedToChunk(key, chunk) — apply pending cells to fresh chunk
 *   - collectResolvedCells(chunks) — extract resolved cells for save
 *   - loadChunksOnBoundaryCross(state) — enqueue on cross (returns true if crossed)
 *   - clearPendingResolved() — for resetGameState (new game); also clears queue
 *   - getChunkQueueDepth() — queue depth for marks / tests
 *   - clearChunkQueue() — explicit queue clear
 *
 * Path-dependent stitch (I9): budgeted order (player → travel → rest) can differ
 * from a full nested dy/dx fill on boundary. Inter-chunk stitch is accepted as
 * path-dependent; only fixed `(cx,cy)+borderConstraints` unit determinism is required.
 *
 * @see issue #17 — Edge contracts / inter-chunk stitching
 * @see issue #6 — Cross-chunk auto-tile transitions
 * @see issue #46 — Traversal continuity
 * @see issue #268 — B5: Decompose src/main.ts
 * @see memories/repo/design-critical-path-recovery-2026-07-19.md §3
 */

import { WORLD_CONFIG } from '../config/game.config';
import { DIRECTION_WORDS } from '../config/entropy.config';
import { ASSET_DEFS } from '../config/assets.config';
import { invalidateChunkTerrain } from '../rendering/terrain-cache';
import { invalidateObjectCache } from '../rendering/render';
import { generateChunkSync, feedEntropy, setChunkGenObserver } from '../engine/gen';
import { type GameState } from './game-state';
import { type ChunkData, type BorderConstraints } from '../types/game.types';
import { type ResolvedCell } from './save';
import { bootMark, percentile, roundMs } from './boot-marks';
import { updateWorldLoading } from './boot-loading';

// ─── Module-level state ───────────────────────────────────────

/**
 * Pending resolved cells keyed by chunkKey, applied after chunk generation.
 * Populated by `setPendingResolvedCells` (called from save-load), drained
 * by `applyResolvedToChunk` (called from ensure paths).
 */
const _pendingResolved = new Map<string, ResolvedCell[]>();

/**
 * Most recent solid gen.chunk ms samples within the current ensure batch.
 * Cleared at the start of each ensure / budgeted / Yielding call so max/p95
 * and syncBurst reflect only that batch.
 */
let _batchChunkMs: number[] = [];

/**
 * Deferred buffer-ring chunk gens (critical-path PR3).
 * Not on GameState — same pattern as `_pendingResolved`.
 * Depth capped at buffer ring size: (2*viewportBuffer+1)².
 */
interface QueuedChunk {
  cx: number;
  cy: number;
  enqueuedAt: number;
}
const _chunkQueue: QueuedChunk[] = [];
const _queuedKeys = new Set<string>();

/** Last boundary-cross travel delta (chunk units) for drain priority. */
let _travelDx = 0;
let _travelDy = 0;

// Wire gen.chunk marks once (critical-path instrumentation harness PR1).
setChunkGenObserver((cx, cy, ms) => {
  _batchChunkMs.push(ms);
  bootMark('gen.chunk', { cx, cy, ms });
});

// ─── Key helper ──────────────────────────────────────────────

/** Build the string key for a chunk at grid coords (cx, cy). */
export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** Current deferred-gen queue depth (tests / __gameDebug). */
export function getChunkQueueDepth(): number {
  return _chunkQueue.length;
}

/** Clear the deferred-gen queue (new game / save apply). */
export function clearChunkQueue(): void {
  _chunkQueue.length = 0;
  _queuedKeys.clear();
  _travelDx = 0;
  _travelDy = 0;
}

function bufferRingCapacity(buf: number): number {
  return (2 * buf + 1) * (2 * buf + 1);
}

function inBufferRing(
  cx: number,
  cy: number,
  pcx: number,
  pcy: number,
  buf: number,
): boolean {
  return Math.abs(cx - pcx) <= buf && Math.abs(cy - pcy) <= buf;
}

/**
 * Priority for drain order:
 *   0 — player chunk (dx=0, dy=0)
 *   1 — travel-direction neighbor
 *   2+ — rest of ring (stable dy then dx scan rank)
 */
function coordPriority(
  cx: number,
  cy: number,
  pcx: number,
  pcy: number,
): number {
  const dx = cx - pcx;
  const dy = cy - pcy;
  if (dx === 0 && dy === 0) return 0;
  const tdx = Math.sign(_travelDx);
  const tdy = Math.sign(_travelDy);
  if ((tdx !== 0 || tdy !== 0) && dx === tdx && dy === tdy) return 1;
  // Stable scan rank matching historical nested dy/dx order.
  const buf = WORLD_CONFIG.viewportBuffer;
  const scanRank = (dy + buf) * (2 * buf + 1) + (dx + buf);
  return 2 + scanRank;
}

function removeFromQueue(cx: number, cy: number): void {
  const key = chunkKey(cx, cy);
  if (!_queuedKeys.has(key)) return;
  _queuedKeys.delete(key);
  const idx = _chunkQueue.findIndex((q) => q.cx === cx && q.cy === cy);
  if (idx >= 0) _chunkQueue.splice(idx, 1);
}

function enqueueOne(cx: number, cy: number, enqueuedAt: number): void {
  const key = chunkKey(cx, cy);
  if (_queuedKeys.has(key)) return;
  _queuedKeys.add(key);
  _chunkQueue.push({ cx, cy, enqueuedAt });
}

/**
 * Drop loaded / outside-ring entries; if still over cap, drop oldest
 * non-player entries (prefer those outside ring — already gone above).
 */
function pruneQueue(
  state: GameState,
  pcx: number,
  pcy: number,
  buf: number,
  maxDepth: number,
): void {
  // Pass 1: remove loaded or outside current buffer ring.
  for (let i = _chunkQueue.length - 1; i >= 0; i--) {
    const q = _chunkQueue[i];
    const key = chunkKey(q.cx, q.cy);
    const outside = !inBufferRing(q.cx, q.cy, pcx, pcy, buf);
    const loaded = state.chunks.has(key);
    const isPlayer = q.cx === pcx && q.cy === pcy;
    if (loaded || (outside && !isPlayer)) {
      _chunkQueue.splice(i, 1);
      _queuedKeys.delete(key);
    }
  }

  // Pass 2: over-cap — drop oldest non-player first.
  while (_chunkQueue.length > maxDepth) {
    let dropIdx = -1;
    let oldest = Infinity;
    for (let i = 0; i < _chunkQueue.length; i++) {
      const q = _chunkQueue[i];
      if (q.cx === pcx && q.cy === pcy) continue;
      if (q.enqueuedAt < oldest) {
        oldest = q.enqueuedAt;
        dropIdx = i;
      }
    }
    if (dropIdx < 0) break; // only player left
    const dropped = _chunkQueue.splice(dropIdx, 1)[0];
    _queuedKeys.delete(chunkKey(dropped.cx, dropped.cy));
  }
}

function emitQueueMarks(): void {
  const depth = _chunkQueue.length;
  bootMark('chunk.queue.depth', { depth });
  if (depth === 0) {
    bootMark('chunk.queue.lagMs', { lagMs: 0 });
    return;
  }
  let oldest = Infinity;
  for (const q of _chunkQueue) {
    if (q.enqueuedAt < oldest) oldest = q.enqueuedAt;
  }
  bootMark('chunk.queue.lagMs', {
    lagMs: roundMs(performance.now() - oldest),
  });
}

/**
 * Enqueue all missing viewport-buffer coords not already loaded/queued.
 * Cap depth at buffer ring size. Call on boundary cross (before drain).
 */
export function enqueueMissingBufferChunks(state: GameState): void {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  const buf = WORLD_CONFIG.viewportBuffer;
  const maxDepth = bufferRingCapacity(buf);
  const now = performance.now();

  pruneQueue(state, pcx, pcy, buf, maxDepth);

  // Stable dy/dx scan; priority applied at drain time.
  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      const cx = pcx + dx;
      const cy = pcy + dy;
      const key = chunkKey(cx, cy);
      if (state.chunks.has(key) || _queuedKeys.has(key)) continue;
      if (_chunkQueue.length >= maxDepth) break;
      enqueueOne(cx, cy, now);
    }
    if (_chunkQueue.length >= maxDepth) break;
  }

  emitQueueMarks();
}

/**
 * Double-rAF (with setTimeout fallback) so the browser can paint the spinner
 * and process input before / between solid chunk gens.
 */
function doubleRaf(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Stronger main-thread yield for bulk gen.
 * Prefer `scheduler.yield()` when available; else double-rAF / setTimeout(0).
 * (Critical-path PR2 — inter-chunk yield, not mid-mutation split.)
 */
function yieldToMain(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sch && typeof sch.yield === 'function') {
    return sch.yield();
  }
  return doubleRaf();
}

/**
 * Generate a single missing chunk at (cx, cy) if needed.
 * Returns true if a new chunk was generated.
 * Unbounded gen forbidden — callers must only request buffer-ring coords.
 */
function ensureOneChunk(state: GameState, cx: number, cy: number): boolean {
  const key = chunkKey(cx, cy);
  if (state.chunks.has(key)) return false;

  // Collect border constraints from already-generated neighbors (#17)
  const bc = collectBorderConstraints(state.chunks, cx, cy);
  const chunk = generateChunkSync(cx, cy, bc);
  state.chunks.set(key, chunk);
  // Re-apply any resolved cells from save data
  applyResolvedToChunk(key, chunk);
  // Invalidate adjacent chunk terrain caches for cross-chunk auto-tile transitions (#6)
  invalidateChunkTerrain(chunkKey(cx - 1, cy));
  invalidateChunkTerrain(chunkKey(cx + 1, cy));
  invalidateChunkTerrain(chunkKey(cx, cy - 1));
  invalidateChunkTerrain(chunkKey(cx, cy + 1));
  return true;
}

// ─── Chunk loading ───────────────────────────────────────────

export interface BudgetedEnsureOpts {
  /**
   * Max non-player deferred gens this call (after player-chunk hard force).
   * Default **1** (critical-path PR3 contract).
   */
  maxPerTick?: number;
}

/**
 * Budgeted buffer-ring ensure for the rAF hot path (critical-path PR3).
 *
 * Contract:
 *   1. Player chunk hard force if missing (always this tick, before budget)
 *   2. Then drain ≤ maxPerTick (default 1) from the module queue
 *   3. Priority: player → travel neighbor → rest of ring
 *   4. Queue depth ≤ buffer ring size; no gen outside ring
 *   5. Marks: chunk.boundary.syncBurst, chunk.queue.depth, chunk.queue.lagMs
 *
 * Unloaded cells remain walkable (walkability-query); player force prevents
 * long voids under the ego.
 */
export function ensureChunksAroundBudgeted(
  state: GameState,
  opts?: BudgetedEnsureOpts,
): void {
  const maxPerTick = opts?.maxPerTick ?? 1;
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  const buf = WORLD_CONFIG.viewportBuffer;
  const maxDepth = bufferRingCapacity(buf);

  pruneQueue(state, pcx, pcy, buf, maxDepth);

  _batchChunkMs = [];
  const t0 = performance.now();
  let count = 0;

  // (1) Hard force: player chunk always present this tick if missing.
  if (ensureOneChunk(state, pcx, pcy)) {
    count++;
  }
  removeFromQueue(pcx, pcy);

  // (2)+(3) Drain deferred gens under budget (priority order).
  let drained = 0;
  while (drained < maxPerTick && _chunkQueue.length > 0) {
    // Pick highest-priority remaining entry still in buffer and not loaded.
    let bestIdx = -1;
    let bestPrio = Infinity;
    for (let i = 0; i < _chunkQueue.length; i++) {
      const q = _chunkQueue[i];
      if (!inBufferRing(q.cx, q.cy, pcx, pcy, buf)) continue;
      if (state.chunks.has(chunkKey(q.cx, q.cy))) continue;
      const p = coordPriority(q.cx, q.cy, pcx, pcy);
      if (p < bestPrio) {
        bestPrio = p;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      // Nothing generatable left — drop stale entries.
      pruneQueue(state, pcx, pcy, buf, maxDepth);
      break;
    }
    const next = _chunkQueue[bestIdx];
    removeFromQueue(next.cx, next.cy);
    if (ensureOneChunk(state, next.cx, next.cy)) {
      count++;
      drained++;
    }
  }

  if (count > 0) {
    const totalMs = roundMs(performance.now() - t0);
    bootMark('chunk.boundary.syncBurst', { count, totalMs });
    emitQueueMarks();
  } else if (_chunkQueue.length > 0) {
    // Still queued but nothing generated (e.g. all already loaded) — refresh depth.
    emitQueueMarks();
  }
}

/**
 * Load chunks in the viewport buffer around the player. For each
 * empty chunk in range, generate a new one, apply any pending
 * resolved cells from save data, and invalidate adjacent terrain
 * caches for cross-chunk auto-tile transitions.
 *
 * **Full-buffer SYNC** — not the rAF hot path. Hot path uses
 * `ensureChunksAroundBudgeted`. Kept for debug / complete fill.
 * Emits `chunk.boundary.syncBurst` when any chunk was generated.
 */
export function ensureChunksAround(state: GameState): void {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  const buf = WORLD_CONFIG.viewportBuffer;

  _batchChunkMs = [];
  const t0 = performance.now();
  let count = 0;

  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      if (ensureOneChunk(state, pcx + dx, pcy + dy)) count++;
    }
  }

  if (count > 0) {
    const totalMs = roundMs(performance.now() - t0);
    bootMark('chunk.boundary.syncBurst', { count, totalMs });
  }
}

/**
 * Boot / session-orchestration bulk load with yields between chunks.
 *
 * Use ONLY from createInitialState / applySaveData / resetGameState /
 * menu spinner / slot-load error recovery paths. Never call from rAF
 * gameLoop / handleMovement / boundary crosses — those use
 * `ensureChunksAroundBudgeted` (PR3).
 *
 * Hang-fix contract (critical-path PR2):
 *   1. Double-rAF **before** first `ensureOneChunk` so spinner paints
 *   2. N/M status via `updateWorldLoading` + `boot.chunkProgress` marks
 *   3. Stronger inter-chunk yield (`scheduler.yield` / double-rAF)
 *   4. Residual per-chunk solid cost is expected until phase cheapening
 */
export async function ensureChunksAroundYielding(
  state: GameState,
): Promise<{ count: number; ms: number }> {
  const t0 = performance.now();
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  const buf = WORLD_CONFIG.viewportBuffer;
  let count = 0;
  _batchChunkMs = [];

  // Collect missing coords first so N/M progress has a stable M.
  const missing: Array<{ cx: number; cy: number }> = [];
  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      const cx = pcx + dx;
      const cy = pcy + dy;
      if (!state.chunks.has(chunkKey(cx, cy))) {
        missing.push({ cx, cy });
      }
    }
  }
  const total = missing.length;

  // Paint spinner before first solid chunk gen (double-rAF).
  await doubleRaf();

  if (total > 0) {
    updateWorldLoading(`Loading world… 0/${total}`);
  }

  for (const { cx, cy } of missing) {
    if (ensureOneChunk(state, cx, cy)) {
      count++;
      updateWorldLoading(`Loading world… ${count}/${total}`);
      bootMark('boot.chunkProgress', { n: count, m: total, cx, cy });
      // Yield after each generated chunk so the main thread is not solid
      // multi-chunk (browser can paint + process input between gens).
      await yieldToMain();
    }
  }

  const ms = roundMs(performance.now() - t0);
  const maxChunkMs = _batchChunkMs.length
    ? roundMs(Math.max(..._batchChunkMs))
    : 0;
  const p95ChunkMs = roundMs(percentile(_batchChunkMs, 0.95));
  bootMark('boot.ensureChunks', { count, ms, maxChunkMs, p95ChunkMs });
  return { count, ms };
}

/**
 * Read edge tags from adjacent chunks' borderEdges for inter-chunk
 * stitching (#17). Returns `undefined` if no neighbor has borderEdges,
 * so the generator can fall back to its default edge logic.
 */
export function collectBorderConstraints(
  chunks: Map<string, ChunkData>,
  cx: number,
  cy: number,
): BorderConstraints | undefined {
  const northChunk = chunks.get(chunkKey(cx, cy - 1));
  const southChunk = chunks.get(chunkKey(cx, cy + 1));
  const eastChunk = chunks.get(chunkKey(cx + 1, cy));
  const westChunk = chunks.get(chunkKey(cx - 1, cy));

  const hasAny = northChunk?.borderEdges || southChunk?.borderEdges ||
                 eastChunk?.borderEdges || westChunk?.borderEdges;
  if (!hasAny) return undefined;

  return {
    n: northChunk?.borderEdges?.s,  // south border of chunk above
    s: southChunk?.borderEdges?.n,  // north border of chunk below
    e: eastChunk?.borderEdges?.w,   // west border of chunk to the east
    w: westChunk?.borderEdges?.e,   // east border of chunk to the west
    // Traversal continuity from neighbors (#46)
    nTraversal: northChunk?.borderEdges?.sTraversal,
    sTraversal: southChunk?.borderEdges?.nTraversal,
    eTraversal: eastChunk?.borderEdges?.wTraversal,
    wTraversal: westChunk?.borderEdges?.eTraversal,
  };
}

/**
 * Detect chunk-boundary cross: feed entropy, update lastChunk, enqueue
 * missing buffer-ring coords. Does **not** generate the full ring —
 * drain happens every frame via `ensureChunksAroundBudgeted` from
 * `maybeLoadChunks` (critical-path PR3).
 *
 * Returns `true` if a cross happened (so caller can chain eviction + auto-save).
 */
export function loadChunksOnBoundaryCross(state: GameState): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  if (pcx === state.lastChunkX && pcy === state.lastChunkY) return false;

  // Determine crossing direction and feed entropy (#4)
  const dx = pcx - state.lastChunkX;
  const dy = pcy - state.lastChunkY;
  _travelDx = dx;
  _travelDy = dy;
  const dir = Math.abs(dx) >= Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
  const table = DIRECTION_WORDS[dir];
  if (table) {
    const verb = table.verbs[Math.floor(Math.random() * table.verbs.length)];
    const noun = table.nouns[Math.floor(Math.random() * table.nouns.length)];
    feedEntropy(`move:${verb} ${noun}`);
  }

  state.lastChunkX = pcx;
  state.lastChunkY = pcy;

  // Enqueue missing buffer ring; player hard-force + budgeted drain run
  // from maybeLoadChunks every frame (including this one).
  enqueueMissingBufferChunks(state);
  return true;
}

// ─── Resolved cells persistence ──────────────────────────────

/**
 * Store resolved cells from save data for deferred application after
 * chunk generation. The map is keyed by chunkKey so `applyResolvedToChunk`
 * can look up only the cells that belong to a specific chunk when it
 * finishes regenerating.
 */
export function setPendingResolvedCells(cells: ResolvedCell[]): void {
  _pendingResolved.clear();
  for (const rc of cells) {
    let arr = _pendingResolved.get(rc.chunkKey);
    if (!arr) {
      arr = [];
      _pendingResolved.set(rc.chunkKey, arr);
    }
    arr.push(rc);
  }
}

/**
 * Apply any pending resolved cells (from save data) to a freshly
 * generated chunk. No-op if the chunk has no pending cells. After
 * mutation, invalidates the object cache for that chunk so the
 * renderer rebuilds sprites.
 */
export function applyResolvedToChunk(key: string, chunk: ChunkData): void {
  const cells = _pendingResolved.get(key);
  if (!cells) return;
  for (const rc of cells) {
    if (rc.ly >= 0 && rc.ly < chunk.cells.length &&
        rc.lx >= 0 && rc.lx < chunk.cells[0].length) {
      const def = ASSET_DEFS[rc.newAssetKey];
      chunk.cells[rc.ly][rc.lx] = {
        assetKey: rc.newAssetKey,
        walkable: def?.walkable ?? true,
        interactable: false,
        resolved: true,
      };
    }
  }
  invalidateObjectCache(key);
}

/**
 * Scan all loaded chunks and collect cells with `resolved=true` for
 * inclusion in save data. These are the cells the player has
 * permanently mutated (chests opened, doors unlocked, quiz gates
 * passed) and need to survive save/load across chunk regeneration.
 */
export function collectResolvedCells(chunks: Map<string, ChunkData>): ResolvedCell[] {
  const result: ResolvedCell[] = [];
  for (const [key, chunk] of chunks) {
    for (let ly = 0; ly < chunk.cells.length; ly++) {
      for (let lx = 0; lx < chunk.cells[ly].length; lx++) {
        const cell = chunk.cells[ly][lx];
        if (cell.resolved) {
          result.push({ chunkKey: key, lx, ly, newAssetKey: cell.assetKey });
        }
      }
    }
  }
  return result;
}

/**
 * Clear all pending resolved cells and the deferred chunk queue.
 * Called on `resetGameState` (new game) — a fresh game should not
 * inherit cells mutated by the previous playthrough or stale queue.
 */
export function clearPendingResolved(): void {
  _pendingResolved.clear();
  clearChunkQueue();
}
