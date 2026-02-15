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
import { IsometricRenderer, type Camera } from './render';
import { InputManager } from './input';
import { characterVariations, loadCharacterSprite, clearVariationCache, type CharacterVariation } from './sprites';
import { generateChunkSync, setWordlist, setBiomeNoiseSeed, feedEntropy, getEntropyBuffer, restoreEntropyBuffer, type ChunkData, type BorderConstraints } from './gen';
import { generateWordlist, checkLlmHealth, isTestMode } from './llm';
import { getScrambledWordlist } from './config/wordlists.asset';
import { isWalkable, interact, autoCollect, resolveQuizGate, type InteractionResult } from './mechanics';
import { createInventory, type Inventory } from './inventory';
import { createQuizState, startQuiz, quizNavigate, quizSubmit, quizClose, quizReward, getDifficultyForPosition, blendDifficulty, type QuizState } from './quiz';
import { type QuizDifficulty } from './config/quiz.config';
import { createUIState, addToast, showDialog, advanceDialog, closeDialog, renderUI, wireHudButtons, markSaveSlotsDirty, syncStatusBars, syncMusicUI, syncSfxUI, syncVoiceUI, type UIState } from './ui';
import { saveGame, loadGame, saveToSlot, loadFromSlot, deleteSlot, deleteSave, getAllSlotInfo, type SaveData } from './save';
import { getNpcPersona, SHOP_MERCHANT_PERSONA } from './config/npc.config';
import { preloadTiles } from './tiles';
import { initWasmRenderer, isWasmReady, wasmBenchmark, updateWasmConfig } from './wasm-bridge';
import { clearTerrainCache, tickWaterAnimation, invalidateChunkTerrain, evictDistantChunks } from './terrain-cache';
import { clearObjectCache } from './render';
import { preloadEmojiSprites } from './emoji-cache';
import { initMinimap, renderMinimap } from './minimap';
import {
  createKnowledgeState, toggleBook, syncBookUI, wireBookUI, showSubjectSelection,
  getQuizBias, openArticle,
  type KnowledgeState,
} from './knowledge';
import { searchArticles } from './config/knowledge.config';
import { showCustomizer, createDefaultVariation, serializeVariation, deserializeVariation, setUnlockedCosmetics } from './customizer';
import { checkAllUnlocks, getCosmeticById, type ProgressionData } from './config/cosmetics.config';
import { updateAndRenderParticles, clearParticles } from './particles';
import { tickLighting, setTimeOfDay, getCycleProgress } from './lighting';
import { updateAndRenderWeather, setWeather, getWeatherInfo, clearWeather, didLightningStrike } from './weather';
import { clearLights, addPointLight, addFlashlight, renderLocalLights, toggleFlashlight, isFlashlightOn } from './local-lights';
import {
  updateWildlife, getVisibleWildlife, interactWithWildlife, getAnimationOffset,
  clearWildlife, getDiscoveredSpeciesArray, restoreDiscoveredSpecies, getWildlifeStats,
} from './wildlife';
import { getSpecies } from './config/wildlife.config';
import { getEmojiSprite } from './emoji-cache';
import {
  triggerHint, tickBubbles, updateBubblePosition, dismissBubble,
  clearBubbles, getBubbleState, resetCooldowns,
} from './thought-bubbles';
import {
  createTradeState, openTrade, closeTrade, tradeNavigate,
  executeTrade, syncTradeDOM, type TradeState,
} from './trading';
import {
  createPlayerStatus, tickStatus, getDebuffs, useStatusItem, applyStatusEffect,
  serializeStatus, deserializeStatus, resetTickCounter,
  type PlayerStatus,
} from './status';
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
  // Unlocked cosmetic IDs (#66)
  unlockedCosmetics: string[];
  // Music state (#74)
  music: MusicState;
  // SFX & ambience state (#75)
  sfx: SfxState;
  // NPC voice state (#76)
  voice: VoiceState;
}

// Track NPC id for voice lines during dialog (#76)
let _lastDialogNpcId: string | null = null;

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

  // Initialize minimap canvas
  initMinimap();

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
    unlockedCosmetics: save?.unlockedCosmetics ?? [],
    music: createMusicState(),
    sfx: createSfxState(),
    voice: createVoiceState(),
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
  // Expose thought bubble functions for E2E tests (#71)
  (window as any).__bubbles = {
    triggerHint, tickBubbles, dismissBubble, clearBubbles,
    getBubbleState, resetCooldowns, updateBubblePosition,
  };
  // Expose trade functions for E2E tests (#72)
  (window as any).__trade = {
    openTrade, closeTrade, tradeNavigate, executeTrade, syncTradeDOM,
    createTradeState,
  };

  return { state, renderer, input, hasSaveData: !!save };
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
    if (justKeys.interact) {
      if (state.quiz.result !== 'pending') {
        if (state.quiz.result === 'correct') {
          const rewards = quizReward(state.quiz.difficulty);
          for (const r of rewards) state.inventory.addItem(r.itemId, r.qty);
          addToast(state.ui, `Quiz reward! +${rewards.map((r) => `${r.qty} ${r.itemId}`).join(', ')}`, '#4caf50');
          state.quizStats.correct++;
          playSfx(state.sfx, 'quiz_correct');
          checkCosmeticUnlocks(state);

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
        } else if (state.quiz.result === 'wrong') {
          playSfx(state.sfx, 'quiz_wrong');
        } else if (state.quiz.result === 'idk') {
          // "I don't know" → open Book to related article
          const category = state.quiz.question?.category || '';
          const questionText = state.quiz.question?.question || '';
          // Search for articles related to the quiz category or question
          const related = searchArticles(category) || searchArticles(questionText);
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
        playSfx(state.sfx, 'dialog_close');
        // Start pending quiz if NPC queued one, then trade after quiz, otherwise open trade or unpause
        if (state.pendingQuiz) {
          const pq = state.pendingQuiz;
          state.pendingQuiz = null;
          startQuiz(state.quiz, pq.difficulty, pq.npcId, pq.bias);
          playSfx(state.sfx, 'quiz_start');
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
      const result = executeTrade(state.trade, state.inventory);
      if (result.ok) {
        addToast(state.ui, result.message, '#4caf50');
        playSfx(state.sfx, 'shop_buy');
      } else {
        playSfx(state.sfx, 'shop_fail');
      }
      // Don't close — let player buy multiple items
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
    // Apply survival status speed debuff (#70)
    const debuffs = getDebuffs(state.status);
    const effectiveSpeed = state.player.speed * debuffs.speedMult;
    const newX = state.player.x + mv.dx * effectiveSpeed;
    const newY = state.player.y + mv.dy * effectiveSpeed;

    // Collision check
    if (isWalkable(Math.round(newX), Math.round(newY), state.chunks)) {
      state.player.x = newX;
      state.player.y = newY;
    } else {
      // Wall bump SFX (#75) — debounce handles frame-spam
      playSfx(state.sfx, 'wall_bump');
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
        const diff = getDifficultyForPosition(state.player.x, state.player.y);
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
      speakLine(state.voice, result.greeting, result.npcId);

      // Feed NPC greeting into entropy pool (#4)
      feedEntropy(result.greeting);

      // If NPC can quiz, queue quiz to start when dialog closes (not via setTimeout race)
      // Difficulty = max(NPC preference, distance-based scaling) — Doc 05 §9.1
      if (persona?.canQuiz) {
        const bias = getQuizBias(state.knowledge);
        const distDiff = getDifficultyForPosition(state.player.x, state.player.y);
        const finalDifficulty = blendDifficulty(persona.quizDifficulty, distDiff);
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
      const gateDiff = getDifficultyForPosition(state.player.x, state.player.y);
      const gateBias = getQuizBias(state.knowledge);
      state.pendingQuiz = { difficulty: gateDiff, npcId: 'quiz_gate', bias: gateBias };
      state.pendingGateQuiz = { chunkKey: result.chunkKey, lx: result.lx, ly: result.ly };
      break;
    }

    // --- Shop structure interaction (#77) ---
    case 'shop':
      showDialog(state.ui, 'Shopkeeper', [result.message]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      // Queue trade panel to open after dialog closes
      state.pendingTrade = SHOP_MERCHANT_PERSONA.id;
      break;

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
    unlockedCosmetics: state.unlockedCosmetics,
    musicSettings: serializeMusicSettings(state.music),
    sfxSettings: serializeSfxSettings(state.sfx),
    voiceSettings: serializeVoiceSettings(state.voice),
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
  // Restore unlocked cosmetics (#66)
  state.unlockedCosmetics = data.unlockedCosmetics ?? [];
  setUnlockedCosmetics(state.unlockedCosmetics);
  // Restore music settings (#74)
  state.music.settings = deserializeMusicSettings(data.musicSettings);
  // Restore SFX settings (#75)
  if (data.sfxSettings) deserializeSfxSettings(state.sfx, data.sfxSettings);
  // Restore voice settings (#76)
  if (data.voiceSettings) deserializeVoiceSettings(state.voice, data.voiceSettings);
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
  state.pendingQuiz = null;
  state.pendingGateQuiz = null;
  state.trade = createTradeState();
  state.pendingTrade = null;
  state.status = createPlayerStatus();
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
    state.egoImg = loadCharacterSprite(newVariation, 0, false);
    state.lastAnimFrame = -1;
    state.paused = false;
    addToast(state.ui, '🎨 Character updated!', '#ce93d8', 2000);
  };

  document.getElementById('pauseMainMenu')!.onclick = () => {
    doSave(state);
    window.location.reload();
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
}

// ─── Wildlife Rendering ──────────────────────────────────────

function renderWildlife(renderer: IsometricRenderer, state: GameState): void {
  const wildlife = getVisibleWildlife(state.camera, state.player.x, state.player.y);
  if (wildlife.length === 0) return;

  const ctx = renderer.getCtx();
  const cw = RENDER_CONFIG.canvasWidth;
  const ch = RENDER_CONFIG.canvasHeight;

  for (const entity of wildlife) {
    const species = getSpecies(entity.speciesId);
    if (!species) continue;

    const anim = getAnimationOffset(entity);
    const { x: sx, y: sy } = renderer.gridToScreen(entity.worldX, entity.worldY, state.camera);

    // Viewport cull
    if (sx < -64 || sx > cw + 64 || sy < -64 || sy > ch + 64) continue;

    // Draw emoji sprite with animation offset
    const sprite = getEmojiSprite(species.emoji, 0);
    const size = sprite.width * species.scale;
    const drawX = sx + anim.dx - size / 2;
    const drawY = sy + anim.dy - size / 2;

    // Fleeing creatures fade out
    if (entity.behavior === 'flee') {
      const fadeT = entity.fleeCooldown / 120;
      ctx.globalAlpha = Math.max(0.15, fadeT);
    }

    ctx.drawImage(sprite, drawX, drawY, size, size);

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

  // Update thought bubble position (anchored above player sprite screen position)
  const playerScreen = renderer.gridToScreen(state.player.x, state.player.y, state.camera);
  updateBubblePosition(playerScreen.x, playerScreen.y);

  // Day/night cycle: tick the clock (rendering is handled by local-lights with lightmap)
  tickLighting();

  // Local lights: bonfire positions cached per chunk to avoid 5625+ cell scans every frame (#79)
  clearLights();
  const cs2 = WORLD_CONFIG.chunkSize;
  for (const [, chunk] of state.chunks) {
    if (!chunk.generated) continue;
    // lazily cache bonfire positions per chunk
    let bonfires = (chunk as any)._bonfireCache as { gx: number; gy: number }[] | undefined;
    if (bonfires === undefined) {
      bonfires = [];
      const baseGX = chunk.chunkX * cs2;
      const baseGY = chunk.chunkY * cs2;
      for (let cy = 0; cy < cs2; cy++) {
        for (let cx = 0; cx < cs2; cx++) {
          if (chunk.cells[cy][cx].assetKey === 'bonfire') {
            bonfires.push({ gx: baseGX + cx, gy: baseGY + cy });
          }
        }
      }
      (chunk as any)._bonfireCache = bonfires;
    }
    for (let i = 0; i < bonfires.length; i++) {
      addPointLight(bonfires[i].gx, bonfires[i].gy);
    }
  }
  addFlashlight(state.player.x, state.player.y, state.player.facingDx, state.player.facingDy);
  renderLocalLights(renderer.getCtx(), state.camera);

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

    // Status bars (#70)
    syncStatusBars(state.status);

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
        }
        break;
      case 'W': // Shift+W: cycle weather
        if (e.shiftKey) {
          const types: Array<'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'> = ['clear', 'cloudy', 'rain', 'storm', 'fog'];
          const cur = getWeatherInfo().type;
          const idx = types.indexOf(cur);
          setWeather(types[(idx + 1) % types.length]);
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
        // Use/consume best available status item (#70)
        if (!e.shiftKey && !e.ctrlKey && !state.quiz.active && !state.ui.dialog.active && !state.trade.active) {
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
    state,
    // Asset/biome metadata (#58)
    getAssetDefs: () => ASSET_DEFS,
    getBiomeDefs: () => BIOME_DEFS,
    // Status helpers (#70)
    getDebuffs: () => getDebuffs(state.status),
    useStatusItem: (itemId: string) => {
      const result = useStatusItem(state.status, itemId);
      if (result) addToast(state.ui, result, '#88ccff', 2000);
      return result;
    },
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
  };

  addToast(state.ui, 'Welcome! Use WASD to move, Space to interact.', '#88ccff', 4000);
  if (isTestMode()) {
    addToast(state.ui, '🧪 Test mode — LLM disabled', '#ffaa00', 3000);
  } else if (isWasmReady() && RENDER_CONFIG.useWasmRenderer) {
    addToast(state.ui, '⚡ WASM rendering core active', '#7fff7f', 3000);
  }

  // Wire Book of Knowledge UI
  wireBookUI(state.knowledge, () => { state.paused = false; });

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
    const choice = await showMainMenu(hasSaveData);

    if (choice === 'new-game') {
      resetGameState(state);
      // Character customizer
      const customVariation = await showCustomizer(state.playerVariation);
      clearVariationCache('custom');
      state.playerVariation = customVariation;
      state.egoImg = loadCharacterSprite(customVariation, 0, false);
      state.lastAnimFrame = -1;
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
