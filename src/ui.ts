/**
 * ui.ts - HTML-based HUD overlay system + right sidebar.
 * Manages toasts, dialog, quiz display, debug info, inventory tray,
 * bottom HUD bar, and sidebar panels — all via DOM elements (no canvas drawing).
 * TODO: DOC - UI layout diagram
 */

import { ASSET_DEFS } from './config/assets.config';
import { ITEM_DEFS } from './config/items.config';
import { WORLD_CONFIG, LLM_CONFIG, getDifficulty } from './config/game.config';
import { getTerrainCacheSize } from './terrain-cache';
import { isLlmAvailable, getLlmTps, isTpsCutoverActive } from './llm';
import { getTimeOfDay } from './lighting';
import { getWeatherInfo } from './weather';
import { isFlashlightOn } from './local-lights';
import { getEntropyStats } from './gen';
import { getAllSlotInfo } from './save';
import type { Inventory } from './inventory';
import type { QuizState } from './quiz';

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

const TIER_EMOJI: Record<number, string> = { 0: '🟢', 1: '🟡', 2: '🟠', 3: '🔴', 4: '💀' };
const TIER_CLASS: Record<number, string> = { 0: 'tier-safe', 1: 'tier-easy', 2: 'tier-medium', 3: 'tier-hard', 4: 'tier-extreme' };

function syncHUD(inv: Inventory, playerPos: { x: number; y: number }): void {
  const coinEl = document.getElementById('coinStat');
  const keyEl = document.getElementById('keyStat');
  const llmDot = document.getElementById('llmDot');
  const diffEl = document.getElementById('difficultyBadge');
  if (coinEl) coinEl.textContent = `💰 ${inv.countItem('coin')}`;
  if (keyEl) keyEl.textContent = `🔑 ${inv.countItem('key')}`;
  if (diffEl) {
    const chunkSize = WORLD_CONFIG.chunkSize;
    const cx = Math.floor(playerPos.x / chunkSize);
    const cy = Math.floor(playerPos.y / chunkSize);
    const dist = Math.abs(cx) + Math.abs(cy);
    const diff = getDifficulty(dist);
    const emoji = TIER_EMOJI[diff.tier] ?? '🟢';
    const cls = TIER_CLASS[diff.tier] ?? 'tier-safe';
    diffEl.textContent = `${emoji} ${diff.tierName}`;
    diffEl.className = `hud-stat ${cls}`;
  }
  if (llmDot) {
    const ok = isLlmAvailable();
    llmDot.className = ok ? '' : 'off';
    llmDot.id = 'llmDot';
    llmDot.title = ok ? 'LLM: connected' : 'LLM: disconnected';
  }
  // Time of day badge
  const timeEl = document.getElementById('timeBadge');
  if (timeEl) {
    timeEl.textContent = getTimeOfDay();
  }
  // Weather badge
  const weatherEl = document.getElementById('weatherBadge');
  if (weatherEl) {
    const w = getWeatherInfo();
    weatherEl.textContent = `${w.emoji} ${w.label}`;
  }
  // Flashlight badge
  const flashEl = document.getElementById('flashlightBadge');
  if (flashEl) {
    flashEl.textContent = isFlashlightOn() ? '🔦 On' : '🔦 Off';
    flashEl.style.opacity = isFlashlightOn() ? '1' : '0.5';
  }
}

// --- Dialog ---

function syncDialog(dialog: DialogState): void {
  const el = document.getElementById('dialogOverlay');
  if (!el) return;
  if (!dialog.active) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  const nameEl = document.getElementById('dialogName');
  const textEl = document.getElementById('dialogText');
  const hintEl = document.getElementById('dialogHint');
  if (nameEl) nameEl.textContent = dialog.npcName;
  if (textEl) textEl.textContent = dialog.lines[dialog.currentLine] || '';
  if (hintEl) {
    hintEl.textContent = dialog.currentLine < dialog.lines.length - 1
      ? '▼ Space to continue'
      : 'Space to close';
  }
}

// --- Quiz ---

function syncQuiz(quiz: QuizState): void {
  const overlay = document.getElementById('quizOverlay');
  if (!overlay) return;

  if (!quiz.active) {
    overlay.style.display = 'none';
    return;
  }
  overlay.style.display = 'flex';

  const questionEl = document.getElementById('quizQuestion');
  const choicesEl = document.getElementById('quizChoices');
  const resultEl = document.getElementById('quizResult');
  const hintEl = document.getElementById('quizHint');
  const navEl = document.getElementById('quizNav');

  if (questionEl) questionEl.textContent = quiz.displayText;

  if (choicesEl) {
    choicesEl.innerHTML = '';
    quiz.choices.forEach((choice: string, i: number) => {
      const div = document.createElement('div');
      div.className = 'quiz-choice';
      const selected = i === quiz.selectedIndex;
      const isCorrect = i === quiz.correctIndex;
      const isIdkOption = i === quiz.choices.length - 1; // Last option is "I don't know"

      if (selected) div.classList.add('selected');
      if (quiz.result !== 'pending') {
        if (isCorrect) div.classList.add('correct');
        else if (selected && quiz.result === 'wrong') div.classList.add('wrong');
        else if (selected && quiz.result === 'idk') div.classList.add('idk');
      }

      const marker = selected ? '▸ ' : '  ';
      // Don't use letter label for "I don't know"
      const label = isIdkOption ? `${marker}${choice}` : `${marker}${String.fromCharCode(65 + i)}) ${choice}`;
      div.textContent = label;
      choicesEl.appendChild(div);
    });
  }

  if (resultEl) {
    if (quiz.result === 'pending') {
      resultEl.textContent = '';
    } else if (quiz.result === 'correct') {
      resultEl.textContent = '✅ Correct!';
      resultEl.style.color = '#4caf50';
    } else if (quiz.result === 'idk') {
      resultEl.textContent = '📖 Opening Book of Knowledge...';
      resultEl.style.color = '#ce93d8';
    } else {
      resultEl.textContent = '❌ Wrong!';
      resultEl.style.color = '#f44336';
    }
  }

  if (hintEl) {
    hintEl.textContent = (quiz.result === 'wrong' && quiz.question?.hint)
      ? `Hint: ${quiz.question.hint}` : '';
  }

  if (navEl) {
    navEl.textContent = quiz.result !== 'pending'
      ? (quiz.result === 'idk' ? 'Space to open Book' : 'Space to continue')
      : '↑↓ Navigate • Space to select';
  }
}

// --- Inventory tray ---

function syncInventoryTray(show: boolean, inv: Inventory): void {
  const overlay = document.getElementById('hudOverlay');
  const list = document.getElementById('invList');
  if (!overlay || !list) return;

  if (show) {
    overlay.classList.add('expanded');
  } else {
    overlay.classList.remove('expanded');
  }

  if (!show) return;

  list.innerHTML = '';
  if (inv.slots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inv-row';
    empty.style.color = '#888';
    empty.textContent = 'Inventory empty';
    list.appendChild(empty);
    return;
  }

  for (const slot of inv.slots) {
    const row = document.createElement('div');
    row.className = 'inv-row';

    const def = ITEM_DEFS[slot.itemId];
    const assetDef = ASSET_DEFS[slot.itemId];
    const emoji = assetDef?.emoji || '❓';
    const name = def?.displayName || slot.itemId;

    row.innerHTML = `<span class="emoji">${emoji}</span> ${name} <span class="qty">×${slot.quantity}</span>`;
    row.title = def?.description || name;
    list.appendChild(row);
  }
}

// --- Debug ---

function syncDebug(show: boolean, pos: { x: number; y: number }, fps: number): void {
  const el = document.getElementById('debugOverlay');
  if (!el) return;
  el.style.display = show ? 'block' : 'none';
  if (!show) return;
  const cs = WORLD_CONFIG.chunkSize;
  const ws = WORLD_CONFIG.worldUnitSize;
  const cx = Math.floor(pos.x / cs);
  const cy = Math.floor(pos.y / cs);
  // World unit within chunk
  const localX = ((pos.x % cs) + cs) % cs;
  const localY = ((pos.y % cs) + cs) % cs;
  const wux = Math.floor(localX / ws);
  const wuy = Math.floor(localY / ws);

  const tps = getLlmTps();
  const cutover = isTpsCutoverActive();
  const tpsLabel = tps > 0
    ? `LLM TPS: ${tps}${cutover ? ' ⚠ CUTOVER' : ''}`
    : 'LLM TPS: —';

  const entropy = getEntropyStats();
  const entropyLabel = `Entropy: ${entropy.poolSize}ch/${entropy.feedCount}feeds`;

  el.innerHTML = [
    `FPS: ${fps}`,
    `Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}`,
    `Chunk: ${cx},${cy}`,
    `WU: ${wux},${wuy}`,
    `Cache: ${getTerrainCacheSize()} chunks`,
    tpsLabel,
    entropyLabel,
  ].map((l) => `<span>${l}</span>`).join('');
}

// ─── Sidebar Sync ────────────────────────────────────────────

let sidebarSlotsDirty = true; // Rebuild save slot list when needed
let lastSidebarSyncFrame = 0;

function syncSidebar(
  inv: Inventory,
  pos: { x: number; y: number },
  fps: number,
  quizStats?: { answered: number; correct: number },
  biomeName?: string,
): void {
  // Throttle sidebar updates to every 8th call (~8fps)
  lastSidebarSyncFrame++;
  if (lastSidebarSyncFrame % 8 !== 0) return;

  // Player stats
  const sbCoins = document.getElementById('sbCoins');
  const sbKeys = document.getElementById('sbKeys');
  const sbCrowbars = document.getElementById('sbCrowbars');
  const sbPotions = document.getElementById('sbPotions');
  if (sbCoins) sbCoins.textContent = String(inv.countItem('coin'));
  if (sbKeys) sbKeys.textContent = String(inv.countItem('key'));
  if (sbCrowbars) sbCrowbars.textContent = String(inv.countItem('crowbar'));
  if (sbPotions) sbPotions.textContent = String(inv.countItem('potion'));

  // Quiz stats
  if (quizStats) {
    const sbQA = document.getElementById('sbQuizAnswered');
    const sbQC = document.getElementById('sbQuizCorrect');
    const sbQAcc = document.getElementById('sbQuizAccuracy');
    if (sbQA) sbQA.textContent = String(quizStats.answered);
    if (sbQC) sbQC.textContent = String(quizStats.correct);
    if (sbQAcc) {
      sbQAcc.textContent = quizStats.answered > 0
        ? `${Math.round(quizStats.correct / quizStats.answered * 100)}%`
        : '—';
    }
  }

  // Inventory grid
  syncSidebarInventory(inv);

  // Save slots (only rebuild when dirty)
  if (sidebarSlotsDirty) {
    syncSaveSlots();
    sidebarSlotsDirty = false;
  }

  // Debug section (shows when debug overlay is visible)
  const debugSection = document.getElementById('sbDebugSection');
  const debugOverlay = document.getElementById('debugOverlay');
  const debugVisible = debugOverlay?.style.display !== 'none';
  if (debugSection) {
    debugSection.style.display = debugVisible ? 'block' : 'none';
  }
  if (debugVisible) {
    const cs = WORLD_CONFIG.chunkSize;
    const sbPos = document.getElementById('sbPos');
    const sbChunk = document.getElementById('sbChunk');
    const sbBiome = document.getElementById('sbBiome');
    const sbFps = document.getElementById('sbFps');
    const sbCache = document.getElementById('sbCache');
    if (sbPos) sbPos.textContent = `${pos.x.toFixed(1)},${pos.y.toFixed(1)}`;
    if (sbChunk) sbChunk.textContent = `${Math.floor(pos.x / cs)},${Math.floor(pos.y / cs)}`;
    if (sbBiome) sbBiome.textContent = biomeName ?? '—';
    if (sbFps) sbFps.textContent = String(fps);
    if (sbCache) sbCache.textContent = `${getTerrainCacheSize()}`;
  }
}

function syncSidebarInventory(inv: Inventory): void {
  const grid = document.getElementById('sbInvGrid');
  if (!grid) return;

  // Only rebuild if slot count or contents have changed
  const maxSlots = 12;
  const cells = grid.children;

  // Rebuild if slot count is wrong
  if (cells.length !== maxSlots) {
    grid.innerHTML = '';
    for (let i = 0; i < maxSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'sb-inv-slot empty';
      grid.appendChild(slot);
    }
  }

  // Update slot contents
  for (let i = 0; i < maxSlots; i++) {
    const el = grid.children[i] as HTMLElement;
    if (!el) continue;
    const invSlot = inv.slots[i];
    if (invSlot) {
      const assetDef = ASSET_DEFS[invSlot.itemId];
      const itemDef = ITEM_DEFS[invSlot.itemId];
      el.className = 'sb-inv-slot';
      el.innerHTML = `${assetDef?.emoji || '❓'}<span class="qty">${invSlot.quantity > 1 ? invSlot.quantity : ''}</span>`;
      el.title = itemDef?.displayName || invSlot.itemId;
    } else {
      el.className = 'sb-inv-slot empty';
      el.innerHTML = '';
      el.title = 'Empty slot';
    }
  }
}

function syncSaveSlots(): void {
  const container = document.getElementById('sbSaveSlots');
  if (!container) return;

  container.innerHTML = '';
  const slots = getAllSlotInfo();

  for (const info of slots) {
    const row = document.createElement('div');
    row.className = `sb-save-slot${info.hasData ? ' has-data' : ''}`;
    row.dataset.slotIndex = String(info.slot);

    const timeStr = info.timestamp
      ? new Date(info.timestamp).toLocaleString(undefined, {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        })
      : 'Empty';

    if (info.hasData) {
      row.innerHTML = `
        <span class="slot-icon">📁</span>
        <span>Slot ${info.slot + 1}</span>
        <span class="slot-meta">${timeStr}</span>
        <button class="slot-btn slot-load" data-action="load" data-slot="${info.slot}" title="Load">▶</button>
        <button class="slot-btn slot-del" data-action="delete" data-slot="${info.slot}" title="Delete">🗑</button>
      `;
      row.title = `Slot ${info.slot + 1} — click Load or Delete`;
    } else {
      row.innerHTML = `
        <span class="slot-icon">📄</span>
        <span>Slot ${info.slot + 1}</span>
        <span class="slot-meta">Empty</span>
        <button class="slot-btn slot-save" data-action="save" data-slot="${info.slot}" title="Save here">💾</button>
      `;
      row.title = `Save to slot ${info.slot + 1}`;
    }
    container.appendChild(row);
  }
}

/** Mark save slots as needing rebuild (call after save/load/delete) */
export function markSaveSlotsDirty(): void {
  sidebarSlotsDirty = true;
}

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
  const modeEl = document.getElementById('llmMode') as HTMLSelectElement | null;
  const urlEl = document.getElementById('llmUrl') as HTMLInputElement | null;
  const keyEl = document.getElementById('llmApiKey') as HTMLInputElement | null;
  const applyBtn = document.getElementById('llmApply');
  if (!modeEl || !urlEl || !keyEl || !applyBtn) return;

  // Load saved settings
  const settings = loadLlmSettings();
  modeEl.value = settings.mode;
  urlEl.value = settings.url;
  keyEl.value = settings.apiKey;

  // Apply: update LLM_CONFIG in-memory and persist
  applyBtn.addEventListener('click', () => {
    const newSettings: LlmSettings = {
      mode: modeEl.value as LlmSettings['mode'],
      url: urlEl.value.trim() || '/api/llm',
      apiKey: keyEl.value.trim() || 'local-secret',
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
