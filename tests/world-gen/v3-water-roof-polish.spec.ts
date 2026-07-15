/**
 * v3-water-roof-polish.spec.ts — Iso 2.0 visual V3 partial proof (2026-07-15)
 *
 * - No free-floating roof shard cells in generated chunks
 * - No true orphan water salt (0 same-type neighbors)
 * - Cave biome Perlin weights no longer include water (tank salt source)
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';
const FIXED_WORDLIST = [
  'alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta',
  'iota kappa', 'lambda mu', 'nu xi', 'omicron pi',
];
const BIOME_SEED = 42;

const ROOF_SHARDS = [
  'starter_roof_left', 'starter_roof_right', 'starter_roof_ridge',
  'roof_thatch_slope_left', 'roof_thatch_slope_right', 'roof_thatch_ridge',
];

test('V3: biome weights have no water salt in cave Perlin terrain', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const cave = await page.evaluate(async () => {
    const { getBiome } = await import('/config/biomes.config.ts');
    return getBiome(2).terrainWeights;
  });

  expect(cave.water ?? 0, 'cave must not Perlin-place water tanks').toBe(0);
  expect(cave.stone_floor, 'cave still stone-dominant').toBeGreaterThan(0.5);
});

test('V3: generated sample has no roof shards and no orphan water', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  const report = await page.evaluate(
    ([wordlist, biomeSeed, roofs]: [string[], number, string[]]) => {
      // @ts-expect-error Vite dynamic import
      return import('/engine/gen.ts').then((gen: any) => {
        gen.setWordlist(wordlist);
        gen.setBiomeNoiseSeed(biomeSeed);
        gen.restoreEntropyBuffer('');
        const roofSet = new Set(roofs);
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
        const coords: Array<[number, number]> = [
          [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [2, 0], [0, 2], [2, 2], [-2, 1],
        ];
        let roofCount = 0;
        let waterOrphans = 0;
        let waterTotal = 0;
        for (const [cx, cy] of coords) {
          const c = gen.generateChunkSync(cx, cy);
          const size = c.cells.length;
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const key = c.cells[y][x].assetKey;
              if (roofSet.has(key)) roofCount++;
              if (key !== 'water') continue;
              waterTotal++;
              let same = 0;
              for (const [dx, dy] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                if (c.cells[ny][nx].assetKey === 'water') same++;
              }
              if (same === 0) waterOrphans++;
            }
          }
        }
        return { roofCount, waterOrphans, waterTotal };
      });
    },
    [FIXED_WORDLIST, BIOME_SEED, ROOF_SHARDS] as [string[], number, string[]],
  );

  console.log('V3 water/roof report:', JSON.stringify(report));
  expect(report.roofCount, 'roofs are assembly-only (no free shards)').toBe(0);
  expect(report.waterOrphans, 'no lone water salt cells').toBe(0);
});
