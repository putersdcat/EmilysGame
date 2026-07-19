/**
 * play-mode.ts — Layer 2 PlayMode ownership (PR5).
 *
 * Single owner of modal stack, pendingNext queue, and controlLock.
 * Content helpers (showDialog / startQuiz / openTrade) sync-activate UI,
 * then call enterModal. exitModal pops + drains pendingNext via those
 * helpers — never a parallel raw `*.active = true` path.
 *
 * Derived compat: `state.paused === stack.length > 0 || controlLock != null`.
 * After PR5, no direct `state.paused =` outside this module.
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L2 / PR5)
 */

import type { GameState } from './game-state';
import { startQuiz } from './quiz';
import { startInsectQuiz } from './quiz-specials';
import { openTrade, closeTrade, syncTradeDOM } from './trading';
import { closeDialog, addToast } from '../ui/ui';
import { cancelSpeech } from './audio/npc-voice';
import { quizClose } from './quiz';
import { getNpcPersona } from '../config/npc.config';

// ─── Types ───────────────────────────────────────────────────

export type ModalKind = 'pause_menu' | 'dialog' | 'quiz' | 'trade' | 'book';

/** Optional gate cell ref for quiz frames (payload still on pendingGateQuiz). */
export type GateRef = { chunkKey: string; lx: number; ly: number };

export type ModalFrame =
  | { kind: 'pause_menu' }
  | { kind: 'dialog'; owner: string }
  | { kind: 'quiz'; owner: string; gate?: GateRef }
  | { kind: 'trade'; owner: string }
  | { kind: 'book' };

export type ControlLock =
  | { reason: 'diarrhea'; untilMs: number }
  | { reason: 'chunk_rebuild' }
  | { reason: 'overlay' }
  | null;

export interface PlayModeState {
  /** Modal stack; top = active UI. Empty ⇒ free play (unless controlLock). */
  stack: ModalFrame[];
  /**
   * Queued modes to push when the current top exits.
   * Owned ONLY by play-mode.ts; interaction-handler calls queueAfterClose().
   */
  pendingNext: ModalFrame[];
  controlLock: ControlLock;
}

// ─── Factory ─────────────────────────────────────────────────

export function createEmptyPlayMode(): PlayModeState {
  return {
    stack: [],
    pendingNext: [],
    controlLock: null,
  };
}

// ─── Derived pause (single writer) ───────────────────────────

/** Keep `state.paused` in sync for greps / one-release compat. */
export function syncDerivedPaused(state: GameState): void {
  state.paused =
    state.playMode.stack.length > 0 || state.playMode.controlLock != null;
}

// ─── Queries ─────────────────────────────────────────────────

/** Motor may run only when true. */
export function locomotionAllowed(state: GameState): boolean {
  if (state.playMode.controlLock) return false;
  if (state.playMode.stack.length > 0) return false;
  return true;
}

/**
 * World interact (Space → handleSpaceInteraction) is blocked whenever
 * locomotion is blocked. Modal input still runs via topMode handlers.
 */
export function worldInteractAllowed(state: GameState): boolean {
  return locomotionAllowed(state);
}

export function topMode(state: GameState): ModalFrame | 'play' {
  const s = state.playMode.stack;
  return s.length ? s[s.length - 1]! : 'play';
}

export function hasModalKind(state: GameState, kind: ModalKind): boolean {
  return state.playMode.stack.some((f) => f.kind === kind);
}

// ─── Stack mutations ─────────────────────────────────────────

/**
 * Register a modal frame on the stack. Content owners must sync-activate
 * their subsystem *before* calling this (handshake).
 */
export function enterModal(state: GameState, frame: ModalFrame): void {
  state.playMode.stack.push(frame);
  if (frame.kind === 'pause_menu') {
    const menu = document.getElementById('pauseMenu');
    if (menu) menu.style.display = 'flex';
  }
  if (frame.kind === 'book') {
    state.knowledge.bookOpen = true;
  }
  syncDerivedPaused(state);
}

/**
 * Pop top if it matches `kind`, run content close side-effects, then drain
 * pendingNext FIFO via content helpers.
 */
export function exitModal(state: GameState, kind: ModalKind): void {
  const top = topMode(state);
  if (top === 'play' || top.kind !== kind) {
    // Mismatched exit — still try to clear derived orphan pause if empty
    syncDerivedPaused(state);
    return;
  }

  closeContentForKind(state, kind);
  state.playMode.stack.pop();
  syncDerivedPaused(state);
  drainPending(state);
}

/** Append a mode to open after the current top exits. */
export function queueAfterClose(state: GameState, frame: ModalFrame): void {
  state.playMode.pendingNext.push(frame);
}

/** Clear any queued pending modes (e.g. Escape cancel of dialog). */
export function clearPendingNext(state: GameState): void {
  state.playMode.pendingNext.length = 0;
}

export function setControlLock(state: GameState, lock: ControlLock): void {
  state.playMode.controlLock = lock;
  syncDerivedPaused(state);
}

/**
 * Force empty play mode (load / reset). Does not close DOM content —
 * callers that need content cleanup should do that first.
 */
export function resetPlayMode(state: GameState): void {
  state.playMode.stack.length = 0;
  state.playMode.pendingNext.length = 0;
  state.playMode.controlLock = null;
  syncDerivedPaused(state);
}

/**
 * Safety net (one release): if paused is true but stack empty and no lock,
 * clear paused. Prefer calling after modal handlers each frame.
 * Returns true if an orphan was cleared.
 */
export function recoverOrphanPause(state: GameState): boolean {
  if (
    state.paused &&
    state.playMode.stack.length === 0 &&
    state.playMode.controlLock == null
  ) {
    // Also clear if content flags claim ownership without stack (legacy drift)
    const contentOwner =
      state.quiz.active ||
      state.ui.dialog.active ||
      state.trade.active ||
      state.knowledge.bookOpen ||
      document.getElementById('pauseMenu')?.style.display === 'flex';
    if (!contentOwner) {
      state.paused = false;
      return true;
    }
    // Content active but stack missing — re-sync stack from content (belt)
    if (state.quiz.active) {
      enterModal(state, { kind: 'quiz', owner: 'orphan_recover' });
    } else if (state.ui.dialog.active) {
      enterModal(state, { kind: 'dialog', owner: 'orphan_recover' });
    } else if (state.trade.active) {
      enterModal(state, { kind: 'trade', owner: 'orphan_recover' });
    } else if (state.knowledge.bookOpen) {
      enterModal(state, { kind: 'book' });
    } else if (document.getElementById('pauseMenu')?.style.display === 'flex') {
      enterModal(state, { kind: 'pause_menu' });
    }
    return false;
  }
  return false;
}

// ─── Internal ────────────────────────────────────────────────

function closeContentForKind(state: GameState, kind: ModalKind): void {
  switch (kind) {
    case 'dialog':
      closeDialog(state.ui);
      cancelSpeech(state.voice);
      break;
    case 'quiz':
      if (state.quiz.active) quizClose(state.quiz);
      break;
    case 'trade':
      if (state.trade.active) {
        closeTrade(state.trade);
        syncTradeDOM(state.trade, state.inventory);
      }
      break;
    case 'book':
      state.knowledge.bookOpen = false;
      state.knowledge.currentArticleId = null;
      break;
    case 'pause_menu': {
      const menu = document.getElementById('pauseMenu');
      if (menu) menu.style.display = 'none';
      break;
    }
  }
}

/**
 * Drain pendingNext while stack is empty. Each frame is activated via
 * content helpers then enterModal (handshake).
 */
function drainPending(state: GameState): void {
  while (state.playMode.pendingNext.length > 0 && state.playMode.stack.length === 0) {
    const frame = state.playMode.pendingNext.shift()!;
    if (frame.kind === 'quiz') {
      const ok = activateQuizFromPending(state, frame);
      if (ok) {
        enterModal(state, frame);
      } else {
        addToast(state.ui, '📖 No quiz available right now.', '#ff9800', 2500);
        // continue loop for next pending (e.g. trade after failed quiz)
      }
    } else if (frame.kind === 'trade') {
      const ok = activateTradeFromPending(state, frame);
      if (ok) {
        enterModal(state, frame);
      }
      // fail → stay play / try next
    } else if (frame.kind === 'book') {
      state.knowledge.bookOpen = true;
      enterModal(state, frame);
    } else if (frame.kind === 'dialog') {
      // Rare on queue — content should already be set; just register
      enterModal(state, frame);
    } else if (frame.kind === 'pause_menu') {
      enterModal(state, frame);
    }
  }
}

/**
 * Sync-activate quiz from payload carriers.
 * Insect quizzes use startInsectQuiz; others use startQuiz (pendingQuiz).
 * Returns true if quiz.active after sync activate.
 */
function activateQuizFromPending(
  state: GameState,
  frame: Extract<ModalFrame, { kind: 'quiz' }>,
): boolean {
  if (frame.owner === 'insect' || state._pendingInsectQuiz) {
    state._pendingInsectQuiz = false;
    startInsectQuiz(state);
    // startInsectQuiz no longer sets paused; enterModal will
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
          drainPending(state);
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
  // Prefer pendingTrade persona; fall back to frame.owner
  const personaId = state.pendingTrade ?? frame.owner;
  state.pendingTrade = null;
  const persona = getNpcPersona(personaId);
  if (!persona) return false;
  const ok = openTrade(state.trade, persona);
  if (ok) syncTradeDOM(state.trade, state.inventory);
  return ok;
}

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

/**
 * Direct quiz entry helper: content already activated; register stack frame.
 * Use after startQuiz / startHygieneQuiz / startWoundCareQuiz / startInsectQuiz.
 */
export function enterQuizModal(state: GameState, owner: string, gate?: GateRef): void {
  if (!state.quiz.active) return;
  // Avoid double-push if already on quiz
  const top = topMode(state);
  if (top !== 'play' && top.kind === 'quiz') {
    syncDerivedPaused(state);
    return;
  }
  enterModal(state, gate ? { kind: 'quiz', owner, gate } : { kind: 'quiz', owner });
}

/**
 * Direct dialog entry: showDialog already called; register stack + optional queues.
 */
export function enterDialogModal(state: GameState, owner: string): void {
  const top = topMode(state);
  if (top !== 'play' && top.kind === 'dialog') {
    syncDerivedPaused(state);
    return;
  }
  enterModal(state, { kind: 'dialog', owner });
}

/**
 * Book open/close via play-mode (toggle helper).
 */
export function setBookOpen(state: GameState, open: boolean): void {
  if (open) {
    if (!state.knowledge.bookOpen) state.knowledge.bookOpen = true;
    if (!hasModalKind(state, 'book')) {
      enterModal(state, { kind: 'book' });
    } else {
      syncDerivedPaused(state);
    }
  } else {
    state.knowledge.bookOpen = false;
    state.knowledge.currentArticleId = null;
    // Pop book if top; if not top, filter stack
    const top = topMode(state);
    if (top !== 'play' && top.kind === 'book') {
      state.playMode.stack.pop();
      syncDerivedPaused(state);
      drainPending(state);
    } else {
      state.playMode.stack = state.playMode.stack.filter((f) => f.kind !== 'book');
      syncDerivedPaused(state);
    }
  }
}

/**
 * Tick diarrhea controlLock expiry. Returns true if lock still active
 * (caller should absorb world input). Does not early-out subsystem ticks.
 */
export function tickDiarrheaControlLock(state: GameState, nowMs: number = performance.now()): boolean {
  const lock = state.playMode.controlLock;
  if (lock?.reason === 'diarrhea') {
    if (nowMs >= lock.untilMs) {
      setControlLock(state, null);
      if (state.diarrhea.diarrheaLocked) {
        state.diarrhea.diarrheaLocked = false;
      }
      return false; // expired this frame
    }
    return true;
  }
  // Mirror illness state → controlLock if illness set lock without play-mode
  if (state.diarrhea.diarrheaLocked && state.diarrhea.diarrheaLockUntil > nowMs) {
    setControlLock(state, {
      reason: 'diarrhea',
      untilMs: state.diarrhea.diarrheaLockUntil,
    });
    return true;
  }
  if (state.diarrhea.diarrheaLocked && state.diarrhea.diarrheaLockUntil <= nowMs) {
    state.diarrhea.diarrheaLocked = false;
  }
  return false;
}
