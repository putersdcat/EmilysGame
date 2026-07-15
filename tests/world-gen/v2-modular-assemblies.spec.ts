/**
 * v2-modular-assemblies.spec.ts — Iso 2.0 visual V2 proof (2026-07-15)
 *
 * Modular scene recipes must:
 *   1) stamp correct signature cells when forced
 *   2) respect biome + distance gates in maybePlaceModularScenes
 *   3) appear in real generateChunkSync for forced-high-chance samples
 *
 * See memories/repo/iso2-visual-technology-inventory-and-deferred-plan.md Track V2.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
}

test('V2 recipes stamp signature cells at origin', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampAssemblyOntoCells } = await import('/engine/iso2-assemblies.ts');
    const size = 25;
    const grass = () =>
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })));

    const count = (cells: any[][], key: string) =>
      cells.reduce((n, row) => n + row.filter((c) => c.assetKey === key).length, 0);

    const farm = grass();
    stampAssemblyOntoCells(farm, 'fenced-farm', 4, 4);

    const pond = grass();
    stampAssemblyOntoCells(pond, 'pond-clearing', 4, 4);

    const gate = grass();
    stampAssemblyOntoCells(gate, 'gatehouse', 4, 4);

    const bridge = grass();
    stampAssemblyOntoCells(bridge, 'bridge-crossing', 4, 4);

    const church = grass();
    stampAssemblyOntoCells(church, 'church-graveyard', 4, 4);

    return {
      farmFence: count(farm, 'fence'),
      farmHut: count(farm, 'hut'),
      farmWheat: count(farm, 'wheat'),
      farmAnimals: count(farm, 'chicken') + count(farm, 'cow') + count(farm, 'sheep') + count(farm, 'pig'),
      pondWater: count(pond, 'water'),
      pondSand: count(pond, 'sand'),
      gateDoor: count(gate, 'door_locked'),
      gateWall: count(gate, 'wall'),
      bridgeDeck: count(bridge, 'bridge'),
      bridgeWater: count(bridge, 'water'),
      churchSign: count(church, 'sign'),
      churchDoor: count(church, 'door_locked'),
      churchWall: count(church, 'wall'),
    };
  });

  expect(result.farmFence, 'farm has continuous fence run').toBeGreaterThanOrEqual(12);
  expect(result.farmHut).toBe(1);
  expect(result.farmWheat).toBeGreaterThanOrEqual(3);
  expect(result.farmAnimals).toBeGreaterThanOrEqual(3);

  expect(result.pondWater, 'pond has a coherent water body').toBeGreaterThanOrEqual(8);
  expect(result.pondSand, 'pond has sand shore ring').toBeGreaterThanOrEqual(8);

  expect(result.gateDoor).toBe(1);
  expect(result.gateWall).toBeGreaterThanOrEqual(4);

  expect(result.bridgeDeck).toBe(1);
  expect(result.bridgeWater).toBeGreaterThanOrEqual(2);

  expect(result.churchSign).toBe(1);
  expect(result.churchDoor).toBe(1);
  expect(result.churchWall).toBeGreaterThanOrEqual(8);
});

test('V2 maybePlaceModularScenes: distance + biome gates', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ maybePlaceModularScenes, modularSceneIdsForBiome }, { getBiome }] = await Promise.all([
      import('/engine/iso2-assemblies.ts'),
      import('/config/biomes.config.ts'),
    ]);

    const size = 25;
    const grass = () =>
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({
          assetKey: 'grass',
          walkable: true,
          interactable: false,
        })));

    // Always pass chance + always pick first recipe weight path with rng=0
    const zeroRng = () => 0;

    const meadowNear = grass();
    const near = maybePlaceModularScenes(meadowNear, size, getBiome(0), 1, zeroRng);

    const meadowFar = grass();
    const far = maybePlaceModularScenes(meadowFar, size, getBiome(0), 4, zeroRng);

    const cave = grass();
    const cavePlaced = maybePlaceModularScenes(cave, size, getBiome(2), 8, zeroRng);

    // Fail chance roll
    const skip = grass();
    const skipped = maybePlaceModularScenes(skip, size, getBiome(0), 4, () => 0.99);

    return {
      near,
      far,
      cavePlaced,
      skipped,
      meadowIds: modularSceneIdsForBiome('meadow'),
      forestIds: modularSceneIdsForBiome('forest'),
      castleIds: modularSceneIdsForBiome('castle'),
      caveIds: modularSceneIdsForBiome('cave'),
      // Signature after forced meadow place
      farHut: meadowFar.some((row) => row.some((c) => c.assetKey === 'hut')),
      farWater: meadowFar.some((row) => row.some((c) => c.assetKey === 'water')),
      farFence: meadowFar.some((row) => row.some((c) => c.assetKey === 'fence')),
    };
  });

  expect(result.near, 'safe ring must not get modular scenes').toBeNull();
  expect(result.skipped, 'high rng must skip chance roll').toBeNull();
  expect(result.cavePlaced, 'cave has no modular table').toBeNull();
  expect(result.caveIds).toEqual([]);

  expect(result.meadowIds).toContain('fenced-farm');
  expect(result.meadowIds).toContain('pond-clearing');
  expect(result.forestIds).toContain('pond-clearing');
  expect(result.castleIds).toContain('gatehouse');

  // zeroRng always picks first weight entry for meadow = fenced-farm
  expect(result.far).toBe('fenced-farm');
  expect(result.farHut).toBe(true);
  expect(result.farFence).toBe(true);
});

test('V2: fixed-seed non-origin meadow ring eventually stamps modular signatures', async ({ page }) => {
  await waitForGame(page);

  const FIXED_WORDLIST = [
    'alpha beta', 'gamma delta', 'epsilon zeta', 'eta theta',
    'iota kappa', 'lambda mu', 'nu xi', 'omicron pi',
  ];

  const report = await page.evaluate(
    ([wordlist]: [string[]]) => {
      // @ts-expect-error Vite dynamic import
      return import('/engine/gen.ts').then((gen: any) => {
        gen.setWordlist(wordlist);
        gen.setBiomeNoiseSeed(42);
        gen.restoreEntropyBuffer('');

        // Wider sample so chance×weight yields hits
        const coords: Array<[number, number]> = [];
        for (let cy = -3; cy <= 3; cy++) {
          for (let cx = -3; cx <= 3; cx++) {
            if (Math.abs(cx) + Math.abs(cy) <= 1) continue; // safe ring
            coords.push([cx, cy]);
          }
        }

        let farmHits = 0;
        let pondHits = 0;
        let bridgeHits = 0;
        let gateHits = 0;
        let churchHits = 0;
        const biomes = new Set<string>();

        for (const [cx, cy] of coords) {
          const c = gen.generateChunkSync(cx, cy);
          biomes.add(c.biomeName);
          let hut = 0, wheat = 0, water = 0, sand = 0, bridge = 0, door = 0, wall = 0, sign = 0, fence = 0;
          for (const row of c.cells) {
            for (const cell of row) {
              if (cell.assetKey === 'hut') hut++;
              if (cell.assetKey === 'wheat') wheat++;
              if (cell.assetKey === 'water') water++;
              if (cell.assetKey === 'sand') sand++;
              if (cell.assetKey === 'bridge') bridge++;
              if (cell.assetKey === 'door_locked') door++;
              if (cell.assetKey === 'wall') wall++;
              if (cell.assetKey === 'sign') sign++;
              if (cell.assetKey === 'fence') fence++;
            }
          }
          // Heuristic signatures (WU templates can also place water/fence)
          if (hut >= 1 && wheat >= 3 && fence >= 10) farmHits++;
          if (water >= 8 && sand >= 6) pondHits++;
          if (bridge >= 1) bridgeHits++;
          if (door >= 1 && wall >= 4 && sign >= 1) churchHits++;
          if (door >= 1 && wall >= 4 && sign === 0) gateHits++;
        }

        return {
          sampled: coords.length,
          biomes: [...biomes],
          farmHits,
          pondHits,
          bridgeHits,
          gateHits,
          churchHits,
          anyScene: farmHits + pondHits + bridgeHits + gateHits + churchHits,
        };
      });
    },
    [FIXED_WORDLIST] as [string[]],
  );

  console.log('V2 live gen modular hits:', JSON.stringify(report));
  // With ~40 chunks at 28% scene chance, expect several modular stamps.
  expect(report.sampled).toBeGreaterThan(20);
  expect(
    report.anyScene,
    'at least one modular-scene signature must appear in the sample ring',
  ).toBeGreaterThanOrEqual(1);
});
