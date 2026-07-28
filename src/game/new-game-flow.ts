// filepath: src/game/new-game-flow.ts
// B5 micro-slice 11.41 (#268): new-game flow extracted from main.ts main().
// Runs the post-main-menu onboarding for a fresh game: character
// customizer → age band → subject selection → tutorial. Returns the
// (possibly customized) GameState — caller can chain this with the
// audio init + rAF kickoff.
//
// Skips entirely in test mode (caller checks isTestMode() before
// calling this).
import type { GameState } from './game-state';
import { resetGameState } from './game-reset';
import { showCustomizer } from '../ui/customizer';
import { clearVariationCache, loadCharacterSprite } from '../asset-pipeline/sprites';
import { showAgeSelection } from './age-selection';
import { showSubjectSelection } from './knowledge';
import { addToast } from '../ui/ui';
import {
  initTutorial, shouldShowTutorial,
} from './tutorial';
import { loadFromSlot } from './save';
import { applySaveData } from './save-apply';
import { withWorldLoading } from './boot-loading';

/**
 * Run the full "new game" onboarding flow against the given state.
 *
 * Steps:
 *   1. Reset game state (wipe stale progression)
 *   2. Character customizer (no cancel — must create character)
 *   3. Apply variation: playerVariation, expression, egoImg, animFrame
 *   4. Age band selection (#92)
 *   5. Subject selection for Book of Knowledge
 *   6. First-time tutorial (#186) — only if shouldShowTutorial()
 *
 * **Async** — awaits each step. Skipped entirely in test mode by caller.
 */
export async function runNewGameFlow(state: GameState): Promise<void> {
  // Bulk chunk regen under spinner so New Game never freezes the tab.
  await withWorldLoading(() => resetGameState(state), 'Loading world…');
  // Character customizer (no cancel on new game — must create character)
  const customVariation = (await showCustomizer(state.playerVariation))!;
  clearVariationCache('custom');
  state.playerVariation = customVariation;
  state._baseExpression = customVariation.expression ?? 'happy';
  state.expressionOverride = null;
  state.egoImg = loadCharacterSprite(customVariation, 0, false);
  state.lastAnimFrame = -1;
  // Age band selection (#92)
  await showAgeSelection(state.ageProfile);
  // Subject selection
  await showSubjectSelection(state.knowledge);
  addToast(state.ui, '📖 Press B to open your Book of Knowledge!', '#ce93d8', 5000);
  // Tutorial for first-time players (#186)
  if (shouldShowTutorial()) {
    initTutorial();
  }
}

/**
 * Load a saved slot into state, with a toast on success.
 * Returns true if a save was loaded.
 */
export async function loadSlotIntoState(state: GameState, slot: number): Promise<boolean> {
  const data = loadFromSlot(slot);
  if (data) {
    await withWorldLoading(() => applySaveData(state, data), 'Loading world…');
    addToast(state.ui, `Loaded slot ${slot + 1}!`, '#88ccff', 1500);
    return true;
  }
  return false;
}
