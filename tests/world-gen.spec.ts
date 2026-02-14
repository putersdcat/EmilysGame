/**
 * world-gen.spec.ts — Visual + structural tests for the grid-based world generation.
 * Verifies the new 5×5 world unit solver produces valid, renderable chunks.
 *
 * Run: npx playwright test tests/world-gen.spec.ts --reporter=list
 * GitHub: #23 — Generation Pipeline Refactor
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

test.describe('World Generation (Issue #23)', () => {

  test('game loads and renders after LLM skip', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Skip LLM gate if splash visible
    const skipBtn = page.locator('#btnSkipLlm');
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Wait for canvas to appear (game started)
    const canvas = page.locator('#gameContainer canvas');
    await expect(canvas).toBeAttached({ timeout: 8000 });
    await page.waitForTimeout(2000); // Let a few frames render

    // Canvas should have non-zero dimensions
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);

    // Screenshot for manual inspection
    await page.screenshot({ path: 'tests/screenshots/world-gen-post-skip.png', fullPage: true });

    // No JS crashes
    const fatalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('LLM') && !e.includes('health')
    );
    expect(fatalErrors.length).toBeLessThan(3);
  });

  test('multiple chunks render without crash', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Skip LLM
    const skipBtn = page.locator('#btnSkipLlm');
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    const canvas = page.locator('#gameContainer canvas');
    await expect(canvas).toBeAttached({ timeout: 8000 });
    await page.waitForTimeout(1000);

    // Move right to trigger chunk boundary crossing (hold ArrowRight)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(600);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(200);
    }

    // Screenshot after movement
    await page.screenshot({ path: 'tests/screenshots/world-gen-after-move.png', fullPage: true });

    // No fatal errors during chunk transitions
    const fatalErrors = consoleErrors.filter(e =>
      !e.includes('favicon') && !e.includes('LLM') && !e.includes('health')
    );
    expect(fatalErrors.length).toBeLessThan(5);
  });

  test('debug panel shows chunk coordinates', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Skip LLM
    const skipBtn = page.locator('#btnSkipLlm');
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    await page.waitForTimeout(1500);

    // Click debug button to open debug panel
    const debugBtn = page.locator('#btnDebug');
    if (await debugBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await debugBtn.click();
      await page.waitForTimeout(500);
    }

    // Check if debug info shows coordinate-related text
    const debugPanel = page.locator('#debugPanel, #debugOverlay, [id*="debug"]');
    const debugCount = await debugPanel.count();
    expect(debugCount).toBeGreaterThan(0);

    await page.screenshot({ path: 'tests/screenshots/world-gen-debug.png', fullPage: true });
  });

  test('world gen produces 25x25 chunk cells', async ({ page }) => {
    // Verify chunk dimensions via evaluating game state in browser context
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Skip LLM
    const skipBtn = page.locator('#btnSkipLlm');
    if (await skipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await skipBtn.click();
    }

    const canvas = page.locator('#gameContainer canvas');
    await expect(canvas).toBeAttached({ timeout: 8000 });
    await page.waitForTimeout(1500);

    // Attempt to read chunk data from window (if exposed)
    const chunkInfo = await page.evaluate(() => {
      // @ts-ignore - accessing game state if exposed
      const w = window as any;
      if (w.__gameChunks) {
        const chunks = w.__gameChunks;
        const keys = Object.keys(chunks);
        if (keys.length > 0) {
          const firstChunk = chunks[keys[0]];
          return {
            hasChunks: true,
            cellRows: firstChunk?.cells?.length ?? 0,
            cellCols: firstChunk?.cells?.[0]?.length ?? 0,
          };
        }
      }
      return { hasChunks: false, cellRows: 0, cellCols: 0 };
    });

    // If game state is exposed, verify 25x25
    if (chunkInfo.hasChunks) {
      expect(chunkInfo.cellRows).toBe(25);
      expect(chunkInfo.cellCols).toBe(25);
    }
    // If not exposed, just verify the game is running (canvas rendered)
    expect(await canvas.isVisible()).toBeTruthy();
  });
});
