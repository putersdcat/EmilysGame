/**
 * iso2-e-castle-landmark.spec.ts — Slice E "Step 2": wire authored structures
 * into real procedural generation (2026-07-09).
 *
 * Background: `stampIso2Assembly` + the `ruined-cathedral` multi-cell layout
 * (3x5 ruin footprint) and the single-cell `castle_keep`/`cathedral_chapel`
 * nano "proof" assets (src/config/assets.config.ts) were ALL fully built and
 * already pixel-tested via the Slice A/A.5 systems showcase, but NONE of
 * them were ever placed anywhere in real generation -- `stampIso2Assembly`
 * was only ever invoked from `window.__gameDebug.stampIso2Assembly` (a
 * manual debug hook), never from `ChunkGenerator.ts`'s real pipeline.
 *
 * `maybePlaceCastleLandmark` (src/engine/iso2-assemblies.ts) closes that gap
 * for the 'castle' biome only. See that function's header comment for the
 * full reasoning on why meadow/forest/cave and `cathedral_chapel`
 * specifically were deliberately left out of this pass (see also
 * iso2-portback-plan.md's Slice E "Step 2" entry).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

// ─── 1. Pure-logic gating: biome / distance / chance-roll / cathedral-vs-keep ───

test('maybePlaceCastleLandmark: biome, distance, and chance gates behave exactly as designed', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ maybePlaceCastleLandmark }, { getBiome }] = await Promise.all([
      import('/engine/iso2-assemblies.ts'),
      import('/config/biomes.config.ts'),
    ]);

    const size = 25;
    const makeGrassCells = () =>
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ assetKey: 'grass', walkable: true, interactable: false })));

    const castle = getBiome(3);
    const meadow = getBiome(0);

    // Deterministic fake rng: returns the given values in order, then 0
    // forever (0 deterministically picks "the first candidate found" for
    // every internal Math.floor(rng() * candidates.length) call).
    const sequenceRng = (values: number[]) => {
      let i = 0;
      return () => (i < values.length ? values[i++] : 0);
    };
    const hasLandmark = (cells: any[][]) =>
      cells.some(row => row.some((c: any) => c.assetKey === 'castle_keep' || c.assetKey === 'cathedral_wall'));

    // (a) non-castle biome: never places anything, regardless of rng.
    const cellsA = makeGrassCells();
    maybePlaceCastleLandmark(cellsA, size, meadow, 10, sequenceRng([0, 0, 0, 0, 0]));

    // (b) castle biome but too close to spawn (chunkDist<=2): never places.
    const cellsB = makeGrassCells();
    maybePlaceCastleLandmark(cellsB, size, castle, 2, sequenceRng([0, 0, 0, 0, 0]));

    // (c) castle biome, far enough, but fails the chance roll (rng >= 0.125
    // on the first call): never places.
    const cellsC = makeGrassCells();
    maybePlaceCastleLandmark(cellsC, size, castle, 10, sequenceRng([0.5, 0, 0, 0, 0]));

    // (d) castle biome, far enough, passes the chance roll, rolls >= 0.4 on
    // the second call -> takes the single-cell KEEP branch.
    const cellsD = makeGrassCells();
    maybePlaceCastleLandmark(cellsD, size, castle, 10, sequenceRng([0.05, 0.9, 0, 0, 0]));
    const keepCount = cellsD.reduce((n, row) => n + row.filter((c: any) => c.assetKey === 'castle_keep').length, 0);

    // (e) castle biome, far enough, passes the chance roll, rolls < 0.4 on
    // the second call -> takes the ruined-cathedral branch (multi-cell).
    const cellsE = makeGrassCells();
    maybePlaceCastleLandmark(cellsE, size, castle, 10, sequenceRng([0.05, 0.1, 0, 0, 0]));
    const cathedralWallCount = cellsE.reduce((n, row) => n + row.filter((c: any) => c.assetKey === 'cathedral_wall').length, 0);
    const stoneFloorCount = cellsE.reduce((n, row) => n + row.filter((c: any) => c.assetKey === 'stone_floor').length, 0);

    return {
      placedA: hasLandmark(cellsA),
      placedB: hasLandmark(cellsB),
      placedC: hasLandmark(cellsC),
      keepCount,
      cathedralWallCount,
      stoneFloorCount,
    };
  });

  expect(result.placedA, 'non-castle biome must never place a landmark').toBe(false);
  expect(result.placedB, 'chunkDist<=2 (starter safe zone + ring) must never get a landmark').toBe(false);
  expect(result.placedC, 'failing the chance roll must never place a landmark').toBe(false);
  expect(result.keepCount, 'passing the chance roll + choosing keep must place exactly one castle_keep cell').toBe(1);
  expect(result.cathedralWallCount, "passing the chance roll + choosing cathedral must place the ruin's cathedral_wall cells").toBeGreaterThan(0);
  expect(result.stoneFloorCount, "the ruin's stone_floor interior must also be stamped").toBeGreaterThan(0);
});

// ─── 2. Real generated terrain: fires often enough, never for non-castle, playability holds ───

test('maybePlaceCastleLandmark on real generated terrain: fires reliably, never for non-castle biomes, and preserves playability', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [
      { generateChunkSync },
      { restoreEntropyBuffer },
      { maybePlaceCastleLandmark },
      { getBiome },
      { validatePlayability },
      { seededRandom },
    ] = await Promise.all([
      import('/engine/world/ChunkGenerator.ts'),
      import('/engine/world/Entropy.ts'),
      import('/engine/iso2-assemblies.ts'),
      import('/config/biomes.config.ts'),
      import('/engine/world/Validation.ts'),
      import('/engine/utils.ts'),
    ]);

    const castle = getBiome(3);
    const meadow = getBiome(0);
    const size = 25;
    const coords: Array<[number, number]> = [[8, 0], [0, 8], [8, 8], [-8, 3], [3, -8], [-8, -8]];

    let landmarkHits = 0;
    let playabilityChecks = 0;
    let playabilityFailures = 0;
    let nonCastlePlacements = 0;
    let seedCounter = 0;

    for (const [cx, cy] of coords) {
      const chunkDist = Math.abs(cx) + Math.abs(cy);
      for (let i = 0; i < 10; i++) {
        restoreEntropyBuffer(`castle-landmark-real-terrain-${cx}-${cy}-${i}-${Math.random()}`);
        const chunk = generateChunkSync(cx, cy);
        // Clone so the castle-forced and meadow-forced attempts run against
        // byte-identical starting terrain (the only variable is the biome
        // param passed to maybePlaceCastleLandmark).
        const cellsClone = chunk.cells.map(row => row.map(c => ({ ...c })));

        maybePlaceCastleLandmark(chunk.cells, size, castle, chunkDist, seededRandom(seedCounter++));
        const hasLandmark = chunk.cells.some(row => row.some(c => c.assetKey === 'castle_keep' || c.assetKey === 'cathedral_wall'));
        if (hasLandmark) {
          landmarkHits++;
          const report = validatePlayability(chunk.cells, size, cx, cy, seededRandom(seedCounter++));
          playabilityChecks++;
          if (!report.valid) playabilityFailures++;
        }

        maybePlaceCastleLandmark(cellsClone, size, meadow, chunkDist, seededRandom(seedCounter++));
        if (cellsClone.some(row => row.some(c => c.assetKey === 'castle_keep' || c.assetKey === 'cathedral_wall'))) nonCastlePlacements++;
      }
    }

    return { landmarkHits, playabilityChecks, playabilityFailures, nonCastlePlacements, totalTries: coords.length * 10 };
  });

  expect(result.landmarkHits, `expected at least one landmark across ${result.totalTries} tries on real generated terrain`).toBeGreaterThan(0);
  expect(result.playabilityChecks, 'at least one landmark placement should have triggered a playability check').toBeGreaterThan(0);
  expect(result.playabilityFailures, 'every real chunk that received a landmark must still validate as playable').toBe(0);
  expect(result.nonCastlePlacements, 'a non-castle biome must never place a landmark, even on identical real terrain').toBe(0);
});

// ─── 3. Full live-pipeline wiring proof: generateChunkSync itself, untouched ───

test('the real generateChunkSync pipeline is wired to place castle landmarks: fires for real castle-biome chunks, never for others', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ generateChunkSync }, { restoreEntropyBuffer }, { selectBiomeCoherent }] = await Promise.all([
      import('/engine/world/ChunkGenerator.ts'),
      import('/engine/world/Entropy.ts'),
      import('/engine/world/BiomeSelector.ts'),
    ]);

    // Phase A: cheap pre-scan with selectBiomeCoherent directly (a pure
    // noise lookup -- orders of magnitude cheaper than a full
    // generateChunkSync) to find REAL castle vs non-castle coordinates for
    // THIS session's actual biome noise field. Empirically, castle is MUCH
    // rarer than the "~25%" estimate in BiomeSelector.ts's own comment --
    // Perlin noise clusters near its midpoint rather than being uniform, so
    // the two extreme buckets (meadow <0.20, castle >=0.75) are rare in
    // practice (a real discrepancy worth flagging separately; out of scope
    // for this landmark-wiring slice, see iso2-portback-plan.md). A wide,
    // cheap scan is required to reliably find real castle coordinates at
    // all -- a small hand-picked coordinate list can easily find zero.
    const castleCoords: Array<[number, number]> = [];
    const nonCastleCoords: Array<[number, number]> = [];
    outer:
    for (let cx = -40; cx <= 40; cx += 2) {
      for (let cy = -40; cy <= 40; cy += 2) {
        if (Math.max(Math.abs(cx), Math.abs(cy)) < 7) continue;
        const biome = selectBiomeCoherent(cx, cy, 0.5);
        if (biome.name === 'castle' && castleCoords.length < 5) castleCoords.push([cx, cy]);
        else if (biome.name !== 'castle' && nonCastleCoords.length < 3) nonCastleCoords.push([cx, cy]);
        if (castleCoords.length >= 5 && nonCastleCoords.length >= 3) break outer;
      }
    }

    // Phase B: entropy-varied real generateChunkSync sweep on the confirmed
    // coordinates. Re-checks biomeName per iteration (entropyBias shifts the
    // selection threshold by up to +/-0.075 per seed, so a coordinate found
    // via Phase A's neutral-bias scan can still occasionally land as a
    // different biome for a specific entropy seed) and only counts
    // iterations that actually land as the expected biome for that sample.
    let castleTries = 0, castleHits = 0, nonCastleTries = 0, nonCastleHits = 0;
    for (const [cx, cy] of castleCoords) {
      for (let i = 0; i < 15; i++) {
        restoreEntropyBuffer(`castle-wiring-proof-${cx}-${cy}-${i}-${Math.random()}`);
        const chunk = generateChunkSync(cx, cy);
        if (chunk.biomeName !== 'castle') continue;
        castleTries++;
        if (chunk.cells.some(row => row.some(c => c.assetKey === 'castle_keep' || c.assetKey === 'cathedral_wall'))) castleHits++;
      }
    }
    for (const [cx, cy] of nonCastleCoords) {
      for (let i = 0; i < 10; i++) {
        restoreEntropyBuffer(`castle-wiring-proof-nc-${cx}-${cy}-${i}-${Math.random()}`);
        const chunk = generateChunkSync(cx, cy);
        nonCastleTries++;
        if (chunk.cells.some(row => row.some(c => c.assetKey === 'castle_keep' || c.assetKey === 'cathedral_wall'))) nonCastleHits++;
      }
    }

    return {
      castleCoordsFound: castleCoords.length, nonCastleCoordsFound: nonCastleCoords.length,
      castleTries, castleHits, nonCastleTries, nonCastleHits,
    };
  });

  expect(result.castleCoordsFound, "the pre-scan must find at least one real castle-biome coordinate for this session's noise field").toBeGreaterThan(0);
  expect(result.castleTries, 'the entropy-varied sweep must actually produce some real castle-biome samples to test against').toBeGreaterThan(0);
  expect(result.castleHits, `expected at least one real landmark across ${result.castleTries} real castle-biome generations (wiring proof)`).toBeGreaterThan(0);
  expect(result.nonCastleHits, `non-castle biome chunks must never produce a landmark via the real pipeline (${result.nonCastleTries} tries)`).toBe(0);
});
