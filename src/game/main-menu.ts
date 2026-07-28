/**
 * main-menu.ts — Start-screen menu overlay (Continue / New / Load).
 *
 * B5 micro-slice 11.10 (#268): extracted from main.ts. `showMainMenu`
 * is a self-contained DOM overlay function: it shows the existing
 * `#mainMenu` element, populates it with the available save slots,
 * and resolves a promise with the user's choice:
 *
 *   'continue'        → resume the auto-save
 *   'new-game'        → start a fresh game (caller calls resetGameState)
 *   'load-slot-N'     → load the named manual save slot
 *
 * The "Options" button inside the menu delegates to a caller-supplied
 * callback (`openOptions`) rather than importing `showOptionsOverlay`
 * directly. This keeps `main-menu.ts` independent of the options
 * overlay module, and lets the caller (main.ts) decide whether to wire
 * game-state-aware options or main-menu-only options.
 *
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { getAllSlotInfo, loadGame } from './save';

/**
 * Show the main start-screen menu.
 *
 * @param hasSaveData - whether the auto-save slot has data (shows/hides "Continue")
 * @param openOptions - callback fired when the user clicks "Options" (null = no-op)
 * @returns Promise that resolves with the user's menu choice
 */
export function showMainMenu(
  hasSaveData: boolean,
  openOptions: (() => void) | null = null,
): Promise<string> {
  return new Promise((resolve) => {
    const menu = document.getElementById('mainMenu')!;
    const buttonsPanel = document.getElementById('menuButtonsPanel')!;
    const loadPanel = document.getElementById('menuLoadPanel')!;
    const continueBtn = document.getElementById('menuContinue') as HTMLButtonElement;
    const newGameBtn = document.getElementById('menuNewGame') as HTMLButtonElement;
    const loadGameBtn = document.getElementById('menuLoadGame') as HTMLButtonElement;
    const loadBackBtn = document.getElementById('menuLoadBack') as HTMLButtonElement;
    const slotList = document.getElementById('menuSlotList')!;
    const optionsBtn = document.getElementById('menuOptions') as HTMLButtonElement | null;

    // Show/hide continue based on auto-save
    continueBtn.style.display = hasSaveData ? 'block' : 'none';

    // Show/hide load based on any save existing
    const slots = getAllSlotInfo();
    const anySlots = hasSaveData || slots.some((s) => s.hasData);
    loadGameBtn.style.display = anySlots ? 'block' : 'none';

    // Reset to buttons view
    buttonsPanel.style.display = 'flex';
    loadPanel.style.display = 'none';
    menu.style.display = 'flex';

    const cleanup = () => { menu.style.display = 'none'; };

    continueBtn.onclick = () => { cleanup(); resolve('continue'); };
    newGameBtn.onclick = () => { cleanup(); resolve('new-game'); };

    loadGameBtn.onclick = () => {
      buttonsPanel.style.display = 'none';
      loadPanel.style.display = 'block';
      slotList.innerHTML = '';

      // Auto-save slot
      if (hasSaveData) {
        const autoSave = loadGame();
        const autoEl = document.createElement('div');
        autoEl.className = 'menu-slot';
        autoEl.innerHTML = `
          <div class="menu-slot-info">
            <div class="menu-slot-name">💾 Auto-Save</div>
            <div class="menu-slot-time">${autoSave?.timestamp ? new Date(autoSave.timestamp).toLocaleString() : 'Unknown'}</div>
          </div>
          <div class="menu-slot-icon">▶</div>`;
        autoEl.onclick = () => { cleanup(); resolve('continue'); };
        slotList.appendChild(autoEl);
      }

      // Manual save slots
      for (const info of slots) {
        const el = document.createElement('div');
        el.className = 'menu-slot' + (info.hasData ? '' : ' empty');
        if (info.hasData) {
          el.innerHTML = `
            <div class="menu-slot-info">
              <div class="menu-slot-name">Slot ${info.slot + 1}</div>
              <div class="menu-slot-time">${info.timestamp ? new Date(info.timestamp).toLocaleString() : '—'}</div>
            </div>
            <div class="menu-slot-icon">▶</div>`;
          const slotIdx = info.slot;
          el.onclick = () => { cleanup(); resolve(`load-slot-${slotIdx}`); };
        } else {
          el.innerHTML = `
            <div class="menu-slot-info">
              <div class="menu-slot-name">Slot ${info.slot + 1}</div>
              <div class="menu-slot-time">Empty</div>
            </div>`;
        }
        slotList.appendChild(el);
      }
    };

    loadBackBtn.onclick = () => {
      loadPanel.style.display = 'none';
      buttonsPanel.style.display = 'flex';
    };

    // Options button — caller-supplied callback (null = no-op)
    if (optionsBtn) {
      optionsBtn.onclick = () => {
        if (openOptions) openOptions();
      };
    }
  });
}
