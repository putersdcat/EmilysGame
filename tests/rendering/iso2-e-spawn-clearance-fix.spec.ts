/**
 * iso2-e-spawn-clearance-fix.spec.ts — player-spawns-inside-wall bug fix.
 *
 * User-reported (2026-07-09, live playtest + screenshot): "the player or
 * rather the world gets spawned so the player is inside a wall or other
 * structure." Root cause: `stampStarterHomestead`'s hand-authored cell list
 * is SPARSE -- cells inside its 7x7 footprint that aren't explicitly listed
 * silently retain whatever an EARLIER phase (most notably Phase 3's
 * WU-template stamping, which runs before this assembly) happened to place
 * there. `PLAYER_CONFIG.startPosition` (12.5, 12.5) resolves to grid cell
 * (12,12) = offset (3,4) inside the layout, which is exactly one of those
 * unstamped gaps -- if the underlying template placed a blocking obstacle
 * there, the player spawns on top of / inside it. Intermittent, because it
 * depends on which WU template / RNG outcome landed at that cell.
 *
 * Fix: `ensureSpawnClearance` runs LAST in chunk (0,0)'s generation pipeline
 * (after every phase that could plausibly place blocking content) and
 * force-clears the exact spawn cell + its 4 cardinal neighbors (a plus
 * shape, NOT a 3x3 box, so it never touches the cottage at diagonal offset
 * (4,3) or the campfire at (2,5)).
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

// ─── 1. Hand-constructed proof: simulate the exact bug scenario ───────────

test('ensureSpawnClearance clears a blocker at the exact spawn cell without touching the cottage/campfire/dirt/coin', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampStarterHomestead, ensureSpawnClearance } = await import('/engine/iso2-assemblies.ts');

    const size = 25;
    const makeGrassCells = () =>
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ assetKey: 'grass', walkable: true, interactable: false })));

    // Simulate the bug: pre-fill the exact unstamped gap cells (offsets
    // (3,3)/(2,4)/(3,4)/(4,4) relative to ORIGIN {x:9,y:8} => absolute
    // (12,11)/(11,12)/(12,12)/(13,12)) with a blocking obstacle, as if an
    // earlier WU-template stamping pass had placed a fence there before
    // stampStarterHomestead runs.
    const cells = makeGrassCells();
    const gapAbsolute: Array<[number, number]> = [[12, 11], [11, 12], [12, 12], [13, 12]];
    for (const [x, y] of gapAbsolute) cells[y][x] = { assetKey: 'fence', walkable: false, interactable: false };

    stampStarterHomestead(cells);
    // Sanity: confirm the gap cells are STILL blocked after stampStarterHomestead
    // alone (proves the bug is real -- the hand-authored layout does NOT
    // cover these cells, so the pre-seeded fence survives untouched).
    const stillBlockedAfterStamp = gapAbsolute.every(([x, y]) => !cells[y][x].walkable);

    ensureSpawnClearance(cells);

    return {
      stillBlockedAfterStamp,
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

  expect(result.stillBlockedAfterStamp, 'sanity check: the gap cells must still be blocked by stampStarterHomestead alone, proving the bug is real').toBe(true);
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
