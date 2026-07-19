/**
 * player-motor.ts — Owns player locomotion for Emily's Game (Layer 3).
 *
 * Design (flat-sim owns walkability; this owns *how* the avatar moves):
 *   1. Input vector → sub-stepped integration at ~60Hz (no hitch teleports).
 *   2. Axis-slide collision against `isFootprintWalkable` (cell SSOT).
 *   3. Constrained embed recovery: legal teleports only (R ladder → BFS → safe
 *      spawn). Never multi-frame noclip / free position writes.
 *   4. Prolonged full-block while input held → legal nudges only (no burst).
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L3 / PR4)
 * Presentation (sprites, camera) stays in main/handleMovement callers.
 */

import type { GameState } from './game-state';
import type { ChunkData } from '../types/game.types';
import { isFootprintWalkable } from '../engine/walkability-query';
import { SPAWN_ESCAPE_RISE_PX } from '../engine/mechanics';
import { PLAYER_CONFIG, WORLD_CONFIG } from '../config/game.config';
import { addToast } from '../ui/ui';

/** Nominal sim step — `player.speed` is grid-units per this interval. */
export const MOVE_STEP_MS = 1000 / 60;
/** Max wall-clock catch-up per frame (tab refocus / hitch). */
export const MOVE_MAX_CATCHUP_MS = 100;

/** Hold-move with zero displacement before stuck recovery.
 *  450ms felt like "keys stopped working" against dense fences; 180ms
 *  starts legal slide/nudge while still avoiding micro-jitter on light taps. */
export const STUCK_MS = 180;
/** Grid units per nudge attempt. */
export const NUDGE_EPS = 0.08;
/** Max legal nudge trials per stuck grant. */
export const NUDGE_MAX_ATTEMPTS = 8;
/** Chebyshev radii tried in order for one embed event. */
export const EMBED_R_LADDER: readonly number[] = [2, 4, 8];
/** Cap BFS cell visits during embed escalate (hitch safety). */
export const EMBED_BFS_VISIT_CAP = 4096;

// ─── L0 time contract (inject + clamp instrumentation) ────────
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
 * Consumed once by the rAF gameLoop. Used by Playwright to prove hitch clamp.
 */
export function injectDtMs(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  _pendingInjectDtMs = ms;
}

/** Take and clear a pending inject (gameLoop). Returns null if none. */
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

/** Publish raw sim dt for the frame about to integrate (gameLoop). */
export function noteSimDtRaw(ms: number): void {
  _lastSimDtRawMs = ms;
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

let _blockedWhileMovingMs = 0;
/** True while an embed event is active (ladder already attempted this event). */
let _embedEventActive = false;
/** True after step-4 ladder exhaustion for current embed event (no re-BFS spam). */
let _embedLadderExhausted = false;
let _embedToastShown = false;
/** performance.now() of last embed ladder re-try while exhausted. */
let _lastEmbedRetryMs = 0;

/** Reset motor timers + L0 inject/clamp state (new game / load). */
export function resetPlayerMotor(): void {
  _blockedWhileMovingMs = 0;
  _embedEventActive = false;
  _embedLadderExhausted = false;
  _embedToastShown = false;
  _lastEmbedRetryMs = 0;
  _pendingInjectDtMs = null;
  _injectFrameActive = false;
  _lastInjectLatch = null;
  _dtClampedCount = 0;
  _lastSimDtRawMs = 0;
  _lastSimDtClampedMs = 0;
  _lastMoveDisplacement = 0;
}

export interface MoveStepResult {
  moved: boolean;
  attemptX: number;
  attemptY: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Ring sampler (cell centers only) ─────────────────────────

/**
 * Chebyshev ring offsets at radius r, starting at N and going clockwise
 * (N → NE → E → SE → S → SW → W → NW perimeter).
 */
export function chebyshevRingOffsets(r: number): Array<[number, number]> {
  if (r === 0) return [[0, 0]];
  const out: Array<[number, number]> = [];
  // Start at N (0, -r), clockwise around the square perimeter
  for (let x = 0; x < r; x++) out.push([x, -r]);
  for (let y = -r; y < r; y++) out.push([r, y]);
  for (let x = r; x > -r; x--) out.push([x, r]);
  for (let y = r; y > -r; y--) out.push([-r, y]);
  for (let x = -r; x < 0; x++) out.push([x, -r]);
  return out;
}

/**
 * Find nearest legal footprint center within Chebyshev radius R of (px, py).
 * Samples **cell centers only**: (floor(px)+ox+0.5, floor(py)+oy+0.5).
 * Ring order r = 0..R; within ring N…NW clockwise.
 */
export function findNearestLegalFootprintCenter(
  px: number,
  py: number,
  R: number,
  chunks: Map<string, ChunkData>,
): Vec2 | null {
  const baseX = Math.floor(px);
  const baseY = Math.floor(py);
  for (let r = 0; r <= R; r++) {
    for (const [ox, oy] of chebyshevRingOffsets(r)) {
      const cx = baseX + ox + 0.5;
      const cy = baseY + oy + 0.5;
      if (isFootprintWalkable(cx, cy, chunks)) {
        return { x: cx, y: cy };
      }
    }
  }
  return null;
}

/**
 * Loaded-chunk BFS from floor(player): 4-connected, first cell whose center
 * passes isFootprintWalkable. Cap visits for hitch safety.
 */
export function findLegalByLoadedBfs(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
): Vec2 | null {
  const startGx = Math.floor(px);
  const startGy = Math.floor(py);
  const queue: Array<[number, number]> = [[startGx, startGy]];
  const seen = new Set<string>([`${startGx},${startGy}`]);
  let visits = 0;
  const dirs: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  while (queue.length > 0 && visits < EMBED_BFS_VISIT_CAP) {
    const [gx, gy] = queue.shift()!;
    visits++;
    const cx = gx + 0.5;
    const cy = gy + 0.5;
    if (isFootprintWalkable(cx, cy, chunks)) {
      return { x: cx, y: cy };
    }
    for (const [dx, dy] of dirs) {
      const nx = gx + dx;
      const ny = gy + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      // Only expand into loaded chunk cells (unloaded returns walkable under
      // gen-on-entry — skip to keep BFS on known geometry).
      const size = WORLD_CONFIG.chunkSize;
      const ccx = Math.floor(nx / size);
      const ccy = Math.floor(ny / size);
      if (!chunks.has(`${ccx},${ccy}`)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return null;
}

/**
 * Deterministic safe cell: startPosition if walkable; else scan loaded chunks.
 */
export function findDeterministicSafeSpawn(
  chunks: Map<string, ChunkData>,
): Vec2 | null {
  const sp = PLAYER_CONFIG.startPosition;
  if (isFootprintWalkable(sp.x, sp.y, chunks)) {
    return { x: sp.x, y: sp.y };
  }
  // Prefer origin chunk center region
  const size = WORLD_CONFIG.chunkSize;
  const origin = chunks.get('0,0');
  if (origin) {
    const mid = size / 2;
    if (isFootprintWalkable(mid + 0.5, mid + 0.5, chunks)) {
      return { x: mid + 0.5, y: mid + 0.5 };
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (isFootprintWalkable(cx, cy, chunks)) {
          return { x: cx, y: cy };
        }
      }
    }
  }
  // Any loaded chunk
  for (const key of chunks.keys()) {
    const [ccxStr, ccyStr] = key.split(',');
    const ccx = Number(ccxStr);
    const ccy = Number(ccyStr);
    if (!Number.isFinite(ccx) || !Number.isFinite(ccy)) continue;
    const baseX = ccx * size;
    const baseY = ccy * size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cx = baseX + x + 0.5;
        const cy = baseY + y + 0.5;
        if (isFootprintWalkable(cx, cy, chunks)) {
          return { x: cx, y: cy };
        }
      }
    }
  }
  return null;
}

/**
 * Full embed escalate ladder (normative PR4):
 *   1) R ∈ EMBED_R_LADDER ring search
 *   2) loaded-chunk BFS
 *   3) deterministic safe spawn
 * Returns null only if step 4 (should be vanishingly rare).
 */
export function resolveEmbedDestination(
  px: number,
  py: number,
  chunks: Map<string, ChunkData>,
): Vec2 | null {
  for (const R of EMBED_R_LADDER) {
    const hit = findNearestLegalFootprintCenter(px, py, R, chunks);
    if (hit) return hit;
  }
  const bfs = findLegalByLoadedBfs(px, py, chunks);
  if (bfs) return bfs;
  return findDeterministicSafeSpawn(chunks);
}

export type EmbedResolveResult =
  /** Already legal; no write. */
  | 'legal'
  /** Teleported to a legal footprint this call. */
  | 'teleported'
  /** Ladder exhausted (step 4); position still illegal — skip integrate. */
  | 'stuck';

/**
 * If footprint is illegal, run constrained embed recovery once per event.
 * Teleports to a legal center; never grants noclip.
 */
export function resolveEmbedIfNeeded(state: GameState): EmbedResolveResult {
  const legal = isFootprintWalkable(state.player.x, state.player.y, state.chunks);
  if (legal) {
    if (_embedEventActive) {
      _embedEventActive = false;
      _embedLadderExhausted = false;
      _embedToastShown = false;
    }
    // Clear visual-only escape when legal
    if (state.player.spawnEscape) {
      state.player.spawnEscape = false;
      if (state.player.sinkDepth === SPAWN_ESCAPE_RISE_PX) {
        state.player.sinkDepth = 0;
      }
    }
    return 'legal';
  }

  // Ladder already tried this embed event: keep visual flag, but do NOT
  // permanently freeze the motor (caller still integrates legal steps).
  // Retry the ladder every ~1s of wall time so gen/load edges can recover.
  if (_embedEventActive && _embedLadderExhausted) {
    if (!state.player.spawnEscape) {
      state.player.spawnEscape = true;
      state.player.sinkDepth = SPAWN_ESCAPE_RISE_PX;
    }
    // Soft re-open ladder periodically
    if (performance.now() - (_lastEmbedRetryMs || 0) > 1000) {
      _embedLadderExhausted = false;
      _lastEmbedRetryMs = performance.now();
    } else {
      return 'stuck'; // still illegal; integrate may still walk free
    }
  }

  // New embed event or first attempt
  _embedEventActive = true;
  const dest = resolveEmbedDestination(state.player.x, state.player.y, state.chunks);
  // Belt-and-suspenders: never write a dest that fails walkability
  if (dest && isFootprintWalkable(dest.x, dest.y, state.chunks)) {
    state.player.x = dest.x;
    state.player.y = dest.y;
    state.player.spawnEscape = false;
    state.player.sinkDepth = 0;
    _embedEventActive = false;
    _embedLadderExhausted = false;
    _embedToastShown = false;
    return 'teleported';
  }

  // Step 4: stay illegal; visual only; no integrate this frame
  _embedLadderExhausted = true;
  state.player.spawnEscape = true;
  state.player.sinkDepth = SPAWN_ESCAPE_RISE_PX;
  if (!_embedToastShown) {
    _embedToastShown = true;
    console.assert(
      false,
      '[player-motor] embed recovery ladder exhausted; staying put (no noclip)',
    );
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[player-motor] embed recovery ladder exhausted; staying put (no noclip)');
    }
    // Player-visible once (vanishingly rare in product gen)
    if (state.ui) {
      addToast(state.ui, 'Finding solid ground…', '#ffd27a', 2500);
    }
  }
  return 'stuck';
}

/**
 * Name kept for call-site clarity; constrained recovery only (no noclip).
 * Prefer `resolveEmbedIfNeeded`.
 */
export function ensureNotEmbedded(state: GameState): void {
  resolveEmbedIfNeeded(state);
}

// ─── Stuck legal nudges ───────────────────────────────────────

/**
 * Ordered legal nudge candidates from movement intent (design a–d).
 * a) along input * ε
 * b) along input * 2ε
 * c) perpendicular ±
 * d) axis unit (±ε,0)/(0,±ε) favoring input sign
 * Deduped so pure-axis intent does not waste NUDGE_MAX_ATTEMPTS on duplicates.
 */
export function buildStuckNudgeCandidates(
  mv: { dx: number; dy: number },
): Array<{ dx: number; dy: number }> {
  const eps = NUDGE_EPS;
  const len = Math.hypot(mv.dx, mv.dy);
  const ndx = len > 1e-8 ? mv.dx / len : 0;
  const ndy = len > 1e-8 ? mv.dy / len : 0;
  const sx = ndx === 0 ? 0 : Math.sign(ndx);
  const sy = ndy === 0 ? 0 : Math.sign(ndy);

  const raw: Array<{ dx: number; dy: number }> = [
    // a) along input
    { dx: ndx * eps, dy: ndy * eps },
    // b) along input * 2ε
    { dx: ndx * 2 * eps, dy: ndy * 2 * eps },
    // c) perpendicular ±
    { dx: -ndy * eps, dy: ndx * eps },
    { dx: ndy * eps, dy: -ndx * eps },
  ];

  // d) axis unit favoring input sign, then remaining cardinals
  if (sx !== 0) {
    raw.push({ dx: sx * eps, dy: 0 });
    raw.push({ dx: -sx * eps, dy: 0 });
  } else {
    raw.push({ dx: eps, dy: 0 });
    raw.push({ dx: -eps, dy: 0 });
  }
  if (sy !== 0) {
    raw.push({ dx: 0, dy: sy * eps });
    raw.push({ dx: 0, dy: -sy * eps });
  } else {
    raw.push({ dx: 0, dy: eps });
    raw.push({ dx: 0, dy: -eps });
  }

  const out: Array<{ dx: number; dy: number }> = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (Math.abs(c.dx) < 1e-12 && Math.abs(c.dy) < 1e-12) continue;
    const key = `${c.dx.toFixed(5)},${c.dy.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Try legal stuck nudges (no noclip). Returns true if a nudge committed.
 */
export function tryStuckNudges(
  state: GameState,
  mv: { dx: number; dy: number },
): boolean {
  const candidates = buildStuckNudgeCandidates(mv);
  const limit = Math.min(NUDGE_MAX_ATTEMPTS, candidates.length);
  for (let i = 0; i < limit; i++) {
    const c = candidates[i]!;
    const trialX = state.player.x + c.dx;
    const trialY = state.player.y + c.dy;
    if (isFootprintWalkable(trialX, trialY, state.chunks)) {
      state.player.x = trialX;
      state.player.y = trialY;
      return true;
    }
  }
  return false;
}

// ─── Integration ──────────────────────────────────────────────

/**
 * Integrate one small movement step with axis-independent slide.
 * **Every** commit requires isFootprintWalkable — no escape/noclip branch.
 */
export function integrateMoveStep(
  state: GameState,
  mv: { dx: number; dy: number },
  stepScale: number,
  speedMult: number,
): MoveStepResult {
  const stepSpeed = state.player.speed * speedMult * stepScale;
  const dx = mv.dx * stepSpeed;
  const dy = mv.dy * stepSpeed;
  const newX = state.player.x + dx;
  const newY = state.player.y + dy;

  let movedX = false;
  let movedY = false;

  if (isFootprintWalkable(newX, newY, state.chunks)) {
    state.player.x = newX;
    state.player.y = newY;
    movedX = true;
    movedY = true;
  } else {
    // Axis slide: keep as much progress as the wall allows
    if (dx !== 0 && isFootprintWalkable(newX, state.player.y, state.chunks)) {
      state.player.x = newX;
      movedX = true;
    }
    if (dy !== 0 && isFootprintWalkable(state.player.x, newY, state.chunks)) {
      state.player.y = newY;
      movedY = true;
    }
    // Half-step slide when full-step both axes blocked (corner glue)
    if (!movedX && !movedY) {
      const hx = state.player.x + dx * 0.5;
      const hy = state.player.y + dy * 0.5;
      if (dx !== 0 && isFootprintWalkable(hx, state.player.y, state.chunks)) {
        state.player.x = hx;
        movedX = true;
      }
      if (dy !== 0 && isFootprintWalkable(state.player.x, hy, state.chunks)) {
        state.player.y = hy;
        movedY = true;
      }
    }
  }

  return { moved: movedX || movedY, attemptX: newX, attemptY: newY };
}

/**
 * Sub-step integrate for one render frame. Returns aggregate move result.
 *
 * PRE: constrained embed recovery (legal teleports only).
 * SUBSTEP: axis-slide with walk checks on every write.
 * POST: stuck-legal nudges when blocked while holding move.
 *
 * Critical: embed step-4 "stuck" must NOT freeze the motor forever — if the
 * player is on illegal ground we still try to walk into legal cells; only
 * multi-frame noclip is forbidden.
 */
export function integrateMovementFrame(
  state: GameState,
  mv: { dx: number; dy: number },
  frameMs: number,
  speedMult: number,
): { anyMoved: boolean; lastAttemptX: number; lastAttemptY: number } {
  const x0 = state.player.x;
  const y0 = state.player.y;
  let anyMoved = false;
  let lastAttemptX = state.player.x;
  let lastAttemptY = state.player.y;

  // 1. PRE embed recovery (legal teleport only)
  const embedResult = resolveEmbedIfNeeded(state);
  if (embedResult === 'teleported') {
    anyMoved = true;
    lastAttemptX = state.player.x;
    lastAttemptY = state.player.y;
    // Continue integrating this frame so held keys still feel responsive
  }
  // 'stuck' / 'legal': fall through to normal integrate

  // 2. SUBSTEP integrate — every write requires isFootprintWalkable
  let remaining = Math.min(Math.max(frameMs, 0), MOVE_MAX_CATCHUP_MS);
  _lastSimDtClampedMs = remaining;

  while (remaining > 1e-6) {
    const stepMs = Math.min(remaining, MOVE_STEP_MS);
    const stepScale = stepMs / MOVE_STEP_MS;
    const result = integrateMoveStep(state, mv, stepScale, speedMult);
    if (result.moved) anyMoved = true;
    lastAttemptX = result.attemptX;
    lastAttemptY = result.attemptY;
    remaining -= stepMs;
  }

  // 3. POST stuck-legal recovery — nudge immediately after a short stick
  const wantsMove = Math.abs(mv.dx) > 1e-8 || Math.abs(mv.dy) > 1e-8;
  if (wantsMove && !anyMoved) {
    _blockedWhileMovingMs += frameMs;
    if (_blockedWhileMovingMs >= STUCK_MS) {
      _blockedWhileMovingMs = 0;
      if (tryStuckNudges(state, mv)) {
        anyMoved = true;
        // Successful slide — allow embed ladder to retry next time
        _embedLadderExhausted = false;
        _embedEventActive = false;
      }
    }
  } else {
    _blockedWhileMovingMs = 0;
  }

  // 4. HARD POST-CONDITION (dev assert)
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV &&
    !isFootprintWalkable(state.player.x, state.player.y, state.chunks)
  ) {
    console.assert(
      false,
      '[player-motor] post-condition: footprint must be walkable after integrate',
    );
  }

  _lastMoveDisplacement = Math.hypot(state.player.x - x0, state.player.y - y0);
  if (_injectFrameActive) {
    _lastInjectLatch = {
      rawMs: _lastSimDtRawMs,
      clampedMs: _lastSimDtClampedMs,
      displacement: _lastMoveDisplacement,
    };
    _injectFrameActive = false;
  }

  return { anyMoved, lastAttemptX, lastAttemptY };
}
