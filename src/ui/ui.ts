/**
 * ui.ts - HTML-based HUD overlay system + right sidebar.
 * Manages toasts, dialog, quiz display, debug info, inventory tray,
 * bottom HUD bar, and sidebar panels — all via DOM elements (no canvas drawing).
 * TODO: DOC - UI layout diagram
 */

import { LLM_CONFIG } from '../config/game.config';
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

export function wireHudButtons(
  onInventory: () => void,
  onDebug: () => void,
  onSave: () => void,
  onSlotSave?: (slot: number) => void,
  onSlotLoad?: (slot: number) => void,
  onSlotDelete?: (slot: number) => void,
): void {
  const btnInv = document.getElementById('btnInventory');
  const btnDbg = document.getElementById('btnDebug');
  const btnSave = document.getElementById('btnSave');
  const btnExpand = document.getElementById('btnExpand');
  const hudOverlay = document.getElementById('hudOverlay');

  btnInv?.addEventListener('click', onInventory);
  btnDbg?.addEventListener('click', onDebug);
  btnSave?.addEventListener('click', onSave);

  // Music popup toggle (#138)
  const btnMusic = document.getElementById('btnMusic');
  const musicPopup = document.getElementById('musicPopup');
  const btnMusicClose = document.getElementById('btnMusicPopupClose');
  btnMusic?.addEventListener('click', () => {
    if (!musicPopup) return;
    const visible = musicPopup.style.display !== 'none';
    musicPopup.style.display = visible ? 'none' : 'block';
  });
  btnMusicClose?.addEventListener('click', () => {
    if (musicPopup) musicPopup.style.display = 'none';
  });

  btnExpand?.addEventListener('click', () => {
    const expanded = hudOverlay?.classList.toggle('expanded');
    if (btnExpand) btnExpand.textContent = expanded ? '▼' : '▲';
  });

  // Sidebar toggle
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  sidebarToggle?.addEventListener('click', () => {
    const collapsed = sidebar?.classList.toggle('collapsed');
    if (sidebarToggle) sidebarToggle.textContent = collapsed ? '▶' : '◀';
    if (sidebarToggle) {
      sidebarToggle.style.right = collapsed ? '0' : '240px';
    }
  });

  // Save slot event delegation
  const sbSaveSlots = document.getElementById('sbSaveSlots');
  sbSaveSlots?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action;
    const slot = parseInt(btn.dataset.slot ?? '', 10);
    if (isNaN(slot)) return;
    if (action === 'save' && onSlotSave) onSlotSave(slot);
    else if (action === 'load' && onSlotLoad) onSlotLoad(slot);
    else if (action === 'delete' && onSlotDelete) onSlotDelete(slot);
  });

  // LLM config panel
  initLlmConfigPanel();
}

// ─── LLM Config Panel ───────────────────────────────────────

const LLM_SETTINGS_KEY = 'emilys_game_llm_settings';

interface LlmSettings {
  mode: 'local' | 'remote' | 'off';
  url: string;
  apiKey: string;
}

function loadLlmSettings(): LlmSettings {
  try {
    const raw = localStorage.getItem(LLM_SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as LlmSettings;
  } catch { /* ignore */ }
  return {
    mode: 'local',
    url: LLM_CONFIG.endpoint,
    apiKey: LLM_CONFIG.apiKey,
  };
}

function saveLlmSettings(settings: LlmSettings): void {
  localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(settings));
}

function initLlmConfigPanel(): void {
  // #138: LLM config now lives in Options overlay only (removed from sidebar)
  const modeEl = document.getElementById('optLlmMode') as HTMLSelectElement | null;
  const urlEl = document.getElementById('optLlmUrl') as HTMLInputElement | null;
  const keyEl = document.getElementById('optLlmApiKey') as HTMLInputElement | null;
  const applyBtn = document.getElementById('optLlmApply');
  if (!modeEl || !urlEl || !applyBtn) return;

  // Load saved settings
  const settings = loadLlmSettings();
  modeEl.value = settings.mode;
  urlEl.value = settings.url;
  if (keyEl) keyEl.value = settings.apiKey;

  // Apply: update LLM_CONFIG in-memory and persist
  applyBtn.addEventListener('click', () => {
    const newSettings: LlmSettings = {
      mode: modeEl.value as LlmSettings['mode'],
      url: urlEl.value.trim() || '/api/llm',
      apiKey: keyEl ? keyEl.value.trim() || 'local-secret' : 'local-secret',
    };
    saveLlmSettings(newSettings);

    // Update LLM_CONFIG live (cast to mutable)
    (LLM_CONFIG as Record<string, unknown>).endpoint = newSettings.url;
    (LLM_CONFIG as Record<string, unknown>).apiKey = newSettings.apiKey;

    // Visual confirmation
    applyBtn.textContent = '✓ Applied';
    setTimeout(() => { applyBtn.textContent = 'Apply'; }, 1500);
    console.log('[UI] LLM config applied:', newSettings.mode, newSettings.url);
  });
}

// ─── Status Bar Sync (#70) ────────────────────────────────────
// B7.5: syncStatusBars moved to src/ui/status-bars.ts.

// ─── Audio UI Sync (#107, #75, #76) ──────────────────────────
// B7.6: syncMusicUI, syncSfxUI, syncVoiceUI moved to src/ui/audio-ui.ts.
