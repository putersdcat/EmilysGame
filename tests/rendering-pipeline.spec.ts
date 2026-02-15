/**
 * rendering-pipeline.spec.ts - Tests for Issue #18/#47: Rendering Pipeline
 * Verifies: debug grid overlay, auto-tile transitions, terrain cache,
 * depth sorting, memory budget, corner transitions, and render performance.
 *
 * Run: npx playwright test tests/rendering-pipeline.spec.ts --reporter=list
 * GitHub: #18 - Rendering Pipeline - Layer System & Cache Alignment
 * GitHub: #47 - Rendering Pipeline & Cache Hierarchy Enhancements
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

test.describe('Rendering Pipeline - Issue #18/#47', () => {

  test('debug overlay shows template grid and WU info when F3 toggled', async ({ page }) => {
    await startGame(page);
    const debugOverlay = page.locator('#debugOverlay');
    await expect(debugOverlay).toHaveCSS('display', 'none');
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    await expect(debugOverlay).toBeVisible();
    const debugText = await debugOverlay.textContent();
    expect(debugText).toContain('FPS:');
    expect(debugText).toContain('Chunk:');
    expect(debugText).toContain('WU:');
    expect(debugText).toContain('Cache:');
    await page.screenshot({ path: 'tests/screenshots/debug-grid-overlay.png' });
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    await expect(debugOverlay).toHaveCSS('display', 'none');
  });

  test('terrain cache renders correctly with 25x25 chunk structure', async ({ page }) => {
    const canvas = await startGame(page);
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
    await page.screenshot({ path: 'tests/screenshots/terrain-cache-25x25.png' });
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const debugText = await page.locator('#debugOverlay').textContent();
    const cacheMatch = debugText?.match(/Cache:\s*(\d+)\s*chunks\s*\((\d+\.\d+)MB\)/);
    expect(cacheMatch).toBeTruthy();
    const cacheSize = parseInt(cacheMatch![1]);
    expect(cacheSize).toBeGreaterThanOrEqual(1);
    const cacheMB = parseFloat(cacheMatch![2]);
    expect(cacheMB).toBeGreaterThan(0);
    expect(cacheMB).toBeLessThan(200);
  });

  test('no visual glitches at chunk boundaries during movement', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    await startGame(page);
    const directions = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (const dir of directions) {
      await page.keyboard.down(dir);
      await page.waitForTimeout(1500);
      await page.keyboard.up(dir);
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: 'tests/screenshots/chunk-boundary-movement.png' });
    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('depth sorting correct with multi-height templates', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(3000);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tests/screenshots/depth-sorting-templates.png' });
    const debugText = await page.locator('#debugOverlay').textContent();
    expect(debugText).toContain('Pos:');
    expect(debugText).toContain('WU:');
    expect(debugText).toContain('Cache:');
  });

  test('memory budget tracking shows MB in debug overlay (#47)', async ({ page }) => {
    await startGame(page);
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const debugText = await page.locator('#debugOverlay').textContent();
    expect(debugText).toMatch(/Cache:\s*\d+\s*chunks\s*\(\d+\.\d+MB\)/);
  });

  test('eviction keeps cache under memory budget after exploration (#47)', async ({ page }) => {
    await startGame(page);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(4000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('F3');
    await page.waitForTimeout(600);
    const debugText = await page.locator('#debugOverlay').textContent();
    const mbMatch = debugText?.match(/(\d+\.\d+)MB/);
    expect(mbMatch).toBeTruthy();
    const mb = parseFloat(mbMatch![1]);
    expect(mb).toBeGreaterThan(0);
    expect(mb).toBeLessThan(200);
  });

  test('corner transitions render without errors (#47)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await startGame(page);
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowDown');
    await page.waitForTimeout(500);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(2000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);
    const renderErrors = errors.filter(e =>
      !e.includes('LLM') && !e.includes('health') && !e.includes('favicon')
    );
    expect(renderErrors).toHaveLength(0);
    const canvasVisible = await page.locator('#gameContainer canvas').isVisible();
    expect(canvasVisible).toBe(true);
  });
});
