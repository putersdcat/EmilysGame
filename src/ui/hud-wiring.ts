/**
 * hud-wiring.ts — One-time DOM event wiring for HUD buttons.
 *
 * Includes:
 *   - Inventory, debug, save, expand/collapse buttons
 *   - Music popup toggle (#138)
 *   - Sidebar toggle
 *   - Save slot save/load/delete event delegation
 *   - LLM config panel (Options overlay) with localStorage persistence
 *
 * Called once from main.ts after DOM is ready. Extracted from
 * `ui.ts` in B7.7 (#270) so the orchestrator stays focused on
 * per-frame dispatch.
 */
import { LLM_CONFIG } from '../config/game.config';

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

/**
 * Wire all HUD button click events. Call once after DOM is ready.
 * The save-slot event delegation is also set up here since the
 * buttons are dynamic.
 */
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
