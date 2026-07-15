/**
 * v1-surface-coherence.spec.ts — Iso 2.0 visual V1 proof (2026-07-15)
 *
 * Biome surface language: meadow/forest must not salt isolated sand cells,
 * and dirt should appear as patches (not single-cell checkerboard noise).
 *
 * See memories/repo/iso2-visual-technology-inventory-and-deferred-plan.md Track V1.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

const FIXED_WORDLIST = [
  'alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta',
  'iota kappa', 'lambda mu', 'nu xi', 'omicron pi',
];
const BIOME_SEED = 42;

type SurfaceReport = {
  cx: number;
  cy: number;
  biome: string;
  sand: number;
  /** sand with zero same-type 4-neighbors (true salt) */
  sandSalt: number;
  /** dirt with zero same-type 4-neighbors (true salt) */
  dirtSalt: number;
  dirt: number;
  grass: number;
};

test('V1: meadow chunks have no sand salt and few isolated dirt cells', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  const report = await page.evaluate(
    ([wordlist, biomeSeed]: [string[], number]) => {
      // @ts-expect-error Vite dynamic import
      return import('/engine/gen.ts').then((gen: any) => {
        gen.setWordlist(wordlist);
        gen.setBiomeNoiseSeed(biomeSeed);
        gen.restoreEntropyBuffer('');

        const coords: Array<[number, number]> = [
          [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [2, 0], [0, 2],
        ];
        const rows: SurfaceReport[] = [];

        for (const [cx, cy] of coords) {
          const c = gen.generateChunkSync(cx, cy);
          const size = c.cells.length;
          let sand = 0;
          let dirt = 0;
          let grass = 0;
          let sandSalt = 0;
          let dirtSalt = 0;
          const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const key = c.cells[y][x].assetKey;
              if (key === 'sand') sand++;
              if (key === 'dirt') dirt++;
              if (key === 'grass') grass++;

              if (key !== 'sand' && key !== 'dirt') continue;
              let same = 0;
              for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
                if (c.cells[ny][nx].assetKey === key) same++;
              }
              if (same === 0) {
                if (key === 'sand') sandSalt++;
                else dirtSalt++;
              }
            }
          }

          rows.push({
            cx, cy, biome: c.biomeName, sand, sandSalt, dirtSalt, dirt, grass,
          });
        }
        return rows;
      });
    },
    [FIXED_WORDLIST, BIOME_SEED] as [string[], number],
  );

  console.log('V1 surface report:', JSON.stringify(report));

  for (const row of report) {
    // Meadow is the early-game surface language target (chunkDist forces meadow near origin)
    if (row.biome === 'meadow') {
      // True salt = zero same-type neighbors. Shore sand next to water may remain
      // as a single cell; allow a tiny residual (water-adjacent preserved by cohere).
      expect(
        row.sandSalt,
        `meadow (${row.cx},${row.cy}): true sand salt must be ~0 (total sand=${row.sand})`,
      ).toBeLessThanOrEqual(6);

      // Path tips / gate flanks can leave a few 0-neighbor dirt cells; cap tightly.
      expect(
        row.dirtSalt,
        `meadow (${row.cx},${row.cy}): true dirt salt must be low after cohere`,
      ).toBeLessThanOrEqual(12);

      // Grass should dominate meadow open ground
      expect(row.grass, `meadow (${row.cx},${row.cy}) grass-dominant`).toBeGreaterThan(row.dirt);
    }
  }
});
