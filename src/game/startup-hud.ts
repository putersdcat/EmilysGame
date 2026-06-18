// filepath: src/game/startup-hud.ts
// B5 micro-slice 11.43 (#268): post-init HUD wiring + debug surface +
// startup toasts extracted from main.ts main(). Runs after init() and
// before the menu flow — wires the HUD buttons, sets up the __gameDebug
// surface, shows the welcome toast (with test-mode / WASM badges), and
// registers HUD event listeners via wireHudEvents.
//
// Imports the slot action handler factories from ./slot-actions.ts so
// the wireHudButtons() call here stays a clean list of named handlers
// instead of an inline 24-line block (B5.40).
import type { GameState } from './game-state';
import type { InputManager } from './input';
import { addToast, wireHudButtons } from '../ui/ui';
import { setFogEnabled } from '../rendering/fog';
import { isTeslaMode } from './platform';
import { isTestMode } from '../engine/llm';
import { isWasmReady } from '../rendering/wasm-bridge';
import { RENDER_CONFIG } from '../config/game.config';
import { wireHudEvents } from './dom-wiring';
import { createGameDebug } from './debug-api';
import { checkCosmeticUnlocks } from './cosmetic-unlocks';
import { shouldAutoRead } from './auto-read';
import { doSave } from './save-build';
import {
  makeSlotSaveHandler, makeSlotLoadHandler, makeSlotDeleteHandler,
} from './slot-actions';

// ─── Localstorage keys ──────────────────────────────────────
/** localStorage key for the user-saved fog-of-war toggle (#127). */
const FOG_ENABLED_STORAGE_KEY = 'emilys_game_fog_enabled';

// ─── Welcome toast config ───────────────────────────────────
const WELCOME_TOAST_MS = 4000;
const TEST_MODE_TOAST_MS = 3000;
const WASM_TOAST_MS = 3000;

/**
 * Run the post-init HUD wiring. This is everything that happens between
 * `await init()` and `await showWelcomeSplash()` — wires HUD buttons,
 * exposes the debug surface, shows the welcome toast + any mode-specific
 * badges, and registers HUD event listeners.
 *
 * **Synchronous** — DOM listener registration is sync; the fog pref and
 * Tesla badge reads are sync; toasts are fire-and-forget DOM mutations.
 */
export function wireStartupHud(state: GameState, input: InputManager): void {
  // Restore fog-of-war preference from localStorage (#127)
  const fogPref = localStorage.getItem(FOG_ENABLED_STORAGE_KEY);
  if (fogPref !== null) {
    setFogEnabled(fogPref === '1');
  }

  // Apply Tesla mode badge on startup (#185)
  if (isTeslaMode()) {
    const teslaBadge = document.getElementById('teslaBadge');
    if (teslaBadge) teslaBadge.classList.add('active');
  }

  // Wire HTML HUD buttons (slot actions via ./slot-actions.ts, #268 B5.40)
  wireHudButtons(
    () => { if (!state.quiz.active && !state.ui.dialog.active) state.ui.showInventory = !state.ui.showInventory; },
    () => { state.ui.showDebug = !state.ui.showDebug; },
    () => { doSave(state); addToast(state.ui, 'Game saved!', '#4caf50', 1500); },
    makeSlotSaveHandler(state),
    makeSlotLoadHandler(state),
    makeSlotDeleteHandler(state),
  );

  // Debug hooks for testing (available via window.__gameDebug)
  // B5 micro-slice 11.5 (#268): __gameDebug surface extracted to
  // ./game/debug-api.ts. See createGameDebug() for the full API.
  (window as any).__gameDebug = createGameDebug({
    state,
    input,
    doSave,
    checkCosmeticUnlocks,
    shouldAutoRead,
  });

  addToast(state.ui, 'Welcome! Use WASD to move, Space to interact.', '#88ccff', WELCOME_TOAST_MS);
  if (isTestMode()) {
    addToast(state.ui, '🧪 Test mode — LLM disabled', '#ffaa00', TEST_MODE_TOAST_MS);
  } else if (isWasmReady() && RENDER_CONFIG.useWasmRenderer) {
    addToast(state.ui, '⚡ WASM rendering core active', '#7fff7f', WASM_TOAST_MS);
  }

  // B5 micro-slice 11.6 (#268): HUD DOM event wiring extracted to
  // ./game/dom-wiring.ts. See wireHudEvents() for the full wiring.
  wireHudEvents({ state, input, onBookClose: () => { state.paused = false; } });
}
