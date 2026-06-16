/**
 * inventory-tray.ts — Bottom-of-screen inventory tray (#tab to toggle).
 *
 * Renders the expanded inventory rows (emoji, name, qty) when the
 * tray is open. Closed state is just a CSS class toggle.
 *
 * B7.3 — extracted from `ui.ts` (#270).
 */
import { ASSET_DEFS } from '../config/assets.config';
import { ITEM_DEFS } from '../config/items.config';
import type { Inventory } from '../game/inventory';

/** Sync the inventory tray (visible when `show` is true). */
export function syncInventoryTray(show: boolean, inv: Inventory): void {
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
