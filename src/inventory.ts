/**
 * inventory.ts - Player inventory system.
 * Manages items, stacking, and usage.
 * TODO: DOC - inventory API reference
 */

import { ITEM_DEFS, type ItemDef } from './config/items.config';

// ─── Types ───────────────────────────────────────────────────

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface Inventory {
  slots: InventorySlot[];
  maxSlots: number;
  addItem(itemId: string, qty?: number): boolean;
  removeItem(itemId: string, qty?: number): boolean;
  hasItem(itemId: string): boolean;
  countItem(itemId: string): number;
  getSlot(itemId: string): InventorySlot | undefined;
  serialize(): InventorySlot[];
  deserialize(data: InventorySlot[]): void;
}

// ─── Implementation ──────────────────────────────────────────

export function createInventory(maxSlots = 20): Inventory {
  const slots: InventorySlot[] = [];

  function getDef(id: string): ItemDef | undefined {
    return ITEM_DEFS[id];
  }

  function addItem(itemId: string, qty = 1): boolean {
    const def = getDef(itemId);
    const existing = slots.find((s) => s.itemId === itemId);

    if (existing) {
      const max = def?.maxStack ?? 99;
      if (def?.stackable && existing.quantity + qty <= max) {
        existing.quantity += qty;
        return true;
      } else if (def?.stackable) {
        existing.quantity = max;
        return true;
      }
    }

    if (slots.length < maxSlots) {
      slots.push({ itemId, quantity: qty });
      return true;
    }

    return false; // Inventory full
  }

  function removeItem(itemId: string, qty = 1): boolean {
    const idx = slots.findIndex((s) => s.itemId === itemId);
    if (idx === -1) return false;

    slots[idx].quantity -= qty;
    if (slots[idx].quantity <= 0) {
      slots.splice(idx, 1);
    }
    return true;
  }

  function hasItem(itemId: string): boolean {
    return slots.some((s) => s.itemId === itemId && s.quantity > 0);
  }

  function countItem(itemId: string): number {
    const slot = slots.find((s) => s.itemId === itemId);
    return slot?.quantity ?? 0;
  }

  function getSlot(itemId: string): InventorySlot | undefined {
    return slots.find((s) => s.itemId === itemId);
  }

  function serialize(): InventorySlot[] {
    return slots.map((s) => ({ ...s }));
  }

  function deserialize(data: InventorySlot[]): void {
    slots.length = 0;
    for (const s of data) {
      slots.push({ itemId: s.itemId, quantity: s.quantity });
    }
  }

  return {
    slots,
    maxSlots,
    addItem,
    removeItem,
    hasItem,
    countItem,
    getSlot,
    serialize,
    deserialize,
  };
}
