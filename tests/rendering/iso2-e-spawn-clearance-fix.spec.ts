/**
 * iso2-e-spawn-clearance-fix.spec.ts — player-spawns-inside-wall bug fix.
 *
 * Historical root cause (2026-07-09): sparse homestead stamp left unstamped
 * gaps that retained earlier WU blockers. Homestead now stamps every cell of
 * its 9×9 footprint (yard + structures), so stamp alone overwrites residue.
 *
 * Critical-path PR6 layout (design §6):
 *   - Cottage mass 2×2 north of spawn: abs (12–13,10–11) starter_* non-walkable
 *   - Spawn abs (12,12) walkable yard; cardinal north is cottage wall (I13)
 *   - ensureSpawnClearance must never grass-carve starter_* mass
 *
 * `ensureSpawnClearance` still runs LAST on chunk (0,0) as a safety net for
 * any later phase that re-blocks the spawn cell + walkable cardinal neighbors
 * (plus shape). North cottage mass and diagonal starter_cottage stay intact.
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

// ─── 1. Full 9×9 stamp + I13 starter_* protect on clearance ───────────────

test('full homestead stamp fills yard; ensureSpawnClearance clears soft re-blocks without destroying starter_* cottage mass', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampStarterHomestead, ensureSpawnClearance } = await import('/engine/iso2-assemblies.ts');

    const size = 25;
    const makeGrassCells = () =>
      Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ assetKey: 'grass', walkable: true, interactable: false })));

    // Pre-seed former gap cells with blockers (as if WU stamped fence first).
    // Soft/yard cells on the spawn plus-shape (not cottage mass):
    //   spawn (12,12), west (11,12), east (13,12), south (12,13).
    // North (12,11) is cottage mass after stamp — not a "yard gap".
    const cells = makeGrassCells();
    const softPlus: Array<[number, number]> = [[11, 12], [12, 12], [13, 12], [12, 13]];
    for (const [x, y] of softPlus) {
      cells[y][x] = { assetKey: 'fence', walkable: false, interactable: false };
    }
    // Also pre-seed north cell so stamp must overwrite WU residue with cottage
    cells[11][12] = { assetKey: 'fence', walkable: false, interactable: false };

    stampStarterHomestead(cells);

    // After stamp: soft plus cells are yard/dirt (walkable); north is cottage mass
    const softWalkableAfterStamp = softPlus.every(([x, y]) => cells[y][x].walkable);
    const northAfterStamp = {
      key: cells[11][12].assetKey,
      walkable: cells[11][12].walkable,
    };
    const spawnAfterStamp = {
      key: cells[12][12].assetKey,
      walkable: cells[12][12].walkable,
    };

    // Simulate a later phase re-blocking walkable plus arms only (spawn + E/W/S).
    // Leave north as stamped starter_wall_plaster so I13 protect is exercised.
    for (const [x, y] of softPlus) {
      cells[y][x] = { assetKey: 'fence', walkable: false, interactable: false };
    }
    ensureSpawnClearance(cells);

    // Dirt off the re-blocked south cell: diagonal (13,13) and deeper path (12,14)
    // stay dirt; south arm may be grass after clearance (soft block was fence).
    // Coin at rel (5,7) → abs (14,15).
    return {
      softWalkableAfterStamp,
      northAfterStamp,
      spawnAfterStamp,
      spawnWalkable: cells[12][12].walkable,
      northKey: cells[11][12].assetKey,
      northWalkable: cells[11][12].walkable,
      northIsStarter: cells[11][12].assetKey.startsWith('starter_'),
      southWalkable: cells[13][12].walkable,
      eastWalkable: cells[12][13].walkable,
      westWalkable: cells[12][11].walkable,
      // Cottage mass SE + N + full 2×2
      cottageStillPresent:
        cells[11][13].assetKey === 'starter_cottage' && cells[11][13].walkable === false,
      cottageMassNorth:
        cells[11][12].assetKey.startsWith('starter_') && cells[11][12].walkable === false,
      cottageMassFull: [
        cells[10][12].assetKey,
        cells[10][13].assetKey,
        cells[11][12].assetKey,
        cells[11][13].assetKey,
      ],
      campfireStillPresent: cells[13][11].assetKey === 'campfire',
      dirtPathIntact:
        cells[13][13].assetKey === 'dirt' && cells[14][12].assetKey === 'dirt',
      // rel (5,7) coin on grass → abs (14,15)
      coinCellStillPresent: cells[15][14].assetKey === 'grass' && cells[15][14].itemId === 'coin',
    };
  });

  expect(
    result.softWalkableAfterStamp,
    'full 9×9 stamp must overwrite soft plus-shape residue with walkable yard/dirt',
  ).toBe(true);
  expect(result.spawnAfterStamp.walkable, 'spawn (12,12) walkable after stamp alone').toBe(true);
  expect(result.spawnAfterStamp.key.startsWith('starter_'), 'spawn is not cottage mass').toBe(false);
  expect(result.northAfterStamp.walkable, 'cardinal north after stamp is cottage (non-walkable)').toBe(false);
  expect(result.northAfterStamp.key.startsWith('starter_'), 'north is starter_* mass').toBe(true);

  expect(result.spawnWalkable, 'exact spawn cell walkable after ensureSpawnClearance').toBe(true);
  expect(result.northIsStarter, 'north cottage mass preserved (I13)').toBe(true);
  expect(result.northWalkable, 'north stays non-walkable starter_* (not grass-carved)').toBe(false);
  expect(result.southWalkable, 'south soft re-block cleared / dirt restored walkable').toBe(true);
  expect(result.eastWalkable, 'east soft re-block cleared').toBe(true);
  expect(result.westWalkable, 'west soft re-block cleared').toBe(true);
  expect(result.cottageStillPresent, 'starter_cottage SE of mass must NOT be clobbered').toBe(true);
  expect(result.cottageMassNorth, 'cardinal-north starter_* must NOT be clobbered').toBe(true);
  expect(
    result.cottageMassFull.every((k) => k.startsWith('starter_')),
    'full 2×2 cottage mass abs (12–13,10–11) intact',
  ).toBe(true);
  expect(result.campfireStillPresent, 'campfire (off plus-shape) must NOT be clobbered').toBe(true);
  expect(result.dirtPathIntact, 'dirt path off plus-shape must be untouched').toBe(true);
  expect(result.coinCellStillPresent, 'coin-marked grass at abs (14,15) must be untouched').toBe(true);
});

// ─── 1b. Clearance must not destroy starter_* even if plus-shape north is solid ─

test('ensureSpawnClearance never grass-carves starter_* when north of spawn is cottage mass', async ({ page }) => {
  await waitForGame(page);

  const result = await page.evaluate(async () => {
    const { stampStarterHomestead, ensureSpawnClearance } = await import('/engine/iso2-assemblies.ts');

    const size = 25;
    const cells = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => ({ assetKey: 'grass', walkable: true, interactable: false })));

    stampStarterHomestead(cells);
    // Soft-block only walkable directions (and spawn); leave cottage north alone
    cells[12][12] = { assetKey: 'rock', walkable: false, interactable: false };
    cells[12][11] = { assetKey: 'rock', walkable: false, interactable: false };
    cells[12][13] = { assetKey: 'rock', walkable: false, interactable: false };
    cells[13][12] = { assetKey: 'rock', walkable: false, interactable: false };

    const beforeNorth = cells[11][12].assetKey;
    const beforeCottage = cells[11][13].assetKey;
    ensureSpawnClearance(cells);

    return {
      spawnWalkable: cells[12][12].walkable,
      westWalkable: cells[12][11].walkable,
      eastWalkable: cells[12][13].walkable,
      southWalkable: cells[13][12].walkable,
      northKey: cells[11][12].assetKey,
      northWalkable: cells[11][12].walkable,
      cottageKey: cells[11][13].assetKey,
      beforeNorth,
      beforeCottage,
    };
  });

  expect(result.spawnWalkable).toBe(true);
  expect(result.westWalkable).toBe(true);
  expect(result.eastWalkable).toBe(true);
  expect(result.southWalkable).toBe(true);
  expect(result.northKey, 'north key unchanged').toBe(result.beforeNorth);
  expect(result.northKey.startsWith('starter_')).toBe(true);
  expect(result.northWalkable).toBe(false);
  expect(result.cottageKey).toBe('starter_cottage');
  expect(result.cottageKey).toBe(result.beforeCottage);
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
