/**
 * runPlayFrame — non-aborting play frame pipeline (PR1–PR4).
 *
 * Normative phases from design-play-kernel-2026-07-19.md:
 *   poll → frameCount → justKeys → control locks → reconcile →
 *   entryTop snapshot → modal handlers → locomotion/Space (entryTop play only) →
 *   tickPlayWorld (stack empty) → finally endFrame once.
 *
 * Mode shell: mode.ts (PR2). Motor: motor.ts (PR3). Presentation stays in hooks.
 * Single `input.endFrame()` owner: the `finally` below (+ pure unit tests).
 * Product never aborts the frame; locomotion only when entryTop === 'play'.
 *
 * ── Human play checklist (PR4 binding — feel over green tests) ──────────
 *  1 W and ↑          → screen up both
 *  2 A/S/D + arrows   → match; screen axes
 *  3 W+D              → up-right diagonal
 *  4 River 8-way      → clear stop; never on water
 *  5 Hold wall 3s     → slide or clear stop; keys feel alive
 *  6 Quiz gate        → fail/retry/open/walk soft
 *  7 NPC dialog chain → quiz/trade close → move within one frame
 *  8 Book / pause     → open-close; move immediately
 *  8b Quiz "I don't know" → Book opens → close → WASD one frame
 *  9 Tab unfocus 5s holding D → no map dash
 * 10 Dense embed      → legal recover; no river slash
 * 11 Free walk 1–2 min + leave via opened gate → no dead keys
 *
 * @see memories/repo/design-play-kernel-2026-07-19.md § Human play checklist
 */

import type { GameState } from '../game-state';
import type { InputManager } from '../input';
import {
  topMode,
  locomotionAllowed,
  worldInteractAllowed,
  tickDiarrheaControlLock,
  reconcileIfNeeded,
} from './mode';
import { integrateMovementFrame, resolveEmbedIfNeeded } from './motor';
import { getDebuffs } from '../status';
import { getInjurySpeedMult } from '../injury';
import { isDiarrheaDebuffActive, DIARRHEA_CONFIG } from '../illness';
import { addToast } from '../../ui/ui';
import { playSfx } from '../audio/sfx';
import { setDiarrheaOverlay } from '../../rendering/debuff-visuals';
import type { PlayFrameExtras, PlayFrameHooks } from './types';

// Re-export reconcile for callers that imported it from frame in PR1
export { reconcileIfNeeded } from './mode';

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

    // 5. reconcile (book stack + orphan pause + DEV asserts)
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
