/**
 * bubble-triggers.ts — Evaluate game state and fire contextual hint bubbles.
 *
 * B5 micro-slice 11.18 (#268): extracted from main.ts. The
 * `checkBubbleTriggers` function is pure logic — given a GameState, it
 * decides which hint bubbles should fire and calls `triggerHint()` for
 * each. No DOM mutation, no game-state writes (only the trigger call).
 *
 * Module-level state moved from main.ts:
 *   - `lastBubbleBiomeId` — tracks the last biome we triggered a hint
 *     for, so we don't fire the same biome-transition bubble repeatedly
 *   - `lastBubbleDiffTier` — same pattern for difficulty tier changes
 *
 * Both pieces of state are private to this function; they only exist to
 * de-dupe hint bubbles across consecutive frames. Follows the
 * state-moves-with-consumer pattern (B5.13).
 *
 * Why this lives in `src/game/` (not `src/ui/`):
 *   - The hint *triggering* logic is game state evaluation, not UI
 *     rendering. The actual bubble DOM is owned by `src/ui/thought-bubbles.ts`.
 *   - Sister to src/game/wildlife-render.ts (another pure-logic game
 *     evaluation extracted from main.ts).
 *
 * Hint categories covered (all per-issue):
 *   - Resources: low_coins, no_keys
 *   - Nearby interactives: near_npc, near_gate, near_chest
 *   - Wildlife: wildlife_spotted
 *   - Biome transitions: biome_forest/cave/castle (#6)
 *   - Difficulty: danger_zone
 *   - Quiz performance: quiz_streak
 *   - Time of day: nightfall, dawn, dark_no_flashlight
 *   - Distance: far_from_spawn
 *   - Status-aware (#111): critical_/low_/status_combo_bad (low resources hint)
 *   - Shop proximity (#111): near_shop, injury_near_shop (#109)
 *   - Outhouse (#110): outhouse_near, outhouse_dirty
 *   - Water (#110 Phase 3): near_water
 *   - Injury (#109): need_bandaid
 *   - Starving (#110 Phase 3): starving_worms
 *
 * Public API:
 *   - checkBubbleTriggers(state) — evaluate state and fire hints
 *   - resetBubbleTriggerState() — for testing / new game resets
 *
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { WORLD_CONFIG } from '../config/game.config';
import { getDifficulty } from '../config/game.config';
import { getCycleProgress } from '../rendering/lighting';
import { isFlashlightOn } from '../rendering/local-lights';
import { getVisibleWildlife } from './wildlife';
import { triggerHint } from '../ui/thought-bubbles';
import { type GameState } from './game-state';

// ─── Module-level state ───────────────────────────────────────

/** Last biome id we fired a hint for (avoids repeated biome-transition bubbles) */
let lastBubbleBiomeId = -1;
/** Last difficulty tier we fired a hint for (avoids repeated danger_zone bubbles) */
let lastBubbleDiffTier = -1;

// ─── Public API ──────────────────────────────────────────────

/**
 * Evaluate the current game state and fire contextual hint bubbles.
 * Called once per frame from `update()` in main.ts. Hint bubbles
 * have their own internal cooldown/debouncing — this function just
 * calls `triggerHint()` and the bubble system decides whether to
 * actually display the hint.
 */
export function checkBubbleTriggers(state: GameState): void {
  const px = state.player.x;
  const py = state.player.y;
  const cs = WORLD_CONFIG.chunkSize;
  const cKey = `${Math.floor(px / cs)},${Math.floor(py / cs)}`;
  const chunk = state.chunks.get(cKey);

  // Low resources
  if (state.inventory.countItem('coin') === 0) {
    triggerHint('low_coins');
  }
  if (state.inventory.countItem('key') === 0) {
    triggerHint('no_keys');
  }

  // Nearby interactives — scan around player (floor, not round: n.5 centers)
  const rx = Math.floor(px);
  const ry = Math.floor(py);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const gx = rx + dx;
      const gy = ry + dy;
      const ccx = Math.floor(gx / cs);
      const ccy = Math.floor(gy / cs);
      const nearChunk = state.chunks.get(`${ccx},${ccy}`);
      if (!nearChunk?.generated) continue;
      const lx = ((gx % cs) + cs) % cs;
      const ly = ((gy % cs) + cs) % cs;
      const cell = nearChunk.cells[ly]?.[lx];
      if (!cell) continue;

      if (cell.npcId) triggerHint('near_npc');
      // door_locked/toll_gate/quiz_gate are the real progression blockers
      if (
        cell.assetKey === 'quiz_gate' ||
        cell.assetKey === 'door_locked' ||
        cell.assetKey === 'door_gate' ||
        cell.assetKey === 'toll_gate' ||
        cell.assetKey === 'door'
      ) {
        triggerHint('near_gate');
      }
      if (cell.assetKey === 'chest') triggerHint('near_chest');
      if (cell.assetKey === 'shop' || cell.assetKey?.startsWith('shop_')) {
        triggerHint('near_shop');
      }
    }
  }

  // Wildlife nearby
  const wildlife = getVisibleWildlife(state.camera, px, py);
  if (wildlife.length > 0) {
    // Only trigger if there's a close creature (within ~3 grid units)
    const close = wildlife.some(e => {
      const distSq = (e.worldX - px) ** 2 + (e.worldY - py) ** 2;
      return distSq < 9; // 3^2
    });
    if (close) triggerHint('wildlife_spotted');
  }

  // Biome transitions
  if (chunk?.generated && chunk.biomeId !== lastBubbleBiomeId) {
    const oldBiome = lastBubbleBiomeId;
    lastBubbleBiomeId = chunk.biomeId;
    if (oldBiome >= 0) { // Don't trigger on first chunk
      if (chunk.biomeId === 1) triggerHint('biome_forest');
      else if (chunk.biomeId === 2) triggerHint('biome_cave');
      else if (chunk.biomeId === 3) triggerHint('biome_castle');
    }
  }

  // Difficulty warnings
  if (chunk?.generated) {
    const dist = Math.abs(Math.floor(px / cs)) + Math.abs(Math.floor(py / cs));
    const diff = getDifficulty(dist);
    if (diff.tier >= 3 && diff.tier !== lastBubbleDiffTier) {
      triggerHint('danger_zone');
    }
    lastBubbleDiffTier = diff.tier;
  }

  // Quiz streak / wrong encouragement
  if (state.quizStats.answered > 0) {
    const streakPct = state.quizStats.correct / state.quizStats.answered;
    if (streakPct >= 0.8 && state.quizStats.answered >= 3) {
      triggerHint('quiz_streak');
    }
  }

  // Nightfall / dawn from lighting (check cycle progress)
  const progress = getCycleProgress();
  if (progress >= 0.78 && progress < 0.82) {
    triggerHint('nightfall');
  } else if (progress >= 0.0 && progress < 0.05) {
    triggerHint('dawn');
  }

  // Dark without flashlight
  if (progress >= 0.80 && !isFlashlightOn()) {
    triggerHint('dark_no_flashlight');
  }

  // Far from spawn
  const spawnDist = Math.sqrt(px * px + py * py);
  if (spawnDist > 60) {
    triggerHint('far_from_spawn');
  }

  // ── Status-aware triggers (#111) ──
  const LOW = 30;
  const CRIT = 15;
  const { energy, hydration, cleanliness } = state.status;

  // Count how many stats are low
  let lowCount = 0;
  if (energy <= LOW) lowCount++;
  if (hydration <= LOW) lowCount++;
  if (cleanliness <= LOW) lowCount++;

  // Combo trigger first (priority 8, highest)
  if (lowCount >= 3) {
    triggerHint('status_combo_bad');
  } else {
    // Individual status triggers
    if (energy <= CRIT) triggerHint('critical_energy');
    else if (energy <= LOW) triggerHint('low_energy');

    if (hydration <= CRIT) triggerHint('critical_hydration');
    else if (hydration <= LOW) triggerHint('low_hydration');

    if (cleanliness <= CRIT) triggerHint('critical_cleanliness');
    else if (cleanliness <= LOW) triggerHint('low_cleanliness');
  }

  // ── Shop proximity trigger (#111) ──
  // Check nearby cells for shop/merchant structures
  for (let dy2 = -3; dy2 <= 3; dy2++) {
    for (let dx2 = -3; dx2 <= 3; dx2++) {
      const gx2 = rx + dx2;
      const gy2 = ry + dy2;
      const ccx2 = Math.floor(gx2 / cs);
      const ccy2 = Math.floor(gy2 / cs);
      const nearChunk2 = state.chunks.get(`${ccx2},${ccy2}`);
      if (!nearChunk2?.generated) continue;
      const lx2 = ((gx2 % cs) + cs) % cs;
      const ly2 = ((gy2 % cs) + cs) % cs;
      const cell2 = nearChunk2.cells[ly2]?.[lx2];
      if (!cell2) continue;
      if (cell2.assetKey === 'shop' || cell2.assetKey?.startsWith('shop_') || cell2.assetKey === 'merchant' || cell2.assetKey === 'store') {
        if (state.injury.injured) {
          triggerHint('injury_near_shop'); // Injured + near shop (#109)
        } else {
          triggerHint('near_shop');
        }
      }
      // Outhouse proximity (#110)
      if (cell2.assetKey === 'outhouse') {
        if (state.status.cleanliness <= LOW) {
          triggerHint('outhouse_near');
        }
      }
      // Water proximity — drink from stream (#110 Phase 3)
      if (cell2.assetKey === 'water') {
        if (hydration <= LOW) {
          triggerHint('near_water');
        }
      }
    }
  }

  // Injury-specific hints (#109)
  if (state.injury.injured) {
    triggerHint('need_bandaid');
  }

  // Starving desperation hint (#110 Phase 3)
  if (energy <= CRIT) {
    triggerHint('starving_worms');
  }

  // Dirty hint — outhouse needed (#110)
  if (state.status.cleanliness <= LOW) {
    triggerHint('outhouse_dirty');
  }
}

/**
 * Reset the module-level "last seen" state. Called from `resetGameState`
 * (new game) so the new game doesn't inherit stale biome/difficulty state
 * from the previous playthrough.
 */
export function resetBubbleTriggerState(): void {
  lastBubbleBiomeId = -1;
  lastBubbleDiffTier = -1;
}