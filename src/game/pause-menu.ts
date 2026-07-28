/**
 * pause-menu.ts — In-game pause menu overlay (Escape during gameplay).
 *
 * B5 micro-slice 11.11 (#268): extracted from main.ts. Same
 * dependency-inversion pattern as `showMainMenu` — accepts callbacks
 * for the operations that still live in main.ts (save, options,
 * bug report) rather than importing them. This keeps the menu
 * testable and decoupled from the main orchestrator.
 *
 * Button map (all DOM elements assumed to exist in index.html):
 *   - #pauseResume       → close pause menu
 *   - #pauseSave         → callback (doSave(state))
 *   - #pauseCustomize    → callback (showCustomizer + reload sprite)
 *   - #pauseMainMenu     → callback (doSave + location.reload)
 *   - #pauseControls     → toggle controls guide overlay
 *   - #pauseOptions      → callback (showOptionsOverlay(state, inputMgr))
 *   - #pauseBugReport    → callback (captureBugReport(state, description))
 *
 * @see issue #268 — B5: Decompose src/main.ts
 * @see `main-menu.ts` — sibling menu that uses the same dep-inversion pattern
 */

import { type GameState } from './game-state';
import { addToast } from '../ui/ui';
import { showCustomizer } from '../ui/customizer';
import { clearVariationCache, loadCharacterSprite } from '../asset-pipeline/sprites';
import { type InputManager } from './input';
import { enterModal, exitModal, topMode } from './play-mode';

/**
 * Callbacks the pause menu needs from its host (typically main.ts).
 * Pass `null` for any operation you want to disable (the button still
 * shows but does nothing on click).
 */
export interface PauseMenuHandlers {
  /** Triggered when the user clicks "Save" — usually calls doSave(state). */
  onSave: (() => void) | null;
  /** Triggered when the user clicks "Main Menu" — saves + reloads. */
  onMainMenu: (() => void) | null;
  /** Triggered when the user clicks "Options" — opens the Options overlay. */
  onOptions: (() => void) | null;
  /** Triggered when the user submits a bug report — captures + downloads. */
  onBugReport: ((description: string) => void) | null;
}

/**
 * Show the pause menu overlay.
 *
 * Enters `pause_menu` via play-mode (PR5); DOM is a presentation slave.
 * Resume / customize complete call exitModal('pause_menu').
 *
 * @param state     - the live GameState
 * @param inputMgr  - optional InputManager (passed through to Options)
 * @param handlers  - callbacks for save/main-menu/options/bug-report
 */
export function showPauseMenu(
  state: GameState,
  _inputMgr: InputManager | undefined,
  handlers: PauseMenuHandlers,
): void {
  const top = topMode(state);
  if (top === 'play' || top.kind !== 'pause_menu') {
    enterModal(state, { kind: 'pause_menu' });
  }
  const menu = document.getElementById('pauseMenu')!;
  menu.style.display = 'flex';

  document.getElementById('pauseResume')!.onclick = () => {
    exitModal(state, 'pause_menu');
  };

  document.getElementById('pauseSave')!.onclick = () => {
    if (handlers.onSave) handlers.onSave();
    addToast(state.ui, 'Game saved!', '#4caf50', 1500);
  };

  document.getElementById('pauseCustomize')!.onclick = async () => {
    menu.style.display = 'none';
    const newVariation = await showCustomizer(state.playerVariation, true);
    if (!newVariation) {
      // Cancelled — reopen pause menu (stay on pause_menu frame)
      menu.style.display = 'flex';
      return;
    }
    clearVariationCache('custom');
    state.playerVariation = newVariation;
    state._baseExpression = newVariation.expression ?? 'happy';
    state.expressionOverride = null;
    state.egoImg = loadCharacterSprite(newVariation, 0, false);
    state.lastAnimFrame = -1;
    exitModal(state, 'pause_menu');
    addToast(state.ui, '🎨 Character updated!', '#ce93d8', 2000);
  };

  document.getElementById('pauseMainMenu')!.onclick = () => {
    if (handlers.onMainMenu) handlers.onMainMenu();
  };

  // Controls guide (#117)
  document.getElementById('pauseControls')!.onclick = () => {
    const guide = document.getElementById('controlsGuide')!;
    guide.style.display = 'flex';
    document.getElementById('controlsClose')!.onclick = () => {
      guide.style.display = 'none';
    };
  };

  // Options (#117 Phase 3)
  document.getElementById('pauseOptions')!.onclick = () => {
    if (handlers.onOptions) handlers.onOptions();
  };

  // Bug reporter (#117)
  document.getElementById('pauseBugReport')!.onclick = () => {
    const modal = document.getElementById('bugReportModal')!;
    modal.style.display = 'flex';
    const descEl = document.getElementById('bugDescription') as HTMLTextAreaElement;
    descEl.value = '';

    document.getElementById('bugCancel')!.onclick = () => {
      modal.style.display = 'none';
    };

    document.getElementById('bugSubmit')!.onclick = () => {
      if (handlers.onBugReport) handlers.onBugReport(descEl.value);
      modal.style.display = 'none';
      addToast(state.ui, '🐛 Bug report downloaded!', '#ff8888', 2500);
    };
  };
}