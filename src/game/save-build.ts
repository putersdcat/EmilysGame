/**
 * save-build.ts — Serialize game state to a SaveData payload.
 *
 * B5 micro-slice 11.21 (#268): extracted from main.ts. `buildSaveData`
 * is pure data serialization — reads from GameState + a handful of
 * module-level helpers (entropy buffer, fog-of-war, played seconds,
 * touch control mode), and emits a complete SaveData blob.
 * `doSave` is a 2-line wrapper that calls saveGame + marks slots dirty.
 *
 * Sibling to `./game/save-apply.ts` (which handles the inverse
 * direction: SaveData → GameState).
 *
 * Why this lives in `src/game/` (not `src/engine/`):
 *   - High-level orchestration of save-format emission
 *   - Sister to save-apply.ts which already lives here
 *
 * Public API:
 *   - buildSaveData(state) — read state, return SaveData
 *   - doSave(state) — write SaveData to localStorage via saveGame()
 *
 * @see issue #4 — LLM entropy buffer persistence
 * @see issue #92 — Age band persistence
 * @see issue #114 — Fog-of-war visited cells
 * @see issue #127 — Touch control visibility mode
 * @see issue #136 — Cumulative playtime
 * @see issue #144 — Touch control visibility mode
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { type GameState } from './game-state';
import { type SaveData } from './save';
import { getEntropyBuffer } from '../engine/gen';
import { serializeVariation } from '../ui/customizer';
import { getDiscoveredSpeciesArray } from './wildlife';
import { serializeStatus } from './status';
import { serializeInjury } from './injury';
import { serializeMusicSettings } from './audio/music';
import { serializeSfxSettings } from './audio/sfx';
import { serializeVoiceSettings } from './audio/npc-voice';
import { serializeVisited } from '../rendering/fog';
import { getPlayedSeconds } from '../rendering/lighting';
import { collectResolvedCells } from './chunk-lifecycle';
import { saveGame } from './save';
import { markSaveSlotsDirty } from '../ui/ui';

// ─── Public API ──────────────────────────────────────────────

/**
 * Build a complete SaveData payload from the current game state.
 * Called from main.ts's save flow (slot save, auto-save on chunk exit,
 * pause-menu save button) and from the __gameDebug.save() hook.
 */
export function buildSaveData(state: GameState): SaveData {
  return {
    version: 1,
    timestamp: Date.now(),
    player: {
      x: state.player.x,
      y: state.player.y,
      direction: state.player.direction,
    },
    inventory: state.inventory.serialize(),
    visitedChunks: Array.from(state.chunks.keys()),
    resolvedCells: collectResolvedCells(state.chunks),
    quizStats: state.quizStats,
    wordlistSeed: '',
    entropyBuffer: getEntropyBuffer(), // Persist entropy pool (#4)
    selectedSubjects: state.knowledge.selectedSubjects,
    wordBag: state.knowledge.wordBag,
    readArticles: [...state.knowledge.readArticles],
    discoveryPoints: state.knowledge.discoveryPoints,
    playerVariation: serializeVariation(state.playerVariation),
    discoveredWildlife: getDiscoveredSpeciesArray(),
    playerStatus: serializeStatus(state.status),
    injuryState: serializeInjury(state.injury),
    unlockedCosmetics: state.unlockedCosmetics,
    musicSettings: serializeMusicSettings(state.music),
    sfxSettings: serializeSfxSettings(state.sfx),
    voiceSettings: serializeVoiceSettings(state.voice),
    streakHistory: [...state.streak.history],
    visitedFog: serializeVisited(),
    ageBand: state.ageProfile.ageBand ?? undefined,
    playedSeconds: getPlayedSeconds(),
    touchControlMode: localStorage.getItem('emilys_game_touch_vis') ?? 'whisper',
    talkedToNpcs: [...state.talkedToNpcs],
  };
}

/**
 * Serialize current state and persist to localStorage via saveGame().
 * Marks the slot UI as dirty so the save-slot buttons re-render.
 */
export function doSave(state: GameState): void {
  saveGame(buildSaveData(state));
  markSaveSlotsDirty();
}