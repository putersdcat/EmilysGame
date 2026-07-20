// filepath: src/game/slot-actions.ts
// B5 micro-slice 11.40 (#268): slot save/load/delete handlers extracted
// from main.ts main(). Each handler is a small closure that wires the
// HUD button callbacks (set up via wireHudButtons) to the underlying
// save + UI flow. Extracted so the inline 30-line callback block in
// main() becomes 4 named slots.
//
// Pattern: these are pure closures over `state`. They capture `state`
// once at startup and never change. main() wires them into the
// HUD button callbacks via wireHudButtons(...).
import type { GameState } from './game-state';
import { addToast, markSaveSlotsDirty } from '../ui/ui';
import { buildSaveData } from './save-build';
import { saveToSlot, loadFromSlot, deleteSlot } from './save';
import { applySaveData } from './save-apply';
import { withWorldLoading } from './boot-loading';
import { ensureChunksAroundYielding } from './chunk-lifecycle';
import { setControlLock, resetPlayMode, syncDerivedPaused } from './play-mode';

/** Slot save action: serialize state, persist to slot, mark UI dirty, toast. */
export function makeSlotSaveHandler(state: GameState) {
  return (slot: number) => {
    const data = buildSaveData(state);
    saveToSlot(slot, data);
    markSaveSlotsDirty();
    addToast(state.ui, `Saved to slot ${slot + 1}!`, '#4caf50', 1500);
  };
}

/**
 * Slot load action: read slot, apply to state (yielding bulk gen), toast.
 *
 * Mid-session HUD load runs while rAF is live. Pause + re-entrancy lock
 * prevent movement / boundary ensure interleaving during clear+yield gen.
 */
export function makeSlotLoadHandler(state: GameState) {
  let loadInFlight = false;

  return (slot: number) => {
    if (loadInFlight) {
      addToast(state.ui, 'Still loading…', '#ffaa00', 1200);
      return;
    }
    const data = loadFromSlot(slot);
    if (!data) return;

    loadInFlight = true;
    // Snapshot stack so we can restore pause_menu if it was open (S8)
    const wasStack = state.playMode.stack.slice();
    const wasPending = state.playMode.pendingNext.slice();
    setControlLock(state, { reason: 'chunk_rebuild' });

    void withWorldLoading(() => applySaveData(state, data), 'Loading world…')
      .then(() => {
        markSaveSlotsDirty();
        addToast(state.ui, `Loaded slot ${slot + 1}!`, '#88ccff', 1500);
      })
      .catch(async (err: unknown) => {
        console.error('[slot-load] applySaveData failed:', err);
        addToast(state.ui, 'Load failed — try again', '#f44336', 2500);
        // Best-effort: fill viewport if clear() already ran mid-failure.
        // Never sync multi-chunk on UI click/error paths (critical-path PR2).
        try {
          await withWorldLoading(
            () => ensureChunksAroundYielding(state),
            'Loading world…',
          );
        } catch { /* ignore secondary ensure errors */ }
      })
      .finally(() => {
        loadInFlight = false;
        // Load does not resume mid-modal content — empty playMode, then
        // restore stack only if it was pause_menu (DOM may still be open).
        resetPlayMode(state);
        const hadPauseMenu = wasStack.some((f) => f.kind === 'pause_menu');
        if (hadPauseMenu) {
          state.playMode.stack = wasStack.filter((f) => f.kind === 'pause_menu');
          state.playMode.pendingNext = wasPending;
          syncDerivedPaused(state);
          const menu = document.getElementById('pauseMenu');
          if (menu) menu.style.display = 'flex';
        }
      });
  };
}

/** Slot delete action: remove slot, mark UI dirty, toast. */
export function makeSlotDeleteHandler(state: GameState) {
  return (slot: number) => {
    deleteSlot(slot);
    markSaveSlotsDirty();
    addToast(state.ui, `Slot ${slot + 1} deleted`, '#ff8844', 1500);
  };
}
