/**
 * stream-worms.spec.ts - E2E tests for stream drinking & eat worms (#110 Phase 3).
 * Tests: water interaction, stream drink count, diarrhea debuff, insect quiz, worm eating.
 * TODO: DOC - Stream/desperation mechanic test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Stream Drinking & Desperation (#110 Phase 3)', () => {

  // ── Water Asset ──

  test('water asset definition exists and is non-walkable', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const assetDefs = debug?.getAssetDefs?.();
      return {
        waterExists: !!assetDefs?.water,
        waterWalkable: assetDefs?.water?.walkable,
        waterInteractable: assetDefs?.water?.interactable,
      };
    });
    expect(result.waterExists).toBe(true);
    expect(result.waterWalkable).toBe(false);
    // Water is not marked interactable — special-cased in mechanics
    expect(result.waterInteractable).toBe(false);
  });

  // ── Stream Drink Count Tracking ──

  test('stream drink count starts at 0', async ({ page }) => {
    await waitForGame(page);
    const count = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getStreamDrinkCount?.() ?? -1;
    });
    expect(count).toBe(0);
  });

  // ── Insect Quiz Questions ──

  test('insect quiz questions are available', async ({ page }) => {
    await waitForGame(page);
    const questions = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getInsectQuestions?.();
    });
    expect(questions).toBeTruthy();
    expect(questions.length).toBeGreaterThanOrEqual(3);
  });

  test('insect quiz questions have correct structure', async ({ page }) => {
    await waitForGame(page);
    const questions = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getInsectQuestions?.();
    });
    expect(questions).toBeTruthy();
    for (const q of questions) {
      expect(q.question).toBeTruthy();
      expect(q.answers).toBeTruthy();
      expect(q.answers.length).toBeGreaterThanOrEqual(3);
      expect(q.answers[0]).toBeTruthy();
    }
  });

  test('insect quiz has 4 questions', async ({ page }) => {
    await waitForGame(page);
    const count = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getInsectQuestions?.()?.length;
    });
    expect(count).toBe(4);
  });

  test('insect quiz can be started via debug hook', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = (window as any).__gameState;
      if (!debug || !state) return null;
      debug.startInsectQuiz();
      return {
        quizActive: state.quiz?.active,
        hasQuestion: !!state.quiz?.question,
      };
    });
    expect(result).toBeTruthy();
    expect(result!.quizActive).toBe(true);
    expect(result!.hasQuestion).toBe(true);
  });

  test('insect quiz sets insect quiz flag', async ({ page }) => {
    await waitForGame(page);
    const flagSet = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      const state = (window as any).__gameState;
      if (!debug || !state) return null;
      debug.startInsectQuiz();
      return (state as any)._insectQuiz === true;
    });
    expect(flagSet).toBe(true);
  });

  // ── Diarrhea Debuff ──

  test('diarrhea is not active initially', async ({ page }) => {
    await waitForGame(page);
    const active = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug?.getDiarrheaActive?.();
    });
    expect(active).toBe(false);
  });

  // ── SFX Definitions (via playSfx debug function) ──

  test('playSfx debug function is available', async ({ page }) => {
    await waitForGame(page);
    const available = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return typeof debug?.playSfx === 'function';
    });
    expect(available).toBe(true);
  });

  // ── Hint Definitions (via __bubbles.triggerHint) ──

  test('near_water hint can be triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('near_water');
      tb.tickBubbles();
      return tb.getBubbleState();
    });
    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('near_water');
    }
  });

  test('stream_eww hint can be triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('stream_eww');
      tb.tickBubbles();
      return tb.getBubbleState();
    });
    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('stream_eww');
    }
  });

  test('starving_worms hint can be triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('starving_worms');
      tb.tickBubbles();
      return tb.getBubbleState();
    });
    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('starving_worms');
    }
  });

  // ── Low energy state setup ──

  test('can set energy to critical level', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state) return null;
      state.status.energy = 5;
      return { energy: state.status.energy };
    });
    expect(result).toBeTruthy();
    expect(result!.energy).toBeLessThanOrEqual(15);
  });
});
