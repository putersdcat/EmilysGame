/**
 * play-kernel types — PlayFrameHooks, mode frames, drain activator contracts.
 *
 * Normative contracts from design-play-kernel-2026-07-19.md.
 * Implementers must not invent alternate hook shapes.
 */

import type { GameState } from '../game-state';
import type { InputState } from '../input';

/** Edge keys for one frame (same shape as InputManager.justPressed()). */
export type JustKeys = InputState;

export type MoveResult = {
  anyMoved: boolean;
  lastAttemptX: number;
  lastAttemptY: number;
};

export type MovementVector = {
  dx: number;
  dy: number;
  screenDx: number;
  screenDy: number;
};

/**
 * Content + presentation callbacks. Kernel calls these; it does not implement quiz/UI.
 * Required hooks must be provided at boot (main wires them).
 */
export type PlayFrameHooks = {
  /** Quiz modal input (navigate / submit / close). Must NOT call input.endFrame(). */
  onQuizInput(state: GameState, justKeys: JustKeys): void;
  /** Dialog advance / close → exitModal('dialog'). Must NOT call endFrame(). */
  onDialogInput(state: GameState, justKeys: JustKeys): void;
  /** Trade / barter UI. Must NOT call endFrame(). */
  onTradeInput(state: GameState, justKeys: JustKeys): void;
  /** Book: usually no-op (DOM owns book); optional. */
  onBookInput?(state: GameState, justKeys: JustKeys): void;
  /** Pause menu keys if not fully DOM-driven; optional. */
  onPauseInput?(state: GameState, justKeys: JustKeys): void;

  /**
   * Footsteps, sinkDepth visual, wall_bump SFX, facing sprites, camera lerp,
   * maybeLoadChunks, autoCollect — tip handleMovement side effects.
   * Not pure motor.
   */
  onMovementPresentation(
    state: GameState,
    result: MoveResult,
    simDtMs: number,
    mv: MovementVector,
  ): void;
  /** Idle frame presentation (sprites / embed visual). Optional. */
  onIdlePresentation?(state: GameState, simDtMs: number): void;

  /** Space → interact with world (gates, NPCs). Only if entryTop was play. */
  onWorldInteract(state: GameState, justKeys: JustKeys): void;

  /**
   * World sim while stack empty (status, wildlife, fog, auto-save, tutorial, …).
   * Tip tickSubsystems body minus anything moved to tickAlways.
   */
  tickPlayWorld(state: GameState, justKeys: JustKeys, simDtMs: number): void;

  /** Optional always-on (default omit). Must not include survival drain. */
  tickAlways?(state: GameState, justKeys: JustKeys, simDtMs: number): void;
};

/**
 * Content-owned drain activation — registered once at boot.
 * Kernel mode.exitModal pops stack then asks this to sync-activate pending frames.
 * Avoids mode.ts importing quiz/trading (circular dependency).
 */
export type DrainActivator = {
  /** Sync-activate quiz from pendingQuiz / insect payload; return true if quiz.active. */
  activateQuiz(state: GameState, frame: Extract<ModalFrame, { kind: 'quiz' }>): boolean;
  /** Sync-activate trade from pendingTrade; return true if trade.active. */
  activateTrade(state: GameState, frame: Extract<ModalFrame, { kind: 'trade' }>): boolean;
  /** Optional: book / rare dialog on queue. */
  activateBook?(state: GameState): void;
};

export type ModalKind = 'pause_menu' | 'dialog' | 'quiz' | 'trade' | 'book';

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

export type PlayModeState = {
  stack: ModalFrame[];
  pendingNext: ModalFrame[];
  controlLock: ControlLock;
};

export type PlayLoopContext = {
  state: GameState;
  input: {
    pollGamepad(): void;
    justPressed(): JustKeys;
    getMovementVector(): MovementVector;
    endFrame(): void;
  };
  hooks: PlayFrameHooks;
  /** After runPlayFrame + finalize inject latch — typically renderFrame. */
  onAfterFrame: () => void;
};

/** Optional per-frame extras (clearExtraKeys, etc.). */
export type PlayFrameExtras = {
  clearExtraKeys?: () => void;
};
