/**
 * boot-marks.ts — Lightweight boot-budget instrumentation (playable-session P0).
 *
 * Records named marks with performance.now() timestamps for pre-menu and
 * post-menu phases. Logs to console and is readable via
 * `window.__gameDebug.bootMarks` (wired in debug-api / startup-hud).
 *
 * Marks (design ladder M0):
 *   boot.llm, boot.assets, boot.stateInit, boot.ensureChunks,
 *   boot.menuInteractive, boot.menuToFirstFrame, boot.terrainBake.batch,
 *   boot.firstMovable
 */

export interface BootMark {
  name: string;
  /** Absolute performance.now() when the mark was recorded. */
  t: number;
  detail?: Record<string, unknown>;
}

const _marks: BootMark[] = [];
const _bootOrigin = performance.now();

let _menuResolveAt: number | null = null;
let _menuInteractiveMarked = false;
let _firstFrameMarked = false;
let _firstMovableMarked = false;

let _terrainBakeCount = 0;
let _terrainBakeMs = 0;
let _terrainBakeMarked = false;

/** Record a boot mark and log it. */
export function bootMark(name: string, detail?: Record<string, unknown>): void {
  const t = performance.now();
  const m: BootMark = { name, t, detail };
  _marks.push(m);
  const rel = (t - _bootOrigin).toFixed(1);
  const extra = detail ? ` ${JSON.stringify(detail)}` : '';
  console.log(`[boot] ${name} +${rel}ms${extra}`);
}

/** Record a mark that measures elapsed ms from `startMs`. */
export function bootMarkDuration(
  name: string,
  startMs: number,
  detail?: Record<string, unknown>,
): void {
  const ms = Math.round((performance.now() - startMs) * 10) / 10;
  bootMark(name, { ...detail, ms });
}

/** Snapshot of all marks (for __gameDebug). Returns a copy — not the live array. */
export function getBootMarks(): readonly BootMark[] {
  return _marks.slice();
}

/** Wall time since first import of this module (approx page script start). */
export function getBootElapsedMs(): number {
  return Math.round((performance.now() - _bootOrigin) * 10) / 10;
}

/** Call when main menu is shown and ready for input. */
export function markMenuInteractive(): void {
  if (_menuInteractiveMarked) return;
  _menuInteractiveMarked = true;
  bootMark('boot.menuInteractive', { elapsedMs: getBootElapsedMs() });
}

/**
 * Call when Continue / New Game / Load resolves and session play is about
 * to start (post-menu phase begins).
 */
export function markMenuResolved(): void {
  _menuResolveAt = performance.now();
}

/** Call once after the first completed renderFrame in the game loop. */
export function markFirstFrameIfNeeded(): void {
  if (_firstFrameMarked) return;
  _firstFrameMarked = true;
  const fromMenu =
    _menuResolveAt != null
      ? Math.round((performance.now() - _menuResolveAt) * 10) / 10
      : undefined;
  bootMark('boot.menuToFirstFrame', {
    msFromMenu: fromMenu,
    elapsedMs: getBootElapsedMs(),
  });
}

/** Call once when the player first accepts movement input. */
export function markFirstMovableIfNeeded(): void {
  if (_firstMovableMarked) return;
  _firstMovableMarked = true;
  bootMark('boot.firstMovable', { elapsedMs: getBootElapsedMs() });
}

/**
 * Accumulate first-batch terrain bake cost. Emits boot.terrainBake.batch
 * once after a short idle (or when count hits a threshold).
 */
export function noteTerrainBake(ms: number): void {
  if (_terrainBakeMarked) return;
  _terrainBakeCount++;
  _terrainBakeMs += ms;
  // Emit after first 8 WU bakes or 50ms accumulated — enough signal for thrash.
  if (_terrainBakeCount >= 8 || _terrainBakeMs >= 50) {
    _terrainBakeMarked = true;
    bootMark('boot.terrainBake.batch', {
      count: _terrainBakeCount,
      ms: Math.round(_terrainBakeMs * 10) / 10,
    });
  }
}
