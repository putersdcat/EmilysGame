/**
 * cosmetic-unlocks.ts — Check progression and grant newly unlocked cosmetics.
 *
 * B5 micro-slice 11.25 (#268): extracted from src/main.ts.
 * Pure side-effecting function — checks quiz/wildlife progression against
 * the unlock table and adds newly unlocked cosmetics to state + localStorage,
 * plus a toast notification for each.
 *
 * @see issue #66 (Cosmetic Unlocks)
 */

import { checkAllUnlocks, type ProgressionData, getCosmeticById } from '../config/cosmetics.config';
import { getWildlifeStats } from './wildlife';
import { setUnlockedCosmetics } from '../ui/customizer';
import { addToast } from '../ui/ui';
import type { GameState } from './game-state';

/**
 * Check the player's progression (quiz correct/answered, wildlife discovered)
 * against the unlock table. If new cosmetics are unlocked:
 *   1. Add them to state.unlockedCosmetics
 *   2. Persist via setUnlockedCosmetics (localStorage)
 *   3. Show a toast notification for each unlock
 */
export function checkCosmeticUnlocks(state: GameState): void {
  const progress: ProgressionData = {
    quizCorrect: state.quizStats.correct,
    quizAnswered: state.quizStats.answered,
    wildlifeDiscovered: getWildlifeStats().discovered,
    // 2026-07-13 (Vision Alignment Audit Finding #14 residual): coin_count
    // and streak_length unlock condition types added to match #116's
    // original Phase 2/3 task list alongside the existing quiz/wildlife ones.
    coins: state.inventory.countItem('coin'),
    streakLength: state.streak.consecutiveCorrect,
  };
  const newUnlocks = checkAllUnlocks(progress, new Set(state.unlockedCosmetics));
  if (newUnlocks.length > 0) {
    state.unlockedCosmetics.push(...newUnlocks);
    setUnlockedCosmetics(state.unlockedCosmetics);
    // Show toast for each unlock
    for (const id of newUnlocks) {
      const cosmetic = getCosmeticById(id);
      if (cosmetic) {
        addToast(state.ui, `🔓 New cosmetic unlocked: ${cosmetic.name}!`, '#ffab40', 4000);
      }
    }
  }
}
