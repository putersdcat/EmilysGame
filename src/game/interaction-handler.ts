/**
 * interaction-handler.ts — Dispatch InteractionResult → side effects.
 *
 * B5 micro-slice 11.19 (#268): extracted from main.ts. `handleInteraction`
 * is a large switch over InteractionResult.type → each case mutates
 * game state, plays sfx, opens dialogs, queues quizzes/trades, fires
 * hints, etc. Pure logic — no DOM mutation beyond toast + dialog calls.
 *
 * Module-level state moved from main.ts (state-moves-with-consumer, B5.13):
 *   - `_lastDialogNpcId` — tracks which NPC spoke last so subsequent
 *     speakLine() calls know which voice to use (#76). Set by the npc
 *     case (line 1157), cleared by other dialog cases.
 *   - `_pendingPoopBurst` — one-shot render flag set by stream_drink case
 *     (#133) and drained by the render path in main.ts.
 *
 * Both pieces of state are private to the interaction chain. Accessors
 * are exported for main.ts paths that read+clear them after
 * handleInteraction returns:
 *   - `getLastDialogNpcId()` / `setLastDialogNpcId()` — used by the
 *     dialog-queue in update() (main.ts ~L725-L727) and by the wildlife
 *     interaction (main.ts L991)
 *   - `getPendingPoopBurst()` / `setPendingPoopBurst()` — used by the
 *     render path in main.ts (~L1559-L1560)
 *
 * Touch list (all per-issue):
 *   - #4 LLM entropy feed (NPC greeting)
 *   - #76 NPC voice lines
 *   - #77 structure flavor text + campfire rest
 *   - #103 streak-modulated difficulty
 *   - #109 wound-care quiz
 *   - #110 hygiene + insect + outhouse + stream + eat-worms
 *   - #112 shop themed variants
 *   - #113 mouth animation setDialogNpc
 *   - #133 diarrhea illness chain
 *
 * Public API:
 *   - handleInteraction(result, state) — dispatch + apply
 *   - getLastDialogNpcId() / setLastDialogNpcId(v)
 *   - getPendingPoopBurst() / setPendingPoopBurst(v)
 *   - resetInteractionState() — for new-game flow
 *
 * @see issue #268 — B5: Decompose src/main.ts
 */

import { addToast, showDialog } from '../ui/ui';
import { playSfx } from './audio/sfx';
import { setDialogNpc } from '../rendering/render';
import { speakLine } from './audio/npc-voice';
import { feedEntropy } from '../engine/gen';
import { getNpcPersona, getShopPersona } from '../config/npc.config';
import { startHygieneQuiz } from './quiz-specials';
import { applyStatusEffect } from './status';
import { setTransientExpression } from './expression';
import { triggerHint } from '../ui/thought-bubbles';
import { setDiarrheaOverlay } from '../rendering/debuff-visuals';
import { DIARRHEA_CONFIG } from './illness';
import { getQuizBias } from './knowledge';
import { blendDifficulty, getDifficultyForPosition, modulateDifficulty, pickQuizQuestion } from './quiz';
import { prefetchQuizRephrase } from '../engine/llm';
import { doSave } from './save-build';
import { type GameState } from './game-state';
import { type InteractionResult } from '../engine/mechanics';

// ─── Module-level state ───────────────────────────────────────

/** Which NPC spoke the most recent dialog line. Drives voice + mouth animation (#76, #113). */
let _lastDialogNpcId: string | null = null;

/** One-shot flag set by stream_drink case (#133); drained by main.ts render path. */
let _pendingPoopBurst = false;

// ─── Public accessors ─────────────────────────────────────────

/** Get the NPC id of the last dialog speaker (null for signs/structures). */
export function getLastDialogNpcId(): string | null { return _lastDialogNpcId; }

/** Set the NPC id of the last dialog speaker. */
export function setLastDialogNpcId(v: string | null): void { _lastDialogNpcId = v; }

/** Read whether a poop-burst VFX is pending (drained by render path). */
export function getPendingPoopBurst(): boolean { return _pendingPoopBurst; }

/** Set/clear the poop-burst VFX flag. */
export function setPendingPoopBurst(v: boolean): void { _pendingPoopBurst = v; }

// ─── Public API ──────────────────────────────────────────────

/**
 * Dispatch an `InteractionResult` to its handler. Each case mutates
 * the game state (inventory, status, pending quiz/trade/dialog flags),
 * fires UI feedback (toast, dialog, sfx), and may feed entropy or
 * trigger hints.
 *
 * Called from `update()` in main.ts when the player presses Space on
 * an interactive cell.
 */
export function handleInteraction(result: InteractionResult, state: GameState): void {
  switch (result.type) {
    case 'collect':
      state.inventory.addItem(result.itemId, 1);
      addToast(state.ui, result.message, '#ffd700');
      playSfx(state.sfx, result.itemId === 'coin' ? 'pickup_coin' : 'pickup_item');
      break;

    case 'chest': {
      const granted: string[] = [];
      for (const itemId of result.items) {
        if (state.inventory.addItem(itemId, 1)) granted.push(itemId);
      }
      addToast(
        state.ui,
        granted.length > 0
          ? `Opened chest! Found ${granted.join(', ')}!`
          : 'Opened chest — but inventory is full!',
        granted.length > 0 ? '#ffaa00' : '#ff9800',
      );
      playSfx(state.sfx, 'open_chest');
      doSave(state);
      break;
    }

    case 'obstacle':
      if (result.resolved) {
        addToast(state.ui, result.message, '#4caf50');
        playSfx(state.sfx, 'obstacle_resolved');
        doSave(state); // persist opened doors/tolls immediately
      } else {
        addToast(state.ui, result.message, '#f44336');
        playSfx(state.sfx, 'obstacle_blocked');
        // Teach: locked doors need keys; barricades need crowbars
        if (result.template?.requiredItem === 'key') {
          triggerHint('no_keys');
        } else if (result.template?.requiredItem === 'crowbar') {
          triggerHint('need_crowbar');
        }
      }
      break;

    case 'npc': {
      const persona = getNpcPersona(result.npcId);
      const npcName = persona?.displayName || 'Stranger';
      showDialog(state.ui, npcName, [result.greeting]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      // Speak greeting line (#76)
      _lastDialogNpcId = result.npcId;
      setDialogNpc(result.npcId); // Start mouth animation (#113)
      speakLine(state.voice, result.greeting, result.npcId);

      // Record NPC interaction history (WorldEngine-05 §8.5 save-fidelity
      // gap fix -- see Docs/VisionAlignmentAudit.md Finding #10)
      state.talkedToNpcs.add(result.npcId);

      // Feed NPC greeting into entropy pool (#4)
      feedEntropy(result.greeting);

      // If NPC can quiz, queue quiz to start when dialog closes (not via setTimeout race)
      // Difficulty = max(NPC preference, distance-based scaling) — Doc 05 §9.1
      // Then modulate via streak (#103)
      if (persona?.canQuiz) {
        const bias = getQuizBias(state.knowledge);
        const distDiff = getDifficultyForPosition(state.player.x, state.player.y);
        const baseDifficulty = blendDifficulty(persona.quizDifficulty, distDiff);
        const finalDifficulty = modulateDifficulty(baseDifficulty, state.streak);
        // Pre-pick the question now (not inside startQuiz) so a background
        // rephrase prefetch can use the dialog-reading window as free head
        // start (2026-07-10) -- see prefetchQuizRephrase()'s doc comment.
        const question = pickQuizQuestion(finalDifficulty, bias);
        state.pendingQuiz = { difficulty: finalDifficulty, npcId: result.npcId, bias, question };
        if (question) prefetchQuizRephrase(question.question);
      }

      // If NPC has trades, queue trade panel to open after dialog + optional quiz
      if (persona && persona.trades.length > 0) {
        state.pendingTrade = result.npcId;
      }
      break;
    }

    case 'sign':
      showDialog(state.ui, 'Sign', [result.message]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      break;

    case 'quiz_gate': {
      // Quiz gate — show dialog then trigger distance-based quiz (Doc 05 §3.5)
      showDialog(state.ui, 'Quiz Gate', [result.message]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      const baseGateDiff = getDifficultyForPosition(state.player.x, state.player.y);
      const gateDiff = modulateDifficulty(baseGateDiff, state.streak); // #103 streak modulation
      const gateBias = getQuizBias(state.knowledge);
      // Pre-pick + prefetch, same reasoning as the npc case above.
      const gateQuestion = pickQuizQuestion(gateDiff, gateBias);
      state.pendingQuiz = { difficulty: gateDiff, npcId: 'quiz_gate', bias: gateBias, question: gateQuestion };
      if (gateQuestion) prefetchQuizRephrase(gateQuestion.question);
      state.pendingGateQuiz = { chunkKey: result.chunkKey, lx: result.lx, ly: result.ly };
      break;
    }

    // --- Shop structure interaction (#77, #112 themed variants) ---
    case 'shop': {
      const shopPersona = getShopPersona(result.shopAsset);
      showDialog(state.ui, shopPersona.displayName, [shopPersona.greetings[Math.floor(Math.random() * shopPersona.greetings.length)]]);
      state.paused = true;
      playSfx(state.sfx, 'dialog_open');
      _lastDialogNpcId = null;
      speakLine(state.voice, result.message, null);
      // Queue trade panel to open after dialog closes
      state.pendingTrade = shopPersona.id;
      break;
    }

    // --- Outhouse hygiene interaction (#110 Phase 2) ---
    case 'outhouse': {
      playSfx(state.sfx, 'outhouse_enter');
      // Immediate partial cleanliness restore
      const cleanBefore = state.status.cleanliness;
      const partialRestore = Math.min(100 - cleanBefore, 40);
      state.status.cleanliness = Math.min(100, cleanBefore + partialRestore);
      const cleanMsg = partialRestore > 0
        ? `🧼 +${Math.round(partialRestore)} cleanliness!`
        : '✨ Already squeaky clean!';
      addToast(state.ui, `🚽 ${result.message}`, '#88ccff', 2500);
      if (partialRestore > 0) {
        addToast(state.ui, cleanMsg, '#4caf50', 2000);
      }
      // Start hygiene quiz for bonus full restore
      startHygieneQuiz(state);
      break;
    }

    // --- Stream drinking (#110 Phase 3, #133 illness chain) ---
    case 'stream_drink': {
      playSfx(state.sfx, 'stream_drink');
      const hydrationGain = 20;
      state.status.hydration = Math.min(100, state.status.hydration + hydrationGain);

      // Track stream drink count for diarrhea risk (#133)
      state.diarrhea.streamDrinkCount++;
      const drinkCount = state.diarrhea.streamDrinkCount;

      // Diarrhea roll: 20% after threshold, guaranteed at 6+ drinks, with cooldown
      const pastThreshold = drinkCount >= DIARRHEA_CONFIG.DRINK_THRESHOLD;
      const offCooldown = (state.frameCount - state.diarrhea.diarrheaLastTrigger) >= DIARRHEA_CONFIG.COOLDOWN_FRAMES;
      const chance = drinkCount >= DIARRHEA_CONFIG.GUARANTEED_AT
        ? 1.0
        : DIARRHEA_CONFIG.BASE_CHANCE;

      if (pastThreshold && offCooldown && Math.random() < chance) {
        // --- Trigger diarrhea illness event (#133) ---
        state.diarrhea.diarrheaLocked = true;
        state.diarrhea.diarrheaLockUntil = state.frameCount + DIARRHEA_CONFIG.LOCK_DURATION_FRAMES;
        state.diarrhea.diarrheaUntil = state.frameCount + DIARRHEA_CONFIG.LOCK_DURATION_FRAMES + DIARRHEA_CONFIG.DEBUFF_DURATION_FRAMES;
        state.diarrhea.diarrheaLastTrigger = state.frameCount;

        // Spawn poop marker at current position
        state.diarrhea.poopMarkers.push({
          x: Math.round(state.player.x),
          y: Math.round(state.player.y),
          placedAt: state.frameCount,
        });

        // Poop particle burst VFX (uses screen coords — resolved in render)
        _pendingPoopBurst = true;

        // Green illness overlay
        setDiarrheaOverlay(true);

        // SFX + UI feedback
        playSfx(state.sfx, 'diarrhea_gurgle');
        addToast(state.ui, '🤢 Oh no! Stomach emergency... can\'t move!', '#ff4444', 4000);
        triggerHint('stream_eww');
        setTransientExpression(state, 'surprised', 5000);
      } else {
        addToast(state.ui, `💧 Refreshing stream water! +${hydrationGain} hydration`, '#4fc3f7', 2500);
      }
      break;
    }

    // --- Eat worms desperation (#110 Phase 3) ---
    case 'eat_worms': {
      playSfx(state.sfx, 'eat_worms');
      const energyGain = 5;
      state.status.energy = Math.min(100, state.status.energy + energyGain);
      addToast(state.ui, '🐛 Gross! But you got a tiny bit of energy... +5', '#8bc34a', 3000);

      // Queue insect safety quiz
      state._pendingInsectQuiz = true;
      showDialog(state.ui, '🐛 Yuck!', ['That was disgusting... but is it actually safe to eat insects?']);
      state.paused = true;
      _lastDialogNpcId = null;
      break;
    }

    // --- Campfire rest interaction (#77) ---
    case 'campfire': {
      const changes = applyStatusEffect(state.status, { energy: 25, hydration: 10 });
      const msg = changes.length > 0
        ? `${result.message} ${changes.join(', ')}`
        : `${result.message} You feel refreshed!`;
      addToast(state.ui, msg, '#ff8844', 3000);
      playSfx(state.sfx, 'pickup_item');
      break;
    }

    // --- Structure flavor text (#77) ---
    case 'structure':
      // Toast only — don't pause for fence/wall flavor (keeps roam snappy)
      addToast(state.ui, result.message, '#9e9e9e', 1800);
      playSfx(state.sfx, 'obstacle_blocked');
      break;
  }
}

/**
 * Reset interaction state. Called by `resetGameState` (new game) so
 * a new playthrough doesn't inherit stale dialog or poop-burst flags.
 */
export function resetInteractionState(): void {
  _lastDialogNpcId = null;
  _pendingPoopBurst = false;
}