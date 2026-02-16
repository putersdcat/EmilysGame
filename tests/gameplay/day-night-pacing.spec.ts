/**
 * day-night-pacing.spec.ts - Tests for Issue #136: Day/Night Cycle Pacing
 * Verifies: wall-clock timing, playtime accumulation, sidebar display,
 * and cycle progress advancing over real time.
 *
 * Run: npx playwright test tests/gameplay/day-night-pacing.spec.ts --reporter=list
 * GitHub: #136 - Day/night pacing rebalance
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

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

test.describe('Day/Night Cycle Pacing - Issue #136', () => {

  test('cycle progress advances with wall-clock time', async ({ page }) => {
    await startGame(page);
    const t0 = await page.evaluate(() => (window as any).__lighting.getCycleProgress());
    expect(typeof t0).toBe('number');
    expect(t0).toBeGreaterThanOrEqual(0);
    expect(t0).toBeLessThan(1);

    // Wait 3 seconds and check that progress advanced
    await page.waitForTimeout(3000);
    const t1 = await page.evaluate(() => (window as any).__lighting.getCycleProgress());
    expect(t1).toBeGreaterThan(t0);
    // 3 seconds out of 7,200,000ms cycle ≈ 0.000417 advance
    const delta = t1 - t0;
    expect(delta).toBeGreaterThan(0.0002);
    expect(delta).toBeLessThan(0.005); // sanity: not advancing too fast
  });

  test('setTimeOfDay works and getCycleProgress reflects it', async ({ page }) => {
    await startGame(page);
    await page.evaluate(() => (window as any).__lighting.setTimeOfDay(0.5));
    await page.waitForTimeout(200);
    const progress = await page.evaluate(() => (window as any).__lighting.getCycleProgress());
    // Should be close to 0.5 (small drift from real-time advance acceptable)
    expect(progress).toBeGreaterThan(0.49);
    expect(progress).toBeLessThan(0.52);
  });

  test('playtime displayed in sidebar', async ({ page }) => {
    await startGame(page);
    const playtimeEl = page.locator('#sbPlaytime');
    await expect(playtimeEl).toBeAttached();
    // Wait for sidebar sync to update from default "0:00" HTML
    await expect(playtimeEl).toHaveText(/\d+m/, { timeout: 5000 });
  });

  test('playtime accumulates over time', async ({ page }) => {
    await startGame(page);
    const s0 = await page.evaluate(() => (window as any).__lighting.getPlayedSeconds());
    await page.waitForTimeout(3000);
    const s1 = await page.evaluate(() => (window as any).__lighting.getPlayedSeconds());
    // Should have accumulated ~3 seconds
    const elapsed = s1 - s0;
    expect(elapsed).toBeGreaterThan(2);
    expect(elapsed).toBeLessThan(5);
  });

  test('getTimeOfDay returns valid phase string', async ({ page }) => {
    await startGame(page);
    // Start is at early day (0.17 of cycle)
    const tod = await page.evaluate(() => (window as any).__lighting.getTimeOfDay());
    expect(typeof tod).toBe('string');
    // Should be one of the known phases
    expect(tod).toMatch(/Dawn|Morning|Day|Afternoon|Dusk|Evening|Night/);
  });

});
