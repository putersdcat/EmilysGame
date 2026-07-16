/**
 * save-apply.ts — Restore game state from a SaveData payload.
 *
 * B5 micro-slice 11.15 (#268): extracted from main.ts. The `applySaveData`
 * function is pure orchestration — it sequences calls into already-extracted
 * factory / deserialize / clear functions across ~15 subsystems. No module-
 * level state lives here.
 *
 * Why this lives in `src/game/` (not `src/engine/`):
 *   - It's a high-level orchestration concern (save/load pipeline), not
 *     pure world-layer logic
 *   - `src/game/save.ts` already owns the SaveData type and load/save primitives
 *
 * Touch list (all per-issue):
 *   - #4 LLM entropy buffer
 *   - #66 unlocked cosmetics
 *   - #70 survival status
 *   - #74 music settings
 *   - #75 SFX settings
 *   - #76 voice settings
 *   - #92 age band profile
 *   - #103 streak history
 *   - #109 injury state
 *   - #114 fog-of-war visited cells
 *   - #136 cumulative playtime
 *   - #144 touch control visibility
 *   - Quiz subjects / word bag / discovery points
 *   - Resolved cells (deferred until chunk regeneration)
 *
 * Public API:
 *   - applySaveData(state, data) — restore all subsystems from a SaveData
 *
 * @see issue #17 — Edge contracts / inter-chunk stitching (resolved cells)
 * @see issue #6 — Cross-chunk auto-tile transitions
 * @see issue #46 — Traversal continuity
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { WORLD_CONFIG } from '../config/game.config';
import { restoreEntropyBuffer } from '../engine/gen';
import { loadCharacterSprite } from '../asset-pipeline/sprites';
import { deserializeVariation, setUnlockedCosmetics } from '../ui/customizer';
import { restoreDiscoveredSpecies, clearWildlife } from './wildlife';
import { deserializeStatus, resetTickCounter } from './status';
import { deserializeInjury } from './injury';
import { deserializeMusicSettings } from './audio/music';
import { deserializeSfxSettings } from './audio/sfx';
import { deserializeVoiceSettings } from './audio/npc-voice';
import { createStreakState, recordQuizResult } from './quiz';
import { deserializeVisited } from '../rendering/fog';
import { setAgeBand } from './age-profile';
import { setPlayedSeconds } from '../rendering/lighting';
import { setPendingResolvedCells, ensureChunksAroundYielding } from './chunk-lifecycle';
import { clearTerrainCache } from '../rendering/terrain-cache';
import { clearObjectCache } from '../rendering/render';
import { clearParticles } from '../rendering/particles';
import { clearWeather } from '../rendering/weather';
import { type GameState } from './game-state';
import { type SaveData } from './save';
import { type AgeBand } from '../types/content-pack.types';

// ─── Public API ──────────────────────────────────────────────

/**
 * Restore all game subsystems from a SaveData payload, then regenerate
 * the chunks around the player's restored position with any saved
 * resolved cells re-applied. Called from save-load flows in main.ts.
 *
 * **Async** — uses boot-only `ensureChunksAroundYielding` so bulk gen
 * does not freeze the tab. Callers should show a loading spinner.
 */
export async function applySaveData(state: GameState, data: SaveData): Promise<void> {
  state.player.x = data.player.x;
  state.player.y = data.player.y;
  state.player.direction = data.player.direction;
  state.inventory.deserialize(data.inventory);
  state.quizStats = { ...data.quizStats };
  // Restore knowledge state
  if (data.selectedSubjects) state.knowledge.selectedSubjects = data.selectedSubjects as any;
  if (data.wordBag) state.knowledge.wordBag = data.wordBag;
  if (data.readArticles) state.knowledge.readArticles = new Set(data.readArticles);
  if (data.discoveryPoints) state.knowledge.discoveryPoints = data.discoveryPoints;
  state.knowledge.subjectsChosen = true;
  // Restore entropy buffer (#4)
  if (data.entropyBuffer) {
    restoreEntropyBuffer(data.entropyBuffer);
  }
  // Restore player variation
  if (data.playerVariation) {
    state.playerVariation = deserializeVariation(data.playerVariation);
    state.egoImg = loadCharacterSprite(state.playerVariation, 0, false);
    state.lastAnimFrame = -1; // force sprite reload
  }
  // Restore discovered wildlife
  if (data.discoveredWildlife) {
    restoreDiscoveredSpecies(data.discoveredWildlife);
  }
  // Restore NPC interaction history (WorldEngine-05 SS8.5 gap fix, Finding #10)
  if (data.talkedToNpcs) state.talkedToNpcs = new Set(data.talkedToNpcs);
  // Restore survival status (#70)
  state.status = deserializeStatus(data.playerStatus);
  resetTickCounter();
  // Restore injury state (#109)
  state.injury = deserializeInjury(data.injuryState);
  // Restore unlocked cosmetics (#66)
  state.unlockedCosmetics = data.unlockedCosmetics ?? [];
  setUnlockedCosmetics(state.unlockedCosmetics);
  // Restore music settings (#74)
  state.music.settings = deserializeMusicSettings(data.musicSettings);
  // Restore SFX settings (#75)
  if (data.sfxSettings) deserializeSfxSettings(state.sfx, data.sfxSettings);
  // Restore voice settings (#76)
  if (data.voiceSettings) deserializeVoiceSettings(state.voice, data.voiceSettings);
  // Restore streak history (#103)
  if (data.streakHistory) {
    state.streak = createStreakState();
    for (const outcome of data.streakHistory) {
      recordQuizResult(state.streak, outcome);
    }
  }
  // Restore fog-of-war visited cells (#114)
  if (data.visitedFog) {
    deserializeVisited(data.visitedFog);
  }
  // Restore age band profile (#92)
  if (data.ageBand) {
    setAgeBand(state.ageProfile, data.ageBand as AgeBand);
  }
  // Restore cumulative playtime (#136)
  if (data.playedSeconds != null) {
    setPlayedSeconds(data.playedSeconds);
  }
  // Restore touch control visibility mode (#144)
  if (data.touchControlMode) {
    localStorage.setItem('emilys_game_touch_vis', data.touchControlMode);
  }
  // Force camera + chunk reload
  state.camera.x = data.player.x;
  state.camera.y = data.player.y;
  // Store resolved cells for deferred application after chunk regeneration
  setPendingResolvedCells(data.resolvedCells ?? []);
  // Clear chunks so they regenerate with resolved cells applied
  state.chunks.clear();
  clearTerrainCache();
  clearObjectCache();
  clearParticles();
  clearWeather();
  clearWildlife();
  // Regenerate chunks around new player position (boot-only yielding path)
  state.lastChunkX = Math.floor(data.player.x / WORLD_CONFIG.chunkSize);
  state.lastChunkY = Math.floor(data.player.y / WORLD_CONFIG.chunkSize);
  await ensureChunksAroundYielding(state);
}