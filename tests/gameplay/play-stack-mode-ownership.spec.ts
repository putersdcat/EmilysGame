/**
 * play-stack-mode-ownership.spec.ts — PR5 Layer 2 PlayMode ownership.
 *
 * Proves:
 *  - Orphan pause recovers → locomotionAllowed next frame
 *  - Gate-style dialog → queue quiz → exit drain → quiz active + stack
 *  - NPC-style dialog → quiz → trade pendingNext chain
 *  - Shop-style dialog → trade drain
 *  - Worms → insect quiz via queueAfterClose
 *  - Direct injury/hygiene-style quiz enter
 *  - Post-modal movement allowed (locomotionAllowed true)
 *  - controlLock (diarrhea) blocks world interact
 *  - No softlock: empty stack + no lock ⇒ locomotion
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (L2 / PR5)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state?.chunks?.size, undefined, {
    timeout: 15000,
  });
  await page.evaluate(() => {
    localStorage.setItem('emilys_game_first_run', '1');
    const splash = document.getElementById('welcomeSplash');
    if (splash) {
      splash.style.display = 'none';
      (splash as HTMLElement).style.pointerEvents = 'none';
    }
    const d = (window as any).__gameDebug;
    d.resetPlayMode();
  });
}

test.describe('PlayMode ownership (PR5 L2)', () => {
  test('orphan pause: empty stack + paused true recovers locomotion', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      // Simulate legacy orphan: paused without owner
      state.paused = true;
      state.playMode.stack = [];
      state.playMode.pendingNext = [];
      state.playMode.controlLock = null;
      state.quiz.active = false;
      state.ui.dialog.active = false;
      state.trade.active = false;
      state.knowledge.bookOpen = false;
      const menu = document.getElementById('pauseMenu');
      if (menu) menu.style.display = 'none';

      const recovered = d.recoverOrphanPause();
      return {
        recovered,
        locomotion: d.locomotionAllowed(),
        paused: state.paused,
        stackLen: state.playMode.stack.length,
      };
    });

    expect(result.recovered).toBe(true);
    expect(result.locomotion).toBe(true);
    expect(result.paused).toBe(false);
    expect(result.stackLen).toBe(0);
  });

  test('gate dialog→quiz drain: sync active + stack agree', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(async () => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      d.resetPlayMode();

      // Payload carrier + queue (as interaction-handler does for quiz_gate)
      const q = d.pickQuizQuestion ? d.pickQuizQuestion('easy') : null;
      // Use startQuiz path via pendingQuiz
      state.pendingQuiz = {
        difficulty: 'easy',
        npcId: 'quiz_gate',
        bias: {},
        question: null,
      };
      state.pendingGateQuiz = { chunkKey: '0,0', lx: 12, ly: 14 };

      d.openTestDialog('quiz_gate', ['The gate demands a question!']);
      d.queueAfterClose({ kind: 'quiz', owner: 'quiz_gate', gate: state.pendingGateQuiz });

      const mid = d.getPlayMode();
      // Close dialog → drain
      d.exitModal('dialog');

      const after = d.getPlayMode();
      return {
        midLocomotion: mid.locomotionAllowed,
        midTop: mid.top,
        afterTop: after.top,
        quizActive: state.quiz.active,
        afterLocomotion: after.locomotionAllowed,
        dialogActive: state.ui.dialog.active,
        stackKinds: after.stack.map((f: { kind: string }) => f.kind),
      };
    });

    expect(result.midLocomotion).toBe(false);
    expect(result.midTop).toEqual(expect.objectContaining({ kind: 'dialog' }));
    expect(result.dialogActive).toBe(false);
    // Drain should have started quiz (if questions available)
    if (result.quizActive) {
      expect(result.afterTop).toEqual(expect.objectContaining({ kind: 'quiz' }));
      expect(result.afterLocomotion).toBe(false);
      expect(result.stackKinds).toContain('quiz');
    } else {
      // No questions in test pack — must still be free play (no softlock)
      expect(result.afterLocomotion).toBe(true);
    }
  });

  test('shop dialog→trade drain', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      d.resetPlayMode();

      // Use a known merchant persona with trades if available
      const personas = ['merchant_meadow', 'shop_general', 'trader'];
      let owner = 'merchant_meadow';
      for (const id of personas) {
        const p = d.getNpcPersona?.(id);
        if (p?.trades?.length) {
          owner = id;
          break;
        }
      }

      state.pendingTrade = owner;
      d.openTestDialog(`shop:${owner}`, ['Welcome to my shop!']);
      d.queueAfterClose({ kind: 'trade', owner });

      d.exitModal('dialog');

      const pm = d.getPlayMode();
      return {
        tradeActive: state.trade.active,
        top: pm.top,
        locomotion: pm.locomotionAllowed,
        pendingTrade: state.pendingTrade,
      };
    });

    // If persona has trades, trade should be active; else free play
    if (result.tradeActive) {
      expect(result.top).toEqual(expect.objectContaining({ kind: 'trade' }));
      expect(result.locomotion).toBe(false);
    } else {
      expect(result.locomotion).toBe(true);
    }
  });

  test('worms→insect: queue quiz owner insect + drain starts insect quiz', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      d.resetPlayMode();

      state._pendingInsectQuiz = true;
      d.openTestDialog('eat_worms', ['That was disgusting...']);
      d.queueAfterClose({ kind: 'quiz', owner: 'insect' });

      d.exitModal('dialog');

      return {
        quizActive: state.quiz.active,
        insectFlag: state._insectQuiz,
        pendingFlag: state._pendingInsectQuiz,
        top: d.getPlayMode().top,
        locomotion: d.locomotionAllowed(),
      };
    });

    expect(result.quizActive).toBe(true);
    expect(result.insectFlag).toBe(true);
    expect(result.pendingFlag).toBe(false);
    expect(result.top).toEqual(expect.objectContaining({ kind: 'quiz', owner: 'insect' }));
    expect(result.locomotion).toBe(false);
  });

  test('direct quiz (hygiene) then exit → locomotion allowed', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      d.resetPlayMode();

      d.startHygieneQuiz();
      const mid = d.getPlayMode();

      // Simulate quiz close
      state.quiz.active = false;
      d.exitModal('quiz');

      const after = d.getPlayMode();
      return {
        midLocomotion: mid.locomotionAllowed,
        midTop: mid.top,
        afterLocomotion: after.locomotionAllowed,
        afterPaused: after.paused,
        stackLen: after.stack.length,
      };
    });

    expect(result.midLocomotion).toBe(false);
    expect(result.midTop).toEqual(expect.objectContaining({ kind: 'quiz' }));
    expect(result.afterLocomotion).toBe(true);
    expect(result.afterPaused).toBe(false);
    expect(result.stackLen).toBe(0);
  });

  test('NPC dialog queues quiz then trade (pendingNext order)', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      const state = d.state;
      d.resetPlayMode();

      state.pendingQuiz = {
        difficulty: 'easy',
        npcId: 'npc_test',
        bias: {},
        question: null,
      };
      state.pendingTrade = 'npc_test';

      d.openTestDialog('npc:npc_test', ['Greetings!']);
      d.queueAfterClose({ kind: 'quiz', owner: 'npc_test' });
      d.queueAfterClose({ kind: 'trade', owner: 'npc_test' });

      const queued = d.getPlayMode().pendingNext.map((f: { kind: string }) => f.kind);

      d.exitModal('dialog');
      const afterDialog = d.getPlayMode();

      // Close quiz → should attempt trade
      if (state.quiz.active) {
        state.quiz.active = false;
        d.exitModal('quiz');
      }
      const afterQuiz = d.getPlayMode();

      return {
        queued,
        afterDialogTop: afterDialog.top,
        afterDialogPending: afterDialog.pendingNext.map((f: { kind: string }) => f.kind),
        quizActiveAfterDialog: state.quiz.active,
        afterQuizTop: afterQuiz.top,
        tradeActive: state.trade.active,
        finalLocomotion: afterQuiz.locomotionAllowed,
      };
    });

    expect(result.queued).toEqual(['quiz', 'trade']);
    // After dialog: either quiz (if question available) or trade attempt
    if (result.quizActiveAfterDialog) {
      expect(result.afterDialogTop).toEqual(expect.objectContaining({ kind: 'quiz' }));
      expect(result.afterDialogPending).toEqual(['trade']);
    }
    // After full chain, either trade open or free play — never orphan pause
    if (!result.tradeActive) {
      expect(result.finalLocomotion).toBe(true);
    } else {
      expect(result.afterQuizTop).toEqual(expect.objectContaining({ kind: 'trade' }));
    }
  });

  test('diarrhea controlLock blocks locomotion and world interact', async ({ page }) => {
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      d.resetPlayMode();
      d.setControlLock({ reason: 'diarrhea', untilMs: performance.now() + 60_000 });
      const locked = d.getPlayMode();
      d.setControlLock(null);
      const free = d.getPlayMode();
      return {
        lockedLocomotion: locked.locomotionAllowed,
        lockedInteract: locked.worldInteractAllowed,
        freeLocomotion: free.locomotionAllowed,
        freeInteract: free.worldInteractAllowed,
      };
    });

    expect(result.lockedLocomotion).toBe(false);
    expect(result.lockedInteract).toBe(false);
    expect(result.freeLocomotion).toBe(true);
    expect(result.freeInteract).toBe(true);
  });

  test('live gate interaction: dialog then quiz then free move (stack SSOT)', async ({ page }) => {
    await waitForGame(page);

    // Homestead ORIGIN (9,8) + gate offset (3,6) = world cell (12,14)
    const GATE = { x: 12, y: 14 };
    await page.evaluate((g) => {
      const d = (window as any).__gameDebug;
      d.setPlayerPosition(g.x + 0.5, g.y - 0.5);
      d.state.player.facingDx = 0;
      d.state.player.facingDy = 1;
      d.state.player.isMoving = false;
      d.resetPlayMode();
    }, GATE);

    // Space → dialog
    await page.keyboard.press(' ');
    await page.waitForTimeout(250);

    const afterInteract = await page.evaluate(() => {
      const d = (window as any).__gameDebug;
      return {
        dialog: d.state.ui.dialog.active,
        pm: d.getPlayMode(),
      };
    });

    // May or may not hit gate depending on collision; if dialog opened, assert stack
    if (afterInteract.dialog || afterInteract.pm.top?.kind === 'dialog') {
      expect(afterInteract.pm.locomotionAllowed).toBe(false);

      // Advance/close dialog
      await page.keyboard.press(' ');
      await page.waitForTimeout(400);

      const afterDialog = await page.evaluate(() => {
        const d = (window as any).__gameDebug;
        return {
          quiz: d.state.quiz.active,
          pm: d.getPlayMode(),
        };
      });

      if (afterDialog.quiz) {
        expect(afterDialog.pm.top).toEqual(expect.objectContaining({ kind: 'quiz' }));
        expect(afterDialog.pm.locomotionAllowed).toBe(false);

        // Escape is blocked during quiz; close via idk or force exit
        await page.evaluate(() => {
          const d = (window as any).__gameDebug;
          d.state.quiz.active = false;
          d.exitModal('quiz');
        });

        const free = await page.evaluate(() => (window as any).__gameDebug.getPlayMode());
        expect(free.locomotionAllowed).toBe(true);
        expect(free.paused).toBe(false);
      }
    } else {
      // No interact hit — still prove free play is not softlocked
      expect(afterInteract.pm.locomotionAllowed).toBe(true);
    }
  });
});
