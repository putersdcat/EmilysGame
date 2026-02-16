/**
 * main.ts - Game loop, initialization, and system integration.
 * Ties together: world gen, rendering, input, mechanics, quiz, inventory, UI.
 * TODO: DOC - game loop sequence diagram
 */

import { WORLD_CONFIG, PLAYER_CONFIG, RENDER_CONFIG, getDifficulty } from './config/game.config';
import { perfStats, perfSmooth } from './perf';
import { getBiome, BIOME_DEFS } from './config/biomes.config';
import { ASSET_DEFS } from './config/assets.config';
import { DIRECTION_WORDS } from './config/entropy.config';
import { IsometricRenderer, setDialogNpc, type Camera } from './render';
import { InputManager } from './input';
import { characterVariations, loadCharacterSprite, loadCharacterSpriteAsync, clearVariationCache, generateIdleCharacterSVG, type CharacterVariation } from './sprites';
import { generateChunkSync, setWordlist, setBiomeNoiseSeed, feedEntropy, getEntropyBuffer, restoreEntropyBuffer, getWaterDebugInfo, getLockKeyDebugInfo, getChunkClimate, type ChunkData, type BorderConstraints } from './gen';
import { generateWordlist, checkLlmHealth, isTestMode } from './llm';
import { getScrambledWordlist } from './config/wordlists.asset';
import { isWalkable, interact, autoCollect, resolveQuizGate, type InteractionResult } from './mechanics';
import { createInventory, type Inventory } from './inventory';
import { createQuizState, startQuiz, quizNavigate, quizSubmit, quizClose, quizReward, quizSelectIndex, getDifficultyForPosition, blendDifficulty, createStreakState, recordQuizResult, modulateDifficulty, getStreakDebugInfo, type QuizState, type StreakState } from './quiz';
import { type QuizDifficulty } from './config/quiz.config';
import { createUIState, addToast, showDialog, advanceDialog, closeDialog, renderUI, wireHudButtons, markSaveSlotsDirty, syncStatusBars, syncMusicUI, syncSfxUI, syncVoiceUI, type UIState } from './ui';
import { saveGame, loadGame, saveToSlot, loadFromSlot, deleteSlot, deleteSave, getAllSlotInfo, type SaveData } from './save';
import { getNpcPersona, getShopPersona } from './config/npc.config';
import { preloadTiles } from './tiles';
import {
  MICRO_TILE_DEFS, WORLD_UNIT_TEMPLATES, BIOME_PALETTES,
  validateAllTileDefs, validateTemplate, normalizeTileDef,
  isValidAnchorRole, tileMatchesClimate, getTileLOD, tilesAtLOD,
  getBiomePalette,
} from './config/tiles.config';
import { initWasmRenderer, isWasmReady, wasmBenchmark, updateWasmConfig } from './wasm-bridge';
import { clearTerrainCache, tickWaterAnimation, invalidateChunkTerrain, evictDistantChunks, getBlendIntensity, setBlendIntensity } from './terrain-cache';
import { clearObjectCache } from './render';
import { preloadEmojiSprites } from './emoji-cache';
import { preloadNpcSprites, generateNpcSVG, loadNpcSpriteAsync, getNpcSprite, hasNpcSprite, NPC_APPEARANCES } from './npc-sprites';
import { initMinimap, renderMinimap } from './minimap';
import {
  createKnowledgeState, toggleBook, syncBookUI, wireBookUI, showSubjectSelection,
  getQuizBias, openArticle,
  type KnowledgeState,
} from './knowledge';
import { searchBookArticles, initBookContent, getBookContentStats, isPackContentLoaded } from './book-content';
import { createAgeProfile, setAgeBand, AGE_BANDS, getAgeProfileDebug, type AgeProfile } from './age-profile';
import type { AgeBand } from './types/content-pack.types';
import { showCustomizer, createDefaultVariation, serializeVariation, deserializeVariation, setUnlockedCosmetics } from './customizer';
import { checkAllUnlocks, getCosmeticById, type ProgressionData } from './config/cosmetics.config';
import { updateAndRenderParticles, clearParticles } from './particles';
import { tickLighting, setTimeOfDay, getCycleProgress } from './lighting';
import { updateAndRenderWeather, setWeather, getWeatherInfo, clearWeather, didLightningStrike } from './weather';
import { clearLights, addPointLight, addFlashlight, renderLocalLights, toggleFlashlight, isFlashlightOn, isInFlashlightCone } from './local-lights';
import { FIRE_VARIANTS, FIRE_ASSET_KEYS } from './config/fire.config';
import { invalidateShadowCache } from './shadows';
import { updateFog, renderFog, toggleFog, isFogEnabled, setFogEnabled, getVisitedCount, serializeVisited, deserializeVisited, getFogDebugInfo } from './fog';
import {
  updateWildlife, getVisibleWildlife, interactWithWildlife, getAnimationOffset,
  clearWildlife, getDiscoveredSpeciesArray, restoreDiscoveredSpecies, getWildlifeStats,
  getTimeSlot,
} from './wildlife';
import { getSpecies } from './config/wildlife.config';
import { getEmojiSprite } from './emoji-cache';
import {
  triggerHint, tickBubbles, updateBubblePosition, dismissBubble,
  clearBubbles, getBubbleState, resetCooldowns,
} from './thought-bubbles';
import { HINTS } from './config/hints.config';
import {
  createTradeState, openTrade, closeTrade, tradeNavigate,
  executeTrade, executeSell, toggleTradeMode, getSellPrice, getSellableItems,
  syncTradeDOM, type TradeState,
} from './trading';
import {
  createPlayerStatus, tickStatus, getDebuffs, useStatusItem, applyStatusEffect,
  serializeStatus, deserializeStatus, resetTickCounter,
  type PlayerStatus,
} from './status';
import {
  initDebuffVisuals, updateBlurOverlay, updateFlies, renderFlies, getDebuffVisualsState,
} from './debuff-visuals';
import {
  createInjuryState, rollInjury, applyBandaid, applyWoundQuizBonus,
  getWoundCareQuestion, getInjurySpeedMult, serializeInjury, deserializeInjury,
  type InjuryState,
} from './injury';
import {
  createMusicState, play as musicPlay, pause as musicPause, stop as musicStop,
  nextTrack, prevTrack, togglePlayPause, toggleMute, setVolume as musicSetVolume,
  startDucking, stopDucking, setBiome as musicSetBiome,
  serializeMusicSettings, deserializeMusicSettings,
  getCurrentTrackInfo,
  type MusicState,
} from './music';
import {
  createSfxState, playSfx, updateAmbience, stopAmbience,
  setSfxVolume, setAmbienceVolume, toggleSfxMute, toggleAmbienceMute,
  serializeSfxSettings, deserializeSfxSettings,
  type SfxState,
} from './sfx';
import {
  createVoiceState, speakLine, cancelSpeech, toggleVoice,
  setVoiceVolume, serializeVoiceSettings, deserializeVoiceSettings,
  type VoiceState,
} from './npc-voice';
import type { FacingPose } from './sprites';


// ─── Extra Key Queue (numeric + R for quiz accessibility, #94) ───

/** Keys pressed this frame — consumed by quiz input block, cleared each frame */
const _extraKeyQueue: Set<string> = new Set();

function _setupExtraKeyCapture(): void {
  window.addEventListener('keydown', (e) => {
    // Capture 1-9 and R/r for quiz accessibility
    if (/^[1-9r]$/i.test(e.key)) {
      _extraKeyQueue.add(e.key.toLowerCase());
    }
  });
}

function _consumeExtraKey(key: string): boolean {
  if (_extraKeyQueue.has(key)) {
    _extraKeyQueue.delete(key);
    return true;
  }
  return false;
}

function _clearExtraKeys(): void {
  _extraKeyQueue.clear();
}


// ─── Game State ──────────────────────────────────────────────

interface GameState {
  player: {
    x: number;
    y: number;
    direction: number;    // 1 = right, -1 = left (sprite flip)
    facingDx: number;     // Last movement dx (-1/0/1)
    facingDy: number;     // Last movement dy (-1/0/1)
    facingPose: FacingPose; // 'front' or 'back' for sprite selection
    speed: number;
    isMoving: boolean;
    animFrame: number;
  };
  playerVariation: CharacterVariation;
  camera: Camera;
  chunks: Map<string, ChunkData>;
  inventory: Inventory;
  quiz: QuizState;
  ui: UIState;
  knowledge: KnowledgeState;
  quizStats: { answered: number; correct: number };
  egoImg: HTMLImageElement | null;
  frameCount: number;
  fps: number;
  lastFpsTime: number;
  fpsCounter: number;
  paused: boolean;          // True when dialog/quiz active
  initialized: boolean;
  // Perf tracking: avoid redundant work
  lastAnimFrame: number;
  lastFacingPose: FacingPose;
  lastChunkX: number;
  lastChunkY: number;
  // Pending quiz triggered by NPC — starts when dialog closes
  pendingQuiz: { difficulty: QuizDifficulty; npcId: string; bias?: Record<string, number> } | null;
  // Pending quiz triggered by quiz gate — resolves gate cell on correct answer
  pendingGateQuiz: { chunkKey: string; lx: number; ly: number } | null;
  // NPC trading state
  trade: TradeState;
  // Pending trade to open after dialog closes (NPC persona id)
  pendingTrade: string | null;
  // Player survival status (#70)
  status: PlayerStatus;
  // Injury state (#109)
  injury: InjuryState;
  // Unlocked cosmetic IDs (#66)
  unlockedCosmetics: string[];
  // Music state (#74)
  music: MusicState;
  // SFX & ambience state (#75)
  sfx: SfxState;
  // NPC voice state (#76)
  voice: VoiceState;
  // Quiz streak state (#103)
  streak: StreakState;
  // Age band profile (#92)
  ageProfile: AgeProfile;
  // Transient expression override (#102) — reverts after timer expires
  expressionOverride: { expr: import('./sprites').Expression; until: number } | null;
  // Base default expression to revert to after transient override (#102)
  _baseExpression: import('./sprites').Expression;
}

// Track NPC id for voice lines during dialog (#76)
let _lastDialogNpcId: string | null = null;

// ─── Transient Expression System (#102) ─────────────────────

import type { Expression as SpriteExpression } from './sprites';

/** Temporarily override player expression — reverts automatically */
function setTransientExpression(state: GameState, expr: SpriteExpression, durationMs: number): void {
  state.expressionOverride = { expr, until: performance.now() + durationMs };
  // Apply immediately to playerVariation so next sprite load uses it
  state.playerVariation.expression = expr;
  state.lastAnimFrame = -1; // force sprite reload
}

/** Tick the expression override timer; revert when expired */
function tickExpressionOverride(state: GameState): void {
  if (!state.expressionOverride) return;
  if (performance.now() >= state.expressionOverride.until) {
    // Revert to base expression (from save / customizer default)
    state.playerVariation.expression = state._baseExpression ?? 'happy';
    state.expressionOverride = null;
    state.lastAnimFrame = -1; // force sprite reload
  }
}

// ─── Wound-Care Quiz (#109) ─────────────────────────────────

import type { WoundCareQuestion } from './injury';

/**
 * Start a wound-care mini-quiz after bandaid use.
 * Uses the regular quiz UI but with a custom wound-care question.
 */
function _startWoundCareQuiz(state: GameState, wq: WoundCareQuestion): void {
  // Populate quiz state directly (bypass normal startQuiz which loads from content packs)
  state.quiz.active = true;
  state.quiz.displayText = `🩹 Wound Care: ${wq.question}`;
  state.quiz.choices = [...wq.answers, "I don't know 📖"];
  state.quiz.correctIndex = wq.correctIndex;
  state.quiz.selectedIndex = 0;
  state.quiz.result = 'pending';
  state.quiz.npcId = null;
  state.quiz.difficulty = 'easy';
  state.quiz.question = {
    id: `wound_care_${Date.now()}`,
    question: wq.question,
    answers: wq.answers,
    category: 'science',
    difficulty: 'easy',
    correctIndex: 0 as const,
    hint: 'Think about first aid!',
  };
  state.paused = true;
  // Mark this as a wound-care quiz for bonus logic
  (state as any)._woundCareQuiz = true;
}

// ─── Hygiene Quiz (#110 Phase 2) ─────────────────────────────

/** Hygiene quiz questions for outhouse interaction */
const HYGIENE_QUESTIONS = [
  {
    question: 'When should you wash your hands?',
    answers: ['Before eating and after using the bathroom', 'Only when they look dirty', 'Once a week', 'Never'],
  },
  {
    question: 'How long should you wash your hands with soap?',
    answers: ['At least 20 seconds', '2 seconds', '1 minute', 'Just rinse with water'],
  },
  {
    question: 'What kills germs on your hands?',
    answers: ['Soap and water', 'Just water', 'Blowing on them', 'Wiping on your shirt'],
  },
  {
    question: 'Why do we brush our teeth?',
    answers: ['To remove bacteria and prevent cavities', 'To make them shiny', 'Because adults say so', 'To wake up faster'],
  },
  {
    question: 'What should you do after sneezing?',
    answers: ['Wash your hands or use sanitizer', 'Wipe on your sleeve and forget about it', 'Nothing', 'Sneeze again to clear it'],
  },
  {
    question: 'How often should you take a bath or shower?',
    answers: ['Every day or every other day', 'Once a month', 'Only in summer', 'When someone tells you'],
  },
];

/**
 * Start a hygiene mini-quiz after outhouse interaction.
 * Correct → full cleanliness restore; Wrong → keep partial restore only.
 */
function _startHygieneQuiz(state: GameState): void {
  const hq = HYGIENE_QUESTIONS[Math.floor(Math.random() * HYGIENE_QUESTIONS.length)];
  // Shuffle answers (correct is always index 0 in source)
  const shuffled = [...hq.answers];
  const correctAnswer = shuffled[0];
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const correctIdx = shuffled.indexOf(correctAnswer);

  state.quiz.active = true;
  state.quiz.displayText = `🚽 Hygiene Quiz: ${hq.question}`;
  state.quiz.choices = [...shuffled, "I don't know 📖"];
  state.quiz.correctIndex = correctIdx;
  state.quiz.selectedIndex = 0;
  state.quiz.result = 'pending';
  state.quiz.npcId = null;
  state.quiz.difficulty = 'easy';
  state.quiz.question = {
    id: `hygiene_${Date.now()}`,
    question: hq.question,
    answers: hq.answers,
    category: 'science',
    difficulty: 'easy',
    correctIndex: 0 as const,
    hint: 'Think about hygiene and health!',
  };
  state.paused = true;
  (state as any)._hygieneQuiz = true;
}

// ─── Chunk Management ────────────────────────────────────────

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function ensureChunksAround(state: GameState): void {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  const buf = WORLD_CONFIG.viewportBuffer;

  for (let dy = -buf; dy <= buf; dy++) {
    for (let dx = -buf; dx <= buf; dx++) {
      const cx = pcx + dx;
      const cy = pcy + dy;
      const key = chunkKey(cx, cy);
      if (!state.chunks.has(key)) {
        // Collect border constraints from already-generated neighbors (#17)
        const bc = collectBorderConstraints(state.chunks, cx, cy);
        const chunk = generateChunkSync(cx, cy, bc);
        state.chunks.set(key, chunk);
        // Invalidate adjacent chunk terrain caches for cross-chunk auto-tile transitions (#6)
        invalidateChunkTerrain(chunkKey(cx - 1, cy));
        invalidateChunkTerrain(chunkKey(cx + 1, cy));
        invalidateChunkTerrain(chunkKey(cx, cy - 1));
        invalidateChunkTerrain(chunkKey(cx, cy + 1));
      }
    }
  }
}

/** Read edge tags from adjacent chunks' borderEdges for inter-chunk stitching. */
function collectBorderConstraints(
  chunks: Map<string, ChunkData>,
  cx: number,
  cy: number,
): BorderConstraints | undefined {
  const northChunk = chunks.get(chunkKey(cx, cy - 1));
  const southChunk = chunks.get(chunkKey(cx, cy + 1));
  const eastChunk = chunks.get(chunkKey(cx + 1, cy));
  const westChunk = chunks.get(chunkKey(cx - 1, cy));

  const hasAny = northChunk?.borderEdges || southChunk?.borderEdges ||
                 eastChunk?.borderEdges || westChunk?.borderEdges;
  if (!hasAny) return undefined;

  return {
    n: northChunk?.borderEdges?.s,  // south border of chunk above
    s: southChunk?.borderEdges?.n,  // north border of chunk below
    e: eastChunk?.borderEdges?.w,   // west border of chunk to the east
    w: westChunk?.borderEdges?.e,   // east border of chunk to the west
  };
}

/** Only call ensureChunksAround when player crosses a chunk boundary */
function maybeLoadChunks(state: GameState): void {
  const size = WORLD_CONFIG.chunkSize;
  const pcx = Math.floor(state.player.x / size);
  const pcy = Math.floor(state.player.y / size);
  if (pcx !== state.lastChunkX || pcy !== state.lastChunkY) {
    // Determine crossing direction and feed entropy (#4)
    const dx = pcx - state.lastChunkX;
    const dy = pcy - state.lastChunkY;
    const dir = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    const table = DIRECTION_WORDS[dir];
    if (table) {
      const verb = table.verbs[Math.floor(Math.random() * table.verbs.length)];
      const noun = table.nouns[Math.floor(Math.random() * table.nouns.length)];
      feedEntropy(`move:${verb} ${noun}`);
    }

    state.lastChunkX = pcx;
    state.lastChunkY = pcy;
    ensureChunksAround(state);
    // Evict distant terrain caches to stay under memory budget (#47)
    evictDistantChunks(pcx, pcy, 3);
    // Auto-save on chunk exit
    doSave(state);
  }
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
  const size = WORLD_CONFIG.chunkSize;

  const state: GameState = {
    player: {
      x: startX,
      y: startY,
      direction: save?.player.direction ?? 1,
      facingDx: 1,
      facingDy: 0,
      facingPose: 'front' as FacingPose,
      speed: PLAYER_CONFIG.speed,
      isMoving: false,
      animFrame: 0,
    },
    playerVariation,
    camera: {
      x: startX,
      y: startY,
    },
    chunks: new Map(),
    inventory: createInventory(),
    quiz: createQuizState(),
    ui: createUIState(),
    knowledge: createKnowledgeState(),
    quizStats: save?.quizStats ?? { answered: 0, correct: 0 },
    egoImg,
    frameCount: 0,
    fps: 0,
    lastFpsTime: performance.now(),
    fpsCounter: 0,
    paused: false,
    initialized: true,
    lastAnimFrame: -1,
    lastFacingPose: 'front' as FacingPose,
    lastChunkX: Math.floor(startX / size),
    lastChunkY: Math.floor(startY / size),
    pendingQuiz: null,
    pendingGateQuiz: null,
    trade: createTradeState(),
    pendingTrade: null,
    status: createPlayerStatus(),
    injury: createInjuryState(),
    unlockedCosmetics: save?.unlockedCosmetics ?? [],
    music: createMusicState(),
    sfx: createSfxState(),
    voice: createVoiceState(),
    streak: createStreakState(),
    ageProfile: createAgeProfile(),
    expressionOverride: null,
    _baseExpression: playerVariation.expression ?? 'happy',
  };

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
  (window as any).__lighting = { setTimeOfDay, getCycleProgress };
  // Expose thought bubble functions for E2E tests (#71, #111)
  (window as any).__bubbles = {
    triggerHint, tickBubbles, dismissBubble, clearBubbles,
    getBubbleState, resetCooldowns, updateBubblePosition,
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
          if ((state as any)._woundCareQuiz) {
            applyWoundQuizBonus(state.status);
            addToast(state.ui, '🩹 Bonus heal! You know first aid!', '#88ccff', 2500);
            (state as any)._woundCareQuiz = false;
          }

          // Hygiene quiz bonus — full cleanliness restore (#110)
          if ((state as any)._hygieneQuiz) {
            state.status.cleanliness = 100;
            addToast(state.ui, '🚽 Sparkling clean! Full cleanliness restored!', '#4caf50', 2500);
            playSfx(state.sfx, 'outhouse_clean');
            (state as any)._hygieneQuiz = false;
          }

          // Resolve quiz gate if this quiz was gate-triggered (Doc 05 §3.5)
          if (state.pendingGateQuiz) {
            const g = state.pendingGateQuiz;
            resolveQuizGate(g.chunkKey, g.lx, g.ly, state.chunks);
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
          (state as any)._woundCareQuiz = false; // Clear wound-care flag (#109)
          (state as any)._hygieneQuiz = false; // Clear hygiene flag (#110)
        } else if (state.quiz.result === 'idk') {
          (state as any)._woundCareQuiz = false; // Clear wound-care flag (#109)
          (state as any)._hygieneQuiz = false; // Clear hygiene flag (#110)
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
    if (justKeys.up) { tradeNavigate(state.trade, 'up'); playSfx(state.sfx, 'menu_navigate'); }
    if (justKeys.down) { tradeNavigate(state.trade, 'down'); playSfx(state.sfx, 'menu_navigate'); }
    if (justKeys.interact) {
      if (state.trade.mode === 'sell') {
        const result = executeSell(state.trade, state.inventory);
        if (result.ok) {
          addToast(state.ui, result.message, '#ffab40');
          playSfx(state.sfx, 'shop_buy');
        } else {
          playSfx(state.sfx, 'shop_fail');
        }
      } else {
        const result = executeTrade(state.trade, state.inventory);
        if (result.ok) {
          addToast(state.ui, result.message, '#4caf50');
          playSfx(state.sfx, 'shop_buy');
        } else {
          playSfx(state.sfx, 'shop_fail');
        }
      }
      // Don't close — let player buy/sell multiple items
    }
    // Escape handled in global keydown handler
    syncTradeDOM(state.trade, state.inventory);
    input.endFrame();
    return;
  }

  // --- Movement ---
  const mv = input.getMovementVector();
  const isMoving = mv.dx !== 0 || mv.dy !== 0;

  if (isMoving) {
    // Apply survival status + injury speed debuffs (#70, #109)
    const debuffs = getDebuffs(state.status);
    const injuryMult = getInjurySpeedMult(state.injury);
    const effectiveSpeed = state.player.speed * debuffs.speedMult * injuryMult;
    const newX = state.player.x + mv.dx * effectiveSpeed;
    const newY = state.player.y + mv.dy * effectiveSpeed;

    // Collision check
    if (isWalkable(Math.round(newX), Math.round(newY), state.chunks)) {
      state.player.x = newX;
      state.player.y = newY;
    } else {
      // Wall bump SFX (#75) — debounce handles frame-spam
      playSfx(state.sfx, 'wall_bump');
      // Roll for injury on obstacle collision (#109)
      if (rollInjury(state.injury)) {
        playSfx(state.sfx, 'ouch');
        triggerHint('ouch_injury');
        setTransientExpression(state, 'surprised', 3000);
        addToast(state.ui, '🤕 Ouch! You got hurt!', '#f44336', 2500);
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
      // Show creature dialog with fun fact
      const wildlifeLine = `You spotted a ${species.name}! ${species.emoji}`;
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

  // --- Transient expression tick (#102) ---
  tickExpressionOverride(state);

  // --- Ambience update (#75) — resolves based on time-of-day + weather ---
  // Throttle to every 60th frame (~1s at 60fps) to avoid churn
  if (state.frameCount % 60 === 0) {
    const cycleProgress = getCycleProgress();
    const timeSlot: 'day' | 'dusk' | 'night' = cycleProgress < 0.65 ? 'day' : cycleProgress < 0.80 ? 'dusk' : 'night';
    const weatherInfo = getWeatherInfo();
    updateAmbience(state.sfx, timeSlot, weatherInfo.type);
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
      _startHygieneQuiz(state);
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
    resolvedCells: [], // TODO: track resolved cells
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
  // Force camera + chunk reload
  state.camera.x = data.player.x;
  state.camera.y = data.player.y;
  clearTerrainCache();
  clearParticles();
  clearWeather();
  clearWildlife();
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

// ─── Age Band Selection (#92) ───────────────────────────────────

/** Show age band selection overlay. Resolves when player picks or skips. */
function showAgeSelection(profile: AgeProfile): Promise<void> {
  return new Promise(resolve => {
    const overlay = document.getElementById('ageOverlay');
    if (!overlay) { resolve(); return; }

    const list = document.getElementById('ageBandList');
    const confirmBtn = document.getElementById('ageConfirm') as HTMLButtonElement;
    const skipBtn = document.getElementById('ageSkip');

    if (!list || !confirmBtn) { resolve(); return; }

    let selected: AgeBand | null = null;

    function renderOptions(): void {
      list!.innerHTML = AGE_BANDS.map(b => {
        const sel = selected === b.id;
        return `<div class="age-band-option ${sel ? 'selected' : ''}" data-band="${b.id}">
          <span class="age-band-icon">${b.icon}</span>
          <div class="age-band-info">
            <span class="age-band-label">${b.label}</span>
            <span class="age-band-range">${b.range}</span>
          </div>
        </div>`;
      }).join('');

      // Wire option clicks
      list!.querySelectorAll('.age-band-option').forEach(el => {
        el.addEventListener('click', () => {
          selected = (el as HTMLElement).dataset.band as AgeBand;
          confirmBtn.disabled = false;
          renderOptions();
        });
      });
    }

    renderOptions();
    overlay.style.display = 'flex';

    const onConfirm = () => {
      if (selected) setAgeBand(profile, selected);
      overlay.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      skipBtn?.removeEventListener('click', onSkip);
      resolve();
    };

    const onSkip = () => {
      // Skip = no age band, show everything
      overlay.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      skipBtn?.removeEventListener('click', onSkip);
      resolve();
    };

    confirmBtn.addEventListener('click', onConfirm);
    skipBtn?.addEventListener('click', onSkip);
  });
}

/** Show main menu overlay. Returns promise resolving to player choice. */
function showMainMenu(hasSaveData: boolean): Promise<string> {
  return new Promise((resolve) => {
    const menu = document.getElementById('mainMenu')!;
    const buttonsPanel = document.getElementById('menuButtonsPanel')!;
    const loadPanel = document.getElementById('menuLoadPanel')!;
    const continueBtn = document.getElementById('menuContinue') as HTMLButtonElement;
    const newGameBtn = document.getElementById('menuNewGame') as HTMLButtonElement;
    const loadGameBtn = document.getElementById('menuLoadGame') as HTMLButtonElement;
    const loadBackBtn = document.getElementById('menuLoadBack') as HTMLButtonElement;
    const slotList = document.getElementById('menuSlotList')!;

    // Show/hide continue based on auto-save
    continueBtn.style.display = hasSaveData ? 'block' : 'none';

    // Show/hide load based on any save existing
    const slots = getAllSlotInfo();
    const anySlots = hasSaveData || slots.some((s) => s.hasData);
    loadGameBtn.style.display = anySlots ? 'block' : 'none';

    // Reset to buttons view
    buttonsPanel.style.display = 'flex';
    loadPanel.style.display = 'none';
    menu.style.display = 'flex';

    const cleanup = () => { menu.style.display = 'none'; };

    continueBtn.onclick = () => { cleanup(); resolve('continue'); };
    newGameBtn.onclick = () => { cleanup(); resolve('new-game'); };

    loadGameBtn.onclick = () => {
      buttonsPanel.style.display = 'none';
      loadPanel.style.display = 'block';
      slotList.innerHTML = '';

      // Auto-save slot
      if (hasSaveData) {
        const autoSave = loadGame();
        const autoEl = document.createElement('div');
        autoEl.className = 'menu-slot';
        autoEl.innerHTML = `
          <div class="menu-slot-info">
            <div class="menu-slot-name">💾 Auto-Save</div>
            <div class="menu-slot-time">${autoSave?.timestamp ? new Date(autoSave.timestamp).toLocaleString() : 'Unknown'}</div>
          </div>
          <div class="menu-slot-icon">▶</div>`;
        autoEl.onclick = () => { cleanup(); resolve('continue'); };
        slotList.appendChild(autoEl);
      }

      // Manual save slots
      for (const info of slots) {
        const el = document.createElement('div');
        el.className = 'menu-slot' + (info.hasData ? '' : ' empty');
        if (info.hasData) {
          el.innerHTML = `
            <div class="menu-slot-info">
              <div class="menu-slot-name">Slot ${info.slot + 1}</div>
              <div class="menu-slot-time">${info.timestamp ? new Date(info.timestamp).toLocaleString() : '—'}</div>
            </div>
            <div class="menu-slot-icon">▶</div>`;
          const slotIdx = info.slot;
          el.onclick = () => { cleanup(); resolve(`load-slot-${slotIdx}`); };
        } else {
          el.innerHTML = `
            <div class="menu-slot-info">
              <div class="menu-slot-name">Slot ${info.slot + 1}</div>
              <div class="menu-slot-time">Empty</div>
            </div>`;
        }
        slotList.appendChild(el);
      }
    };

    loadBackBtn.onclick = () => {
      loadPanel.style.display = 'none';
      buttonsPanel.style.display = 'flex';
    };
  });
}

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

/** Show pause menu overlay (Escape during gameplay) */
function showPauseMenu(state: GameState): void {
  state.paused = true;
  const menu = document.getElementById('pauseMenu')!;
  menu.style.display = 'flex';

  document.getElementById('pauseResume')!.onclick = () => {
    menu.style.display = 'none';
    state.paused = false;
  };

  document.getElementById('pauseSave')!.onclick = () => {
    doSave(state);
    addToast(state.ui, 'Game saved!', '#4caf50', 1500);
  };

  document.getElementById('pauseCustomize')!.onclick = async () => {
    menu.style.display = 'none';
    const newVariation = await showCustomizer(state.playerVariation);
    clearVariationCache('custom');
    state.playerVariation = newVariation;
    state._baseExpression = newVariation.expression ?? 'happy';
    state.expressionOverride = null;
    state.egoImg = loadCharacterSprite(newVariation, 0, false);
    state.lastAnimFrame = -1;
    state.paused = false;
    addToast(state.ui, '🎨 Character updated!', '#ce93d8', 2000);
  };

  document.getElementById('pauseMainMenu')!.onclick = () => {
    doSave(state);
    window.location.reload();
  };

  // Controls guide (#117)
  document.getElementById('pauseControls')!.onclick = () => {
    const guide = document.getElementById('controlsGuide')!;
    guide.style.display = 'flex';
    document.getElementById('controlsClose')!.onclick = () => {
      guide.style.display = 'none';
    };
  };

  // Bug reporter (#117)
  document.getElementById('pauseBugReport')!.onclick = () => {
    const modal = document.getElementById('bugReportModal')!;
    modal.style.display = 'flex';
    const descEl = document.getElementById('bugDescription') as HTMLTextAreaElement;
    descEl.value = '';

    document.getElementById('bugCancel')!.onclick = () => {
      modal.style.display = 'none';
    };

    document.getElementById('bugSubmit')!.onclick = () => {
      captureBugReport(state, descEl.value);
      modal.style.display = 'none';
      addToast(state.ui, '🐛 Bug report downloaded!', '#ff8888', 2500);
    };
  };
}
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
    }
  }

  // Injury-specific hints (#109)
  if (state.injury.injured) {
    triggerHint('need_bandaid');
  }

  // Dirty hint — outhouse needed (#110)
  if (state.status.cleanliness <= LOW) {
    triggerHint('outhouse_dirty');
  }
}

// ─── Wildlife Rendering ──────────────────────────────────────

// Track creatures revealed by flashlight this session (#114)
const _revealedCreatures = new Set<string>(); // chunkKey_localId keys

// Glowing eyes animation state (module-level, avoid per-frame alloc)
let _eyeBlinkTimer = 0;
let _eyeSwayPhase = 0;

function renderWildlife(renderer: IsometricRenderer, state: GameState): void {
  const wildlife = getVisibleWildlife(state.camera, state.player.x, state.player.y);
  if (wildlife.length === 0) return;

  const ctx = renderer.getCtx();
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;
  const timeSlot = getTimeSlot();
  const isNight = timeSlot === 'night';

  // Advance eye animation
  _eyeBlinkTimer = (_eyeBlinkTimer + 1) % 240; // blink every ~4s at 60fps
  _eyeSwayPhase += 0.03;

  for (const entity of wildlife) {
    const species = getSpecies(entity.speciesId);
    if (!species) continue;

    const anim = getAnimationOffset(entity);
    const { x: sx, y: sy } = renderer.gridToScreen(entity.worldX, entity.worldY, state.camera);

    // Viewport cull
    if (sx < -64 || sx > cw + 64 || sy < -64 || sy > ch + 64) continue;

    // Glowing eyes mechanic: nocturnal creatures at night (#114)
    const isNocturnal = species.time.includes('night');
    const entityKey = `${entity.chunkKey}_${entity.localId}`;
    const wasRevealed = _revealedCreatures.has(entityKey);

    if (isNight && isNocturnal && !wasRevealed) {
      // Check if flashlight is revealing this creature
      const inCone = isInFlashlightCone(
        entity.worldX, entity.worldY,
        state.player.x, state.player.y,
        state.player.facingDx, state.player.facingDy,
      );

      if (inCone) {
        // Reveal! Flash of discovery
        _revealedCreatures.add(entityKey);
        // Brief bright aura
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffaa';
        ctx.beginPath();
        ctx.arc(sx, sy, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Show discovery toast
        addToast(state.ui, `👀 You spotted a ${species.name}! ${species.emoji}`, '#ffee44', 3000);
      } else {
        // Draw glowing eyes (two small dots)
        const eyeSize = 2.5;
        const eyeSpacing = 5;
        const eyeY = sy + anim.dy - 4;
        const eyeX = sx + anim.dx;
        // Slight sway
        const sway = Math.sin(_eyeSwayPhase + entity.localId * 1.7) * 1.2;
        // Blink: briefly close eyes (~12 frames every ~240 frames)
        const blinkOffset = (entity.localId * 37) % 240;
        const blinkPhase = (_eyeBlinkTimer + blinkOffset) % 240;
        const isBlinking = blinkPhase > 228;

        if (!isBlinking) {
          ctx.save();
          // Additive blend for glow effect
          ctx.globalCompositeOperation = 'lighter';
          // Outer glow
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#ffdd44';
          ctx.beginPath();
          ctx.arc(eyeX - eyeSpacing + sway, eyeY, eyeSize + 2, 0, Math.PI * 2);
          ctx.arc(eyeX + eyeSpacing + sway, eyeY, eyeSize + 2, 0, Math.PI * 2);
          ctx.fill();
          // Inner bright
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffff88';
          ctx.beginPath();
          ctx.arc(eyeX - eyeSpacing + sway, eyeY, eyeSize, 0, Math.PI * 2);
          ctx.arc(eyeX + eyeSpacing + sway, eyeY, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        continue; // Don't render full sprite
      }
    }

    // Normal sprite rendering (day, or revealed creatures)
    const sprite = getEmojiSprite(species.emoji, 0);
    const size = sprite.width * species.scale;
    const drawX = sx + anim.dx - size / 2;
    const drawY = sy + anim.dy - size / 2;

    // Fleeing creatures fade out
    if (entity.behavior === 'flee') {
      const fadeT = entity.fleeCooldown / 120;
      ctx.globalAlpha = Math.max(0.15, fadeT);
    }

    // Directional flip based on facingDir (#80)
    if (entity.facingDir === -1) {
      ctx.save();
      ctx.translate(drawX + size, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, drawX, drawY, size, size);
    }

    if (entity.behavior === 'flee') {
      ctx.globalAlpha = 1.0;
    }
  }
}

// ─── Render ──────────────────────────────────────────────────

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
  const playerScreenDbf = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  renderFlies(renderer.getCtx(), playerScreenDbf.x, playerScreenDbf.y);

  // Fog-of-war overlay: darken unexplored areas (#114)
  renderFog(renderer.getCtx(), state.camera);

  // Update thought bubble position (anchored above player sprite screen position)
  const playerScreen = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  updateBubblePosition(playerScreen.x, playerScreen.y);

  // Day/night cycle: tick the clock (rendering is handled by local-lights with lightmap)
  tickLighting();

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
  tickWaterAnimation();
  update(ctx.state, ctx.input);
  renderFrame(ctx.renderer, ctx.state);
  requestAnimationFrame((t) => gameLoop(t, ctx));
}

// ─── Extended Input (F3 debug, I inventory, Esc) ─────────────

function setupExtraKeys(state: GameState): void {
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
        if (!state.quiz.active && !state.ui.dialog.active) {
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
          closeTrade(state.trade);
          syncTradeDOM(state.trade, state.inventory);
          state.paused = false;
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
          showPauseMenu(state);
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
        if (state.trade.active) {
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
      case 'B': // Shift+B: cycle terrain blend intensity (#84)
        if (e.shiftKey) {
          const steps = [0, 0.5, 1.0, 1.5, 2.0];
          const curBlend = getBlendIntensity();
          let nextIdx = 0;
          for (let i = 0; i < steps.length; i++) {
            if (curBlend < steps[i] + 0.01) { nextIdx = i; break; }
            if (i === steps.length - 1) nextIdx = 0;
          }
          nextIdx = (nextIdx + 1) % steps.length;
          setBlendIntensity(steps[nextIdx]);
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
              _startWoundCareQuiz(state, wq);
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
  setupExtraKeys(state);
  _setupExtraKeyCapture(); // Numeric + R key capture for quiz accessibility (#94)

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
  (window as any).__gameDebug = {
    setTimeOfDay,
    getCycleProgress,
    toggleFlashlight,
    isFlashlightOn,
    state,
    // Asset/biome metadata (#58)
    getAssetDefs: () => ASSET_DEFS,
    getBiomeDefs: () => BIOME_DEFS,
    // Status helpers (#70)
    getDebuffs: () => getDebuffs(state.status),
    getDebuffVisuals: getDebuffVisualsState,
    useStatusItem: (itemId: string) => {
      const result = useStatusItem(state.status, itemId);
      if (result) addToast(state.ui, result, '#88ccff', 2000);
      return result;
    },
    // Injury helpers (#109)
    getInjury: () => state.injury,
    rollInjury: () => rollInjury(state.injury),
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
    // SFX helpers (#75)
    playSfx: (id: string) => playSfx(state.sfx, id),
    getSfxState: () => ({
      sfxVolume: state.sfx.settings.sfxVolume,
      ambienceVolume: state.sfx.settings.ambienceVolume,
      sfxMuted: state.sfx.settings.sfxMuted,
      ambienceMuted: state.sfx.settings.ambienceMuted,
      sfxEnabled: state.sfx.settings.sfxEnabled,
      activeAmbience: state.sfx.activeAmbienceId,
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
    // Sprite helpers (#86)
    loadCharacterSpriteAsync,
    generateIdleCharacterSVG,
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
      lastDialogNpcId: _lastDialogNpcId,
    }),
    // Quiz streak helpers (#103)
    getStreakDebug: () => getStreakDebugInfo(state.streak),
    getStreakState: () => state.streak,
    // Water/bridge debug (#100)
    getWaterDebug: () => getWaterDebugInfo(),
    // Lock-Key DAG debug (#98)
    getLockKeyDAG: () => getLockKeyDebugInfo(),
    // Tile metadata v2 (#101) — climate, LOD, anchor roles, validation
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
    getChunkClimate,
    // Fog-of-war debug (#114)
    toggleFog,
    isFogEnabled,
    setFogEnabled,
    getVisitedCount,
    getFogDebug: getFogDebugInfo,
    getTimeSlot,
    // Night mode debug (#114)
    getRevealedCreatures: () => _revealedCreatures.size,
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
    shouldAutoRead: () => _shouldAutoRead(state),
    quizSelectIndex: (idx: number) => quizSelectIndex(state.quiz, idx),
    // Outhouse/hygiene debug (#110)
    startHygieneQuiz: () => _startHygieneQuiz(state),
    getHygieneQuizActive: () => (state as any)._hygieneQuiz === true,
  };

  addToast(state.ui, 'Welcome! Use WASD to move, Space to interact.', '#88ccff', 4000);
  if (isTestMode()) {
    addToast(state.ui, '🧪 Test mode — LLM disabled', '#ffaa00', 3000);
  } else if (isWasmReady() && RENDER_CONFIG.useWasmRenderer) {
    addToast(state.ui, '⚡ WASM rendering core active', '#7fff7f', 3000);
  }

  // Wire Book of Knowledge UI
  wireBookUI(state.knowledge, () => { state.paused = false; });

  // Wire Quiz Repeat button (#94)
  document.getElementById('quizRepeat')?.addEventListener('click', () => {
    if (state.quiz.active && state.quiz.displayText) {
      speakLine(state.voice, state.quiz.displayText, null);
    }
  });

  // Wire HUD book button
  document.getElementById('btnBook')?.addEventListener('click', () => {
    if (!state.quiz.active && !state.ui.dialog.active) {
      toggleBook(state.knowledge);
      state.paused = state.knowledge.bookOpen;
    }
  });

  // Wire HUD customize button
  const openCustomizer = async () => {
    if (state.paused || state.quiz.active || state.ui.dialog.active) return;
    state.paused = true;
    const newVariation = await showCustomizer(state.playerVariation);
    clearVariationCache('custom'); // clear old cached sprites
    state.playerVariation = newVariation;
    state._baseExpression = newVariation.expression ?? 'happy';
    state.expressionOverride = null;
    state.egoImg = loadCharacterSprite(newVariation, 0, false);
    state.lastAnimFrame = -1;
    state.paused = false;
    addToast(state.ui, '🎨 Character updated!', '#ce93d8', 2000);
  };
  document.getElementById('btnCustomize')?.addEventListener('click', openCustomizer);

  // Wire 'C' key to open customizer
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) {
      openCustomizer();
    }
  });

  // ─── Wire Music Controls (#74) ─────────────────────────────
  document.getElementById('btnMusicPlayPause')?.addEventListener('click', () => {
    togglePlayPause(state.music);
  });
  document.getElementById('btnMusicNext')?.addEventListener('click', () => {
    nextTrack(state.music);
  });
  document.getElementById('btnMusicPrev')?.addEventListener('click', () => {
    prevTrack(state.music);
  });
  document.getElementById('btnMusicMute')?.addEventListener('click', () => {
    toggleMute(state.music);
  });
  document.getElementById('musicVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    musicSetVolume(state.music, val / 100);
  });
  // 'M' key toggles play/pause
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) {
      togglePlayPause(state.music);
    }
  });

  // ─── Wire SFX Controls (#75) ──────────────────────────────
  document.getElementById('btnSfxMute')?.addEventListener('click', () => {
    toggleSfxMute(state.sfx);
  });
  document.getElementById('btnAmbienceMute')?.addEventListener('click', () => {
    toggleAmbienceMute(state.sfx);
  });
  document.getElementById('sfxVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setSfxVolume(state.sfx, val / 100);
  });
  document.getElementById('ambienceVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setAmbienceVolume(state.sfx, val / 100);
  });

  // ─── Wire Voice Controls (#76) ─────────────────────────────
  document.getElementById('btnVoiceToggle')?.addEventListener('click', () => {
    toggleVoice(state.voice);
  });
  document.getElementById('voiceVolume')?.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setVoiceVolume(state.voice, val / 100);
  });

  // ─── Main Menu / New Game Flow ─────────────────────────────
  if (!isTestMode()) {
    // Welcome splash for first-time players (#117)
    await showWelcomeSplash();

    const choice = await showMainMenu(hasSaveData);

    if (choice === 'new-game') {
      resetGameState(state);
      // Character customizer
      const customVariation = await showCustomizer(state.playerVariation);
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

  requestAnimationFrame((t) => gameLoop(t, { state, renderer, input }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
