/**
 * ui.ts - HTML-based HUD overlay system + right sidebar.
 * Manages toasts, dialog, quiz display, debug info, inventory tray,
 * bottom HUD bar, and sidebar panels — all via DOM elements (no canvas drawing).
 * TODO: DOC - UI layout diagram
 */

import { LLM_CONFIG } from '../config/game.config';
import type { Inventory } from '../game/inventory';
import type { QuizState } from '../game/quiz';
import type { PlayerStatus } from '../game/status';
import type { InjuryState } from '../game/injury';
import type { MusicState } from '../game/audio/music';
import type { SfxState } from '../game/audio/sfx';
import { getDebuffs } from '../game/status';
import { syncHUD } from './hud';
import { syncDialog, syncQuiz } from './overlays';
import { syncDebug } from './debug-overlay';
import { syncInventoryTray } from './inventory-tray';
import { syncSidebar } from './sidebar';
export { markSaveSlotsDirty } from './sidebar';

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