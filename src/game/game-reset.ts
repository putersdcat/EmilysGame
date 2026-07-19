/**
 * game-reset.ts — Reset game state to a fresh-game baseline.
 *
 * B5 micro-slice 11.16 (#268): extracted from main.ts. `resetGameState` is
 * pure orchestration — it calls factory functions from each subsystem
 * (to get fresh defaults) and clear/stop functions (to drop in-progress
 * state). No module-level state lives here.
 *
 * Why this lives in `src/game/` (not `src/engine/`):
 *   - High-level orchestration concern (new-game flow), not world logic
 *   - Sits next to `src/game/save-apply.ts` (its sibling for save/load)
 *
 * Design notes:
 *   - Music/SFX/voice settings are preserved across new game; only playback
 *     is stopped. This lets the player keep their audio preferences.
 *   - All other subsystems return to factory defaults.
 *   - Chunks are cleared and regenerated around the player's spawn point.
 *   - The `_woundCareQuiz`, `_hygieneQuiz`, `_insectQuiz`, `_pendingInsectQuiz`
 *     quiz-type flags are reset (#109, #110).
 *
 * Public API:
 *   - resetGameState(state) — bring state to fresh-game baseline
 *
 * @see issue #103 — streak reset
 * @see issue #109 — injury + wound-care quiz reset
 * @see issue #110 — hygiene + insect quiz reset
 * @see issue #133 — diarrhea illness chain reset
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { WORLD_CONFIG, PLAYER_CONFIG } from '../config/game.config';
import { loadCharacterSprite, type FacingPose } from '../asset-pipeline/sprites';
import { createDefaultVariation, setUnlockedCosmetics } from '../ui/customizer';
import { createInventory } from './inventory';
import { createQuizState, createStreakState } from './quiz';
import { createKnowledgeState } from './knowledge';
import { createTradeState } from './trading';
import { createPlayerStatus, resetTickCounter } from './status';
import { createInjuryState } from './injury';
import { createInitialDiarrheaState } from './illness';
import { resetPlayerMotor } from './player-motor';
import { stop as musicStop } from './audio/music';
import { stopAmbience } from './audio/sfx';
import { cancelSpeech } from './audio/npc-voice';
import { setDiarrheaOverlay } from '../rendering/debuff-visuals';
import { clearBubbles } from '../ui/thought-bubbles';
import { clearTerrainCache } from '../rendering/terrain-cache';
import { clearObjectCache } from '../rendering/render';
import { clearParticles } from '../rendering/particles';
import { clearWeather } from '../rendering/weather';
import { deleteSave } from './save';
import { ensureChunksAroundYielding, clearPendingResolved } from './chunk-lifecycle';
import { resetBubbleTriggerState } from './bubble-triggers';
import { resetInteractionState } from './interaction-handler';
import { type GameState } from './game-state';
import { resetPlayMode } from './play-mode';

// ─── Public API ──────────────────────────────────────────────

/**
 * Bring `state` to a fresh-game baseline. Resets all subsystem state
 * to factory defaults, drops in-progress quiz/dialog/trade, stops
 * audio playback (settings preserved), clears chunks + caches, then
 * regenerates chunks around the spawn point.
 *
 * Called from the new-game flow in main.ts (after the user picks
 * "New Game" from the pause menu).
 *
 * **Async** — uses boot-only `ensureChunksAroundYielding` so bulk gen
 * does not freeze the tab. Callers should show a loading spinner.
 */
export async function resetGameState(state: GameState): Promise<void> {
  state.player.x = PLAYER_CONFIG.startPosition.x;
  state.player.y = PLAYER_CONFIG.startPosition.y;
  state.player.direction = 1;
  state.player.facingDx = 1;
  state.player.facingDy = 0;
  state.player.facingPose = 'front' as FacingPose;
  state.player.isMoving = false;
  state.player.animFrame = 0;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.chunks.clear();
  state.inventory = createInventory();
  state.quiz = createQuizState();
  state.knowledge = createKnowledgeState();
  state.quizStats = { answered: 0, correct: 0 };
  state.streak = createStreakState(); // #103 reset streak
  state.pendingQuiz = null;
  state.pendingGateQuiz = null;
  state.trade = createTradeState();
  state.pendingTrade = null;
  resetPlayMode(state);
  state.status = createPlayerStatus();
  state.injury = createInjuryState();
  resetTickCounter();
  state.unlockedCosmetics = [];
  setUnlockedCosmetics([]);
  // Reset diarrhea illness chain (#133)
  state.diarrhea = createInitialDiarrheaState();
  setDiarrheaOverlay(false);
  // Reset locomotion stuck timers
  resetPlayerMotor();
  // Reset quiz type flags (#109, #110)
  state._woundCareQuiz = false;
  state._hygieneQuiz = false;
  state._insectQuiz = false;
  state._pendingInsectQuiz = false;
  // Keep music settings across new game — just stop playback
  musicStop(state.music);
  // Keep SFX settings across new game — just stop ambience
  stopAmbience(state.sfx);
  // Keep voice settings across new game — just cancel speech
  cancelSpeech(state.voice);
  state.lastChunkX = Math.floor(state.player.x / WORLD_CONFIG.chunkSize);
  state.lastChunkY = Math.floor(state.player.y / WORLD_CONFIG.chunkSize);
  state.playerVariation = createDefaultVariation();
  state.egoImg = loadCharacterSprite(state.playerVariation, 0, false);
  state.lastAnimFrame = -1;
  clearTerrainCache();
  clearObjectCache();
  clearParticles();
  clearWeather();
  clearBubbles();
  clearPendingResolved(); // Clear resolved cells for fresh game (B5.14)
  resetBubbleTriggerState(); // Reset bubble "last seen" state for fresh game (B5.18)
  resetInteractionState();   // Reset dialog + poop-burst flags for fresh game (B5.19)
  deleteSave();
  await ensureChunksAroundYielding(state);
}