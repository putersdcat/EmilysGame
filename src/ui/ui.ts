/**
 * ui.ts - HTML-based HUD overlay system + right sidebar.
 * Manages toasts, dialog, quiz display, debug info, inventory tray,
 * bottom HUD bar, and sidebar panels — all via DOM elements (no canvas drawing).
 * TODO: DOC - UI layout diagram
 */

import { ASSET_DEFS } from '../config/assets.config';
import { ITEM_DEFS } from '../config/items.config';
import { WORLD_CONFIG, LLM_CONFIG } from '../config/game.config';
import { getTerrainCacheSize, getTerrainCacheMemoryMB } from '../rendering/terrain-cache';
import { getLlmTps, isTpsCutoverActive } from '../engine/llm';
import { getPlayedSeconds } from '../rendering/lighting';
import { getEntropyStats, getWaterDebugInfo, getLockKeyDebugInfo } from '../engine/gen';
import { perfStats } from '../engine/perf';
import { getParticleStats } from '../rendering/particles';
import { getShadowDebugInfo } from '../rendering/shadows';
import { getBlendIntensity } from '../rendering/terrain-cache';
import { getAllSlotInfo } from '../game/save';
import type { Inventory } from '../game/inventory';
import type { QuizState } from '../game/quiz';
import type { PlayerStatus } from '../game/status';
import type { InjuryState } from '../game/injury';
import type { MusicState } from '../game/audio/music';
import type { SfxState } from '../game/audio/sfx';
import { getDebuffs } from '../game/status';
import { syncHUD } from './hud';

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

  // Show/hide repeat button based on voice support (#94)
  const repeatBtn = document.getElementById('quizRepeat');
  if (repeatBtn) {
    const voiceSupported = typeof speechSynthesis !== 'undefined';
    repeatBtn.style.display = voiceSupported ? 'inline-block' : 'none';
  }

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
      // Show both numeric key hint and letter label (#94)
      const numHint = isIdkOption ? '' : `${i + 1}. `;
      const letterLabel = isIdkOption ? '' : `${String.fromCharCode(65 + i)}) `;
      const label = isIdkOption
        ? `${marker}${choice}`
        : `${marker}${numHint}${letterLabel}${choice}`;
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
      : '↑↓ Navigate • 1-9 Quick Select • R Repeat • Space to select';
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
    `Cache: ${getTerrainCacheSize()} chunks (${getTerrainCacheMemoryMB().toFixed(1)}MB)`,
    tpsLabel,
    entropyLabel,
    `Perf: R:${perfStats.render.toFixed(1)} P:${perfStats.particles.toFixed(1)} Wi:${perfStats.wildlife.toFixed(1)} L:${perfStats.lighting.toFixed(1)} Wx:${perfStats.weather.toFixed(1)} U:${perfStats.update.toFixed(1)} T:${perfStats.total.toFixed(1)}ms`,
        getShadowDebugInfo(),
    `Blend: intensity=${getBlendIntensity().toFixed(2)}`,
    (() => { const ps = getParticleStats(); return `Particles: ${ps.total} (\u{1F98B}${ps.butterfly} \u{2728}${ps.sparkle} \u{1F343}${ps.leaf} \u{1F426}${ps.bird})`; })(),
    // Streak debug (#103) — read from __gameDebug if available
    (() => {
      const dbg = (window as any).__gameDebug;
      if (!dbg?.getStreakDebug) return '';
      const s = dbg.getStreakDebug();
      return `Streak: ${s.zone} cc:${s.consecutiveCorrect} cw:${s.consecutiveWrong} wr:${isNaN(s.windowRate) ? '-' : (s.windowRate * 100).toFixed(0) + '%'} [${s.lastReason}]`;
    })(),
    // Water/bridge debug (#100)
    (() => {
      const w = getWaterDebugInfo();
      return w.waterCells > 0 ? `Water: ${w.waterCells}💧 ${w.bridgeCells}🌉 ${w.leaks > 0 ? `⚠${w.leaks} leaks` : '✓'}` : '';
    })(),
    // Lock-Key DAG debug (#98)
    (() => {
      const d = getLockKeyDebugInfo();
      if (d.chunksValidated === 0) return '';
      const status = d.dagValid ? '✓' : `⚠${d.locksRemoved}rm`;
      return `DAG: ${d.totalLocks}🔒 ${d.keysPlaced}🔑 L${d.layers} ${d.chunksValidated}ch ${status}`;
    })(),
  ].filter(Boolean).map((l) => `<span>${l}</span>`).join('');
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

  // Playtime display (#136)
  const sbPlaytime = document.getElementById('sbPlaytime');
  if (sbPlaytime) {
    const totalSec = Math.floor(getPlayedSeconds());
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    sbPlaytime.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

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
    if (sbCache) sbCache.textContent = `${getTerrainCacheSize()} (${getTerrainCacheMemoryMB().toFixed(1)}MB)`;
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

let lastStatusSyncFrame = 0;

/** Sync survival status bars in sidebar. Call from game loop. */
export function syncStatusBars(status: PlayerStatus, injury?: InjuryState): void {
  // Throttle to every 12th call
  lastStatusSyncFrame++;
  if (lastStatusSyncFrame % 12 !== 0) return;

  const bars: Array<{ id: string; valId: string; value: number }> = [
    { id: 'sbEnergy', valId: 'sbEnergyVal', value: status.energy },
    { id: 'sbHydration', valId: 'sbHydrationVal', value: status.hydration },
    { id: 'sbCleanliness', valId: 'sbCleanlinessVal', value: status.cleanliness },
  ];

  for (const bar of bars) {
    const fill = document.getElementById(bar.id);
    const val = document.getElementById(bar.valId);
    if (fill) {
      fill.style.width = `${Math.max(0, Math.min(100, bar.value))}%`;
      // Add warning classes
      fill.classList.toggle('critical', bar.value <= 15);
      fill.classList.toggle('low', bar.value > 15 && bar.value <= 30);
    }
    if (val) val.textContent = String(Math.round(bar.value));
  }

  // Debuff list (includes injury indicator #109)
  const debuffs = getDebuffs(status);
  const allDebuffs = [...debuffs.activeDebuffs];
  if (injury?.injured) allDebuffs.push('🩹 Injured');
  const debuffEl = document.getElementById('sbDebuffs');
  if (debuffEl) {
    debuffEl.textContent = allDebuffs.length > 0
      ? allDebuffs.join(' · ')
      : '';
  }

  // Mini status meters (#138 — sync when sidebar collapsed)
  const miniMeters: Array<{ id: string; valId: string; value: number }> = [
    { id: 'miniEnergy', valId: 'miniEnergyVal', value: status.energy },
    { id: 'miniHydration', valId: 'miniHydrationVal', value: status.hydration },
    { id: 'miniCleanliness', valId: 'miniCleanlinessVal', value: status.cleanliness },
  ];
  for (const m of miniMeters) {
    const fill = document.getElementById(m.id);
    const val = document.getElementById(m.valId);
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, m.value))}%`;
    if (val) val.textContent = String(Math.round(m.value));
  }
}

// ─── Cassette Player UI Sync (#107 Phase 2) ──────────────────

let _lastMusicSyncFrame = 0;
let _cassetteCounter = 0;

export function syncMusicUI(music: MusicState): void {
  // Throttle to every 10th call
  if (++_lastMusicSyncFrame % 10 !== 0) return;

  const trackEl = document.getElementById('sbMusicTrack');
  const playBtn = document.getElementById('btnMusicPlayPause');
  const muteBtn = document.getElementById('btnMusicMute');
  const volSlider = document.getElementById('musicVolume') as HTMLInputElement | null;
  const reelL = document.getElementById('cassetteReelL');
  const reelR = document.getElementById('cassetteReelR');
  const progressFill = document.getElementById('cassetteProgress');
  const counterEl = document.getElementById('cassetteCounter');
  const composerEl = document.getElementById('sbMusicComposer');

  const isPlaying = music.playState === 'playing';

  // Reel spin animation
  if (reelL) reelL.classList.toggle('spinning', isPlaying);
  if (reelR) reelR.classList.toggle('spinning', isPlaying);

  // Track info
  if (trackEl) {
    if (music.currentTrackId) {
      const track = music.playlist.find(t => t.id === music.currentTrackId);
      if (track) {
        trackEl.textContent = track.name;
        if (composerEl) {
          composerEl.textContent = track.composer ? `♪ ${track.composer}` : '';
          composerEl.style.display = track.composer ? 'block' : 'none';
        }
      } else {
        trackEl.textContent = music.currentTrackId;
      }
    } else {
      trackEl.textContent = isPlaying ? '—' : '▸ INSERT TAPE ◂';
      if (composerEl) composerEl.style.display = 'none';
    }
  }

  // Progress bar — estimate from noteIndex / melody length
  if (progressFill) {
    const progress = music.trackProgress ?? 0; // 0-1
    progressFill.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
  }

  // Tape counter — simple incrementing counter when playing
  if (counterEl) {
    if (isPlaying) _cassetteCounter = (_cassetteCounter + 1) % 1000;
    counterEl.textContent = String(_cassetteCounter).padStart(3, '0');
  }

  // Play/pause button
  if (playBtn) {
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.classList.toggle('active', isPlaying);
  }

  // Mute button
  if (muteBtn) {
    muteBtn.textContent = music.settings.muted ? '🔇' : '🔊';
    muteBtn.classList.toggle('active', music.settings.muted);
  }

  // Volume slider
  if (volSlider && document.activeElement !== volSlider) {
    volSlider.value = String(Math.round(music.settings.volume * 100));
  }
}
// ─── SFX UI Sync (#75) ──────────────────────────────────────

let _lastSfxSyncFrame = 0;

export function syncSfxUI(sfx: SfxState): void {
  // Throttle to every 10th call
  if (++_lastSfxSyncFrame % 10 !== 0) return;

  const sfxMuteBtn = document.getElementById('btnSfxMute');
  const ambienceMuteBtn = document.getElementById('btnAmbienceMute');
  const sfxSlider = document.getElementById('sfxVolume') as HTMLInputElement | null;
  const ambSlider = document.getElementById('ambienceVolume') as HTMLInputElement | null;

  if (sfxMuteBtn) {
    sfxMuteBtn.textContent = sfx.settings.sfxMuted ? '🔇' : '🔊';
  }
  if (ambienceMuteBtn) {
    ambienceMuteBtn.textContent = sfx.settings.ambienceMuted ? '🔇' : '🔊';
  }
  if (sfxSlider && document.activeElement !== sfxSlider) {
    sfxSlider.value = String(Math.round(sfx.settings.sfxVolume * 100));
  }
  if (ambSlider && document.activeElement !== ambSlider) {
    ambSlider.value = String(Math.round(sfx.settings.ambienceVolume * 100));
  }
}

// ─── Voice UI Sync (#76) ────────────────────────────────────

import type { VoiceState } from '../game/audio/npc-voice';

let _lastVoiceSyncFrame = 0;

export function syncVoiceUI(voice: VoiceState): void {
  if (++_lastVoiceSyncFrame % 10 !== 0) return;

  const toggleBtn = document.getElementById('btnVoiceToggle');
  const volSlider = document.getElementById('voiceVolume') as HTMLInputElement | null;

  if (toggleBtn) {
    toggleBtn.textContent = voice.settings.enabled ? '🗣️' : '🔇';
    toggleBtn.title = voice.settings.enabled ? 'Voice enabled' : 'Voice disabled';
  }
  if (volSlider && document.activeElement !== volSlider) {
    volSlider.value = String(Math.round(voice.settings.volume * 100));
  }

  // If speech not supported, grey out controls
  const section = document.getElementById('sbVoiceSection');
  if (section) {
    section.style.opacity = voice.supported ? '1' : '0.5';
    section.title = voice.supported ? '' : 'Speech synthesis not available';
  }
}