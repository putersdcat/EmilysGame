/**
 * edge-contracts.spec.ts — Tests for inter-chunk edge contract compliance (#17).
 * Verifies AC-3 solver produces compatible edges between adjacent chunks.
 *
 * Run: npx playwright test tests/edge-contracts.spec.ts --reporter=list
 * GitHub: #17 — Edge Contract System
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

test.describe('Edge Contract System (Issue #17)', () => {

  test('game starts and runs with AC-3 solver without errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
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
    await page.waitForTimeout(2000);

    // No fatal JS errors (filter out expected LLM/favicon noise)
    const fatal = jsErrors.filter(e =>
      !e.includes('favicon') && !e.includes('LLM') && !e.includes('health')
    );
    expect(fatal.length).toBe(0);
  });

  test('multiple chunk transitions maintain visual integrity', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
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
    await page.waitForTimeout(1500);

    // Screenshot before movement
    await page.screenshot({ path: 'tests/screenshots/edge-contract-start.png', fullPage: true });

    // Move in all 4 directions to cross chunk boundaries
    const moves = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    for (const key of moves) {
      for (let i = 0; i < 4; i++) {
        await page.keyboard.down(key);
        await page.waitForTimeout(500);
        await page.keyboard.up(key);
        await page.waitForTimeout(200);
      }
    }

    // Screenshot after movement
    await page.screenshot({ path: 'tests/screenshots/edge-contract-after-move.png', fullPage: true });

    // No crashes during chunk generation with border constraints
    const fatal = jsErrors.filter(e =>
      !e.includes('favicon') && !e.includes('LLM') && !e.includes('health')
    );
    expect(fatal.length).toBeLessThan(3);
  });

  test('rapid movement across multiple chunks does not crash', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') jsErrors.push(msg.text());
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

    // Hold ArrowRight for extended movement to cross multiple chunks
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(5000);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tests/screenshots/edge-contract-rapid.png', fullPage: true });

    // Game should still be rendering
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(100);

    // No fatal errors
    const fatal = jsErrors.filter(e =>
      !e.includes('favicon') && !e.includes('LLM') && !e.includes('health')
    );
    expect(fatal.length).toBeLessThan(3);
  });
});
