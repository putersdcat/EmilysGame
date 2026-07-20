/**
 * frame-time-triage.spec.ts - Tests for Issue #79: Frame-Time Triage
 * Verifies: perf instrumentation in debug overlay, no regressions from
 * object pooling (lights), write-compaction (particles), bonfire caching,
 * and eviction dedup.
 *
 * Run: npx playwright test tests/frame-time-triage.spec.ts --reporter=list
 * GitHub: #79 - Frame-Time Triage for Ambient Layers
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

test.describe('Frame-Time Triage - Issue #79', () => {

  test('perf stats appear in debug overlay after F3 toggle', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('F3');
    await page.waitForTimeout(800);
    const debugOverlay = page.locator('#debugOverlay');
    await expect(debugOverlay).toBeVisible();
    const text = await debugOverlay.textContent();
    // Perf line format (current HUD): "Perf: R:<n> P:<n> Wi:<n> L:<n> Wx:<n> …"
    expect(text).toContain('Perf:');
    expect(text).toMatch(/R:\d+\.\d/);
    expect(text).toMatch(/P:\d+\.\d/);
    expect(text).toMatch(/L:\d+\.\d/);
    expect(text).toMatch(/Wx:\d+\.\d/);
  });

  test('no console errors after extended exploration (eviction + caching)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await startGame(page);
    // Move in all 4 directions to trigger chunk loads/evictions
    for (const dir of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.down(dir);
      await page.waitForTimeout(2000);
      await page.keyboard.up(dir);
      await page.waitForTimeout(300);
    }
    // Move further to trigger more eviction
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('particles still render after write-compaction change', async ({ page }) => {
    await startGame(page);
    // Walk around to trigger particle spawning
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    // Toggle debug overlay
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    // The particles subsystem timing should be present (even if 0.0)
    expect(text).toMatch(/P:\d+\.\d/);

    // Canvas should still render without errors
    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
  });

  test('wildlife system works with Map-based species lookup', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await startGame(page);
    // Explore to find wildlife zones
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(300);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    // Check debug overlay for wildlife timing
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    expect(text).toMatch(/Wi:\d+\.\d/);

    // No species lookup errors
    const wildlifeErrors = errors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(wildlifeErrors).toHaveLength(0);
  });

  test('lighting renders with pooled light objects (no visual regression)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await startGame(page);
    // Walk around to trigger bonfire/light rendering in various chunks
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(500);

    // Verify lighting subsystem timing is tracked
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    expect(text).toMatch(/L:\d+\.\d/);
    await page.screenshot({ path: 'tests/screenshots/frame-time-lighting.png' });

    const renderErrors = errors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(renderErrors).toHaveLength(0);
  });

  test('cache eviction keeps memory under budget after heavy exploration', async ({ page }) => {
    await startGame(page);
    // Heavy directional exploration to trigger many chunk loads
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(2000);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(200);
    }
    for (let i = 0; i < 2; i++) {
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(2000);
      await page.keyboard.up('ArrowDown');
      await page.waitForTimeout(200);
    }

    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const text = await page.locator('#debugOverlay').textContent();
    const mbMatch = text?.match(/(\d+\.\d+)MB/);
    expect(mbMatch).toBeTruthy();
    const mb = parseFloat(mbMatch![1]);
    expect(mb).toBeGreaterThan(0);
    expect(mb).toBeLessThan(200); // Memory budget
  });
});
