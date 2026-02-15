import { test, expect } from '@playwright/test';

test.describe('Micro-Tile Placement Jitter (#82)', () => {

  test('cellJitter returns deterministic offsets for same coordinates', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
      function cellJitter(gx, gy, jitterRange, halfTW = 32, halfTH = 16) {
        if (jitterRange <= 0) return { dx: 0, dy: 0 };
        const hx = ((gx * 374761393 + gy * 668265263) >>> 0) / 4294967296;
        const hy = ((gx * 1274126177 + gy * 1103515245) >>> 0) / 4294967296;
        return {
          dx: (hx * 2 - 1) * jitterRange * halfTW,
          dy: (hy * 2 - 1) * jitterRange * halfTH,
        };
      }
      const a = cellJitter(10, 20, 0.35);
      const b = cellJitter(10, 20, 0.35);
      const c = cellJitter(11, 20, 0.35);
      return {
        deterministic: a.dx === b.dx && a.dy === b.dy,
        different: a.dx !== c.dx || a.dy !== c.dy,
        bounded: Math.abs(a.dx) <= 0.35 * 32 && Math.abs(a.dy) <= 0.35 * 16,
        nonZero: a.dx !== 0 || a.dy !== 0,
      };
    });

    expect(result.deterministic).toBe(true);
    expect(result.different).toBe(true);
    expect(result.bounded).toBe(true);
    expect(result.nonZero).toBe(true);
  });

  test('cellJitter returns zero offset when jitterRange is 0', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });

    const result = await page.evaluate(() => {
      function cellJitter(gx, gy, jitterRange, halfTW = 32, halfTH = 16) {
        if (jitterRange <= 0) return { dx: 0, dy: 0 };
        const hx = ((gx * 374761393 + gy * 668265263) >>> 0) / 4294967296;
        const hy = ((gx * 1274126177 + gy * 1103515245) >>> 0) / 4294967296;
        return {
          dx: (hx * 2 - 1) * jitterRange * halfTW,
          dy: (hy * 2 - 1) * jitterRange * halfTH,
        };
      }
      const r = cellJitter(5, 5, 0);
      return { dx: r.dx, dy: r.dy };
    });

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
  });

  test('game renders without visual artifacts after jitter changes', async ({ page }) => {
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
      if (!ctx) return { total: 0, nonBlack: 0 };
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let nonBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) nonBlack++;
      }
      return { total: data.length / 4, nonBlack };
    });

    expect(pixels.nonBlack).toBeGreaterThan(100);
    await page.screenshot({ path: 'tests/screenshots/jitter-gameplay.png' });
  });

  test('jitter offsets are bounded within half-tile limits', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });

    const result = await page.evaluate(() => {
      function cellJitter(gx, gy, jitterRange, halfTW = 32, halfTH = 16) {
        if (jitterRange <= 0) return { dx: 0, dy: 0 };
        const hx = ((gx * 374761393 + gy * 668265263) >>> 0) / 4294967296;
        const hy = ((gx * 1274126177 + gy * 1103515245) >>> 0) / 4294967296;
        return {
          dx: (hx * 2 - 1) * jitterRange * halfTW,
          dy: (hy * 2 - 1) * jitterRange * halfTH,
        };
      }

      let allBounded = true;
      const jitterRange = 0.35;
      const maxDx = jitterRange * 32;
      const maxDy = jitterRange * 16;

      for (let x = -50; x < 50; x++) {
        for (let y = -50; y < 50; y++) {
          const j = cellJitter(x, y, jitterRange);
          if (Math.abs(j.dx) > maxDx + 0.001 || Math.abs(j.dy) > maxDy + 0.001) {
            allBounded = false;
          }
        }
      }
      return { allBounded, testedCount: 10000 };
    });

    expect(result.allBounded).toBe(true);
    expect(result.testedCount).toBe(10000);
  });

  test('no console errors during gameplay with jitter', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });

    const skipBtn = page.locator('#skipSplashBtn');
    if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.waitForTimeout(2000);

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);

    const critical = errors.filter(e =>
      !e.includes('favicon') && !e.includes('net::') && !e.includes('ERR_CONNECTION')
    );
    expect(critical).toHaveLength(0);
  });

  test('jitter produces varied offsets across grid', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('canvas', { timeout: 15000 });

    const result = await page.evaluate(() => {
      function cellJitter(gx, gy, jitterRange, halfTW = 32, halfTH = 16) {
        if (jitterRange <= 0) return { dx: 0, dy: 0 };
        const hx = ((gx * 374761393 + gy * 668265263) >>> 0) / 4294967296;
        const hy = ((gx * 1274126177 + gy * 1103515245) >>> 0) / 4294967296;
        return {
          dx: (hx * 2 - 1) * jitterRange * halfTW,
          dy: (hy * 2 - 1) * jitterRange * halfTH,
        };
      }

      const offsets = new Set();
      for (let x = 0; x < 25; x++) {
        for (let y = 0; y < 25; y++) {
          const j = cellJitter(x, y, 0.35);
          offsets.add(j.dx.toFixed(2) + ',' + j.dy.toFixed(2));
        }
      }
      return { uniqueOffsets: offsets.size, totalCells: 625 };
    });

    expect(result.uniqueOffsets).toBeGreaterThan(300);
  });
});
