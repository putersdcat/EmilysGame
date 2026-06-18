/**
 * debug-api.ts — `window.__gameDebug` surface for E2E tests + dev tools (#268, B5.5).
 *
 * B5 micro-slice 11.5 (#268): extracted from main.ts. The debug API is a
 * flat object of ~100 helpers exposed on `window.__gameDebug` for Playwright
 * tests, the dev console, and the debug HUD. It provides read access to
 * game state, write access to player position + conditions, and trigger
 * access to events (diarrhea, injury flash, barter quiz, etc.).
 *
 * The API is built by `createGameDebug(deps)` which takes a `DebugApiDeps`
 * object containing the state + all helper functions + module-level
 * variables needed. main.ts calls this once and assigns the result.
 *
 * @see issue #268 — B5: Decompose src/main.ts
 * @see AUTONOMOUS_LOOP.md — live Playwright test + visual validation
 */

import { ASSET_DEFS } from '../config/assets.config';
import { BIOME_DEFS } from '../config/biomes.config';
import { type AgeBand } from '../types/content-pack.types';
import { type Iso2AssemblyId } from '../engine/iso2-assemblies';
import { isFootprintWalkable } from '../engine/mechanics';
import { InputManager } from './input';
import { type GameState } from './game-state';
import { DIARRHEA_CONFIG } from './illness';
import { setTimeOfDay, getCycleProgress } from '../rendering/lighting';
import { toggleFlashlight, isFlashlightOn } from '../rendering/local-lights';
import {
  AncientStone, CottageStoneFoundation, Limestone, MudBrick, PlasterWhitewashWall,
  RedClinker, RoughWoodPlankWall, SandstoneBrick,
} from '../asset-pipeline/iso2-materials';
import { clearTerrainCache } from '../rendering/terrain-cache';
import { clearObjectCache, setDialogNpc } from '../rendering/render';
import { stampIso2Assembly } from '../engine/iso2-assemblies';
import { getDebuffs, useStatusItem } from './status';
import {
  getDebuffVisualsState,
  triggerInjuryFlash, getInjuryFlashAlpha,
  setDiarrheaOverlay,
} from '../rendering/debuff-visuals';
import { addToast } from '../ui/ui';
import { checkHazardInjury, applyBandaid, getWoundCareQuestion } from './injury';
// B5 micro-slice 11.8 (#268): quiz-specials content moved here.
import { startHygieneQuiz, startInsectQuiz, getInsectQuestions } from './quiz-specials';
import { chunkKey } from './chunk-lifecycle';
import { getLastDialogNpcId, setPendingPoopBurst } from './interaction-handler';
// (getPendingPoopBurst removed — debug-api only sets the flag, doesn't read it)
import { setUnlockedCosmetics, showCustomizer, deserializeVariation, HAIR_STYLES, EYE_COLORS, ACCESSORIES, OUTFIT_PATTERNS } from '../ui/customizer';
import { getCosmeticById } from '../config/cosmetics.config';
import {
  play as musicPlay, pause as musicPause, stop as musicStop,
  nextTrack, togglePlayPause,
  getCurrentTrackInfo,
} from './audio/music';
import { getPositionalSourceCount, playSfx } from './audio/sfx';
import { toggleVoice, speakLine } from './audio/npc-voice';
import { loadGame } from './save';
import {
  loadCharacterSprite, loadCharacterSpriteAsync,
  generateIdleCharacterSVG, generateSideIdleCharacterSVG, generateSideWalkingCharacterSVG,
  spriteCache, clearVariationCache,
} from '../asset-pipeline/sprites';
import {
  generateNpcSVG, loadNpcSpriteAsync, getNpcSprite, hasNpcSprite, NPC_APPEARANCES,
} from '../asset-pipeline/npc-sprites';
import { getStreakDebugInfo, quizSelectIndex } from './quiz';
import { getWaterDebugInfo } from '../engine/world/Passability';
import { getLockKeyDebugInfo } from '../engine/world/ObstacleSolver';
import { getPlayabilityStats } from '../engine/world/Validation';
import { getChunkClimate, selectBiomeCoherent, deriveMood, detectBiomeTransitions } from '../engine/world/BiomeSelector';
import {
  MICRO_TILE_DEFS, WORLD_UNIT_TEMPLATES, BIOME_PALETTES,
  validateAllTileDefs, validateTemplate, normalizeTileDef,
  isValidAnchorRole, tileMatchesClimate, getTileLOD, tilesAtLOD, getBiomePalette,
  computeTraversalChannels, computeCornerCells, computeChainPorts,
  getAllRotations as getAllTemplateRotations,
} from '../config/tiles.config';
import {
  toggleFog, isFogEnabled, setFogEnabled, getVisitedCount, getFogDebugInfo,
} from '../rendering/fog';
import { getTimeSlot } from './wildlife';
// B5 micro-slice 11.13 (#268): getRevealedCreatures moved to
// ./game/wildlife-render.ts and imported directly here (DI removed).
import { getRevealedCreatures } from './wildlife-render';
import { getBookContentStats, isPackContentLoaded } from '../ui/book-content';
import { toggleBook, openArticle } from './knowledge';
import { getAgeProfileDebug, setAgeBand } from './age-profile';
import { perfStats, getFrameBenchmark, resetFrameHistory } from '../engine/perf';
import { isTeslaMode, setTeslaMode, detectTeslaBrowser } from './platform';
import {
  resetTutorial, initTutorial, dismissTutorial, isTutorialActive, shouldShowTutorial,
} from './tutorial';
import { generateBarterQuiz, syncBarterQuizDOM } from './trading';
import { hasAssetSprite } from '../asset-pipeline/asset-sprites';

// ─── Dependencies ────────────────────────────────────────────

/**
 * Dependencies needed to build the debug API. Includes the game state,
 * input manager, and all module-level variables + helper functions
 * that the debug API needs to read/write.
 */
export interface DebugApiDeps {
  state: GameState;
  input: InputManager;
  /** Helper functions from main.ts */
  doSave: (state: GameState) => void;
  checkCosmeticUnlocks: (state: GameState) => void;
  shouldAutoRead: (state: GameState) => boolean;
}

// ─── Factory ─────────────────────────────────────────────────

/**
 * Build the `__gameDebug` object. Called once from main.ts after
 * state init. The returned object is assigned to `window.__gameDebug`.
 */
export function createGameDebug(deps: DebugApiDeps): Record<string, unknown> {
  const {
    state,
    input,
    doSave,
    checkCosmeticUnlocks,
    shouldAutoRead,
  } = deps;

  return {
    // Time of day
    setTimeOfDay,
    getCycleProgress,
    // Flashlight
    toggleFlashlight,
    isFlashlightOn,
    // State access (read-only for tests)
    state,
    // Render cache invalidation
    invalidateRenderCaches: () => { clearTerrainCache(); clearObjectCache(); },
    // Iso2 assembly stamping
    stampIso2Assembly: (chunkKey: string, id: Iso2AssemblyId, originX: number, originY: number) => {
      const chunk = state.chunks.get(chunkKey);
      if (!chunk) throw new Error(`Chunk not loaded: ${chunkKey}`);
      stampIso2Assembly(chunk, id, originX, originY);
      clearTerrainCache();
      clearObjectCache();
    },
    // Input manager for touch/gamepad testing (#126)
    inputMgr: input,
    // Asset/biome metadata (#58)
    getAssetDefs: () => ASSET_DEFS,
    getBiomeDefs: () => BIOME_DEFS,
    iso2BrickMaterials: { RedClinker, MudBrick, SandstoneBrick },
    iso2StoneMaterials: { AncientStone, Limestone, CottageStoneFoundation },
    iso2HomesteadMaterials: { PlasterWhitewashWall, RoughWoodPlankWall },
    // #223 live gameplay test helpers (per AUTONOMOUS_LOOP.md)
    isFootprintWalkable: (px: number, py: number) => isFootprintWalkable(px, py, state.chunks, state.activeConditions),
    setPlayerPosition: (x: number, y: number) => { state.player.x = x; state.player.y = y; state.player.isMoving = false; },
    setActiveCondition: (id: string, val: 'locked' | 'unlocked') => { state.activeConditions.set(id, val); },
    resolveQuizGateSim: () => { state.activeConditions.set('quiz-gate', 'unlocked'); },
    // Status helpers (#70)
    getDebuffs: () => getDebuffs(state.status),
    getDebuffVisuals: getDebuffVisualsState,
    useStatusItem: (itemId: string) => {
      const result = useStatusItem(state.status, itemId);
      if (result) addToast(state.ui, result, '#88ccff', 2000);
      return result;
    },
    // Injury helpers (#109, #137)
    getInjury: () => state.injury,
    checkHazardInjury: (dmg = 1.0) => checkHazardInjury(state.injury, dmg),
    applyBandaid: () => applyBandaid(state.injury, state.status),
    getWoundCareQuestion,
    // Cosmetic unlock helpers (#66)
    getUnlockedCosmetics: () => state.unlockedCosmetics,
    grantCosmetic: (id: string) => {
      if (!state.unlockedCosmetics.includes(id)) {
        state.unlockedCosmetics.push(id);
        setUnlockedCosmetics(state.unlockedCosmetics);
        const cosmetic = getCosmeticById(id);
        if (cosmetic) addToast(state.ui, `🔓 ${cosmetic.name} unlocked!`, '#ffab40', 3000);
      }
    },
    checkUnlocks: () => checkCosmeticUnlocks(state),
    // Music helpers (#74)
    musicPlay: () => musicPlay(state.music),
    musicPause: () => musicPause(state.music),
    musicStop: () => musicStop(state.music),
    musicNext: () => nextTrack(state.music),
    musicToggle: () => togglePlayPause(state.music),
    getMusicState: () => ({
      playState: state.music.playState,
      track: getCurrentTrackInfo(state.music),
      volume: state.music.settings.volume,
      muted: state.music.settings.muted,
      ducking: state.music.ducking,
    }),
    // SFX helpers (#75, #108)
    playSfx: (id: string) => playSfx(state.sfx, id),
    getSfxState: () => ({
      sfxVolume: state.sfx.settings.sfxVolume,
      ambienceVolume: state.sfx.settings.ambienceVolume,
      sfxMuted: state.sfx.settings.sfxMuted,
      ambienceMuted: state.sfx.settings.ambienceMuted,
      sfxEnabled: state.sfx.settings.sfxEnabled,
      activeAmbience: state.sfx.activeAmbienceId,
      sampledReady: state.sfx.sampledReady,
      positionalSources: getPositionalSourceCount(state.sfx),
    }),
    // Voice helpers (#76)
    getVoiceState: () => ({
      enabled: state.voice.settings.enabled,
      volume: state.voice.settings.volume,
      supported: state.voice.supported,
      speaking: state.voice.speaking,
    }),
    toggleVoice: () => toggleVoice(state.voice),
    speakTest: (text: string) => speakLine(state.voice, text, null),
    // Save/load helpers
    save: () => doSave(state),
    saveGame: () => doSave(state),
    loadGame: () => {
      const saveData = loadGame();
      if (saveData) {
        if (saveData.playerVariation) {
          state.playerVariation = deserializeVariation(saveData.playerVariation);
        }
      }
    },
    // Sprite helpers (#86, #182 limb layering)
    loadCharacterSprite,
    loadCharacterSpriteAsync,
    generateIdleCharacterSVG,
    generateSideIdleCharacterSVG,
    generateSideWalkingCharacterSVG,
    spriteCache,
    clearVariationCache,
    showCustomizer: () => showCustomizer(state.playerVariation),
    // NPC sprite helpers (#85)
    generateNpcSVG,
    loadNpcSpriteAsync,
    getNpcSprite,
    hasNpcSprite,
    NPC_APPEARANCES,
    // NPC mouth animation (#113)
    setDialogNpc,
    getDialogState: () => ({
      active: state.ui.dialog.active,
      npcName: state.ui.dialog.npcName,
      currentLine: state.ui.dialog.currentLine,
      lastDialogNpcId: getLastDialogNpcId(),
    }),
    // Quiz streak helpers (#103)
    getStreakDebug: () => getStreakDebugInfo(state.streak),
    getStreakState: () => state.streak,
    // Water/bridge debug (#100)
    getWaterDebug: () => getWaterDebugInfo(),
    // Lock-Key DAG debug (#98)
    getLockKeyDAG: () => getLockKeyDebugInfo(),
    // Tile metadata v2 (#101)
    getTileConfig: () => ({
      MICRO_TILE_DEFS,
      WORLD_UNIT_TEMPLATES,
      BIOME_PALETTES,
    }),
    validateAllTileDefs,
    validateTemplate,
    normalizeTileDef,
    isValidAnchorRole,
    tileMatchesClimate,
    getTileLOD,
    tilesAtLOD,
    getBiomePalette,
    // Edge contract v2 (#42)
    computeTraversalChannels,
    computeCornerCells,
    computeChainPorts,
    getAllTemplateRotations,
    getChunkClimate,
    // Fog-of-war debug (#114)
    toggleFog,
    isFogEnabled,
    setFogEnabled,
    getVisitedCount,
    getFogDebug: getFogDebugInfo,
    getTimeSlot,
    // Night mode debug (#114)
    getRevealedCreatures: () => getRevealedCreatures().size,
    // Book/Knowledge debug (#118, #120)
    getKnowledgeState: () => state.knowledge,
    openBookArticle: (id: string) => openArticle(state.knowledge, id),
    toggleBook: () => {
      toggleBook(state.knowledge);
      state.paused = state.knowledge.bookOpen;
    },
    getBookContentStats,
    isPackContentLoaded,
    // Age profile debug (#92)
    getAgeProfile: () => state.ageProfile,
    getAgeProfileDebug: () => getAgeProfileDebug(state.ageProfile),
    setAgeBand: (band: AgeBand) => setAgeBand(state.ageProfile, band),
    // Quiz accessibility debug (#94)
    quizRepeatRead: () => {
      if (state.quiz.active && state.quiz.displayText) {
        speakLine(state.voice, state.quiz.displayText, null);
      }
    },
    shouldAutoRead: () => shouldAutoRead(state),
    quizSelectIndex: (idx: number) => quizSelectIndex(state.quiz, idx),
    // Outhouse/hygiene debug (#110)
    startHygieneQuiz: () => startHygieneQuiz(state),
    getHygieneQuizActive: () => state._hygieneQuiz === true,
    // Stream/worm debug (#110 Phase 3, #133 illness chain)
    getInsectQuestions: () => getInsectQuestions(),
    startInsectQuiz: () => startInsectQuiz(state),
    getStreamDrinkCount: () => state.diarrhea.streamDrinkCount,
    getDiarrheaActive: () => state.diarrhea.diarrheaUntil > state.frameCount,
    getDiarrheaLocked: () => state.diarrhea.diarrheaLocked,
    getDiarrheaState: () => ({
      streamDrinkCount: state.diarrhea.streamDrinkCount,
      diarrheaUntil: state.diarrhea.diarrheaUntil,
      diarrheaLocked: state.diarrhea.diarrheaLocked,
      diarrheaLockUntil: state.diarrhea.diarrheaLockUntil,
      diarrheaLastTrigger: state.diarrhea.diarrheaLastTrigger,
      poopMarkerCount: state.diarrhea.poopMarkers.length,
      frameCount: state.frameCount,
    }),
    // Force-trigger diarrhea event for testing (#133)
    triggerDiarrhea: () => {
      state.diarrhea.diarrheaLocked = true;
      state.diarrhea.diarrheaLockUntil = state.frameCount + DIARRHEA_CONFIG.LOCK_DURATION_FRAMES;
      state.diarrhea.diarrheaUntil = state.frameCount + DIARRHEA_CONFIG.LOCK_DURATION_FRAMES + DIARRHEA_CONFIG.DEBUFF_DURATION_FRAMES;
      state.diarrhea.diarrheaLastTrigger = state.frameCount;
      state.diarrhea.poopMarkers.push({ x: Math.round(state.player.x), y: Math.round(state.player.y), placedAt: state.frameCount });
      setPendingPoopBurst(true);
      setDiarrheaOverlay(true);
      playSfx(state.sfx, 'diarrhea_gurgle');
      addToast(state.ui, '🤢 Oh no! Stomach emergency... can\'t move!', '#ff4444', 4000);
    },
    // Injury flash debug (#109 Phase 3)
    triggerInjuryFlash,
    getInjuryFlashAlpha,
    // Customizer debug (#116)
    getHairStyles: () => HAIR_STYLES,
    getEyeColors: () => EYE_COLORS,
    getAccessories: () => ACCESSORIES,
    getOutfitPatterns: () => OUTFIT_PATTERNS,
    // Barter quiz debug (#112 Phase 3)
    getBarterStats: () => ({ quizCount: state.trade.barterQuizCount, correctCount: state.trade.barterCorrectCount }),
    triggerBarterQuiz: (itemName: string, price: number) => {
      state.trade.barterQuiz = generateBarterQuiz(itemName, price);
      state.trade.barterSelectedIndex = 0;
      syncBarterQuizDOM(state.trade);
    },
    getBarterQuiz: () => state.trade.barterQuiz,
    // Asset sprite debug (#115)
    hasAssetSprite,
    getAssetSpriteKeys: () => [
      'tree', 'tree_pine', 'tree_palm', 'rock', 'bonfire', 'campfire', 'biomass_fire',
      'flower', 'flower_pink', 'flower_red', 'sunflower', 'tulip', 'bush', 'mushroom',
      'stump', 'cactus', 'wheat', 'seedling', 'clover', 'wilted_flower', 'maple_leaf', 'tall_plant',
      'coin', 'key', 'crowbar', 'potion',
      'chest', 'sign', 'house', 'hut', 'shop', 'shop_general', 'shop_snack', 'shop_trading',
      'outhouse', 'wall', 'door_locked', 'door_open', 'fence', 'quiz_gate', 'toll_gate',
      'barricade', 'sparkle', 'bridge',
      'chicken', 'rooster', 'pig', 'cow', 'sheep', 'goat', 'rabbit', 'duck', 'fox', 'deer', 'horse', 'dog',
    ],
    // Mood + biome transitions debug (#46)
    deriveMood,
    detectBiomeTransitions,
    // #175: Biome selection with entropy bias
    selectBiomeCoherent,
    getChunkMood: (cx: number, cy: number) => {
      const key = chunkKey(cx, cy);
      return state.chunks.get(key)?.mood ?? null;
    },
    getChunkTransitions: (cx: number, cy: number) => {
      const key = chunkKey(cx, cy);
      return state.chunks.get(key)?.biomeTransitions ?? null;
    },
    // #175: Get all generated chunks for inspection
    getChunks: () => Array.from(state.chunks.entries()).map(([k, c]) => ({
      key: k, chunkX: c.chunkX, chunkY: c.chunkY,
      biomeId: c.biomeId, biomeName: c.biomeName,
    })),
    // Playability validation debug (#46 Solver F)
    getPlayabilityStats,
    // #183: Performance benchmarking
    getPerfStats: () => ({ ...perfStats }),
    getFrameBenchmark,
    resetFrameHistory,
    // #185: Tesla mode
    isTeslaMode,
    setTeslaMode,
    detectTeslaBrowser,
    applyTeslaMode: (active: boolean) => {
      const badge = document.getElementById('teslaBadge');
      if (badge) badge.classList.toggle('active', active);
      if (active && input && !input.touchEnabled) {
        input.enableTouchControls();
      }
    },
    // #186: Tutorial
    resetTutorial,
    initTutorial,
    dismissTutorial,
    isTutorialActive,
    shouldShowTutorial,
  };
}
