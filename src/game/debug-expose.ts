// filepath: src/game/debug-expose.ts
// B5 micro-slice 11.39 (#268): window.__game* debug exposures extracted
// from main.ts init(). These are read by E2E tests (#68, #71, #72, #111,
// #112) and by browser DevTools when iterating on the game. They're not
// part of the public game API — purely for testing + dev tools.
//
// The existing __gameDebug surface is built separately by createGameDebug()
// in debug-api.ts. This module is for the simpler "raw module access"
// hooks (state, wildlife, lighting, bubbles, trade).
import {
  updateWildlife, getVisibleWildlife, interactWithWildlife,
  clearWildlife, getDiscoveredSpeciesArray, restoreDiscoveredSpecies, getWildlifeStats,
} from './wildlife';
import {
  setTimeOfDay, getCycleProgress, getTimeOfDay, getPlayedSeconds,
} from '../rendering/lighting';
import {
  triggerHint, tickBubbles, updateBubblePosition, dismissBubble,
  clearBubbles, getBubbleState, resetCooldowns,
  getMessageHistory, toggleHistoryPanel,
} from '../ui/thought-bubbles';
import { HINTS } from '../config/hints.config';
import {
  openTrade, closeTrade, tradeNavigate, executeTrade, syncTradeDOM,
  createTradeState, toggleTradeMode, executeSell, getSellPrice, getSellableItems,
} from './trading';
import { getShopPersona } from '../config/npc.config';
import type { GameState } from './game-state';

/**
 * Expose the E2E/debug globals on `window`. Must be called once after
 * `createInitialState()` and before the first test interaction.
 *
 * Globals exposed:
 *   - `__gameState`    — the full GameState (#268)
 *   - `__wildlife`     — wildlife AI module API (#68)
 *   - `__lighting`     — time-of-day + cycle progress (#68)
 *   - `__bubbles`      — thought bubble system (#71, #111)
 *   - `__trade`        — barter trade UI + state (#72, #112)
 *
 * Note: `__gameDebug` (the higher-level facade) is set separately by
 * `createGameDebug()` in debug-api.ts.
 */
export function exposeDebugGlobals(state: GameState): void {
  // Expose state for debugging / E2E tests
  (window as any).__gameState = state;
  // Expose wildlife + lighting module functions for E2E tests (#68)
  (window as any).__wildlife = {
    getVisibleWildlife,
    interactWithWildlife,
    clearWildlife,
    getDiscoveredSpeciesArray,
    restoreDiscoveredSpecies,
    updateWildlife,
    getWildlifeStats,
  };
  (window as any).__lighting = { setTimeOfDay, getCycleProgress, getTimeOfDay, getPlayedSeconds };
  // Expose thought bubble functions for E2E tests (#71, #111)
  (window as any).__bubbles = {
    triggerHint, tickBubbles, dismissBubble, clearBubbles,
    getBubbleState, resetCooldowns, updateBubblePosition,
    getMessageHistory, toggleHistoryPanel,
    HINTS,
  };
  // Expose trade functions for E2E tests (#72, #112)
  (window as any).__trade = {
    openTrade, closeTrade, tradeNavigate, executeTrade, syncTradeDOM,
    createTradeState, toggleTradeMode, executeSell, getSellPrice, getSellableItems,
    getShopPersona, // #112 themed shop persona lookup
  };
}
