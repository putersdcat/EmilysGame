/**
 * sim-dt.ts — L0 inject / clamp / time-contract state (PR2).
 *
 * Owned by the play-kernel loop (re-exported from loop.ts). Split from loop.ts
 * so player-motor can report inject-frame integrate metrics without a cycle
 * (loop → frame → motor → loop).
 *
 * MOVE_STEP_MS / MOVE_MAX_CATCHUP_MS numeric values mirror player-motor until PR3
 * moves the motor into the kernel (single owner).
 */

/** Mirror of player-motor MOVE_STEP_MS (must stay in sync until PR3). */
const MOVE_STEP_MS = 1000 / 60;
/** Mirror of player-motor MOVE_MAX_CATCHUP_MS (must stay in sync until PR3). */
const MOVE_MAX_CATCHUP_MS = 100;

let _pendingInjectDtMs: number | null = null;
let _dtClampedCount = 0;
let _lastSimDtRawMs = 0;
let _lastSimDtClampedMs = 0;
let _lastMoveDisplacement = 0;
let _injectFrameActive = false;
let _lastInjectLatch: {
  rawMs: number;
  clampedMs: number;
  displacement: number;
} | null = null;

/**
 * Force the next frame's simulation dtMs (wall clock / FPS unaffected).
 * Consumed once by the rAF play loop. Used by Playwright to prove hitch clamp.
 */
export function injectDtMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  _pendingInjectDtMs = ms;
}

/** Take and clear a pending inject (play loop). Returns null if none. */
export function takeInjectedDtMs(): number | null {
  const v = _pendingInjectDtMs;
  _pendingInjectDtMs = null;
  if (v !== null) _injectFrameActive = true;
  return v;
}

/** Record that this frame's raw sim dt was clamped (display / tests). */
export function noteDtClamped(): void {
  _dtClampedCount++;
}

export function getDtClampedCount(): number {
  return _dtClampedCount;
}

/** Publish raw sim dt for the frame about to integrate (play loop). */
export function noteSimDtRaw(ms: number): void {
  _lastSimDtRawMs = ms;
}

/**
 * Motor reports displacement + clamped integrate dt for an inject frame.
 * Clears inject-active so finalize will no-op.
 */
export function noteInjectIntegrateResult(displacement: number, clampedMs: number): void {
  _lastSimDtClampedMs = clampedMs;
  _lastMoveDisplacement = displacement;
  if (_injectFrameActive) {
    _lastInjectLatch = {
      rawMs: _lastSimDtRawMs,
      clampedMs,
      displacement,
    };
    _injectFrameActive = false;
  }
}

/** Record clamped sim dt even when not on an inject frame (motor path). */
export function noteSimDtClamped(ms: number): void {
  _lastSimDtClampedMs = ms;
}

export function getTimeContractSnapshot(): {
  moveStepMs: number;
  moveMaxCatchupMs: number;
  dtClampedCount: number;
  lastSimDtRawMs: number;
  lastSimDtClampedMs: number;
  lastMoveDisplacement: number;
  lastInject: { rawMs: number; clampedMs: number; displacement: number } | null;
  pendingInject: boolean;
} {
  return {
    moveStepMs: MOVE_STEP_MS,
    moveMaxCatchupMs: MOVE_MAX_CATCHUP_MS,
    dtClampedCount: _dtClampedCount,
    lastSimDtRawMs: _lastSimDtRawMs,
    lastSimDtClampedMs: _lastSimDtClampedMs,
    lastMoveDisplacement: _lastMoveDisplacement,
    lastInject: _lastInjectLatch ? { ..._lastInjectLatch } : null,
    pendingInject: _pendingInjectDtMs !== null,
  };
}

/**
 * If this frame consumed injectDtMs but never integrated movement (idle /
 * modal), still latch raw/clamped with zero displacement so tests can assert.
 */
export function finalizeInjectFrameIfActive(): void {
  if (!_injectFrameActive) return;
  const clamped = Math.min(Math.max(_lastSimDtRawMs, 0), MOVE_MAX_CATCHUP_MS);
  _lastSimDtClampedMs = clamped;
  _lastMoveDisplacement = 0;
  _lastInjectLatch = {
    rawMs: _lastSimDtRawMs,
    clampedMs: clamped,
    displacement: 0,
  };
  _injectFrameActive = false;
}

/** Clear inject/clamp state (new game / load / motor reset). */
export function resetSimDtContract(): void {
  _pendingInjectDtMs = null;
  _injectFrameActive = false;
  _lastInjectLatch = null;
  _dtClampedCount = 0;
  _lastSimDtRawMs = 0;
  _lastSimDtClampedMs = 0;
  _lastMoveDisplacement = 0;
}

/** Cap used by loop when publishing simDtMs to runPlayFrame. */
export function clampSimDtMs(rawMs: number): number {
  return Math.min(Math.max(rawMs, 0), MOVE_MAX_CATCHUP_MS);
}

export { MOVE_STEP_MS as SIM_MOVE_STEP_MS, MOVE_MAX_CATCHUP_MS as SIM_MOVE_MAX_CATCHUP_MS };
