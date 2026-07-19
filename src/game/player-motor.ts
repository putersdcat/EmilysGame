/**
 * player-motor.ts — thin re-export of play-kernel/motor (PR3).
 *
 * Prefer `src/game/play-kernel` (or `./play-kernel/motor`) for new imports.
 * L0 inject/clamp shims remain for one-PR compat; prefer play-kernel loop surface.
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md
 */

export {
  MOVE_STEP_MS,
  MOVE_MAX_CATCHUP_MS,
  STUCK_MS,
  NUDGE_EPS,
  NUDGE_MAX_ATTEMPTS,
  EMBED_R_LADDER,
  EMBED_BFS_VISIT_CAP,
  resetPlayerMotor,
  chebyshevRingOffsets,
  findNearestLegalFootprintCenter,
  findLegalByLoadedBfs,
  findDeterministicSafeSpawn,
  resolveEmbedDestination,
  resolveEmbedIfNeeded,
  ensureNotEmbedded,
  buildStuckNudgeCandidates,
  tryStuckNudges,
  integrateMoveStep,
  integrateMovementFrame,
  type MoveStepResult,
  type Vec2,
  type EmbedResolveResult,
} from './play-kernel/motor';

// L0 inject/clamp shims (compat; prefer play-kernel)
export {
  injectDtMs,
  takeInjectedDtMs,
  noteDtClamped,
  getDtClampedCount,
  noteSimDtRaw,
  getTimeContractSnapshot,
  finalizeInjectFrameIfActive,
} from './play-kernel/sim-dt';
