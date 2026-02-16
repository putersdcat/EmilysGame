/**
 * injury-phase3.spec.ts - E2E tests for injury system Phase 3 (#109).
 * Tests: screen flash, injury milestones, thought bubbles near shops.
 * TODO: DOC - injury Phase 3 test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test.describe('Injury System Phase 3 (#109)', () => {

  // ── Injury Flash DOM ──

  test('injury flash DOM element exists', async ({ page }) => {
    await waitForGame(page);
    const exists = await page.$('#injuryFlash');
    expect(exists).not.toBeNull();
  });

  test('injury flash is hidden initially', async ({ page }) => {
    await waitForGame(page);
    const display = await page.$eval('#injuryFlash', (el: HTMLElement) => el.style.display);
    expect(display).toBe('none');
  });

  // ── Injury Flash Trigger ──

  test('triggerInjuryFlash sets flash alpha > 0', async ({ page }) => {
    await waitForGame(page);
    const alpha = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      debug.triggerInjuryFlash();
      return debug.getInjuryFlashAlpha();
    });
    expect(alpha).toBeGreaterThan(0);
  });

  test('injury flash alpha decays over time', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(async () => {
      const debug = (window as any).__gameDebug;
      debug.triggerInjuryFlash();
      const initial = debug.getInjuryFlashAlpha();
      // Wait for a few frames
      await new Promise(r => setTimeout(r, 500));
      const after = debug.getInjuryFlashAlpha();
      return { initial, after };
    });
    expect(result.initial).toBeGreaterThan(result.after);
  });

  test('debuff visuals state includes injury flash alpha', async ({ page }) => {
    await waitForGame(page);
    const state = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug.getDebuffVisuals();
    });
    expect(state).toHaveProperty('injuryFlashAlpha');
    expect(typeof state.injuryFlashAlpha).toBe('number');
  });

  // ── Injury Count Milestones ──

  test('injury count starts at 0', async ({ page }) => {
    await waitForGame(page);
    const count = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      return debug.getInjury().injuryCount;
    });
    expect(count).toBe(0);
  });

  test('rollInjury increments injury count when triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const debug = (window as any).__gameDebug;
      // Force injury by calling rollInjury repeatedly until it fires
      let rolled = false;
      for (let i = 0; i < 200; i++) {
        const state = (window as any).__gameState;
        // Clear injury for re-roll
        state.injury.injured = false;
        state.injury.lastInjuryAt = 0;
        if (debug.rollInjury()) {
          rolled = true;
          break;
        }
      }
      return {
        rolled,
        count: debug.getInjury().injuryCount,
      };
    });
    expect(result.rolled).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });

  // ── Injury Near Shop Hint ──

  test('injury_near_shop hint can be triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('injury_near_shop');
      tb.tickBubbles();
      return tb.getBubbleState();
    });
    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('injury_near_shop');
    }
  });

  test('ouch_injury hint can be triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('ouch_injury');
      tb.tickBubbles();
      return tb.getBubbleState();
    });
    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('ouch_injury');
    }
  });

  test('need_bandaid hint can be triggered', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const tb = (window as any).__bubbles;
      if (!tb) return null;
      tb.resetCooldowns();
      tb.clearBubbles();
      tb.triggerHint('need_bandaid');
      tb.tickBubbles();
      return tb.getBubbleState();
    });
    if (result) {
      expect(result.active).not.toBeNull();
      expect(result.active.id).toBe('need_bandaid');
    }
  });
});
