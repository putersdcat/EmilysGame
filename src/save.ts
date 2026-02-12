/**
 * save.ts - Game state persistence (localStorage).
 * Saves player position, inventory, visited chunks, quiz progress.
 * TODO: DOC - save file format spec
 */

import type { InventorySlot } from './inventory';

// ─── Types ───────────────────────────────────────────────────

export interface SaveData {
  version: 1;
  timestamp: number;
  player: {
    x: number;
    y: number;
    direction: number;
  };
  inventory: InventorySlot[];
  visitedChunks: string[];     // "cx,cy" keys of generated chunks
  resolvedCells: ResolvedCell[];  // Cells that were changed (doors opened, etc.)
  quizStats: {
    answered: number;
    correct: number;
  };
  wordlistSeed: string;        // First word pair (for deterministic replay)
}

export interface ResolvedCell {
  chunkKey: string;
  lx: number;
  ly: number;
  newAssetKey: string;
}

const SAVE_KEY = 'emilys_game_save';

// ─── Save / Load ─────────────────────────────────────────────

export function saveGame(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    console.log('[Save] Game saved');
  } catch (err) {
    console.warn('[Save] Failed to save:', err);
  }
}

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return null; // Version mismatch
    return data;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
