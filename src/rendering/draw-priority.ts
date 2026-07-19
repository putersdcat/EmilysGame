/**
 * draw-priority.ts — Functional-gate priority under maxDrawCmds pressure.
 *
 * Place coherence P5: when the object draw budget truncates, quiz_gate /
 * door_* / toll_gate must not silently disappear behind decor. Paint only —
 * never sets walkability. FOV unchanged.
 *
 * Keys align with scene-invariants FUNCTIONAL_OPENING_KEYS (reused).
 *
 * ## Budget units (pure helper vs live render)
 *
 * - **Live path** (`iterateVisibleChunks`): budget is **draw commands**
 *   (`jsPoolIdx` vs `RENDER_CONFIG.maxDrawCmds`). One object cell can emit
 *   1–2 cmds (elevated sprite + optional item overlay).
 * - **Pure helpers** below (`selectWithinDrawBudget` / prioritize): budget is
 *   **candidate slots (cells)** for membership order only — gates before decor.
 *   They document the priority contract for unit tests; they do **not** model
 *   exact cmd accounting. The hot-path two-pass enforces real cmd budget.
 */

import { FUNCTIONAL_OPENING_KEYS } from '../engine/iso2-assemblies/scene-invariants';

/** True when assetKey is a functional gate/door that must beat decor under budget. */
export function isFunctionalGateDrawPriority(assetKey: string): boolean {
  return FUNCTIONAL_OPENING_KEYS.has(assetKey);
}

/**
 * Re-export the shared key set for tests / debug without inventing a parallel list.
 * Same contents as scene-invariants FUNCTIONAL_OPENING_KEYS.
 */
export { FUNCTIONAL_OPENING_KEYS as DRAW_PRIORITY_GATE_KEYS };

/**
 * Order object candidates so functional gates sort before decor (stable within tier).
 * Hot path uses a two-pass emit instead of allocating; this pure helper documents
 * the contract and powers unit tests for budget truncation.
 */
export function prioritizeObjectCellsForDrawBudget<T extends { assetKey: string }>(
  candidates: readonly T[],
): T[] {
  const gates: T[] = [];
  const decor: T[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (FUNCTIONAL_OPENING_KEYS.has(c.assetKey)) gates.push(c);
    else decor.push(c);
  }
  if (gates.length === 0) return candidates.slice() as T[];
  if (decor.length === 0) return gates;
  return gates.concat(decor);
}

/**
 * Select candidates that fit in `maxSlots` **cells**, preferring functional gates.
 * Returns emit order: all gates that fit, then decor until slots are full.
 *
 * @param maxSlots - Cell/slot cap (not live jsPool cmd count — see file header).
 */
export function selectWithinDrawBudget<T extends { assetKey: string }>(
  candidates: readonly T[],
  maxSlots: number,
): T[] {
  if (maxSlots <= 0) return [];
  const ordered = prioritizeObjectCellsForDrawBudget(candidates);
  if (ordered.length <= maxSlots) return ordered;
  return ordered.slice(0, maxSlots);
}

/** Last-frame counters for tests / F3 (reset each object emit cycle). */
export interface DrawPriorityStats {
  gatesEmitted: number;
  decorEmitted: number;
  budgetCapped: boolean;
}

let _drawPriorityStats: DrawPriorityStats = {
  gatesEmitted: 0,
  decorEmitted: 0,
  budgetCapped: false,
};

export function resetDrawPriorityStats(): void {
  _drawPriorityStats = { gatesEmitted: 0, decorEmitted: 0, budgetCapped: false };
}

export function noteDrawPriorityEmit(isGate: boolean): void {
  if (isGate) _drawPriorityStats.gatesEmitted++;
  else _drawPriorityStats.decorEmitted++;
}

export function noteDrawPriorityBudgetCapped(): void {
  _drawPriorityStats.budgetCapped = true;
}

export function getDrawPriorityStats(): Readonly<DrawPriorityStats> {
  return _drawPriorityStats;
}
