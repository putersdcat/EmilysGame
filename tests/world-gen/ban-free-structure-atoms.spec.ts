/**
 * ban-free-structure-atoms.spec.ts — Scene-first PR2 + PR5
 *
 * Free structure atoms (outhouse / fence pens / wall stubs via WU templates;
 * house/hut as Perlin obstacles) must not appear in early meadow/forest
 * generation weights. Buildings come from modular scene stamps + starter
 * homestead only. Terrain / path / river / lake templates stay weighted.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

/** Structure/enclosure WU templates demoted in meadow (PR5). */
const MEADOW_STRUCTURE_TEMPLATES = [
  'fence_enclosure',
  'wall_gate',
  'wall_segment',
  'wall_corner',
  'wall_end',
  'wall_bastion',
  'wall_corner_capped',
  'fenced_yard',
  'fenced_garden',
  'fence_row',
  'market_square',
  'homestead_compound',
  'seller_cart_yard',
  'inn_compound',
  'outhouse_clearing',
] as const;

/** Structure/enclosure WU templates demoted in forest (PR5). */
const FOREST_STRUCTURE_TEMPLATES = [
  'fence_enclosure',
  'wall_segment',
  'wall_gate',
  'wall_bastion',
  'wall_corner_capped',
  'fenced_yard',
  'fenced_garden',
  'fence_row',
  'homestead_compound',
  'seller_cart_yard',
  'inn_compound',
  'outhouse_clearing',
] as const;

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test.describe('Ban free structure atoms (scene-first PR2 + PR5)', () => {
  test('meadow/forest structure-bearing WU template weights are 0', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(async ([meadowKeys, forestKeys]) => {
      const tiles = await import('/config/tiles.config.ts');
      const meadow: Record<string, number> = {};
      const forest: Record<string, number> = {};
      for (const k of meadowKeys) meadow[k] = tiles.BIOME_TEMPLATE_WEIGHTS.meadow[k] ?? -1;
      for (const k of forestKeys) forest[k] = tiles.BIOME_TEMPLATE_WEIGHTS.forest[k] ?? -1;
      return { meadow, forest };
    }, [MEADOW_STRUCTURE_TEMPLATES as unknown as string[], FOREST_STRUCTURE_TEMPLATES as unknown as string[]]);

    for (const k of MEADOW_STRUCTURE_TEMPLATES) {
      expect(result.meadow[k], `meadow.${k}`).toBe(0);
    }
    for (const k of FOREST_STRUCTURE_TEMPLATES) {
      expect(result.forest[k], `forest.${k}`).toBe(0);
    }
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

  test('buildBiomeCandidatePool hard-skips structure WU templates for meadow', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(async (banned: string[]) => {
      const tiles = await import('/config/tiles.config.ts');
      const wus = await import('/engine/world/WorldUnitSolver.ts');
      const rotations: Map<string, any[]> = tiles.getAllRotations();

      if (!rotations || !wus.buildBiomeCandidatePool) {
        return { ok: false, reason: 'missing helpers', count: 0, bannedInPool: banned };
      }

      const pool = wus.buildBiomeCandidatePool({ name: 'meadow' }, rotations);
      const poolNames = new Set(pool.map((c: any) => c.template?.baseName ?? ''));
      const bannedInPool = banned.filter((n) => poolNames.has(n));
      return {
        ok: true,
        bannedInPool,
        hasPath: poolNames.has('dirt_path_ns') || poolNames.has('meadow_base'),
        sample: [...poolNames].slice(0, 12),
        count: pool.length,
      };
    }, MEADOW_STRUCTURE_TEMPLATES as unknown as string[]);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.bannedInPool, JSON.stringify(result)).toEqual([]);
    expect(result.hasPath).toBe(true);
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
