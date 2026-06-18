/**
 * auto-read.ts — Quiz accessibility TTS auto-read helper.
 *
 * B5 micro-slice 11.24 (#268): extracted from src/main.ts.
 * Decides whether to auto-read quiz questions aloud based on the player's
 * age band and voice settings, and triggers the speech via speakLine().
 *
 * Auto-read policy:
 *   - Age band 5-7: ALWAYS auto-read (early readers)
 *   - Age band 8-10: auto-read IF voice settings are enabled
 *   - Older bands: never auto-read
 *
 * @see issue #94 (Quiz Accessibility)
 */

import { speakLine } from './audio/npc-voice';
import type { GameState } from './game-state';

/** Should auto-read be enabled based on the player's age band? */
export function shouldAutoRead(state: GameState): boolean {
  const band = state.ageProfile.ageBand;
  // Auto-read for young bands (5-7 always, 8-10 if voice enabled)
  if (band === '5-7') return true;
  if (band === '8-10' && state.voice.settings.enabled) return true;
  return false;
}

/**
 * Auto-read the current quiz question aloud via TTS.
 * No-op if auto-read is disabled or no quiz is active.
 * Includes a 300ms delay so the quiz overlay renders first.
 */
export function autoReadQuizQuestion(state: GameState): void {
  if (!shouldAutoRead(state)) return;
  if (!state.quiz.active || !state.quiz.displayText) return;
  // Small delay so quiz overlay renders first
  setTimeout(() => {
    if (state.quiz.active) {
      speakLine(state.voice, state.quiz.displayText, null);
    }
  }, 300);
}
