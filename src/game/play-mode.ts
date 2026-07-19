/**
 * play-mode.ts — content adapter + re-export of play-kernel mode shell (PR2).
 *
 * Pure stack shell lives in `play-kernel/mode.ts`. This module:
 *   1. Re-exports the shell for existing import paths
 *   2. Registers DrainActivator with quiz/trade content activate helpers
 *   3. Keeps tryOpenPendingTrade (content-owned legacy helper)
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md PR2
 */

import type { GameState } from './game-state';
import { startQuiz } from './quiz';
import { startInsectQuiz } from './quiz-specials';
import { openTrade, syncTradeDOM } from './trading';
import { addToast } from '../ui/ui';
import { getNpcPersona } from '../config/npc.config';
import {
  registerDrainActivator,
  enterModal,
  exitModal as shellExitModal,
  topMode,
  syncDerivedPaused,
  drainPendingNext,
} from './play-kernel/mode';
import type { ModalFrame, ModalKind } from './play-kernel/types';

// Re-export pure shell (and types) for existing consumers
export {
  createEmptyPlayMode,
  syncDerivedPaused,
  locomotionAllowed,
  worldInteractAllowed,
  topMode,
  hasModalKind,
  enterModal,
  queueAfterClose,
  clearPendingNext,
  setControlLock,
  resetPlayMode,
  recoverOrphanPause,
  enterQuizModal,
  enterDialogModal,
  setBookOpen,
  tickDiarrheaControlLock,
  reconcileIfNeeded,
  registerDrainActivator,
  drainPendingNext,
} from './play-kernel/mode';

export type {
  ModalKind,
  GateRef,
  ModalFrame,
  ControlLock,
  PlayModeState,
} from './play-kernel/types';

// ─── Content-aware exitModal (trade DOM sync belt) ───────────

/**
 * Pop top if it matches `kind`, close content, drain pendingNext.
 * Wraps shell exitModal and syncs trade DOM after trade close.
 */
export function exitModal(state: GameState, kind: ModalKind): void {
  shellExitModal(state, kind);
  // Trade overlay is content DOM — hide when inactive after shell close
  if (kind === 'trade' || !state.trade.active) {
    syncTradeDOM(state.trade, state.inventory);
  }
}

// ─── Drain activator (content imports live here, not in kernel mode) ─

function activateQuizFromPending(
  state: GameState,
  frame: Extract<ModalFrame, { kind: 'quiz' }>,
): boolean {
  if (frame.owner === 'insect' || state._pendingInsectQuiz) {
    state._pendingInsectQuiz = false;
    startInsectQuiz(state);
    return state.quiz.active;
  }

  const pq = state.pendingQuiz;
  if (!pq) return false;
  state.pendingQuiz = null;

  // startQuiz is async but activates synchronously before any await.
  void startQuiz(state.quiz, pq.difficulty, pq.npcId, pq.bias, pq.question).then((ok) => {
    if (!ok) {
      // Softlock guard: if activate failed after we already entered, exit
      if (state.quiz.active === false && topMode(state) !== 'play') {
        const t = topMode(state);
        if (t !== 'play' && t.kind === 'quiz') {
          state.playMode.stack.pop();
          syncDerivedPaused(state);
          drainPendingNext(state);
        }
      }
    }
  });
  return state.quiz.active;
}

function activateTradeFromPending(
  state: GameState,
  frame: Extract<ModalFrame, { kind: 'trade' }>,
): boolean {
  const personaId = state.pendingTrade ?? frame.owner;
  state.pendingTrade = null;
  const persona = getNpcPersona(personaId);
  if (!persona) return false;
  const ok = openTrade(state.trade, persona);
  if (ok) syncTradeDOM(state.trade, state.inventory);
  return ok;
}

registerDrainActivator({
  activateQuiz(state, frame) {
    const ok = activateQuizFromPending(state, frame);
    if (!ok) {
      addToast(state.ui, '📖 No quiz available right now.', '#ff9800', 2500);
    }
    return ok;
  },
  activateTrade(state, frame) {
    return activateTradeFromPending(state, frame);
  },
  activateBook(state) {
    state.knowledge.bookOpen = true;
  },
});

/**
 * Open trade after quiz close (when pendingTrade was not pre-queued as
 * pendingNext — legacy path safety). Prefer queueAfterClose at dialog open.
 */
export function tryOpenPendingTrade(state: GameState): boolean {
  if (!state.pendingTrade) return false;
  const persona = getNpcPersona(state.pendingTrade);
  state.pendingTrade = null;
  if (persona && openTrade(state.trade, persona)) {
    enterModal(state, { kind: 'trade', owner: persona.id });
    return true;
  }
  return false;
}


