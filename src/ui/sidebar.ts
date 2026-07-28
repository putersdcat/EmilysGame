/**
 * sidebar.ts — Right-side panel sync (stats, inventory grid, save slots,
 * debug summary).
 *
 * Throttled to every 8th call (~8 fps at 60fps) since the sidebar
 * doesn't need per-frame updates. Save slots are only rebuilt when
 * `markSaveSlotsDirty()` is called (after save/load/delete).
 *
 * B7.4 — extracted from `ui.ts` (#270).
 */
import { ASSET_DEFS } from '../config/assets.config';
import { ITEM_DEFS } from '../config/items.config';
import { WORLD_CONFIG } from '../config/game.config';
import { getTerrainCacheSize, getTerrainCacheMemoryMB } from '../rendering/terrain-cache';
import { getPlayedSeconds } from '../rendering/lighting';
import { getAllSlotInfo } from '../game/save';
import type { Inventory } from '../game/inventory';

let sidebarSlotsDirty = true; // Rebuild save slot list when needed
let lastSidebarSyncFrame = 0;

/** Sync the right-side panel. Throttled to every 8th call. */
export function syncSidebar(
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

/** Sync the sidebar's 12-slot inventory grid. */
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

/** Rebuild the save slot list. */
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
