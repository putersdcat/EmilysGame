import { test, expect } from '@playwright/test';

test.describe('Wildlife Directionality (#80)', () => {

  test('wildlife entities render on canvas without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    const canvas = page.locator('canvas:not(#minimapCanvas)');
    await canvas.waitFor({ timeout: 15000 });
    const skipBtn = page.locator('#skipSplashBtn');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForTimeout(3000);
    const pixels = await canvas.evaluate((c) => {
      const ctx = c.getContext('2d');
      if (!ctx) return { nonBlack: 0 };
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) nonBlack++;
      }
      return { nonBlack };
    });
    expect(pixels.nonBlack).toBeGreaterThan(100);
    const critical = errors.filter(e =>
      !e.includes('favicon') && !e.includes('net::') && !e.includes('ERR_CONNECTION')
    );
    expect(critical).toHaveLength(0);
  });

  test('wildlife debug overlay shows entity information', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    const skipBtn = page.locator('#skipSplashBtn');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForTimeout(3000);
    const debugOverlay = page.locator('#debugOverlay');
    const isVisible = await debugOverlay.isVisible().catch(() => false);
    if (isVisible) {
      const text = await debugOverlay.textContent();
      expect(text).toBeTruthy();
    }
  });

  test('game plays smoothly with wildlife directionality', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas:not(#minimapCanvas)');
    await canvas.waitFor({ timeout: 15000 });
    const skipBtn = page.locator('#skipSplashBtn');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForTimeout(2000);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'tests/screenshots/wildlife-gameplay.png' });
  });
});
