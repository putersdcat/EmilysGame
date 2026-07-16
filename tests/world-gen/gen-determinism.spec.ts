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
 * Golden captured 2026-07-07 after starter homestead hardening: origin safe-zone
 * now uses a runtime-safe assembly (stone floor, starter cottage sprite, gate,
 * campfire/sign/path) instead of a loose fence ring + single house icon (#277).
 * Unsafe roof/foundation wall nanos are deliberately excluded from normal startup
 * generation until structure assembly rendering is more stable.
 * If you intentionally change generation output, re-capture GOLDEN_HASH.
 *
 * Re-captured 2026-07-09 (061b4390 -> 839e4437) after the chain-integrity
 * fixes in WorldUnitSolver.ts/tiles.config.ts (see repo memory
 * iso2-portback-plan.md's "Phase 3b/6" section): `findTerminator` no longer
 * always uses the unrotated terminator regardless of dangling direction,
 * fixes a stale-snapshot clobber for cells with 2+ dangling directions, adds
 * corner-awareness, tries multiple candidates against real neighbor
 * compatibility, maps shore_/cave_fork to their terminator families, and
 * excludes `connectivity: 'enclosure'` templates from chain-port detection
 * entirely. All 9 golden-hash coordinates are chunkDist<=2 (forced meadow
 * biome), but meadow's WU candidate pool still includes decorative
 * river/shore features, so this is a genuine, intentional, verified content
 * change reaching the golden-hash range -- not a regression.
 *
 * Re-captured 2026-07-10 (839e4437 -> 35536566) after the #4 multi-way
 * junction terminator extension (Docs/VisionAlignmentAudit.md Finding #4,
 * see gen-chain-integrity-boundary-audit.spec.ts's header comment and repo
 * memory iso2-portback-plan.md's "#4 extension" writeup): a dangling
 * bend/T-junction/crossroads cell now gets reduced to a same-family
 * multi-way template (bend/straight/T-junction) that preserves its OTHER
 * real connections, instead of always collapsing to a single-connector
 * piece that discarded them. Same reasoning as the prior re-capture applies
 * -- meadow's candidate pool includes decorative river features reachable
 * within the golden-hash's chunkDist<=2 coordinates, so real generated
 * content legitimately changed. Full tests/world-gen/ sweep (92 tests) is
 * clean except this single, expected, sanctioned hash diff.
 *
 * Re-captured 2026-07-15 (35536566 -> 311e8f88) after V1–V3 visual composition:
 * surface language, modular assemblies, river-over-lake weights, orphan water
 * + roof-shard strip, no cave Perlin water. Intentional (Docs/13 §4).
 *
 * Re-captured 2026-07-16 (278a7e25 -> 20da3166) after scene-first PR2:
 * ban free outhouse_clearing WU weight + house/hut Perlin obstacles in early
 * meadow/forest. Structures via scenes + starter homestead only.
 *
 * Re-captured 2026-07-16 (20da3166 -> 5c5f5568) after scene-first PR5:
 * demote structure/enclosure WU templates in meadow/forest (fence pens,
 * wall stubs, homestead/seller/inn compounds, fence_row) to weight 0 so
 * only terrain/path/river/lake remain in the free WU pool.
 *
 * Re-captured 2026-07-16 (5c5f5568 -> 7ab005e8) after scene-first PR6
 * proof-bar verification against the integrated PR1–5 tip (path skeleton +
 * scene openings + structure demotion). Prior PR5 golden was captured under
 * a stale Vite root that lacked PathSkeleton; this is the intentional
 * product-tip hash for the campaign lock.
 *
 * Run: npx playwright test tests/world-gen/gen-determinism.spec.ts --reporter=line
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

// Fixed inputs — keep in sync with the in-page generator call below.
const FIXED_WORDLIST = ['alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta', 'iota kappa', 'lambda mu', 'nu xi', 'omicron pi'];
const BIOME_SEED = 42;
// Re-captured 2026-07-16 after scene-first PR6 campaign lock (integrated PR1–5 tip)
const GOLDEN_HASH = '7ab005e8';

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
