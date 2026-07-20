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
 *
 * Why this lives in `src/game/` (not `src/engine/`):
 *   - It's a high-level orchestration concern (save/load + chunk gen
 *     + UI feedback), not pure world-layer logic
 *   - Already-extracted pure-helper modules (ChunkGenerator, BorderConstraints)
 *     live in `src/engine/world/`
 *
 * Public API:
 *   - chunkKey(cx, cy) — string key helper
 *   - ensureChunksAround(state) — SYNC load for rAF / boundary crosses (must stay sync)
 *   - ensureChunksAroundYielding(state) — ASYNC boot-only load (yield after each gen)
 *   - collectBorderConstraints(chunks, cx, cy) — read edge tags from neighbors
 *   - setPendingResolvedCells(cells) — store cells from save data
 *   - applyResolvedToChunk(key, chunk) — apply pending cells to fresh chunk
 *   - collectResolvedCells(chunks) — extract resolved cells for save
 *   - loadChunksOnBoundaryCross(state) — ensureChunksAround + entropy feed on boundary cross (returns true if crossed)
 *   - clearPendingResolved() — for resetGameState (new game)
 *
 * @see issue #17 — Edge contracts / inter-chunk stitching
 * @see issue #6 — Cross-chunk auto-tile transitions
 * @see issue #46 — Traversal continuity
 * @see issue #268 — B5: Decompose src/main.ts
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

// ─── Module-level state ───────────────────────────────────────

/**
 * Pending resolved cells keyed by chunkKey, applied after chunk generation.
 * Populated by `setPendingResolvedCells` (called from save-load), drained
 * by `applyResolvedToChunk` (called from `ensureChunksAround`).
 */
const _pendingResolved = new Map<string, ResolvedCell[]>();

/**
 * Most recent solid gen.chunk ms samples within the current ensure batch.
 * Cleared at the start of each ensureChunksAround / Yielding call so max/p95
 * and syncBurst reflect only that batch.
 */
let _batchChunkMs: number[] = [];

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

/** Yield to the browser event loop so the tab stays responsive during bulk gen. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Generate a single missing chunk at (cx, cy) if needed.
 * Returns true if a new chunk was generated.
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

/**
 * Load chunks in the viewport buffer around the player. For each
 * empty chunk in range, generate a new one, apply any pending
 * resolved cells from save data, and invalidate adjacent terrain
 * caches for cross-chunk auto-tile transitions.
 *
 * **SYNC — hot path.** Called from `loadChunksOnBoundaryCross` inside
 * the rAF game loop. Must never become async / awaited in gameLoop.
 *
 * Instrumentation only: emits `chunk.boundary.syncBurst` when any chunk
 * was generated in this call (count + total solid ms). No behavior change.
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
 * menu spinner paths. After each `generateChunkSync`, yields via
 * setTimeout(0) so the browser can paint and process input (avoids
 * "Page Unresponsive" on cold load and Load/New Game).
 *
 * **Forbidden:** calling this from gameLoop / handleMovement / boundary
 * crosses — those must keep using sync `ensureChunksAround`.
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

  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      if (ensureOneChunk(state, pcx + dx, pcy + dy)) {
        count++;
        // Yield after each generated chunk so the main thread is not solid.
        await yieldToMain();
      }
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
 * Call `ensureChunksAround` only when the player crosses a chunk
 * boundary. On boundary cross, feeds entropy with the direction of
 * movement (#4) for downstream LLM-driven content variation. Returns
 * `true` if a cross happened (so caller can chain eviction + auto-save).
 */
export function loadChunksOnBoundaryCross(state: GameState): boolean {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  if (pcx === state.lastChunkX && pcy === state.lastChunkY) return false;

  // Determine crossing direction and feed entropy (#4)
  const dx = pcx - state.lastChunkX;
  const dy = pcy - state.lastChunkY;
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
  ensureChunksAround(state);
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
 * Clear all pending resolved cells. Called on `resetGameState` (new
 * game) — a fresh game should not inherit cells mutated by the
 * previous playthrough.
 */
export function clearPendingResolved(): void {
  _pendingResolved.clear();
}