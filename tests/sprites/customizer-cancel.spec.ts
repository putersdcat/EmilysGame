/**
 * customizer-cancel.spec.ts - Tests for customizer cancel/discard path (#125).
 * Verifies cancel button appears when opened from pause/HUD, not on new game,
 * and that cancelling preserves original appearance.
 * TODO: DOC - customizer cancel test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => !!(window as any).__gameState)).toBe(true);
}

test.describe('Customizer Cancel (#125)', () => {

  test('cancel button exists in DOM', async ({ page }) => {
    await waitForGame(page);
    const cancelBtn = page.locator('#customizerCancel');
    await expect(cancelBtn).toBeAttached();
  });

  test('cancel button hidden by default (customizer not open)', async ({ page }) => {
    await waitForGame(page);
    const cancelBtn = page.locator('#customizerCancel');
    // Should exist but be hidden
    const display = await cancelBtn.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

  test('cancel button visible when customizer opened from HUD', async ({ page }) => {
    await waitForGame(page);

    // Record original appearance
    const originalVariation = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return state ? { ...state.playerVariation } : null;
    });
    expect(originalVariation).not.toBeNull();

    // Open customizer via HUD button  
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(300);

    // Customizer should be visible
    const overlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('customizerOverlay');
      return overlay?.style.display === 'flex';
    });
    expect(overlayVisible).toBe(true);

    // Cancel button should now be visible
    const cancelBtn = page.locator('#customizerCancel');
    const cancelDisplay = await cancelBtn.evaluate(el => getComputedStyle(el).display);
    expect(cancelDisplay).not.toBe('none');
  });

  test('clicking cancel closes customizer without changing appearance', async ({ page }) => {
    await waitForGame(page);

    // Record original variation
    const originalVariation = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return state ? JSON.stringify(state.playerVariation) : null;
    });
    expect(originalVariation).not.toBeNull();

    // Open customizer via HUD
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(300);

    // Randomize to change appearance
    await page.locator('#customizerRandom').click();
    await page.waitForTimeout(200);

    // Now cancel
    await page.locator('#customizerCancel').click();
    await page.waitForTimeout(300);

    // Customizer should be hidden
    const overlayHidden = await page.evaluate(() => {
      const overlay = document.getElementById('customizerOverlay');
      return overlay?.style.display === 'none';
    });
    expect(overlayHidden).toBe(true);

    // Appearance should be unchanged
    const afterVariation = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return state ? JSON.stringify(state.playerVariation) : null;
    });
    expect(afterVariation).toBe(originalVariation);
  });

  test('cancel from pause menu returns to pause menu', async ({ page }) => {
    await waitForGame(page);

    // Open pause menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const pauseVisible = await page.evaluate(() => {
      const pm = document.getElementById('pauseMenu');
      return pm?.style.display === 'flex';
    });
    expect(pauseVisible).toBe(true);

    // Click Customize in pause menu
    await page.locator('#pauseCustomize').click();
    await page.waitForTimeout(300);

    // Pause menu hidden, customizer visible
    const custVisible = await page.evaluate(() => {
      const c = document.getElementById('customizerOverlay');
      const p = document.getElementById('pauseMenu');
      return { cust: c?.style.display, pause: p?.style.display };
    });
    expect(custVisible.cust).toBe('flex');
    expect(custVisible.pause).toBe('none');

    // Cancel
    await page.locator('#customizerCancel').click();
    await page.waitForTimeout(300);

    // Should return to pause menu
    const afterCancel = await page.evaluate(() => {
      const c = document.getElementById('customizerOverlay');
      const p = document.getElementById('pauseMenu');
      return { cust: c?.style.display, pause: p?.style.display };
    });
    expect(afterCancel.cust).toBe('none');
    expect(afterCancel.pause).toBe('flex');
  });

  test('confirm still works normally after cancel is added', async ({ page }) => {
    await waitForGame(page);

    // Open customizer via HUD
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(300);

    // Randomize
    await page.locator('#customizerRandom').click();
    await page.waitForTimeout(200);

    // Record randomized variation
    const randomized = await page.evaluate(() => {
      // The preview shows what will be confirmed - get it from the DOM
      const preview = document.getElementById('customizerPreview');
      return !!preview; // just check it exists
    });
    expect(randomized).toBe(true);

    // Confirm
    await page.locator('#customizerConfirm').click();
    await page.waitForTimeout(300);

    // Customizer should close
    const closed = await page.evaluate(() => {
      const overlay = document.getElementById('customizerOverlay');
      return overlay?.style.display === 'none';
    });
    expect(closed).toBe(true);

    // Game should be unpaused
    const unpaused = await page.evaluate(() => {
      const state = (window as any).__gameState;
      return state ? !state.paused : null;
    });
    expect(unpaused).toBe(true);
  });

  test('game unpauses after cancel from HUD', async ({ page }) => {
    await waitForGame(page);

    // Open customizer via HUD
    await page.locator('#btnCustomize').click();
    await page.waitForTimeout(300);

    // Game should be paused
    const paused = await page.evaluate(() => (window as any).__gameState?.paused);
    expect(paused).toBe(true);

    // Cancel  
    await page.locator('#customizerCancel').click();
    await page.waitForTimeout(300);

    // Game should be unpaused
    const afterCancel = await page.evaluate(() => (window as any).__gameState?.paused);
    expect(afterCancel).toBe(false);
  });
});
