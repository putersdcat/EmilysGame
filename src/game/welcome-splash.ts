/**
 * welcome-splash.ts — One-time welcome overlay shown on first run.
 *
 * B5 micro-slice 11.22 (#268): extracted from src/main.ts.
 * Pure DOM manipulation: shows a welcome splash overlay the first time
 * the player launches the game, hides it after they click "Got it!",
 * and stores the dismissal in localStorage so it never shows again.
 *
 * @see issue #117 (Welcome Splash Phase 3)
 */

/** localStorage key for the "has the player dismissed welcome" flag. */
const FIRST_RUN_KEY = 'emilys_game_first_run';

/** Has the player not yet seen the welcome splash? */
export function shouldShowWelcome(): boolean {
  return !localStorage.getItem(FIRST_RUN_KEY);
}

/**
 * Show the welcome splash overlay if `shouldShowWelcome()` returns true.
 * Resolves immediately if the player has already dismissed it. Otherwise
 * waits for the player to click the dismiss button.
 */
export function showWelcomeSplash(): Promise<void> {
  return new Promise((resolve) => {
    if (!shouldShowWelcome()) {
      resolve();
      return;
    }

    const splash = document.getElementById('welcomeSplash')!;
    splash.style.display = 'flex';

    document.getElementById('welcomeDismiss')!.onclick = () => {
      splash.style.display = 'none';
      localStorage.setItem(FIRST_RUN_KEY, '1');
      resolve();
    };
  });
}
