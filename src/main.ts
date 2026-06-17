/**
 * main.ts - Game loop, initialization, and system integration.
 * Ties together: world gen, rendering, input, mechanics, quiz, inventory, UI.
 * TODO: DOC - game loop sequence diagram
 */

import { WORLD_CONFIG, PLAYER_CONFIG, RENDER_CONFIG, getDifficulty } from './config/game.config';
import { perfStats, perfSmooth, recordFrameTime } from './engine/perf';
import { getBiome } from './config/biomes.config';
import { ASSET_DEFS } from './config/assets.config';
import { IsometricRenderer, setDialogNpc } from './rendering/render';
import { InputManager, type TouchControlMode } from './game/input';
import { shouldAutoShowTouchOverlay, isTeslaMode, setTeslaMode, detectTeslaBrowser } from './game/platform';
import { initTutorial, isTutorialActive, tickTutorial, shouldShowTutorial, resetTutorial } from './game/tutorial';
import { characterVariations, loadCharacterSprite, clearVariationCache, type FacingPose } from './asset-pipeline/sprites';
import { setWordlist, setBiomeNoiseSeed, feedEntropy, getEntropyBuffer, restoreEntropyBuffer } from './engine/gen';
import { generateWordlist, checkLlmHealth, isTestMode } from './engine/llm';
import { getScrambledWordlist } from './config/wordlists.asset';
import { isFootprintWalkable, interact, autoCollect, resolveQuizGate, getCellAt, type InteractionResult } from './engine/mechanics';
import { createInventory } from './game/inventory';
import { createQuizState, startQuiz, quizNavigate, quizSubmit, quizClose, quizReward, quizSelectIndex, getDifficultyForPosition, blendDifficulty, createStreakState, recordQuizResult, modulateDifficulty } from './game/quiz';
import { createUIState, addToast, showDialog, advanceDialog, closeDialog, renderUI, wireHudButtons, markSaveSlotsDirty, syncStatusBars, syncMusicUI, syncSfxUI, syncVoiceUI } from './ui/ui';
import { saveGame, loadGame, saveToSlot, loadFromSlot, deleteSlot, deleteSave, type SaveData } from './game/save';
// B5 micro-slice 11.10 (#268): showMainMenu extracted to ./game/main-menu.ts.
// The Options callback is wired here so this module stays decoupled.
import { showMainMenu } from './game/main-menu';
// B5 micro-slice 11.11 (#268): showPauseMenu extracted to ./game/pause-menu.ts
// with dependency-inversion for save/options/bug-report/main-menu actions.
import { showPauseMenu } from './game/pause-menu';
// B5 micro-slice 11.12 (#268): showAgeSelection extracted to
// ./game/age-selection.ts. Pure DOM overlay with no main.ts callbacks.
import { showAgeSelection } from './game/age-selection';
// B5 micro-slice 11.13 (#268): renderWildlife + the _revealedCreatures /
// _eyeBlinkTimer / _eyeSwayPhase module-level state extracted to
// ./game/wildlife-render.ts. getRevealedCreatures() lives there too
// and is imported directly by debug-api.ts (no DI needed).
import { renderWildlife } from './game/wildlife-render';
import { getNpcPersona, getShopPersona } from './config/npc.config';
import { preloadTiles } from './rendering/tiles';
import { MICRO_TILE_DEFS } from './config/tiles.config';
import { initWasmRenderer, isWasmReady, wasmBenchmark, updateWasmConfig } from './rendering/wasm-bridge';
import { clearTerrainCache, tickWaterAnimation, evictDistantChunks, getBlendIntensity, setBlendIntensity } from './rendering/terrain-cache';
import { clearObjectCache } from './rendering/render';
import { preloadEmojiSprites } from './asset-pipeline/emoji-cache';
import { preloadAssetSprites } from './asset-pipeline/asset-sprites';
import { preloadNpcSprites } from './asset-pipeline/npc-sprites';
import { initMinimap, renderMinimap } from './rendering/minimap';

import { searchBookArticles, initBookContent, getBookContentStats } from './ui/book-content';
import { createKnowledgeState, syncBookUI, showSubjectSelection, getQuizBias, openArticle, toggleBook } from './game/knowledge';
import { createAgeProfile, setAgeBand } from './game/age-profile';
import { showCustomizer, createDefaultVariation, serializeVariation, deserializeVariation, setUnlockedCosmetics } from './ui/customizer';
import { getCosmeticById } from './config/cosmetics.config';
import type { AgeBand } from './types/content-pack.types';
import { checkAllUnlocks, type ProgressionData } from './config/cosmetics.config';
import { updateAndRenderParticles, clearParticles } from './rendering/particles';
import { tickLighting, setTimeOfDay, getCycleProgress, getTimeOfDay, getPlayedSeconds, setPlayedSeconds } from './rendering/lighting';
import { updateAndRenderWeather, setWeather, getWeatherInfo, clearWeather, didLightningStrike } from './rendering/weather';
import { clearLights, addPointLight, addFlashlight, renderLocalLights, toggleFlashlight, isFlashlightOn } from './rendering/local-lights';
import { FIRE_VARIANTS, FIRE_ASSET_KEYS } from './config/fire.config';
import { invalidateShadowCache } from './rendering/shadows';
import { updateFog, renderFog, isFogEnabled, setFogEnabled, serializeVisited, deserializeVisited } from './rendering/fog';
import {
  updateWildlife, getVisibleWildlife, interactWithWildlife,
  clearWildlife, getDiscoveredSpeciesArray, restoreDiscoveredSpecies, getWildlifeStats,
} from './game/wildlife';
// B5 micro-slice 11.13 (#268): getAnimationOffset, getTimeSlot, getSpecies,
// getEmojiSprite, and the _revealedCreatures state moved to
// ./game/wildlife-render.ts (only used inside renderWildlife).

import {
  triggerHint, tickBubbles, updateBubblePosition, dismissBubble,
  clearBubbles, getBubbleState, resetCooldowns,
  getMessageHistory, toggleHistoryPanel,
} from './ui/thought-bubbles';
import { HINTS } from './config/hints.config';
import {
  createTradeState, openTrade, closeTrade, tradeNavigate,
  executeTrade, executeSell, toggleTradeMode, getSellPrice, getSellableItems,
  syncTradeDOM,
  generateBarterQuiz, shouldTriggerBarter, barterNavigate, submitBarterAnswer,
  syncBarterQuizDOM, getTradeDialog,
} from './game/trading';
import {
  createPlayerStatus, tickStatus, getDebuffs, useStatusItem, applyStatusEffect,
  serializeStatus, deserializeStatus, resetTickCounter,
  CRITICAL_THRESHOLD,
} from './game/status';
import {
  initDebuffVisuals, updateBlurOverlay, updateFlies, renderFlies,
  triggerInjuryFlash, updateInjuryFlash,
  setDiarrheaOverlay, updateDiarrheaOverlay,
  spawnPoopBurst, updateAndRenderPoopParticles, renderPoopMarkers,
} from './rendering/debuff-visuals';
import {
  createInjuryState, checkHazardInjury, applyBandaid, applyWoundQuizBonus,
  getWoundCareQuestion, startWoundCareQuiz, getInjurySpeedMult, serializeInjury, deserializeInjury,
} from './game/injury';
// B5 micro-slice 11.8 (#268): inline HYGIENE_QUESTIONS / INSECT_QUESTIONS +
// _startHygieneQuiz / _startInsectQuiz extracted from main.ts to
// ./game/quiz-specials.ts. startWoundCareQuiz now lives in ./game/injury.ts
// next to its WOUND_CARE_QUESTIONS data + getWoundCareQuestion shuffler.
import { startHygieneQuiz, startInsectQuiz } from './game/quiz-specials';
// B5 micro-slice 11.14 (#268): 6 chunk-lifecycle functions + _pendingResolved
// module-level state extracted from main.ts to ./game/chunk-lifecycle.ts.
// Maintained as a thin wrapper in main.ts (see maybeLoadChunks) because it
// chains eviction + auto-save on chunk exit.
import {
  loadChunksOnBoundaryCross,
  ensureChunksAround,
  setPendingResolvedCells,
  collectResolvedCells,
  clearPendingResolved,
} from './game/chunk-lifecycle';
import {
  createMusicState, play as musicPlay, stop as musicStop,
  startDucking, stopDucking, setBiome as musicSetBiome,
  serializeMusicSettings, deserializeMusicSettings,
  initMidiTracks, getTotalTrackCount, updateMidiProgress,
} from './game/audio/music';
import {
  createSfxState, playSfx, stopAmbience,
  serializeSfxSettings, deserializeSfxSettings,
  initSampledSfxPipeline, updateListenerPosition,
  playFootstep, resetFootstepCounter,
  updateAmbienceEnhanced, tickAnimalCalls, playRoosterCrow,
} from './game/audio/sfx';
// B5 micro-slice 11.9 (#268): positional-audio data + scanner extracted
// from main.ts to ./game/audio/positional-sources.ts. playPositionalSfx
// also moved there (used internally by scanPositionalAudioSources).
import { scanPositionalAudioSources } from './game/audio/positional-sources';
import {
  createVoiceState, speakLine, cancelSpeech,
  serializeVoiceSettings, deserializeVoiceSettings,
} from './game/audio/npc-voice';
// B5 micro-slice 11.1 (#268): extra key queue extracted to
// ./game/input-extra-keys.ts (quiz accessibility, #94).
import {
  setupExtraKeyCapture as _setupExtraKeyCapture,
  consumeExtraKey as _consumeExtraKey,
  clearExtraKeys as _clearExtraKeys,
} from './game/input-extra-keys';
// B5 micro-slice 11.2 (#268): diarrhea illness config + state factory
// extracted to ./game/illness.ts. State init uses createInitialDiarrheaState.
import {
  DIARRHEA_CONFIG,
  createInitialDiarrheaState,
} from './game/illness';
// B5 micro-slice 11.3 (#268): transient expression system extracted to
// circular dependency with main.ts GameState definition.
import {
  setTransientExpression,
  tickExpressionOverride,
} from './game/expression';
// B5 micro-slice 11.4 (#268): GameState interface + createGameState factory
// extracted to ./game/game-state.ts. init() uses the factory instead of
// the inline 50-line object literal.
import {
  createGameState,
  type GameState,
} from './game/game-state';
// B5 micro-slice 11.5 (#268): __gameDebug surface extracted to
// ./game/debug-api.ts. main() calls createGameDebug() once and assigns
// the result to window.__gameDebug.
import { createGameDebug } from './game/debug-api';
// B5 micro-slice 11.6 (#268): HUD DOM event wiring extracted to
// ./game/dom-wiring.ts. main() calls wireHudEvents() once after state init.
import { wireHudEvents } from './game/dom-wiring';

// ─── Game State ──────────────────────────────────────────────
// GameState interface and createGameState factory are in ./game/game-state.ts
// (B5 micro-slice 11.4 / #268). The interface was previously inline here;
// main.ts now imports the type and calls the factory.

// Track NPC id for voice lines during dialog (#76)
let _lastDialogNpcId: string | null = null;

// ─── Diarrhea Illness Config (#133) ─────────────────────────
// B5 micro-slice 11.2 (#268): DIARRHEA_CONFIG moved to ./game/illness.ts.
// Imported above. State is accessed via state.diarrhea.*

// ─── Transient Expression System (#102) ─────────────────────
// B5 micro-slice 11.3 (#268): setTransientExpression + tickExpressionOverride
// moved to ./game/expression.ts. Imported above.

// ─── Wound-Care / Hygiene / Insect Quizzes (#109, #110) ──────
// B5 micro-slice 11.8 (#268): inline data + start functions extracted
// to ./game/quiz-specials.ts (hygiene + insect) and ./game/injury.ts
// (wound care). Imported at the top of this file. Each module co-locates
// its question pool, Fisher-Yates shuffler, and startQuiz(state) helper.

// ─── Chunk Lifecycle ──────────────────────────────────────────
// B5 micro-slice 11.14 (#268): 6 chunk-lifecycle functions + the
// _pendingResolved module-level state extracted to
// ./game/chunk-lifecycle.ts. Thin wrapper `maybeLoadChunks` stays here
// because it also drives terrain eviction + auto-save (doSave lives in
// this file), chained off the boundary-cross boolean returned by
// `loadChunksOnBoundaryCross`.

// ─── Positional Audio Source Scanner (#108) ─────────────────
// B5 micro-slice 11.9 (#268): scanPositionalAudioSources + the
// POSITIONAL_AUDIO_ASSETS registry moved to ./game/audio/positional-sources.ts.
// Imported above. Call once per frame from update().

/** Thin wrapper: boundary-cross chunk load + terrain eviction + auto-save. */
function maybeLoadChunks(state: GameState): void {
  if (!loadChunksOnBoundaryCross(state)) return;
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  // Evict distant terrain caches to stay under memory budget (#47)
  evictDistantChunks(pcx, pcy, 3);
  // Auto-save on chunk exit
  doSave(state);
}

// ─── LLM Connection Gate ─────────────────────────────────────

/** Show splash and poll LLM until connected. Skips in test mode. Returns only when healthy or skipped. */
async function waitForLlm(): Promise<void> {
  const splash = document.getElementById('llmSplash');

  // In test mode, skip LLM gate entirely (#26)
  if (isTestMode()) {
    console.log('[LLM] Test mode: skipping LLM health gate');
    if (splash) splash.style.display = 'none';
    return;
  }

  const statusEl = document.getElementById('llmStatus');
  const skipBtn = document.getElementById('btnSkipLlm');
  if (!splash || !statusEl) return; // Fallback: skip if no splash DOM

  splash.style.display = 'flex';

  // Allow dev skip
  let skipped = false;
  if (skipBtn) {
    skipBtn.onclick = () => { skipped = true; };
  }

  let attempt = 0;
  while (true) {
    attempt++;
    statusEl.textContent = `Connecting to LLM... (attempt ${attempt})`;
    const ok = await checkLlmHealth();
    if (ok || skipped) {
      statusEl.textContent = ok ? 'LLM connected! Starting game...' : 'Skipping LLM (dev mode)...';
      await new Promise((r) => setTimeout(r, 400));
      splash.style.display = 'none';
      return;
    }
    // Wait 2s before retry
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ─── Initialization ──────────────────────────────────────────

async function init(): Promise<{ state: GameState; renderer: IsometricRenderer; input: InputManager; hasSaveData: boolean }> {
  // --- LLM gate: must be connected before proceeding ---
  await waitForLlm();

  // Canvas setup
  const container = document.getElementById('gameContainer');
  if (!container) throw new Error('Game container not found');

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const renderer = new IsometricRenderer(canvas);

  // Responsive canvas: fill viewport, render at scaled resolution
  const resizeCanvas = () => {
    const container = document.getElementById('gameContainer');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const scale = RENDER_CONFIG.renderScale;
    const rw = Math.round(w * scale);
    const rh = Math.round(h * scale);
    if (rw > 0 && rh > 0 && (rw !== canvas.width || rh !== canvas.height)) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.imageRendering = 'pixelated';
      canvas.width = rw;
      canvas.height = rh;
      RENDER_CONFIG.canvasWidth = rw;
      RENDER_CONFIG.canvasHeight = rh;
      updateWasmConfig(rw, rh);
      clearTerrainCache(); // terrain cache depends on viewport
      clearObjectCache(); // object cell cache depends on chunk rendering
    }
  };
  window.addEventListener('resize', resizeCanvas);
  // Also resize when sidebar toggles
  const sidebarToggle = document.getElementById('sidebarToggle');
  sidebarToggle?.addEventListener('click', () => {
    setTimeout(resizeCanvas, 300); // after CSS transition
  });
  resizeCanvas();

  const input = new InputManager();

  // Start with scrambled bundled wordlist immediately, swap in LLM wordlist when ready.
  // In test mode: never call LLM; use scrambled bundled list for deterministic variance.
  // In normal mode: generateWordlist() checks sessionStorage cache first, only calls
  // LLM if no cache exists. Result is cached for future startups. (#26)
  if (isTestMode()) {
    setWordlist(getScrambledWordlist());
    setBiomeNoiseSeed(12345); // Deterministic biome map for tests
    console.log('[INIT] Test mode: using scrambled bundled wordlist (no LLM)');
  } else {
    setWordlist(getScrambledWordlist()); // Immediate non-blocking fallback
    setBiomeNoiseSeed(Date.now()); // Session-unique biome regions
    generateWordlist().then((wl) => {
      setWordlist(wl);
      console.log('[INIT] LLM wordlist ready');
    });
  }

  // NOTE: cleanupLlmSessions() available but not auto-called —
  // BitNet server lacks /v1/sessions endpoint. Call manually if needed.

  // Preload SVG tile sprites (async, must complete before rendering)
  await preloadTiles();

  // Pre-render emoji sprites → eliminates per-frame ctx.filter + fillText
  preloadEmojiSprites();

  // Pre-render SVG asset sprites for trees, rocks, fire (#115)
  await preloadAssetSprites();

  // Preload NPC paper-cut sprites (#85)
  preloadNpcSprites();

  // Initialize minimap canvas
  initMinimap();

  // Initialize debuff visual effects (#110)
  initDebuffVisuals();

  // Load content packs for Book of Knowledge (#120)
  await initBookContent();
  const contentStats = getBookContentStats();
  console.log(`[INIT] Book content: ${contentStats.totalArticles} articles (${contentStats.packArticles} from pack, ${contentStats.staticArticles} static)`);

  // Load WASM rendering core (non-blocking; falls back to JS if unavailable)
  const wasmOk = await initWasmRenderer();
  if (wasmOk) {
    console.log('[INIT] WASM rendering core loaded');
    // Run benchmark on first load
    wasmBenchmark();
  } else {
    console.log('[INIT] WASM unavailable, using JS renderer');
  }

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
  }

  // Give starter items for new games (#109)
  if (!save) {
    state.inventory.addItem('bandage', 3);
    state.inventory.addItem('snack', 2);
    state.inventory.addItem('water_flask', 1);
  }

  // Prepare resolved cells from save for application during chunk generation
  setPendingResolvedCells(save?.resolvedCells ?? []);

  // Generate initial chunks
  ensureChunksAround(state);

  // Expose state for debugging / E2E tests
  (window as any).__gameState = state;
  // Expose wildlife + lighting module functions for E2E tests (#68)
  (window as any).__wildlife = {
    getVisibleWildlife,
    interactWithWildlife,
    clearWildlife,
    getDiscoveredSpeciesArray,
    restoreDiscoveredSpecies,
    updateWildlife,
    getWildlifeStats,
  };
  (window as any).__lighting = { setTimeOfDay, getCycleProgress, getTimeOfDay, getPlayedSeconds };
  // Expose thought bubble functions for E2E tests (#71, #111)
  (window as any).__bubbles = {
    triggerHint, tickBubbles, dismissBubble, clearBubbles,
    getBubbleState, resetCooldowns, updateBubblePosition,
    getMessageHistory, toggleHistoryPanel,
    HINTS,
  };
  // Expose trade functions for E2E tests (#72, #112)
  (window as any).__trade = {
    openTrade, closeTrade, tradeNavigate, executeTrade, syncTradeDOM,
    createTradeState, toggleTradeMode, executeSell, getSellPrice, getSellableItems,
    getShopPersona, // #112 themed shop persona lookup
  };

  return { state, renderer, input, hasSaveData: !!save };
}

// ─── Quiz Accessibility Helpers (#94) ────────────────────────

/** Should auto-read be enabled based on player's age band? */
function _shouldAutoRead(state: GameState): boolean {
  const band = state.ageProfile.ageBand;
  // Auto-read for young bands (5-7 always, 8-10 if voice enabled)
  if (band === '5-7') return true;
  if (band === '8-10' && state.voice.settings.enabled) return true;
  return false;
}

/** Auto-read the current quiz question aloud via TTS (#94) */
function _autoReadQuizQuestion(state: GameState): void {
  if (!_shouldAutoRead(state)) return;
  if (!state.quiz.active || !state.quiz.displayText) return;
  // Small delay so quiz overlay renders first
  setTimeout(() => {
    if (state.quiz.active) {
      speakLine(state.voice, state.quiz.displayText, null);
    }
  }, 300);
}

// ─── Update ──────────────────────────────────────────────────

function update(state: GameState, input: InputManager): void {
  // Poll gamepad state each frame (#124)
  input.pollGamepad();

  // FPS tracking
  state.fpsCounter++;
  const now = performance.now();
  if (now - state.lastFpsTime >= 1000) {
    state.fps = state.fpsCounter;
    state.fpsCounter = 0;
    state.lastFpsTime = now;
  }

  state.frameCount++;

  // Edge-detected keys for single-fire actions
  const justKeys = input.justPressed();

  // --- Book of Knowledge open: absorb input, skip game logic ---
  if (state.knowledge.bookOpen) {
    input.endFrame();
    return;
  }

  // --- Quiz Input (edge-detected) ---
  if (state.quiz.active) {
    if (justKeys.up) { quizNavigate(state.quiz, -1); playSfx(state.sfx, 'menu_navigate'); }
    if (justKeys.down) { quizNavigate(state.quiz, 1); playSfx(state.sfx, 'menu_navigate'); }

    // ── Numeric keys 1-9 select quiz choice directly (#94) ──
    for (let n = 1; n <= 9; n++) {
      if (_consumeExtraKey(String(n))) {
        if (state.quiz.result === 'pending') {
          if (quizSelectIndex(state.quiz, n - 1)) {
            playSfx(state.sfx, 'menu_navigate');
          }
        }
      }
    }

    // ── R key repeats question readout (#94) ──
    if (_consumeExtraKey('r')) {
      if (state.quiz.displayText && state.voice.settings.enabled) {
        speakLine(state.voice, state.quiz.displayText, null);
      }
    }

    if (justKeys.interact) {
      if (state.quiz.result !== 'pending') {
        if (state.quiz.result === 'correct') {
          const rewards = quizReward(state.quiz.difficulty);
          for (const r of rewards) state.inventory.addItem(r.itemId, r.qty);
          addToast(state.ui, `Quiz reward! +${rewards.map((r) => `${r.qty} ${r.itemId}`).join(', ')}`, '#4caf50');
          state.quizStats.correct++;
          playSfx(state.sfx, 'quiz_correct');
          // Transient expression: happy for 2s (#102)
          setTransientExpression(state, 'happy', 2000);
          checkCosmeticUnlocks(state);

          // Wound-care quiz bonus heal (#109)
          if (state._woundCareQuiz) {
            applyWoundQuizBonus(state.status);
            addToast(state.ui, '🩹 Bonus heal! You know first aid!', '#88ccff', 2500);
            state._woundCareQuiz = false;
          }

          // Hygiene quiz bonus — full cleanliness restore (#110)
          if (state._hygieneQuiz) {
            state.status.cleanliness = 100;
            addToast(state.ui, '🚽 Sparkling clean! Full cleanliness restored!', '#4caf50', 2500);
            playSfx(state.sfx, 'outhouse_clean');
            state._hygieneQuiz = false;
          }

          // Insect safety quiz bonus — extra energy (#110 Phase 3)
          if (state._insectQuiz) {
            state.status.energy = Math.min(100, state.status.energy + 10);
            addToast(state.ui, '🐛 Bonus energy! You know about food safety! +10', '#8bc34a', 2500);
            state._insectQuiz = false;
          }

          // Resolve quiz gate if this quiz was gate-triggered (Doc 05 §3.5)
          if (state.pendingGateQuiz) {
            const g = state.pendingGateQuiz;
            resolveQuizGate(g.chunkKey, g.lx, g.ly, state.chunks);
            // iso2: unlock cond so isPointWalkableInTile / buildWalkableMap see passable (supports cond path + morph to door_open)
            state.activeConditions.set('quiz-gate', 'unlocked');
            state.pendingGateQuiz = null;
            addToast(state.ui, '🚪 The gate opens!', '#64b5f6');
            playSfx(state.sfx, 'gate_open');
          }
        } else if (state.quiz.result === 'wrong' && state.pendingGateQuiz) {
          // Wrong answer — gate stays closed
          state.pendingGateQuiz = null;
          addToast(state.ui, '🚫 The gate remains shut. Try again!', '#f44336');
          playSfx(state.sfx, 'quiz_wrong');
          setTransientExpression(state, 'surprised', 1500);
        } else if (state.quiz.result === 'wrong') {
          playSfx(state.sfx, 'quiz_wrong');
          setTransientExpression(state, 'surprised', 1500);
          state._woundCareQuiz = false; // Clear wound-care flag (#109)
          state._hygieneQuiz = false; // Clear hygiene flag (#110)
          state._insectQuiz = false; // Clear insect flag (#110 P3)
        } else if (state.quiz.result === 'idk') {
          state._woundCareQuiz = false; // Clear wound-care flag (#109)
          state._hygieneQuiz = false; // Clear hygiene flag (#110)
          state._insectQuiz = false; // Clear insect flag (#110 P3)
          // "I don't know" → open Book to related article
          const category = state.quiz.question?.category || '';
          const questionText = state.quiz.question?.question || '';
          // Search for articles related to the quiz category or question
          const related = searchBookArticles(category) || searchBookArticles(questionText);
          if (related.length > 0) {
            openArticle(state.knowledge, related[0].id);
            state.knowledge.bookOpen = true;
            state.knowledge.activeTab = 'browse';
            addToast(state.ui, '📖 Check the Book of Knowledge for help!', '#ce93d8', 3000);
          } else {
            state.knowledge.bookOpen = true;
            state.knowledge.activeTab = 'browse';
            addToast(state.ui, '📖 Browse articles for clues!', '#ce93d8', 3000);
          }
          // Don't count "I don't know" as answered
          // Clear pending gate quiz on "I don't know" too
          state.pendingGateQuiz = null;
        }
        if (state.quiz.result !== 'idk') {
          state.quizStats.answered++;
        }
        quizClose(state.quiz);
        // After quiz, open trade panel if NPC had trades, otherwise unpause
        if (state.pendingTrade && !state.knowledge.bookOpen) {
          const tradePersona = getNpcPersona(state.pendingTrade);
          state.pendingTrade = null;
          if (tradePersona && openTrade(state.trade, tradePersona)) {
            state.paused = true;
          } else {
            state.paused = state.knowledge.bookOpen;
          }
        } else {
          state.paused = state.knowledge.bookOpen;
        }
      } else {
        quizSubmit(state.quiz);
        // Record outcome for streak tracking (#103)
        recordQuizResult(state.streak, state.quiz.result as 'correct' | 'wrong' | 'idk');
        // Feed quiz answer text into entropy pool (#4)
        if (state.quiz.question && state.quiz.selectedIndex >= 0) {
          const answerText = state.quiz.choices[state.quiz.selectedIndex] || '';
          feedEntropy(`quiz:${state.quiz.question.question}:${answerText}`);
        }
      }
    }
    input.endFrame();
    return;
  }

  // --- Dialog Input (edge-detected) ---
  if (state.ui.dialog.active) {
    if (justKeys.interact) {
      if (!advanceDialog(state.ui)) {
        closeDialog(state.ui);
        cancelSpeech(state.voice); // Stop voice on dialog close (#76)
        setDialogNpc(null); // Stop mouth animation (#113)
        playSfx(state.sfx, 'dialog_close');
        // Start pending quiz if NPC queued one, then trade after quiz, otherwise open trade or unpause
        if (state.pendingQuiz) {
          const pq = state.pendingQuiz;
          state.pendingQuiz = null;
          startQuiz(state.quiz, pq.difficulty, pq.npcId, pq.bias);
          playSfx(state.sfx, 'quiz_start');
          // Auto-read question for young age bands (#94)
          _autoReadQuizQuestion(state);
          // state.paused stays true for quiz
        } else if (state._pendingInsectQuiz) {
          // Insect safety quiz after eating worms (#110 Phase 3)
          state._pendingInsectQuiz = false;
          startInsectQuiz(state);
          playSfx(state.sfx, 'quiz_start');
          _autoReadQuizQuestion(state);
        } else if (state.pendingTrade) {
          // Open trade panel directly (no quiz pending)
          const persona = getNpcPersona(state.pendingTrade);
          state.pendingTrade = null;
          if (persona && openTrade(state.trade, persona)) {
            playSfx(state.sfx, 'shop_open');
            // state.paused stays true for trade
          } else {
            state.paused = false;
          }
        } else {
          state.paused = false;
        }
      } else {
        playSfx(state.sfx, 'dialog_advance');
        // Speak the new dialog line (#76)
        setDialogNpc(_lastDialogNpcId); // Reset mouth cycle for new line (#113)
        const line = state.ui.dialog.lines[state.ui.dialog.currentLine];
        if (line) speakLine(state.voice, line, state.ui.dialog.npcName === 'Sign' ? null : _lastDialogNpcId);
      }
    }
    input.endFrame();
    return;
  }

  // --- Trade Input (edge-detected) ---
  if (state.trade.active) {
    // Barter quiz active — handle quiz input first (#112 Phase 3)
    if (state.trade.barterQuiz) {
      if (justKeys.up) { barterNavigate(state.trade, 'up'); playSfx(state.sfx, 'menu_navigate'); }
      if (justKeys.down) { barterNavigate(state.trade, 'down'); playSfx(state.sfx, 'menu_navigate'); }
      if (justKeys.interact) {
        const answer = submitBarterAnswer(state.trade);
        if (answer.correct) {
          addToast(state.ui, answer.feedback, '#4caf50', 3000);
          playSfx(state.sfx, 'quiz_correct');
        } else {
          addToast(state.ui, answer.feedback, '#f44336', 3000);
          playSfx(state.sfx, 'quiz_wrong');
        }
        // Apply discount on the pending trade (already executed)
      }
      syncBarterQuizDOM(state.trade);
      syncTradeDOM(state.trade, state.inventory);
      input.endFrame();
      return;
    }

    if (justKeys.up) { tradeNavigate(state.trade, 'up'); playSfx(state.sfx, 'menu_navigate'); }
    if (justKeys.down) { tradeNavigate(state.trade, 'down'); playSfx(state.sfx, 'menu_navigate'); }
    if (justKeys.interact) {
      if (state.trade.mode === 'sell') {
        const sellable = getSellableItems(state.inventory);
        const item = sellable[state.trade.selectedIndex];
        if (item && shouldTriggerBarter()) {
          const price = getSellPrice(item.itemId, state.trade);
          state.trade.barterQuiz = generateBarterQuiz(item.displayName, price);
          state.trade.barterSelectedIndex = 0;
          playSfx(state.sfx, 'menu_navigate');
          syncBarterQuizDOM(state.trade);
        } else {
          const result = executeSell(state.trade, state.inventory);
          const dialog = getTradeDialog(state.trade.persona, result);
          if (result.ok) {
            addToast(state.ui, dialog, '#ffab40');
            playSfx(state.sfx, 'shop_buy');
          } else {
            playSfx(state.sfx, 'shop_fail');
          }
        }
      } else {
        const trade = state.trade.trades[state.trade.selectedIndex];
        if (trade && shouldTriggerBarter()) {
          state.trade.barterQuiz = generateBarterQuiz(
            trade.gives,
            trade.wants === 'coin' ? trade.cost : trade.cost
          );
          state.trade.barterSelectedIndex = 0;
          playSfx(state.sfx, 'menu_navigate');
          syncBarterQuizDOM(state.trade);
        } else {
          const result = executeTrade(state.trade, state.inventory);
          const dialog = getTradeDialog(state.trade.persona, result);
          if (result.ok) {
            addToast(state.ui, dialog, '#4caf50');
            playSfx(state.sfx, 'shop_buy');
          } else {
            playSfx(state.sfx, 'shop_fail');
          }
        }
      }
      // Don't close — let player buy/sell multiple items
    }
    // Escape handled in global keydown handler
    syncTradeDOM(state.trade, state.inventory);
    input.endFrame();
    return;
  }

  // --- Diarrhea control lock check (#133) ---
  if (state.diarrhea.diarrheaLocked) {
    if (state.frameCount >= state.diarrhea.diarrheaLockUntil) {
      // Lock expired — recover
      state.diarrhea.diarrheaLocked = false;
      setDiarrheaOverlay(false);
      addToast(state.ui, '😮‍💨 Phew... feeling better now.', '#4fc3f7', 2500);
      playSfx(state.sfx, 'pickup_item'); // relief SFX
    } else {
      // Still locked — skip all movement and interaction, just render
      input.endFrame();
      return;
    }
  }

  // --- Movement ---
  const mv = input.getMovementVector();
  const isMoving = mv.dx !== 0 || mv.dy !== 0;

  if (isMoving) {
    // Apply survival status + injury + diarrhea speed debuffs (#70, #109, #110, #133)
    const debuffs = getDebuffs(state.status);
    const injuryMult = getInjurySpeedMult(state.injury);
    const diarrheaMult = state.diarrhea.diarrheaUntil > state.frameCount ? DIARRHEA_CONFIG.SPEED_DEBUFF : 1.0;
    const effectiveSpeed = state.player.speed * debuffs.speedMult * injuryMult * diarrheaMult;
    const dx = mv.dx * effectiveSpeed;
    const dy = mv.dy * effectiveSpeed;
    const newX = state.player.x + dx;
    const newY = state.player.y + dy;

    // Axis-independent collision resolution with footprint (#151, #180)
    // Try combined move first; if blocked, try each axis independently (wall-sliding)
    // iso2: pass activeConditions so conditional gates (quiz-gate etc) use isPointWalkableInTile + cond state (per #223/AUTONOMOUS_LOOP.md)
    let movedX = false;
    let movedY = false;
    if (isFootprintWalkable(newX, newY, state.chunks, state.activeConditions)) {
      state.player.x = newX;
      state.player.y = newY;
      movedX = true;
      movedY = true;
    } else {
      // Try X-only
      if (dx !== 0 && isFootprintWalkable(newX, state.player.y, state.chunks, state.activeConditions)) {
        state.player.x = newX;
        movedX = true;
      }
      // Try Y-only
      if (dy !== 0 && isFootprintWalkable(state.player.x, newY, state.chunks, state.activeConditions)) {
        state.player.y = newY;
        movedY = true;
      }
    }

    if (movedX || movedY) {
      // Terrain-aware footstep SFX (#108)
      const footCell = getCellAt(Math.round(state.player.x), Math.round(state.player.y), state.chunks);
      const footTileDef = footCell ? MICRO_TILE_DEFS[footCell.cell.assetKey as import('./rendering/tiles').TileType] : undefined;
      const surface = footTileDef?.surface ?? 'grass';
      playFootstep(state.sfx, surface);

      // iso2 sinkDepth for negative Z (rivers, from walk integration per #223)
      // Use exact walk logic to detect if in channel
      const currentCell = getCellAt(Math.round(state.player.x), Math.round(state.player.y), state.chunks);
      if (currentCell && (currentCell.cell.assetKey === 'water' || currentCell.cell.assetKey === 'river')) {
        state.player.sinkDepth = 4; // match iso2 nano z for sink visual
      } else {
        state.player.sinkDepth = 0;
      }
    } else {
      // Wall bump SFX (#75) — debounce handles frame-spam
      playSfx(state.sfx, 'wall_bump');
      // Deterministic hazard injury (#137) — only hazardous obstacles cause injury
      const hitCell = getCellAt(Math.round(newX), Math.round(newY), state.chunks);
      const hitDef = hitCell ? ASSET_DEFS[hitCell.cell.assetKey] : undefined;
      const hazardDmg = hitDef?.hazardDamage ?? 0;
      if (hazardDmg > 0 && checkHazardInjury(state.injury, hazardDmg)) {
        const label = hitDef?.hazardLabel ?? 'something sharp';
        playSfx(state.sfx, 'ouch');
        triggerHint('ouch_injury');
        setTransientExpression(state, 'surprised', 3000);
        triggerInjuryFlash(); // (#109 Phase 3) red screen flash
        addToast(state.ui, `🤕 Ouch! You bumped into ${label}!`, '#f44336', 2500);
        // Achievement milestones (#109 Phase 3)
        if (state.injury.injuryCount === 5) {
          addToast(state.ui, '🏅 Owie Badge: 5 injuries!', '#ff9800', 3000);
        } else if (state.injury.injuryCount === 10) {
          addToast(state.ui, '🏅 Tough Cookie: 10 injuries!', '#ff9800', 3000);
        } else if (state.injury.injuryCount === 25) {
          addToast(state.ui, '🏅 Survivor: 25 injuries!', '#ff9800', 3000);
        }
      }
    }

    // Direction (left/right flip)
    if (mv.dx > 0) state.player.direction = 1;
    else if (mv.dx < 0) state.player.direction = -1;

    // Track full 2D facing direction for interaction
    if (mv.dx !== 0 || mv.dy !== 0) {
      state.player.facingDx = Math.sign(mv.dx);
      state.player.facingDy = Math.sign(mv.dy);
    }

    // Determine facing pose from screen-space direction (what the player sees):
    // Horizontal dominance (left/right keys) → side profile sprite
    // Vertical dominance (up/down keys) → front (down) or back (up)
    // Diagonal → use vertical component for front/back
    const asx = Math.abs(mv.screenDx);
    const asy = Math.abs(mv.screenDy);
    if (asx > asy) {
      state.player.facingPose = 'side';
    } else if (mv.screenDy < 0) {
      state.player.facingPose = 'back';
    } else if (mv.screenDy > 0) {
      state.player.facingPose = 'front';
    }
    // Equal diagonal (asx === asy && both > 0) → keep current facingPose

    state.player.isMoving = true;
    // Throttle animation: only advance sprite frame every 6th game frame
    if (state.frameCount % 6 === 0) {
      state.player.animFrame = (state.player.animFrame + 1) % PLAYER_CONFIG.animationFrames;
    }

    // Walking sprite - reload when frame or facing pose changes
    if (state.player.animFrame !== state.lastAnimFrame ||
        state.player.facingPose !== state.lastFacingPose) {
      state.egoImg = loadCharacterSprite(
        state.playerVariation, state.player.animFrame, true, state.player.facingPose,
      );
      state.lastAnimFrame = state.player.animFrame;
      state.lastFacingPose = state.player.facingPose;
    }

    // Auto-collect walkable items
    const collected = autoCollect(state.player.x, state.player.y, state.chunks, state.inventory);
    if (collected && collected.type === 'collect') {
      addToast(state.ui, collected.message, '#ffd700', 1200);
      playSfx(state.sfx, collected.itemId === 'coin' ? 'pickup_coin' : 'pickup_item');
    }

    // Camera follow (smooth)
    state.camera.x += (state.player.x - state.camera.x) * 0.1;
    state.camera.y += (state.player.y - state.camera.y) * 0.1;

    // Ensure chunks ONLY on chunk boundary crossing
    maybeLoadChunks(state);
  } else {
    state.player.isMoving = false;
    resetFootstepCounter(); // Reset footstep cadence when idle (#108)
    // Idle sprite - only reload once when stopping (preserves facing pose)
    if (state.player.animFrame !== 0 || state.lastAnimFrame !== 0) {
      state.player.animFrame = 0;
      state.egoImg = loadCharacterSprite(state.playerVariation, 0, false, state.player.facingPose);
      state.lastAnimFrame = 0;
      state.lastFacingPose = state.player.facingPose;
    }
  }

  // --- Interaction (Space, edge-detected) ---
  if (justKeys.interact && !isMoving) {
    // Try facing direction first, then check all 4 neighbors as fallback
    // NOTE: facingDx can be 0 (vertical-only facing) — don't use || which treats 0 as falsy
    const hasFacing = state.player.facingDx !== 0 || state.player.facingDy !== 0;
    const facingDir = {
      dx: hasFacing ? state.player.facingDx : state.player.direction,
      dy: hasFacing ? state.player.facingDy : 0,
    };

    // Wildlife interaction check (before tile-based interactions)
    const wildlifeHit = interactWithWildlife(
      state.player.x, state.player.y, facingDir.dx, facingDir.dy,
    );
    if (wildlifeHit) {
      const { species, entity } = wildlifeHit;
      // Show creature dialog — use custom interaction lines if available (#142)
      const wildlifeLine = species.interactLines && species.interactLines.length > 0
        ? species.interactLines[Math.floor(Math.random() * species.interactLines.length)]
        : `You spotted a ${species.name}! ${species.emoji}`;
      showDialog(state.ui, species.name, [wildlifeLine, species.fact]);
      state.paused = true;
      playSfx(state.sfx, 'wildlife_discover');
      // Speak wildlife discovery (#76)
      _lastDialogNpcId = null;
      speakLine(state.voice, wildlifeLine, null);
      // Make creature flee after inspection
      entity.behavior = 'flee';
      entity.fleeCooldown = 180;
      // Check cosmetic unlocks for wildlife discovery (#66)
      checkCosmeticUnlocks(state);
      // Queue a quiz if species has a quiz category
      if (species.quizCategory) {
        const baseDiff = getDifficultyForPosition(state.player.x, state.player.y);
        const diff = modulateDifficulty(baseDiff, state.streak); // #103 streak modulation
        state.pendingQuiz = {
          difficulty: diff,
          npcId: `wildlife_${species.id}`,
          bias: { [species.quizCategory]: 2.0 },
        };
      }
    } else {
      let result = interact(
        state.player.x, state.player.y,
        facingDir, state.chunks, state.inventory,
      );

      // Fallback: try all 4 cardinal neighbors if facing dir had nothing
      if (result.type === 'none') {
        const dirs = [
          { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
          { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        ];
        for (const d of dirs) {
          result = interact(state.player.x, state.player.y, d, state.chunks, state.inventory);
          if (result.type !== 'none') break;
        }
      }

      // Eat worms desperation: if no interaction found and energy critically low (#110 Phase 3)
      if (result.type === 'none' && state.status.energy <= CRITICAL_THRESHOLD) {
        result = { type: 'eat_worms', message: 'You found a worm in the ground... 🐛 Gulp!' };
      }

      handleInteraction(result, state);
    }
  }

  // --- Toggle Debug (F3) ---
  // Handled in extended input listener below

  // --- Survival Status tick (#70) ---
  // tickStatus self-throttles internally (every 300 frames)
  {
    const cs = WORLD_CONFIG.chunkSize;
    const cKey = `${Math.floor(state.player.x / cs)},${Math.floor(state.player.y / cs)}`;
    const chunk = state.chunks.get(cKey);
    const biomeId = chunk?.biomeId ?? 0;
    tickStatus(state.status, state.player.isMoving, biomeId);
    // Music biome awareness (#74) — switch tracks on biome change
    musicSetBiome(state.music, biomeId);
  }

  // --- Tutorial tick (#186) ---
  if (isTutorialActive()) {
    tickTutorial(
      state.player.x,
      state.player.y,
      state.inventory.slots.reduce((sum, s) => sum + s.quantity, 0),
      isFlashlightOn(),
      justKeys.interact,
    );
  }

  // --- Transient expression tick (#102) ---
  tickExpressionOverride(state);

  // --- Ambience update (#75 + #108) — oscillator + sampled layers ---
  // Throttle to every 60th frame (~1s at 60fps) to avoid churn
  if (state.frameCount % 60 === 0) {
    const cycleProgress = getCycleProgress();
    const timeSlot: 'day' | 'dusk' | 'night' = cycleProgress < 0.65 ? 'day' : cycleProgress < 0.80 ? 'dusk' : 'night';
    const weatherInfo = getWeatherInfo();
    // Enhanced ambience with sampled loops (#108)
    updateAmbienceEnhanced(state.sfx, timeSlot, weatherInfo.type);
    // Random animal calls (#108) — bird chirps, owl hoots, frog croaks
    tickAnimalCalls(state.sfx, timeSlot, state.frameCount);
    // Dawn rooster (#108) — play once on night→day transition
    if (timeSlot === 'day' && state._lastTimeSlot === 'night') {
      playRoosterCrow(state.sfx);
    }
    state._lastTimeSlot = timeSlot;
  }

  // --- Positional audio listener update (#108) — every 10th frame ---
  if (state.frameCount % 10 === 0) {
    updateListenerPosition(state.sfx, state.player.x, state.player.y);
  }

  // --- Positional audio source scan (#108) — every 120 frames (~2s) ---
  // Scans nearby chunks for campfire/waterfall and starts positional loops
  if (state.frameCount % 120 === 0 && state.sfx.sampledReady) {
    scanPositionalAudioSources(state);
  }

  // --- Auto-save every 30s ---
  if (state.frameCount % (60 * 30) === 0) {
    doSave(state);
  }

  // --- Wildlife update (throttled to every 3rd frame for perf) ---
  if (state.frameCount % 3 === 0) {
    updateWildlife(state.chunks, state.player.x, state.player.y);
  }

  // --- Fog-of-war: reveal cells around player (#114) ---
  if (state.frameCount % 6 === 0) {
    updateFog(state.player.x, state.player.y, isFlashlightOn());
  }

  // --- Thought Bubble triggers (throttled to every 30th frame for perf) ---
  if (state.frameCount % 30 === 0 && !state.paused) {
    checkBubbleTriggers(state);
  }
  // Tick bubble queue/display every 6th frame
  if (state.frameCount % 6 === 0) {
    // Dismiss bubbles during modal overlays (dialog, quiz, book)
    if (state.paused) {
      dismissBubble();
    } else {
      tickBubbles();
    }
  }

  // Snapshot input for edge detection next frame
  input.endFrame();
  _clearExtraKeys(); // Clear numeric/R key queue (#94)
}

function handleInteraction(result: InteractionResult, state: GameState): void {
  switch (result.type) {
    case 'collect':
      state.inventory.addItem(result.itemId, 1);
      addToast(state.ui, result.message, '#ffd700');
      playSfx(state.sfx, result.itemId === 'coin' ? 'pickup_coin' : 'pickup_item');
      break;

    case 'chest':
      for (const itemId of result.items) state.inventory.addItem(itemId, 1);
      addToast(state.ui, result.message, '#ffaa00');
      playSfx(state.sfx, 'open_chest');
      break;

    case 'obstacle':
      if (result.resolved) {
        addToast(state.ui, result.message, '#4caf50');
        playSfx(state.sfx, 'obstacle_resolved');
      } else {
        addToast(state.ui, result.message, '#f44336');
        playSfx(state.sfx, 'obstacle_blocked');
      }
      break;

    case 'npc': {
      const persona = getNpcPersona(result.npcId);
      const npcName = persona?.displayName || 'Stranger';
      showDialog(state.ui, npcName, [result.greeting]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      // Speak greeting line (#76)
      _lastDialogNpcId = result.npcId;
      setDialogNpc(result.npcId); // Start mouth animation (#113)
      speakLine(state.voice, result.greeting, result.npcId);

      // Feed NPC greeting into entropy pool (#4)
      feedEntropy(result.greeting);

      // If NPC can quiz, queue quiz to start when dialog closes (not via setTimeout race)
      // Difficulty = max(NPC preference, distance-based scaling) — Doc 05 §9.1
      // Then modulate via streak (#103)
      if (persona?.canQuiz) {
        const bias = getQuizBias(state.knowledge);
        const distDiff = getDifficultyForPosition(state.player.x, state.player.y);
        const baseDifficulty = blendDifficulty(persona.quizDifficulty, distDiff);
        const finalDifficulty = modulateDifficulty(baseDifficulty, state.streak);
        state.pendingQuiz = { difficulty: finalDifficulty, npcId: result.npcId, bias };
      }

      // If NPC has trades, queue trade panel to open after dialog + optional quiz
      if (persona && persona.trades.length > 0) {
        state.pendingTrade = result.npcId;
      }
      break;
    }

    case 'sign':
      showDialog(state.ui, 'Sign', [result.message]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      break;

    case 'quiz_gate': {
      // Quiz gate — show dialog then trigger distance-based quiz (Doc 05 §3.5)
      showDialog(state.ui, 'Quiz Gate', [result.message]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      const baseGateDiff = getDifficultyForPosition(state.player.x, state.player.y);
      const gateDiff = modulateDifficulty(baseGateDiff, state.streak); // #103 streak modulation
      const gateBias = getQuizBias(state.knowledge);
      state.pendingQuiz = { difficulty: gateDiff, npcId: 'quiz_gate', bias: gateBias };
      state.pendingGateQuiz = { chunkKey: result.chunkKey, lx: result.lx, ly: result.ly };
      break;
    }

    // --- Shop structure interaction (#77, #112 themed variants) ---
    case 'shop': {
      const shopPersona = getShopPersona(result.shopAsset);
      showDialog(state.ui, shopPersona.displayName, [shopPersona.greetings[Math.floor(Math.random() * shopPersona.greetings.length)]]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      // Queue trade panel to open after dialog closes
      state.pendingTrade = shopPersona.id;
      break;
    }

    // --- Outhouse hygiene interaction (#110 Phase 2) ---
    case 'outhouse': {
      playSfx(state.sfx, 'outhouse_enter');
      // Immediate partial cleanliness restore
      const cleanBefore = state.status.cleanliness;
      const partialRestore = Math.min(100 - cleanBefore, 40);
      state.status.cleanliness = Math.min(100, cleanBefore + partialRestore);
      const cleanMsg = partialRestore > 0
        ? `🧼 +${Math.round(partialRestore)} cleanliness!`
        : '✨ Already squeaky clean!';
      addToast(state.ui, `🚽 ${result.message}`, '#88ccff', 2500);
      if (partialRestore > 0) {
        addToast(state.ui, cleanMsg, '#4caf50', 2000);
      }
      // Start hygiene quiz for bonus full restore
      startHygieneQuiz(state);
      break;
    }

    // --- Stream drinking (#110 Phase 3, #133 illness chain) ---
    case 'stream_drink': {
      playSfx(state.sfx, 'stream_drink');
      const hydrationGain = 20;
      state.status.hydration = Math.min(100, state.status.hydration + hydrationGain);

      // Track stream drink count for diarrhea risk (#133)
      state.diarrhea.streamDrinkCount++;
      const drinkCount = state.diarrhea.streamDrinkCount;

      // Diarrhea roll: 20% after threshold, guaranteed at 6+ drinks, with cooldown
      const pastThreshold = drinkCount >= DIARRHEA_CONFIG.DRINK_THRESHOLD;
      const offCooldown = (state.frameCount - state.diarrhea.diarrheaLastTrigger) >= DIARRHEA_CONFIG.COOLDOWN_FRAMES;
      const chance = drinkCount >= DIARRHEA_CONFIG.GUARANTEED_AT
        ? 1.0
        : DIARRHEA_CONFIG.BASE_CHANCE;

      if (pastThreshold && offCooldown && Math.random() < chance) {
        // --- Trigger diarrhea illness event (#133) ---
        state.diarrhea.diarrheaLocked = true;
        state.diarrhea.diarrheaLockUntil = state.frameCount + DIARRHEA_CONFIG.LOCK_DURATION_FRAMES;
        state.diarrhea.diarrheaUntil = state.frameCount + DIARRHEA_CONFIG.LOCK_DURATION_FRAMES + DIARRHEA_CONFIG.DEBUFF_DURATION_FRAMES;
        state.diarrhea.diarrheaLastTrigger = state.frameCount;

        // Spawn poop marker at current position
        state.diarrhea.poopMarkers.push({
          x: Math.round(state.player.x),
          y: Math.round(state.player.y),
          placedAt: state.frameCount,
        });

        // Poop particle burst VFX (uses screen coords — resolved in render)
        _pendingPoopBurst = true;

        // Green illness overlay
        setDiarrheaOverlay(true);

        // SFX + UI feedback
        playSfx(state.sfx, 'diarrhea_gurgle');
        addToast(state.ui, '🤢 Oh no! Stomach emergency... can\'t move!', '#ff4444', 4000);
        triggerHint('stream_eww');
        setTransientExpression(state, 'surprised', 5000);
      } else {
        addToast(state.ui, `💧 Refreshing stream water! +${hydrationGain} hydration`, '#4fc3f7', 2500);
      }
      break;
    }

    // --- Eat worms desperation (#110 Phase 3) ---
    case 'eat_worms': {
      playSfx(state.sfx, 'eat_worms');
      const energyGain = 5;
      state.status.energy = Math.min(100, state.status.energy + energyGain);
      addToast(state.ui, '🐛 Gross! But you got a tiny bit of energy... +5', '#8bc34a', 3000);

      // Queue insect safety quiz
      state._pendingInsectQuiz = true;
      showDialog(state.ui, '🐛 Yuck!', ['That was disgusting... but is it actually safe to eat insects?']);
      state.paused = true;
      _lastDialogNpcId = null;
      break;
    }

    // --- Campfire rest interaction (#77) ---
    case 'campfire': {
      const changes = applyStatusEffect(state.status, { energy: 25, hydration: 10 });
      const msg = changes.length > 0
        ? `${result.message} ${changes.join(', ')}`
        : `${result.message} You feel refreshed!`;
      addToast(state.ui, msg, '#ff8844', 3000);
      playSfx(state.sfx, 'pickup_item');
      break;
    }

    // --- Structure flavor text (#77) ---
    case 'structure':
      showDialog(state.ui, '🏠 Structure', [result.message]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      break;
  }
}

// ─── Save ────────────────────────────────────────────────────

/** Build SaveData from current game state */
function buildSaveData(state: GameState): SaveData {
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
  };
}

/** Apply loaded save data to current game state */
function applySaveData(state: GameState, data: SaveData): void {
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
  // Regenerate chunks around new player position
  state.lastChunkX = Math.floor(data.player.x / WORLD_CONFIG.chunkSize);
  state.lastChunkY = Math.floor(data.player.y / WORLD_CONFIG.chunkSize);
  ensureChunksAround(state);
}

function doSave(state: GameState): void {
  saveGame(buildSaveData(state));
  markSaveSlotsDirty();
}

// ─── Cosmetic Unlock Check (#66) ────────────────────────────────
/** Check progression and grant newly unlocked cosmetics */
function checkCosmeticUnlocks(state: GameState): void {
  const progress: ProgressionData = {
    quizCorrect: state.quizStats.correct,
    quizAnswered: state.quizStats.answered,
    wildlifeDiscovered: getWildlifeStats().discovered,
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

// ─── Menu System ───────────────────────────────────────────────────
// TODO: DOC - menu flow state diagram

// B5 micro-slice 11.12 (#268): showAgeSelection extracted to
// ./game/age-selection.ts (58 lines). Pure DOM overlay, no callbacks.

// ─── Options Overlay (#117 Phase 3) ──────────────────────────
// ─── Options Overlay (#117 Phase 3) ──────────────────────────

/**
 * Show options overlay. Syncs with sidebar sliders bidirectionally.
 * If state is null, we're in main menu context (audio controls only affect sidebar defaults).
 */
function showOptionsOverlay(_state: GameState | null, inputMgr?: InputManager): void {
  const overlay = document.getElementById('optionsOverlay')!;
  overlay.style.display = 'flex';

  // Sync options sliders FROM sidebar current values
  const sidebarMusic = document.getElementById('musicVolume') as HTMLInputElement | null;
  const sidebarSfx = document.getElementById('sfxVolume') as HTMLInputElement | null;
  const sidebarAmbience = document.getElementById('ambienceVolume') as HTMLInputElement | null;
  const sidebarVoice = document.getElementById('voiceVolume') as HTMLInputElement | null;

  const optMusic = document.getElementById('optMusicVol') as HTMLInputElement;
  const optSfx = document.getElementById('optSfxVol') as HTMLInputElement;
  const optAmbience = document.getElementById('optAmbienceVol') as HTMLInputElement;
  const optVoice = document.getElementById('optVoiceVol') as HTMLInputElement;

  // Read current values from sidebar/popup controls
  if (sidebarMusic) optMusic.value = sidebarMusic.value;
  if (sidebarSfx) optSfx.value = sidebarSfx.value;
  if (sidebarAmbience) optAmbience.value = sidebarAmbience.value;
  if (sidebarVoice) optVoice.value = sidebarVoice.value;

  // Update display values
  const updateDisplay = () => {
    document.getElementById('optMusicVal')!.textContent = optMusic.value;
    document.getElementById('optSfxVal')!.textContent = optSfx.value;
    document.getElementById('optAmbienceVal')!.textContent = optAmbience.value;
    document.getElementById('optVoiceVal')!.textContent = optVoice.value;
  };
  updateDisplay();

  // Sync options → sidebar on input (live preview)
  const syncToSidebar = (optEl: HTMLInputElement, sidebarEl: HTMLInputElement | null) => {
    if (sidebarEl) {
      sidebarEl.value = optEl.value;
      sidebarEl.dispatchEvent(new Event('input'));
    }
    updateDisplay();
  };

  optMusic.oninput = () => syncToSidebar(optMusic, sidebarMusic);
  optSfx.oninput = () => syncToSidebar(optSfx, sidebarSfx);
  optAmbience.oninput = () => syncToSidebar(optAmbience, sidebarAmbience);
  optVoice.oninput = () => syncToSidebar(optVoice, sidebarVoice);

  // #138: LLM config is now Options-only (no sidebar sync needed)
  // LLM settings load/applied via initLlmConfigPanel() in ui.ts

  // Touch controls toggle (#124, #126 — UA-based auto-show)
  const optTouch = document.getElementById('optTouchControls') as HTMLSelectElement | null;

  // Touch visibility mode (#144 — 3-way: whisper/slide/visible)
  const TOUCH_VIS_KEY = 'emilys_game_touch_vis';
  const optTouchVis = document.getElementById('optTouchVisibility') as HTMLSelectElement | null;
  const sbTouchVis = document.getElementById('sbTouchVisMode') as HTMLSelectElement | null;
  const savedTouchVis = (localStorage.getItem(TOUCH_VIS_KEY) || 'whisper') as TouchControlMode;
  if (inputMgr) inputMgr.setTouchControlMode(savedTouchVis);
  const syncTouchVis = (mode: TouchControlMode) => {
    if (inputMgr) inputMgr.setTouchControlMode(mode);
    localStorage.setItem(TOUCH_VIS_KEY, mode);
    if (optTouchVis) optTouchVis.value = mode;
    if (sbTouchVis) sbTouchVis.value = mode;
  };
  if (optTouchVis) {
    optTouchVis.value = savedTouchVis;
    optTouchVis.onchange = () => syncTouchVis(optTouchVis.value as TouchControlMode);
  }
  if (sbTouchVis) {
    sbTouchVis.value = savedTouchVis;
    sbTouchVis.onchange = () => syncTouchVis(sbTouchVis.value as TouchControlMode);
  }

  // Fog of War toggle (#127)
  const FOG_PREF_KEY = 'emilys_game_fog_enabled';
  const optFog = document.getElementById('optFogOfWar') as HTMLSelectElement | null;
  if (optFog) {
    optFog.value = isFogEnabled() ? 'on' : 'off';
    optFog.onchange = () => {
      const enabled = optFog.value === 'on';
      setFogEnabled(enabled);
      localStorage.setItem(FOG_PREF_KEY, enabled ? '1' : '0');
    };
  }
  const optGamepadStatus = document.getElementById('optGamepadStatus');
  if (optTouch && inputMgr) {
    // (#126) Determine current state: 'auto' means UA-matched, 'on' means forced, 'off' means disabled
    if (inputMgr.touchEnabled) {
      optTouch.value = shouldAutoShowTouchOverlay() ? 'auto' : 'on';
    } else {
      optTouch.value = 'off';
    }
    optTouch.onchange = () => {
      if (!inputMgr) return;
      if (optTouch.value === 'on') {
        inputMgr.enableTouchControls();
      } else if (optTouch.value === 'off') {
        inputMgr.disableTouchControls();
      } else {
        // Auto: only enable if UA matches (#126)
        if (shouldAutoShowTouchOverlay()) {
          inputMgr.enableTouchControls();
        } else {
          inputMgr.disableTouchControls();
        }
      }
    };
  }
  if (optGamepadStatus && inputMgr) {
    optGamepadStatus.textContent = inputMgr.gamepadConnected ? '✅ Connected' : '❌ Not connected';
    optGamepadStatus.style.color = inputMgr.gamepadConnected ? '#88ff88' : '#888';
  }

  // Tesla Mode (#185)
  const optTesla = document.getElementById('optTeslaMode') as HTMLSelectElement | null;
  const teslaBadge = document.getElementById('teslaBadge');
  const applyTeslaMode = (active: boolean) => {
    // Show/hide Tesla "T" badge
    if (teslaBadge) {
      teslaBadge.classList.toggle('active', active);
    }
    // Auto-enable/disable touch controls when Tesla mode changes
    if (inputMgr) {
      if (active && !inputMgr.touchEnabled) {
        inputMgr.enableTouchControls();
        if (optTouch) optTouch.value = 'on';
      }
    }
  };
  if (optTesla) {
    // Determine initial state
    const teslaActive = isTeslaMode();
    const teslaAutoDetected = detectTeslaBrowser();
    if (teslaActive) {
      optTesla.value = 'on';
    } else if (teslaAutoDetected) {
      optTesla.value = 'auto';
    } else {
      optTesla.value = 'off';
    }
    applyTeslaMode(teslaActive);

    optTesla.onchange = () => {
      if (optTesla.value === 'on') {
        setTeslaMode(true);
        applyTeslaMode(true);
      } else if (optTesla.value === 'off') {
        setTeslaMode(false);
        applyTeslaMode(false);
      } else {
        // Auto: enable only if auto-detected
        const auto = detectTeslaBrowser();
        setTeslaMode(auto);
        applyTeslaMode(auto);
      }
    };
  } else {
    // No settings element — still apply if Tesla mode active (e.g. ?tesla=1)
    if (isTeslaMode()) {
      applyTeslaMode(true);
    }
  }

  // Close button
  document.getElementById('optionsClose')!.onclick = () => {
    overlay.style.display = 'none';
  };

  // Replay Tutorial (#186)
  document.getElementById('optReplayTutorial')?.addEventListener('click', () => {
    resetTutorial();
    initTutorial();
    overlay.style.display = 'none';
    if (_state) _state.paused = false;
  });
}

// B5 micro-slice 11.10 (#268): showMainMenu extracted from main.ts
// to ./game/main-menu.ts. The Options button inside the menu
// delegates to a caller-supplied callback so this module stays
// independent of showOptionsOverlay.


/** Reset game state for a new game */
function resetGameState(state: GameState): void {
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
  state.status = createPlayerStatus();
  state.injury = createInjuryState();
  resetTickCounter();
  state.unlockedCosmetics = [];
  setUnlockedCosmetics([]);
  // Reset diarrhea illness chain (#133)
  state.diarrhea = createInitialDiarrheaState();
  setDiarrheaOverlay(false);
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
  deleteSave();
  ensureChunksAround(state);
}

// ─── Bug Report Capture (#117) ──────────────────────────────

function captureBugReport(state: GameState, description: string): void {
  // Capture canvas screenshot
  const canvas = document.querySelector('#gameContainer canvas') as HTMLCanvasElement | null;
  const screenshotDataUrl = canvas ? canvas.toDataURL('image/png') : '';

  // Build metadata
  const cs = WORLD_CONFIG.chunkSize;
  const cKey = `${Math.floor(state.player.x / cs)},${Math.floor(state.player.y / cs)}`;
  const chunk = state.chunks.get(cKey);
  const metadata = {
    timestamp: new Date().toISOString(),
    description,
    player: {
      x: Math.round(state.player.x * 100) / 100,
      y: Math.round(state.player.y * 100) / 100,
      biome: chunk?.biomeName ?? 'unknown',
      biomeId: chunk?.biomeId ?? -1,
    },
    status: { ...state.status },
    inventory: state.inventory.serialize().map((s) => ({ id: s.itemId, qty: s.quantity })),
    timeOfDay: getCycleProgress(),
    frameCount: state.frameCount,
    platform: navigator.userAgent,
  };

  // Bundle into a downloadable JSON + embedded screenshot
  const report = {
    version: '1.0',
    ...metadata,
    screenshot: screenshotDataUrl,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bug-report-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Welcome Splash (#117) ──────────────────────────────────

const FIRST_RUN_KEY = 'emilys_game_first_run';

function shouldShowWelcome(): boolean {
  return !localStorage.getItem(FIRST_RUN_KEY);
}

function showWelcomeSplash(): Promise<void> {
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

// B5 micro-slice 11.11 (#268): showPauseMenu extracted to ./game/pause-menu.ts
// (76 lines). Handlers for save/options/bug-report/main-menu are wired
// at the call site below to keep this module decoupled.

// ─── Thought Bubble Triggers ─────────────────────────────────

let lastBubbleBiomeId = -1;
let lastBubbleDiffTier = -1;

function checkBubbleTriggers(state: GameState): void {
  const px = state.player.x;
  const py = state.player.y;
  const cs = WORLD_CONFIG.chunkSize;
  const cKey = `${Math.floor(px / cs)},${Math.floor(py / cs)}`;
  const chunk = state.chunks.get(cKey);

  // Low resources
  if (state.inventory.countItem('coin') === 0) {
    triggerHint('low_coins');
  }
  if (state.inventory.countItem('key') === 0) {
    triggerHint('no_keys');
  }

  // Nearby interactives — scan 3x3 cells around player
  const rx = Math.round(px);
  const ry = Math.round(py);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const gx = rx + dx;
      const gy = ry + dy;
      const ccx = Math.floor(gx / cs);
      const ccy = Math.floor(gy / cs);
      const nearChunk = state.chunks.get(`${ccx},${ccy}`);
      if (!nearChunk?.generated) continue;
      const lx = ((gx % cs) + cs) % cs;
      const ly = ((gy % cs) + cs) % cs;
      const cell = nearChunk.cells[ly]?.[lx];
      if (!cell) continue;

      if (cell.npcId) triggerHint('near_npc');
      if (cell.assetKey === 'quiz_gate' || cell.assetKey === 'door') triggerHint('near_gate');
      if (cell.assetKey === 'chest') triggerHint('near_chest');
    }
  }

  // Wildlife nearby
  const wildlife = getVisibleWildlife(state.camera, px, py);
  if (wildlife.length > 0) {
    // Only trigger if there's a close creature (within ~3 grid units)
    const close = wildlife.some(e => {
      const distSq = (e.worldX - px) ** 2 + (e.worldY - py) ** 2;
      return distSq < 9; // 3^2
    });
    if (close) triggerHint('wildlife_spotted');
  }

  // Biome transitions
  if (chunk?.generated && chunk.biomeId !== lastBubbleBiomeId) {
    const oldBiome = lastBubbleBiomeId;
    lastBubbleBiomeId = chunk.biomeId;
    if (oldBiome >= 0) { // Don't trigger on first chunk
      if (chunk.biomeId === 1) triggerHint('biome_forest');
      else if (chunk.biomeId === 2) triggerHint('biome_cave');
      else if (chunk.biomeId === 3) triggerHint('biome_castle');
    }
  }

  // Difficulty warnings
  if (chunk?.generated) {
    const dist = Math.abs(Math.floor(px / cs)) + Math.abs(Math.floor(py / cs));
    const diff = getDifficulty(dist);
    if (diff.tier >= 3 && diff.tier !== lastBubbleDiffTier) {
      triggerHint('danger_zone');
    }
    lastBubbleDiffTier = diff.tier;
  }

  // Quiz streak / wrong encouragement
  if (state.quizStats.answered > 0) {
    const streakPct = state.quizStats.correct / state.quizStats.answered;
    if (streakPct >= 0.8 && state.quizStats.answered >= 3) {
      triggerHint('quiz_streak');
    }
  }

  // Nightfall / dawn from lighting (check cycle progress)
  const progress = getCycleProgress();
  if (progress >= 0.78 && progress < 0.82) {
    triggerHint('nightfall');
  } else if (progress >= 0.0 && progress < 0.05) {
    triggerHint('dawn');
  }

  // Dark without flashlight
  if (progress >= 0.80 && !isFlashlightOn()) {
    triggerHint('dark_no_flashlight');
  }

  // Far from spawn
  const spawnDist = Math.sqrt(px * px + py * py);
  if (spawnDist > 60) {
    triggerHint('far_from_spawn');
  }

  // ── Status-aware triggers (#111) ──
  const LOW = 30;
  const CRIT = 15;
  const { energy, hydration, cleanliness } = state.status;

  // Count how many stats are low
  let lowCount = 0;
  if (energy <= LOW) lowCount++;
  if (hydration <= LOW) lowCount++;
  if (cleanliness <= LOW) lowCount++;

  // Combo trigger first (priority 8, highest)
  if (lowCount >= 3) {
    triggerHint('status_combo_bad');
  } else {
    // Individual status triggers
    if (energy <= CRIT) triggerHint('critical_energy');
    else if (energy <= LOW) triggerHint('low_energy');

    if (hydration <= CRIT) triggerHint('critical_hydration');
    else if (hydration <= LOW) triggerHint('low_hydration');

    if (cleanliness <= CRIT) triggerHint('critical_cleanliness');
    else if (cleanliness <= LOW) triggerHint('low_cleanliness');
  }

  // ── Shop proximity trigger (#111) ──
  // Check nearby cells for shop/merchant structures
  for (let dy2 = -3; dy2 <= 3; dy2++) {
    for (let dx2 = -3; dx2 <= 3; dx2++) {
      const gx2 = rx + dx2;
      const gy2 = ry + dy2;
      const ccx2 = Math.floor(gx2 / cs);
      const ccy2 = Math.floor(gy2 / cs);
      const nearChunk2 = state.chunks.get(`${ccx2},${ccy2}`);
      if (!nearChunk2?.generated) continue;
      const lx2 = ((gx2 % cs) + cs) % cs;
      const ly2 = ((gy2 % cs) + cs) % cs;
      const cell2 = nearChunk2.cells[ly2]?.[lx2];
      if (!cell2) continue;
      if (cell2.assetKey === 'shop' || cell2.assetKey?.startsWith('shop_') || cell2.assetKey === 'merchant' || cell2.assetKey === 'store') {
        if (state.injury.injured) {
          triggerHint('injury_near_shop'); // Injured + near shop (#109)
        } else {
          triggerHint('near_shop');
        }
      }
      // Outhouse proximity (#110)
      if (cell2.assetKey === 'outhouse') {
        if (state.status.cleanliness <= LOW) {
          triggerHint('outhouse_near');
        }
      }
      // Water proximity — drink from stream (#110 Phase 3)
      if (cell2.assetKey === 'water') {
        if (hydration <= LOW) {
          triggerHint('near_water');
        }
      }
    }
  }

  // Injury-specific hints (#109)
  if (state.injury.injured) {
    triggerHint('need_bandaid');
  }

  // Starving desperation hint (#110 Phase 3)
  if (energy <= CRIT) {
    triggerHint('starving_worms');
  }

  // Dirty hint — outhouse needed (#110)
  if (state.status.cleanliness <= LOW) {
    triggerHint('outhouse_dirty');
  }
}

// B5 micro-slice 11.13 (#268): renderWildlife + the _revealedCreatures /
// _eyeBlinkTimer / _eyeSwayPhase state moved to ./game/wildlife-render.ts.

// ─── Render ──────────────────────────────────────────────────

// Deferred poop burst — set in tick, resolved in render with screen coords (#133)
let _pendingPoopBurst = false;

function renderFrame(
  renderer: IsometricRenderer,
  state: GameState,
): void {
  const _t0 = performance.now();

  // World render (WASM if available, JS fallback)
  renderer.renderAuto(
    state.chunks,
    state.camera,
    { x: state.player.x, y: state.player.y },
    state.player.direction,
    state.egoImg,
    state.ui.showDebug,
  );

  const _t1 = performance.now();
  perfStats.render = perfSmooth(perfStats.render, _t1 - _t0);

  // Ambient particles (butterflies, sparkles, leaves, birds)
  updateAndRenderParticles(renderer.getCtx(), state.chunks, state.camera);

  const _t2 = performance.now();
  perfStats.particles = perfSmooth(perfStats.particles, _t2 - _t1);

  // Wildlife layer: draw creatures after terrain/objects, before lighting
  renderWildlife(renderer, state);

  const _t3 = performance.now();
  perfStats.wildlife = perfSmooth(perfStats.wildlife, _t3 - _t2);

  // Debuff visual effects (#110): fly particles + dehydration blur
  updateFlies(state.status);
  updateBlurOverlay(state.status);
  updateInjuryFlash(); // (#109 Phase 3) injury red flash
  updateDiarrheaOverlay(); // (#133) green illness overlay
  const playerScreenDbf = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  renderFlies(renderer.getCtx(), playerScreenDbf.x, playerScreenDbf.y);

  // Poop markers in world space (#133)
  const cam = state.camera;
  renderPoopMarkers(
    renderer.getCtx(),
    state.diarrhea.poopMarkers,
    state.frameCount,
    DIARRHEA_CONFIG.MARKER_DURATION_FRAMES,
    (gx: number, gy: number) => renderer.gridToScreen(gx, gy, cam),
  );

  // Poop particle burst (#133): resolve deferred burst with screen coords
  if (_pendingPoopBurst) {
    _pendingPoopBurst = false;
    spawnPoopBurst(playerScreenDbf.x, playerScreenDbf.y, DIARRHEA_CONFIG.PARTICLE_COUNT);
  }
  updateAndRenderPoopParticles(renderer.getCtx());

  // Fog-of-war overlay: darken unexplored areas (#114)
  renderFog(renderer.getCtx(), state.camera);

  // Update thought bubble position (anchored above player sprite screen position)
  const playerScreen = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  updateBubblePosition(playerScreen.x, playerScreen.y);

  // Day/night cycle: tick the clock (rendering is handled by local-lights with lightmap)
  // Pause-aware: don't advance time when menus/overlays are active (#136)
  tickLighting(state.paused);

  // Local lights: fire positions cached per chunk to avoid 5625+ cell scans every frame (#79, #81)
  clearLights();
  const cs2 = WORLD_CONFIG.chunkSize;
  for (const [, chunk] of state.chunks) {
    if (!chunk.generated) continue;
    // lazily cache fire positions per chunk (bonfire, campfire, biomass_fire)
    let fires = (chunk as any)._fireCache as { gx: number; gy: number; key: string }[] | undefined;
    if (fires === undefined) {
      fires = [];
      const baseGX = chunk.chunkX * cs2;
      const baseGY = chunk.chunkY * cs2;
      for (let cy = 0; cy < cs2; cy++) {
        for (let cx = 0; cx < cs2; cx++) {
          const ak = chunk.cells[cy][cx].assetKey;
          if (FIRE_ASSET_KEYS.has(ak)) {
            fires.push({ gx: baseGX + cx, gy: baseGY + cy, key: ak });
          }
        }
      }
      (chunk as any)._fireCache = fires;
    }
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      const variant = FIRE_VARIANTS[f.key];
      if (variant) {
        addPointLight(f.gx, f.gy, {
          radius: variant.lightRadius,
          color: variant.lightColor,
          intensity: variant.lightIntensity,
        });
      } else {
        addPointLight(f.gx, f.gy);
      }
    }
  }
  addFlashlight(state.player.x, state.player.y, state.player.facingDx, state.player.facingDy);
  // Torch: portable warm light when player has torch in inventory (#99)
  if (state.inventory.hasItem('torch')) {
    addPointLight(state.player.x, state.player.y, {
      radius: 80,
      color: [255, 160, 50],
      intensity: 0.7,
      flicker: true,
    });
  }
  renderLocalLights(renderer.getCtx(), state.camera);

  // Night desaturation: CSS filter on canvas element for GPU-composited grayscale (#114)
  // Smooth ramp: full color during day, desaturated at night
  const cycleT = getCycleProgress();
  let desatFactor = 0; // 0 = full color, 1 = full desaturation 
  if (cycleT >= 0.80) {
    desatFactor = 0.75; // Full night: heavy desaturation
  } else if (cycleT >= 0.65) {
    // Dusk transition: 0 → 0.75 over dusk phase
    desatFactor = ((cycleT - 0.65) / 0.15) * 0.75;
  } else if (cycleT < 0.08) {
    // Dawn: fade back 0.75 → 0 
    desatFactor = (1 - cycleT / 0.08) * 0.75;
  }
  if (desatFactor > 0.01) {
    const sat = 1 - desatFactor;
    const bright = 1 - desatFactor * 0.15; // slight brightness reduction at night
    renderer.getCanvas().style.filter = `saturate(${sat.toFixed(2)}) brightness(${bright.toFixed(2)})`;
  } else {
    renderer.getCanvas().style.filter = '';
  }

  const _t4 = performance.now();
  perfStats.lighting = perfSmooth(perfStats.lighting, _t4 - _t3);

  // Weather effects (rain, fog, clouds, lightning)
  updateAndRenderWeather(renderer.getCtx());
  // Thunder SFX on lightning strike (#75)
  if (didLightningStrike()) {
    playSfx(state.sfx, 'thunder');
  }

  const _t5 = performance.now();
  perfStats.weather = perfSmooth(perfStats.weather, _t5 - _t4);

  // UI overlay - throttle DOM sync to every 4th frame
  if (state.frameCount % 4 === 0 || state.quiz.active || state.ui.dialog.active || state.trade.active) {
    // Get current biome name from chunk map
    const cs = WORLD_CONFIG.chunkSize;
    const cKey = `${Math.floor(state.player.x / cs)},${Math.floor(state.player.y / cs)}`;
    const currentChunk = state.chunks.get(cKey);
    const biomeName = currentChunk ? getBiome(currentChunk.biomeId).displayName : undefined;

    renderUI(
      renderer.getCtx(),
      state.ui,
      state.inventory,
      state.quiz,
      { x: state.player.x, y: state.player.y },
      state.fps,
      state.quizStats,
      biomeName,
    );

    // Trade panel DOM sync
    if (state.trade.active) {
      syncTradeDOM(state.trade, state.inventory);
    }

    // Status bars (#70, #109)
    syncStatusBars(state.status, state.injury);

    // Music ducking sync (#74) — duck when paused (quiz/dialog active)
    if (state.paused && !state.music.ducking) {
      startDucking(state.music);
    } else if (!state.paused && state.music.ducking) {
      stopDucking(state.music);
    }

    // Music UI sync (#74)
    updateMidiProgress(state.music);
    syncMusicUI(state.music);

    // SFX UI sync (#75)
    syncSfxUI(state.sfx);

    // Voice UI sync (#76)
    syncVoiceUI(state.voice);
  }

  // Minimap (self-throttling to ~6fps)
  renderMinimap(state.chunks, state.player.x, state.player.y);

  // Book of Knowledge overlay (self-throttling)
  syncBookUI(state.knowledge);
}

// ─── Game Loop ───────────────────────────────────────────────

function gameLoop(
  _time: number,
  ctx: { state: GameState; renderer: IsometricRenderer; input: InputManager },
): void {
  const _frameStart = performance.now();
  tickWaterAnimation();
  const _updateStart = performance.now();
  update(ctx.state, ctx.input);
  const _updateEnd = performance.now();
  perfStats.update = perfSmooth(perfStats.update, _updateEnd - _updateStart);
  renderFrame(ctx.renderer, ctx.state);
  const _frameEnd = performance.now();
  const totalMs = _frameEnd - _frameStart;
  perfStats.total = perfSmooth(perfStats.total, totalMs);
  recordFrameTime(totalMs);
  requestAnimationFrame((t) => gameLoop(t, ctx));
}

// ─── Extended Input (F3 debug, I inventory, Esc) ─────────────

function setupExtraKeys(state: GameState, input?: InputManager): void {
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'F3':
        e.preventDefault();
        state.ui.showDebug = !state.ui.showDebug;
        break;
      case 'i':
      case 'I':
        if (!state.quiz.active && !state.ui.dialog.active) {
          state.ui.showInventory = !state.ui.showInventory;
        }
        break;
      case 'b':
      case 'B':
        if (e.shiftKey) {
          // Shift+B: cycle terrain blend intensity (#84)
          const steps = [0, 0.5, 1.0, 1.5, 2.0];
          const curBlend = getBlendIntensity();
          let nextIdx = 0;
          for (let i = 0; i < steps.length; i++) {
            if (curBlend < steps[i] + 0.01) { nextIdx = i; break; }
            if (i === steps.length - 1) nextIdx = 0;
          }
          nextIdx = (nextIdx + 1) % steps.length;
          setBlendIntensity(steps[nextIdx]);
        } else if (!state.quiz.active && !state.ui.dialog.active) {
          toggleBook(state.knowledge);
          state.paused = state.knowledge.bookOpen;
          // Close inventory if book opens
          if (state.knowledge.bookOpen && state.ui.showInventory) {
            state.ui.showInventory = false;
          }
        }
        break;
      case 'Escape': {
        // Guard: don't show pause menu if full-screen modal or quiz is active
        const overlayBlocks =
          document.getElementById('customizerOverlay')?.style.display === 'flex' ||
          document.getElementById('subjectOverlay')?.style.display === 'flex' ||
          document.getElementById('mainMenu')?.style.display === 'flex' ||
          state.quiz.active;
        if (overlayBlocks) break;

        if (state.trade.active) {
          // If barter quiz is showing, escape closes just the quiz (#112 Phase 3)
          if (state.trade.barterQuiz) {
            state.trade.barterQuiz = null;
            state.trade.barterSelectedIndex = 0;
            syncBarterQuizDOM(state.trade);
          } else {
            closeTrade(state.trade);
            syncTradeDOM(state.trade, state.inventory);
            syncBarterQuizDOM(state.trade);
            state.paused = false;
          }
        } else if (state.knowledge.bookOpen) {
          state.knowledge.bookOpen = false;
          state.knowledge.currentArticleId = null;
          state.paused = false;
        } else if (state.ui.showInventory) {
          state.ui.showInventory = false;
        } else if (state.ui.dialog.active) {
          closeDialog(state.ui);
          cancelSpeech(state.voice); // Cancel voice on escape close (#76)
          state.pendingQuiz = null;
          state.pendingGateQuiz = null;
          state.pendingTrade = null;
          state.paused = false;
        } else if (document.getElementById('pauseMenu')?.style.display === 'flex') {
          document.getElementById('pauseMenu')!.style.display = 'none';
          state.paused = false;
        } else {
          showPauseMenu(state, input, {
            onSave: () => doSave(state),
            onMainMenu: () => { doSave(state); window.location.reload(); },
            onOptions: () => showOptionsOverlay(state, input),
            onBugReport: (desc) => captureBugReport(state, desc),
          });
        }
        break;
      }
      case 'T': // Shift+T: advance day/night by 10%
        if (e.shiftKey) {
          setTimeOfDay(getCycleProgress() + 0.1);
          invalidateShadowCache(); // #83 - force shadow recalc after time jump
        }
        break;
      case 'Tab': // Toggle buy/sell mode in trade panel (#112)
        if (state.trade.active && !state.trade.barterQuiz) {
          e.preventDefault();
          toggleTradeMode(state.trade);
          syncTradeDOM(state.trade, state.inventory);
          playSfx(state.sfx, 'menu_navigate');
        }
        break;
      case 'W': // Shift+W: cycle weather
        if (e.shiftKey) {
          const types: Array<'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'> = ['clear', 'cloudy', 'rain', 'storm', 'fog'];
          const cur = getWeatherInfo().type;
          const idx = types.indexOf(cur);
          setWeather(types[(idx + 1) % types.length]);
          invalidateShadowCache(); // #83 - weather affects shadow opacity
        }
        break;
      case 'f':
      case 'F':
        if (!e.shiftKey && !e.ctrlKey && !state.quiz.active && !state.ui.dialog.active) {
          toggleFlashlight();
        }
        break;
      case 'e':
      case 'E':
        // Use/consume best available status item (#70, #109)
        if (!e.shiftKey && !e.ctrlKey && !state.quiz.active && !state.ui.dialog.active && !state.trade.active) {
          // Priority: if injured and have bandage, use bandage first (#109)
          if (state.injury.injured && state.inventory.hasItem('bandage')) {
            state.inventory.removeItem('bandage', 1);
            const healAmt = applyBandaid(state.injury, state.status);
            playSfx(state.sfx, 'bandaid_use');
            addToast(state.ui, `🩹 Applied bandage! +${healAmt} energy`, '#88ccff', 2000);
            setTransientExpression(state, 'happy', 2000);
            // Start wound-care quiz after brief delay
            if (state.injury.pendingWoundQuiz) {
              state.injury.pendingWoundQuiz = false;
              const wq = getWoundCareQuestion();
              // Use quiz system with custom wound-care question
              startWoundCareQuiz(state, wq);
            }
            break;
          }
          // Normal consumable path
          const consumables = ['snack', 'water_flask', 'soap', 'mushroom', 'bandage', 'potion'];
          for (const itemId of consumables) {
            if (state.inventory.hasItem(itemId)) {
              const result = useStatusItem(state.status, itemId);
              if (result && result !== 'Already at full status!') {
                state.inventory.removeItem(itemId, 1);
                addToast(state.ui, result, '#88ccff', 2000);
                // SFX based on consumable type (#75)
                playSfx(state.sfx, itemId === 'water_flask' ? 'drink_water' : 'eat_food');
                break;
              } else if (result === 'Already at full status!') {
                addToast(state.ui, '✨ All stats are full!', '#aaa', 1200);
                break;
              }
            }
          }
        }
        break;
    }
  });
}

// ─── Entry Point ─────────────────────────────────────────────

async function main(): Promise<void> {
  const { state, renderer, input, hasSaveData } = await init();
  setupExtraKeys(state, input);
  _setupExtraKeyCapture(); // Numeric + R key capture for quiz accessibility (#94)

  // Restore fog-of-war preference from localStorage (#127)
  const fogPref = localStorage.getItem('emilys_game_fog_enabled');
  if (fogPref !== null) {
    setFogEnabled(fogPref === '1');
  }

  // Apply Tesla mode badge on startup (#185)
  if (isTeslaMode()) {
    const teslaBadge = document.getElementById('teslaBadge');
    if (teslaBadge) teslaBadge.classList.add('active');
  }

  // Wire HTML HUD buttons
  wireHudButtons(
    () => { if (!state.quiz.active && !state.ui.dialog.active) state.ui.showInventory = !state.ui.showInventory; },
    () => { state.ui.showDebug = !state.ui.showDebug; },
    () => { doSave(state); addToast(state.ui, 'Game saved!', '#4caf50', 1500); },
    // Slot save
    (slot: number) => {
      const data = buildSaveData(state);
      saveToSlot(slot, data);
      markSaveSlotsDirty();
      addToast(state.ui, `Saved to slot ${slot + 1}!`, '#4caf50', 1500);
    },
    // Slot load
    (slot: number) => {
      const data = loadFromSlot(slot);
      if (data) {
        applySaveData(state, data);
        markSaveSlotsDirty();
        addToast(state.ui, `Loaded slot ${slot + 1}!`, '#88ccff', 1500);
      }
    },
    // Slot delete
    (slot: number) => {
      deleteSlot(slot);
      markSaveSlotsDirty();
      addToast(state.ui, `Slot ${slot + 1} deleted`, '#ff8844', 1500);
    },
  );

  // Debug hooks for testing (available via window.__gameDebug)
  // B5 micro-slice 11.5 (#268): __gameDebug surface extracted to
  // ./game/debug-api.ts. See createGameDebug() for the full API.
  (window as any).__gameDebug = createGameDebug({
    state,
    input,
    getLastDialogNpcId: () => _lastDialogNpcId,
    getPendingPoopBurst: () => _pendingPoopBurst,
    setPendingPoopBurst: (v: boolean) => { _pendingPoopBurst = v; },
    doSave,
    checkCosmeticUnlocks,
    shouldAutoRead: _shouldAutoRead,
  });

  addToast(state.ui, 'Welcome! Use WASD to move, Space to interact.', '#88ccff', 4000);
  if (isTestMode()) {
    addToast(state.ui, '🧪 Test mode — LLM disabled', '#ffaa00', 3000);
  } else if (isWasmReady() && RENDER_CONFIG.useWasmRenderer) {
    addToast(state.ui, '⚡ WASM rendering core active', '#7fff7f', 3000);
  }

  // B5 micro-slice 11.6 (#268): HUD DOM event wiring extracted to
  // ./game/dom-wiring.ts. See wireHudEvents() for the full wiring.
  wireHudEvents({ state, input, onBookClose: () => { state.paused = false; } });

  // ─── Main Menu / New Game Flow ─────────────────────────────
  if (!isTestMode()) {
    // Welcome splash for first-time players (#117)
    await showWelcomeSplash();

    const choice = await showMainMenu(hasSaveData, () => showOptionsOverlay(null));

    if (choice === 'new-game') {
      resetGameState(state);
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
    } else if (choice.startsWith('load-slot-')) {
      const slot = parseInt(choice.replace('load-slot-', ''));
      const data = loadFromSlot(slot);
      if (data) {
        applySaveData(state, data);
        addToast(state.ui, `Loaded slot ${slot + 1}!`, '#88ccff', 1500);
      }
    }
    // 'continue' → auto-save already loaded by init()
  }

  // Load MIDI tracks in background (non-blocking, oscillator tracks work immediately)
  initMidiTracks(state.music).then(() => {
    if (getTotalTrackCount() > 4) {
      console.log(`[Music] ${getTotalTrackCount()} MIDI tracks available`);
    }
    // Auto-start music after tracks are ready if music is enabled and not muted.
    // Skip in test mode — tests control music state explicitly.
    if (!isTestMode() && state.music.settings.enabled && !state.music.settings.muted) {
      musicPlay(state.music);
    }
  });

  // Load sampled SFX in background (oscillator SFX work immediately as fallback)
  initSampledSfxPipeline(state.sfx).catch(e => console.warn('[SFX] Sample init failed:', e));

  requestAnimationFrame((t) => gameLoop(t, { state, renderer, input }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
