/**
 * merchant-biome-inventory.spec.ts — live-engine proof for
 * Docs/VisionAlignmentAudit.md Finding #1 (WorldEngine-05 §4.1: "the
 * merchant's inventory is determined by biome... forest merchant sells
 * mushrooms and potions; castle merchant sells keys and shields") and
 * Finding #8 (merchant spacing: "no more than one full macro tile between
 * merchants").
 *
 * Root cause (confirmed via source read, not guessed): the biome-flavor
 * NPCs (farmer/beekeeper/ranger/hermit/miner/ghost/knight) were ALREADY
 * correctly biome-varied via BIOME_NPC_POOL + NPC_ID_MAP. Only the
 * wandering `npc_merchant` itself always resolved to the single generic
 * `merchant_default` persona/trades regardless of which biome placed it.
 * Issue #112 was closed/completed explicitly claiming biome-weighted
 * merchant inventory was delivered — it was not (see
 * Docs/VisionAlignmentAudit.md §3 Finding #1, the strongest finding of
 * that audit pass).
 *
 * Fix: 4 new biome-specific merchant personas (merchant_meadow/_forest/
 * _cave/_castle, config/npc.config.ts) each with distinct trades matching
 * WorldEngine-05's own examples; Populator.ts's placeNpcAtCell now
 * resolves the wandering merchant's persona via
 * getMerchantPersonaIdForBiome(biome.name) instead of the flat
 * NPC_ID_MAP entry, and caps at most one wandering merchant per chunk
 * (macro tiles don't exist as a spatial unit yet, so "chunk" is the
 * nearest available approximation of WorldEngine-05's macro-tile spacing
 * rule — see the merchantTracker comment in Populator.ts).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('getMerchantPersonaIdForBiome maps all 4 known biomes to distinct personas, with a safe fallback', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const fn = (window as any).__gameDebug.getMerchantPersonaIdForBiome;
    return {
      meadow: fn('meadow'),
      forest: fn('forest'),
      cave: fn('cave'),
      castle: fn('castle'),
      unknownBiome: fn('nonexistent_biome'),
      undefinedBiome: fn(undefined),
    };
  });

  expect(result.meadow).toBe('merchant_meadow');
  expect(result.forest).toBe('merchant_forest');
  expect(result.cave).toBe('merchant_cave');
  expect(result.castle).toBe('merchant_castle');

  // All 4 must be distinct from each other -- genuine variation, not aliases
  // silently pointing at the same underlying persona.
  const ids = [result.meadow, result.forest, result.cave, result.castle];
  expect(new Set(ids).size).toBe(4);

  // Unknown/missing biome name falls back safely instead of throwing or
  // returning undefined (defensive: any future caller without biome context).
  expect(result.unknownBiome).toBe('merchant_default');
  expect(result.undefinedBiome).toBe('merchant_default');
});

test("wandering merchants placed during real generation get their chunk biome's persona, and at most one merchant spawns per chunk", async ({ page }) => {
  await waitForGame(page);

  // Explore in several directions to generate a reasonable spread of real
  // chunks (biome selection is spatially coherent/clustered, so a short
  // exploration may only surface 1-2 biomes -- the assertions below only
  // require the invariant to hold for whatever chunks/merchants actually
  // appear, not that all 4 biomes are observed in one run).
  for (const dir of ['d', 's', 'a', 'w', 'd', 'd', 's', 's', 'a', 'a']) {
    await page.keyboard.down(dir);
    await page.waitForTimeout(2000);
    await page.keyboard.up(dir);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const state = debug.state;
    const getMerchantPersonaIdForBiome = debug.getMerchantPersonaIdForBiome;

    let chunksChecked = 0;
    let merchantsFound = 0;
    let merchantsMatchingBiome = 0;
    let merchantsStillDefault = 0;
    const biomesSeenWithMerchants = new Set<string>();
    const perChunkViolations: string[] = [];

    for (const [key, chunk] of state.chunks) {
      chunksChecked++;
      let merchantCountThisChunk = 0;
      for (const row of chunk.cells) {
        for (const cell of row) {
          if (cell.assetKey === 'npc_merchant') {
            merchantCountThisChunk++;
            merchantsFound++;
            const expected = getMerchantPersonaIdForBiome(chunk.biomeName);
            if (cell.npcId === expected) merchantsMatchingBiome++;
            if (cell.npcId === 'merchant_default' && expected !== 'merchant_default') {
              merchantsStillDefault++;
            }
            biomesSeenWithMerchants.add(chunk.biomeName);
          }
        }
      }
      if (merchantCountThisChunk > 1) {
        perChunkViolations.push(`${key}: ${merchantCountThisChunk} merchants`);
      }
    }

    return {
      chunksChecked,
      merchantsFound,
      merchantsMatchingBiome,
      merchantsStillDefault,
      biomesSeenWithMerchants: Array.from(biomesSeenWithMerchants) as string[],
      perChunkViolations,
    };
  });

  console.log('[merchant-biome-inventory]', JSON.stringify(result));

  expect(result.chunksChecked).toBeGreaterThan(0);
  expect(result.perChunkViolations, `chunks with >1 wandering merchant (spacing rule violated): ${result.perChunkViolations.join(', ')}`).toEqual([]);

  // Only assert biome-matching if merchants actually spawned this run --
  // spawn is probabilistic (BIOME_NPC_POOL odds, guardianRatio, junction
  // gating), so a merchant isn't guaranteed on every exploration pass.
  if (result.merchantsFound > 0) {
    expect(result.merchantsStillDefault, 'no merchant should silently keep merchant_default when its biome has a dedicated persona').toBe(0);
    expect(result.merchantsMatchingBiome).toBe(result.merchantsFound);
  }
});
