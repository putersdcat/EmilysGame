/**
 * main.ts - Game loop, initialization, and system integration.
 * Ties together: world gen, rendering, input, mechanics, quiz, inventory, UI.
 * TODO: DOC - game loop sequence diagram
 */

import { WORLD_CONFIG, PLAYER_CONFIG, RENDER_CONFIG } from './config/game.config';
import { getBiome } from './config/biomes.config';
import { IsometricRenderer, type Camera } from './render';
import { InputManager } from './input';
import { characterVariations, loadCharacterSprite } from './sprites';
import { generateChunkSync, setWordlist, type ChunkData, type BorderConstraints } from './gen';
import { generateWordlist, checkLlmHealth } from './llm';
import { FALLBACK_WORDLIST } from './config/entropy.config';
import { isWalkable, interact, autoCollect, type InteractionResult } from './mechanics';
import { createInventory, type Inventory } from './inventory';
import { createQuizState, startQuiz, quizNavigate, quizSubmit, quizClose, quizReward, type QuizState } from './quiz';
import { createUIState, addToast, showDialog, advanceDialog, closeDialog, renderUI, wireHudButtons, markSaveSlotsDirty, type UIState } from './ui';
import { saveGame, loadGame, saveToSlot, loadFromSlot, deleteSlot, type SaveData } from './save';
import { getNpcPersona } from './config/npc.config';
import { preloadTiles } from './tiles';
import { initWasmRenderer, isWasmReady, wasmBenchmark, updateWasmConfig } from './wasm-bridge';
import { clearTerrainCache, tickWaterAnimation } from './terrain-cache';
import { clearObjectCache } from './render';
import { preloadEmojiSprites } from './emoji-cache';


// ─── Game State ──────────────────────────────────────────────

interface GameState {
  player: {
    x: number;
    y: number;
    direction: number;    // 1 = right, -1 = left (sprite flip)
    facingDx: number;     // Last movement dx (-1/0/1)
    facingDy: number;     // Last movement dy (-1/0/1)
    speed: number;
    isMoving: boolean;
    animFrame: number;
  };
  camera: Camera;
  chunks: Map<string, ChunkData>;
  inventory: Inventory;
  quiz: QuizState;
  ui: UIState;
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
  lastChunkX: number;
  lastChunkY: number;
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
    state.lastChunkX = pcx;
    state.lastChunkY = pcy;
    ensureChunksAround(state);
  }
}

// ─── LLM Connection Gate ─────────────────────────────────────

/** Show splash and poll LLM until connected. Returns only when healthy. */
async function waitForLlm(): Promise<void> {
  const splash = document.getElementById('llmSplash');
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

async function init(): Promise<{ state: GameState; renderer: IsometricRenderer; input: InputManager }> {
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

  // Start with fallback wordlist immediately, swap in LLM wordlist when ready
  // (LLM is CPU BitNet — wordlist gen can take 60-120s, don't block init)
  setWordlist([...FALLBACK_WORDLIST]);
  generateWordlist().then((wl) => {
    setWordlist(wl);
    console.log('[INIT] LLM wordlist ready');
  });

  // Preload SVG tile sprites (async, must complete before rendering)
  await preloadTiles();

  // Pre-render emoji sprites → eliminates per-frame ctx.filter + fillText
  preloadEmojiSprites();

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
  const variation = characterVariations[PLAYER_CONFIG.defaultVariation];
  const egoImg = loadCharacterSprite(variation, 0, false);

  // Try loading saved game
  const save = loadGame();

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
      speed: PLAYER_CONFIG.speed,
      isMoving: false,
      animFrame: 0,
    },
    camera: {
      x: startX,
      y: startY,
    },
    chunks: new Map(),
    inventory: createInventory(),
    quiz: createQuizState(),
    ui: createUIState(),
    quizStats: save?.quizStats ?? { answered: 0, correct: 0 },
    egoImg,
    frameCount: 0,
    fps: 0,
    lastFpsTime: performance.now(),
    fpsCounter: 0,
    paused: false,
    initialized: true,
    lastAnimFrame: -1,
    lastChunkX: Math.floor(startX / size),
    lastChunkY: Math.floor(startY / size),
  };

  // Restore inventory from save
  if (save?.inventory) {
    for (const slot of save.inventory) {
      state.inventory.addItem(slot.itemId, slot.quantity);
    }
  }

  // Generate initial chunks
  ensureChunksAround(state);

  // Expose state for debugging / E2E tests
  (window as any).__gameState = state;

  return { state, renderer, input };
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
        }
        state.quizStats.answered++;
        quizClose(state.quiz);
        state.paused = false;
      } else {
        quizSubmit(state.quiz);
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
        state.paused = false;
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

    // Direction
    if (mv.dx > 0) state.player.direction = 1;
    else if (mv.dx < 0) state.player.direction = -1;

    // Track full 2D facing direction for interaction
    if (mv.dx !== 0 || mv.dy !== 0) {
      state.player.facingDx = Math.sign(mv.dx);
      state.player.facingDy = Math.sign(mv.dy);
    }

    state.player.isMoving = true;
    // Throttle animation: only advance sprite frame every 6th game frame
    if (state.frameCount % 6 === 0) {
      state.player.animFrame = (state.player.animFrame + 1) % PLAYER_CONFIG.animationFrames;
    }

    // Walking sprite - ONLY reload when frame actually changes
    if (state.player.animFrame !== state.lastAnimFrame) {
      const variation = characterVariations[PLAYER_CONFIG.defaultVariation];
      state.egoImg = loadCharacterSprite(variation, state.player.animFrame, true);
      state.lastAnimFrame = state.player.animFrame;
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
    // Idle sprite - only reload once when stopping
    if (state.player.animFrame !== 0 || state.lastAnimFrame !== 0) {
      state.player.animFrame = 0;
      const variation = characterVariations[PLAYER_CONFIG.defaultVariation];
      state.egoImg = loadCharacterSprite(variation, 0, false);
      state.lastAnimFrame = 0;
    }
  }

  // --- Interaction (Space, edge-detected) ---
  if (justKeys.interact && !isMoving) {
    // Try facing direction first, then check all 4 neighbors as fallback
    const facingDir = {
      dx: state.player.facingDx || state.player.direction,
      dy: state.player.facingDy,
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

      // If NPC can quiz, start quiz after dialog
      if (persona?.canQuiz) {
        // Quiz starts on dialog close (handled in update loop)
        // For now, store pending quiz
        setTimeout(() => {
          if (!state.quiz.active) {
            startQuiz(state.quiz, persona.quizDifficulty, result.npcId);
            state.paused = true;
          }
        }, 100);
      }
      break;
    }

    case 'sign':
      showDialog(state.ui, 'Sign', [result.message]);
      state.paused = true;
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
  };
}

/** Apply loaded save data to current game state */
function applySaveData(state: GameState, data: SaveData): void {
  state.player.x = data.player.x;
  state.player.y = data.player.y;
  state.player.direction = data.player.direction;
  state.inventory.deserialize(data.inventory);
  state.quizStats = { ...data.quizStats };
  // Force camera + chunk reload
  state.camera.x = data.player.x;
  state.camera.y = data.player.y;
  clearTerrainCache();
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
      case 'Escape':
        if (state.ui.showInventory) state.ui.showInventory = false;
        else if (state.ui.dialog.active) {
          closeDialog(state.ui);
          state.paused = false;
        }
        break;
    }
  });
}

// ─── Entry Point ─────────────────────────────────────────────

async function main(): Promise<void> {
  const { state, renderer, input } = await init();
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

  addToast(state.ui, 'Welcome! Use WASD to move, Space to interact.', '#88ccff', 4000);
  if (isWasmReady() && RENDER_CONFIG.useWasmRenderer) {
    addToast(state.ui, '⚡ WASM rendering core active', '#7fff7f', 3000);
  }
  requestAnimationFrame((t) => gameLoop(t, { state, renderer, input }));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
