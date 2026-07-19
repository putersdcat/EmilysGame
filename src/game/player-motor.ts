/**
 * player-motor.ts — Owns player locomotion for Emily's Game.
 *
 * Design (flat-sim owns walkability; this owns *how* the avatar moves):
 *   1. Input vector → sub-stepped integration at ~60Hz (no hitch teleports).
 *   2. Axis-slide collision against `isFootprintWalkable`.
 *   3. Escape recovery when the footprint is already illegal (embedded in a
 *      wall/gate after gen drift, load, or a one-frame tunnel) — never leave
 *      the player permanently immovable while keys are held.
 *   4. Prolonged full-block while input is held → brief escape + nudge so a
 *      nano/full-tile snag cannot softlock exploration.
 *
 * Presentation (sprites, camera) stays in main/handleMovement callers.
 */

import type { GameState } from './game-state';
import { isFootprintWalkable } from '../engine/mechanics';
import { SPAWN_ESCAPE_RISE_PX } from '../engine/mechanics';

/** Nominal sim step — `player.speed` is grid-units per this interval. */
export const MOVE_STEP_MS = 1000 / 60;
/** Max wall-clock catch-up per frame (tab refocus / hitch). */
export const MOVE_MAX_CATCHUP_MS = 100;
/**
 * If the player holds a move key and gains zero displacement for this long,
 * enable temporary collision bypass and try to step free. Stops "glued to a
 * fence post" softlocks without making walls walk-through in normal play.
 */
const STUCK_ESCAPE_MS = 450;
/** How long escape bypass lasts after auto-unstick (ms of movement time). */
const STUCK_ESCAPE_BURST_MS = 200;

let _blockedWhileMovingMs = 0;
let _escapeBurstMs = 0;

/** Reset motor timers (new game / load). */
export function resetPlayerMotor(): void {
  _blockedWhileMovingMs = 0;
  _escapeBurstMs = 0;
}

export interface MoveStepResult {
  moved: boolean;
  attemptX: number;
  attemptY: number;
}

/**
 * Integrate one small movement step with axis-independent slide.
 */
export function integrateMoveStep(
  state: GameState,
  mv: { dx: number; dy: number },
  stepScale: number,
  speedMult: number,
  forceEscape: boolean,
): MoveStepResult {
  const stepSpeed = state.player.speed * speedMult * stepScale;
  const dx = mv.dx * stepSpeed;
  const dy = mv.dy * stepSpeed;
  const newX = state.player.x + dx;
  const newY = state.player.y + dy;
  const escape = forceEscape || !!state.player.spawnEscape || _escapeBurstMs > 0;

  let movedX = false;
  let movedY = false;

  if (escape) {
    state.player.x = newX;
    state.player.y = newY;
    movedX = true;
    movedY = true;
    if (isFootprintWalkable(state.player.x, state.player.y, state.chunks, state.activeConditions)) {
      state.player.spawnEscape = false;
      // Keep burst only while still illegal; clear once free
      if (_escapeBurstMs > 0 && !forceEscape) {
        // leave burst timer to decay in tickStuckRecovery
      }
    }
  } else if (isFootprintWalkable(newX, newY, state.chunks, state.activeConditions)) {
    state.player.x = newX;
    state.player.y = newY;
    movedX = true;
    movedY = true;
  } else {
    if (dx !== 0 && isFootprintWalkable(newX, state.player.y, state.chunks, state.activeConditions)) {
      state.player.x = newX;
      movedX = true;
    }
    if (dy !== 0 && isFootprintWalkable(state.player.x, newY, state.chunks, state.activeConditions)) {
      state.player.y = newY;
      movedY = true;
    }
  }

  return { moved: movedX || movedY, attemptX: newX, attemptY: newY };
}

/**
 * Before integrating: if already inside solid geometry, turn on escape so
 * the player can walk out (same contract as spawnEscape on load).
 */
export function ensureNotEmbedded(state: GameState): void {
  if (state.player.spawnEscape) return;
  if (!isFootprintWalkable(state.player.x, state.player.y, state.chunks, state.activeConditions)) {
    state.player.spawnEscape = true;
    state.player.sinkDepth = SPAWN_ESCAPE_RISE_PX;
  }
}

/**
 * Track blocked-while-moving; after STUCK_ESCAPE_MS grant a short noclip burst.
 * Call once per frame after integration with the frame's move outcome.
 */
export function tickStuckRecovery(
  wantsMove: boolean,
  anyMoved: boolean,
  frameMs: number,
): { grantedEscape: boolean } {
  if (_escapeBurstMs > 0) {
    _escapeBurstMs = Math.max(0, _escapeBurstMs - frameMs);
  }

  if (!wantsMove) {
    _blockedWhileMovingMs = 0;
    return { grantedEscape: false };
  }

  if (anyMoved) {
    _blockedWhileMovingMs = 0;
    return { grantedEscape: false };
  }

  _blockedWhileMovingMs += frameMs;
  if (_blockedWhileMovingMs >= STUCK_ESCAPE_MS) {
    _blockedWhileMovingMs = 0;
    _escapeBurstMs = STUCK_ESCAPE_BURST_MS;
    return { grantedEscape: true };
  }
  return { grantedEscape: false };
}

export function isEscapeBurstActive(): boolean {
  return _escapeBurstMs > 0;
}

/**
 * Sub-step integrate for one render frame. Returns aggregate move result.
 */
export function integrateMovementFrame(
  state: GameState,
  mv: { dx: number; dy: number },
  frameMs: number,
  speedMult: number,
): { anyMoved: boolean; lastAttemptX: number; lastAttemptY: number } {
  ensureNotEmbedded(state);

  let remaining = Math.min(Math.max(frameMs, 0), MOVE_MAX_CATCHUP_MS);
  let anyMoved = false;
  let lastAttemptX = state.player.x;
  let lastAttemptY = state.player.y;
  const forceEscape = isEscapeBurstActive();

  while (remaining > 1e-6) {
    const stepMs = Math.min(remaining, MOVE_STEP_MS);
    const stepScale = stepMs / MOVE_STEP_MS;
    const result = integrateMoveStep(state, mv, stepScale, speedMult, forceEscape);
    if (result.moved) anyMoved = true;
    lastAttemptX = result.attemptX;
    lastAttemptY = result.attemptY;
    remaining -= stepMs;
  }

  const recovery = tickStuckRecovery(true, anyMoved, frameMs);
  // If we just granted escape and still didn't move, force one free step this frame
  if (recovery.grantedEscape && !anyMoved) {
    const result = integrateMoveStep(state, mv, 1, speedMult, true);
    if (result.moved) anyMoved = true;
    lastAttemptX = result.attemptX;
    lastAttemptY = result.attemptY;
    state.player.spawnEscape = true;
    state.player.sinkDepth = SPAWN_ESCAPE_RISE_PX;
  }

  return { anyMoved, lastAttemptX, lastAttemptY };
}
