/**
 * main.ts - Game loop, initialization, and system integration.
 * Ties together: world gen, rendering, input, mechanics, quiz, inventory, UI.
 * TODO: DOC - game loop sequence diagram
 */

import { WORLD_CONFIG, PLAYER_CONFIG, RENDER_CONFIG } from './config/game.config';
import { perfStats, perfSmooth, recordFrameTime } from './engine/perf';
import { getBiome } from './config/biomes.config';
import { ASSET_DEFS } from './config/assets.config';
import { IsometricRenderer, setDialogNpc } from './rendering/render';
import { InputManager } from './game/input';
import { isTeslaMode } from './game/platform';
import { initTutorial, isTutorialActive, tickTutorial, shouldShowTutorial } from './game/tutorial';
import { characterVariations, loadCharacterSprite, clearVariationCache } from './asset-pipeline/sprites';
import { setWordlist, setBiomeNoiseSeed, feedEntropy, restoreEntropyBuffer } from './engine/gen';
import { generateWordlist, checkLlmHealth, isTestMode } from './engine/llm';
import { getScrambledWordlist } from './config/wordlists.asset';
import { isFootprintWalkable, interact, autoCollect, resolveQuizGate, getCellAt } from './engine/mechanics';
import { createInventory } from './game/inventory';
import { createQuizState, startQuiz, quizNavigate, quizSubmit, quizClose, quizReward, quizSelectIndex, getDifficultyForPosition, createStreakState, recordQuizResult, modulateDifficulty } from './game/quiz';
import { createUIState, addToast, showDialog, advanceDialog, closeDialog, renderUI, wireHudButtons, markSaveSlotsDirty, syncStatusBars, syncMusicUI, syncSfxUI, syncVoiceUI } from './ui/ui';
import { loadGame, saveToSlot, loadFromSlot, deleteSlot } from './game/save';
// B5 micro-slice 11.10 (#268): showMainMenu extracted to ./game/main-menu.ts.
// The Options callback is wired here so this module stays decoupled.
import { showMainMenu } from './game/main-menu';
// B5 micro-slice 11.11 (#268): showPauseMenu extracted to ./game/pause-menu.ts
// with dependency-inversion for save/options/bug-report/main-menu actions.
// (showPauseMenu unused in main.ts — called from input-extra-keys.ts)
// B5 micro-slice 11.12 (#268): showAgeSelection extracted to
// ./game/age-selection.ts. Pure DOM overlay with no main.ts callbacks.
import { showAgeSelection } from './game/age-selection';
// B5 micro-slice 11.17 (#268): showOptionsOverlay extracted from main.ts
// to ./game/options-overlay.ts. Pure DOM (volume sliders, touch controls,
// fog, Tesla mode, replay tutorial). Takes optional state + inputMgr.
// The two existing call sites (pause menu, main menu) pass them through
// unchanged — the new module's signature is identical.
import { showOptionsOverlay } from './game/options-overlay';
// B5 micro-slice 11.13 (#268): renderWildlife + the _revealedCreatures /
// _eyeBlinkTimer / _eyeSwayPhase module-level state extracted to
// ./game/wildlife-render.ts. getRevealedCreatures() lives there too
// and is imported directly by debug-api.ts (no DI needed).
import { renderWildlife } from './game/wildlife-render';
import { getNpcPersona, getShopPersona } from './config/npc.config';
import { preloadTiles } from './rendering/tiles';
import { MICRO_TILE_DEFS } from './config/tiles.config';
import { initWasmRenderer, isWasmReady, wasmBenchmark, updateWasmConfig } from './rendering/wasm-bridge';
import { clearTerrainCache, tickWaterAnimation, evictDistantChunks } from './rendering/terrain-cache';
import { clearObjectCache } from './rendering/render';
import { preloadEmojiSprites } from './asset-pipeline/emoji-cache';
import { preloadAssetSprites } from './asset-pipeline/asset-sprites';
import { preloadNpcSprites } from './asset-pipeline/npc-sprites';
import { initMinimap, renderMinimap } from './rendering/minimap';

import { searchBookArticles, initBookContent, getBookContentStats } from './ui/book-content';
import { createKnowledgeState, syncBookUI, showSubjectSelection, openArticle } from './game/knowledge';
import { createAgeProfile, setAgeBand } from './game/age-profile';
import { showCustomizer, createDefaultVariation, deserializeVariation, setUnlockedCosmetics } from './ui/customizer';
import { getCosmeticById } from './config/cosmetics.config';
import type { AgeBand } from './types/content-pack.types';
import { checkAllUnlocks, type ProgressionData } from './config/cosmetics.config';
import { updateAndRenderParticles } from './rendering/particles';
import { tickLighting, setTimeOfDay, getCycleProgress, getTimeOfDay, getPlayedSeconds } from './rendering/lighting';
import { updateAndRenderWeather, getWeatherInfo, didLightningStrike } from './rendering/weather';
import { clearLights, addPointLight, addFlashlight, renderLocalLights, isFlashlightOn } from './rendering/local-lights';
import { FIRE_VARIANTS, FIRE_ASSET_KEYS } from './config/fire.config';
// invalidateShadowCache now called from input-extra-keys.ts (B5.20)
import { updateFog, renderFog, setFogEnabled, deserializeVisited } from './rendering/fog';
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
  createPlayerStatus, tickStatus, getDebuffs,
  CRITICAL_THRESHOLD,
} from './game/status';
import {
  initDebuffVisuals, updateBlurOverlay, updateFlies, renderFlies,
  triggerInjuryFlash, updateInjuryFlash,
  setDiarrheaOverlay, updateDiarrheaOverlay,
  spawnPoopBurst, updateAndRenderPoopParticles, renderPoopMarkers,
} from './rendering/debuff-visuals';
import {
  createInjuryState, checkHazardInjury, applyWoundQuizBonus,
  getInjurySpeedMult,
} from './game/injury';
// B5 micro-slice 11.8 (#268): inline HYGIENE_QUESTIONS / INSECT_QUESTIONS +
// _startHygieneQuiz / _startInsectQuiz extracted from main.ts to
// ./game/quiz-specials.ts. startWoundCareQuiz now lives in ./game/injury.ts
// next to its WOUND_CARE_QUESTIONS data + getWoundCareQuestion shuffler.
import { startInsectQuiz } from './game/quiz-specials';
// B5 micro-slice 11.14 (#268): 6 chunk-lifecycle functions + _pendingResolved
// module-level state extracted from main.ts to ./game/chunk-lifecycle.ts.
// Maintained as a thin wrapper in main.ts (see maybeLoadChunks) because it
// chains eviction + auto-save on chunk exit.
import {
  loadChunksOnBoundaryCross,
  ensureChunksAround,
  setPendingResolvedCells,
} from './game/chunk-lifecycle';
// B5 micro-slice 11.15 (#268): applySaveData extracted from main.ts to
// ./game/save-apply.ts. Pure orchestration — sequences deserializers across
// ~15 subsystems (entropy, cosmetics, status, injury, music, sfx, voice,
// streak, fog, age, playtime, touch mode, resolved cells, chunk regen).
import { applySaveData } from './game/save-apply';
// B5 micro-slice 11.21 (#268): buildSaveData + doSave extracted from
// main.ts to ./game/save-build.ts. Sibling to save-apply.ts. Re-imported
// here so main.ts can pass doSave as a callback to setupExtraKeys +
// debug-api without the new module depending on main.ts.
import { buildSaveData, doSave } from './game/save-build';
// B5 micro-slice 11.16 (#268): resetGameState extracted from main.ts to
// ./game/game-reset.ts. Sibling to save-apply — both orchestrate calls
// into already-extracted factory/clear functions across subsystems.
import { resetGameState } from './game/game-reset';
// B5 micro-slice 11.18 (#268): checkBubbleTriggers extracted from main.ts
// to ./game/bubble-triggers.ts. Pure logic — evaluates state and calls
// triggerHint() per matching hint category. The lastBubbleBiomeId and
// lastBubbleDiffTier "last seen" state moved with the function.
// resetBubbleTriggerState() is called by resetGameState (in game-reset.ts).
import { checkBubbleTriggers } from './game/bubble-triggers';
// B5 micro-slice 11.19 (#268): handleInteraction extracted from main.ts
// to ./game/interaction-handler.ts. The _lastDialogNpcId +
// _pendingPoopBurst module-level state moved with the function
// (state-moves-with-consumer pattern). main.ts uses these accessors
// from the dialog queue (update ~L725) and render path (~L1559).
import {
  handleInteraction,
  getLastDialogNpcId,
  setLastDialogNpcId,
  getPendingPoopBurst,
  setPendingPoopBurst,
} from './game/interaction-handler';
import {
  createMusicState, play as musicPlay,
  startDucking, stopDucking, setBiome as musicSetBiome,
  deserializeMusicSettings,
  initMidiTracks, getTotalTrackCount, updateMidiProgress,
} from './game/audio/music';
import {
  createSfxState, playSfx,
  deserializeSfxSettings,
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
  deserializeVoiceSettings,
} from './game/audio/npc-voice';
// B5 micro-slice 11.1 (#268): extra key queue extracted to
// ./game/input-extra-keys.ts (quiz accessibility, #94).
import {
  setupExtraKeyCapture as _setupExtraKeyCapture,
  consumeExtraKey as _consumeExtraKey,
  clearExtraKeys as _clearExtraKeys,
  setupExtraKeys,
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

// Track NPC id for voice lines during dialog (#76) — B5.19: moved to
// ./game/interaction-handler.ts with getLastDialogNpcId/setLastDialogNpcId
// accessors

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
        setDialogNpc(getLastDialogNpcId()); // Reset mouth cycle for new line (#113)
        const line = state.ui.dialog.lines[state.ui.dialog.currentLine];
        if (line) speakLine(state.voice, line, state.ui.dialog.npcName === 'Sign' ? null : getLastDialogNpcId());
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
      setLastDialogNpcId(null);
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

// B5 micro-slice 11.19 (#268): handleInteraction (195 lines) + 2
// module-level vars (_lastDialogNpcId, _pendingPoopBurst) extracted
// to ./game/interaction-handler.ts. State-moves-with-consumer pattern
// (B5.13/B5.18). main.ts uses getLastDialogNpcId/setLastDialogNpcId
// from dialog queue (update ~L725), getPendingPoopBurst/setPendingPoopBurst
// from render path (~L1559).

// ─── Save ────────────────────────────────────────────────────

/** Build SaveData from current game state */
// B5 micro-slice 11.21 (#268): buildSaveData (33 lines) + doSave (3 lines)
// extracted from main.ts to ./game/save-build.ts. Sibling to
// ./game/save-apply.ts (B5.15). Pure data serialization — no module-level
// state. main.ts imports both and re-passes doSave to setupExtraKeys +
// debug-api as a function reference.

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
// B5 micro-slice 11.17 (#268): showOptionsOverlay (174 lines) extracted
// to ./game/options-overlay.ts. Pure DOM manipulation with optional
// game-state + input-mgr coupling. No module-level state moves.

// B5 micro-slice 11.10 (#268): showMainMenu extracted from main.ts
// to ./game/main-menu.ts. The Options button inside the menu
// delegates to a caller-supplied callback so this module stays
// independent of showOptionsOverlay.


/** Reset game state for a new game */
// B5 micro-slice 11.16 (#268): resetGameState (54 lines) extracted to
// ./game/game-reset.ts. Sibling to save-apply.ts; both are pure
// orchestration. No module-level state moves.

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
// B5 micro-slice 11.18 (#268): checkBubbleTriggers (173 lines) + 2
// module-level vars (lastBubbleBiomeId, lastBubbleDiffTier) extracted
// to ./game/bubble-triggers.ts. Pure logic — evaluates state and calls
// triggerHint() for each matching hint category. Sister to wildlife-render.

// B5 micro-slice 11.13 (#268): renderWildlife + the _revealedCreatures /
// _eyeBlinkTimer / _eyeSwayPhase state moved to ./game/wildlife-render.ts.

// ─── Render ──────────────────────────────────────────────────
// B5 micro-slice 11.19 (#268): _pendingPoopBurst state moved to
// ./game/interaction-handler.ts. renderFrame uses getPendingPoopBurst()
// + setPendingPoopBurst(false) to drain the flag after spawning the VFX.

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
  if (getPendingPoopBurst()) {
    setPendingPoopBurst(false);
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

// B5 micro-slice 11.20 (#268): setupExtraKeys (152 lines, hot-keys for
// F3/i/B/Escape/Shift+T/Tab/Shift+W/F/E) extracted from main.ts to
// ./game/input-extra-keys.ts. The existing quiz-accessibility helpers
// (setupExtraKeyCapture, consumeExtraKey, clearExtraKeys) stay in the
// same module. main.ts wires doSave + captureBugReport via SetupExtraKeysDeps.

// ─── Entry Point ─────────────────────────────────────────────

async function main(): Promise<void> {
  const { state, renderer, input, hasSaveData } = await init();
  setupExtraKeys(state, input, { doSave, captureBugReport });
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
