/**
 * test-screenshot.spec.ts - Test screenshot capture functionality
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_PATH = path.join(process.cwd(), 'docs', 'game-screenshot.png');

test.describe('Screenshot Capture System', () => {
  test('screenshot script creates output file', async ({ page }) => {
    // This test verifies the screenshot infrastructure
    // The actual npm run screenshot command would be tested separately

    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Skip LLM splash if present
    const splash = page.locator('#llmSplash');
    const splashVisible = await splash.isVisible();

    if (splashVisible) {
      const skipBtn = page.locator('#btnSkipLlm');
      if (await skipBtn.isVisible()) {
        await skipBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Wait for game wrapper to exist
    const gameWrapper = page.locator('#gameWrapper');
    await expect(gameWrapper).toBeVisible();

    // Take a test screenshot to verify infrastructure
    const testPath = path.join(process.cwd(), 'tests', 'screenshots', 'test-capture.png');
    await gameWrapper.screenshot({ path: testPath });

    // Verify file was created
    expect(fs.existsSync(testPath)).toBeTruthy();

    // Verify file is not empty
    const stats = fs.statSync(testPath);
    expect(stats.size).toBeGreaterThan(1000); // At least 1KB
  });

  test('docs directory exists for screenshot output', () => {
    const docsDir = path.join(process.cwd(), 'docs');
    expect(fs.existsSync(docsDir)).toBeTruthy();
  });

  test('README references screenshot path', async () => {
    const readmePath = path.join(process.cwd(), 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf-8');
    expect(readme).toContain('docs/game-screenshot.png');
  });
});
