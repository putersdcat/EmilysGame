// filepath: src/game/menu-flow.ts
// B5 micro-slice 11.44 (#268): main-menu flow orchestration extracted
// from main.ts main(). Encapsulates the post-init UX: welcome splash
// for first-timers (#117) → main menu choice → either new-game flow,
// load a specific slot, or 'continue' (auto-save already loaded by
// init()).
//
// Skips entirely in test mode (no menu interactions in tests).
//
// The Options overlay button on the main menu is wired via callback
// dependency-inversion (showOptionsOverlay isn't imported here —
// main.ts passes the callback) so this module stays independent of
// options-overlay.ts.
import type { GameState } from './game-state';
import { isTestMode } from '../engine/llm';
import { showWelcomeSplash } from './welcome-splash';
import { showMainMenu } from './main-menu';
import { runNewGameFlow, loadSlotIntoState } from './new-game-flow';
import { markMenuInteractive, markMenuResolved } from './boot-marks';

/** Prefix returned by `showMainMenu()` when the user picks a save slot. */
const LOAD_SLOT_PREFIX = 'load-slot-';

/**
 * Run the post-startup main-menu flow.
 *
 * Returns immediately in test mode (no menu shown). Otherwise shows
 * the welcome splash (first-time players), then the main menu, then
 * dispatches the user's choice to:
 *
 *   - 'new-game'  → runNewGameFlow(state) — full onboarding
 *   - 'load-slot-N' → loadSlotIntoState(state, N)
 *   - 'continue'  → no-op (auto-save already loaded by init())
 *
 * @param state     — the GameState (mutated in place by new-game or load)
 * @param hasSaveData — drives the "Continue" vs "New Game" choice UI
 * @param onOpenOptions — callback for the Options button in main menu
 */
export async function runMenuFlow(
  state: GameState,
  hasSaveData: boolean,
  onOpenOptions: () => void,
): Promise<void> {
  if (isTestMode()) {
    // Tests skip the menu — treat as immediately resolved for post-menu marks.
    markMenuResolved();
    return;
  }

  // Welcome splash for first-time players (#117)
  await showWelcomeSplash();

  // Menu is about to be shown and accept input (end of pre-menu budget).
  markMenuInteractive();
  const choice = await showMainMenu(hasSaveData, onOpenOptions);

  if (choice === 'new-game') {
    await runNewGameFlow(state);
  } else if (choice.startsWith(LOAD_SLOT_PREFIX)) {
    const slot = parseInt(choice.replace(LOAD_SLOT_PREFIX, ''));
    await loadSlotIntoState(state, slot);
  }
  // 'continue' → auto-save already loaded by init()

  // Session play is about to start (post-menu phase).
  markMenuResolved();
}
