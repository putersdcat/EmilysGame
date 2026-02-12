/**
 * Quick visual test: captures a screenshot of the game state.
 * Run: npx playwright test tests/visual.spec.ts
 */
import { test, expect } from '@playwright/test';

test('capture game screenshot', async ({ page }) => {
  // Collect console errors
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // Capture screenshot of whatever state we're in
  await page.screenshot({ path: 'tests/screenshots/game.png', fullPage: true });

  // Pass if we got here (page loaded)
  expect(errors.length).toBeLessThan(5); // Allow some errors
});
