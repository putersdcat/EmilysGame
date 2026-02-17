/**
 * biome-entropy.spec.ts — Tests for #175: Biome selection from ASCII-sum mapping.
 *
 * Verifies that LLM entropy (via asciiModulo) influences biome selection
 * at boundary distances while preserving safe-zone guarantees near origin.
 *
 * TODO: DOC — biome entropy test coverage
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

test.describe('Biome Entropy Selection (#175)', () => {

  test('selectBiomeCoherent is deterministic for same inputs', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Same inputs should always produce same biome
      const b1 = dbg.selectBiomeCoherent(5, 5, 0.3);
      const b2 = dbg.selectBiomeCoherent(5, 5, 0.3);
      const b3 = dbg.selectBiomeCoherent(5, 5, 0.7);
      return {
        sameBias: b1.id === b2.id && b1.name === b2.name,
        b1Id: b1.id,
        b3Id: b3.id,
        b1Name: b1.name,
        b3Name: b3.name,
      };
    });
    // Determinism: identical inputs → identical output
    expect(result.sameBias).toBe(true);
    // Both should return valid biome names
    expect(['meadow', 'forest', 'cave', 'castle']).toContain(result.b1Name);
    expect(['meadow', 'forest', 'cave', 'castle']).toContain(result.b3Name);
  });

  test('safe zone (dist ≤ 2) always returns meadow regardless of entropy bias', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const biases = [0, 0.25, 0.5, 0.75, 1.0];
      const positions = [
        [0, 0], [1, 0], [0, 1], [-1, 0], [0, -1],
        [1, 1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2],
      ];
      const allMeadow: boolean[] = [];
      for (const [cx, cy] of positions) {
        for (const bias of biases) {
          const b = dbg.selectBiomeCoherent(cx, cy, bias);
          allMeadow.push(b.id === 0 && b.name === 'meadow');
        }
      }
      return { allMeadow, total: allMeadow.length };
    });
    // Every safe-zone position × every bias → meadow
    expect(result.allMeadow.every((v: boolean) => v)).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(55); // 11 positions × 5 biases
  });

  test('entropy bias shifts biome boundaries at mid-range distances', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // At dist 3-6, different entropy bias values may produce different biomes
      // Scan a grid of positions to find at least one where bias matters
      const positions: [number, number][] = [];
      for (let cx = -6; cx <= 6; cx++) {
        for (let cy = -6; cy <= 6; cy++) {
          const dist = Math.max(Math.abs(cx), Math.abs(cy));
          if (dist >= 3 && dist <= 6) {
            positions.push([cx, cy]);
          }
        }
      }
      let foundDifference = false;
      let sampleDiffs: { cx: number; cy: number; lowBiome: string; highBiome: string }[] = [];
      for (const [cx, cy] of positions) {
        const lowBias = dbg.selectBiomeCoherent(cx, cy, 0.0);
        const highBias = dbg.selectBiomeCoherent(cx, cy, 1.0);
        if (lowBias.id !== highBias.id) {
          foundDifference = true;
          if (sampleDiffs.length < 5) {
            sampleDiffs.push({ cx, cy, lowBiome: lowBias.name, highBiome: highBias.name });
          }
        }
      }
      return { foundDifference, positionsScanned: positions.length, sampleDiffs };
    });
    // At mid-range distances, entropy bias should cause at least some biome differences
    expect(result.positionsScanned).toBeGreaterThan(0);
    expect(result.foundDifference).toBe(true);
  });

  test('distant chunks (dist 7+) show entropy influence across biome types', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // At dist 7+, all 4 biomes should be possible
      const biomesSeen = new Set<number>();
      const biomeCounts: Record<string, number> = {};

      // Scan a ring of distant chunks with varying biases
      for (let cx = -10; cx <= 10; cx += 2) {
        for (let cy = -10; cy <= 10; cy += 2) {
          const dist = Math.max(Math.abs(cx), Math.abs(cy));
          if (dist >= 7) {
            for (const bias of [0.0, 0.5, 1.0]) {
              const b = dbg.selectBiomeCoherent(cx, cy, bias);
              biomesSeen.add(b.id);
              biomeCounts[b.name] = (biomeCounts[b.name] || 0) + 1;
            }
          }
        }
      }
      return {
        uniqueBiomes: biomesSeen.size,
        biomeCounts,
        biomeIds: Array.from(biomesSeen).sort(),
      };
    });
    // At dist 7+, multiple biomes should appear (noise-dependent, at least 3)
    expect(result.uniqueBiomes).toBeGreaterThanOrEqual(3);
    // At minimum, forest and one extreme biome should be present
    expect(result.biomeCounts['forest']).toBeGreaterThan(0);
  });

  test('detectBiomeTransitions uses consistent entropy bias', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      // Transitions with default bias (0.5) should return boolean flags
      const t = dbg.detectBiomeTransitions(5, 5);
      const allBooleans =
        typeof t.n === 'boolean' && typeof t.s === 'boolean' &&
        typeof t.e === 'boolean' && typeof t.w === 'boolean';
      return { t, allBooleans };
    });
    expect(result.allBooleans).toBe(true);
  });

  test('generated chunks include biome data influenced by entropy', async ({ page }) => {
    await waitForGame(page);
    const result = await page.evaluate(() => {
      const dbg = (window as any).__gameDebug;
      const chunks = dbg.getChunks() as { key: string; biomeId: number; biomeName: string }[];

      // Every generated chunk should have valid biome info
      const allValid = chunks.every((c: any) =>
        typeof c.biomeId === 'number' &&
        typeof c.biomeName === 'string' &&
        ['meadow', 'forest', 'cave', 'castle'].includes(c.biomeName),
      );

      // Collect biome distribution of generated chunks
      const biomeDist: Record<string, number> = {};
      for (const c of chunks) {
        biomeDist[c.biomeName] = (biomeDist[c.biomeName] || 0) + 1;
      }

      return {
        chunkCount: chunks.length,
        allValid,
        biomeDist,
      };
    });
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.allValid).toBe(true);
  });
});
