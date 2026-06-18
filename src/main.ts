/**
 * main.ts - Game loop, initialization, and system integration.
 * Ties together: world gen, rendering, input, mechanics, quiz, inventory, UI.
 * TODO: DOC - game loop sequence diagram
 */

import { WORLD_CONFIG, PLAYER_CONFIG } from './config/game.config';
import { perfStats, perfSmooth, recordFrameTime } from './engine/perf';
import { ASSET_DEFS } from './config/assets.config';
import { IsometricRenderer, setDialogNpc } from './rendering/render';
import { InputManager } from './game/input';
import { isTutorialActive, tickTutorial } from './game/tutorial';
import { loadCharacterSprite } from './asset-pipeline/sprites';
import { feedEntropy } from './engine/gen';
import { isFootprintWalkable, interact, autoCollect, resolveQuizGate, getCellAt } from './engine/mechanics';
import { startQuiz, quizNavigate, quizSubmit, quizClose, quizReward, quizSelectIndex, getDifficultyForPosition, recordQuizResult, modulateDifficulty } from './game/quiz';
import { addToast, showDialog, advanceDialog, closeDialog } from './ui/ui';
// B5 micro-slice 11.40 (#268): slot save/load/delete handlers extracted
// to ./game/slot-actions.ts. Each make*Handler(state) returns a closure
// used as a wireHudButtons callback.
// B5 micro-slice 11.41 (#268): new-game onboarding flow (reset +
// customizer + age band + subjects + tutorial) and the load-slot- helper
// extracted to ./game/new-game-flow.ts. main() now branches into
// runNewGameFlow(state) or loadSlotIntoState(state, slot).
// B5 micro-slice 11.42 (#268): MIDI + sampled-SFX background loading
// extracted to ./game/audio-bootstrap.ts. bootstrapAudio(state) kicks
// off both pipelines as fire-and-forget; oscillator fallbacks cover
// the loading window so the game loop can start in parallel.
// B5 micro-slice 11.43 (#268): post-init HUD wiring + debug surface +
// startup toasts extracted to ./game/startup-hud.ts. wireStartupHud()
// wraps the fog-pref restore, Tesla badge, wireHudButtons() with slot
// action handlers, __gameDebug surface, welcome toasts, and wireHudEvents().
// B5 micro-slice 11.44 (#268): main-menu flow orchestration extracted
// to ./game/menu-flow.ts. runMenuFlow() handles the welcome splash +
// main menu choice dispatch (new-game → runNewGameFlow, load-slot-N →
// loadSlotIntoState, continue → no-op). Skips entirely in test mode.
import { runMenuFlow } from './game/menu-flow';
import { bootstrapAudio } from './game/audio-bootstrap';
import { wireStartupHud } from './game/startup-hud';
// B5 micro-slice 11.10 (#268): showMainMenu extracted to ./game/main-menu.ts.
// (B5.44 — usage moved to ./game/menu-flow.ts.)
// B5 micro-slice 11.11 (#268): showPauseMenu extracted to ./game/pause-menu.ts
// with dependency-inversion for save/options/bug-report/main-menu actions.
// (showPauseMenu unused in main.ts — called from input-extra-keys.ts)
// B5 micro-slice 11.12 (#268): showAgeSelection extracted to
// ./game/age-selection.ts. Pure DOM overlay with no main.ts callbacks.
// (B5.41 — usage moved to ./game/new-game-flow.ts)
// B5 micro-slice 11.17 (#268): showOptionsOverlay extracted from main.ts
// to ./game/options-overlay.ts. Pure DOM (volume sliders, touch controls,
// fog, Tesla mode, replay tutorial). The main menu passes it as a
// callback to ./game/menu-flow.ts via dependency-inversion (B5.44).
import { showOptionsOverlay } from './game/options-overlay';
// B5 micro-slice 11.13 (#268): renderWildlife + the _revealedCreatures /
// _eyeBlinkTimer / _eyeSwayPhase module-level state extracted to
// ./game/wildlife-render.ts. getRevealedCreatures() lives there too
// and is imported directly by debug-api.ts (no DI needed).
import { getNpcPersona } from './config/npc.config';
import { MICRO_TILE_DEFS } from './config/tiles.config';
import { tickWaterAnimation, evictDistantChunks } from './rendering/terrain-cache';

import { searchBookArticles } from './ui/book-content';
import { openArticle } from './game/knowledge';
import { getCycleProgress } from './rendering/lighting';
import { getWeatherInfo } from './rendering/weather';
import { isFlashlightOn } from './rendering/local-lights';
// invalidateShadowCache now called from input-extra-keys.ts (B5.20)
import { updateFog } from './rendering/fog';
import {
  updateWildlife, interactWithWildlife,
} from './game/wildlife';
// B5 micro-slice 11.13 (#268): getAnimationOffset, getTimeSlot, getSpecies,
// getEmojiSprite, and the _revealedCreatures state moved to
// ./game/wildlife-render.ts (only used inside renderWildlife).
// B5 micro-slice 11.39 (#268): most thought-bubble exports moved to
// ./game/debug-expose.ts (__bubbles global). triggerHint/tickBubbles/
// dismissBubble remain here for main.ts hot-path call sites.

import {
  triggerHint, tickBubbles, dismissBubble,
} from './ui/thought-bubbles';
import {
  openTrade, tradeNavigate,
  executeTrade, executeSell, getSellPrice, getSellableItems,
  syncTradeDOM,
  generateBarterQuiz, shouldTriggerBarter, barterNavigate, submitBarterAnswer,
  syncBarterQuizDOM, getTradeDialog,
} from './game/trading';
import {
  tickStatus, getDebuffs,
  CRITICAL_THRESHOLD,
} from './game/status';
import {
  triggerInjuryFlash,
  setDiarrheaOverlay,
} from './rendering/debuff-visuals';
import {
  checkHazardInjury, applyWoundQuizBonus,
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
} from './game/chunk-lifecycle';
// B5 micro-slice 11.15 (#268): applySaveData extracted from main.ts to
// ./game/save-apply.ts. Pure orchestration — sequences deserializers across
// ~15 subsystems. (B5.41 — usage moved to ./game/new-game-flow.ts.)
// B5 micro-slice 11.21 (#268): buildSaveData + doSave extracted from
// main.ts to ./game/save-build.ts. Sibling to save-apply.ts. Re-imported
// here so main.ts can pass doSave as a callback to setupExtraKeys +
// debug-api without the new module depending on main.ts.
import { doSave } from './game/save-build';
// B5 micro-slice 11.16 (#268): resetGameState extracted from main.ts to
// ./game/game-reset.ts. (B5.41 — usage moved to ./game/new-game-flow.ts.)
// B5 micro-slice 11.18 (#268): checkBubbleTriggers extracted from main.ts
// to ./game/bubble-triggers.ts. Pure logic — evaluates state and calls
// triggerHint() per matching hint category. The lastBubbleBiomeId and
// lastBubbleDiffTier "last seen" state moved with the function.
// resetBubbleTriggerState() is called by resetGameState (in game-reset.ts).
import { checkBubbleTriggers } from './game/bubble-triggers';
// B5 micro-slice 11.22 (#268): showWelcomeSplash + shouldShowWelcome + FIRST_RUN_KEY
// extracted from main.ts to ./game/welcome-splash.ts. Pure DOM overlay.
// (B5.44 — usage moved to ./game/menu-flow.ts.)
// B5 micro-slice 11.23 (#268): captureBugReport extracted from main.ts
// to ./game/bug-report.ts. Bundles canvas screenshot + game state into
// a downloadable JSON. Pure function (no module state, no side effects).
import { captureBugReport } from './game/bug-report';
// B5 micro-slice 11.24 (#268): shouldAutoRead + autoReadQuizQuestion
// extracted from main.ts to ./game/auto-read.ts. Decides whether to
// auto-read quiz questions aloud based on age band + voice settings.
import { shouldAutoRead as _shouldAutoRead, autoReadQuizQuestion as _autoReadQuizQuestion } from './game/auto-read';
// B5 micro-slice 11.25 (#268): checkCosmeticUnlocks extracted from main.ts
// to ./game/cosmetic-unlocks.ts. Checks quiz + wildlife progression against
// the unlock table and grants new cosmetics (with toasts).
import { checkCosmeticUnlocks } from './game/cosmetic-unlocks';
// B5 micro-slice 11.26 (#268): waitForLlm extracted from main.ts to
// ./game/llm-gate.ts. Shows LLM splash, polls health, supports dev skip.
import { waitForLlm } from './game/llm-gate';
import { renderFrame as renderFrameImpl } from './rendering/render-frame';
// B5 micro-slice 11.19 (#268): handleInteraction extracted from main.ts
// to ./game/interaction-handler.ts. The _lastDialogNpcId +
// _pendingPoopBurst module-level state moved with the function
// (state-moves-with-consumer pattern). main.ts uses these accessors
// from the dialog queue (update ~L725) and render path (~L1559).
import {
  handleInteraction,
  getLastDialogNpcId,
  setLastDialogNpcId,
} from './game/interaction-handler';
import {
  setBiome as musicSetBiome,
} from './game/audio/music';
import {
  playSfx,
  updateListenerPosition,
  playFootstep, resetFootstepCounter,
  updateAmbienceEnhanced, tickAnimalCalls, playRoosterCrow,
} from './game/audio/sfx';
// B5 micro-slice 11.9 (#268): positional-audio data + scanner extracted
// from main.ts to ./game/audio/positional-sources.ts. playPositionalSfx
// also moved there (used internally by scanPositionalAudioSources).
import { scanPositionalAudioSources } from './game/audio/positional-sources';
import {
  speakLine, cancelSpeech,
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
import { DIARRHEA_CONFIG } from './game/illness';
// B5 micro-slice 11.3 (#268): transient expression system extracted to
// circular dependency with main.ts GameState definition.
import {
  setTransientExpression,
  tickExpressionOverride,
} from './game/expression';
// B5 micro-slice 11.4 (#268): GameState interface + createGameState factory
// extracted to ./game/game-state.ts. B5.38 (#268): state init+save-restore
// extracted to ./game/state-init.ts. createInitialState() wraps the
// factory + save overrides + chunk generation.
import { type GameState } from './game/game-state';
// B5 micro-slice 11.5 (#268): __gameDebug surface extracted to
// ./game/debug-api.ts. (B5.43 — usage moved to ./game/startup-hud.ts.)
// B5 micro-slice 11.6 (#268): HUD DOM event wiring extracted to
// ./game/dom-wiring.ts. (B5.43 — usage moved to ./game/startup-hud.ts.)

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
// B5 micro-slice 11.26 (#268): waitForLlm extracted to ./game/llm-gate.ts.
// Shows LLM splash, polls health, supports dev skip button + test mode.
// B5 micro-slice 11.35 (#268): canvas setup + responsive resize extracted
// to ./game/canvas-bootstrap.ts. setupCanvasAndRenderer() owns the canvas
// element, the IsometricRenderer construction, and the resize listeners.
// B5 micro-slice 11.36 (#268): wordlist + biome seed init extracted to
// ./game/wordlist-bootstrap.ts. bootstrapWordlist() handles the test-mode
// vs production branch (no LLM in tests; non-blocking scrambled fallback
// + LLM swap in production, #26).
// B5 micro-slice 11.37 (#268): asset + content + WASM pre-roll extracted
// to ./game/asset-bootstrap.ts. bootstrapAssets() awaits SVG tile preload,
// runs sync pre-renders, then awaits book content + WASM (with fallback).
// B5 micro-slice 11.38 (#268): state init + save restore extracted to
// ./game/state-init.ts. createInitialState() loads save, builds state via
// factory, layers save overrides, applies starter items for new games,
// and generates initial chunks.
// B5 micro-slice 11.39 (#268): window.__game* debug exposures extracted
// to ./game/debug-expose.ts. exposeDebugGlobals(state) sets __gameState,
// __wildlife, __lighting, __bubbles, __trade (read by E2E tests #68/71/72/111/112).
import { setupCanvasAndRenderer } from './game/canvas-bootstrap';
import { bootstrapWordlist } from './game/wordlist-bootstrap';
import { bootstrapAssets } from './game/asset-bootstrap';
import { createInitialState } from './game/state-init';
import { exposeDebugGlobals } from './game/debug-expose';

// ─── Initialization ──────────────────────────────────────────

async function init(): Promise<{ state: GameState; renderer: IsometricRenderer; input: InputManager; hasSaveData: boolean }> {
  // --- LLM gate: must be connected before proceeding ---
  await waitForLlm();

  // Canvas + renderer (responsive resize wired internally)
  const renderer = setupCanvasAndRenderer();

  const input = new InputManager();

  // Wordlist + biome seed bootstrap (non-blocking — LLM wordlist swaps in async)
  bootstrapWordlist();

  // NOTE: cleanupLlmSessions() available but not auto-called —
  // BitNet server lacks /v1/sessions endpoint. Call manually if needed.

  // Asset + content + WASM pre-roll (tile preload blocks render, #82)
  await bootstrapAssets();

  // State init + save restore (creates GameState, generates initial chunks)
  const { state, hasSaveData } = createInitialState();

  // Expose debug globals for E2E tests + browser DevTools
  exposeDebugGlobals(state);

  return { state, renderer, input, hasSaveData };
}

// ─── Quiz Accessibility Helpers (#94) ────────────────────────
// B5 micro-slice 11.24 (#268): _shouldAutoRead + _autoReadQuizQuestion
// extracted to ./game/auto-read.ts. Aliased imports retain call-site
// stability (no rename of all 2 call sites).

// ─── Update ──────────────────────────────────────────────────


/**
 * Handle input while a quiz is active.
 * B5 micro-slice 11.28 (#268): extracted from update() in main.ts.
 * Manages: numeric/R key shortcuts, quiz result branch (correct/wrong/idk),
 * quiz reward application, post-quiz flow (trade or unpause).
 * Returns true if a quiz is active and handled input (caller should
 * call input.endFrame() and return early).
 */
function handleQuizInput(state: GameState, justKeys: any): boolean {
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
  }
  return false;
}

/**
 * Handle input while a dialog is active.
 * B5 micro-slice 11.29 (#268): extracted from update() in main.ts.
 * Manages: dialog advance/close, post-dialog flow (pending quiz, trade,
 * or unpause). Caller must call input.endFrame() after this returns true.
 */
function handleDialogInput(state: GameState, justKeys: any): boolean {
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
  }
  return false;
}

/**
 * Handle input while a trade panel is active.
 * B5 micro-slice 11.30 (#268): extracted from update() in main.ts.
 * Manages: barter quiz input, sell/buy navigation, post-trade flow.
 * The 'input' param is needed for the inner barter-quiz early-return.
 * Returns true if a trade is active and handled input (caller must
 * call input.endFrame() and return early).
 */
function handleTradeInput(state: GameState, justKeys: any, input: InputManager): boolean {
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
    return true;
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
  return true;
  }
  return false;
}

/**
 * Run per-frame status ticks (survival, tutorial, audio, wildlife, fog, bubbles).
 * B5 micro-slice 11.31 (#268): extracted from update() in main.ts.
 * All subsystems are throttled (frame-count modulo) to avoid CPU churn.
 * No early-return semantics — runs every frame, no input.endFrame() needed.
 */
function tickSubsystems(state: GameState, justKeys: any): void {
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
  
  

}

/**
 * Check the diarrhea control lock (#133): when locked, the player
 * cannot move or interact until the lock expires. B5 micro-slice 11.32 (#268).
 * Returns true if input should be absorbed (caller must endFrame + return).
 */
function handleDiarrheaControlLock(state: GameState): boolean {
  if (!state.diarrhea.diarrheaLocked) return false;
  if (state.frameCount >= state.diarrhea.diarrheaLockUntil) {
    // Lock expired — recover
    state.diarrhea.diarrheaLocked = false;
    setDiarrheaOverlay(false);
    addToast(state.ui, '😮‍💨 Phew... feeling better now.', '#4fc3f7', 2500);
    playSfx(state.sfx, 'pickup_item'); // relief SFX
    return false;
  }
  // Still locked — caller will skip the rest of the frame
  return true;
}

/**
 * Handle player movement (or idle state) for the current frame.
 * B5 micro-slice 11.33 (#268): extracted from update() in main.ts.
 * Manages: speed debuffs, footprint collision, footstep SFX,
 * sinkDepth (water/river), hazard injury on wall bump,
 * direction tracking, facing pose, sprite animation, auto-collect,
 * camera follow, chunk loading.
 * Sets state.player.isMoving = true/false as a side effect; callers
 * can read it via state.player.isMoving.
 */
function handleMovement(state: GameState, input: InputManager): void {
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


}

/**
 * Handle space-key interaction (NPC, tile, eat-worms).
 * B5 micro-slice 11.34 (#268): extracted from update() in main.ts.
 * Tries wildlife first, then facing-direction tile, then 4 cardinal
 * neighbors, then eat-worms desperation. Delegates result to
 * handleInteraction (from interaction-handler.ts).
 */
function handleSpaceInteraction(state: GameState, justKeys: any): void {
  if (justKeys.interact && !state.player.isMoving) {
// --- Interaction (Space, edge-detected) ---
if (justKeys.interact && !state.player.isMoving) {
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


  }
}

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

  if (handleQuizInput(state, justKeys)) {
    input.endFrame();
    return;
  }

  if (handleDialogInput(state, justKeys)) {
    input.endFrame();
    return;
  }

  if (handleTradeInput(state, justKeys, input)) {
    input.endFrame();
    return;
  }

  // --- Diarrhea control lock check (#133) ---
  if (handleDiarrheaControlLock(state)) {
    input.endFrame();
    return;
  }

  handleMovement(state, input);

  handleSpaceInteraction(state, justKeys);  // --- Toggle Debug (F3) ---
  // Handled in extended input listener below

  // Per-frame status ticks (survival, tutorial, audio, wildlife, fog, bubbles)
  tickSubsystems(state, justKeys);

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
// B5 micro-slice 11.25 (#268): checkCosmeticUnlocks extracted to
// ./game/cosmetic-unlocks.ts. Pure side-effecting function that
// checks progression and grants new cosmetics with toasts.

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
// B5 micro-slice 11.23 (#268): captureBugReport extracted to
// ./game/bug-report.ts. Bundles canvas screenshot + game state into
// a downloadable JSON. Pure function (no module state).

// ─── Welcome Splash (#117) ──────────────────────────────────
// B5 micro-slice 11.22 (#268): showWelcomeSplash + shouldShowWelcome
// extracted to ./game/welcome-splash.ts. FIRST_RUN_KEY moved with them.

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

// B5 micro-slice 11.27 (#268): renderFrame extracted to
// ./rendering/render-frame.ts. Composes 7 render passes; perfStats
// is passed as a parameter (caller owns the timing aggregation).
function renderFrame(
  renderer: IsometricRenderer,
  state: GameState,
  perfStats: { render: number; particles: number; wildlife: number; lighting: number; weather: number; update: number; total: number },
): void {
  renderFrameImpl(renderer, state, perfStats);
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
  renderFrame(ctx.renderer, ctx.state, perfStats);
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

  // HUD wiring + debug surface + startup toasts (#268 B5.43)
  wireStartupHud(state, input);

  // ─── Main Menu / New Game Flow (#268 B5.44) ─────────────────
  await runMenuFlow(state, hasSaveData, () => showOptionsOverlay(null));

  // Audio bootstrap (background; oscillator fallbacks cover loading window)
  bootstrapAudio(state);

  requestAnimationFrame((t) => gameLoop(t, { state, renderer, input }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
