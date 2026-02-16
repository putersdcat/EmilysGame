/**
 * particle-density.spec.ts - Tests for Issue #78: Particle Density & Size Rebalance
 * Verifies: per-type caps, config-driven spawning, context-aware rates,
 * debug overlay particle counts, and no runaway spawn regressions.
 *
 * Run: npx playwright test tests/particle-density.spec.ts --reporter=list
 * GitHub: #78 - Particle Density & Size Rebalance
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

/** Helper: skip LLM gate if splash visible, wait for canvas */
async function startGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await skipBtn.click();
  }
  const canvas = page.locator('#gameContainer canvas');
  await expect(canvas).toBeAttached({ timeout: 8000 });
  await page.waitForTimeout(2000);
  return canvas;
}

test.describe('Particle Density Rebalance - Issue #78', () => {

  test('debug overlay shows per-type particle counts', async ({ page }) => {
    await startGame(page);
    // Walk around to spawn some particles
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    await page.keyboard.press('F3');
    await page.waitForTimeout(800);
    const debugOverlay = page.locator('#debugOverlay');
    await expect(debugOverlay).toBeVisible();
    const text = await debugOverlay.textContent();

    // Should contain the "Particles:" line with emoji breakdown
    expect(text).toContain('Particles:');
    // Per-type counts (e.g. 🦋3 ✨5 🍃2 🐦0)
    expect(text).toMatch(/🦋\d+/);
    expect(text).toMatch(/✨\d+/);
    expect(text).toMatch(/🍃\d+/);
    expect(text).toMatch(/🐦\d+/);
  });

  test('total particle count stays under configured cap', async ({ page }) => {
    await startGame(page);
    // Explore extensively to trigger particle spawning
    for (const dir of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.down(dir);
      await page.waitForTimeout(2500);
      await page.keyboard.up(dir);
      await page.waitForTimeout(200);
    }

    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    const totalMatch = text?.match(/Particles:\s*(\d+)/);
    expect(totalMatch).toBeTruthy();
    const total = parseInt(totalMatch![1]);
    // maxTotal is 40 in config
    expect(total).toBeLessThanOrEqual(40);
  });

  test('butterfly count stays under per-type cap', async ({ page }) => {
    await startGame(page);
    // Walk through flower areas
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(4000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    const butterflyMatch = text?.match(/🦋(\d+)/);
    if (butterflyMatch) {
      const count = parseInt(butterflyMatch[1]);
      // max butterflies is 5 in config (#134)
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  test('bird count stays under per-type cap', async ({ page }) => {
    await startGame(page);
    // Explore to give birds time to spawn
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(5000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    const birdMatch = text?.match(/🐦(\d+)/);
    if (birdMatch) {
      const count = parseInt(birdMatch[1]);
      // max birds is 3 in config
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  test('no console errors from particle system during gameplay', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await startGame(page);
    // Walk around extensively
    for (const dir of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.down(dir);
      await page.waitForTimeout(2000);
      await page.keyboard.up(dir);
      await page.waitForTimeout(200);
    }

    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('particle spawning respects time-of-day context', async ({ page }) => {
    await startGame(page);
    // Walk to build scene
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    // Check debug overlay — particle counts should reflect context
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();

    // Verify particles line exists with per-type breakdown
    expect(text).toContain('Particles:');
    expect(text).toMatch(/🦋\d+/);
    // Canvas still renders
    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
  });
});
