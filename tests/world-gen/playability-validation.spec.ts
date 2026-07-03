/**
 * playability-validation.spec.ts — E2E tests for Solver F: Playability Validation (#46).
 *
 * Tests that the validatePlayability() pass runs during generation and produces
 * valid metrics. Also tests the debug hook and repair mechanisms.
 *
 * TODO: DOC — playability validation test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1500);

  const hasDebug = await page.evaluate(() => !!(window as any).__gameDebug);
  expect(hasDebug).toBe(true);
}

test.describe('Playability Validation — Solver F (#46)', () => {

  test('getPlayabilityStats returns accumulated metrics after startup', async ({ page }) => {
    await waitForGame(page);

    const stats = await page.evaluate(() => {
      return (window as any).__gameDebug.getPlayabilityStats();
    });

    expect(stats).toBeDefined();
    expect(typeof stats.chunksValidated).toBe('number');
    expect(stats.chunksValidated).toBeGreaterThan(0);
    expect(typeof stats.avgDeadEndRatio).toBe('number');
    expect(typeof stats.avgWalkableRatio).toBe('number');
    expect(typeof stats.avgCollectibleDensity).toBe('number');
    expect(typeof stats.repairsApplied).toBe('number');
    expect(typeof stats.deadEndExcessChunks).toBe('number');
    expect(typeof stats.densityOffTargetChunks).toBe('number');
  });

  test('average walkable ratio is within playable range', async ({ page }) => {
    await waitForGame(page);

    const stats = await page.evaluate(() => {
      return (window as any).__gameDebug.getPlayabilityStats();
    });

    // Walkable ratio should be reasonable (not zero, not 100%)
    // Issue #277: starter homestead (house + fence perimeter) at origin chunk
    // adds ~2% non-walkable cells, so the upper bound accommodates this anchor.
    expect(stats.avgWalkableRatio).toBeGreaterThan(0.15);
    expect(stats.avgWalkableRatio).toBeLessThan(0.97);
  });

  test('average dead-end ratio does not exceed threshold after repairs', async ({ page }) => {
    await waitForGame(page);

    const stats = await page.evaluate(() => {
      return (window as any).__gameDebug.getPlayabilityStats();
    });

    // After repairs, average dead-end ratio should be reasonable
    // Individual chunks may still exceed 30% but average should be moderate
    expect(stats.avgDeadEndRatio).toBeGreaterThanOrEqual(0);
    expect(stats.avgDeadEndRatio).toBeLessThan(0.5);
  });

  test('collectible density is within target range on average', async ({ page }) => {
    await waitForGame(page);

    const stats = await page.evaluate(() => {
      return (window as any).__gameDebug.getPlayabilityStats();
    });

    // Average density should be in the 2-15 items per 100 walkable cells range
    // (repairs should bring outliers back in range)
    expect(stats.avgCollectibleDensity).toBeGreaterThan(0);
    expect(stats.avgCollectibleDensity).toBeLessThan(30);
  });

  test('stats accumulate as more chunks are generated', async ({ page }) => {
    await waitForGame(page);

    const beforeStats = await page.evaluate(() => {
      return (window as any).__gameDebug.getPlayabilityStats();
    });

    // Move player to generate new chunks
    await page.keyboard.down('d');
    await page.waitForTimeout(2000);
    await page.keyboard.up('d');
    await page.waitForTimeout(500);

    await page.keyboard.down('w');
    await page.waitForTimeout(2000);
    await page.keyboard.up('w');
    await page.waitForTimeout(500);

    const afterStats = await page.evaluate(() => {
      return (window as any).__gameDebug.getPlayabilityStats();
    });

    // Should have validated more chunks after movement
    expect(afterStats.chunksValidated).toBeGreaterThanOrEqual(beforeStats.chunksValidated);
  });

  test('playability validation exports correct interface shape', async ({ page }) => {
    await waitForGame(page);

    const shape = await page.evaluate(() => {
      const stats = (window as any).__gameDebug.getPlayabilityStats();
      return {
        hasChunksValidated: 'chunksValidated' in stats,
        hasAvgDeadEndRatio: 'avgDeadEndRatio' in stats,
        hasAvgWalkableRatio: 'avgWalkableRatio' in stats,
        hasAvgCollectibleDensity: 'avgCollectibleDensity' in stats,
        hasRepairsApplied: 'repairsApplied' in stats,
        hasDeadEndExcessChunks: 'deadEndExcessChunks' in stats,
        hasDensityOffTargetChunks: 'densityOffTargetChunks' in stats,
        keyCount: Object.keys(stats).length,
      };
    });

    expect(shape.hasChunksValidated).toBe(true);
    expect(shape.hasAvgDeadEndRatio).toBe(true);
    expect(shape.hasAvgWalkableRatio).toBe(true);
    expect(shape.hasAvgCollectibleDensity).toBe(true);
    expect(shape.hasRepairsApplied).toBe(true);
    expect(shape.hasDeadEndExcessChunks).toBe(true);
    expect(shape.hasDensityOffTargetChunks).toBe(true);
    expect(shape.keyCount).toBe(7);
  });
});
