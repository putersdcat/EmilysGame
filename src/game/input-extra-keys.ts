/**
 * input-extra-keys.ts — Quiz accessibility key capture (numeric + R, #94).
 *
 * B5 micro-slice 11.1 (#268): extracted from main.ts. The extra key queue
 * captures 1-9 and R/r keypresses for quiz accessibility (players who
 * prefer keyboard over click/tap to answer quiz questions). Keys are
 * captured in a frame-level queue, consumed by the quiz input block, and
 * cleared at the end of each frame.
 *
 * Public API:
 *   - setupExtraKeyCapture() — register the keydown listener (call once at init)
 *   - consumeExtraKey(key) — check + remove a key from the queue
 *   - clearExtraKeys() — clear the entire queue (call at end of each frame)
 */

// ─── Extra Key Queue (numeric + R for quiz accessibility, #94) ───

/** Keys pressed this frame — consumed by quiz input block, cleared each frame */
const _extraKeyQueue: Set<string> = new Set();

/** Register the keydown listener for numeric + R quiz keys. Call once at init. */
export function setupExtraKeyCapture(): void {
  window.addEventListener('keydown', (e) => {
    // Capture 1-9 and R/r for quiz accessibility
    if (/^[1-9r]$/i.test(e.key)) {
      _extraKeyQueue.add(e.key.toLowerCase());
    }
  });
}

/** Check + remove a key from the queue. Returns true if the key was pressed this frame. */
export function consumeExtraKey(key: string): boolean {
  if (_extraKeyQueue.has(key)) {
    _extraKeyQueue.delete(key);
    return true;
  }
  return false;
}

/** Clear the entire queue. Call at end of each frame. */
export function clearExtraKeys(): void {
  _extraKeyQueue.clear();
}

// ─── Main hot-keys handler (B5.20) ─────────────────────────────

import { type GameState } from './game-state';
import { type InputManager } from './input';
import { closeDialog, addToast } from '../ui/ui';
import { cancelSpeech } from './audio/npc-voice';
import { playSfx } from './audio/sfx';
import { showPauseMenu } from './pause-menu';
import { showOptionsOverlay } from './options-overlay';
import { getBlendIntensity, setBlendIntensity } from '../rendering/terrain-cache';
import { toggleBook } from './knowledge';
import { toggleFlashlight } from '../rendering/local-lights';
import { setTimeOfDay, getCycleProgress } from '../rendering/lighting';
import { invalidateShadowCache } from '../rendering/shadows';
import { setWeather, getWeatherInfo } from '../rendering/weather';
import { closeTrade, syncTradeDOM, toggleTradeMode, syncBarterQuizDOM } from './trading';
import { useStatusItem } from './status';
import { applyBandaid, getWoundCareQuestion, startWoundCareQuiz } from './injury';
import { setTransientExpression } from './expression';
import { revealFogAround } from '../rendering/fog';
import { ITEM_DEFS } from '../config/items.config';
import {
  setBookOpen,
  exitModal,
  clearPendingNext,
  enterQuizModal,
  topMode,
} from './play-mode';

/**
 * Handler dependencies that the caller (main.ts) wires in. Keeping
 * them as a single deps object lets us avoid importing main.ts
 * (which would create a circular dependency).
 */
export interface SetupExtraKeysDeps {
  doSave: (state: GameState) => void;
  captureBugReport: (state: GameState, description: string) => void;
}

/**
 * Register the global keydown listener that handles all in-game
 * hot-keys. Called once from `main()` after state init.
 *
 * Hot-keys handled:
 *   - F3: toggle debug overlay
 *   - I/i: toggle inventory
 *   - B/b: toggle book-of-knowledge; Shift+B: cycle terrain blend intensity (#84)
 *   - Escape: cascade close (pause → trade → book → inventory → dialog → open pause)
 *   - Shift+T: advance day/night by 10% (#83 shadow recalc)
 *   - Tab: toggle buy/sell mode in trade panel (#112)
 *   - Shift+W: cycle weather
 *   - F/f: toggle flashlight
 *   - E/e: consume best available status item (#70, #109)
 */
export function setupExtraKeys(
  state: GameState,
  input: InputManager | undefined,
  deps: SetupExtraKeysDeps,
): void {
  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'F3':
        e.preventDefault();
        state.ui.showDebug = !state.ui.showDebug;
        break;
      case 'i':
      case 'I':
        if (!state.quiz.active && !state.ui.dialog.active) {
          state.ui.showInventory = !state.ui.showInventory;
        }
        break;
      case 'b':
      case 'B':
        if (e.shiftKey) {
          // Shift+B: cycle terrain blend intensity (#84)
          const steps = [0, 0.5, 1.0, 1.5, 2.0];
          const curBlend = getBlendIntensity();
          let nextIdx = 0;
          for (let i = 0; i < steps.length; i++) {
            if (curBlend < steps[i] + 0.01) { nextIdx = i; break; }
            if (i === steps.length - 1) nextIdx = 0;
          }
          nextIdx = (nextIdx + 1) % steps.length;
          setBlendIntensity(steps[nextIdx]);
        } else if (!state.quiz.active && !state.ui.dialog.active) {
          toggleBook(state.knowledge);
          setBookOpen(state, state.knowledge.bookOpen);
          // Close inventory if book opens
          if (state.knowledge.bookOpen && state.ui.showInventory) {
            state.ui.showInventory = false;
          }
        }
        break;
      case 'Escape': {
        // Guard: don't show pause menu if full-screen modal or quiz is active
        const overlayBlocks =
          document.getElementById('customizerOverlay')?.style.display === 'flex' ||
          document.getElementById('subjectOverlay')?.style.display === 'flex' ||
          document.getElementById('mainMenu')?.style.display === 'flex' ||
          state.quiz.active;
        if (overlayBlocks) break;

        if (state.trade.active) {
          // If barter quiz is showing, escape closes just the quiz (#112 Phase 3)
          if (state.trade.barterQuiz) {
            state.trade.barterQuiz = null;
            state.trade.barterSelectedIndex = 0;
            syncBarterQuizDOM(state.trade);
          } else {
            closeTrade(state.trade);
            syncTradeDOM(state.trade, state.inventory);
            syncBarterQuizDOM(state.trade);
            exitModal(state, 'trade');
          }
        } else if (state.knowledge.bookOpen) {
          setBookOpen(state, false);
        } else if (state.ui.showInventory) {
          state.ui.showInventory = false;
        } else if (state.ui.dialog.active) {
          // Cancel dialog — clear pending quiz/trade; do not drain queues
          clearPendingNext(state);
          state.pendingQuiz = null;
          state.pendingGateQuiz = null;
          state.pendingTrade = null;
          state._pendingInsectQuiz = false;
          closeDialog(state.ui);
          cancelSpeech(state.voice); // Cancel voice on escape close (#76)
          exitModal(state, 'dialog');
        } else if (topMode(state) !== 'play' && (topMode(state) as { kind: string }).kind === 'pause_menu') {
          exitModal(state, 'pause_menu');
        } else if (document.getElementById('pauseMenu')?.style.display === 'flex') {
          exitModal(state, 'pause_menu');
          document.getElementById('pauseMenu')!.style.display = 'none';
        } else {
          showPauseMenu(state, input, {
            onSave: () => deps.doSave(state),
            onMainMenu: () => { deps.doSave(state); window.location.reload(); },
            onOptions: () => showOptionsOverlay(state, input),
            onBugReport: (desc) => deps.captureBugReport(state, desc),
          });
        }
        break;
      }
      case 'T': // Shift+T: advance day/night by 10%
        if (e.shiftKey) {
          setTimeOfDay(getCycleProgress() + 0.1);
          invalidateShadowCache(); // #83 - force shadow recalc after time jump
        }
        break;
      case 'Tab': // Toggle buy/sell mode in trade panel (#112)
        if (state.trade.active && !state.trade.barterQuiz) {
          e.preventDefault();
          toggleTradeMode(state.trade);
          syncTradeDOM(state.trade, state.inventory);
          playSfx(state.sfx, 'menu_navigate');
        }
        break;
      case 'W': // Shift+W: cycle weather
        if (e.shiftKey) {
          const types: Array<'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'> = ['clear', 'cloudy', 'rain', 'storm', 'fog'];
          const cur = getWeatherInfo().type;
          const idx = types.indexOf(cur);
          setWeather(types[(idx + 1) % types.length]);
          invalidateShadowCache(); // #83 - weather affects shadow opacity
        }
        break;
      case 'f':
      case 'F':
        if (!e.shiftKey && !e.ctrlKey && !state.quiz.active && !state.ui.dialog.active) {
          toggleFlashlight();
        }
        break;
      case 'e':
      case 'E':
        // Use/consume best available item (#70, #109, map_scroll)
        if (!e.shiftKey && !e.ctrlKey && !state.quiz.active && !state.ui.dialog.active && !state.trade.active) {
          // Priority: if injured and have bandage, use bandage first (#109)
          if (state.injury.injured && state.inventory.hasItem('bandage')) {
            state.inventory.removeItem('bandage', 1);
            const healAmt = applyBandaid(state.injury, state.status);
            playSfx(state.sfx, 'bandaid_use');
            addToast(state.ui, `🩹 Applied bandage! +${healAmt} energy`, '#88ccff', 2000);
            setTransientExpression(state, 'happy', 2000);
            // Start wound-care quiz after brief delay
            if (state.injury.pendingWoundQuiz) {
              state.injury.pendingWoundQuiz = false;
              const wq = getWoundCareQuestion();
              // Use quiz system with custom wound-care question
              startWoundCareQuiz(state, wq);
              enterQuizModal(state, 'wound_care');
            }
            break;
          }
          // Map scroll: reveal nearby fog/minimap area (items.config effect)
          if (state.inventory.hasItem('map_scroll')) {
            const radius = ITEM_DEFS.map_scroll?.effect?.value ?? 12;
            // value is "chunks-ish" in the def (3) — use cells: ~3 * 8 = 24 radius
            const cellRadius = Math.max(8, Math.round(radius * 8));
            const newly = revealFogAround(state.player.x, state.player.y, cellRadius);
            state.inventory.removeItem('map_scroll', 1);
            playSfx(state.sfx, 'pickup_item');
            addToast(
              state.ui,
              newly > 0
                ? `🗺️ Map scroll! Revealed ${newly} new places nearby.`
                : '🗺️ Map scroll unfurled — this area was already known.',
              '#81d4fa',
              2500,
            );
            break;
          }
          // Normal consumable path
          const consumables = ['snack', 'water_flask', 'water', 'soap', 'mushroom', 'bandage', 'potion'];
          for (const itemId of consumables) {
            if (state.inventory.hasItem(itemId)) {
              const result = useStatusItem(state.status, itemId);
              if (result && result !== 'Already at full status!') {
                state.inventory.removeItem(itemId, 1);
                addToast(state.ui, result, '#88ccff', 2000);
                // SFX based on consumable type (#75)
                playSfx(state.sfx, (itemId === 'water_flask' || itemId === 'water') ? 'drink_water' : 'eat_food');
                break;
              } else if (result === 'Already at full status!') {
                addToast(state.ui, '✨ All stats are full!', '#aaa', 1200);
                break;
              }
            }
          }
        }
        break;
    }
  });
}
