// filepath: src/game/state-init.ts
// B5 micro-slice 11.38 (#268): state init + save restore extracted from
// main.ts init(). Builds the GameState via createGameState factory, then
// layers save-specific overrides on top (factory stays pure/default-only).
//
// Flow:
//   1. Load save (via loadGame)
//   2. Resolve player variation + start position from save
//   3. createGameState() with all factory creators
//   4. Layer save overrides (direction, quizStats, cosmetics, inventory,
//      knowledge, entropy buffer, music/SFX/voice settings, fog, age band)
//   5. Apply starter items for new games (#109)
//   6. Stash resolved cells for chunk regeneration
//   7. Generate initial chunks
//
// Returns the constructed GameState.
import { PLAYER_CONFIG } from '../config/game.config';
import { characterVariations, loadCharacterSprite } from '../asset-pipeline/sprites';
import { loadGame } from './save';
import { createDefaultVariation, deserializeVariation, setUnlockedCosmetics } from '../ui/customizer';
import { createGameState, type GameState } from './game-state';
import { restoreEntropyBuffer } from '../engine/gen';
import { deserializeMusicSettings } from './audio/music';
import { deserializeSfxSettings } from './audio/sfx';
import { deserializeVoiceSettings } from './audio/npc-voice';
import { deserializeVisited } from '../rendering/fog';
import { setAgeBand } from './age-profile';
import { createInventory } from './inventory';
import { createQuizState } from './quiz';
import { createUIState } from '../ui/ui';
import { createKnowledgeState } from './knowledge';
import { createTradeState } from './trading';
import { createPlayerStatus } from './status';
import { createInjuryState } from './injury';
import { createMusicState } from './audio/music';
import { createSfxState } from './audio/sfx';
import { createVoiceState } from './audio/npc-voice';
import { createStreakState } from './quiz';
import { createAgeProfile } from './age-profile';
import { createInitialDiarrheaState } from './illness';
import { setPendingResolvedCells, ensureChunksAround } from './chunk-lifecycle';
import { isFootprintWalkable, SPAWN_ESCAPE_RISE_PX } from '../engine/mechanics';
import type { AgeBand } from '../types/content-pack.types';
// Save-fidelity parity fix (Docs/VisionAlignmentAudit.md Finding #10):
// these restorations already existed in save-apply.ts's applySaveData
// (used by the manual save-slot-load UI) but were silently missing from
// this file's own inline restore-on-startup path, meaning a normal
// close-and-reopen auto-resume lost wildlife discovery, survival status,
// injury state, quiz streak history, and cumulative playtime -- even
// though all of it was correctly saved and correctly restored via the
// OTHER path.
import { restoreDiscoveredSpecies } from './wildlife';
import { deserializeStatus, resetTickCounter } from './status';
import { deserializeInjury } from './injury';
import { recordQuizResult } from './quiz';
import { setPlayedSeconds } from '../rendering/lighting';

// ─── Starter inventory for new games (#109) ─────────────────
const STARTER_INVENTORY: ReadonlyArray<{ itemId: string; quantity: number }> = [
  { itemId: 'bandage', quantity: 3 },
  { itemId: 'snack', quantity: 2 },
  { itemId: 'water_flask', quantity: 1 },
];

/**
 * Result of building the initial GameState.
 * `hasSaveData` is true iff a saved game was loaded — drives the main
 * menu "Continue" vs "New Game" UX choice.
 */
export interface InitialStateResult {
  state: GameState;
  hasSaveData: boolean;
}

/**
 * Build the full GameState for the current session.
 *
 * Reads the save (if any), creates a fresh GameState via the factory,
 * then layers save-specific overrides on top. For new games (no save),
 * gives the player the starter inventory bundle.
 *
 * Also kicks off the initial chunk generation around the spawn point.
 *
 * **Synchronous** — does not await the LLM wordlist (already swapped
 * in async by bootstrapWordlist).
 */
export function createInitialState(): InitialStateResult {
  // Load char sprite (initial idle)
  // Try loading saved game first to get player variation
  const save = loadGame();
  const playerVariation = save?.playerVariation
    ? deserializeVariation(save.playerVariation)
    : (characterVariations[PLAYER_CONFIG.defaultVariation] ?? createDefaultVariation());
  const egoImg = loadCharacterSprite(playerVariation, 0, false);

  const startX = save?.player.x ?? PLAYER_CONFIG.startPosition.x;
  const startY = save?.player.y ?? PLAYER_CONFIG.startPosition.y;

  // B5 micro-slice 11.4 (#268): state init via createGameState factory.
  // Save-specific fields (direction, quizStats, unlockedCosmetics) are
  // restored after factory returns, keeping the factory pure/default-only.
  const state: GameState = createGameState({
    playerVariation,
    egoImg,
    startX,
    startY,
    quizStats: { answered: 0, correct: 0 },
    unlockedCosmetics: [],
    createInventory,
    createQuizState,
    createUIState,
    createKnowledgeState,
    createTradeState,
    createPlayerStatus,
    createInjuryState,
    createMusicState,
    createSfxState,
    createVoiceState,
    createStreakState,
    createAgeProfile,
    createInitialDiarrheaState,
  });
  // Restore save-specific fields (factory uses defaults; save overrides)
  state.player.direction = save?.player.direction ?? 1;
  state.quizStats = save?.quizStats ?? { answered: 0, correct: 0 };
  state.unlockedCosmetics = save?.unlockedCosmetics ?? [];

  // Sync unlocked cosmetics to customizer
  setUnlockedCosmetics(state.unlockedCosmetics);

  // Restore inventory from save
  if (save?.inventory) {
    for (const slot of save.inventory) {
      state.inventory.addItem(slot.itemId, slot.quantity);
    }
  }

  // Restore knowledge state from save
  if (save) {
    if (save.selectedSubjects) state.knowledge.selectedSubjects = save.selectedSubjects as any;
    if (save.wordBag) state.knowledge.wordBag = save.wordBag;
    if (save.readArticles) state.knowledge.readArticles = new Set(save.readArticles);
    if (save.discoveryPoints) state.knowledge.discoveryPoints = save.discoveryPoints;
    state.knowledge.subjectsChosen = true;
    // Restore entropy buffer from auto-save (#4)
    if (save.entropyBuffer) {
      restoreEntropyBuffer(save.entropyBuffer);
    }
    // Restore music settings (#74)
    if (save.musicSettings) {
      state.music.settings = deserializeMusicSettings(save.musicSettings);
    }
    // Restore SFX settings (#75)
    if (save.sfxSettings) {
      deserializeSfxSettings(state.sfx, save.sfxSettings);
    }
    // Restore voice settings (#76)
    if (save.voiceSettings) {
      deserializeVoiceSettings(state.voice, save.voiceSettings);
    }
    // Restore fog-of-war visited cells (#114)
    if (save.visitedFog) {
      deserializeVisited(save.visitedFog);
    }
    // Restore age band profile (#92)
    if (save.ageBand) {
      setAgeBand(state.ageProfile, save.ageBand as AgeBand);
    }
    // Restore NPC interaction history (Finding #10)
    if (save.talkedToNpcs) state.talkedToNpcs = new Set(save.talkedToNpcs);
    // Restore discovered wildlife (#68) -- previously missing from this
    // path, see the import comment above for why this matters.
    if (save.discoveredWildlife) {
      restoreDiscoveredSpecies(save.discoveredWildlife);
    }
    // Restore survival status (#70) -- previously missing from this path.
    if (save.playerStatus) {
      state.status = deserializeStatus(save.playerStatus);
      resetTickCounter();
    }
    // Restore injury state (#109) -- previously missing from this path.
    if (save.injuryState) {
      state.injury = deserializeInjury(save.injuryState);
    }
    // Restore quiz streak history (#103) -- previously missing from this path.
    if (save.streakHistory) {
      state.streak = createStreakState();
      for (const outcome of save.streakHistory) {
        recordQuizResult(state.streak, outcome);
      }
    }
    // Restore cumulative playtime (#136) -- previously missing from this path.
    if (save.playedSeconds != null) {
      setPlayedSeconds(save.playedSeconds);
    }
    // Restore touch control visibility mode (#144) -- previously missing
    // from this path.
    if (save.touchControlMode) {
      localStorage.setItem('emilys_game_touch_vis', save.touchControlMode);
    }
  }

  // Give starter items for new games (#109)
  if (!save) {
    for (const slot of STARTER_INVENTORY) {
      state.inventory.addItem(slot.itemId, slot.quantity);
    }
  }

  // Prepare resolved cells from save for application during chunk generation
  setPendingResolvedCells(save?.resolvedCells ?? []);

  // Generate initial chunks
  ensureChunksAround(state);

  // Guarantee the player's resolved spawn/resume position is never a
  // softlock (2026-07-09, user-reported live bug with real LLM entropy
  // enabled): unlike a brand-new game (fixed PLAYER_CONFIG.startPosition,
  // safe-zone-cleared for chunk (0,0) by ensureSpawnClearance), a RESUMED
  // save can land anywhere, in any chunk, and chunks are regenerated (not
  // persisted) from the save's seed/entropy state on every load. Real LLM
  // entropy expansion is not perfectly reproducible run-to-run (sampling
  // variance), so the freshly-regenerated chunk around the saved position
  // can differ from what was there when the game was saved -- occasionally
  // dropping an obstacle exactly where the player was standing.
  //
  // Rather than mutating world content (which cell would even be "safe" to
  // force-clear is unknowable here, unlike the fixed chunk-(0,0) case), we
  // let the player stand -- visibly elevated above the obstruction -- and
  // bypass collision until they take a step onto genuinely walkable
  // ground, at which point normal collision resumes immediately. See
  // `handleMovement` in main.ts for the resolution side of this.
  if (!isFootprintWalkable(state.player.x, state.player.y, state.chunks, state.activeConditions)) {
    state.player.spawnEscape = true;
    state.player.sinkDepth = SPAWN_ESCAPE_RISE_PX;
  }

  return { state, hasSaveData: !!save };
}
