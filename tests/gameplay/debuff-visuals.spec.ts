/**
 * debuff-visuals.spec.ts - E2E tests for visual debuff effects (#110).
 * Tests: dehydration blur overlay, fly particles, cleanliness speed penalty.
 * TODO: DOC - debuff visuals test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: import('@playwright/test').Page) {
  // Use ?test=1 for deterministic fresh state (bare URL restores the
  // developer's real save in non-test mode → flaky test isolation).
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  // Poll for debug surface instead of fixed sleep (avoids boot-race flakiness).
  await page.waitForFunction(() => !!(window as any).__gameDebug, { timeout: 20000 });
}

test.describe('Visual Debuff Effects (#110)', () => {

  test('dehydration blur overlay exists in DOM', async ({ page }) => {
    await waitForGame(page);
    const exists = await page.evaluate(() => !!document.getElementById('dehydrationBlur'));
    expect(exists).toBe(true);
  });

  test('blur overlay activates when hydration critically low', async ({ page }) => {
    await waitForGame(page);

    // Set hydration to critical
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.hydration = 10;
    });

    // Wait for a few frames so blur updates
    await page.waitForTimeout(500);

    // Trigger render frame update via getDebuffVisuals
    const visuals = await page.evaluate(() => {
      return (window as any).__gameDebug.getDebuffVisuals();
    });

    expect(visuals.blurStrength).toBeGreaterThan(0);
  });

  test('blur overlay hidden when hydration normal', async ({ page }) => {
    await waitForGame(page);

    const blurDisplay = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.hydration = 80;
      const el = document.getElementById('dehydrationBlur');
      return el?.style.display;
    });

    // Should be hidden (display:none)
    expect(blurDisplay).toBe('none');
  });

  test('fly particles appear when cleanliness critically low', async ({ page }) => {
    await waitForGame(page);

    // Set cleanliness to critical
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.cleanliness = 5;
    });

    // Wait for render loop to kick in
    await page.waitForTimeout(500);

    const visuals = await page.evaluate(() => {
      return (window as any).__gameDebug.getDebuffVisuals();
    });

    expect(visuals.flyCount).toBeGreaterThan(0);
    expect(visuals.flyTargetCount).toBe(5); // MAX_FLIES
  });

  test('fly count scales with cleanliness level', async ({ page }) => {
    await waitForGame(page);

    // Low but not critical
    await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.cleanliness = 25;
    });

    await page.waitForTimeout(500);

    const visuals = await page.evaluate(() => {
      return (window as any).__gameDebug.getDebuffVisuals();
    });

    // Should have some flies, but not max
    expect(visuals.flyCount).toBeGreaterThan(0);
    expect(visuals.flyCount).toBeLessThan(5);
  });

  test('no flies when cleanliness is normal', async ({ page }) => {
    await waitForGame(page);

    const visuals = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.cleanliness = 80;
      return dbg.getDebuffVisuals();
    });

    expect(visuals.flyCount).toBe(0);
    expect(visuals.flyTargetCount).toBe(0);
  });

  test('cleanliness debuff now includes speed penalty', async ({ page }) => {
    await waitForGame(page);

    const debuffs = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Set all stats normal except cleanliness
      dbg.state.status.energy = 100;
      dbg.state.status.hydration = 100;
      dbg.state.status.cleanliness = 10; // critically low
      return dbg.getDebuffs();
    });

    expect(debuffs.speedMult).toBeLessThan(1.0);
    expect(debuffs.speedMult).toBeCloseTo(0.8, 1); // 0.8x for very dirty
    expect(debuffs.activeDebuffs.some((d: string) => d.includes('Very Dirty'))).toBe(true);
  });

  test('dirty (not critical) gives 0.9x speed penalty', async ({ page }) => {
    await waitForGame(page);

    const debuffs = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.energy = 100;
      dbg.state.status.hydration = 100;
      dbg.state.status.cleanliness = 25; // low but not critical
      return dbg.getDebuffs();
    });

    expect(debuffs.speedMult).toBeCloseTo(0.9, 1);
    expect(debuffs.activeDebuffs.some((d: string) => d.includes('Dirty'))).toBe(true);
  });

  test('combined debuffs stack multiplicatively', async ({ page }) => {
    await waitForGame(page);

    const debuffs = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      dbg.state.status.energy = 10;       // critical: 0.7x
      dbg.state.status.hydration = 10;    // critical: 0.7x
      dbg.state.status.cleanliness = 10;  // critical: 0.8x
      return dbg.getDebuffs();
    });

    // 0.7 * 0.7 * 0.8 = 0.392
    expect(debuffs.speedMult).toBeCloseTo(0.392, 2);
    expect(debuffs.activeDebuffs.length).toBe(3);
  });

  test('debuff visuals debug hook is accessible', async ({ page }) => {
    await waitForGame(page);

    const visuals = await page.evaluate(() => {
      return (window as any).__gameDebug.getDebuffVisuals();
    });

    expect(visuals).toHaveProperty('blurStrength');
    expect(visuals).toHaveProperty('flyCount');
    expect(visuals).toHaveProperty('flyTargetCount');
  });
});
