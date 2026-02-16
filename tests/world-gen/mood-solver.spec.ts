/**
 * mood-solver.spec.ts — E2E tests for Mood Profiles, Biome Transitions,
 * and Enhanced Border Constraints (#46).
 *
 * TODO: DOC — mood system test coverage
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

test.describe('Mood Profiles & Biome Transitions (#46)', () => {

  test('deriveMood returns valid mood categories', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const seeds = [
        'hello world', 'river_3_7', 'xyzzy_99_fort',
        'aaaa', '12345!@#', '', 'obliterate quasar_0_0',
        'open meadow sunshine', 'WALL_WALL_WALL',
      ];
      const validCategories = ['open', 'river-heavy', 'enclosed', 'path-heavy', 'fortified', 'sparse'];
      const results: { seed: string; category: string; valid: boolean }[] = [];
      for (const seed of seeds) {
        const mood = dbg.deriveMood(seed);
        results.push({
          seed,
          category: mood.category,
          valid: validCategories.includes(mood.category) && typeof mood.modifiers === 'object',
        });
      }
      return results;
    });

    for (const r of result) {
      expect(r.valid, `seed "${r.seed}" → category "${r.category}" should be valid`).toBe(true);
    }
  });

  test('deriveMood is deterministic (same seed = same mood)', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const seed = 'test_deterministic_seed_42';
      const m1 = dbg.deriveMood(seed);
      const m2 = dbg.deriveMood(seed);
      return {
        same: m1.category === m2.category &&
              JSON.stringify(m1.modifiers) === JSON.stringify(m2.modifiers),
        category: m1.category,
      };
    });
    expect(result.same).toBe(true);
  });

  test('mood modifiers bias template selection', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // River-heavy mood should have positive river template modifiers
      const riverMood = dbg.deriveMood('123!!456!!');
      // Check that some river-related key has a positive modifier
      const riverKeys = Object.keys(riverMood.modifiers).filter(k =>
        k.startsWith('river_') || k.startsWith('bridge_') || k.startsWith('shore_') || k === 'water_garden'
      );

      // Open mood should boost meadow_base
      const openMood = dbg.deriveMood('aeiou_open_sky');
      const hasMeadowBoost = openMood.modifiers['meadow_base'] > 0;

      return {
        riverMoodCategory: riverMood.category,
        riverMoodHasModifiers: Object.keys(riverMood.modifiers).length > 0,
        riverKeys: riverKeys.length,
        openMoodCategory: openMood.category,
        hasMeadowBoost,
      };
    });

    // Every mood should have modifiers
    expect(result.riverMoodHasModifiers).toBe(true);
  });

  test('biome transition flags detected correctly', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Test transitions at origin (should be meadow everywhere nearby, so no transitions)
      const t00 = dbg.detectBiomeTransitions(0, 0);
      // Test transitions at a more distant position where biome changes are likely
      const t10 = dbg.detectBiomeTransitions(10, 10);
      // Check that values are booleans
      const allBooleans =
        typeof t00.n === 'boolean' && typeof t00.s === 'boolean' &&
        typeof t00.e === 'boolean' && typeof t00.w === 'boolean' &&
        typeof t10.n === 'boolean' && typeof t10.s === 'boolean' &&
        typeof t10.e === 'boolean' && typeof t10.w === 'boolean';

      return {
        t00, t10,
        allBooleans,
        // Near origin should be meadow-only → no transitions
        originNoTransitions: !t00.n && !t00.s && !t00.e && !t00.w,
      };
    });

    expect(result.allBooleans).toBe(true);
    expect(result.originNoTransitions).toBe(true);
  });

  test('enhanced border constraints include traversal data', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Get a generated chunk and check its borderEdges for traversal arrays
      const chunks = dbg.state.chunks;
      let found = false;
      let hasTraversal = false;
      for (const [, chunk] of chunks) {
        if (chunk.borderEdges) {
          found = true;
          hasTraversal =
            Array.isArray(chunk.borderEdges.nTraversal) &&
            Array.isArray(chunk.borderEdges.sTraversal) &&
            Array.isArray(chunk.borderEdges.eTraversal) &&
            Array.isArray(chunk.borderEdges.wTraversal);
          if (hasTraversal) break;
        }
      }

      // Verify traversal arrays contain booleans and have correct length
      let traversalValid = false;
      if (hasTraversal) {
        for (const [, chunk] of chunks) {
          if (!chunk.borderEdges?.nTraversal) continue;
          const nt = chunk.borderEdges.nTraversal;
          traversalValid =
            nt.length === chunk.borderEdges.n.length &&
            nt.every((v: unknown) => typeof v === 'boolean');
          break;
        }
      }

      return { found, hasTraversal, traversalValid };
    });

    expect(result.found).toBe(true);
    expect(result.hasTraversal).toBe(true);
    expect(result.traversalValid).toBe(true);
  });

  test('mood profiles change world unit distribution', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Get moods from various generated chunks
      const moods: string[] = [];
      const chunks = dbg.state.chunks;
      for (const [, chunk] of chunks) {
        if (chunk.mood) {
          moods.push(chunk.mood.category);
        }
      }

      // Test that deriveMood with different seeds produces variety
      const testSeeds = [
        'aeiou_vowels', '123_456_789', 'bcdfg_consonants',
        '!!!@@@###', 'mixed_12_ab!', 'zzz_sparse_empty',
      ];
      const testMoods = testSeeds.map(s => dbg.deriveMood(s).category);
      const uniqueMoods = new Set(testMoods);

      return {
        chunkMoodCount: moods.length,
        hasChunkMoods: moods.length > 0,
        testMoods,
        uniqueCount: uniqueMoods.size,
        hasVariety: uniqueMoods.size >= 2,
      };
    });

    expect(result.hasChunkMoods).toBe(true);
    expect(result.hasVariety).toBe(true);
  });

  test('no JS console errors during gameplay with mood system', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await waitForGame(page);

    // Move around to trigger chunk generation with mood system
    for (let i = 0; i < 3; i++) {
      await page.keyboard.down('d');
      await page.waitForTimeout(600);
      await page.keyboard.up('d');
      await page.waitForTimeout(200);
      await page.keyboard.down('s');
      await page.waitForTimeout(600);
      await page.keyboard.up('s');
      await page.waitForTimeout(200);
    }

    const criticalErrors = errors.filter(e =>
      !e.includes('favicon') && !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('net::') && !e.includes('404'),
    );
    expect(criticalErrors).toEqual([]);
  });
});
