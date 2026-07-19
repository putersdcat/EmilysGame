/**
 * play-kernel public surface (PR1–PR3: frame + loop + mode + input-map + motor + walk).
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md
 */

export type {
  PlayFrameHooks,
  PlayFrameExtras,
  PlayLoopContext,
  MoveResult,
  MovementVector,
  JustKeys,
  DrainActivator,
  ModalFrame,
  ModalKind,
  ControlLock,
  PlayModeState,
  GateRef,
} from './types';

// Frame (PR1+)
export { runPlayFrame } from './frame';

// Loop (PR2+)
export {
  startPlayLoop,
  stopPlayLoop,
  playLoopTick,
  injectDtMs,
  takeInjectedDtMs,
  noteSimDtRaw,
  noteDtClamped,
  finalizeInjectFrameIfActive,
  getTimeContractSnapshot,
  getDtClampedCount,
  resetSimDtContract,
  noteInjectIntegrateResult,
  type StartPlayLoopOptions,
} from './loop';

// Mode shell (PR2+)
export {
  createEmptyPlayMode,
  enterModal,
  exitModal,
  queueAfterClose,
  clearPendingNext,
  setControlLock,
  resetPlayMode,
  locomotionAllowed,
  worldInteractAllowed,
  topMode,
  hasModalKind,
  enterQuizModal,
  enterDialogModal,
  setBookOpen,
  tickDiarrheaControlLock,
  syncDerivedPaused,
  reconcileIfNeeded,
  registerDrainActivator,
  recoverOrphanPause,
  drainPendingNext,
} from './mode';

// Motor (PR3+)
export {
  integrateMovementFrame,
  resolveEmbedIfNeeded,
  resetPlayerMotor,
  MOVE_STEP_MS,
  MOVE_MAX_CATCHUP_MS,
  STUCK_MS,
} from './motor';

// Pure map (PR2+)
export { screenIntentToGrid } from './input-map';

// Walk re-export (PR3+)
export { isWalkable, isPositionWalkable, isFootprintWalkable } from './walk';
