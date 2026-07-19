/**
 * draw-priority.ts — Functional-gate priority under maxDrawCmds pressure.
 *
 * Place coherence P5: when the object draw budget truncates, quiz_gate /
 * door_* / toll_gate must not silently disappear behind decor. Paint only —
 * never sets walkability. FOV unchanged.
 *
 * Keys align with scene-invariants FUNCTIONAL_OPENING_KEYS (reused).
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
 * Select candidates that fit in `maxCmds`, preferring functional gates.
 * Returns emit order: all gates that fit, then decor until budget is full.
 */
export function selectWithinDrawBudget<T extends { assetKey: string }>(
  candidates: readonly T[],
  maxCmds: number,
): T[] {
  if (maxCmds <= 0) return [];
  const ordered = prioritizeObjectCellsForDrawBudget(candidates);
  if (ordered.length <= maxCmds) return ordered;
  return ordered.slice(0, maxCmds);
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
