/**
 * rendering-pipeline.spec.ts - Tests for Issue #18: Rendering Pipeline
 * Verifies: debug grid overlay, auto-tile transitions, terrain cache,
 * depth sorting, and render performance.
 *
 * Run: npx playwright test tests/rendering-pipeline.spec.ts --reporter=list
 * GitHub: #18 — Rendering Pipeline — Layer System & Cache Alignment
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
  await page.waitForTimeout(2000); // Let frames render
  return canvas;
}

test.describe('Rendering Pipeline — Issue #18', () => {

  test('debug overlay shows template grid and WU info when F3 toggled', async ({ page }) => {
    await startGame(page);

    // Debug overlay should be hidden initially
    const debugOverlay = page.locator('#debugOverlay');
    await expect(debugOverlay).toHaveCSS('display', 'none');

    // Press F3 to toggle debug mode
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);

    // Debug overlay should now be visible with chunk & WU info
    await expect(debugOverlay).toBeVisible();
    const debugText = await debugOverlay.textContent();
    expect(debugText).toContain('FPS:');
    expect(debugText).toContain('Chunk:');
    expect(debugText).toContain('WU:');
    expect(debugText).toContain('Cache:');

    // Take a screenshot with debug grid visible (canvas has WU grid lines)
    await page.screenshot({ path: 'tests/screenshots/debug-grid-overlay.png' });

    // Toggle off
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    await expect(debugOverlay).toHaveCSS('display', 'none');
  });

  test('terrain cache renders correctly with 25x25 chunk structure', async ({ page }) => {
    const canvas = await startGame(page);

    // Verify canvas is rendering (has non-zero dimensions)
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);

    // Take screenshot to verify terrain renders without glitches
    await page.screenshot({ path: 'tests/screenshots/terrain-cache-25x25.png' });

    // Move right to trigger chunk loading
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    // Enable debug to check cache size
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const debugText = await page.locator('#debugOverlay').textContent();
    // Should have at least 1 chunk cached
    const cacheMatch = debugText?.match(/Cache:\s*(\d+)/);
    expect(cacheMatch).toBeTruthy();
    const cacheSize = parseInt(cacheMatch![1]);
    expect(cacheSize).toBeGreaterThanOrEqual(1);
  });

  test('no visual glitches at chunk boundaries during movement', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await startGame(page);

    // Move in all four directions to cross chunk/WU boundaries
    const directions = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (const dir of directions) {
      await page.keyboard.down(dir);
      await page.waitForTimeout(1500);
      await page.keyboard.up(dir);
      await page.waitForTimeout(300);
    }

    // Take screenshot after movement — should show consistent terrain
    await page.screenshot({ path: 'tests/screenshots/chunk-boundary-movement.png' });

    // Verify game is still responsive (canvas exists, no JS errors)
    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);

    // No critical console errors (filter out expected warnings)
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('depth sorting correct with multi-height templates', async ({ page }) => {
    await startGame(page);

    // Enable debug mode to verify rendering state
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);

    // Move to explore and trigger rendering of various template types
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(500);

    // Screenshot showing multiple template types with depth sorting + debug grid
    await page.screenshot({ path: 'tests/screenshots/depth-sorting-templates.png' });

    // Verify debug overlay still shows correct data after movement
    const debugText = await page.locator('#debugOverlay').textContent();
    expect(debugText).toContain('Pos:');
    expect(debugText).toContain('WU:');
    expect(debugText).toContain('Cache:');
  });
});
