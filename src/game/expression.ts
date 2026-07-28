/**
 * expression.ts — Transient expression override system (#102).
 *
 * B5 micro-slice 11.3 (#268): extracted from main.ts. The player has a
 * base expression (from save / customizer default) that can be temporarily
 * overridden for a duration (e.g. "surprised" when diarrhea triggers,
 * "happy" when a quiz is answered correctly). The override auto-reverts
 * when the timer expires.
 *
 * Public API:
 *   - setTransientExpression(state, expr, durationMs) — start an override
 *   - tickExpressionOverride(state) — call each frame; reverts when expired
 *
 * The override is stored on GameState (state.expressionOverride) so it
 * composes cleanly with the existing state shape. The state fields
 * (expressionOverride, _baseExpression) will move to a dedicated
 * ExpressionState interface when the GameState factory is extracted
 * (B5.4).
 *
 * @see issue #102 — Transient expression override
 */

import type { Expression } from '../asset-pipeline/sprites';
import type { CharacterVariation } from '../asset-pipeline/sprites';

/**
 * Structural subset of GameState that the expression override system
 * reads/writes. Avoids the circular dependency with main.ts (where
 * GameState is defined). When B5.4 extracts GameState to its own module,
 * this can become a proper import.
 */
export interface ExpressionStateSubset {
  expressionOverride: { expr: Expression; until: number } | null;
  _baseExpression: Expression;
  playerVariation: CharacterVariation;
  lastAnimFrame: number;
}

/** Temporarily override player expression — reverts automatically */
export function setTransientExpression(
  state: ExpressionStateSubset,
  expr: Expression,
  durationMs: number,
): void {
  state.expressionOverride = { expr, until: performance.now() + durationMs };
  // Apply immediately to playerVariation so next sprite load uses it
  state.playerVariation.expression = expr;
  state.lastAnimFrame = -1; // force sprite reload
}

/** Tick the expression override timer; revert when expired */
export function tickExpressionOverride(state: ExpressionStateSubset): void {
  if (!state.expressionOverride) return;
  if (performance.now() >= state.expressionOverride.until) {
    // Revert to base expression (from save / customizer default)
    state.playerVariation.expression = state._baseExpression ?? 'happy';
    state.expressionOverride = null;
    state.lastAnimFrame = -1; // force sprite reload
  }
}
