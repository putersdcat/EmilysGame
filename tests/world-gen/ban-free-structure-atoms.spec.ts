/**
 * ban-free-structure-atoms.spec.ts — Scene-first PR2
 *
 * Free structure atoms (outhouse via WU templates; house/hut as Perlin
 * obstacles) must not appear in early meadow generation weights. Buildings
 * come from modular scene stamps + starter homestead only.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('Ban free structure atoms (scene-first PR2)', () => {
  test('meadow BIOME_TEMPLATE_WEIGHTS has outhouse_clearing weight 0', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(async () => {
      const tiles = await import('/config/tiles.config.ts');
      return {
        meadow: tiles.BIOME_TEMPLATE_WEIGHTS.meadow.outhouse_clearing,
        forest: tiles.BIOME_TEMPLATE_WEIGHTS.forest.outhouse_clearing,
      };
    });
    expect(result.meadow).toBe(0);
    expect(result.forest).toBe(0);
  });

  test('meadow obstacleWeights exclude free house/hut buildings', async ({ page }) => {
    await waitForGame(page);
    const weights = await page.evaluate(async () => {
      const biomes = await import('/config/biomes.config.ts');
      const meadow = biomes.BIOME_DEFS.find((b: any) => b.name === 'meadow');
      return meadow.obstacleWeights as Record<string, number>;
    });
    expect(weights.house ?? 0).toBe(0);
    expect(weights.hut ?? 0).toBe(0);
    expect(weights.outhouse ?? 0).toBe(0);
    // Non-building obstacles and shops remain.
    expect(weights.rock).toBeGreaterThan(0);
    expect(weights.quiz_gate).toBeGreaterThan(0);
  });

  test('buildBiomeCandidatePool hard-skips outhouse_clearing for meadow', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(async () => {
      const tiles = await import('/config/tiles.config.ts');
      const wus = await import('/engine/world/WorldUnitSolver.ts');
      const rotations: Map<string, any[]> = tiles.getAllRotations();

      if (!rotations || !wus.buildBiomeCandidatePool) {
        return { ok: false, reason: 'missing helpers', count: 0, hasOuthouse: true };
      }

      const pool = wus.buildBiomeCandidatePool({ name: 'meadow' }, rotations);
      const poolNames = pool.map((c: any) => c.template?.baseName ?? '');
      return {
        ok: true,
        hasOuthouse: poolNames.includes('outhouse_clearing'),
        sample: [...new Set(poolNames)].slice(0, 8),
        count: poolNames.length,
      };
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.hasOuthouse).toBe(false);
    expect(result.count).toBeGreaterThan(0);
  });

  test('origin chunk keeps starter homestead cottage (not free scatter)', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(async () => {
      const gen = await import('/engine/gen.ts');
      gen.setWordlist(['alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta']);
      gen.setBiomeNoiseSeed(42);
      gen.restoreEntropyBuffer('');
      const chunk = gen.generateChunkSync(0, 0);
      let starter = 0;
      let fence = 0;
      let quizGate = 0;
      for (const row of chunk.cells) {
        for (const cell of row) {
          if (cell.assetKey === 'starter_cottage') starter++;
          if (cell.assetKey === 'fence') fence++;
          if (cell.assetKey === 'quiz_gate') quizGate++;
        }
      }
      return { starter, fence, quizGate };
    });

    // Starter homestead stamp must remain intact after free-structure ban.
    expect(result.starter).toBeGreaterThanOrEqual(1);
    expect(result.fence).toBeGreaterThan(0);
    expect(result.quizGate).toBeGreaterThan(0);
  });
});
