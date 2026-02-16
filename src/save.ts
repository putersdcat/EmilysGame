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
  /** Entropy buffer for LLM entropy system (#4) */
  entropyBuffer?: string;
  /** Book of Knowledge: selected subjects */
  selectedSubjects?: string[];
  /** Book of Knowledge: saved words */
  wordBag?: { term: string; sourceArticleId?: string; savedAt: number; lookedUp: boolean }[];
  /** Book of Knowledge: read article ids */
  readArticles?: string[];
  /** Book of Knowledge: discovery points */
  discoveryPoints?: number;
  /** Player sprite customization */
  playerVariation?: { hairColor: string; hairStyle: string; dressColor: string; skinTone: string };
  /** Wildlife: discovered species IDs */
  discoveredWildlife?: string[];
  /** Player survival status (#70) */
  playerStatus?: { energy: number; hydration: number; cleanliness: number };
  /** Unlocked cosmetic IDs for progression-gated customizer (#66) */
  unlockedCosmetics?: string[];
  /** Music settings (#74) */
  musicSettings?: { volume: number; muted: boolean; enabled: boolean };
  /** SFX & ambience settings (#75) */
  sfxSettings?: { sfxVolume: number; ambienceVolume: number; sfxMuted: boolean; ambienceMuted: boolean; sfxEnabled: boolean };
  /** NPC voice settings (#76) */
  voiceSettings?: { enabled: boolean; volume: number };
  /** Quiz streak history for adaptive difficulty (#103) */
  streakHistory?: ('correct' | 'wrong' | 'idk')[];
  /** Fog-of-war: visited cell coordinates (#114) */
  visitedFog?: number[][];
  /** Age band profile for content filtering (#92) */
  ageBand?: string;
  /** Injury state (#109) */
  injuryState?: { injured: boolean; injuryCount: number };
  /** Cumulative active playtime in seconds (#136) */
  playedSeconds?: number;
}

export interface ResolvedCell {
  chunkKey: string;
  lx: number;
  ly: number;
  newAssetKey: string;
}

const SAVE_KEY = 'emilys_game_save';
const SAVE_SLOT_PREFIX = 'emilys_game_slot_';
const MAX_SLOTS = 4;

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

// ─── Slot-based Save/Load ────────────────────────────────────

export function saveToSlot(slot: number, data: SaveData): void {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  try {
    localStorage.setItem(SAVE_SLOT_PREFIX + slot, JSON.stringify(data));
    console.log(`[Save] Saved to slot ${slot}`);
  } catch (err) {
    console.warn(`[Save] Slot ${slot} save failed:`, err);
  }
}

export function loadFromSlot(slot: number): SaveData | null {
  if (slot < 0 || slot >= MAX_SLOTS) return null;
  try {
    const raw = localStorage.getItem(SAVE_SLOT_PREFIX + slot);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSlotSave(slot: number): boolean {
  return localStorage.getItem(SAVE_SLOT_PREFIX + slot) !== null;
}

export function deleteSlot(slot: number): void {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  localStorage.removeItem(SAVE_SLOT_PREFIX + slot);
}

export interface SlotInfo {
  slot: number;
  hasData: boolean;
  timestamp: number | null;
}

export function getAllSlotInfo(): SlotInfo[] {
  const slots: SlotInfo[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const data = loadFromSlot(i);
    slots.push({
      slot: i,
      hasData: data !== null,
      timestamp: data?.timestamp ?? null,
    });
  }
  return slots;
}

export { MAX_SLOTS };
