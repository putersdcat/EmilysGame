/**
 * play-kernel public surface (PR1: frame + types only).
 *
 * Loop / mode shell / motor / input-map land in later PRs.
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

export { runPlayFrame, reconcileIfNeeded } from './frame';
