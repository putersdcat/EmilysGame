/**
 * play-kernel public surface (PR2: frame + loop + mode + input-map).
 *
 * Motor / walk land in PR3.
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

// Pure map (PR2+)
export { screenIntentToGrid } from './input-map';
