/**
 * gen-determinism.spec.ts — Determinism safety-net for the gen.ts decomposition (#253 / EPIC #247).
 *
 * Guards the B3 world-gen extraction: `generateChunkSync` MUST produce byte-identical
 * output for fixed inputs (wordlist + biome-noise seed + empty entropy). Any drift while
 * moving phases out of `gen.ts` into `engine/world/*` fails this test.
 *
 * Technique: Vite dev-server serves source modules by URL (root = src/), so we
 * `import('/engine/gen.ts')` directly in the page and drive the generator with fixed
 * inputs — isolating gen.ts from startup variance (the scrambled wordlist re-seeds per load).
 *
 * Golden captured 2026-06-11 after fixing the Math.random() obstacle non-determinism (#265).
 * If you intentionally change generation output, re-capture GOLDEN_HASH (see updateGolden note).
 *
 * Run: npx playwright test tests/world-gen/gen-determinism.spec.ts --reporter=line
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

// Fixed inputs — keep in sync with the in-page generator call below.
const FIXED_WORDLIST = ['alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta', 'iota kappa', 'lambda mu', 'nu xi', 'omicron pi'];
const BIOME_SEED = 42;
const GOLDEN_HASH = '78172eec';

/** Canonical hash of generated chunks (-1..1, 0..2) for fixed inputs. Runs in the browser. */
const HASH_FN = ([wordlist, biomeSeed]: [string[], number]) => {
  // @ts-expect-error — dynamic import of Vite-served source module (root = src/)
  return import('/engine/gen.ts').then((gen: any) => {
    gen.setWordlist(wordlist);
    gen.setBiomeNoiseSeed(biomeSeed);
    gen.restoreEntropyBuffer('');
    const parts: string[] = [];
    for (let cy = 0; cy <= 2; cy++) {
      for (let cx = -1; cx <= 1; cx++) {
        const c = gen.generateChunkSync(cx, cy);
        let d = '';
        for (let r = 0; r < c.cells.length; r++) {
          for (let q = 0; q < c.cells[r].length; q++) {
            const cell = c.cells[r][q];
            d += `${cell.assetKey}|${cell.walkable ? 1 : 0}${cell.interactable ? 1 : 0}|${cell.npcId || ''}|${cell.itemId || ''};`;
          }
        }
        parts.push(`${cx},${cy}#${c.biomeId},${c.biomeName},${c.seed}::${d}`);
      }
    }
    const canonical = parts.join('\n');
    let h = 0x811c9dc5;
    for (let i = 0; i < canonical.length; i++) { h ^= canonical.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  });
};

test.describe('World-gen determinism (#253 / #265)', () => {
  test('generateChunkSync is deterministic and matches golden for fixed inputs', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    // Let the module graph settle.
    await page.waitForTimeout(500);

    const hashA = await page.evaluate(HASH_FN, [FIXED_WORDLIST, BIOME_SEED] as [string[], number]);
    const hashB = await page.evaluate(HASH_FN, [FIXED_WORDLIST, BIOME_SEED] as [string[], number]);

    // 1. Repeatable within a load (no per-call state leak).
    expect(hashA).toBe(hashB);
    // 2. Matches the recorded golden (catches any drift from the gen.ts split).
    expect(hashA).toBe(GOLDEN_HASH);
  });
});
