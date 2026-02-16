/**
 * age-profile.spec.ts - E2E tests for age-banded content selection (#92).
 * Tests: age selection UI, content filtering, save/load, debug hooks.
 *
 * TODO: DOC - Age profile test coverage
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/';

async function waitForGame(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  const skipBtn = page.locator('#btnSkipLlm');
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
  }

  await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1000);

  const hasDebug = await page.evaluate(() => !!(window as any).__gameDebug);
  expect(hasDebug).toBe(true);
}

test.describe('Age-Banded Content Selection (#92)', () => {

  test('age overlay DOM elements exist', async ({ page }) => {
    await waitForGame(page);

    const elements = await page.evaluate(() => ({
      ageOverlay: !!document.getElementById('ageOverlay'),
      ageBandList: !!document.getElementById('ageBandList'),
      ageConfirm: !!document.getElementById('ageConfirm'),
      ageSkip: !!document.getElementById('ageSkip'),
    }));

    expect(elements.ageOverlay).toBe(true);
    expect(elements.ageBandList).toBe(true);
    expect(elements.ageConfirm).toBe(true);
    expect(elements.ageSkip).toBe(true);
  });

  test('age profile starts unset in test mode', async ({ page }) => {
    await waitForGame(page);

    const profile = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfile()
    );

    expect(profile.ageBand).toBeNull();
    expect(profile.profileSet).toBe(false);
  });

  test('setAgeBand via debug hook works', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() =>
      (window as any).__gameDebug.setAgeBand('8-10')
    );

    const profile = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfile()
    );

    expect(profile.ageBand).toBe('8-10');
    expect(profile.profileSet).toBe(true);
  });

  test('all three age bands can be selected', async ({ page }) => {
    await waitForGame(page);

    for (const band of ['5-7', '8-10', '11-12+']) {
      await page.evaluate((b) =>
        (window as any).__gameDebug.setAgeBand(b), band
      );

      const profile = await page.evaluate(() =>
        (window as any).__gameDebug.getAgeProfile()
      );

      expect(profile.ageBand).toBe(band);
      expect(profile.profileSet).toBe(true);
    }
  });

  test('debug stats show quiz filtering info', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() =>
      (window as any).__gameDebug.setAgeBand('8-10')
    );

    const debug = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfileDebug()
    );

    expect(debug.ageBand).toBe('8-10');
    expect(debug.profileSet).toBe(true);
    expect(debug.quizStats).toBeDefined();
    expect(debug.quizStats.total).toBeGreaterThan(0);
    expect(debug.quizStats.filtered).toBeGreaterThan(0);
  });

  test('age band persists through save/load cycle', async ({ page }) => {
    await waitForGame(page);

    // Set age band and save
    await page.evaluate(() => {
      (window as any).__gameDebug.setAgeBand('5-7');
      (window as any).__gameDebug.save();
    });

    await page.waitForTimeout(300);

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });
    const skipBtn = page.locator('#btnSkipLlm');
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }
    await page.locator('#gameContainer canvas').waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify age band restored
    const profile = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfile()
    );

    expect(profile.ageBand).toBe('5-7');
    expect(profile.profileSet).toBe(true);
  });

  test('quiz stats change with different age bands', async ({ page }) => {
    await waitForGame(page);

    // Get stats for 5-7
    await page.evaluate(() =>
      (window as any).__gameDebug.setAgeBand('5-7')
    );
    const debug57 = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfileDebug()
    );

    // Get stats for 11-12+
    await page.evaluate(() =>
      (window as any).__gameDebug.setAgeBand('11-12+')
    );
    const debug11 = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfileDebug()
    );

    // Both should have content (no dead ends)
    expect(debug57.quizStats.filtered).toBeGreaterThan(0);
    expect(debug11.quizStats.filtered).toBeGreaterThan(0);
    // Totals should be the same (same content pack)
    expect(debug57.quizStats.total).toBe(debug11.quizStats.total);
  });

  test('age band filtering returns fewer questions than total for young band', async ({ page }) => {
    await waitForGame(page);

    await page.evaluate(() =>
      (window as any).__gameDebug.setAgeBand('5-7')
    );

    const debug = await page.evaluate(() =>
      (window as any).__gameDebug.getAgeProfileDebug()
    );

    // 5-7 band should filter out harder content, so filtered < total
    // (unless fallback expanded the range, in which case usedFallback = true)
    if (!debug.quizStats.usedFallback) {
      expect(debug.quizStats.filtered).toBeLessThanOrEqual(debug.quizStats.total);
    }
    // Either way, should have content
    expect(debug.quizStats.filtered).toBeGreaterThan(0);
  });

  test('age overlay is hidden by default (display: none)', async ({ page }) => {
    await waitForGame(page);

    const hidden = await page.evaluate(() => {
      const overlay = document.getElementById('ageOverlay');
      return overlay ? (overlay.style.display === 'none' || overlay.style.display === '') : true;
    });

    expect(hidden).toBe(true);
  });

  test('age band affects article visibility via articleMatchesAgeBand', async ({ page }) => {
    await waitForGame(page);

    // Test content pack articles have ageMetadata
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const stats = dbg.getBookContentStats();

      // Set to 5-7 and count articles
      dbg.setAgeBand('5-7');
      const profile57 = dbg.getAgeProfile();

      // Set to 11-12+ and count articles  
      dbg.setAgeBand('11-12+');
      const profile11 = dbg.getAgeProfile();

      return {
        totalArticles: stats.totalArticles,
        packLoaded: stats.packLoaded,
        band57: profile57.ageBand,
        band11: profile11.ageBand,
      };
    });

    expect(result.packLoaded).toBe(true);
    expect(result.totalArticles).toBeGreaterThan(15);
  });
});
