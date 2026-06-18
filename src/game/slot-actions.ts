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

/** Slot save action: serialize state, persist to slot, mark UI dirty, toast. */
export function makeSlotSaveHandler(state: GameState) {
  return (slot: number) => {
    const data = buildSaveData(state);
    saveToSlot(slot, data);
    markSaveSlotsDirty();
    addToast(state.ui, `Saved to slot ${slot + 1}!`, '#4caf50', 1500);
  };
}

/** Slot load action: read slot, apply to state, mark UI dirty, toast. */
export function makeSlotLoadHandler(state: GameState) {
  return (slot: number) => {
    const data = loadFromSlot(slot);
    if (data) {
      applySaveData(state, data);
      markSaveSlotsDirty();
      addToast(state.ui, `Loaded slot ${slot + 1}!`, '#88ccff', 1500);
    }
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
