/**
 * loop.ts — rAF play loop inventory (PR2).
 *
 * Owns: wall dt, unclamped FPS window, inject take/note/clamp, wall presentation
 * clocks, runPlayFrame with capped simDtMs, finalize inject latch, onAfterFrame.
 *
 * Inventory (must not drop — design-play-kernel-2026-07-19.md):
 *  1. Cancel-before-start / single rAF id
 *  2. Wall dtMs finite/negative guard → MOVE_STEP_MS
 *  3. FPS window: unclamped frames/ms → state.fps
 *  4. takeInjectedDtMs(); else wall; finite guard
 *  5. noteSimDtRaw; if raw > max then noteDtClamped
 *  6. Publish simDtMs = min(max(raw,0), max) to frame
 *  7. Wall presentation: tickWaterAnimation, setRenderFrameDelta
 *  8. runPlayFrame
 *  9. finalizeInjectFrameIfActive
 * 10. onAfterFrame → render; schedule next rAF
 */

import type { GameState } from '../game-state';
import type { InputManager } from '../input';
import { tickWaterAnimation } from '../../rendering/terrain-cache';
import { setRenderFrameDelta } from '../../rendering/render';
import { runPlayFrame } from './frame';
import type { PlayFrameExtras, PlayFrameHooks, PlayLoopContext } from './types';
import {
  takeInjectedDtMs,
  noteSimDtRaw,
  noteDtClamped,
  finalizeInjectFrameIfActive,
  clampSimDtMs,
  SIM_MOVE_STEP_MS,
  SIM_MOVE_MAX_CATCHUP_MS,
} from './sim-dt';

// Re-export time contract surface (public API via index / loop)
export {
  injectDtMs,
  takeInjectedDtMs,
  noteSimDtRaw,
  noteDtClamped,
  finalizeInjectFrameIfActive,
  getTimeContractSnapshot,
  getDtClampedCount,
  resetSimDtContract,
  noteInjectIntegrateResult,
} from './sim-dt';

let _lastFrameTime = 0;
/** Guard: only one rAF chain may own the loop (HMR / double start protection). */
let _playLoopRaf = 0;
/** Rolling FPS from real rAF intervals (matches what the screen is doing). */
let _fpsWindowFrames = 0;
let _fpsWindowMs = 0;

export type StartPlayLoopOptions = {
  state: GameState;
  input: InputManager;
  hooks: PlayFrameHooks;
  /** After runPlayFrame + finalize — typically render + perf marks. */
  onAfterFrame: () => void;
  extras?: PlayFrameExtras;
};

/**
 * Single rAF tick. Exported for tests / rare direct schedule; prefer startPlayLoop.
 */
export function playLoopTick(
  time: number,
  ctx: StartPlayLoopOptions,
): void {
  // Wall-clock frame delta (presentation + FPS). Guard quirks / first frame.
  let wallDtMs = _lastFrameTime > 0 ? time - _lastFrameTime : SIM_MOVE_STEP_MS;
  if (!Number.isFinite(wallDtMs) || wallDtMs < 0) wallDtMs = SIM_MOVE_STEP_MS;
  _lastFrameTime = time;

  // FPS uses unclamped wall dt (L0: do not clamp the display accumulator).
  // Injected sim dt does NOT feed this window (presentation stays honest).
  _fpsWindowFrames++;
  _fpsWindowMs += wallDtMs;
  if (_fpsWindowMs >= 1000) {
    ctx.state.fps = Math.round((_fpsWindowFrames * 1000) / _fpsWindowMs);
    ctx.state.fpsCounter = _fpsWindowFrames;
    ctx.state.lastFpsTime = performance.now();
    _fpsWindowFrames = 0;
    _fpsWindowMs = 0;
  }

  // Sim dt: optional one-shot inject (tests), else wall.
  const injected = takeInjectedDtMs();
  let simRaw = injected !== null ? injected : wallDtMs;
  if (!Number.isFinite(simRaw) || simRaw < 0) simRaw = SIM_MOVE_STEP_MS;
  noteSimDtRaw(simRaw);
  if (simRaw > SIM_MOVE_MAX_CATCHUP_MS) {
    noteDtClamped();
  }
  // Publish capped sim dt only — motor must not re-clamp long-term (PR3).
  const simDtMs = clampSimDtMs(simRaw);

  // Presentation clocks stay on wall time (not artificial hitch inject).
  tickWaterAnimation(wallDtMs);
  setRenderFrameDelta(wallDtMs);

  runPlayFrame(ctx.state, ctx.input, simDtMs, ctx.hooks, ctx.extras);
  finalizeInjectFrameIfActive();

  ctx.onAfterFrame();
  _playLoopRaf = requestAnimationFrame((t) => playLoopTick(t, ctx));
}

/**
 * Start (or restart) the single play rAF chain. Cancels any prior id first.
 */
export function startPlayLoop(opts: StartPlayLoopOptions): void {
  if (_playLoopRaf) cancelAnimationFrame(_playLoopRaf);
  _lastFrameTime = 0;
  _fpsWindowFrames = 0;
  _fpsWindowMs = 0;
  _playLoopRaf = requestAnimationFrame((t) => playLoopTick(t, opts));
}

/** Cancel the play rAF chain (menu return / teardown). */
export function stopPlayLoop(): void {
  if (_playLoopRaf) {
    cancelAnimationFrame(_playLoopRaf);
    _playLoopRaf = 0;
  }
  _lastFrameTime = 0;
  _fpsWindowFrames = 0;
  _fpsWindowMs = 0;
}

/** @deprecated internal — PlayLoopContext shape for callers that wire hooks later */
export type { PlayLoopContext };
