/**
 * ui.ts - HTML-based HUD overlay system + right sidebar.
 * Manages toasts, dialog, quiz display, debug info, inventory tray,
 * bottom HUD bar, and sidebar panels — all via DOM elements (no canvas drawing).
 * TODO: DOC - UI layout diagram
 */

import type { Inventory } from '../game/inventory';
import type { QuizState } from '../game/quiz';
import { syncHUD } from './hud';
import { syncDialog, syncQuiz } from './overlays';
import { syncDebug } from './debug-overlay';
import { syncInventoryTray } from './inventory-tray';
import { syncSidebar } from './sidebar';
export { markSaveSlotsDirty } from './sidebar';
export { syncStatusBars } from './status-bars';
export { syncMusicUI, syncSfxUI, syncVoiceUI } from './audio-ui';
export { wireHudButtons } from './hud-wiring';

// ─── Types ───────────────────────────────────────────────────

export interface DialogState {
  active: boolean;
  npcName: string;
  lines: string[];
  currentLine: number;
}

export interface ToastMessage {
  text: string;
  color: string;
  expiresAt: number;
}

export interface UIState {
  dialog: DialogState;
  toasts: ToastMessage[];
  showDebug: boolean;
  showInventory: boolean;
}

// ─── Create State ────────────────────────────────────────────

export function createUIState(): UIState {
  return {
    dialog: { active: false, npcName: '', lines: [], currentLine: 0 },
    toasts: [],
    showDebug: false,
    showInventory: false,
  };
}

// ─── Toast Messages ──────────────────────────────────────────

export function addToast(ui: UIState, text: string, color = '#fff', durationMs = 2000): void {
  ui.toasts.push({ text, color, expiresAt: Date.now() + durationMs });
  // Inject into DOM immediately
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.style.color = color;
  container.appendChild(el);
  setTimeout(() => el.remove(), durationMs + 600);
}

function pruneToasts(ui: UIState): void {
  const now = Date.now();
  ui.toasts = ui.toasts.filter((t) => t.expiresAt > now);
}

// ─── Dialog ──────────────────────────────────────────────────

export function showDialog(ui: UIState, npcName: string, lines: string[]): void {
  ui.dialog = { active: true, npcName, lines, currentLine: 0 };
}

export function advanceDialog(ui: UIState): boolean {
  if (!ui.dialog.active) return false;
  ui.dialog.currentLine++;
  if (ui.dialog.currentLine >= ui.dialog.lines.length) {
    ui.dialog.active = false;
    return false;
  }
  return true;
}

export function closeDialog(ui: UIState): void {
  ui.dialog.active = false;
}

// ─── DOM Sync: called every frame from main ──────────────────

/**
 * Synchronize the entire HTML HUD with current game state.
 * Replaces the old canvas-based renderUI.
 */
export function renderUI(
  _ctx: CanvasRenderingContext2D,
  ui: UIState,
  inventory: Inventory,
  quiz: QuizState,
  playerPos: { x: number; y: number },
  fps: number,
  quizStats?: { answered: number; correct: number },
  biomeName?: string,
): void {
  pruneToasts(ui);
  syncHUD(inventory, playerPos);
  syncDialog(ui.dialog);
  syncQuiz(quiz);
  syncDebug(ui.showDebug, playerPos, fps);
  syncInventoryTray(ui.showInventory, inventory);
  syncSidebar(inventory, playerPos, fps, quizStats, biomeName);
}

// --- HUD bar (coins, keys, difficulty, LLM dot) ---
// B7.1: syncHUD + TIER_EMOJI / TIER_CLASS moved to src/ui/hud.ts.

// --- Dialog + Quiz overlays ---
// B7.2: syncDialog + syncQuiz moved to src/ui/overlays.ts.

// --- Inventory tray + Debug overlay ---
// B7.3: syncInventoryTray moved to src/ui/inventory-tray.ts
//       syncDebug moved to src/ui/debug-overlay.ts

// ─── Sidebar Sync ────────────────────────────────────────────
// B7.4: syncSidebar + syncSidebarInventory + syncSaveSlots +
//       markSaveSlotsDirty moved to src/ui/sidebar.ts.

// ─── HUD Button Wiring (call once after init) ───────────────
// B7.7: wireHudButtons + initLlmConfigPanel + LLM_SETTINGS_KEY +
//       LlmSettings type moved to src/ui/hud-wiring.ts.

// ─── Status Bar Sync (#70) ────────────────────────────────────
// B7.5: syncStatusBars moved to src/ui/status-bars.ts.

// ─── Audio UI Sync (#107, #75, #76) ──────────────────────────
// B7.6: syncMusicUI, syncSfxUI, syncVoiceUI moved to src/ui/audio-ui.ts.
