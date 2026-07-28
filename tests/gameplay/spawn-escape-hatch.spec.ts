/**
 * spawn-escape-hatch.spec.ts — PR4 rewrite: constrained embed recovery.
 *
 * Resume inside a solid (starter_cottage) must land on a **legal** footprint
 * via the embed escalate ladder (R∈{2,4,8} → BFS → safe spawn). Never multi-
 * frame collision bypass / "walk through cottage until free."
 *
 * @see memories/repo/design-play-stack-first-principles-2026-07-19.md (PR4 L3)
 */
import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173/?test=1';

async function waitForGame(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });
}

test('resume inside cottage → ≤1 recovery call lands legal footprint (no noclip walk-out)', async ({ page }) => {
  await waitForGame(page);

  // Craft a fake save whose player position is INSIDE the starter
  // homestead's deterministic starter_cottage. ORIGIN {x:9,y:8} + relative
  // (4,3) = absolute (13,11) (SE of 2×2 cottage mass north of spawn). Yard
  // grass/dirt within R=2 remains legal recovery ground.
  await page.evaluate(() => {
    const save = {
      version: 1,
      timestamp: Date.now(),
      player: { x: 13.5, y: 11.5, direction: 1 },
      inventory: [],
      visitedChunks: [],
      resolvedCells: [],
      quizStats: { answered: 0, correct: 0 },
      wordlistSeed: 'spawn-escape-hatch-test-seed',
    };
    localStorage.setItem('emilys_game_save', JSON.stringify(save));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });

  const after = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    // state-init already ran resolveEmbedIfNeeded; re-call is idempotent when legal
    const embed = debug.resolveEmbedIfNeeded();
    return {
      x: s.player.x,
      y: s.player.y,
      spawnEscape: s.player.spawnEscape,
      sinkDepth: s.player.sinkDepth,
      walkable: debug.isFootprintWalkable(s.player.x, s.player.y),
      embed,
      // Must not remain inside cottage cell (13,11)
      cellX: Math.floor(s.player.x),
      cellY: Math.floor(s.player.y),
    };
  });

  expect(after.walkable, 'after recovery footprint must be legal').toBe(true);
  expect(after.spawnEscape, 'spawnEscape clears after legal ladder teleport').toBeFalsy();
  expect(after.sinkDepth === 0 || after.sinkDepth == null, 'sinkDepth returns to ground').toBe(true);
  expect(
    after.cellX !== 13 || after.cellY !== 11,
    'player must leave the cottage solid cell via legal teleport',
  ).toBe(true);
  // Courtyard / nearby open cells — within R=2 of (13,11)
  const dist = Math.max(Math.abs(after.cellX - 13), Math.abs(after.cellY - 11));
  expect(dist, 'R-ladder should place within Chebyshev R=2 of embed').toBeLessThanOrEqual(2);
});

test('a normal resumed save at an already-walkable position never engages the escape hatch', async ({ page }) => {
  await waitForGame(page);

  await page.evaluate(() => {
    const save = {
      version: 1,
      timestamp: Date.now(),
      // absolute (13,9) = yard grass north of cottage mass (rel 4,1) — walkable
      player: { x: 13.5, y: 9.5, direction: 1 },
      inventory: [],
      visitedChunks: [],
      resolvedCells: [],
      quizStats: { answered: 0, correct: 0 },
      wordlistSeed: 'spawn-escape-hatch-negative-test-seed',
    };
    localStorage.setItem('emilys_game_save', JSON.stringify(save));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as any).__gameDebug?.state, { timeout: 15000 });

  const state = await page.evaluate(() => {
    const debug = (window as any).__gameDebug;
    const s = debug.state;
    return {
      spawnEscape: s.player.spawnEscape,
      sinkDepth: s.player.sinkDepth,
      walkable: debug.isFootprintWalkable(s.player.x, s.player.y),
      x: s.player.x,
      y: s.player.y,
    };
  });

  expect(state.walkable, 'sanity: this resume position must be walkable').toBe(true);
  expect(state.spawnEscape, 'walkable resume must never engage visual escape').toBeFalsy();
  expect(state.sinkDepth === 0 || state.sinkDepth == null, 'sinkDepth normal ground').toBe(true);
  expect(state.x).toBeCloseTo(13.5, 1);
  expect(state.y).toBeCloseTo(9.5, 1);
});
