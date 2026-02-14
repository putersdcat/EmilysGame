/**
 * main.ts - Game loop, initialization, and system integration.
 * Ties together: world gen, rendering, input, mechanics, quiz, inventory, UI.
 * TODO: DOC - game loop sequence diagram
 */

import { WORLD_CONFIG, PLAYER_CONFIG, RENDER_CONFIG } from './config/game.config';
import { getBiome } from './config/biomes.config';
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
import { createUIState, addToast, showDialog, advanceDialog, closeDialog, renderUI, wireHudButtons, markSaveSlotsDirty, type UIState } from './ui';
import { saveGame, loadGame, saveToSlot, loadFromSlot, deleteSlot, type SaveData } from './save';
import { getNpcPersona } from './config/npc.config';
import { preloadTiles } from './tiles';
import { initWasmRenderer, isWasmReady, wasmBenchmark, updateWasmConfig } from './wasm-bridge';
import { clearTerrainCache, tickWaterAnimation, invalidateChunkTerrain } from './terrain-cache';
import { clearObjectCache } from './render';
import { preloadEmojiSprites } from './emoji-cache';
import { initMinimap, renderMinimap } from './minimap';
import {
  createKnowledgeState, toggleBook, syncBookUI, wireBookUI, showSubjectSelection,
  getQuizBias, openArticle,
  type KnowledgeState,
} from './knowledge';
import { searchArticles } from './config/knowledge.config';
import { showCustomizer, createDefaultVariation, serializeVariation, deserializeVariation } from './customizer';
import { updateAndRenderParticles, clearParticles } from './particles';
import { tickLighting, setTimeOfDay, getCycleProgress } from './lighting';
import { updateAndRenderWeather, setWeather, getWeatherInfo, clearWeather } from './weather';
import { clearLights, addPointLight, addFlashlight, renderLocalLights, toggleFlashlight } from './local-lights';
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
  };

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
  }

  // Generate initial chunks
  ensureChunksAround(state);

  // Expose state for debugging / E2E tests
  (window as any).__gameState = state;

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
    if (justKeys.up) quizNavigate(state.quiz, -1);
    if (justKeys.down) quizNavigate(state.quiz, 1);
    if (justKeys.interact) {
      if (state.quiz.result !== 'pending') {
        if (state.quiz.result === 'correct') {
          const rewards = quizReward(state.quiz.difficulty);
          for (const r of rewards) state.inventory.addItem(r.itemId, r.qty);
          addToast(state.ui, `Quiz reward! +${rewards.map((r) => `${r.qty} ${r.itemId}`).join(', ')}`, '#4caf50');
          state.quizStats.correct++;

          // Resolve quiz gate if this quiz was gate-triggered (Doc 05 §3.5)
          if (state.pendingGateQuiz) {
            const g = state.pendingGateQuiz;
            resolveQuizGate(g.chunkKey, g.lx, g.ly, state.chunks);
            state.pendingGateQuiz = null;
            addToast(state.ui, '🚪 The gate opens!', '#64b5f6');
          }
        } else if (state.quiz.result === 'wrong' && state.pendingGateQuiz) {
          // Wrong answer — gate stays closed
          state.pendingGateQuiz = null;
          addToast(state.ui, '🚫 The gate remains shut. Try again!', '#f44336');
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
        state.paused = state.knowledge.bookOpen;
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
        // Start pending quiz if NPC queued one, otherwise unpause
        if (state.pendingQuiz) {
          const pq = state.pendingQuiz;
          state.pendingQuiz = null;
          startQuiz(state.quiz, pq.difficulty, pq.npcId, pq.bias);
          // state.paused stays true for quiz
        } else {
          state.paused = false;
        }
      }
    }
    input.endFrame();
    return;
  }

  // --- Movement ---
  const mv = input.getMovementVector();
  const isMoving = mv.dx !== 0 || mv.dy !== 0;

  if (isMoving) {
    const newX = state.player.x + mv.dx * state.player.speed;
    const newY = state.player.y + mv.dy * state.player.speed;

    // Collision check
    if (isWalkable(Math.round(newX), Math.round(newY), state.chunks)) {
      state.player.x = newX;
      state.player.y = newY;
    }

    // Direction (left/right flip)
    if (mv.dx > 0) state.player.direction = 1;
    else if (mv.dx < 0) state.player.direction = -1;

    // Track full 2D facing direction for interaction
    if (mv.dx !== 0 || mv.dy !== 0) {
      state.player.facingDx = Math.sign(mv.dx);
      state.player.facingDy = Math.sign(mv.dy);
    }

    // Determine facing pose for sprite selection:
    // In isometric: grid +y = SE (toward camera) = front, grid -y = NW (away) = back
    // Horizontal movement keeps current pose; vertical movement changes it.
    // Diagonal: use the vertical component to pick pose.
    if (mv.dy < 0) {
      state.player.facingPose = 'back';
    } else if (mv.dy > 0) {
      state.player.facingPose = 'front';
    }
    // If only horizontal (dy=0), keep current facingPose for smooth transitions

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

  // --- Toggle Debug (F3) ---
  // Handled in extended input listener below

  // --- Auto-save every 30s ---
  if (state.frameCount % (60 * 30) === 0) {
    doSave(state);
  }

  // Snapshot input for edge detection next frame
  input.endFrame();
}

function handleInteraction(result: InteractionResult, state: GameState): void {
  switch (result.type) {
    case 'collect':
      state.inventory.addItem(result.itemId, 1);
      addToast(state.ui, result.message, '#ffd700');
      break;

    case 'chest':
      for (const itemId of result.items) state.inventory.addItem(itemId, 1);
      addToast(state.ui, result.message, '#ffaa00');
      break;

    case 'obstacle':
      if (result.resolved) {
        addToast(state.ui, result.message, '#4caf50');
      } else {
        addToast(state.ui, result.message, '#f44336');
      }
      break;

    case 'npc': {
      const persona = getNpcPersona(result.npcId);
      const npcName = persona?.displayName || 'Stranger';
      showDialog(state.ui, npcName, [result.greeting]);
      state.paused = true;

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
      break;
    }

    case 'sign':
      showDialog(state.ui, 'Sign', [result.message]);
      state.paused = true;
      break;

    case 'quiz_gate': {
      // Quiz gate — show dialog then trigger distance-based quiz (Doc 05 §3.5)
      showDialog(state.ui, 'Quiz Gate', [result.message]);
      state.paused = true;
      const gateDiff = getDifficultyForPosition(state.player.x, state.player.y);
      const gateBias = getQuizBias(state.knowledge);
      state.pendingQuiz = { difficulty: gateDiff, npcId: 'quiz_gate', bias: gateBias };
      state.pendingGateQuiz = { chunkKey: result.chunkKey, lx: result.lx, ly: result.ly };
      break;
    }
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
  // Force camera + chunk reload
  state.camera.x = data.player.x;
  state.camera.y = data.player.y;
  clearTerrainCache();
  clearParticles();
  clearWeather();
}

function doSave(state: GameState): void {
  saveGame(buildSaveData(state));
  markSaveSlotsDirty();
}

// ─── Render ──────────────────────────────────────────────────

function renderFrame(
  renderer: IsometricRenderer,
  state: GameState,
): void {
  // World render (WASM if available, JS fallback)
  renderer.renderAuto(
    state.chunks,
    state.camera,
    { x: state.player.x, y: state.player.y },
    state.player.direction,
    state.egoImg,
    state.ui.showDebug,
  );

  // Ambient particles (butterflies, sparkles, leaves, birds)
  updateAndRenderParticles(renderer.getCtx(), state.chunks, state.camera);

  // Day/night cycle: tick the clock (rendering is handled by local-lights with lightmap)
  tickLighting();

  // Local lights: collect bonfire positions from visible chunks + player flashlight
  // renderLocalLights also handles the darkness overlay (replaces updateAndRenderLighting rendering)
  clearLights();
  const cs = WORLD_CONFIG.chunkSize;
  for (const [, chunk] of state.chunks) {
    if (!chunk.generated) continue;
    const baseGX = chunk.chunkX * cs;
    const baseGY = chunk.chunkY * cs;
    for (let cy = 0; cy < cs; cy++) {
      for (let cx = 0; cx < cs; cx++) {
        if (chunk.cells[cy][cx].assetKey === 'bonfire') {
          addPointLight(baseGX + cx, baseGY + cy);
        }
      }
    }
  }
  addFlashlight(state.player.x, state.player.y, state.player.facingDx, state.player.facingDy);
  renderLocalLights(renderer.getCtx(), state.camera);

  // Weather effects (rain, fog, clouds, lightning)
  updateAndRenderWeather(renderer.getCtx());

  // UI overlay - throttle DOM sync to every 4th frame
  if (state.frameCount % 4 === 0 || state.quiz.active || state.ui.dialog.active) {
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
      case 'Escape':
        if (state.knowledge.bookOpen) {
          state.knowledge.bookOpen = false;
          state.knowledge.currentArticleId = null;
          state.paused = false;
        } else if (state.ui.showInventory) state.ui.showInventory = false;
        else if (state.ui.dialog.active) {
          closeDialog(state.ui);
          state.pendingQuiz = null; // Cancel pending quiz on Escape
          state.pendingGateQuiz = null; // Cancel pending gate quiz on Escape
          state.paused = false;
        }
        break;
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

  // Show character customizer + subject selection for new games (no save data)
  if (!hasSaveData && !isTestMode()) {
    // Character customizer first
    const customVariation = await showCustomizer(state.playerVariation);
    clearVariationCache('custom');
    state.playerVariation = customVariation;
    state.egoImg = loadCharacterSprite(customVariation, 0, false);
    state.lastAnimFrame = -1; // force sprite reload on next movement

    // Then subject selection
    await showSubjectSelection(state.knowledge);
    addToast(state.ui, '📖 Press B to open your Book of Knowledge!', '#ce93d8', 5000);
  }

  requestAnimationFrame((t) => gameLoop(t, { state, renderer, input }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
