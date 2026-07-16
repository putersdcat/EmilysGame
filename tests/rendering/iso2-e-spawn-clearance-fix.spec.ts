/**
 * iso2-e-spawn-clearance-fix.spec.ts — player-spawns-inside-wall bug fix.
 *
 * Historical root cause (2026-07-09): sparse homestead stamp left unstamped
 * gaps that retained earlier WU blockers. Homestead now stamps every cell of
 * its 7×7 footprint (yard + structures), so stamp alone overwrites residue.
 *
 * `ensureSpawnClearance` still runs LAST on chunk (0,0) as a safety net for
 * any later phase that re-blocks the spawn cell + 4 cardinal neighbors (plus
 * shape, NOT 3×3 — cottage (4,3) and campfire (2,5) stay intact).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

// ─── 1. Full 7×7 stamp fills former gaps; clearance still last-line safety ─

test('full homestead stamp fills yard cells; ensureSpawnClearance clears post-stamp re-block without touching cottage/campfire/dirt/coin', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampStarterHomestead, ensureSpawnClearance } = await import('/engine/iso2-assemblies.ts');

    const size = 25;
    const makeGrassCells = () =>
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ assetKey: 'grass', walkable: true, interactable: false })));

    // Pre-seed former gap cells with blockers (as if WU stamped fence first).
    // Offsets (3,3)/(2,4)/(3,4)/(4,4) → absolute (12,11)/(11,12)/(12,12)/(13,12).
    const cells = makeGrassCells();
    const formerGaps: Array<[number, number]> = [[12, 11], [11, 12], [12, 12], [13, 12]];
    for (const [x, y] of formerGaps) cells[y][x] = { assetKey: 'fence', walkable: false, interactable: false };

    stampStarterHomestead(cells);
    // Full 7×7 stamp must overwrite residue — yard walkable after stamp alone.
    const yardWalkableAfterStamp = formerGaps.every(([x, y]) => cells[y][x].walkable);

    // Simulate a later phase re-blocking the spawn plus-shape after stamp.
    for (const [x, y] of formerGaps) {
      cells[y][x] = { assetKey: 'fence', walkable: false, interactable: false };
    }
    // Re-assert intentional structure cells still present before clearance.
    // Cottage / campfire / coin cell sit outside the re-block set.
    ensureSpawnClearance(cells);

    return {
      yardWalkableAfterStamp,
      spawnWalkable: cells[12][12].walkable, // exact spawn cell
      northWalkable: cells[11][12].walkable,
      southWalkable: cells[13][12].walkable,
      eastWalkable: cells[12][13].walkable,
      westWalkable: cells[12][11].walkable,
      // Must NOT be clobbered: cottage (diagonal NE at absolute 13,11),
      // campfire (absolute 11,13), dirt path (absolute 12,13 / 13,13),
      // coin-marked grass (absolute 14,13).
      cottageStillPresent: cells[11][13].assetKey === 'starter_cottage' && cells[11][13].walkable === false,
      campfireStillPresent: cells[13][11].assetKey === 'campfire',
      dirtStillPresent: cells[13][12].assetKey === 'dirt' && cells[13][13].assetKey === 'dirt',
      coinCellStillPresent: cells[13][14].assetKey === 'grass' && cells[13][14].itemId === 'coin',
    };
  });

  expect(result.yardWalkableAfterStamp, 'full 7×7 stamp must overwrite former gap residue with walkable yard').toBe(true);
  expect(result.spawnWalkable, 'the exact spawn cell must be walkable after ensureSpawnClearance').toBe(true);
  expect(result.northWalkable, 'north cardinal neighbor must be walkable').toBe(true);
  expect(result.southWalkable, 'south cardinal neighbor (was already dirt) must remain walkable').toBe(true);
  expect(result.eastWalkable, 'east cardinal neighbor must be walkable').toBe(true);
  expect(result.westWalkable, 'west cardinal neighbor must be walkable').toBe(true);
  expect(result.cottageStillPresent, 'the starter cottage (diagonal neighbor) must NOT be clobbered').toBe(true);
  expect(result.campfireStillPresent, 'the campfire (diagonal neighbor) must NOT be clobbered').toBe(true);
  expect(result.dirtStillPresent, 'the existing dirt path must be untouched').toBe(true);
  expect(result.coinCellStillPresent, 'the coin-marked grass cell must be untouched').toBe(true);
});

// ─── 2. Real pipeline sweep: many varied real generations, always walkable ─

test('real chunk (0,0) generation always leaves the spawn point walkable across many varied entropy seeds', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const [{ generateChunkSync }, { restoreEntropyBuffer }] = await Promise.all([
      import('/engine/world/ChunkGenerator.ts'),
      import('/engine/world/Entropy.ts'),
    ]);

    const spawnX = 12, spawnY = 12; // floor(PLAYER_CONFIG.startPosition)
    const failures: Array<{ seed: string; assetKey: string }> = [];
    const N = 40; // varied entropy-buffer content per run to explore many WU-template outcomes
    for (let i = 0; i < N; i++) {
      // Vary the entropy buffer so generateChunkSync(0,0)'s internal seed
      // derivation (which salts with getEntropyBuffer()) produces a
      // DIFFERENT chunk each iteration, not the same deterministic result
      // N times over.
      restoreEntropyBuffer(`spawn-clearance-sweep-seed-${i}-${Math.random()}`);
      const chunk = generateChunkSync(0, 0);
      const cell = chunk.cells[spawnY][spawnX];
      if (!cell.walkable) failures.push({ seed: chunk.seed, assetKey: cell.assetKey });
    }
    return { failures, ranCount: N };
  });

  expect(result.failures, `spawn cell must be walkable in every one of ${result.ranCount} varied real generations; failures: ${JSON.stringify(result.failures)}`).toEqual([]);
});

// ─── 3. Live-engine startup proof ───────────────────────────────────────────

test('the actual running game has a walkable spawn point at startup', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    return {
      spawnWalkable: debug.isFootprintWalkable(12.5, 12.5) as boolean,
      playerX: debug.state.player.x,
      playerY: debug.state.player.y,
    };
  });

  expect(result.spawnWalkable, 'the real running game must have a walkable spawn point at startup').toBe(true);
});
