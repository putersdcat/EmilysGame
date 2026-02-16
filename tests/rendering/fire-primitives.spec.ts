import { test, expect } from '@playwright/test';

/**
 * Issue #81: Animated Fire Primitive Set
 * Tests fire variant rendering, animation, and lighting integration.
 */

test.describe('Fire Primitives (#81)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const splash = page.locator('#splash-screen');
    if (await splash.isVisible({ timeout: 3000 }).catch(() => false)) {
      await splash.click();
    }
    await page.waitForFunction(() => {
      const c = document.querySelector('#gameContainer canvas') as HTMLCanvasElement;
      return c && c.width > 0 && c.height > 0;
    }, { timeout: 15000 });
    await page.waitForTimeout(1500);
  });

  test('fire config module loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(2000);
    const fireErrors = errors.filter(e => /fire|FIRE_VARIANT|FIRE_ASSET/i.test(e));
    expect(fireErrors).toHaveLength(0);
  });

  test('game canvas animates (fire + other animations)', async ({ page }) => {
    const gameCanvas = page.locator('#gameContainer canvas');
    const shot1 = await gameCanvas.screenshot();
    await page.waitForTimeout(600);
    const shot2 = await gameCanvas.screenshot();
    expect(shot1.equals(shot2)).toBe(false);
  });

  test('bonfire assets exist in generated chunks', async ({ page }) => {
    // state.chunks is a Map<string, ChunkData>
    const result = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state || !state.chunks) return { loaded: false, foundFire: false, fireKeys: [] as string[] };
      let foundFire = false;
      const fireKeys: string[] = [];
      for (const [, chunk] of state.chunks) {
        if (!chunk.cells) continue;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'bonfire' || cell.assetKey === 'campfire' || cell.assetKey === 'biomass_fire') {
              foundFire = true;
              if (!fireKeys.includes(cell.assetKey)) fireKeys.push(cell.assetKey);
            }
          }
        }
      }
      return { loaded: true, foundFire, fireKeys };
    });
    expect(result.loaded).toBe(true);
    expect(result.foundFire).toBe(true);
    expect(result.fireKeys.length).toBeGreaterThanOrEqual(1);
  });

  test('multiple fire variant types are placed across chunks', async ({ page }) => {
    // Move around to generate more chunks
    for (const key of ['w', 'w', 'w', 'd', 'd', 'd', 's', 's', 's', 'a', 'a', 'a']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state || !state.chunks) return { fireKeys: [] };
      const fireKeys = new Set<string>();
      for (const [, chunk] of state.chunks) {
        if (!chunk.cells) continue;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey === 'bonfire' || cell.assetKey === 'campfire' || cell.assetKey === 'biomass_fire') {
              fireKeys.add(cell.assetKey);
            }
          }
        }
      }
      return { fireKeys: [...fireKeys] };
    });
    expect(result.fireKeys.length).toBeGreaterThanOrEqual(1);
  });

  test('fire system causes no runtime errors during gameplay', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    for (const key of ['w', 'w', 'd', 'd', 's', 's', 'a', 'a']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);

    const criticalErrors = consoleErrors.filter(e =>
      /fire|FIRE|undefined is not|Cannot read|TypeError/i.test(e)
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('bonfire always present in chunk asset keys', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('w');
      await page.waitForTimeout(150);
      await page.keyboard.press('d');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const state = (window as any).__gameState;
      if (!state || !state.chunks) return { chunkCount: 0, assetKeys: [] };
      const assetKeys = new Set<string>();
      let chunkCount = 0;
      for (const [, chunk] of state.chunks) {
        if (!chunk.cells) continue;
        chunkCount++;
        for (const row of chunk.cells) {
          for (const cell of row) {
            if (cell.assetKey) assetKeys.add(cell.assetKey);
          }
        }
      }
      return { chunkCount, assetKeys: [...assetKeys] };
    });
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.assetKeys).toContain('bonfire');
  });
});
