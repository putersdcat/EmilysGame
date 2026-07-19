/**
 * runPlayFrame — non-aborting play frame pipeline (PR1).
 *
 * Normative phases from design-play-kernel-2026-07-19.md:
 *   poll → frameCount → justKeys → control locks → reconcile →
 *   entryTop snapshot → modal handlers → locomotion/Space (entryTop play only) →
 *   tickPlayWorld (stack empty) → finally endFrame once.
 *
 * Mode / motor remain tip modules for PR1; this owns orchestration only.
 */

import type { GameState } from '../game-state';
import type { InputManager } from '../input';
import {
  topMode,
  locomotionAllowed,
  worldInteractAllowed,
  tickDiarrheaControlLock,
  recoverOrphanPause,
  enterModal,
  hasModalKind,
} from '../play-mode';
import { integrateMovementFrame, resolveEmbedIfNeeded } from '../player-motor';
import { getDebuffs } from '../status';
import { getInjurySpeedMult } from '../injury';
import { isDiarrheaDebuffActive, DIARRHEA_CONFIG } from '../illness';
import { addToast } from '../../ui/ui';
import { playSfx } from '../audio/sfx';
import { setDiarrheaOverlay } from '../../rendering/debuff-visuals';
import type { PlayFrameExtras, PlayFrameHooks } from './types';

/**
 * PR1 thin reconcile: book stack heal, content-without-stack heal,
 * then tip recoverOrphanPause. Returns whether an orphan heal ran.
 */
export function reconcileIfNeeded(state: GameState): boolean {
  // Prefer stack as authority for book: bookOpen without frame → enter book
  if (state.knowledge.bookOpen && !hasModalKind(state, 'book')) {
    enterModal(state, { kind: 'book' });
  }

  // Content active without stack frame (handshake drift) → re-hydrate stack
  // so entryTop snapshot routes modal input correctly.
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

/**
 * One play frame. Never aborts early; endFrame always runs in finally.
 *
 * Locomotion + world Space run only when entryTop === 'play' (snapshot
 * BEFORE modal handlers), preserving tip same-frame Space re-fire protection.
 */
export function runPlayFrame(
  state: GameState,
  input: InputManager,
  simDtMs: number,
  hooks: PlayFrameHooks,
  extras?: PlayFrameExtras,
): void {
  try {
    // 1. poll gamepad
    input.pollGamepad();

    // 2. frame counter
    state.frameCount++;

    // 3. edge keys
    const justKeys = input.justPressed();

    // 4. control locks (diarrhea expiry + presentation toast)
    const hadDiarrheaLock =
      state.playMode.controlLock?.reason === 'diarrhea' || state.diarrhea.diarrheaLocked;
    const diarrheaLocked = tickDiarrheaControlLock(state);
    if (hadDiarrheaLock && !diarrheaLocked && !state.diarrhea.diarrheaLocked) {
      setDiarrheaOverlay(false);
      addToast(state.ui, '😮‍💨 Phew... feeling better now.', '#4fc3f7', 2500);
      playSfx(state.sfx, 'pickup_item');
    }

    // 5. reconcile (book stack + orphan pause)
    reconcileIfNeeded(state);

    // 6. SNAPSHOT entry top — freezes phases 8–9 against modal close this frame
    const entryTop = topMode(state);

    // 7. modal input by entryTop (not content-flag early abort)
    if (entryTop !== 'play') {
      switch (entryTop.kind) {
        case 'quiz':
          hooks.onQuizInput(state, justKeys);
          break;
        case 'dialog':
          hooks.onDialogInput(state, justKeys);
          break;
        case 'trade':
          hooks.onTradeInput(state, justKeys);
          break;
        case 'book':
          hooks.onBookInput?.(state, justKeys);
          break;
        case 'pause_menu':
          hooks.onPauseInput?.(state, justKeys);
          break;
      }
    }

    // 8. locomotion — only if we entered the frame in free play
    if (entryTop === 'play' && locomotionAllowed(state)) {
      const mv = input.getMovementVector();
      const wantsMove = mv.dx !== 0 || mv.dy !== 0;
      if (wantsMove) {
        const debuffs = getDebuffs(state.status);
        const injuryMult = getInjurySpeedMult(state.injury);
        const diarrheaMult = isDiarrheaDebuffActive(state.diarrhea)
          ? DIARRHEA_CONFIG.SPEED_DEBUFF
          : 1.0;
        const speedMult = debuffs.speedMult * injuryMult * diarrheaMult;
        const result = integrateMovementFrame(state, mv, simDtMs, speedMult);
        hooks.onMovementPresentation(state, result, simDtMs, mv);
      } else {
        resolveEmbedIfNeeded(state);
        hooks.onIdlePresentation?.(state, simDtMs);
      }
    }

    // 9. world Space — only if entryTop was play (same-frame interact guard)
    if (entryTop === 'play' && worldInteractAllowed(state)) {
      hooks.onWorldInteract(state, justKeys);
    }

    // 10. world sim only when stack empty (current top after modal phase)
    // controlLock alone (diarrhea) still allows tickPlayWorld
    if (state.playMode.stack.length === 0) {
      hooks.tickPlayWorld(state, justKeys, simDtMs);
    }
    hooks.tickAlways?.(state, justKeys, simDtMs);
  } finally {
    // 11. single endFrame + clear extra keys — never from content handlers
    input.endFrame();
    extras?.clearExtraKeys?.();
  }
}
