/**
 * mode.ts — pure PlayMode stack shell (PR2).
 *
 * Owns: stack / pendingNext / controlLock / derived paused / enter-exit /
 * reconcile / drain via registered DrainActivator.
 *
 * Does **not** import quiz / trading / dialog content modules. Content close
 * side-effects use only GameState field writes + optional DOM for pause menu.
 * Drain activation is injected via registerDrainActivator at boot.
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md § Mode / content boundary
 */

import type { GameState } from '../game-state';
import type {
  ControlLock,
  DrainActivator,
  GateRef,
  ModalFrame,
  ModalKind,
  PlayModeState,
} from './types';

// ─── Drain activator (content-owned, registered once) ────────

let _drainActivator: DrainActivator | null = null;

/** Boot-time registration — content wires quiz/trade activate helpers. */
export function registerDrainActivator(activator: DrainActivator): void {
  _drainActivator = activator;
}

export function getDrainActivator(): DrainActivator | null {
  return _drainActivator;
}

// ─── Factory ─────────────────────────────────────────────────

export function createEmptyPlayMode(): PlayModeState {
  return {
    stack: [],
    pendingNext: [],
    controlLock: null,
  };
}

// ─── Derived pause (single writer of state.paused under src/game product) ─

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
 * pendingNext FIFO via DrainActivator.
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

// ─── Internal close (state/DOM only — no content module imports) ─

function closeContentForKind(state: GameState, kind: ModalKind): void {
  switch (kind) {
    case 'dialog':
      state.ui.dialog.active = false;
      // Voice cancel is optional belt; content may also cancel on handler path
      if (state.voice) {
        state.voice.speaking = false;
        state.voice.currentSpeaker = null;
        try {
          if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
      }
      break;
    case 'quiz':
      if (state.quiz.active) {
        state.quiz.active = false;
        state.quiz.question = null;
      }
      break;
    case 'trade':
      if (state.trade.active) {
        state.trade.active = false;
        state.trade.persona = null;
        state.trade.trades = [];
        state.trade.selectedIndex = 0;
        state.trade.mode = 'buy';
        state.trade.lastResult = null;
        state.trade.lastResultAt = 0;
        state.trade.barterQuiz = null;
        state.trade.barterSelectedIndex = 0;
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
 * DrainActivator then enterModal (handshake).
 */
function drainPending(state: GameState): void {
  const activator = _drainActivator;
  while (state.playMode.pendingNext.length > 0 && state.playMode.stack.length === 0) {
    const frame = state.playMode.pendingNext.shift()!;
    if (frame.kind === 'quiz') {
      if (activator) {
        const ok = activator.activateQuiz(state, frame);
        if (ok) {
          enterModal(state, frame);
        }
        // fail → stay play / try next (toast is activator's concern)
      }
    } else if (frame.kind === 'trade') {
      if (activator) {
        const ok = activator.activateTrade(state, frame);
        if (ok) {
          enterModal(state, frame);
        }
      }
    } else if (frame.kind === 'book') {
      activator?.activateBook?.(state);
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

/** Exposed for setBookOpen / rare external drain after stack mutates. */
export function drainPendingNext(state: GameState): void {
  drainPending(state);
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

/**
 * Every frame reconcile (PR2): sync derived paused, book/stack DEV asserts,
 * content-without-stack heal, orphan pause clear.
 * Returns whether an orphan heal ran.
 */
export function reconcileIfNeeded(state: GameState): boolean {
  // 1) Derived paused must match stack | lock
  syncDerivedPaused(state);

  // 2) Book slave: bookOpen without frame → enter book
  if (state.knowledge.bookOpen && !hasModalKind(state, 'book')) {
    enterModal(state, { kind: 'book' });
  }

  // DEV asserts: bookOpen iff has book frame; quiz.active implies quiz on stack
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV
  ) {
    const hasBook = hasModalKind(state, 'book');
    if (state.knowledge.bookOpen !== hasBook) {
      console.assert(
        false,
        `[play-mode] bookOpen (${state.knowledge.bookOpen}) !== has book frame (${hasBook})`,
      );
    }
    if (state.quiz.active && !hasModalKind(state, 'quiz')) {
      console.assert(
        false,
        '[play-mode] quiz.active without quiz frame on stack',
      );
    }
  }

  // 3–4) Content active without stack → re-hydrate (or clear orphan pause)
  if (state.playMode.stack.length === 0 && state.playMode.controlLock == null) {
    if (state.quiz.active) {
      enterModal(state, { kind: 'quiz', owner: 'orphan_recover' });
    } else if (state.ui.dialog.active) {
      enterModal(state, { kind: 'dialog', owner: 'orphan_recover' });
    } else if (state.trade.active) {
      enterModal(state, { kind: 'trade', owner: 'orphan_recover' });
    } else if (document.getElementById('pauseMenu')?.style.display === 'flex') {
      enterModal(state, { kind: 'pause_menu' });
    }
  }

  return recoverOrphanPause(state);
}
